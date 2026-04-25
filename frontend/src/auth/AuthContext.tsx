/**
 * AuthContext - Provides authentication state and role info to the app.
 *
 * Temporary implementation using local state until Cognito is integrated.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { setAuth, clearAuth } from '../api/client'

export type UserRole = 'vet' | 'owner' | null

interface AuthState {
  isAuthenticated: boolean
  userRole: UserRole
  userId: string | null
  clinicId: string | null
}

interface AuthContextValue extends AuthState {
  login: (role: 'vet' | 'owner', userId: string, clinicId?: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    userRole: null,
    userId: null,
    clinicId: null,
  })

  const login = useCallback((role: 'vet' | 'owner', userId: string, clinicId?: string) => {
    setAuth('temp-token', role, userId, clinicId)
    setAuthState({ isAuthenticated: true, userRole: role, userId, clinicId: clinicId ?? null })
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setAuthState({ isAuthenticated: false, userRole: null, userId: null, clinicId: null })
  }, [])

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
