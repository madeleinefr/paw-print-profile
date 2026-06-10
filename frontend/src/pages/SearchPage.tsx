/**
 * SearchPage - Public lost pet search interface (no authentication required).
 *
 * Displays search filters for species, breed, age range, and location.
 * Results show pet photos, descriptions, and clinic contact information.
 * Owner contact info is hidden by default — uses anonymous contact form.
 * Only pets with 'Missing' status are returned.
 *
 * Location search supports city names and ZIP codes with configurable radius.
 * Clinic distance is displayed in results when location is provided.
 *
 * Validates: [FR-11], [FR-12], [FR-15], [NFR-SEC-03]
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Hospital, Phone, MapPin, Mail, Navigation } from 'lucide-react'
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
  distance?: number
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

interface GeocodedLocation {
  latitude: number
  longitude: number
  displayName: string
}

interface SearchResponse {
  results: SearchResult[]
  count: number
  location?: GeocodedLocation
}

const RADIUS_OPTIONS = [
  { value: '10', label: '10 km' },
  { value: '25', label: '25 km' },
  { value: '50', label: '50 km' },
  { value: '100', label: '100 km' },
]

export function SearchPage() {
  const [filters, setFilters] = useState({ species: '', breed: '', ageMin: '', ageMax: '', tags: '', location: '', radius: '25' })
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geocodedLocation, setGeocodedLocation] = useState<GeocodedLocation | null>(null)

  function updateFilter(field: string, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)
    setGeocodedLocation(null)

    try {
      const params: Record<string, string> = {}
      if (filters.species.trim()) params.species = filters.species.trim()
      if (filters.breed.trim()) params.breed = filters.breed.trim()
      if (filters.ageMin.trim()) params.ageMin = filters.ageMin.trim()
      if (filters.ageMax.trim()) params.ageMax = filters.ageMax.trim()
      if (filters.tags.trim()) params.tags = filters.tags.trim()

      // Add location parameters if provided
      if (filters.location.trim()) {
        params.location = filters.location.trim()
        params.radius = filters.radius
      }

      const data = await api.get<SearchResponse>('/search/pets', params)

      let searchResults = data.results || []

      // Store geocoded location for display purposes
      if (data.location) {
        setGeocodedLocation(data.location)
      }

      setResults(searchResults)
    } catch (err) {
      setError(err instanceof ApiException ? err.error.message : 'Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setFilters({ species: '', breed: '', ageMin: '', ageMax: '', tags: '', location: '', radius: '25' })
    setResults([])
    setSearched(false)
    setError(null)
    setGeocodedLocation(null)
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
          <select
            value={filters.species}
            onChange={(e) => updateFilter('species', e.target.value)}
            aria-label="Species"
          >
            <option value="">All Species</option>
            <option value="Dog">Dog</option>
            <option value="Cat">Cat</option>
            <option value="Bird">Bird</option>
            <option value="Rabbit">Rabbit</option>
            <option value="Hamster">Hamster</option>
            <option value="Reptile">Reptile</option>
            <option value="Other">Other</option>
          </select>
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

        {/* Location search [FR-11][FR-12] */}
        <div className="form-row">
          <input
            placeholder="City or ZIP code (e.g., Berlin, 80331)"
            value={filters.location}
            onChange={(e) => updateFilter('location', e.target.value)}
            aria-label="City or ZIP code"
            style={{ flex: 2 }}
          />
          <select
            value={filters.radius}
            onChange={(e) => updateFilter('radius', e.target.value)}
            aria-label="Search radius"
            style={{ flex: 1 }}
          >
            {RADIUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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

      {/* Location info banner */}
      {geocodedLocation && searched && !loading && (
        <div style={{ background: '#f0f9f4', border: '1px solid #b2dfdb', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '0.85rem', color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Navigation size={16} />
          Searching within {filters.radius} km of {geocodedLocation.displayName}
        </div>
      )}

      {/* Privacy notice [FR-15] */}
      {searched && (
        <div style={{ background: '#e8f4fd', border: '1px solid #b8daff', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.85rem', color: '#004085' }}>
          Owner contact information is protected. Use the contact form to reach pet owners anonymously. Clinic contact details are shown for each result.
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
        <Link
          key={pet.petId}
          to={`/search/${pet.petId}`}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
        <div className="pet-card" style={{ cursor: 'pointer', transition: 'box-shadow 0.2s ease' }}>
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
                <p style={{ fontWeight: 600, marginBottom: '4px', color: '#333' }}><Hospital size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{pet.clinic.name}</p>
                <p><Phone size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{pet.clinic.phone}</p>
                <p><MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{pet.clinic.address}{pet.clinic.city ? `, ${pet.clinic.city}` : ''}{pet.clinic.state ? `, ${pet.clinic.state}` : ''}</p>
                {/* Display distance when location search is active */}
                {geocodedLocation && pet.clinic.distance !== undefined && (
                  <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '4px' }}>
                    <Navigation size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    {pet.clinic.distance < 1
                      ? `${Math.round(pet.clinic.distance * 1000)} m away`
                      : `${pet.clinic.distance} km away`}
                  </p>
                )}
              </div>

              {/* Anonymous contact [FR-15] */}
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                <Link to={`/contact/${pet.petId}`} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                    <Mail size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Contact Owner Anonymously
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
        </Link>
      ))}
    </div>
  )
}
