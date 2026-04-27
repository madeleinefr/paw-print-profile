/**
 * ClaimPage - Profile claiming interface for pet owners.
 * Validates: [FR-04]
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiException } from '../../api/client'

interface ClaimResult {
  petId: string
  name: string
  profileStatus: string
  ownerId: string
  ownerName: string
  claimedAt: string
}

export function ClaimPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ claimingCode: '', ownerName: '', ownerEmail: '', ownerPhone: '' })
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const data = await api.post<ClaimResult>('/pets/claim', {
        claimingCode: form.claimingCode.trim(),
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerPhone: form.ownerPhone.trim(),
      })
      setResult(data)
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.error.message)
      } else {
        setError('Failed to claim profile. Please check your code and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div>
        <h2>Profile Claimed!</h2>
        <div className="pet-card">
          <h4>{result.name}</h4>
          <p>Status: <span style={{ background: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{result.profileStatus}</span></p>
          <p>Owner: {result.ownerName}</p>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Claimed: {new Date(result.claimedAt).toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
          <button type="submit" onClick={() => { setResult(null); setForm({ claimingCode: '', ownerName: '', ownerEmail: '', ownerPhone: '' }) }}>
            Claim Another
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/owner/dashboard')}>Go to My Pets</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Claim Pet Profile</h2>
      <p className="text-muted">Enter the claiming code provided by your veterinarian to take ownership of your pet's profile.</p>

      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}

      <form className="search-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            placeholder="Claiming Code (e.g., CLAIM-ABC123)"
            value={form.claimingCode}
            onChange={(e) => updateField('claimingCode', e.target.value)}
            required
            aria-label="Claiming Code"
            style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '1px' }}
          />
        </div>
        <div className="form-row">
          <input
            placeholder="Your Full Name"
            value={form.ownerName}
            onChange={(e) => updateField('ownerName', e.target.value)}
            required
            aria-label="Owner Name"
          />
        </div>
        <div className="form-row">
          <input
            type="email"
            placeholder="Email Address"
            value={form.ownerEmail}
            onChange={(e) => updateField('ownerEmail', e.target.value)}
            required
            aria-label="Email Address"
          />
          <input
            type="tel"
            placeholder="Phone Number"
            value={form.ownerPhone}
            onChange={(e) => updateField('ownerPhone', e.target.value)}
            required
            aria-label="Phone Number"
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Claiming...' : 'Claim Profile'}
        </button>
      </form>
    </div>
  )
}
