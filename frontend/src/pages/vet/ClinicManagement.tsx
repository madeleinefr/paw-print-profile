/**
 * ClinicManagement - Clinic registration, editing, and custom field configuration.
 * Validates: [FR-01], [FR-02]
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiException } from '../../api/client'

interface CustomField {
  fieldName: string
  fieldType: 'text' | 'number' | 'date' | 'boolean'
  required: boolean
}

interface Clinic {
  clinicId: string
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  phone: string
  email: string
  licenseNumber: string
  latitude: number
  longitude: number
  customFields: CustomField[]
}

const emptyForm = {
  name: '', address: '', city: '', state: '', zipCode: '',
  phone: '', email: '', licenseNumber: '', contactPerson: '',
}

export function ClinicManagement() {
  const { clinicId } = useAuth()
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view')

  useEffect(() => {
    if (clinicId) loadClinic()
    else { setLoading(false); setMode('create') }
  }, [clinicId])

  async function loadClinic() {
    try {
      setLoading(true)
      const data = await api.get<Clinic>(`/clinics/${clinicId}`)
      setClinic(data)
      setForm({
        name: data.name, address: data.address, city: data.city,
        state: data.state, zipCode: data.zipCode, phone: data.phone,
        email: data.email, licenseNumber: data.licenseNumber,
        contactPerson: (data as any).contactPerson || '',
      })
      setCustomFields(data.customFields || [])
    } catch {
      setMode('create')
    } finally {
      setLoading(false)
    }
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      ...form,
      latitude: 0,
      longitude: 0,
    }

    try {
      if (mode === 'create') {
        const created = await api.post<Clinic>('/clinics', payload)
        setClinic(created)
        setMode('view')
      } else {
        const updated = await api.put<Clinic>(`/clinics/${clinicId}`, payload)
        setClinic(updated)
        setMode('view')
      }
    } catch (err) {
      if (err instanceof ApiException) {
        const details = err.error.details?.map((d) => `${d.field}: ${d.message}`).join(', ')
        setError(details || err.error.message)
      } else {
        setError('Failed to save clinic')
      }
    } finally {
      setSaving(false)
    }
  }

  function addCustomField() {
    setCustomFields([...customFields, { fieldName: '', fieldType: 'text', required: false }])
  }

  function updateCustomField(index: number, key: keyof CustomField, value: string | boolean) {
    const updated = [...customFields]
    updated[index] = { ...updated[index], [key]: value }
    setCustomFields(updated)
  }

  function removeCustomField(index: number) {
    setCustomFields(customFields.filter((_, i) => i !== index))
  }

  async function saveCustomFields() {
    try {
      setError(null)
      await api.post(`/clinics/${clinicId}/custom-fields`, { customFields })
      loadClinic()
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Failed to save custom fields')
    }
  }

  if (loading) return <p className="text-muted">Loading...</p>

  // View mode
  if (mode === 'view' && clinic) {
    return (
      <div>
        <h2>Clinic Management</h2>
        <div className="pet-card">
          <h4>{clinic.name}</h4>
          <p>{clinic.address}, {clinic.city}, {clinic.state} {clinic.zipCode}</p>
          <p>Phone: {clinic.phone} · Email: {clinic.email}</p>
          {(clinic as any).contactPerson && <p>Contact: {(clinic as any).contactPerson}</p>}
          <p>License: {clinic.licenseNumber}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setMode('edit')} style={{ marginBottom: '20px' }}>
          Edit Clinic Info
        </button>

        <h3>Custom Fields ({customFields.length})</h3>
        {customFields.map((cf, i) => (
          <div key={i} className="pet-card" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{cf.fieldName}</span>
            <span className="text-muted">({cf.fieldType})</span>
            {cf.required && <span style={{ color: '#c33', fontSize: '0.8rem' }}>Required</span>}
            <button type="button" onClick={() => removeCustomField(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#c33', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button type="button" className="btn-secondary" onClick={addCustomField}>+ Add Field</button>
          {customFields.length > 0 && <button type="submit" onClick={saveCustomFields}>Save Custom Fields</button>}
        </div>

        {customFields.some(cf => !cf.fieldName) && (
          <div style={{ marginTop: '15px' }}>
            {customFields.map((cf, i) => !cf.fieldName ? (
              <div key={i} className="search-form" style={{ marginBottom: '10px' }}>
                <div className="form-row">
                  <input placeholder="Field Name" value={cf.fieldName} onChange={(e) => updateCustomField(i, 'fieldName', e.target.value)} aria-label="Field Name" />
                  <select value={cf.fieldType} onChange={(e) => updateCustomField(i, 'fieldType', e.target.value)} aria-label="Field Type">
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <label><input type="checkbox" checked={cf.required} onChange={(e) => updateCustomField(i, 'required', e.target.checked)} /> Required</label>
                </div>
              </div>
            ) : null)}
          </div>
        )}
      </div>
    )
  }

  // Create/Edit form
  return (
    <div>
      <h2>{mode === 'create' ? 'Register Clinic' : 'Edit Clinic'}</h2>
      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}
      <form className="search-form" onSubmit={handleSave}>
        <div className="form-row">
          <input placeholder="Clinic Name" value={form.name} onChange={(e) => updateField('name', e.target.value)} required aria-label="Clinic Name" />
          <input placeholder="License Number" value={form.licenseNumber} onChange={(e) => updateField('licenseNumber', e.target.value)} required aria-label="License Number" />
        </div>
        <div className="form-row">
          <input placeholder="Address" value={form.address} onChange={(e) => updateField('address', e.target.value)} required aria-label="Address" />
          <input placeholder="City" value={form.city} onChange={(e) => updateField('city', e.target.value)} required aria-label="City" />
        </div>
        <div className="form-row">
          <input placeholder="State" value={form.state} onChange={(e) => updateField('state', e.target.value)} required aria-label="State" />
          <input placeholder="ZIP Code" value={form.zipCode} onChange={(e) => updateField('zipCode', e.target.value)} required aria-label="ZIP Code" />
        </div>
        <div className="form-row">
          <input placeholder="Phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required aria-label="Phone" />
          <input placeholder="Email" value={form.email} onChange={(e) => updateField('email', e.target.value)} required aria-label="Email" />
        </div>
        <div className="form-row">
          <input placeholder="Contact Person" value={form.contactPerson} onChange={(e) => updateField('contactPerson', e.target.value)} aria-label="Contact Person" />
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : mode === 'create' ? 'Register Clinic' : 'Save Changes'}</button>
          {mode === 'edit' && <button type="button" className="btn-secondary" onClick={() => setMode('view')}>Cancel</button>}
        </div>
      </form>
    </div>
  )
}
