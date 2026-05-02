/**
 * VetPetDetail - Pet detail view with vaccine and surgery management.
 * Validates: [FR-03], [FR-06], [FR-07]
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, ApiException } from '../../api/client'
import { ImageUpload, ImageGallery } from '../../components/ImageUpload'

interface VaccineRecord {
  vaccineId: string
  vaccineName: string
  administeredDate: string
  nextDueDate: string
  veterinarianName: string
}

interface SurgeryRecord {
  surgeryId: string
  surgeryType: string
  surgeryDate: string
  notes: string
  recoveryInfo: string
  veterinarianName: string
}

interface PetRecord {
  pet: {
    petId: string
    name: string
    species: string
    breed: string
    age: number
    profileStatus: string
    claimingCode?: string
    ownerName?: string
    medicallyVerified: boolean
    createdAt: string
  }
  vaccines: VaccineRecord[]
  surgeries: SurgeryRecord[]
  images: { imageId: string; url: string; tags: string[]; uploadedAt: string }[]
}

export function VetPetDetail() {
  const { petId } = useParams<{ petId: string }>()
  const navigate = useNavigate()
  const [record, setRecord] = useState<PetRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showVaccineForm, setShowVaccineForm] = useState(false)
  const [showSurgeryForm, setShowSurgeryForm] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    if (petId) loadPet()
  }, [petId])

  async function loadPet() {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<PetRecord>(`/pets/${petId}`)
      setRecord(data)
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to load pet')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddVaccine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    try {
      await api.post(`/pets/${petId}/vaccines`, {
        vaccineName: formData.get('vaccineName'),
        administeredDate: formData.get('administeredDate'),
        nextDueDate: formData.get('nextDueDate'),
        veterinarianName: formData.get('veterinarianName'),
      })
      setShowVaccineForm(false)
      loadPet()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to add vaccine')
    }
  }

  async function handleAddSurgery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    try {
      await api.post(`/pets/${petId}/surgeries`, {
        surgeryType: formData.get('surgeryType'),
        surgeryDate: formData.get('surgeryDate'),
        notes: formData.get('notes') || '',
        recoveryInfo: formData.get('recoveryInfo') || '',
        veterinarianName: formData.get('veterinarianName'),
      })
      setShowSurgeryForm(false)
      loadPet()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to add surgery')
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this pet profile?')) return
    try {
      await api.delete(`/pets/${petId}`)
      navigate('/vet/pets')
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to delete pet')
    }
  }

  if (loading) return <p className="text-muted">Loading...</p>
  if (error) return <p style={{ color: '#c33' }}>{error}</p>
  if (!record) return <p className="text-muted">Pet not found.</p>

  const { pet, vaccines, surgeries } = record

  return (
    <div>
      <h2>{pet.name}</h2>
      <div className="pet-card">
        <p>{pet.species} · {pet.breed} · {pet.age} years</p>
        <p>Status: {pet.profileStatus}</p>
        {pet.claimingCode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <p style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#667eea', margin: 0 }}>
              Claiming Code: {pet.claimingCode}
            </p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(pet.claimingCode!); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000) }}
              style={{ background: codeCopied ? '#d4edda' : 'none', border: `1px solid ${codeCopied ? '#155724' : '#667eea'}`, color: codeCopied ? '#155724' : '#667eea', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {codeCopied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
        )}
        {pet.ownerName && <p>Owner: {pet.ownerName}</p>}
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Verified: {pet.medicallyVerified ? 'Yes' : 'No'} · Created: {new Date(pet.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Vaccines */}
      <h3 style={{ marginTop: '30px' }}>Vaccines ({vaccines.length})</h3>
      <button type="button" onClick={() => setShowVaccineForm(!showVaccineForm)} style={{ marginBottom: '15px', cursor: 'pointer', background: 'none', border: '1px solid #667eea', color: '#667eea', padding: '8px 16px', borderRadius: '6px' }}>
        {showVaccineForm ? 'Cancel' : '+ Add Vaccine'}
      </button>

      {showVaccineForm && (
        <form className="search-form" onSubmit={handleAddVaccine}>
          <div className="form-row">
            <input name="vaccineName" placeholder="Vaccine Name" required aria-label="Vaccine Name" />
            <input name="veterinarianName" placeholder="Veterinarian Name" required aria-label="Veterinarian Name" />
          </div>
          <div className="form-row">
            <input name="administeredDate" type="date" required aria-label="Administered Date" />
            <input name="nextDueDate" type="date" required aria-label="Next Due Date" />
          </div>
          <button type="submit">Save Vaccine</button>
        </form>
      )}

      {vaccines.map((v) => (
        <div key={v.vaccineId} className="pet-card">
          <h4>{v.vaccineName}</h4>
          <p>Administered: {v.administeredDate} · Next Due: {v.nextDueDate}</p>
          <p className="text-muted">By: {v.veterinarianName}</p>
        </div>
      ))}

      {/* Surgeries */}
      <h3 style={{ marginTop: '30px' }}>Surgeries ({surgeries.length})</h3>
      <button type="button" onClick={() => setShowSurgeryForm(!showSurgeryForm)} style={{ marginBottom: '15px', cursor: 'pointer', background: 'none', border: '1px solid #667eea', color: '#667eea', padding: '8px 16px', borderRadius: '6px' }}>
        {showSurgeryForm ? 'Cancel' : '+ Add Surgery'}
      </button>

      {showSurgeryForm && (
        <form className="search-form" onSubmit={handleAddSurgery}>
          <div className="form-row">
            <input name="surgeryType" placeholder="Surgery Type" required aria-label="Surgery Type" />
            <input name="veterinarianName" placeholder="Veterinarian Name" required aria-label="Veterinarian Name" />
          </div>
          <div className="form-row">
            <input name="surgeryDate" type="date" required aria-label="Surgery Date" />
          </div>
          <div className="form-row">
            <input name="notes" placeholder="Notes (optional)" aria-label="Notes" />
            <input name="recoveryInfo" placeholder="Recovery Info (optional)" aria-label="Recovery Info" />
          </div>
          <button type="submit">Save Surgery</button>
        </form>
      )}

      {surgeries.map((s) => (
        <div key={s.surgeryId} className="pet-card">
          <h4>{s.surgeryType}</h4>
          <p>Date: {s.surgeryDate}</p>
          {s.notes && <p>Notes: {s.notes}</p>}
          {s.recoveryInfo && <p>Recovery: {s.recoveryInfo}</p>}
          <p className="text-muted">By: {s.veterinarianName}</p>
        </div>
      ))}

      {/* Images */}
      <h3 style={{ marginTop: '30px' }}>Photos ({record.images.length})</h3>
      <ImageUpload petId={petId!} onUploadComplete={loadPet} showGuidance={false} />
      <div style={{ marginTop: '15px' }}>
        <ImageGallery images={record.images} emptyMessage="No photos uploaded yet. Add clinical or identification photos for this pet." />
      </div>

      {/* Actions */}
      <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
        <button type="button" className="btn-secondary" onClick={() => navigate('/vet/pets')}>
          Back to Pets
        </button>
        <button type="button" onClick={handleDelete} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
          Delete Profile
        </button>
      </div>
    </div>
  )
}
