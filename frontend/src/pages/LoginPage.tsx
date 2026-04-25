/**
 * LoginPage - Temporary login with role selection.
 * Will be replaced with Cognito integration (issue 69)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [userId, setUserId] = useState('')
  const [clinicId, setClinicId] = useState('')

  const handleLogin = (role: 'vet' | 'owner') => {
    const id = userId.trim() || `${role}-${Date.now()}`
    login(role, id, role === 'vet' ? clinicId.trim() || undefined : undefined)
    navigate(role === 'vet' ? '/vet/dashboard' : '/owner/dashboard')
  }

  return (
    <div>
      <h2>Sign In</h2>
      <p className="text-muted">Temporary login — Cognito integration pending.</p>
      <div className="search-form">
        <div className="form-row">
          <input
            placeholder="User ID (optional)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="User ID"
          />
          <input
            placeholder="Clinic ID (vet only, optional)"
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            aria-label="Clinic ID"
          />
        </div>
        <div className="form-row">
          <button type="submit" onClick={() => handleLogin('vet')}>
            Sign in as Veterinarian
          </button>
          <button type="submit" onClick={() => handleLogin('owner')}>
            Sign in as Pet Owner
          </button>
        </div>
      </div>
    </div>
  )
}
