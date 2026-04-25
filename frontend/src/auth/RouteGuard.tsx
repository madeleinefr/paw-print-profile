/**
 * RouteGuard - Protects routes based on authentication and role.
 *
 * Redirects unauthenticated users to /login and unauthorized users to /.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type UserRole } from './AuthContext'

interface RouteGuardProps {
  allowedRole: UserRole
}

export function RouteGuard({ allowedRole }: RouteGuardProps) {
  const { isAuthenticated, userRole } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRole && userRole !== allowedRole) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
