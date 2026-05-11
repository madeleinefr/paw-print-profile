/**
 * Token Storage - Secure storage for JWT tokens and user role information.
 *
 * Uses localStorage to persist auth state across page reloads.
 * Stores access token, refresh token, user type, user ID, and clinic ID.
 *
 * Requirements: [NFR-SEC-01]
 */

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'pawprint_access_token',
  REFRESH_TOKEN: 'pawprint_refresh_token',
  ID_TOKEN: 'pawprint_id_token',
  USER_TYPE: 'pawprint_user_type',
  USER_ID: 'pawprint_user_id',
  CLINIC_ID: 'pawprint_clinic_id',
  EMAIL: 'pawprint_email',
  EXPIRES_AT: 'pawprint_expires_at',
} as const

export type UserType = 'vet' | 'owner'

export interface StoredAuth {
  accessToken: string
  refreshToken: string
  idToken: string
  userType: UserType
  userId: string
  clinicId?: string
  email: string
  expiresAt: number
}

/**
 * Store authentication tokens and user info in localStorage.
 */
export function storeTokens(data: {
  accessToken: string
  refreshToken: string
  idToken: string
  expiresIn: number
  userType: UserType
  userId: string
  email: string
  clinicId?: string
}): void {
  const expiresAt = Date.now() + data.expiresIn * 1000

  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken)
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken)
  localStorage.setItem(STORAGE_KEYS.ID_TOKEN, data.idToken)
  localStorage.setItem(STORAGE_KEYS.USER_TYPE, data.userType)
  localStorage.setItem(STORAGE_KEYS.USER_ID, data.userId)
  localStorage.setItem(STORAGE_KEYS.EMAIL, data.email)
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, String(expiresAt))

  if (data.clinicId) {
    localStorage.setItem(STORAGE_KEYS.CLINIC_ID, data.clinicId)
  } else {
    localStorage.removeItem(STORAGE_KEYS.CLINIC_ID)
  }
}

/**
 * Retrieve stored authentication data from localStorage.
 * Returns null if no tokens are stored.
 */
export function getStoredAuth(): StoredAuth | null {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
  const idToken = localStorage.getItem(STORAGE_KEYS.ID_TOKEN)
  const userType = localStorage.getItem(STORAGE_KEYS.USER_TYPE) as UserType | null
  const userId = localStorage.getItem(STORAGE_KEYS.USER_ID)
  const email = localStorage.getItem(STORAGE_KEYS.EMAIL)
  const expiresAtStr = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT)
  const clinicId = localStorage.getItem(STORAGE_KEYS.CLINIC_ID)

  if (!accessToken || !refreshToken || !idToken || !userType || !userId || !email || !expiresAtStr) {
    return null
  }

  return {
    accessToken,
    refreshToken,
    idToken,
    userType,
    userId,
    email,
    clinicId: clinicId || undefined,
    expiresAt: Number(expiresAtStr),
  }
}

/**
 * Get the stored access token, or null if not available.
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
}

/**
 * Get the stored refresh token, or null if not available.
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
}

/**
 * Check if the access token is expired or about to expire (within 60 seconds).
 */
export function isTokenExpired(): boolean {
  const expiresAtStr = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT)
  if (!expiresAtStr) return true

  const expiresAt = Number(expiresAtStr)
  // Consider expired if within 60 seconds of expiry
  return Date.now() >= expiresAt - 60_000
}

/**
 * Update tokens after a refresh (preserves user info and refresh token if not rotated).
 */
export function updateTokens(data: {
  accessToken: string
  idToken: string
  refreshToken: string
  expiresIn: number
}): void {
  const expiresAt = Date.now() + data.expiresIn * 1000

  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken)
  localStorage.setItem(STORAGE_KEYS.ID_TOKEN, data.idToken)
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken)
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, String(expiresAt))
}

/**
 * Clear all stored authentication data.
 */
export function clearStoredAuth(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key)
  })
}
