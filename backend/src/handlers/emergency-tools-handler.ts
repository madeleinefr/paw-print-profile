/**
 * Emergency Tools Lambda Handler
 *
 * Handles HTTP requests for emergency tools:
 * - Missing pet reporting with 3-click flyer generation (Owner only)
 * - Pet recovery reporting (Owner only)
 * - Flyer download (Owner only)
 * - Care snapshot creation (Owner only)
 * - Care snapshot access (Public with access code)
 *
 * Uses AuthService for Cognito token extraction and AuthorizationService
 * for role-based access control. Falls back to header-based auth for
 * local development without Cognito.
 *
 * Requirements: [FR-08], [FR-09], [FR-10], [FR-13], [FR-15], [NFR-USA-01]
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CareSnapshotService } from '../services/care-snapshot-service'
import { EmergencyToolsService } from '../services/emergency-tools-service'
import { FlyerGenerationService } from '../services/flyer-generation-service'
import { PhotoGuidanceService } from '../services/photo-guidance-service'
import { AuthService, AuthUser } from '../services/auth-service'
import { AuthorizationService } from '../services/authorization-service'
import { extractUserFromIdToken } from '../services/token-utils'
import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { ImageRepository } from '../repositories/image-repository'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'
import { ErrorHandler } from '../errors/index'

import { NotificationService } from '../services/notification-service'

const careSnapshotService = new CareSnapshotService()
const emergencyToolsService = new EmergencyToolsService()
const flyerService = new FlyerGenerationService()
const photoGuidanceService = new PhotoGuidanceService()
const authService = new AuthService()
const authzService = new AuthorizationService()
const petRepo = new PetRepository()
const clinicRepo = new ClinicRepository()
const imageRepo = new ImageRepository()

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-user-type,x-user-id,x-clinic-id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

/**
 * Main Lambda handler for emergency tools endpoints.
 *
 * @param event - API Gateway proxy event with path, method, auth headers, and body
 * @returns API Gateway proxy result with CORS headers and JSON response body
 * @throws Errors are caught and converted via ErrorHandler.toResponse()
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Emergency Tools Handler - Event:', JSON.stringify(event, null, 2))

  try {
    const { httpMethod } = event
    const path = event.resource || event.path || ''

    if (httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: CORS_HEADERS, body: '' }
    }

    // Extract authenticated user (null for public endpoints like care snapshot access)
    const user = await extractUser(event)

    switch (httpMethod) {
      case 'POST':
        if (path.includes('/missing')) {
          return await handleReportMissing(event, user)
        } else if (path.includes('/care-snapshot')) {
          return await handleCreateCareSnapshot(event, user)
        } else if (path.includes('/contact')) {
          return await handleContactOwner(event) // Public — no auth required
        }
        return respond(404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } })

      case 'GET':
        if (path.includes('/care-snapshots/')) {
          return await handleAccessCareSnapshot(event) // Public — no auth required
        } else if (path.includes('/photo-guidance')) {
          return await handlePhotoGuidance(event, user)
        } else if (path.includes('/flyer')) {
          return await handleDownloadFlyer(event, user)
        }
        return respond(404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } })

      case 'PUT':
        if (path.includes('/found')) {
          return await handleMarkAsFound(event, user)
        }
        return respond(404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } })

      default:
        return respond(405, { error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${httpMethod} not allowed` } })
    }
  } catch (error) {
    return ErrorHandler.toResponse(error, CORS_HEADERS, { handler: 'EmergencyToolsHandler' })
  }
}

// ── Auth Extraction ──────────────────────────────────────────────────────────

async function extractUser(event: APIGatewayProxyEvent): Promise<AuthUser | null> {
  const authHeader = event.headers?.Authorization || event.headers?.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = await authService.getCurrentUser(token)
    if (user) return user
    const idUser = extractUserFromIdToken(token)
    if (idUser) return idUser
  }

  const userType = event.headers?.['x-user-type']
  const userId = event.headers?.['x-user-id']
  if (userType && userId) {
    return {
      userId,
      email: event.headers?.['x-user-email'] || '',
      userType: userType as 'vet' | 'owner',
      clinicId: event.headers?.['x-clinic-id'] || undefined,
    }
  }

  return null
}

// ── Response Helpers ─────────────────────────────────────────────────────────

function respond(statusCode: number, body: any): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) }
}

function forbidden(reason: string): APIGatewayProxyResult {
  return respond(403, { error: { code: 'FORBIDDEN', message: reason } })
}

function unauthorized(): APIGatewayProxyResult {
  return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
}

function badRequest(code: string, message: string): APIGatewayProxyResult {
  return respond(400, { error: { code, message } })
}

// ── Route Handlers ───────────────────────────────────────────────────────────

/**
 * POST /pets/{petId}/missing — Report pet as missing (Owner only)
 * 3-click workflow: single call marks missing + generates flyer + notifies clinics
 * Requirements: [FR-08], [FR-09], [NFR-USA-01]
 */
async function handleReportMissing(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canReportMissing(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const missingData = JSON.parse(event.body)

  const result = await emergencyToolsService.reportMissing(petId, user.userId, {
    searchRadiusKm: missingData.searchRadiusKm || 50,
    lastSeenLocation: missingData.lastSeenLocation || '',
    additionalNotes: missingData.additionalNotes,
    contactMethod: missingData.contactMethod || 'clinic',
  })

  return respond(200, result)
}

/**
 * PUT /pets/{petId}/found — Mark pet as found (Owner only)
 * Requirements: [FR-10]
 */
async function handleMarkAsFound(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')

  // Verify ownership — reuse canAccessPet since canReportMissing checks isMissing=false
  const pet = await petRepo.findById(petId)
  if (!pet) return respond(404, { error: { code: 'NOT_FOUND', message: 'Pet not found' } })
  if (user.userType !== 'owner') return forbidden('Only pet owners can mark pets as found')
  if (pet.ownerId !== user.userId) return forbidden('You can only mark your own pets as found')
  if (!pet.isMissing) return badRequest('NOT_MISSING', 'Pet is not currently reported as missing')

  const result = await emergencyToolsService.markAsFound(petId, user.userId)

  return respond(200, {
    petId,
    isMissing: false,
    notifiedClinics: result.notifiedClinics,
  })
}

/**
 * GET /pets/{petId}/flyer — Download missing pet flyer (Owner only)
 * Requirements: [FR-09], [FR-15]
 */
async function handleDownloadFlyer(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')

  const pet = await petRepo.findById(petId)
  if (!pet) return respond(404, { error: { code: 'NOT_FOUND', message: 'Pet not found' } })
  if (user.userType !== 'owner') return forbidden('Only pet owners can download flyers')
  if (pet.ownerId !== user.userId) return forbidden('You can only download flyers for your own pets')
  if (!pet.isMissing) return badRequest('NOT_MISSING', 'Pet is not currently reported as missing')

  const clinic = await clinicRepo.findById(pet.clinicId)
  const images = await imageRepo.findByPet(petId)

  // Generate flyer with clinic as default contact (privacy-safe) [FR-15]
  const result = await flyerService.generateFlyer(pet, clinic, images, {
    lastSeenLocation: 'See original report for details',
    contactMethod: 'clinic',
  })

  return respond(200, {
    petId,
    flyerUrl: result.flyerUrl,
    generatedAt: result.generatedAt,
  })
}

/**
 * POST /pets/{petId}/care-snapshot — Create care snapshot (Owner only)
 * Requirements: [FR-13]
 */
async function handleCreateCareSnapshot(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canCreateCareSnapshot(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const snapshotData = JSON.parse(event.body)
  snapshotData.petId = petId

  const snapshot = await careSnapshotService.generateCareSnapshot(snapshotData, user.userId)
  return respond(201, snapshot)
}

/**
 * GET /care-snapshots/{accessCode} — Access care snapshot (Public with access code)
 * No authentication required — access controlled by time-limited code.
 * Requirements: [FR-13], [NFR-SEC-03]
 */
async function handleAccessCareSnapshot(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const accessCode = event.pathParameters?.accessCode
  if (!accessCode) return badRequest('MISSING_ACCESS_CODE', 'Access code is required')

  const snapshot = await careSnapshotService.accessCareSnapshot(accessCode)

  if (!snapshot) {
    return respond(404, { error: { code: 'SNAPSHOT_NOT_FOUND', message: 'Care snapshot not found or expired' } })
  }

  return respond(200, {
    petName: snapshot.petName,
    careInstructions: snapshot.careInstructions,
    feedingSchedule: snapshot.feedingSchedule,
    medications: snapshot.medications,
    emergencyContacts: snapshot.emergencyContacts,
    expiryDate: snapshot.expiryDate,
  })
}

/**
 * GET /pets/{petId}/photo-guidance — Get photography tips and quality feedback (Owner)
 * Returns guidelines for taking quality pet photos for identification.
 * Optionally accepts query params for image quality feedback.
 * Requirements: [FR-16]
 */
async function handlePhotoGuidance(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()
  if (user.userType !== 'owner') return forbidden('Only pet owners can access photo guidance')

  const guidelines = photoGuidanceService.getPhotoGuidelines()

  // Optional: if query params provided, also return quality feedback for an image
  const { mimeType, fileSize, width, height } = event.queryStringParameters || {}
  let qualityFeedback
  if (mimeType && fileSize) {
    qualityFeedback = photoGuidanceService.getImageQualityFeedback(
      mimeType,
      parseInt(fileSize),
      width ? parseInt(width) : undefined,
      height ? parseInt(height) : undefined
    )
  }

  return respond(200, { guidelines, qualityFeedback })
}

// ── Error Handler ────────────────────────────────────────────────────────────
// Centralized via ErrorHandler.toResponse() in the catch block above.

/**
 * POST /pets/{petId}/contact — Send anonymous message to pet owner (Public)
 * Accepts senderName, senderEmail, message, and optional imageBase64/mimeType.
 * If an image is provided, uploads to S3 under contact-images/{petId}/{timestamp}.{ext},
 * generates a 7-day pre-signed URL, and includes it in the notification.
 * Requirements: [FR-12], [FR-15]
 */
async function handleContactOwner(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('INVALID_INPUT', 'petId is required')

  const body = event.body ? JSON.parse(event.body) : {}
  const { senderName, senderEmail, message, imageBase64, mimeType } = body

  if (!senderName || !senderEmail || !message) {
    return badRequest('INVALID_INPUT', 'senderName, senderEmail, and message are required')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(senderEmail)) {
    return badRequest('INVALID_INPUT', 'Invalid email format')
  }

  if (message.length > 1000) {
    return badRequest('INVALID_INPUT', 'Message must be 1000 characters or less')
  }

  // Validate image attachment if provided
  let imageUrl: string | undefined
  if (imageBase64) {
    if (!mimeType) {
      return badRequest('INVALID_INPUT', 'mimeType is required when imageBase64 is provided')
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png']
    if (!allowedMimeTypes.includes(mimeType)) {
      return badRequest('INVALID_INPUT', 'Image must be JPEG or PNG format')
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64')
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (imageBuffer.length > maxSize) {
      return badRequest('INVALID_INPUT', 'Image must be 10MB or less')
    }

    // Upload image to S3 under contact-images/{petId}/{timestamp}.{ext}
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    const timestamp = Date.now()
    const s3Key = `contact-images/${petId}/${timestamp}.${ext}`
    const bucketName = process.env.S3_BUCKET ?? process.env.PET_IMAGES_BUCKET ?? 'paw-print-profile-images'

    const factory = new AWSClientFactory()
    const s3Client = factory.createS3Client()

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: mimeType,
        Metadata: {
          petId,
          senderEmail,
          purpose: 'contact-attachment',
        },
      })
    )

    // Generate pre-signed GET URL valid for 7 days
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    })
    const sevenDaysInSeconds = 7 * 24 * 60 * 60
    imageUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: sevenDaysInSeconds })

    // Replace Docker-internal hostnames with localhost for local dev
    const localstackHost = process.env.LOCALSTACK_HOSTNAME
    if (localstackHost && localstackHost !== 'localhost') {
      imageUrl = imageUrl.replace(`http://${localstackHost}:`, 'http://localhost:')
    }
  }

  const pet = await petRepo.findById(petId)
  if (!pet) return respond(404, { error: { code: 'NOT_FOUND', message: 'Pet not found' } })
  if (!pet.ownerEmail) return badRequest('NO_OWNER', 'This pet does not have an owner to contact')

  const notificationService = new NotificationService()

  if (process.env.IS_LOCAL === 'true') {
    console.log('📧 Platform message (local dev):')
    console.log(`  To: ${pet.ownerEmail}`)
    console.log(`  From: ${senderName} <${senderEmail}>`)
    console.log(`  Pet: ${pet.name}`)
    console.log(`  Message: ${message}`)
    if (imageUrl) {
      console.log(`  📷 Image: ${imageUrl}`)
    }
  }

  await notificationService.sendContactMessage({
    petName: pet.name,
    ownerEmail: pet.ownerEmail,
    senderName,
    senderEmail,
    message,
    imageUrl,
  })

  return respond(200, { success: true, message: 'Message sent to pet owner' })
}
