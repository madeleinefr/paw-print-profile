/**
 * SignUpPage - Registration form with role selection (Vet vs Owner).
 *
 * Veterinarians must provide clinic information (clinic ID).
 * Pet owners only need email and password.
 * After successful sign-up, redirects to sign-in page.
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AuthApiException, type UserType } from '../auth/auth-api'

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [userType, setUserType] = useState<UserType>('owner')
  const [clinicId, setClinicId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)

    try {
      await signUp({
        email: email.trim(),
        password,
        userType,
        clinicId: userType === 'vet' ? clinicId.trim() : undefined,
      })
      setSuccess(true)
    } catch (err) {
      if (err instanceof AuthApiException) {
        setError(err.error.message)
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div>
        <h2>Account Created</h2>
        <p>Your account has been created successfully. You can now sign in.</p>
        <div className="form-row">
          <button type="button" onClick={() => navigate('/login')}>
            Go to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Create Account</h2>
      <p className="text-muted">
        Choose your role and create an account to get started.
      </p>

      <form onSubmit={handleSubmit} className="search-form" aria-label="Sign up form">
        {/* Role Selection */}
        <fieldset>
          <legend>I am a:</legend>
          <div className="form-row" style={{ gap: '24px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="userType"
                value="owner"
                checked={userType === 'owner'}
                onChange={() => setUserType('owner')}
                style={{ flex: 'none', minWidth: 'auto', width: 'auto' }}
              />
              Pet Owner
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="userType"
                value="vet"
                checked={userType === 'vet'}
                onChange={() => setUserType('vet')}
                style={{ flex: 'none', minWidth: 'auto', width: 'auto' }}
              />
              Veterinarian
            </label>
          </div>
        </fieldset>

        {/* Email */}
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
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
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            aria-required="true"
          />
        </div>

        {/* Confirm Password */}
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label htmlFor="signup-confirm-password">Confirm Password</label>
          <input
            id="signup-confirm-password"
            type="password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            aria-required="true"
          />
        </div>

        {/* Clinic ID (Vet only — optional) */}
        {userType === 'vet' && (
          <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label htmlFor="signup-clinic-id">Clinic ID (optional)</label>
            <input
              id="signup-clinic-id"
              type="text"
              placeholder="Your clinic identifier"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              aria-describedby="clinic-id-help"
            />
            <small id="clinic-id-help" className="text-muted">
              If your clinic is already registered, enter its ID here. Otherwise, you can create or join a clinic from your dashboard after signing in.
            </small>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div role="alert" className="error-message" aria-live="polite">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="form-row">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>

        <p className="text-muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
