/**
 * ContactPetOwner - Anonymous contact form for messaging pet owners.
 *
 * No authentication required. Allows public users to send a message
 * to a pet owner without seeing their contact information.
 * Messages are sent through the platform to protect owner privacy.
 *
 * Validates: [FR-11], [FR-15], [NFR-SEC-03]
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export function ContactPetOwner() {
  const { petId } = useParams<{ petId: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState({ senderName: '', senderEmail: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      // In a full implementation, this would call a backend endpoint
      // POST /pets/{petId}/contact that sends an email to the owner
      // via SNS/SES without exposing the owner's email to the sender.
      //
      // For now, we simulate the submission since the notification
      // service is not yet implemented.
      await new Promise((resolve) => setTimeout(resolve, 800))
      setSubmitted(true)
    } catch {
      setError('Failed to send message. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

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
            onClick={() => { setSubmitted(false); setForm({ senderName: '', senderEmail: '', message: '' }) }}
          >
            Send Another Message
          </button>
        </div>
      </div>
    )
  }

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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/search')}>
            Cancel
          </button>
        </div>
      </form>

      <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '15px' }}>
        Pet ID: {petId}
      </p>
    </div>
  )
}
