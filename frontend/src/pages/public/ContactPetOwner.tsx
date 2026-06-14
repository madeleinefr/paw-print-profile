/**
 * ContactPetOwner - Anonymous contact form for messaging pet owners.
 *
 * No authentication required. Allows public users to send a message
 * to a pet owner without seeing their contact information.
 * Messages are sent through the platform to protect owner privacy.
 * Optionally supports attaching a photo via direct S3 upload (pre-signed URL).
 * This bypasses the API Gateway payload limit by uploading directly to S3.
 *
 * Validates: [FR-11], [FR-12], [FR-15]
 */

import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Upload, AlertTriangle, X } from 'lucide-react'
import { api } from '../../api/client'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png']
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ACCEPTED_EXTENSIONS = '.jpeg,.jpg,.png'

export function ContactPetOwner() {
  const { petId } = useParams<{ petId: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState({ senderName: '', senderEmail: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Image attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // ── Image Validation ─────────────────────────────────────────────────────

  function validateFile(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported format: ${file.type.split('/')[1]?.toUpperCase() || 'unknown'}. Please use JPEG or PNG.`
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum size is 10 MB.`
    }
    return null
  }

  // ── File Selection ───────────────────────────────────────────────────────

  function processFile(file: File) {
    const validationError = validateFile(file)
    if (validationError) {
      setImageError(validationError)
      setSelectedFile(null)
      setImagePreview(null)
      return
    }

    setImageError(null)
    setSelectedFile(file)

    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleRemoveImage() {
    setSelectedFile(null)
    setImagePreview(null)
    setImageError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Drag and Drop ────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [])

  // ── Upload to S3 via pre-signed URL ───────────────────────────────────────

  async function uploadToS3(file: File): Promise<string> {
    // 1. Get pre-signed PUT URL from backend
    const { uploadUrl, imageKey } = await api.post<{ uploadUrl: string; imageKey: string }>(
      `/pets/${petId}/contact/upload-url`,
      { mimeType: file.type }
    )

    // 2. Upload file directly to S3
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })

    return imageKey
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        senderName: form.senderName,
        senderEmail: form.senderEmail,
        message: form.message,
      }

      // Upload image directly to S3 if selected, then pass the key
      if (selectedFile) {
        payload.imageKey = await uploadToS3(selectedFile)
      }

      await api.post(`/pets/${petId}/contact`, payload)
      setSubmitted(true)
    } catch (err: any) {
      if (err?.error?.message) {
        setError(err.error.message)
      } else {
        setError('Failed to send message. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success State ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div>
        <h2>Message Sent</h2>
        <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <p style={{ color: '#155724', fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>
            Your message has been sent to the pet owner.
          </p>
          <p style={{ color: '#155724', fontSize: '0.9rem' }}>
            The owner will receive your message via email. They can reply to you at <strong>{form.senderEmail}</strong>.
          </p>
        </div>

        <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.85rem', color: '#004085' }}>
          Your message was sent through the platform. The pet owner's contact information remains private.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('/search')}>
            Back to Search
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setSubmitted(false); setForm({ senderName: '', senderEmail: '', message: '' }); handleRemoveImage() }}
          >
            Send Another Message
          </button>
        </div>
      </div>
    )
  }

  // ── Form State ───────────────────────────────────────────────────────────

  return (
    <div>
      <h2>Contact Pet Owner</h2>
      <p className="text-muted" style={{ marginBottom: '10px' }}>
        Send an anonymous message to the pet owner. Your message will be delivered through the platform — the owner's contact information stays private.
      </p>

      {/* Privacy notice [FR-15] */}
      <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.85rem', color: '#004085' }}>
        This form protects the pet owner's privacy. Your email will only be shared with the owner so they can reply to you directly.
      </div>

      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}

      <form className="search-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            placeholder="Your Name"
            value={form.senderName}
            onChange={(e) => updateField('senderName', e.target.value)}
            required
            aria-label="Your Name"
          />
          <input
            type="email"
            placeholder="Your Email Address"
            value={form.senderEmail}
            onChange={(e) => updateField('senderEmail', e.target.value)}
            required
            aria-label="Your Email Address"
          />
        </div>
        <div className="form-row">
          <textarea
            placeholder="Your message (e.g., I think I found your pet near Central Park...)"
            value={form.message}
            onChange={(e) => updateField('message', e.target.value)}
            required
            aria-label="Message"
            rows={5}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '12px 15px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Image attachment section [FR-12], [FR-15] */}
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '8px', fontWeight: 500 }}>
            Attach a photo (optional)
          </p>
          <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '10px' }}>
            If you spotted the pet, attaching a photo can help the owner confirm identity.
          </p>

          {/* Drag-and-drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop zone for photo attachment"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
            style={{
              border: `2px dashed ${dragOver ? '#667eea' : imageError ? '#dc3545' : '#ccc'}`,
              borderRadius: '8px',
              padding: '20px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? '#f0f4ff' : '#fafafa',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              aria-label="Select photo to attach"
            />
            {!selectedFile ? (
              <div>
                <p style={{ fontSize: '0.95rem', color: '#666', marginBottom: '4px' }}>
                  <Upload size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Drag &amp; drop a photo here, or click to browse
                </p>
                <p style={{ fontSize: '0.75rem', color: '#999' }}>
                  JPEG or PNG · Max 10 MB
                </p>
              </div>
            ) : (
              <p style={{ color: '#667eea', fontWeight: 600, fontSize: '0.9rem' }}>
                ✓ {selectedFile.name} — click to change
              </p>
            )}
          </div>

          {/* Image error */}
          {imageError && (
            <p style={{ color: '#dc3545', marginTop: '8px', fontSize: '0.85rem' }}>
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{imageError}
            </p>
          )}

          {/* Image preview with remove button */}
          {imagePreview && selectedFile && (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={imagePreview}
                  alt="Attached photo preview"
                  style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '6px', border: '1px solid #ddd' }}
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemoveImage() }}
                  aria-label="Remove attached photo"
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    background: '#dc3545',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                <p style={{ marginBottom: '2px' }}><strong>{selectedFile.name}</strong></p>
                <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type.split('/')[1]?.toUpperCase()}</p>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/search')}>
            Cancel
          </button>
        </div>
      </form>

    </div>
  )
}
