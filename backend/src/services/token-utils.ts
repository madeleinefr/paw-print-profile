/**
 * Token Utilities
 * 
 * Extracts user information from Cognito JWT tokens (id or access).
 * Used by Lambda handlers to identify the authenticated user.
 * 
 * In production with API Gateway Cognito authorizer:
 *   - The authorizer validates the token before it reaches the handler
 *   - The handler receives a validated idToken and decodes claims from it
 * 
 * In local development (LocalAuthService):
 *   - AuthService.getCurrentUser() validates the token against DynamoDB
 *   - Falls back to header-based auth (x-user-type, x-user-id)
 */

import { AuthUser } from './auth-service'

/**
 * Decode a JWT token payload without verification.
 * Safe to use after API Gateway Cognito authorizer has already validated the token.
 */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload
  } catch {
    return null
  }
}

/**
 * Extract AuthUser from a Cognito idToken JWT payload.
 * Returns null if the token doesn't contain required claims.
 */
export function extractUserFromIdToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null

  // idToken has 'sub', 'email', 'custom:userType', 'custom:clinicId'
  if (payload.sub && payload.email) {
    return {
      userId: payload.sub,
      email: payload.email,
      userType: (payload['custom:userType'] || 'owner') as 'vet' | 'owner',
      clinicId: payload['custom:clinicId'] || undefined,
    }
  }

  return null
}
