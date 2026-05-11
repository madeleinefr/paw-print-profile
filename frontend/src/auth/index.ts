/**
 * Auth module barrel export.
 *
 * Provides authentication context, route guards, API service, and token storage.
 */

export { AuthProvider, useAuth, type UserRole } from './AuthContext'
export { RouteGuard } from './RouteGuard'
export * as authApi from './auth-api'
export * as tokenStorage from './token-storage'
