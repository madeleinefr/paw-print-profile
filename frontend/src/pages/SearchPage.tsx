/**
 * SearchPage - Public lost pet search interface (no authentication required).
 *
 * Displays search filters for species, breed, and age range.
 * Results show pet photos, descriptions, and clinic contact information.
 * Owner contact info is hidden by default — uses anonymous contact form.
 * Only pets with 'Missing' status are returned.
 *
 * Validates: [FR-11], [FR-12], [FR-15], [NFR-SEC-03]
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiException } from '../api/client'

interface SearchResultImage {
  url: string
  tags: string[]
}

interface SearchResultClinic {
  name: string
  phone: string
  address: string
  city?: string
  state?: string
}

interface SearchResult {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  images: SearchResultImage[]
  clinic: SearchResultClinic
  isMissing: boolean
  contactMethod?: string
  messageUrl?: string
}

interface SearchResponse {
  results: SearchResult[]
  count: number
}

export function SearchPage() {
  const [filters, setFilters] = useState({ species: '', breed: '', ageMin: '', ageMax: '', tags: '' })
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateFilter(field: string, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const params: Record<string, string> = {}
      if (filters.species.trim()) params.species = filters.species.trim()
      if (filters.breed.trim()) params.breed = filters.breed.trim()
      if (filters.ageMin.trim()) params.ageMin = filters.ageMin.trim()
      if (filters.ageMax.trim()) params.ageMax = filters.ageMax.trim()
      if (filters.tags.trim()) params.tags = filters.tags.trim()

      const data = await api.get<SearchResponse>('/search/pets', params)
      setResults(data.results || [])
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setFilters({ species: '', breed: '', ageMin: '', ageMax: '', tags: '' })
    setResults([])
    setSearched(false)
    setError(null)
  }

  return (
    <div>
      <h2>Search Lost Pets</h2>
      <p className="text-muted" style={{ marginBottom: '20px' }}>
        Search for missing pets in your area. No account required.
      </p>

      {/* Search filters */}
      <form className="search-form" onSubmit={handleSearch}>
        <div className="form-row">
          <input
            placeholder="Species (e.g., Dog, Cat)"
            value={filters.species}
            onChange={(e) => updateFilter('species', e.target.value)}
            aria-label="Species"
          />
          <input
            placeholder="Breed (e.g., Golden Retriever)"
            value={filters.breed}
            onChange={(e) => updateFilter('breed', e.target.value)}
            aria-label="Breed"
          />
        </div>
        <div className="form-row">
          <input
            type="number"
            placeholder="Min Age"
            min="0"
            value={filters.ageMin}
            onChange={(e) => updateFilter('ageMin', e.target.value)}
            aria-label="Minimum Age"
          />
          <input
            type="number"
            placeholder="Max Age"
            min="0"
            value={filters.ageMax}
            onChange={(e) => updateFilter('ageMax', e.target.value)}
            aria-label="Maximum Age"
          />
          <input
            placeholder="Tags (e.g., brown, white-paws)"
            value={filters.tags}
            onChange={(e) => updateFilter('tags', e.target.value)}
            aria-label="Tags"
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleClear}>
            Clear
          </button>
        </div>
      </form>

      {error && <p style={{ color: '#c33', marginBottom: '15px' }}>{error}</p>}

      {/* Privacy notice [FR-15] */}
      {searched && (
        <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.85rem', color: '#004085' }}>
          🔒 Owner contact information is protected. Use the contact form to reach pet owners anonymously. Clinic contact details are shown for each result.
        </div>
      )}

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <p className="text-muted" style={{ textAlign: 'center', padding: '30px 0' }}>
          No missing pets found matching your criteria. Try broadening your search.
        </p>
      )}

      {results.length > 0 && (
        <p className="text-muted" style={{ marginBottom: '15px' }}>
          Found {results.length} missing pet{results.length !== 1 ? 's' : ''}
        </p>
      )}

      {results.map((pet) => (
        <div key={pet.petId} className="pet-card">
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Pet images */}
            {pet.images.length > 0 && (
              <div style={{ flexShrink: 0 }}>
                <img
                  src={pet.images[0].url}
                  alt={`Photo of ${pet.name}`}
                  style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e9ecef' }}
                />
              </div>
            )}

            {/* Pet info */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h4>
                {pet.name}
                <span style={{ background: '#dc3545', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', marginLeft: '8px' }}>
                  MISSING
                </span>
              </h4>
              <p>{pet.species} · {pet.breed} · {pet.age} year{pet.age !== 1 ? 's' : ''} old</p>

              {/* Image tags as distinctive features */}
              {pet.images.some((img) => img.tags.length > 0) && (
                <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {pet.images.flatMap((img) => img.tags).filter((t, i, a) => a.indexOf(t) === i).map((tag) => (
                    <span key={tag} style={{ background: '#e9ecef', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#555' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Clinic contact [FR-15] — always shown */}
              <div style={{ marginTop: '12px', padding: '10px', background: '#f8f9fa', borderRadius: '6px', fontSize: '0.9rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px', color: '#333' }}>🏥 {pet.clinic.name}</p>
                <p>📞 {pet.clinic.phone}</p>
                <p>📍 {pet.clinic.address}{pet.clinic.city ? `, ${pet.clinic.city}` : ''}{pet.clinic.state ? `, ${pet.clinic.state}` : ''}</p>
              </div>

              {/* Anonymous contact [FR-15] */}
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                <Link to={`/contact/${pet.petId}`}>
                  <button type="button" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                    ✉ Contact Owner Anonymously
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
