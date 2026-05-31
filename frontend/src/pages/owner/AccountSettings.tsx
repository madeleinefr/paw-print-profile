/**
 * AccountSettings - Centralized account settings page for pet owners.
 *
 * Displays and allows editing of owner contact details (name, email, phone).
 * Propagates contact changes across all owned pets.
 * Shows account overview (number of pets, claimed profiles).
 *
 * Depends on Cognito authentication for real user identity.
 * Validates: [FR-05], [NFR-SEC-01]
 */

import { useState, useEffect, useCallback } from 'react'
import { User, Shield } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiException } from '../../api/client'

interface PetSummary {
  petId: string
  name: string
  species: string
  breed: string
  profileStatus: string
}

interface AccountOverview {
  totalPets: number
  claimedProfiles: number
  pendingProfiles: number
}

interface ContactDetails {
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  ownerStreet: string
  ownerHouseNumber: string
  ownerZipCode: string
  ownerCity: string
}

export function AccountSettings() {
  const { email } = useAuth()

  const [pets, setPets] = useState<PetSummary[]>([])
  const [overview, setOverview] = useState<AccountOverview>({ totalPets: 0, claimedProfiles: 0, pendingProfiles: 0 })
  const [contact, setContact] = useState<ContactDetails>({ ownerName: '', ownerEmail: '', ownerPhone: '', ownerStreet: '', ownerHouseNumber: '', ownerZipCode: '', ownerCity: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadAccountData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Load user profile (stored on user record, independent of pets)
      const profile = await api.get<{
        ownerName: string; ownerEmail: string; ownerPhone: string
        ownerStreet: string; ownerHouseNumber: string; ownerZipCode: string; ownerCity: string
      }>('/account/profile')
      setContact({
        ownerName: profile.ownerName || '',
        ownerEmail: profile.ownerEmail || email || '',
        ownerPhone: profile.ownerPhone || '',
        ownerStreet: profile.ownerStreet || '',
        ownerHouseNumber: profile.ownerHouseNumber || '',
        ownerZipCode: profile.ownerZipCode || '',
        ownerCity: profile.ownerCity || '',
      })

      // Load pets for overview stats
      const data = await api.get<{ items: PetSummary[] }>('/pets')
      const items = data.items || []
      setPets(items)

      // Compute overview
      const claimed = items.filter((p) => p.profileStatus === 'Active').length
      const pending = items.filter((p) => p.profileStatus === 'Pending Claim').length
      setOverview({ totalPets: items.length, claimedProfiles: claimed, pendingProfiles: pending })
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to load account data')
    } finally {
      setLoading(false)
    }
  }, [email])

  useEffect(() => {
    loadAccountData()
  }, [loadAccountData])

  /**
   * Save contact details and propagate changes across all owned pets.
   * [FR-05]: Preserves original medical verification data while updating owner info.
   */
  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // 1. Save contact details to user profile (persists even with 0 pets)
      await api.put('/account/profile', {
        ownerName: contact.ownerName.trim(),
        ownerPhone: contact.ownerPhone.trim(),
        ownerStreet: contact.ownerStreet.trim(),
        ownerHouseNumber: contact.ownerHouseNumber.trim(),
        ownerZipCode: contact.ownerZipCode.trim(),
        ownerCity: contact.ownerCity.trim(),
      })

      // 2. Propagate contact changes to all owned pets
      const activePets = pets.filter((p) => p.profileStatus === 'Active')
      if (activePets.length > 0) {
        const updatePromises = activePets.map((pet) =>
          api.put(`/pets/${pet.petId}`, {
            ownerName: contact.ownerName.trim(),
            ownerEmail: contact.ownerEmail.trim(),
            ownerPhone: contact.ownerPhone.trim(),
            ownerStreet: contact.ownerStreet.trim(),
            ownerHouseNumber: contact.ownerHouseNumber.trim(),
            ownerZipCode: contact.ownerZipCode.trim(),
            ownerCity: contact.ownerCity.trim(),
          })
        )
        await Promise.all(updatePromises)
      }

      const petCount = activePets.length
      setSuccess(
        petCount > 0
          ? `Contact details saved and updated across ${petCount} pet profile${petCount !== 1 ? 's' : ''}.`
          : 'Contact details saved.'
      )
      // Reload to confirm changes
      await loadAccountData()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to update contact details')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-muted">Loading account settings...</p>

  return (
    <div>
      <h2>
        <User size={22} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
        Account Settings
      </h2>

      {/* Account Overview Section */}
      <div className="pet-card" style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px' }}>Account Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
          <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>
            <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0', color: '#667eea' }}>{overview.totalPets}</p>
            <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>My Pets</p>
          </div>
        </div>
      </div>

      {/* Contact Details Section */}
      <div className="pet-card">
        <h3 style={{ margin: '0 0 4px' }}>Contact Details</h3>
        <p className="text-muted" style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
          Update your contact information here. Changes will be propagated across all your claimed pet profiles.
        </p>

        {error && <p style={{ color: '#c33', marginBottom: '12px' }}>{error}</p>}
        {success && <p style={{ color: '#155724', marginBottom: '12px' }}>✓ {success}</p>}

        <form className="search-form" onSubmit={handleSaveContact}>
          <div className="form-row">
            <input
              placeholder="Full Name"
              value={contact.ownerName}
              onChange={(e) => setContact((prev) => ({ ...prev, ownerName: e.target.value }))}
              aria-label="Full Name"
            />
          </div>
          <div className="form-row">
            <input
              type="email"
              placeholder="Email Address"
              value={contact.ownerEmail}
              disabled
              aria-label="Email Address"
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '-8px' }}>Email is your login address and cannot be changed here.</p>
          <div className="form-row">
            <input
              type="tel"
              placeholder="Phone Number"
              value={contact.ownerPhone}
              onChange={(e) => setContact((prev) => ({ ...prev, ownerPhone: e.target.value }))}
              aria-label="Phone Number"
            />
          </div>

          <h4 style={{ margin: '20px 0 8px', fontSize: '0.95rem' }}>Address</h4>
          <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="Street"
              value={contact.ownerStreet}
              onChange={(e) => setContact((prev) => ({ ...prev, ownerStreet: e.target.value }))}
              aria-label="Street"
              style={{ flex: 3 }}
            />
            <input
              placeholder="Nr."
              value={contact.ownerHouseNumber}
              onChange={(e) => setContact((prev) => ({ ...prev, ownerHouseNumber: e.target.value }))}
              aria-label="House Number"
              style={{ flex: 1 }}
            />
          </div>
          <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="PLZ"
              value={contact.ownerZipCode}
              onChange={(e) => setContact((prev) => ({ ...prev, ownerZipCode: e.target.value }))}
              aria-label="Postal Code"
              style={{ flex: 1 }}
            />
            <input
              placeholder="City"
              value={contact.ownerCity}
              onChange={(e) => setContact((prev) => ({ ...prev, ownerCity: e.target.value }))}
              aria-label="City"
              style={{ flex: 2 }}
            />
          </div>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save & Update All Profiles'}
          </button>
        </form>

        {/* Security info [NFR-SEC-01] */}
        <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginTop: '20px', fontSize: '0.85rem', color: '#004085' }}>
          <Shield size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
          Your account is secured with email and password authentication. Contact details are only visible to your veterinary clinic and are hidden from public search by default.
        </div>
      </div>
    </div>
  )
}
