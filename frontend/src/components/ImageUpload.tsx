/**
 * ImageUpload - Reusable image upload component with drag-and-drop,
 * format validation, size checking, photo guidance, and quality preview.
 *
 * Supports both vet (during profile creation) and owner (during enrichment)
 * image uploads. Validates JPEG, PNG, WebP formats with 10MB size limit.
 *
 * Validates: [FR-05], [FR-16], [NFR-COMP-03]
 */

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, AlertTriangle } from 'lucide-react'
import { api, ApiException } from '../api/client'

interface ImageUploadProps {
  petId: string
  onUploadComplete: () => void
  showGuidance?: boolean
}

interface UploadedImage {
  imageId: string
  url: string
  tags: string[]
  uploadedAt: string
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ACCEPTED_EXTENSIONS = '.jpeg,.jpg,.png,.webp'

export function ImageUpload({ petId, onUploadComplete, showGuidance = true }: ImageUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [tags, setTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Validation ───────────────────────────────────────────────────────────

  function validateFile(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported format: ${file.type.split('/')[1]?.toUpperCase() || 'unknown'}. Please use JPEG, PNG, or WebP.`
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
      setError(validationError)
      setSelectedFile(null)
      setPreview(null)
      return
    }

    setError(null)
    setSuccess(false)
    setSelectedFile(file)

    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
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

  // ── Upload ───────────────────────────────────────────────────────────────

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return

    setUploading(true)
    setError(null)
    setSuccess(false)

    try {
      const base64 = await fileToBase64(selectedFile)
      await api.post(`/pets/${petId}/images`, {
        imageBase64: base64,
        mimeType: selectedFile.type,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })

      setSuccess(true)
      setSelectedFile(null)
      setPreview(null)
      setTags('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      onUploadComplete()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to upload photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleClear() {
    setSelectedFile(null)
    setPreview(null)
    setTags('')
    setError(null)
    setSuccess(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const formatValid = selectedFile ? ACCEPTED_TYPES.includes(selectedFile.type) : false
  const sizeValid = selectedFile ? selectedFile.size <= MAX_SIZE_BYTES : false

  return (
    <div>
      {/* Photo guidance panel [FR-16] */}
      {showGuidance && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c3d1ff', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px', color: '#333' }}><Camera size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Photo Upload Guidelines</h4>
          <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '8px' }}>
            Quality photos help identify your pet if they go missing. Follow these tips:
          </p>
          <ul style={{ fontSize: '0.85rem', color: '#555', paddingLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Lighting:</strong> Use natural light. Avoid harsh shadows and backlighting.</li>
            <li><strong>Focus:</strong> Ensure your pet's face is in sharp focus.</li>
            <li><strong>Multiple Angles:</strong> Front, side, and back views help with identification.</li>
            <li><strong>Close-ups:</strong> Distinctive features like markings, scars, or unique patterns.</li>
            <li><strong>Full Body:</strong> Show your pet's overall size and shape.</li>
          </ul>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '8px' }}>
            Accepted formats: JPEG, PNG, WebP · Max size: 10 MB · Recommended: 1920×1080 or higher
          </p>
        </div>
      )}

      {/* Upload form */}
      <form onSubmit={handleUpload}>
        {/* Drag-and-drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop zone for pet photo upload"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          style={{
            border: `2px dashed ${dragOver ? '#667eea' : error ? '#dc3545' : '#ccc'}`,
            borderRadius: '8px',
            padding: '30px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? '#f0f4ff' : '#fafafa',
            transition: 'all 0.2s ease',
            marginBottom: '15px',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="Select pet photo"
          />
          {!selectedFile ? (
            <div>
              <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '6px' }}>
                <Upload size={20} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Drag & drop a photo here, or click to browse
              </p>
              <p style={{ fontSize: '0.8rem', color: '#999' }}>
                JPEG, PNG, or WebP · Max 10 MB
              </p>
            </div>
          ) : (
            <p style={{ color: '#667eea', fontWeight: 600 }}>
              ✓ {selectedFile.name} selected — click to change
            </p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p style={{ color: '#dc3545', marginBottom: '15px', fontSize: '0.9rem' }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{error}
          </p>
        )}

        {/* Success message */}
        {success && (
          <p style={{ color: '#155724', marginBottom: '15px', fontSize: '0.9rem' }}>
            ✓ Photo uploaded successfully!
          </p>
        )}

        {/* Preview and quality check [FR-16] */}
        {preview && selectedFile && (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '15px' }}>
            <div>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '8px' }}>Preview:</p>
              <img
                src={preview}
                alt="Upload preview"
                style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px', border: '1px solid #ddd' }}
              />
            </div>
            <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#555', minWidth: '200px' }}>
              <p style={{ fontWeight: 600, marginBottom: '8px' }}>Quality Check:</p>
              <p style={{ color: formatValid ? '#155724' : '#dc3545' }}>
                {formatValid ? '✓' : '✗'} Format: {selectedFile.type.split('/')[1]?.toUpperCase()}
              </p>
              <p style={{ color: sizeValid ? '#155724' : '#dc3545' }}>
                {sizeValid ? '✓' : '✗'} Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {formatValid && sizeValid && (
                <p style={{ marginTop: '8px', color: '#155724' }}>✓ Ready to upload</p>
              )}
              <p style={{ marginTop: '8px', color: '#888', fontSize: '0.8rem' }}>
                Compare with the guidelines above to ensure good quality.
              </p>
            </div>
          </div>
        )}

        {/* Tags input */}
        <div style={{ marginBottom: '15px' }}>
          <input
            placeholder="Tags (comma-separated, e.g., brown, white-paws, scar-left-ear)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label="Photo tags for distinctive features"
            style={{
              width: '100%',
              padding: '12px 15px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
          />
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>
            Tags help identify distinctive features in search results.
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={uploading || !selectedFile || !formatValid || !sizeValid}
          >
            {uploading ? 'Uploading...' : 'Upload Photo'}
          </button>
          {selectedFile && (
            <button type="button" className="btn-secondary" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

// ── Image Gallery Component ──────────────────────────────────────────────────

interface ImageGalleryProps {
  images: UploadedImage[]
  emptyMessage?: string
}

export function ImageGallery({ images, emptyMessage }: ImageGalleryProps) {
  if (images.length === 0) {
    return <p className="text-muted">{emptyMessage || 'No photos uploaded yet.'}</p>
  }

  return (
    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
      {images.map((img) => (
        <div
          key={img.imageId}
          style={{
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            padding: '10px',
            maxWidth: '200px',
          }}
        >
          <img
            src={img.url}
            alt="Pet photo"
            style={{ width: '100%', borderRadius: '6px' }}
          />
          {img.tags.length > 0 && (
            <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {img.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: '#e9ecef',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    color: '#555',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
            {new Date(img.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // Strip data:image/...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
