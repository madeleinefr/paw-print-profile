/**
 * GeocodingService - Converts German city names and PLZ to latitude/longitude coordinates
 *
 * Uses the Nominatim (OpenStreetMap) API for geocoding at runtime.
 * Free, no API key required, restricted to Germany.
 * https://nominatim.org/release-docs/develop/api/Search/
 *
 * Requirements: [FR-11], [FR-12]
 */

export interface GeocodingResult {
  latitude: number
  longitude: number
  displayName: string
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'PawPrintProfile/1.0 (pet-registry-app)'

export class GeocodingService {
  /**
   * Geocode a German city name or PLZ to latitude/longitude coordinates.
   * Returns null if the location cannot be resolved.
   *
   * @param location - A city name (e.g., "München") or 5-digit PLZ (e.g., "80331")
   * @returns Coordinates and display name, or null if geocoding fails
   */
  async geocode(location: string): Promise<GeocodingResult | null> {
    if (!location || location.trim().length === 0) {
      return null
    }

    const trimmed = location.trim()

    try {
      if (this.isZipCode(trimmed)) {
        return await this.geocodeByPlz(trimmed)
      } else {
        return await this.geocodeByCity(trimmed)
      }
    } catch (error) {
      console.error('Geocoding failed:', error)
      return null
    }
  }

  /**
   * Geocode a German PLZ (5-digit postal code)
   */
  private async geocodeByPlz(plz: string): Promise<GeocodingResult | null> {
    const params = new URLSearchParams({
      postalcode: plz,
      country: 'Germany',
      format: 'json',
      limit: '1',
    })

    return await this.fetchNominatim(params)
  }

  /**
   * Geocode a German city name
   */
  private async geocodeByCity(city: string): Promise<GeocodingResult | null> {
    const params = new URLSearchParams({
      city: city,
      country: 'Germany',
      format: 'json',
      limit: '1',
    })

    const result = await this.fetchNominatim(params)

    // If city-specific search fails, try a general query restricted to Germany
    if (!result) {
      const fallbackParams = new URLSearchParams({
        q: `${city}, Deutschland`,
        format: 'json',
        limit: '1',
        countrycodes: 'de',
      })
      return await this.fetchNominatim(fallbackParams)
    }

    return result
  }

  /**
   * Call the Nominatim API and parse the response
   */
  private async fetchNominatim(params: URLSearchParams): Promise<GeocodingResult | null> {
    const url = `${NOMINATIM_BASE_URL}?${params.toString()}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json() as Array<{
      lat: string
      lon: string
      display_name: string
    }>

    if (!data || data.length === 0) {
      return null
    }

    const first = data[0]
    return {
      latitude: parseFloat(first.lat),
      longitude: parseFloat(first.lon),
      displayName: this.simplifyDisplayName(first.display_name),
    }
  }

  /**
   * Simplify Nominatim's verbose display_name to something user-friendly.
   * e.g. "80331, Altstadt-Lehel, München, Bayern, Deutschland" → "München, 80331"
   * e.g. "Berlin, Deutschland" → "Berlin"
   */
  private simplifyDisplayName(displayName: string): string {
    const parts = displayName.split(',').map(p => p.trim())
    // Remove "Deutschland" suffix
    const filtered = parts.filter(p => p !== 'Deutschland')
    // Return first 2 meaningful parts
    return filtered.slice(0, 2).join(', ')
  }

  /**
   * Check if a string looks like a German postal code (PLZ).
   * German PLZ are exactly 5 digits.
   *
   * @param input - String to check
   * @returns True if the input is a valid 5-digit PLZ format
   */
  isZipCode(input: string): boolean {
    return /^\d{5}$/.test(input.trim())
  }
}
