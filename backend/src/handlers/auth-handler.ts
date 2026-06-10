/**
 * Auth Lambda Handler
 *
 * Handles authentication, account management, and profile operations.
 * Routes:
 *   POST /auth/signup          - Register new user
 *   POST /auth/signin          - Authenticate user
 *   POST /auth/refresh         - Refresh tokens
 *   GET  /auth/me              - Get current user
 *   POST /auth/signout         - Sign out
 *   POST /auth/associate-clinic - Associate vet with clinic
 *   GET  /account/profile      - Get owner profile
 *   PUT  /account/profile      - Update owner profile
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AuthService, AuthError } from '../services/auth-service'
import { LocalAuthService } from '../services/local-auth-service'
import { extractUserFromIdToken } from '../services/token-utils'

const isLocal = process.env.IS_LOCAL === 'true'
const authService = isLocal ? new LocalAuthService() : new AuthService()
// Profile storage always uses DynamoDB (via LocalAuthService) regardless of environment
// because Cognito doesn't store custom profile data (address, phone, etc.)
const profileService = new LocalAuthService()

function response(statusCode: number, body: any, headers?: Record<string, string>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers },
    body: JSON.stringify(body),
  }
}

function getToken(event: APIGatewayProxyEvent): string | null {
  const authHeader = event.headers?.Authorization || event.headers?.authorization
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
}

/**
 * Main Lambda handler for authentication, account management, and profile operations.
 *
 * @param event - API Gateway proxy event containing HTTP method, path, headers, and body
 * @returns API Gateway proxy result with status code, headers, and JSON body
 * @throws AuthError for authentication failures (mapped to appropriate HTTP status codes)
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { httpMethod, path, body: rawBody } = event
  const body = rawBody ? JSON.parse(rawBody) : {}

  try {
    // POST /auth/signup
    if (httpMethod === 'POST' && path === '/auth/signup') {
      const { email, password, userType, clinicId } = body
      const user = await authService.signUp({ email, password, userType, clinicId })
      return response(201, user)
    }

    // POST /auth/signin
    if (httpMethod === 'POST' && path === '/auth/signin') {
      const { email, password } = body
      const tokens = await authService.signIn(email, password)
      return response(200, tokens)
    }

    // POST /auth/refresh
    if (httpMethod === 'POST' && path === '/auth/refresh') {
      const { refreshToken } = body
      const tokens = await authService.refreshToken(refreshToken)
      return response(200, tokens)
    }

    // GET /auth/me
    if (httpMethod === 'GET' && path === '/auth/me') {
      const token = getToken(event)
      if (!token) return response(401, { error: { code: 'NO_TOKEN', message: 'No access token provided' } })
      
      // Try Cognito GetUser first (works with access token locally)
      const user = await authService.getCurrentUser(token)
      if (user) return response(200, user)
      
      // If that fails, try decoding as idToken (production: API Gateway already validated it)
      const idUser = extractUserFromIdToken(token)
      if (idUser) return response(200, idUser)
      
      return response(401, { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } })
    }

    // POST /auth/signout
    if (httpMethod === 'POST' && path === '/auth/signout') {
      const token = getToken(event)
      if (token) await authService.signOut(token)
      return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' }
    }

    // POST /auth/associate-clinic
    if (httpMethod === 'POST' && path === '/auth/associate-clinic') {
      const token = getToken(event)
      if (!token) return response(401, { error: { code: 'NO_TOKEN', message: 'No access token provided' } })
      const user = await authService.getCurrentUser(token) || extractUserFromIdToken(token)
      if (!user) return response(401, { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } })
      const { clinicId } = body
      if (!clinicId) return response(400, { error: { code: 'INVALID_INPUT', message: 'clinicId is required' } })
      if ('associateClinic' in profileService) {
        await profileService.associateClinic(user.userId, clinicId)
      }
      return response(200, { success: true, clinicId })
    }

    // GET /account/profile
    if (httpMethod === 'GET' && path === '/account/profile') {
      const token = getToken(event)
      if (!token) return response(401, { error: { code: 'NO_TOKEN', message: 'No access token provided' } })
      const user = await authService.getCurrentUser(token) || extractUserFromIdToken(token)
      if (!user) return response(401, { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } })
      const profile = await profileService.getProfile(user.userId)
      return response(200, profile || { ownerName: '', ownerEmail: user.email, ownerPhone: '', ownerStreet: '', ownerHouseNumber: '', ownerZipCode: '', ownerCity: '' })
    }

    // PUT /account/profile
    if (httpMethod === 'PUT' && path === '/account/profile') {
      const token = getToken(event)
      if (!token) return response(401, { error: { code: 'NO_TOKEN', message: 'No access token provided' } })
      const user = await authService.getCurrentUser(token) || extractUserFromIdToken(token)
      if (!user) return response(401, { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } })
      const { ownerName, ownerPhone, ownerStreet, ownerHouseNumber, ownerZipCode, ownerCity } = body
      await profileService.updateProfile(user.userId, {
        ownerName, ownerPhone, ownerStreet, ownerHouseNumber, ownerZipCode, ownerCity,
      })
      return response(200, { success: true })
    }

    return response(404, { error: { code: 'NOT_FOUND', message: `Route not found: ${httpMethod} ${path}` } })
  } catch (err: any) {
    if (err instanceof AuthError) {
      const status = err.code === 'INVALID_CREDENTIALS' || err.code === 'USER_NOT_FOUND' ? 401
        : err.code === 'INVALID_INPUT' ? 400 : 500
      return response(status, { error: { code: err.code, message: err.message } })
    }
    console.error('Auth handler error:', err)
    return response(500, { error: { code: 'INTERNAL', message: err.message || 'Internal error' } })
  }
}
