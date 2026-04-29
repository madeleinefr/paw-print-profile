/**
 * Pet Co-Onboarding Lambda Handler
 *
 * Handles HTTP requests for the B2B2C co-onboarding workflow:
 * - Medical profile creation (veterinarians)
 * - Profile claiming (pet owners)
 * - Profile enrichment (pet owners)
 * - Medical record management (veterinarians)
 *
 * Uses AuthService for Cognito token extraction and AuthorizationService
 * for role-based access control. Falls back to header-based auth for
 * local development without Cognito.
 *
 * Requirements: [FR-03], [FR-04], [FR-05], [FR-06], [FR-07], [NFR-SEC-02]
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { PetCoOnboardingService } from '../services/pet-co-onboarding-service'
import { ProfileClaimingService } from '../services/profile-claiming-service'
import { AuthService, AuthUser } from '../services/auth-service'
import { AuthorizationService } from '../services/authorization-service'
import { PetRepository } from '../repositories/pet-repository'
import { ValidationException } from '../validation/validators'

const coOnboardingService = new PetCoOnboardingService()
const claimingService = new ProfileClaimingService()
const authService = new AuthService()
const authzService = new AuthorizationService()
const petRepo = new PetRepository()

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-user-type,x-user-id,x-clinic-id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

/**
 * Main Lambda handler for pet co-onboarding endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Pet Co-Onboarding Handler - Event:', JSON.stringify(event, null, 2))

  try {
    const { httpMethod } = event
    const path = event.resource || event.path || ''

    if (httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: CORS_HEADERS, body: '' }
    }

    // Extract authenticated user from Cognito token or fallback headers
    const user = await extractUser(event)

    // Route to appropriate handler
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/claiming-codes/validate')) {
          return await handleValidateClaimingCode(event, user)
        } else if (path.includes('/profiles/') && path.includes('/transfer')) {
          return await handleTransferOwnership(event, user)
        } else if (path.includes('/claim')) {
          return await handleClaimProfile(event, user)
        } else if (path.includes('/vaccines')) {
          return await handleAddVaccine(event, user)
        } else if (path.includes('/surgeries')) {
          return await handleAddSurgery(event, user)
        } else if (path.includes('/images')) {
          return await handleUploadImage(event, user)
        } else {
          return await handleCreateMedicalProfile(event, user)
        }

      case 'GET':
        if (event.pathParameters?.petId) {
          return await handleGetPet(event, user)
        } else if (path.includes('/pending-claims')) {
          return await handleGetPendingClaims(event, user)
        } else {
          return await handleListPets(event, user)
        }

      case 'PUT':
        if (path.includes('/enrich')) {
          return await handleEnrichProfile(event, user)
        } else {
          return await handleUpdatePet(event, user)
        }

      case 'DELETE':
        return await handleDeletePet(event, user)

      default:
        return respond(405, { error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${httpMethod} not allowed` } })
    }
  } catch (error) {
    console.error('Pet Co-Onboarding Handler - Error:', error)
    return handleError(error)
  }
}

// ── Auth Extraction ──────────────────────────────────────────────────────────

/**
 * Extract authenticated user from the request.
 *
 * Priority:
 * 1. Cognito JWT from Authorization header (production)
 * 2. Header-based fallback (local development)
 *
 * Per AWS docs, the JWT comes as "Bearer {token}" in the Authorization header
 * when using API Gateway with a Cognito authorizer.
 */
async function extractUser(event: APIGatewayProxyEvent): Promise<AuthUser | null> {
  // Try Cognito JWT first
  const authHeader = event.headers?.Authorization || event.headers?.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = await authService.getCurrentUser(token)
    if (user) return user
  }

  // Fallback to header-based auth for local development
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
 * POST /pets — Create a medical pet profile (Vet only)
 */
async function handleCreateMedicalProfile(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  const authz = authzService.canCreatePet(user)
  if (!authz.allowed) return user ? forbidden(authz.reason!) : unauthorized()

  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const profileData = JSON.parse(event.body)
  profileData.clinicId = user!.clinicId
  profileData.verifyingVetId = user!.userId

  const profile = await coOnboardingService.createMedicalProfile(profileData)
  return respond(201, profile)
}

/**
 * POST /pets/claim — Claim a pet profile (Owner only)
 */
async function handleClaimProfile(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()
  if (user.userType !== 'owner') return forbidden('Only pet owners can claim profiles')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const claimData = JSON.parse(event.body)

  // Validate claiming code before full authorization check
  const pet = claimData.claimingCode
    ? await petRepo.findByClaimingCode(claimData.claimingCode)
    : null

  const authz = authzService.canClaimPet(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const result = await coOnboardingService.claimProfile(claimData, user.userId)
  return respond(200, result)
}

/**
 * PUT /pets/{petId}/enrich — Enrich a claimed profile (Owner only)
 */
async function handleEnrichProfile(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canEnrichProfile(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const enrichmentData = JSON.parse(event.body)
  const result = await coOnboardingService.enrichProfile(petId, user.userId, enrichmentData)
  return respond(200, result)
}

/**
 * GET /pets/{petId} — Get pet details (Vet or Owner)
 */
async function handleGetPet(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canAccessPet(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const petRecord = await coOnboardingService.findById(
    petId, user.userType as 'vet' | 'owner', user.userId, user.clinicId
  )

  if (!petRecord) return respond(404, { error: { code: 'PET_NOT_FOUND', message: 'Pet not found' } })
  return respond(200, petRecord)
}

/**
 * GET /pets/pending-claims — List unclaimed profiles (Vet only)
 */
async function handleGetPendingClaims(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const authz = authzService.canAccessClinic(user, user.clinicId || '')
  if (!authz.allowed) return forbidden(authz.reason!)

  const pendingClaims = await coOnboardingService.getPendingClaims(user.clinicId!)
  return respond(200, { items: pendingClaims })
}

/**
 * GET /pets — List pets based on user role
 */
async function handleListPets(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  if (user.userType === 'vet' && user.clinicId) {
    const pendingClaims = await coOnboardingService.getPendingClaims(user.clinicId)
    return respond(200, { items: pendingClaims })
  } else if (user.userType === 'owner') {
    const pets = await coOnboardingService.getByOwner(user.userId)
    return respond(200, { items: pets })
  }

  return forbidden('Access denied')
}

/**
 * POST /pets/{petId}/vaccines — Add vaccine record (Vet only)
 */
async function handleAddVaccine(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canModifyMedicalData(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const vaccineData = JSON.parse(event.body)
  const vaccine = await coOnboardingService.addVaccine(petId, vaccineData, user.userId, user.clinicId!)
  return respond(201, vaccine)
}

/**
 * POST /pets/{petId}/surgeries — Add surgery record (Vet only)
 */
async function handleAddSurgery(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canModifyMedicalData(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const surgeryData = JSON.parse(event.body)
  const surgery = await coOnboardingService.addSurgery(petId, surgeryData, user.userId, user.clinicId!)
  return respond(201, surgery)
}

/**
 * POST /pets/{petId}/images — Upload pet image (Vet or Owner)
 */
async function handleUploadImage(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canAccessPet(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  const image = await coOnboardingService.uploadImage(petId, user.userId, user.userType as 'vet' | 'owner', event.body)
  return respond(201, image)
}

/**
 * PUT /pets/{petId} — Update pet (Vet medical data or Owner enrichment)
 */
async function handleUpdatePet(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const pet = await petRepo.findById(petId)
  const updates = JSON.parse(event.body)

  if (user.userType === 'vet') {
    const authz = authzService.canModifyMedicalData(user, pet)
    if (!authz.allowed) return forbidden(authz.reason!)
    const result = await coOnboardingService.updateMedicalData(petId, user.clinicId!, updates)
    return respond(200, result)
  } else {
    const authz = authzService.canEnrichProfile(user, pet)
    if (!authz.allowed) return forbidden(authz.reason!)
    const result = await coOnboardingService.enrichProfile(petId, user.userId, updates)
    return respond(200, result)
  }
}

/**
 * DELETE /pets/{petId} — Delete pet profile (Vet only)
 */
async function handleDeletePet(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()

  const petId = event.pathParameters?.petId
  if (!petId) return badRequest('MISSING_PET_ID', 'Pet ID is required')

  const pet = await petRepo.findById(petId)
  const authz = authzService.canDeletePet(user, pet)
  if (!authz.allowed) return forbidden(authz.reason!)

  await coOnboardingService.deletePet(petId, user.clinicId!)
  return { statusCode: 204, headers: CORS_HEADERS, body: '' }
}

// ── Profile Claiming Handlers ────────────────────────────────────

/**
 * POST /claiming-codes/validate — Validate a claiming code without claiming
 * Returns whether the code is valid and the pet info if so.
 */
async function handleValidateClaimingCode(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()
  if (user.userType !== 'owner') return forbidden('Only pet owners can validate claiming codes')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const { claimingCode } = JSON.parse(event.body)
  if (!claimingCode) return badRequest('MISSING_CODE', 'Claiming code is required')

  const result = await claimingService.validateOwnerEligibility(claimingCode)

  if (!result.eligible) {
    return respond(200, { valid: false, error: result.reason })
  }

  return respond(200, {
    valid: true,
    pet: {
      petId: result.pet!.petId,
      name: result.pet!.name,
      species: result.pet!.species,
      breed: result.pet!.breed,
      age: result.pet!.age,
      clinicId: result.pet!.clinicId,
    },
  })
}

/**
 * POST /profiles/{petId}/transfer — Transfer ownership of a pet profile
 * Explicit ownership transfer endpoint for the claiming workflow.
 */
async function handleTransferOwnership(
  event: APIGatewayProxyEvent,
  user: AuthUser | null
): Promise<APIGatewayProxyResult> {
  if (!user) return unauthorized()
  if (user.userType !== 'owner') return forbidden('Only pet owners can transfer ownership')
  if (!event.body) return badRequest('MISSING_BODY', 'Request body is required')

  const claimData = JSON.parse(event.body)
  if (!claimData.claimingCode) return badRequest('MISSING_CODE', 'Claiming code is required')

  const result = await claimingService.transferOwnership(claimData, user.userId)
  return respond(200, result)
}

// ── Error Handler ────────────────────────────────────────────────────────────

function handleError(error: any): APIGatewayProxyResult {
  console.error('Error details:', error)

  if (error instanceof ValidationException) {
    return respond(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.validationErrors },
    })
  }

  if (error.name === 'ResourceNotFoundException') {
    return respond(404, { error: { code: 'NOT_FOUND', message: 'Resource not found' } })
  }

  return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
}
