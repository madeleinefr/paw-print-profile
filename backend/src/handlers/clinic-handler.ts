/**
 * Clinic Management Lambda Handler
 * 
 * Handles HTTP requests for clinic CRUD operations, pet listings,
 * and custom field configuration.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ClinicService } from '../services/clinic-service'
import { ProfileClaimingService } from '../services/profile-claiming-service'
import { AuthService, AuthUser } from '../services/auth-service'
import { AuthorizationService } from '../services/authorization-service'
import { ValidationException } from '../validation/validators'

const clinicService = new ClinicService()
const claimingService = new ProfileClaimingService()
const authService = new AuthService()
const authzService = new AuthorizationService()

/**
 * Main Lambda handler for clinic management endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Clinic Handler - Event:', JSON.stringify(event, null, 2))

  try {
    const { httpMethod, pathParameters, body, queryStringParameters } = event
    const path = event.resource || event.path || ''

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    }

    // Handle preflight requests
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: '',
      }
    }

    // Route to appropriate handler
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/custom-fields')) {
          return await handleUpdateCustomFields(event, corsHeaders)
        } else {
          return await handleCreateClinic(event, corsHeaders)
        }

      case 'GET':
        if (path.includes('/pending-claims')) {
          return await handleGetPendingClaims(event, corsHeaders)
        } else if (path.includes('/pets')) {
          return await handleGetClinicPets(event, corsHeaders)
        } else if (path.includes('/statistics')) {
          return await handleGetClinicStatistics(event, corsHeaders)
        } else if (pathParameters?.clinicId) {
          return await handleGetClinic(event, corsHeaders)
        } else {
          return await handleListClinics(event, corsHeaders)
        }

      case 'PUT':
        return await handleUpdateClinic(event, corsHeaders)

      case 'DELETE':
        return await handleDeleteClinic(event, corsHeaders)

      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              code: 'METHOD_NOT_ALLOWED',
              message: `Method ${httpMethod} not allowed`,
            },
          }),
        }
    }
  } catch (error) {
    console.error('Clinic Handler - Error:', error)
    return handleError(error)
  }
}

/**
 * Create a new clinic (Vet only)
 */
async function handleCreateClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const user = await extractClinicUser(event)
  if (!user) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }) }
  if (user.userType !== 'vet') return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Only veterinarians can create clinics' } }) }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_BODY',
          message: 'Request body is required',
        },
      }),
    }
  }

  const clinicData = JSON.parse(event.body)
  const clinic = await clinicService.create(clinicData)

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(clinic),
  }
}

/**
 * Get a clinic by ID (Vet from same clinic)
 */
async function handleGetClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }) }
  }

  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return { statusCode: user ? 403 : 401, headers: corsHeaders, body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }) }
  }

  const clinic = await clinicService.findById(clinicId)
  if (!clinic) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: { code: 'CLINIC_NOT_FOUND', message: 'Clinic not found' } }) }
  }

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(clinic) }
}

/**
 * Update a clinic (Vet from same clinic)
 */
async function handleUpdateClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }) }
  }

  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return { statusCode: user ? 403 : 401, headers: corsHeaders, body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }) }
  }

  if (!event.body) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_BODY', message: 'Request body is required' } }) }
  }

  const updates = JSON.parse(event.body)
  const clinic = await clinicService.update(clinicId, updates)

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(clinic) }
}

/**
 * Delete a clinic (Vet from same clinic)
 */
async function handleDeleteClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }) }
  }

  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return { statusCode: user ? 403 : 401, headers: corsHeaders, body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }) }
  }

  await clinicService.delete(clinicId)
  return { statusCode: 204, headers: corsHeaders, body: '' }
}

/**
 * List clinics (with optional filtering)
 */
async function handleListClinics(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { licenseNumber, latitude, longitude, radius } = event.queryStringParameters || {}

  // Search by license number
  if (licenseNumber) {
    const clinic = await clinicService.findByLicenseNumber(licenseNumber)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items: clinic ? [clinic] : [] }),
    }
  }

  // Search by location
  if (latitude && longitude && radius) {
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const radiusKm = parseFloat(radius)

    if (isNaN(lat) || isNaN(lng) || isNaN(radiusKm)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: {
            code: 'INVALID_COORDINATES',
            message: 'Latitude, longitude, and radius must be valid numbers',
          },
        }),
      }
    }

    const clinics = await clinicService.findNearby(lat, lng, radiusKm)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items: clinics }),
    }
  }

  // Get all clinics
  const clinics = await clinicService.getAll()
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ items: clinics }),
  }
}

/**
 * Get pending (unclaimed) pet profiles for a clinic (Vet only)
 * GET /clinics/{clinicId}/pending-claims
 * Requirements: [FR-04]
 */
async function handleGetPendingClaims(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }),
    }
  }

  // Extract user and check authorization
  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return {
      statusCode: user ? 403 : 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }),
    }
  }

  const pendingClaims = await claimingService.findPendingClaims(clinicId)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ items: pendingClaims, count: pendingClaims.length }),
  }
}

/**
 * Extract user from Cognito token or fallback headers (same pattern as co-onboarding handler)
 */
async function extractClinicUser(event: APIGatewayProxyEvent): Promise<AuthUser | null> {
  const authHeader = event.headers?.Authorization || event.headers?.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = await authService.getCurrentUser(token)
    if (user) return user
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

/**
 * Get pets for a clinic (Vet from same clinic)
 */
async function handleGetClinicPets(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }) }
  }

  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return { statusCode: user ? 403 : 401, headers: corsHeaders, body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }) }
  }

  const { page = '1', limit = '50' } = event.queryStringParameters || {}
  const pagination = { page: parseInt(page), limit: parseInt(limit) }
  const result = await clinicService.getPets(clinicId, pagination)

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) }
}

/**
 * Get clinic statistics (Vet from same clinic)
 */
async function handleGetClinicStatistics(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }) }
  }

  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return { statusCode: user ? 403 : 401, headers: corsHeaders, body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }) }
  }

  const statistics = await clinicService.getStatistics(clinicId)
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(statistics) }
}

/**
 * Update clinic custom fields (Vet from same clinic)
 */
async function handleUpdateCustomFields(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_CLINIC_ID', message: 'Clinic ID is required' } }) }
  }

  const user = await extractClinicUser(event)
  const authz = authzService.canAccessClinic(user, clinicId)
  if (!authz.allowed) {
    return { statusCode: user ? 403 : 401, headers: corsHeaders, body: JSON.stringify({ error: { code: user ? 'FORBIDDEN' : 'UNAUTHORIZED', message: authz.reason || 'Access denied' } }) }
  }

  if (!event.body) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { code: 'MISSING_BODY', message: 'Request body is required' } }) }
  }

  const { customFields } = JSON.parse(event.body)
  const clinic = await clinicService.updateCustomFields(clinicId, customFields)

  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(clinic) }
}

/**
 * Handle errors and return appropriate HTTP responses
 */
function handleError(error: any): APIGatewayProxyResult {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  }

  console.error('Error details:', error)

  if (error instanceof ValidationException) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.validationErrors,
        },
      }),
    }
  }

  if (error.name === 'ResourceNotFoundException') {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      }),
    }
  }

  // Default to 500 for unexpected errors
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    }),
  }
}