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
 *
 * @param input - Sign-up details (email, password, userType, optional clinicId)
 * @returns The created AuthUser with userId, email, and role
 * @throws AuthApiException if input is invalid or email already exists
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
 *
 * @param email - User's email address
 * @param password - User's password
 * @returns JWT tokens (access, ID, refresh) and expiry in seconds
 * @throws AuthApiException if credentials are invalid
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
 *
 * @param refreshToken - A valid refresh token from a previous sign-in
 * @returns New access and ID tokens with expiry
 * @throws AuthApiException if refresh token is invalid or expired
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
 *
 * @param accessToken - Valid access token from sign-in or refresh
 * @returns AuthUser with role info, or null if token is invalid/expired
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
 *
 * @param accessToken - The user's current access token
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
