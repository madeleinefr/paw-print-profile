/**
 * AuthContext - Provides authentication state and operations to the app.
 *
 * Integrates with the backend AuthService (Cognito) for:
 * - Sign-up with role selection (Vet vs Owner)
 * - Sign-in with JWT token management
 * - Token refresh to keep sessions alive
 * - Persistent auth state via localStorage
 * - Role-based access control (userType, clinicId)
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import * as authApi from './auth-api'
import {
  storeTokens,
  getStoredAuth,
  clearStoredAuth,
  isTokenExpired,
  getRefreshToken,
  updateTokens,
  getAccessToken,
  type UserType,
} from './token-storage'
import { setAuth, clearAuth } from '../api/client'

export type UserRole = 'vet' | 'owner' | null

interface AuthState {
  isAuthenticated: boolean
  userRole: UserRole
  userId: string | null
  clinicId: string | null
  email: string | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  signUp: (input: authApi.SignUpInput) => Promise<authApi.AuthUser>
  signIn: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** @deprecated Use signIn instead. Kept for backward compatibility. */
  login: (role: 'vet' | 'owner', userId: string, clinicId?: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Interval for proactive token refresh (check every 30 seconds) */
const TOKEN_REFRESH_INTERVAL_MS = 30_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    userRole: null,
    userId: null,
    clinicId: null,
    email: null,
    isLoading: true,
  })

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Updates localStorage and auth state on success.
   */
  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
      const tokens = await authApi.refreshTokens(refreshToken)
      updateTokens({
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      })
      // Update the API client with the new token
      const stored = getStoredAuth()
      if (stored) {
        setAuth(tokens.idToken, stored.userType, stored.userId, stored.clinicId)
      }
      return true
    } catch {
      // Refresh failed — clear auth state
      clearStoredAuth()
      clearAuth()
      setAuthState({
        isAuthenticated: false,
        userRole: null,
        userId: null,
        clinicId: null,
        email: null,
        isLoading: false,
      })
      return false
    }
  }, [])

  /**
   * Start the token refresh timer. Checks every 30s if the token
   * is about to expire and refreshes proactively.
   */
  const startRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
    }

    refreshTimerRef.current = setInterval(async () => {
      if (isTokenExpired()) {
        await refreshAccessToken()
      }
    }, TOKEN_REFRESH_INTERVAL_MS)
  }, [refreshAccessToken])

  const stopRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  /**
   * Initialize auth state from localStorage on mount.
   * If tokens exist but are expired, attempt a refresh.
   */
  useEffect(() => {
    const initAuth = async () => {
      const stored = getStoredAuth()

      if (!stored) {
        setAuthState((prev) => ({ ...prev, isLoading: false }))
        return
      }

      // If token is expired, try to refresh
      if (isTokenExpired()) {
        const refreshed = await refreshAccessToken()
        if (!refreshed) {
          setAuthState((prev) => ({ ...prev, isLoading: false }))
          return
        }
      }

      // Set API client auth headers — use idToken for Cognito authorizer
      setAuth(stored.idToken, stored.userType, stored.userId, stored.clinicId)

      setAuthState({
        isAuthenticated: true,
        userRole: stored.userType,
        userId: stored.userId,
        clinicId: stored.clinicId || null,
        email: stored.email,
        isLoading: false,
      })

      startRefreshTimer()
    }

    initAuth()

    return () => stopRefreshTimer()
  }, [refreshAccessToken, startRefreshTimer, stopRefreshTimer])

  /**
   * Sign up a new user. Does NOT automatically sign in.
   * The user should sign in after successful registration.
   */
  const signUp = useCallback(async (input: authApi.SignUpInput): Promise<authApi.AuthUser> => {
    return await authApi.signUp(input)
  }, [])

  /**
   * Sign in with email and password.
   * Stores tokens, sets auth state, and starts refresh timer.
   * Fetches user info from the backend to get role and clinic info.
   */
  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    const tokens = await authApi.signIn(email, password)

    // Get user info from the access token
    const user = await authApi.getCurrentUser(tokens.accessToken)
    if (!user) {
      throw new authApi.AuthApiException(401, {
        code: 'USER_FETCH_FAILED',
        message: 'Failed to retrieve user information after sign-in',
      })
    }

    // Store tokens and user info
    storeTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
      expiresIn: tokens.expiresIn,
      userType: user.userType as UserType,
      userId: user.userId,
      email: user.email,
      clinicId: user.clinicId,
    })

    // Set API client auth — use idToken for API Gateway Cognito authorizer
    setAuth(tokens.idToken, user.userType as UserType, user.userId, user.clinicId)

    // Update state
    setAuthState({
      isAuthenticated: true,
      userRole: user.userType as UserRole,
      userId: user.userId,
      clinicId: user.clinicId || null,
      email: user.email,
      isLoading: false,
    })

    startRefreshTimer()
  }, [startRefreshTimer])

  /**
   * Log out the user. Clears tokens, notifies backend, and resets state.
   */
  const logout = useCallback(async () => {
    stopRefreshTimer()

    const accessToken = getAccessToken()
    if (accessToken) {
      await authApi.signOut(accessToken)
    }

    clearStoredAuth()
    clearAuth()

    setAuthState({
      isAuthenticated: false,
      userRole: null,
      userId: null,
      clinicId: null,
      email: null,
      isLoading: false,
    })
  }, [stopRefreshTimer])

  /**
   * Legacy login method for backward compatibility.
   * Used by components that haven't migrated to signIn yet.
   * @deprecated Use signIn instead.
   */
  const login = useCallback((role: 'vet' | 'owner', userId: string, clinicId?: string) => {
    setAuth('temp-token', role, userId, clinicId)
    setAuthState({
      isAuthenticated: true,
      userRole: role,
      userId,
      clinicId: clinicId ?? null,
      email: null,
      isLoading: false,
    })
  }, [])

  return (
    <AuthContext.Provider value={{ ...auth, signUp, signIn, logout, login }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
