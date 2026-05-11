/**
 * RouteGuard - Protects routes based on authentication and role.
 *
 * Redirects unauthenticated users to /login and unauthorized users to /.
 * Shows a loading state while auth is being initialized (e.g., token refresh).
 *
 * Requirements: [NFR-SEC-02]
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type UserRole } from './AuthContext'

interface RouteGuardProps {
  allowedRole: UserRole
}

export function RouteGuard({ allowedRole }: RouteGuardProps) {
  const { isAuthenticated, userRole, isLoading } = useAuth()

  // Wait for auth initialization (token restore/refresh)
  if (isLoading) {
    return <div aria-busy="true" aria-label="Loading authentication">Loading...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRole && userRole !== allowedRole) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
