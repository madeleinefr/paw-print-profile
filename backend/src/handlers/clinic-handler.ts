/**
 * Clinic Management Lambda Handler
 * 
 * Handles HTTP requests for clinic CRUD operations, pet listings,
 * and custom field configuration.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ClinicService } from '../services/clinic-service'
import { ValidationException } from '../validation/validators'

const clinicService = new ClinicService()

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
        if (path.includes('/pets')) {
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
 * Create a new clinic
 */
async function handleCreateClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
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
 * Get a clinic by ID
 */
async function handleGetClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_CLINIC_ID',
          message: 'Clinic ID is required',
        },
      }),
    }
  }

  const clinic = await clinicService.findById(clinicId)
  if (!clinic) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'CLINIC_NOT_FOUND',
          message: 'Clinic not found',
        },
      }),
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(clinic),
  }
}

/**
 * Update a clinic
 */
async function handleUpdateClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_CLINIC_ID',
          message: 'Clinic ID is required',
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

  const updates = JSON.parse(event.body)
  const clinic = await clinicService.update(clinicId, updates)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(clinic),
  }
}

/**
 * Delete a clinic
 */
async function handleDeleteClinic(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_CLINIC_ID',
          message: 'Clinic ID is required',
        },
      }),
    }
  }

  await clinicService.delete(clinicId)

  return {
    statusCode: 204,
    headers: corsHeaders,
    body: '',
  }
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
 * Get pets for a clinic
 */
async function handleGetClinicPets(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_CLINIC_ID',
          message: 'Clinic ID is required',
        },
      }),
    }
  }

  const { page = '1', limit = '50' } = event.queryStringParameters || {}
  const pagination = {
    page: parseInt(page),
    limit: parseInt(limit),
  }

  const result = await clinicService.getPets(clinicId, pagination)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result),
  }
}

/**
 * Get clinic statistics
 */
async function handleGetClinicStatistics(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_CLINIC_ID',
          message: 'Clinic ID is required',
        },
      }),
    }
  }

  const statistics = await clinicService.getStatistics(clinicId)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(statistics),
  }
}

/**
 * Update clinic custom fields
 */
async function handleUpdateCustomFields(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const clinicId = event.pathParameters?.clinicId
  if (!clinicId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'MISSING_CLINIC_ID',
          message: 'Clinic ID is required',
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

  const { customFields } = JSON.parse(event.body)
  const clinic = await clinicService.updateCustomFields(clinicId, customFields)

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(clinic),
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