/**
 * API Client - Environment-aware HTTP client for Paw Print Profile backend
 *
 * Wraps fetch with base URL, auth headers, JSON parsing, and error handling.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface ApiError {
  code: string
  message: string
  details?: { field: string; message: string }[]
}

export class ApiException extends Error {
  constructor(
    public statusCode: number,
    public error: ApiError
  ) {
    super(error.message)
    this.name = 'ApiException'
  }
}

/** Stored auth state */
let authToken: string | null = null
let currentUserType: 'vet' | 'owner' | null = null
let currentUserId: string | null = null
let currentClinicId: string | null = null

export function setAuth(token: string, userType: 'vet' | 'owner', userId: string, clinicId?: string) {
  authToken = token
  currentUserType = userType
  currentUserId = userId
  currentClinicId = clinicId ?? null
}

export function clearAuth() {
  authToken = null
  currentUserType = null
  currentUserId = null
  currentClinicId = null
}

export function getAuth() {
  return { authToken, userType: currentUserType, userId: currentUserId, clinicId: currentClinicId }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  // Temporary header-based auth until Cognito is integrated
  if (currentUserType) headers['x-user-type'] = currentUserType
  if (currentUserId) headers['x-user-id'] = currentUserId
  if (currentClinicId) headers['x-clinic-id'] = currentClinicId
  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T

  const body = await response.json()

  if (!response.ok) {
    throw new ApiException(response.status, body.error || { code: 'UNKNOWN', message: 'Request failed' })
  }

  return body as T
}

export const api = {
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE_URL}${endpoint}`)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const response = await fetch(url.toString(), { method: 'GET', headers: buildHeaders() })
    return handleResponse<T>(response)
  },

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  },
}
