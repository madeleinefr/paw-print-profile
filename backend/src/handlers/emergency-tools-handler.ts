/**
 * Emergency Tools Lambda Handler
 * 
 * Handles HTTP requests for emergency tools:
 * - Missing pet reporting and flyer generation
 * - Care snapshot creation and access
 * - Pet recovery reporting
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { CareSnapshotService } from '../services/care-snapshot-service'
import { PetCoOnboardingService } from '../services/pet-co-onboarding-service'
import { ValidationException } from '../validation/validators'

const careSnapshotService = new CareSnapshotService()
const coOnboardingService = new PetCoOnboardingService()

/**
 * Main Lambda handler for emergency tools endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Emergency Tools Handler - Event:', JSON.stringify(event, null, 2))

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
        if (path.includes('/missing')) {
          return await handleReportMissing(event, corsHeaders, userContext)
        } else if (path.includes('/care-snapshot')) {
          return await handleCreateCareSnapshot(event, corsHeaders, userContext)
        } else {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({
              error: {
                code: 'NOT_FOUND',
                message: 'Endpoint not found',
              },
            }),
          }
        }

      case 'GET':
        if (path.includes('/care-snapshots/')) {
          return await handleAccessCareSnapshot(event, corsHeaders)
        } else if (path.includes('/flyer')) {
          return await handleDownloadFlyer(event, corsHeaders, userContext)
        } else {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({
              error: {
                code: 'NOT_FOUND',
                message: 'Endpoint not found',
              },
            }),
          }
        }

      case 'PUT':
        if (path.includes('/found')) {
          return await handleMarkAsFound(event, corsHeaders, userContext)
        } else {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({
              error: {
                code: 'NOT_FOUND',
                message: 'Endpoint not found',
              },
            }),
          }
        }

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
    console.error('Emergency Tools Handler - Error:', error)
    return handleError(error)
  }
}

/**
 * Extract user context from API Gateway event (from authorizer)
 */
function extractUserContext(event: APIGatewayProxyEvent): UserContext {
  // In a real implementation, this would come from the API Gateway authorizer
  // For now, we'll extract from headers or use defaults for testing
  const userType = event.headers['x-user-type'] || 'owner'
  const userId = event.headers['x-user-id'] || 'test-user-id'
  const clinicId = event.headers['x-clinic-id']

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
 * Report a pet as missing (pet owner only)
 */
async function handleReportMissing(
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
          message: 'Only pet owners can report pets as missing',
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

  const missingData = JSON.parse(event.body)
  
  // Mark pet as missing
  const pet = await coOnboardingService.markAsMissing(petId, userContext.userId)

  // TODO: Generate missing pet flyer and notify nearby clinics

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      petId,
      isMissing: true,
      flyerUrl: `https://app.pawprintprofile.com/flyers/${petId}`, // Placeholder
      notifiedClinics: 0, // Placeholder
      searchRadiusKm: missingData.searchRadiusKm || 50,
      lastSeenLocation: missingData.lastSeenLocation || '',
    }),
  }
}

/**
 * Mark a pet as found (pet owner only)
 */
async function handleMarkAsFound(
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
          message: 'Only pet owners can mark pets as found',
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

  // Mark pet as found
  const pet = await coOnboardingService.markAsFound(petId, userContext.userId)

  // TODO: Notify previously alerted clinics

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      petId,
      isMissing: false,
      notifiedClinics: 0, // Placeholder
    }),
  }
}

/**
 * Download missing pet flyer (pet owner only)
 */
async function handleDownloadFlyer(
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
          message: 'Only pet owners can download flyers',
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

  // TODO: Implement flyer generation and download

  return {
    statusCode: 501,
    headers: corsHeaders,
    body: JSON.stringify({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Flyer download not yet implemented',
      },
    }),
  }
}

/**
 * Create a care snapshot (pet owner only)
 */
async function handleCreateCareSnapshot(
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
          message: 'Only pet owners can create care snapshots',
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

  const snapshotData = JSON.parse(event.body)
  snapshotData.petId = petId

  const snapshot = await careSnapshotService.generateCareSnapshot(snapshotData, userContext.userId)

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(snapshot),
  }
}

/**
 * Access a care snapshot using access code (public access)
 */
async function handleAccessCareSnapshot(
  event: APIGatewayProxyEvent,
  corsHeaders: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const accessCode = event.pathParameters?.accessCode
  if (!accessCode) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_ACCESS_CODE',
          message: 'Access code is required',
        },
      }),
    }
  }

  const snapshot = await careSnapshotService.accessCareSnapshot(accessCode)
  
  if (!snapshot) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'SNAPSHOT_NOT_FOUND',
          message: 'Care snapshot not found or expired',
        },
      }),
    }
  }

  // Return only the necessary information for caregivers
  const careInfo = {
    petName: snapshot.petName,
    careInstructions: snapshot.careInstructions,
    feedingSchedule: snapshot.feedingSchedule,
    medications: snapshot.medications,
    emergencyContacts: snapshot.emergencyContacts,
    expiryDate: snapshot.expiryDate,
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(careInfo),
  }
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