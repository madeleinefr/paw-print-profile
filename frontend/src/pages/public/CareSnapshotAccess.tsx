/**
 * CareSnapshotAccess - Public care snapshot access with access code.
 *
 * No authentication required — access is controlled by time-limited code.
 * Displays essential care information for temporary caregivers.
 *
 * Validates: [FR-13], [NFR-SEC-03]
 */

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PawPrint, ClipboardList, UtensilsCrossed, Pill, AlertTriangle } from 'lucide-react'
import { api, ApiException } from '../../api/client'

interface CareSnapshotData {
  petName: string
  careInstructions: string
  feedingSchedule: string
  medications: string[]
  emergencyContacts: {
    ownerPhone: string
    ownerEmail: string
    vetClinicName: string
    vetClinicPhone: string
  }
  expiryDate: string
}

export function CareSnapshotAccess() {
  const { accessCode: urlCode } = useParams<{ accessCode: string }>()
  const [inputCode, setInputCode] = useState(urlCode || '')
  const [snapshot, setSnapshot] = useState<CareSnapshotData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  // Auto-load if access code is in the URL
  useState(() => {
    if (urlCode) {
      loadSnapshot(urlCode)
    }
  })

  async function loadSnapshot(code: string) {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const data = await api.get<CareSnapshotData>(`/care-snapshots/${code}`)
      setSnapshot(data)
    } catch (err) {
      if (err instanceof ApiException && err.statusCode === 404) {
        setError('Care snapshot not found or has expired. Please check the access code and try again.')
      } else {
        setError('Failed to load care snapshot. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = inputCode.trim()
    if (!code) return
    loadSnapshot(code)
  }

  const isExpired = snapshot?.expiryDate ? new Date(snapshot.expiryDate) < new Date() : false

  return (
    <div>
      <h2>Care Snapshot</h2>
      <p className="text-muted" style={{ marginBottom: '20px' }}>
        Enter the access code provided by the pet owner to view care instructions.
      </p>

      {/* Access code input */}
      {!snapshot && (
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <input
              placeholder="Access Code (e.g., CARE-XYZ789)"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              required
              aria-label="Care Snapshot Access Code"
              style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '1px' }}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Loading...' : 'View Care Snapshot'}
          </button>
        </form>
      )}

      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}

      {loading && <p className="text-muted">Loading care snapshot...</p>}

      {/* Snapshot content */}
      {snapshot && (
        <div>
          {isExpired && (
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#721c24', fontSize: '0.9rem' }}>
              This care snapshot has expired. The information below may no longer be current.
            </div>
          )}

          <div className="pet-card" style={{ borderLeft: '4px solid #667eea' }}>
            <h3 style={{ marginBottom: '15px' }}><PawPrint size={20} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{snapshot.petName}</h3>

            {/* Care instructions */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '1rem', color: '#333', marginBottom: '6px' }}><ClipboardList size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Care Instructions</h4>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{snapshot.careInstructions}</p>
            </div>

            {/* Feeding schedule */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '1rem', color: '#333', marginBottom: '6px' }}><UtensilsCrossed size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Feeding Schedule</h4>
              <p style={{ lineHeight: '1.6' }}>{snapshot.feedingSchedule}</p>
            </div>

            {/* Medications */}
            {snapshot.medications.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '1rem', color: '#333', marginBottom: '6px' }}><Pill size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Medications</h4>
                <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
                  {snapshot.medications.map((med, i) => (
                    <li key={i}>{med}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Emergency contacts */}
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '16px', marginTop: '20px' }}>
              <h4 style={{ fontSize: '1rem', color: '#856404', marginBottom: '10px' }}><AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Emergency Contacts</h4>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.95rem' }}>
                <p><strong>Owner Phone:</strong> {snapshot.emergencyContacts.ownerPhone}</p>
                <p><strong>Owner Email:</strong> {snapshot.emergencyContacts.ownerEmail}</p>
                <p><strong>Vet Clinic:</strong> {snapshot.emergencyContacts.vetClinicName}</p>
                <p><strong>Clinic Phone:</strong> {snapshot.emergencyContacts.vetClinicPhone}</p>
              </div>
            </div>

            {/* Expiry info */}
            <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '15px' }}>
              {isExpired
                ? `Expired: ${new Date(snapshot.expiryDate).toLocaleString()}`
                : `Access expires: ${new Date(snapshot.expiryDate).toLocaleString()}`
              }
            </p>
          </div>

          {/* Back / new code */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setSnapshot(null); setInputCode(''); setSearched(false); setError(null) }}
            style={{ marginTop: '15px' }}
          >
            Enter Different Code
          </button>
        </div>
      )}

      {searched && !loading && !snapshot && !error && (
        <p className="text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>
          No care snapshot found. Please check the access code.
        </p>
      )}
    </div>
  )
}
