/**
 * Unit tests for token-storage module.
 *
 * Tests secure storage of JWT tokens and role information in localStorage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  storeTokens,
  getStoredAuth,
  getAccessToken,
  getRefreshToken,
  isTokenExpired,
  updateTokens,
  clearStoredAuth,
} from './token-storage'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('token-storage', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('storeTokens', () => {
    it('stores all token data for a pet owner', () => {
      storeTokens({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        idToken: 'id-789',
        expiresIn: 3600,
        userType: 'owner',
        userId: 'user-001',
        email: 'owner@example.com',
      })

      expect(localStorageMock.getItem('pawprint_access_token')).toBe('access-123')
      expect(localStorageMock.getItem('pawprint_refresh_token')).toBe('refresh-456')
      expect(localStorageMock.getItem('pawprint_id_token')).toBe('id-789')
      expect(localStorageMock.getItem('pawprint_user_type')).toBe('owner')
      expect(localStorageMock.getItem('pawprint_user_id')).toBe('user-001')
      expect(localStorageMock.getItem('pawprint_email')).toBe('owner@example.com')
      expect(localStorageMock.getItem('pawprint_clinic_id')).toBeNull()
    })

    it('stores clinic ID for veterinarians', () => {
      storeTokens({
        accessToken: 'access-vet',
        refreshToken: 'refresh-vet',
        idToken: 'id-vet',
        expiresIn: 3600,
        userType: 'vet',
        userId: 'vet-001',
        email: 'vet@clinic.com',
        clinicId: 'clinic-123',
      })

      expect(localStorageMock.getItem('pawprint_user_type')).toBe('vet')
      expect(localStorageMock.getItem('pawprint_clinic_id')).toBe('clinic-123')
    })

    it('sets expiry time based on expiresIn', () => {
      const before = Date.now()
      storeTokens({
        accessToken: 'a',
        refreshToken: 'r',
        idToken: 'i',
        expiresIn: 3600,
        userType: 'owner',
        userId: 'u',
        email: 'e@e.com',
      })
      const after = Date.now()

      const expiresAt = Number(localStorageMock.getItem('pawprint_expires_at'))
      expect(expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
      expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000)
    })
  })

  describe('getStoredAuth', () => {
    it('returns null when no tokens are stored', () => {
      expect(getStoredAuth()).toBeNull()
    })

    it('returns stored auth data when all fields are present', () => {
      storeTokens({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        idToken: 'id-789',
        expiresIn: 3600,
        userType: 'vet',
        userId: 'vet-001',
        email: 'vet@clinic.com',
        clinicId: 'clinic-abc',
      })

      const stored = getStoredAuth()
      expect(stored).not.toBeNull()
      expect(stored!.accessToken).toBe('access-123')
      expect(stored!.refreshToken).toBe('refresh-456')
      expect(stored!.userType).toBe('vet')
      expect(stored!.userId).toBe('vet-001')
      expect(stored!.email).toBe('vet@clinic.com')
      expect(stored!.clinicId).toBe('clinic-abc')
    })

    it('returns null when partial data is stored', () => {
      localStorageMock.setItem('pawprint_access_token', 'token')
      // Missing other required fields
      expect(getStoredAuth()).toBeNull()
    })
  })

  describe('getAccessToken / getRefreshToken', () => {
    it('returns null when no token is stored', () => {
      expect(getAccessToken()).toBeNull()
      expect(getRefreshToken()).toBeNull()
    })

    it('returns the stored tokens', () => {
      storeTokens({
        accessToken: 'my-access',
        refreshToken: 'my-refresh',
        idToken: 'my-id',
        expiresIn: 3600,
        userType: 'owner',
        userId: 'u',
        email: 'e@e.com',
      })

      expect(getAccessToken()).toBe('my-access')
      expect(getRefreshToken()).toBe('my-refresh')
    })
  })

  describe('isTokenExpired', () => {
    it('returns true when no expiry is stored', () => {
      expect(isTokenExpired()).toBe(true)
    })

    it('returns false when token is not expired', () => {
      storeTokens({
        accessToken: 'a',
        refreshToken: 'r',
        idToken: 'i',
        expiresIn: 3600, // 1 hour from now
        userType: 'owner',
        userId: 'u',
        email: 'e@e.com',
      })

      expect(isTokenExpired()).toBe(false)
    })

    it('returns true when token is within 60 seconds of expiry', () => {
      // Set expiry to 30 seconds from now (within the 60s buffer)
      const expiresAt = Date.now() + 30_000
      localStorageMock.setItem('pawprint_expires_at', String(expiresAt))

      expect(isTokenExpired()).toBe(true)
    })

    it('returns true when token is already expired', () => {
      const expiresAt = Date.now() - 1000
      localStorageMock.setItem('pawprint_expires_at', String(expiresAt))

      expect(isTokenExpired()).toBe(true)
    })
  })

  describe('updateTokens', () => {
    it('updates access and id tokens without changing user info', () => {
      storeTokens({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        idToken: 'old-id',
        expiresIn: 3600,
        userType: 'vet',
        userId: 'vet-001',
        email: 'vet@clinic.com',
        clinicId: 'clinic-123',
      })

      updateTokens({
        accessToken: 'new-access',
        idToken: 'new-id',
        refreshToken: 'new-refresh',
        expiresIn: 7200,
      })

      expect(localStorageMock.getItem('pawprint_access_token')).toBe('new-access')
      expect(localStorageMock.getItem('pawprint_id_token')).toBe('new-id')
      expect(localStorageMock.getItem('pawprint_refresh_token')).toBe('new-refresh')
      // User info should remain unchanged
      expect(localStorageMock.getItem('pawprint_user_type')).toBe('vet')
      expect(localStorageMock.getItem('pawprint_user_id')).toBe('vet-001')
      expect(localStorageMock.getItem('pawprint_clinic_id')).toBe('clinic-123')
    })
  })

  describe('clearStoredAuth', () => {
    it('removes all auth data from localStorage', () => {
      storeTokens({
        accessToken: 'a',
        refreshToken: 'r',
        idToken: 'i',
        expiresIn: 3600,
        userType: 'vet',
        userId: 'u',
        email: 'e@e.com',
        clinicId: 'c',
      })

      clearStoredAuth()

      expect(getStoredAuth()).toBeNull()
      expect(getAccessToken()).toBeNull()
      expect(getRefreshToken()).toBeNull()
    })
  })
})
