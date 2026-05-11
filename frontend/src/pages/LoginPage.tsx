/**
 * LoginPage - Sign-in form with role-based redirects.
 *
 * After successful authentication:
 * - Veterinarians are redirected to /vet/dashboard
 * - Pet Owners are redirected to /owner/dashboard
 *
 * Integrates with Cognito via the backend AuthService.
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AuthApiException } from '../auth/auth-api'

export function LoginPage() {
  const { signIn, isAuthenticated, userRole } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // If already authenticated, redirect to appropriate dashboard
  if (isAuthenticated && userRole) {
    const target = userRole === 'vet' ? '/vet/dashboard' : '/owner/dashboard'
    navigate(target, { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Email is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }

    setIsSubmitting(true)

    try {
      await signIn(email.trim(), password)

      // After sign-in, the auth context will have the user's role.
      // We need to read it from localStorage since state update is async.
      const storedUserType = localStorage.getItem('pawprint_user_type')
      const target = storedUserType === 'vet' ? '/vet/dashboard' : '/owner/dashboard'
      navigate(target, { replace: true })
    } catch (err) {
      if (err instanceof AuthApiException) {
        if (err.error.code === 'INVALID_CREDENTIALS' || err.error.code === 'USER_NOT_FOUND') {
          setError('Invalid email or password')
        } else if (err.error.code === 'USER_NOT_CONFIRMED') {
          setError('Your account has not been confirmed. Please check your email.')
        } else {
          setError(err.error.message)
        }
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <h2>Sign In</h2>
      <p className="text-muted">
        Sign in to access your dashboard.
      </p>

      <form onSubmit={handleSubmit} className="search-form" aria-label="Sign in form">
        {/* Email */}
        <div className="form-row">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            aria-required="true"
          />
        </div>

        {/* Password */}
        <div className="form-row">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            aria-required="true"
          />
        </div>

        {/* Error message */}
        {error && (
          <div role="alert" className="error-message" aria-live="polite">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="form-row">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </div>

        <p className="text-muted">
          Don't have an account? <Link to="/signup">Create one</Link>
        </p>
      </form>
    </div>
  )
}
