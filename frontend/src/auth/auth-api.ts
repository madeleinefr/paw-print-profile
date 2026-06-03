/**
 * Auth API - Frontend service for communicating with backend auth endpoints.
 *
 * Handles sign-up, sign-in, token refresh, current user retrieval, and sign-out.
 * All calls go through the backend which integrates with Cognito.
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')

export type UserType = 'vet' | 'owner'

export interface AuthUser {
  userId: string
  email: string
  userType: UserType
  clinicId?: string
}

export interface AuthTokens {
  accessToken: string
  idToken: string
  refreshToken: string
  expiresIn: number
}

export interface SignUpInput {
  email: string
  password: string
  userType: UserType
  clinicId?: string
}

export interface AuthApiError {
  code: string
  message: string
}

export class AuthApiException extends Error {
  constructor(
    public statusCode: number,
    public error: AuthApiError
  ) {
    super(error.message)
    this.name = 'AuthApiException'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) {
    throw new AuthApiException(
      response.status,
      body.error || { code: 'UNKNOWN', message: 'Request failed' }
    )
  }
  return body as T
}

/**
 * Register a new user with role selection.
 * Veterinarians must provide a clinicId.
 */
export async function signUp(input: SignUpInput): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<AuthUser>(response)
}

/**
 * Authenticate a user and return JWT tokens.
 */
export async function signIn(email: string, password: string): Promise<AuthTokens> {
  const response = await fetch(`${API_BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<AuthTokens>(response)
}

/**
 * Refresh authentication tokens using a refresh token.
 */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  return handleResponse<AuthTokens>(response)
}

/**
 * Get the current authenticated user from an access token.
 */
export async function getCurrentUser(accessToken: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Sign out the user, invalidating tokens on the server.
 */
export async function signOut(accessToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/signout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    // Ignore errors on sign-out
  }
}
