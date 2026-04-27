/**
 * OwnerDashboard - Pet dashboard for pet owners showing claimed pets.
 * Implements 3-click missing pet flyer generation from dashboard.
 * Validates: [FR-04], [FR-05], [FR-08], [FR-09], [FR-10], [FR-15], [NFR-USA-01]
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiException } from '../../api/client'

interface PetSummary {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  profileStatus: string
  isMissing: boolean
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
}

export function OwnerDashboard() {
  const [pets, setPets] = useState<PetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 3-click missing flow state: Click 1 = "Report Missing" button on card
  const [missingPetId, setMissingPetId] = useState<string | null>(null)
  const [contactMethod, setContactMethod] = useState<'phone' | 'email' | 'clinic'>('clinic')
  const [missingNotes, setMissingNotes] = useState('')
  const [missingSubmitting, setMissingSubmitting] = useState(false)
  const [missingResult, setMissingResult] = useState<{ petId: string; flyerUrl: string } | null>(null)

  // Mark as found state
  const [foundSubmitting, setFoundSubmitting] = useState<string | null>(null)

  useEffect(() => {
    loadPets()
  }, [])

  async function loadPets() {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<{ items: PetSummary[] }>('/pets')
      setPets(data.items || [])
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to load pets')
    } finally {
      setLoading(false)
    }
  }

  // Click 2: Submit missing report with contact method selection
  async function handleReportMissing(e: React.FormEvent) {
    e.preventDefault()
    if (!missingPetId) return
    setMissingSubmitting(true)
    setError(null)
    try {
      const data = await api.post<{ petId: string; flyerUrl: string }>(`/pets/${missingPetId}/missing`, {
        searchRadiusKm: 50,
        lastSeenLocation: '',
        additionalNotes: missingNotes,
        contactMethod,
      })
      setMissingResult(data)
      // Refresh pet list to show updated missing status
      loadPets()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to report pet as missing')
    } finally {
      setMissingSubmitting(false)
    }
  }

  async function handleMarkAsFound(petId: string) {
    setFoundSubmitting(petId)
    setError(null)
    try {
      await api.put(`/pets/${petId}/found`)
      setMissingResult(null)
      setMissingPetId(null)
      loadPets()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to mark pet as found')
    } finally {
      setFoundSubmitting(null)
    }
  }

  // Click 3: Download flyer (link rendered after report)
  async function handleDownloadFlyer(petId: string) {
    // If we just reported and already have the flyerUrl, use it directly
    if (missingResult?.flyerUrl && missingResult.petId === petId) {
      window.open(missingResult.flyerUrl, '_blank')
      return
    }
    try {
      const data = await api.get<{ flyerUrl: string }>(`/pets/${petId}/flyer`)
      window.open(data.flyerUrl, '_blank')
    } catch {
      setError('Failed to download flyer. Please try again.')
    }
  }

  if (loading) return <p className="text-muted">Loading...</p>

  return (
    <div>
      <h2>My Pets</h2>

      {/* Privacy info banner [FR-15] */}
      <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.9rem', color: '#004085' }}>
        🔒 Your contact information is hidden from public search results by default. When reporting a missing pet, you choose which contact method to share publicly.
      </div>

      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}

      {pets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p className="text-muted">You haven't claimed any pets yet.</p>
          <Link to="/owner/claim">
            <button type="submit" style={{ marginTop: '15px' }}>Claim a Pet Profile</button>
          </Link>
        </div>
      )}

      {/* Missing report modal/inline form — Click 2 of 3-click flow */}
      {missingPetId && !missingResult && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px', color: '#856404' }}>Report Missing Pet</h3>
          <form onSubmit={handleReportMissing}>
            <p style={{ marginBottom: '12px', fontSize: '0.9rem', color: '#856404' }}>
              Select how people can contact you about your pet:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="contactMethod" value="phone" checked={contactMethod === 'phone'} onChange={() => setContactMethod('phone')} />
                My Phone Number
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="contactMethod" value="email" checked={contactMethod === 'email'} onChange={() => setContactMethod('email')} />
                My Email Address
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="contactMethod" value="clinic" checked={contactMethod === 'clinic'} onChange={() => setContactMethod('clinic')} />
                Veterinary Clinic Contact (recommended for privacy)
              </label>
            </div>
            <div className="form-row">
              <input
                placeholder="Additional notes (optional, e.g., last seen location)"
                value={missingNotes}
                onChange={(e) => setMissingNotes(e.target.value)}
                aria-label="Additional notes"
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              {/* Click 2: Confirm report */}
              <button type="submit" disabled={missingSubmitting} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                {missingSubmitting ? 'Reporting...' : 'Confirm Report Missing'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setMissingPetId(null); setMissingNotes('') }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Flyer download — Click 3 of 3-click flow */}
      {missingResult && (
        <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 8px', color: '#155724' }}>Pet Reported Missing</h3>
          <p style={{ color: '#155724', marginBottom: '12px' }}>Your pet has been reported as missing. Download the flyer to share.</p>
          {/* Click 3: Download flyer */}
          <button type="button" onClick={() => handleDownloadFlyer(missingResult.petId)} style={{ background: '#155724', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
            📄 Download Missing Pet Flyer
          </button>
          <button type="button" className="btn-secondary" onClick={() => { setMissingResult(null); setMissingPetId(null) }} style={{ marginLeft: '10px' }}>
            Dismiss
          </button>
        </div>
      )}

      {pets.map((pet) => (
        <div key={pet.petId} className="pet-card">
          <h4>
            {pet.name}
            {pet.isMissing && (
              <span style={{ background: '#dc3545', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', marginLeft: '8px' }}>MISSING</span>
            )}
            <span style={{ background: pet.profileStatus === 'Active' ? '#d4edda' : '#fff3cd', color: pet.profileStatus === 'Active' ? '#155724' : '#856404', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', marginLeft: '8px' }}>
              {pet.profileStatus}
            </span>
          </h4>
          <p>{pet.species} · {pet.breed} · {pet.age} years</p>

          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
            <Link to={`/owner/pets/${pet.petId}`}>
              <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.9rem' }}>View Details</button>
            </Link>

            {!pet.isMissing && (
              /* Click 1: Open missing report form */
              <button
                type="button"
                onClick={() => { setMissingPetId(pet.petId); setMissingResult(null); setContactMethod('clinic'); setMissingNotes('') }}
                style={{ background: '#dc3545', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Report Missing
              </button>
            )}

            {pet.isMissing && (
              <>
                <button
                  type="button"
                  onClick={() => handleDownloadFlyer(pet.petId)}
                  style={{ background: '#155724', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  📄 Download Flyer
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAsFound(pet.petId)}
                  disabled={foundSubmitting === pet.petId}
                  style={{ background: '#28a745', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  {foundSubmitting === pet.petId ? 'Updating...' : '✓ Mark as Found'}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
