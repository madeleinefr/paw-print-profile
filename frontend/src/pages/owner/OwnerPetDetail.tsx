/**
 * OwnerPetDetail - Detailed pet view for owners with enrichment, photo upload,
 * medical history (read-only), and care snapshot generation.
 * Validates: [FR-05], [FR-06], [FR-07], [FR-08], [FR-13], [FR-15], [FR-16]
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, ApiException } from '../../api/client'

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

interface PetImage {
  imageId: string
  url: string
  tags: string[]
  uploadedAt: string
}

interface PetRecord {
  pet: {
    petId: string
    name: string
    species: string
    breed: string
    age: number
    profileStatus: string
    medicallyVerified: boolean
    isMissing: boolean
    ownerName?: string
    ownerEmail?: string
    ownerPhone?: string
    createdAt: string
    updatedAt: string
  }
  vaccines: VaccineRecord[]
  surgeries: SurgeryRecord[]
  images: PetImage[]
}

interface CareSnapshotResult {
  snapshotId: string
  petName: string
  accessCode: string
  accessUrl: string
  expiryDate: string
}

type Tab = 'overview' | 'medical' | 'photos' | 'care'

export function OwnerPetDetail() {
  const { petId } = useParams<{ petId: string }>()
  const navigate = useNavigate()
  const [record, setRecord] = useState<PetRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Enrichment form state
  const [enrichForm, setEnrichForm] = useState({ ownerName: '', ownerEmail: '', ownerPhone: '' })
  const [enrichSaving, setEnrichSaving] = useState(false)
  const [enrichSuccess, setEnrichSuccess] = useState(false)

  // Photo upload state
  const [photoTags, setPhotoTags] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Care snapshot state
  const [careForm, setCareForm] = useState({ careInstructions: '', feedingSchedule: '', medications: '', expiryHours: '168' })
  const [careSubmitting, setCareSubmitting] = useState(false)
  const [careResult, setCareResult] = useState<CareSnapshotResult | null>(null)
  const [careCopied, setCareCopied] = useState(false)

  useEffect(() => {
    if (petId) loadPet()
  }, [petId])

  async function loadPet() {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<PetRecord>(`/pets/${petId}`)
      setRecord(data)
      setEnrichForm({
        ownerName: data.pet.ownerName || '',
        ownerEmail: data.pet.ownerEmail || '',
        ownerPhone: data.pet.ownerPhone || '',
      })
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to load pet')
    } finally {
      setLoading(false)
    }
  }

  // Profile enrichment [FR-05]
  async function handleEnrichSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnrichSaving(true)
    setEnrichSuccess(false)
    setError(null)
    try {
      await api.put(`/pets/${petId}`, {
        ownerName: enrichForm.ownerName.trim(),
        ownerEmail: enrichForm.ownerEmail.trim(),
        ownerPhone: enrichForm.ownerPhone.trim(),
      })
      setEnrichSuccess(true)
      loadPet()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to update profile')
    } finally {
      setEnrichSaving(false)
    }
  }

  // Photo upload with guidance [FR-16]
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handlePhotoUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return
    setPhotoUploading(true)
    setError(null)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1]
        await api.post(`/pets/${petId}/images`, {
          imageBase64: base64,
          mimeType: selectedFile.type,
          tags: photoTags.split(',').map((t) => t.trim()).filter(Boolean),
        })
        setSelectedFile(null)
        setPhotoPreview(null)
        setPhotoTags('')
        loadPet()
        setPhotoUploading(false)
      }
      reader.readAsDataURL(selectedFile)
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to upload photo')
      setPhotoUploading(false)
    }
  }

  // Care snapshot generation [FR-13]
  async function handleCareSnapshot(e: React.FormEvent) {
    e.preventDefault()
    setCareSubmitting(true)
    setError(null)
    try {
      const data = await api.post<CareSnapshotResult>(`/pets/${petId}/care-snapshot`, {
        careInstructions: careForm.careInstructions,
        feedingSchedule: careForm.feedingSchedule,
        medications: careForm.medications.split(',').map((m) => m.trim()).filter(Boolean),
        expiryHours: parseInt(careForm.expiryHours, 10) || 168,
      })
      setCareResult(data)
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to create care snapshot')
    } finally {
      setCareSubmitting(false)
    }
  }

  if (loading) return <p className="text-muted">Loading...</p>
  if (error && !record) return <p style={{ color: '#c33' }}>{error}</p>
  if (!record) return <p className="text-muted">Pet not found.</p>

  const { pet, vaccines, surgeries, images } = record

  const tabStyle = (tab: Tab) => ({
    background: activeTab === tab ? '#667eea' : 'none',
    color: activeTab === tab ? 'white' : '#667eea',
    border: `1px solid #667eea`,
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer' as const,
    fontWeight: 600 as const,
    fontSize: '0.9rem',
  })

  return (
    <div>
      <h2>
        {pet.name}
        {pet.isMissing && (
          <span style={{ background: '#dc3545', color: 'white', padding: '2px 10px', borderRadius: '4px', fontSize: '0.8rem', marginLeft: '10px', verticalAlign: 'middle' }}>MISSING</span>
        )}
      </h2>

      {/* Pet summary card */}
      <div className="pet-card">
        <p>{pet.species} · {pet.breed} · {pet.age} years</p>
        <p>Status: <span style={{ background: pet.profileStatus === 'Active' ? '#d4edda' : '#fff3cd', color: pet.profileStatus === 'Active' ? '#155724' : '#856404', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{pet.profileStatus}</span></p>
        {pet.medicallyVerified && <p style={{ fontSize: '0.85rem', color: '#28a745' }}>✓ Medically Verified</p>}
      </div>

      {error && <p style={{ color: '#c33', margin: '15px 0' }}>{error}</p>}

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '8px', margin: '20px 0', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setActiveTab('overview')} style={tabStyle('overview')}>Profile Info</button>
        <button type="button" onClick={() => setActiveTab('medical')} style={tabStyle('medical')}>Medical History</button>
        <button type="button" onClick={() => setActiveTab('photos')} style={tabStyle('photos')}>Photos</button>
        <button type="button" onClick={() => setActiveTab('care')} style={tabStyle('care')}>Care Snapshot</button>
      </div>

      {/* Overview / Enrichment Tab [FR-05] */}
      {activeTab === 'overview' && (
        <div>
          <h3>Update Your Information</h3>
          <p className="text-muted" style={{ marginBottom: '15px' }}>Update your contact details. Medical data is managed by your veterinarian.</p>

          {enrichSuccess && <p style={{ color: '#155724', marginBottom: '10px' }}>✓ Profile updated successfully.</p>}

          <form className="search-form" onSubmit={handleEnrichSubmit}>
            <div className="form-row">
              <input
                placeholder="Your Name"
                value={enrichForm.ownerName}
                onChange={(e) => setEnrichForm((p) => ({ ...p, ownerName: e.target.value }))}
                aria-label="Owner Name"
              />
            </div>
            <div className="form-row">
              <input
                type="email"
                placeholder="Email Address"
                value={enrichForm.ownerEmail}
                onChange={(e) => setEnrichForm((p) => ({ ...p, ownerEmail: e.target.value }))}
                aria-label="Email Address"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={enrichForm.ownerPhone}
                onChange={(e) => setEnrichForm((p) => ({ ...p, ownerPhone: e.target.value }))}
                aria-label="Phone Number"
              />
            </div>
            <button type="submit" disabled={enrichSaving}>
              {enrichSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          {/* Privacy info [FR-15] */}
          <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginTop: '20px', fontSize: '0.85rem', color: '#004085' }}>
            🔒 Your phone number and email are hidden from public search by default. Only the contact method you select when reporting a missing pet will be shared.
          </div>
        </div>
      )}

      {/* Medical History Tab (read-only) [FR-06], [FR-07] */}
      {activeTab === 'medical' && (
        <div>
          <h3>Vaccines ({vaccines.length})</h3>
          {vaccines.length === 0 && <p className="text-muted">No vaccine records yet. Your vet will add these during visits.</p>}
          {vaccines.map((v) => (
            <div key={v.vaccineId} className="pet-card">
              <h4>{v.vaccineName}</h4>
              <p>Administered: {v.administeredDate} · Next Due: {v.nextDueDate}</p>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>By: {v.veterinarianName}</p>
            </div>
          ))}

          <h3 style={{ marginTop: '25px' }}>Surgeries ({surgeries.length})</h3>
          {surgeries.length === 0 && <p className="text-muted">No surgery records.</p>}
          {surgeries.map((s) => (
            <div key={s.surgeryId} className="pet-card">
              <h4>{s.surgeryType}</h4>
              <p>Date: {s.surgeryDate}</p>
              {s.notes && <p>Notes: {s.notes}</p>}
              {s.recoveryInfo && <p>Recovery: {s.recoveryInfo}</p>}
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>By: {s.veterinarianName}</p>
            </div>
          ))}
        </div>
      )}

      {/* Photos Tab with guidance [FR-16] */}
      {activeTab === 'photos' && (
        <div>
          {/* Photo upload guidance panel [FR-16] */}
          <div style={{ background: '#f0f4ff', border: '1px solid #c3d1ff', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px', color: '#333' }}>📸 Photo Upload Guidelines</h4>
            <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '8px' }}>Quality photos help identify your pet if they go missing. Follow these tips:</p>
            <ul style={{ fontSize: '0.85rem', color: '#555', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>Lighting:</strong> Use natural light from a window or outdoors. Avoid harsh shadows and backlighting.</li>
              <li><strong>Focus:</strong> Ensure your pet's face is in sharp focus. Tap on your pet to set focus.</li>
              <li><strong>Multiple Angles:</strong> Take photos from front, side, and back views for better identification.</li>
              <li><strong>Close-ups:</strong> Include close-up photos of distinctive features like face markings, scars, or unique patterns.</li>
              <li><strong>Full Body:</strong> Include full-body photos showing your pet's overall size and shape.</li>
            </ul>
            <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '8px' }}>
              Accepted formats: JPEG, PNG, WebP · Max size: 10 MB · Recommended: 1920×1080 or higher
            </p>
          </div>

          {/* Upload form */}
          <form className="search-form" onSubmit={handlePhotoUpload}>
            <div className="form-row">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                aria-label="Select pet photo"
              />
            </div>

            {/* Image quality preview [FR-16] */}
            {photoPreview && (
              <div style={{ margin: '15px 0', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '8px' }}>Preview:</p>
                  <img src={photoPreview} alt="Upload preview" style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px', border: '1px solid #ddd' }} />
                </div>
                <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#555', minWidth: '200px' }}>
                  <p style={{ fontWeight: 600, marginBottom: '6px' }}>Quality Check:</p>
                  <p>✓ File selected</p>
                  {selectedFile && <p>Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB {selectedFile.size > 10 * 1024 * 1024 ? '⚠️ Too large!' : '✓'}</p>}
                  {selectedFile && <p>Format: {selectedFile.type.split('/')[1]?.toUpperCase()} ✓</p>}
                  <p style={{ marginTop: '8px', color: '#888' }}>Compare with the guidelines above to ensure good quality.</p>
                </div>
              </div>
            )}

            <div className="form-row">
              <input
                placeholder="Tags (comma-separated, e.g., brown, white-paws, scar-left-ear)"
                value={photoTags}
                onChange={(e) => setPhotoTags(e.target.value)}
                aria-label="Photo tags"
              />
            </div>
            <button type="submit" disabled={photoUploading || !selectedFile}>
              {photoUploading ? 'Uploading...' : 'Upload Photo'}
            </button>
          </form>

          {/* Existing images gallery */}
          <h3 style={{ marginTop: '25px' }}>Photos ({images.length})</h3>
          {images.length === 0 && <p className="text-muted">No photos uploaded yet. Add photos to help identify your pet.</p>}
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            {images.map((img) => (
              <div key={img.imageId} style={{ border: '1px solid #e9ecef', borderRadius: '8px', padding: '10px', maxWidth: '200px' }}>
                <img src={img.url} alt={`Pet photo`} style={{ width: '100%', borderRadius: '6px' }} />
                {img.tags.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {img.tags.map((tag) => (
                      <span key={tag} style={{ background: '#e9ecef', padding: '1px 6px', borderRadius: '3px', fontSize: '0.75rem', color: '#555' }}>{tag}</span>
                    ))}
                  </div>
                )}
                <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{new Date(img.uploadedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Care Snapshot Tab [FR-13] */}
      {activeTab === 'care' && (
        <div>
          <h3>Generate Care Snapshot</h3>
          <p className="text-muted" style={{ marginBottom: '15px' }}>
            Create a time-limited care summary for pet sitters or temporary caregivers. They'll receive an access code to view essential care information.
          </p>

          {careResult ? (
            <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <h4 style={{ color: '#155724', margin: '0 0 10px' }}>Care Snapshot Created</h4>
              <p style={{ color: '#155724' }}>Share this access code with your caregiver:</p>
              <div style={{ textAlign: 'center', margin: '15px 0' }}>
                <p style={{ fontFamily: 'monospace', fontSize: '1.6rem', color: '#155724', fontWeight: 700 }}>{careResult.accessCode}</p>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(careResult.accessCode); setCareCopied(true); setTimeout(() => setCareCopied(false), 2000) }}
                  style={{ background: careCopied ? '#c3e6cb' : 'none', border: `1px solid #155724`, color: '#155724', padding: '4px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '6px' }}
                >
                  {careCopied ? '✓ Copied!' : 'Copy Code'}
                </button>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#155724' }}>
                Access URL: <a href={careResult.accessUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#155724' }}>{careResult.accessUrl}</a>
              </p>
              <p style={{ fontSize: '0.85rem', color: '#856404', marginTop: '8px' }}>
                Expires: {new Date(careResult.expiryDate).toLocaleString()}
              </p>
              <button type="button" className="btn-secondary" onClick={() => setCareResult(null)} style={{ marginTop: '12px' }}>
                Create Another
              </button>
            </div>
          ) : (
            <form className="search-form" onSubmit={handleCareSnapshot}>
              <div className="form-row">
                <input
                  placeholder="Care Instructions (e.g., Feed twice daily)"
                  value={careForm.careInstructions}
                  onChange={(e) => setCareForm((p) => ({ ...p, careInstructions: e.target.value }))}
                  required
                  aria-label="Care Instructions"
                />
              </div>
              <div className="form-row">
                <input
                  placeholder="Feeding Schedule (e.g., 8 AM and 6 PM, 1 cup)"
                  value={careForm.feedingSchedule}
                  onChange={(e) => setCareForm((p) => ({ ...p, feedingSchedule: e.target.value }))}
                  required
                  aria-label="Feeding Schedule"
                />
              </div>
              <div className="form-row">
                <input
                  placeholder="Medications (comma-separated)"
                  value={careForm.medications}
                  onChange={(e) => setCareForm((p) => ({ ...p, medications: e.target.value }))}
                  aria-label="Medications"
                />
              </div>
              <div className="form-row">
                <input
                  type="number"
                  placeholder="Access Duration (hours)"
                  value={careForm.expiryHours}
                  onChange={(e) => setCareForm((p) => ({ ...p, expiryHours: e.target.value }))}
                  min="1"
                  max="720"
                  aria-label="Access Duration in Hours"
                />
              </div>
              <button type="submit" disabled={careSubmitting}>
                {careSubmitting ? 'Creating...' : 'Generate Care Snapshot'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Back button */}
      <div style={{ marginTop: '30px' }}>
        <button type="button" className="btn-secondary" onClick={() => navigate('/owner/dashboard')}>
          ← Back to My Pets
        </button>
      </div>
    </div>
  )
}
