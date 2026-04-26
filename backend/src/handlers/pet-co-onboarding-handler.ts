/**
 * Pet Co-Onboarding Lambda Handler
 * 
 * Handles HTTP requests for the B2B2C co-onboarding workflow:
 * - Medical profile creation (veterinarians)
 * - Profile claiming (pet owners)
 * - Profile enrichment (pet owners)
 * - Medical record management (veterinarians)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { PetCoOnboardingService } from '../services/pet-co-onboarding-service'
import { ValidationException } from '../validation/validators'

const coOnboardingService = new PetCoOnboardingService()

/**
 * Main Lambda handler for pet co-onboarding endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Pet Co-Onboarding Handler - Event:', JSON.stringify(event, null, 2))

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

    // Extract user context from headers (would come from API Gateway authorizer)
    const userContext = extractUserContext(event)

    // Route to appropriate handler
    switch (httpMethod) {
      case 'POST':
        if (path.includes('/claim')) {
          return await handleClaimProfile(event, corsHeaders)
        } else if (path.includes('/vaccines')) {
          return await handleAddVaccine(event, corsHeaders, userContext)
        } else if (path.includes('/surgeries')) {
          return await handleAddSurgery(event, corsHeaders, userContext)
        } else if (path.includes('/images')) {
          return await handleUploadImage(event, corsHeaders, userContext)
        } else {
          return await handleCreateMedicalProfile(event, corsHeaders, userContext)
        }

      case 'GET':
        if (pathParameters?.petId) {
          return await handleGetPet(event, corsHeaders, userContext)
        } else if (path.includes('/pending-claims')) {
          return await handleGetPendingClaims(event, corsHeaders, userContext)
        } else {
          return await handleListPets(event, corsHeaders, userContext)
        }

      case 'PUT':
        if (path.includes('/enrich')) {
          return await handleEnrichProfile(event, corsHeaders, userContext)
        } else {
          return await handleUpdatePet(event, corsHeaders, userContext)
        }

      case 'DELETE':
        return await handleDeletePet(event, corsHeaders, userContext)

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
    console.error('Pet Co-Onboarding Handler - Error:', error)
    return handleError(error)
  }
}

/**
 * Extract user context from API Gateway event (from authorizer)
 */
function extractUserContext(event: APIGatewayProxyEvent): UserContext {
  // In a real implementation, this would come from the API Gateway authorizer
  // For now, we'll extract from headers or use defaults for testing
  const userType = event.headers['x-user-type'] || 'vet'
  const userId = event.headers['x-user-id'] || 'test-user-id'
  const clinicId = event.headers['x-clinic-id'] || 'test-clinic-id'

  return {
    userType: userType as 'vet' | 'owner',
    userId,
    clinicId: userType === 'vet' ? clinicId : undefined,
  }
}

interface UserContext {
  userType: 'vet' | 'owner'
  userId: string
  clinicId?: string
}

/**
 * Create a medical pet profile (veterinarian only)
 */
async function handleCreateMedicalProfile(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType !== 'vet') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: 'Only veterinarians can create medical profiles',
        },
      }),
    }
  }

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

  const profileData = JSON.parse(event.body)
  
  // Ensure the profile is created for the vet's clinic
  profileData.clinicId = userContext.clinicId
  profileData.verifyingVetId = userContext.userId

  const profile = await coOnboardingService.createMedicalProfile(profileData)

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(profile),
  }
}

/**
 * Claim a pet profile (pet owner only)
 */
async function handleClaimProfile(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
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

  const userContext = extractUserContext(event)
  const claimData = JSON.parse(event.body)
  const result = await coOnboardingService.claimProfile(claimData, userContext.userId)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result),
  }
}

/**
 * Enrich a claimed pet profile (pet owner only)
 */
async function handleEnrichProfile(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType !== 'owner') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: 'Only pet owners can enrich profiles',
        },
      }),
    }
  }

  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_PET_ID',
          message: 'Pet ID is required',
        },
      }),
    }
  }

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

  const enrichmentData = JSON.parse(event.body)
  const pet = await coOnboardingService.enrichProfile(petId, userContext.userId, enrichmentData)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(pet),
  }
}

/**
 * Get a pet by ID with role-based authorization
 */
async function handleGetPet(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_PET_ID',
          message: 'Pet ID is required',
        },
      }),
    }
  }

  const petRecord = await coOnboardingService.findById(
    petId,
    userContext.userType,
    userContext.userId,
    userContext.clinicId
  )

  if (!petRecord) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'PET_NOT_FOUND',
          message: 'Pet not found',
        },
      }),
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(petRecord),
  }
}

/**
 * Get pending claims for a clinic (veterinarian only)
 */
async function handleGetPendingClaims(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType !== 'vet' || !userContext.clinicId) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: 'Only veterinarians can view pending claims',
        },
      }),
    }
  }

  const pendingClaims = await coOnboardingService.getPendingClaims(userContext.clinicId)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ items: pendingClaims }),
  }
}

/**
 * List pets based on user role
 */
async function handleListPets(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType === 'vet' && userContext.clinicId) {
    // Veterinarians see all pets from their clinic (including pending claims)
    const pendingClaims = await coOnboardingService.getPendingClaims(userContext.clinicId)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items: pendingClaims }),
    }
  } else if (userContext.userType === 'owner') {
    // Pet owners see only their claimed pets
    const pets = await coOnboardingService.getByOwner(userContext.userId)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ items: pets }),
    }
  }

  return {
    statusCode: 403,
    headers: corsHeaders,
    body: JSON.stringify({
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
      },
    }),
  }
}

/**
 * Add a vaccine record to a pet (veterinarian only)
 */
async function handleAddVaccine(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType !== 'vet' || !userContext.clinicId) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: 'Only veterinarians can add vaccine records',
        },
      }),
    }
  }

  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_PET_ID',
          message: 'Pet ID is required',
        },
      }),
    }
  }

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

  const vaccineData = JSON.parse(event.body)
  const vaccine = await coOnboardingService.addVaccine(
    petId,
    vaccineData,
    userContext.userId,
    userContext.clinicId
  )

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(vaccine),
  }
}

/**
 * Add a surgery record to a pet (veterinarian only)
 */
async function handleAddSurgery(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType !== 'vet' || !userContext.clinicId) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'FORBIDDEN',
          message: 'Only veterinarians can add surgery records',
        },
      }),
    }
  }

  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_PET_ID',
          message: 'Pet ID is required',
        },
      }),
    }
  }

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

  const surgeryData = JSON.parse(event.body)
  const surgery = await coOnboardingService.addSurgery(
    petId,
    surgeryData,
    userContext.userId,
    userContext.clinicId
  )

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(surgery),
  }
}

/**
 * Upload a pet image (role-based: vet during creation, owner during enrichment)
 */
async function handleUploadImage(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'MISSING_PET_ID', message: 'Pet ID is required' } }),
    }
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'MISSING_BODY', message: 'Request body is required' } }),
    }
  }

  const image = await coOnboardingService.uploadImage(petId, userContext.userId, userContext.userType, event.body)

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(image),
  }
}

/**
 * Update a pet with role-based authorization:
 * - Vets can update medical fields (name, age, breed, species)
 * - Owners can update personal fields via enrichProfile
 */
async function handleUpdatePet(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'MISSING_PET_ID', message: 'Pet ID is required' } }),
    }
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'MISSING_BODY', message: 'Request body is required' } }),
    }
  }

  const updates = JSON.parse(event.body)

  if (userContext.userType === 'vet') {
    // Vets update medical data — must be from the same clinic
    const pet = await coOnboardingService.updateMedicalData(petId, userContext.clinicId!, updates)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(pet) }
  } else {
    // Owners enrich their own claimed profile
    const pet = await coOnboardingService.enrichProfile(petId, userContext.userId, updates)
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(pet) }
  }
}

/**
 * Delete a pet (veterinarian only)
 */
async function handleDeletePet(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>,
  userContext: UserContext
): Promise<APIGatewayProxyResult> {
  if (userContext.userType !== 'vet' || !userContext.clinicId) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Only veterinarians can delete pet profiles' } }),
    }
  }

  const petId = event.pathParameters?.petId
  if (!petId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: 'MISSING_PET_ID', message: 'Pet ID is required' } }),
    }
  }

  await coOnboardingService.deletePet(petId, userContext.clinicId)

  return { statusCode: 204, headers: corsHeaders, body: '' }
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