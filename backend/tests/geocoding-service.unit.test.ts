/**
 * Unit tests for GeocodingService
 *
 * Tests German city/PLZ geocoding using Nominatim API.
 * Uses fetch mocking to avoid real network calls in tests.
 * Requirements: [FR-11], [FR-12]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeocodingService } from '../src/services/geocoding-service'

// Mock responses matching Nominatim's format
const BERLIN_RESPONSE = [
  { lat: '52.5173885', lon: '13.3951309', display_name: 'Berlin, Deutschland' },
]

const MUNICH_PLZ_RESPONSE = [
  { lat: '48.1359146', lon: '11.5730984', display_name: '80331, Altstadt-Lehel, München, Bayern, Deutschland' },
]

const HAMBURG_RESPONSE = [
  { lat: '53.5510846', lon: '9.9936819', display_name: 'Hamburg, Deutschland' },
]

describe('GeocodingService', () => {
  const service = new GeocodingService()
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockFetchSuccess(data: any) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => data,
    })
  }

  function mockFetchEmpty() {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
  }

  function mockFetchError() {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })
  }

  describe('geocode()', () => {
    it('should resolve a German city name to coordinates', async () => {
      mockFetchSuccess(BERLIN_RESPONSE)

      const result = await service.geocode('Berlin')
      expect(result).not.toBeNull()
      expect(result!.latitude).toBeCloseTo(52.52, 1)
      expect(result!.longitude).toBeCloseTo(13.40, 1)
      expect(result!.displayName).toContain('Berlin')
    })

    it('should resolve a German PLZ to coordinates', async () => {
      mockFetchSuccess(MUNICH_PLZ_RESPONSE)

      const result = await service.geocode('80331')
      expect(result).not.toBeNull()
      expect(result!.latitude).toBeCloseTo(48.14, 1)
      expect(result!.longitude).toBeCloseTo(11.57, 1)
      expect(result!.displayName).toContain('80331')
    })

    it('should use postalcode param for PLZ queries', async () => {
      mockFetchSuccess(MUNICH_PLZ_RESPONSE)

      await service.geocode('80331')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('postalcode=80331')
      expect(url).toContain('country=Germany')
    })

    it('should use city param for city name queries', async () => {
      mockFetchSuccess(HAMBURG_RESPONSE)

      await service.geocode('Hamburg')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('city=Hamburg')
      expect(url).toContain('country=Germany')
    })

    it('should return null for empty string', async () => {
      const result = await service.geocode('')
      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should return null for whitespace-only input', async () => {
      const result = await service.geocode('   ')
      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should return null when Nominatim returns no results', async () => {
      mockFetchEmpty()
      mockFetchEmpty() // fallback also empty

      const result = await service.geocode('Xyzzyville')
      expect(result).toBeNull()
    })

    it('should return null when Nominatim returns an error', async () => {
      mockFetchError()
      mockFetchError() // fallback also fails

      const result = await service.geocode('Berlin')
      expect(result).toBeNull()
    })

    it('should try fallback query when city search returns empty', async () => {
      mockFetchEmpty() // first city search returns empty
      mockFetchSuccess(BERLIN_RESPONSE) // fallback succeeds

      const result = await service.geocode('Kreuzberg')
      expect(result).not.toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const fallbackUrl = fetchMock.mock.calls[1][0] as string
      expect(fallbackUrl).toContain('countrycodes=de')
    })

    it('should return null on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network timeout'))

      const result = await service.geocode('Berlin')
      expect(result).toBeNull()
    })

    it('should send correct User-Agent header', async () => {
      mockFetchSuccess(BERLIN_RESPONSE)

      await service.geocode('Berlin')
      const options = fetchMock.mock.calls[0][1] as RequestInit
      expect(options.headers).toHaveProperty('User-Agent', 'PawPrintProfile/1.0 (pet-registry-app)')
    })

    it('should simplify display name by removing Deutschland', async () => {
      mockFetchSuccess([{ lat: '53.55', lon: '9.99', display_name: 'Hamburg, Deutschland' }])

      const result = await service.geocode('Hamburg')
      expect(result!.displayName).toBe('Hamburg')
    })

    it('should keep first two meaningful parts in display name', async () => {
      mockFetchSuccess([{ lat: '48.14', lon: '11.57', display_name: '80331, Altstadt-Lehel, München, Bayern, Deutschland' }])

      const result = await service.geocode('80331')
      expect(result!.displayName).toBe('80331, Altstadt-Lehel')
    })
  })

  describe('isZipCode()', () => {
    it('should identify 5-digit German PLZ codes', () => {
      expect(service.isZipCode('10115')).toBe(true)
      expect(service.isZipCode('80331')).toBe(true)
      expect(service.isZipCode('01067')).toBe(true)
    })

    it('should reject non-numeric strings', () => {
      expect(service.isZipCode('Berlin')).toBe(false)
      expect(service.isZipCode('abc12')).toBe(false)
    })

    it('should reject too-short codes', () => {
      expect(service.isZipCode('123')).toBe(false)
      expect(service.isZipCode('1234')).toBe(false)
    })

    it('should reject too-long codes', () => {
      expect(service.isZipCode('123456')).toBe(false)
      expect(service.isZipCode('10001-1234')).toBe(false)
    })
  })
})
