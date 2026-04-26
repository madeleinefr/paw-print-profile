/**
 * VetDashboard - Clinic dashboard showing pending claims and clinic stats.
 * Validates: [FR-01], [FR-02], [FR-03]
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiException } from '../../api/client'

interface PendingPet {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  claimingCode?: string
  createdAt: string
}

export function VetDashboard() {
  const { clinicId } = useAuth()
  const [pendingClaims, setPendingClaims] = useState<PendingPet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clinicId) return
    loadPendingClaims()
  }, [clinicId])

  async function loadPendingClaims() {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<{ items: PendingPet[] }>('/pets/pending-claims')
      setPendingClaims(data.items)
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to load pending claims')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Clinic Dashboard</h2>
      <p className="text-muted">Clinic ID: {clinicId || 'Not set'}</p>

      <div style={{ display: 'flex', gap: '15px', margin: '20px 0' }}>
        <Link to="/vet/pets/new">
          <button type="submit">+ Create Medical Profile</button>
        </Link>
        <Link to="/vet/pets">
          <button type="button" className="btn-secondary">View All Pets</button>
        </Link>
      </div>

      <h3>Pending Claims ({pendingClaims.length})</h3>

      {loading && <p className="text-muted">Loading...</p>}
      {error && <p style={{ color: '#c33' }}>{error}</p>}

      {!loading && pendingClaims.length === 0 && (
        <p className="text-muted">No pending claims. Create a medical profile to get started.</p>
      )}

      {pendingClaims.map((pet) => (
        <div key={pet.petId} className="pet-card">
          <h4>{pet.name}</h4>
          <p>{pet.species} · {pet.breed} · {pet.age} years</p>
          {pet.claimingCode && (
            <p style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#667eea' }}>
              Claiming Code: {pet.claimingCode}
            </p>
          )}
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Created: {new Date(pet.createdAt).toLocaleDateString()}
          </p>
          <Link to={`/vet/pets/${pet.petId}`}>View Details</Link>
        </div>
      ))}
    </div>
  )
}
