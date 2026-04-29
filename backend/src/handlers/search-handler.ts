/**
 * Search Lambda Handler (Public, No Authentication Required)
 * 
 * Handles HTTP requests for lost pet search functionality.
 * This endpoint is public to allow anyone to search for lost pets.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { SearchService } from '../services/search-service'
import { ValidationException } from '../validation/validators'

const searchService = new SearchService()

/**
 * Main Lambda handler for search endpoints
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Search Handler - Event:', JSON.stringify(event, null, 2))

  try {
    const { httpMethod, pathParameters, queryStringParameters } = event
    const path = event.resource || event.path || ''

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    }

    // Handle preflight requests
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: '',
      }
    }

    // Only GET requests are supported for search
    if (httpMethod !== 'GET') {
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

    // Route to appropriate handler
    if (path.includes('/suggestions')) {
      return await handleGetSuggestions(event, corsHeaders)
    } else if (path.includes('/popular')) {
      return await handleGetPopularTerms(event, corsHeaders)
    } else if (pathParameters?.petId) {
      return await handleGetPetDetails(event, corsHeaders)
    } else {
      return await handleSearch(event, corsHeaders)
    }
  } catch (error) {
    console.error('Search Handler - Error:', error)
    return handleError(error)
  }
}

/**
 * Search for pets using various criteria
 */
async function handleSearch(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const {
    species,
    breed,
    ageMin,
    ageMax,
    tags,
    latitude,
    longitude,
    radius,
    missingOnly,
  } = event.queryStringParameters || {}

  // Build search criteria
  const criteria: any = {}

  if (species) {
    criteria.species = species
  }

  if (breed) {
    criteria.breed = breed
  }

  if (ageMin) {
    const min = parseInt(ageMin)
    if (!isNaN(min)) {
      criteria.ageMin = min
    }
  }

  if (ageMax) {
    const max = parseInt(ageMax)
    if (!isNaN(max)) {
      criteria.ageMax = max
    }
  }

  if (tags) {
    criteria.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
  }

  let results

  // Location-based search
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

    results = await searchService.searchByLocation(lat, lng, radiusKm, criteria)
    // Strip owner contact info for public results [FR-15]
    results = results.map(r => ({
      ...r,
      owner: undefined,
      contactMethod: 'platform_messaging' as const,
      messageUrl: `https://app.pawprintprofile.com/contact/${r.petId}`,
    }))
  } else {
    // Public search: only missing pets, owner contact hidden [FR-11][FR-15]
    results = await searchService.searchPublic(criteria)
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      results,
      count: results.length,
      searchCriteria: criteria,
    }),
  }
}

/**
 * Get pet details by ID (public endpoint)
 */
async function handleGetPetDetails(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
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

  const petDetails = await searchService.getPetDetails(petId)
  if (!petDetails) {
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

  // Strip owner contact info for public access [FR-15]
  const publicDetails = {
    ...petDetails,
    owner: undefined,
    contactMethod: 'platform_messaging' as const,
    messageUrl: `https://app.pawprintprofile.com/contact/${petDetails.petId}`,
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(publicDetails),
  }
}

/**
 * Get search suggestions based on partial input
 */
async function handleGetSuggestions(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const { q } = event.queryStringParameters || {}

  if (!q || q.trim().length < 2) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: {
          code: 'INVALID_QUERY',
          message: 'Query parameter "q" must be at least 2 characters long',
        },
      }),
    }
  }

  const suggestions = await searchService.getSearchSuggestions(q.trim())

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(suggestions),
  }
}

/**
 * Get popular search terms
 */
async function handleGetPopularTerms(event: APIGatewayProxyEvent, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const popularTerms = await searchService.getPopularSearchTerms()

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(popularTerms),
  }
}

/**
 * Handle errors and return appropriate HTTP responses
 */
function handleError(error: any): APIGatewayProxyResult {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
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