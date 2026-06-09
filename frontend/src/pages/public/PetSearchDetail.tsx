/**
 * PetSearchDetail - Public pet detail page for search results.
 *
 * Displays full-size photo, pet details, distinctive feature tags,
 * and clinic contact information. Owner PII is never displayed.
 * Provides "Contact Owner Anonymously" button and back navigation.
 *
 * Validates: [FR-11], [FR-12], [FR-15]
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Hospital, Phone, MapPin, Mail, Tag } from 'lucide-react'
import { api, ApiException } from '../../api/client'

interface PetImage {
  url: string
  tags: string[]
}

interface PetClinic {
  name: string
  phone: string
  address: string
  city?: string
  state?: string
}

interface PetDetail {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  images: PetImage[]
  clinic: PetClinic
  isMissing: boolean
  contactMethod: string
  messageUrl: string
}

export function PetSearchDetail() {
  const { petId } = useParams<{ petId: string }>()
  const navigate = useNavigate()
  const [pet, setPet] = useState<PetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState(0)

  useEffect(() => {
    if (!petId) return

    async function fetchPetDetails() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.get<PetDetail>(`/search/${petId}`)
        setPet(data)
      } catch (err) {
        if (err instanceof ApiException && err.statusCode === 404) {
          setError('Pet not found. It may no longer be listed as missing.')
        } else {
          setError('Failed to load pet details. Please try again.')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchPetDetails()
  }, [petId])

  if (loading) {
    return (
      <div>
        <p className="text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>
          Loading pet details...
        </p>
      </div>
    )
  }

  if (error || !pet) {
    return (
      <div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/search')}
          style={{ marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={16} /> Back to Search
        </button>
        <p style={{ color: '#c33', textAlign: 'center', padding: '30px 0' }}>
          {error || 'Pet not found.'}
        </p>
      </div>
    )
  }

  const allTags = pet.images
    .flatMap((img) => img.tags)
    .filter((tag, idx, arr) => arr.indexOf(tag) === idx)

  return (
    <div>
      {/* Back navigation */}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => navigate('/search')}
        style={{ marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        aria-label="Back to search results"
      >
        <ArrowLeft size={16} /> Back to Search
      </button>

      {/* Pet header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          {pet.name}
          {pet.isMissing && (
            <span style={{ background: '#dc3545', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
              MISSING
            </span>
          )}
        </h2>
        <p className="text-muted" style={{ fontSize: '1.1rem' }}>
          {pet.species} · {pet.breed} · {pet.age} year{pet.age !== 1 ? 's' : ''} old
        </p>
      </div>

      {/* Main content layout */}
      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        {/* Left: Photo section */}
        <div style={{ flex: '1 1 400px', minWidth: '280px' }}>
          {pet.images.length > 0 ? (
            <div>
              {/* Full-size main image */}
              <img
                src={pet.images[selectedImage].url}
                alt={`Photo of ${pet.name}`}
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  objectFit: 'cover',
                  borderRadius: '10px',
                  border: '1px solid #e9ecef',
                  marginBottom: '12px',
                }}
              />

              {/* Image thumbnails */}
              {pet.images.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {pet.images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImage(idx)}
                      style={{
                        padding: 0,
                        border: idx === selectedImage ? '2px solid #667eea' : '2px solid #e9ecef',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: 'none',
                        overflow: 'hidden',
                      }}
                      aria-label={`View photo ${idx + 1} of ${pet.name}`}
                    >
                      <img
                        src={img.url}
                        alt={`Photo ${idx + 1} of ${pet.name}`}
                        style={{ width: '70px', height: '70px', objectFit: 'cover', display: 'block' }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              width: '100%',
              height: '300px',
              background: '#f8f9fa',
              borderRadius: '10px',
              border: '1px solid #e9ecef',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: '1rem',
            }}>
              No photo available
            </div>
          )}
        </div>

        {/* Right: Details section */}
        <div style={{ flex: '1 1 300px', minWidth: '260px' }}>
          {/* Distinctive features / tags */}
          {allTags.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={16} /> Distinctive Features
              </h4>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {allTags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: '#e9ecef',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '0.85rem',
                      color: '#555',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Clinic contact information [FR-15] — always shown */}
          <div style={{
            padding: '16px',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef',
            marginBottom: '20px',
          }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', color: '#333' }}>
              <Hospital size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              Registered Clinic
            </h4>
            <p style={{ marginBottom: '6px', fontWeight: 500 }}>{pet.clinic.name}</p>
            <p style={{ marginBottom: '6px', color: '#555' }}>
              <Phone size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              {pet.clinic.phone}
            </p>
            <p style={{ color: '#555' }}>
              <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              {pet.clinic.address}
              {pet.clinic.city ? `, ${pet.clinic.city}` : ''}
              {pet.clinic.state ? `, ${pet.clinic.state}` : ''}
            </p>
          </div>

          {/* Privacy notice [FR-15] */}
          <div style={{
            background: '#e8f4fd',
            border: '1px solid #b8daff',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '0.85rem',
            color: '#004085',
          }}>
            Owner contact information is protected. Use the button below to reach the pet owner anonymously through the platform.
          </div>

          {/* Contact Owner Anonymously button [FR-11], [FR-15] */}
          <Link to={`/contact/${pet.petId}`} style={{ textDecoration: 'none' }}>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '14px 20px',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Mail size={18} />
              Contact Owner Anonymously
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
