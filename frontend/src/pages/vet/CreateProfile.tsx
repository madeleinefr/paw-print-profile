/**
 * CreateProfile - Medical profile creation form for veterinarians.
 * Generates a claiming code for the pet owner.
 * Validates: [FR-03]
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiException } from '../../api/client'

interface MedicalProfileResponse {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  claimingCode: string
  claimingCodeExpiry: string
  profileStatus: string
}

export function CreateProfile() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', species: '', breed: '', age: '' })
  const [result, setResult] = useState<MedicalProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const data = await api.post<MedicalProfileResponse>('/pets', {
        name: form.name,
        species: form.species,
        breed: form.breed,
        age: parseInt(form.age, 10),
      })
      setResult(data)
    } catch (err) {
      if (err instanceof ApiException) {
        const details = err.error.details?.map((d) => `${d.field}: ${d.message}`).join(', ')
        setError(details || err.error.message)
      } else {
        setError('Failed to create profile')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div>
        <h2>Profile Created</h2>
        <div className="pet-card">
          <h4>{result.name}</h4>
          <p>{result.species} · {result.breed} · {result.age} years</p>
          <p>Status: {result.profileStatus}</p>
          <div style={{
            margin: '20px 0',
            padding: '20px',
            background: '#f0f4ff',
            borderRadius: '8px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              Give this code to the pet owner:
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: '1.8rem', color: '#667eea', fontWeight: 700 }}>
              {result.claimingCode}
            </p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(result.claimingCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              style={{ marginTop: '8px', background: copied ? '#d4edda' : 'none', border: `1px solid ${copied ? '#155724' : '#667eea'}`, color: copied ? '#155724' : '#667eea', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              {copied ? '✓ Copied!' : 'Copy Code'}
            </button>
            <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '8px' }}>
              Expires: {new Date(result.claimingCodeExpiry).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
          <button type="submit" onClick={() => { setResult(null); setCopied(false); setForm({ name: '', species: '', breed: '', age: '' }) }}>
            Create Another
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/vet/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Create Medical Profile</h2>
      <p className="text-muted">Enter the pet's medical information to create a verified profile.</p>

      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}

      <form className="search-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            placeholder="Pet Name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            required
            aria-label="Pet Name"
          />
          <input
            placeholder="Species (e.g., Dog, Cat)"
            value={form.species}
            onChange={(e) => updateField('species', e.target.value)}
            required
            aria-label="Species"
          />
        </div>
        <div className="form-row">
          <input
            placeholder="Breed"
            value={form.breed}
            onChange={(e) => updateField('breed', e.target.value)}
            required
            aria-label="Breed"
          />
          <input
            type="number"
            placeholder="Age"
            min="0"
            value={form.age}
            onChange={(e) => updateField('age', e.target.value)}
            required
            aria-label="Age"
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Medical Profile'}
        </button>
      </form>
    </div>
  )
}
