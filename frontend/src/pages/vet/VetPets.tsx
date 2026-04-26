/**
 * VetPets - Pet list for veterinarians with search and pagination.
 * Validates: [FR-01], [FR-03], [FR-06], [FR-07]
 */

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiException } from '../../api/client'

interface Pet {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  profileStatus: string
  claimingCode?: string
  createdAt: string
}

const PAGE_SIZE = 10

export function VetPets() {
  const { clinicId } = useAuth()
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!clinicId) return
    loadPets()
  }, [clinicId])

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1) }, [search])

  async function loadPets() {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<{ items: Pet[] }>(`/clinics/${clinicId}/pets`)
      setPets(data.items.filter((p) => p.petId))
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to load pets')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return pets
    const q = search.toLowerCase()
    return pets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.species.toLowerCase().includes(q) ||
        p.breed.toLowerCase().includes(q) ||
        p.profileStatus.toLowerCase().includes(q)
    )
  }, [pets, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <h2>Pet Profiles</h2>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
        <Link to="/vet/pets/new">
          <button type="submit">+ Create Medical Profile</button>
        </Link>
        <input
          placeholder="Search by name, species, breed..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search pets"
          style={{ flex: 1, padding: '10px 15px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem' }}
        />
      </div>

      {loading && <p className="text-muted">Loading...</p>}
      {error && <p style={{ color: '#c33' }}>{error}</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-muted">
          {search ? 'No pets match your search.' : 'No pets found for this clinic.'}
        </p>
      )}

      {paginated.map((pet) => (
        <div key={pet.petId} className="pet-card">
          <h4>
            {pet.name}
            <span style={{
              fontSize: '0.75rem',
              padding: '3px 8px',
              borderRadius: '4px',
              marginLeft: '10px',
              background: pet.profileStatus === 'Active' ? '#d4edda' : '#fff3cd',
              color: pet.profileStatus === 'Active' ? '#155724' : '#856404',
            }}>
              {pet.profileStatus}
            </span>
          </h4>
          <p>{pet.species} · {pet.breed} · {pet.age} years</p>
          {pet.claimingCode && (
            <p style={{ fontFamily: 'monospace', color: '#667eea' }}>
              Claiming Code: {pet.claimingCode}
            </p>
          )}
          <Link to={`/vet/pets/${pet.petId}`}>View Details</Link>
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            style={{ padding: '8px 16px' }}
          >
            Previous
          </button>
          <span className="text-muted">
            Page {page} of {totalPages} ({filtered.length} pets)
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            style={{ padding: '8px 16px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
