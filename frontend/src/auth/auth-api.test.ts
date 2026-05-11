/**
 * Unit tests for auth-api module.
 *
 * Tests the frontend auth API service that communicates with backend auth endpoints.
 * Uses fetch mocking to verify correct request formation and response handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { signUp, signIn, refreshTokens, getCurrentUser, signOut, AuthApiException } from './auth-api'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('auth-api', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('signUp', () => {
    it('sends correct request for pet owner sign-up', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: 'user-1', email: 'owner@test.com', userType: 'owner' }),
      })

      const result = await signUp({
        email: 'owner@test.com',
        password: 'Password123!',
        userType: 'owner',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/signup'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'owner@test.com',
            password: 'Password123!',
            userType: 'owner',
          }),
        })
      )
      expect(result.userId).toBe('user-1')
      expect(result.userType).toBe('owner')
    })

    it('sends clinicId for veterinarian sign-up', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: 'vet-1', email: 'vet@clinic.com', userType: 'vet', clinicId: 'clinic-abc' }),
      })

      const result = await signUp({
        email: 'vet@clinic.com',
        password: 'VetPass123!',
        userType: 'vet',
        clinicId: 'clinic-abc',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.clinicId).toBe('clinic-abc')
      expect(result.clinicId).toBe('clinic-abc')
    })

    it('throws AuthApiException on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'INVALID_INPUT', message: 'Email is required' } }),
      })

      await expect(signUp({ email: '', password: 'pass', userType: 'owner' }))
        .rejects.toThrow(AuthApiException)
    })
  })

  describe('signIn', () => {
    it('sends correct request and returns tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'access-token-123',
          idToken: 'id-token-456',
          refreshToken: 'refresh-token-789',
          expiresIn: 3600,
        }),
      })

      const result = await signIn('user@test.com', 'Password123!')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/signin'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@test.com', password: 'Password123!' }),
        })
      )
      expect(result.accessToken).toBe('access-token-123')
      expect(result.refreshToken).toBe('refresh-token-789')
      expect(result.expiresIn).toBe(3600)
    })

    it('throws AuthApiException on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }),
      })

      try {
        await signIn('user@test.com', 'wrong-password')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AuthApiException)
        expect((err as AuthApiException).statusCode).toBe(401)
        expect((err as AuthApiException).error.code).toBe('INVALID_CREDENTIALS')
      }
    })
  })

  describe('refreshTokens', () => {
    it('sends refresh token and returns new tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accessToken: 'new-access',
          idToken: 'new-id',
          refreshToken: 'same-refresh',
          expiresIn: 3600,
        }),
      })

      const result = await refreshTokens('my-refresh-token')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'my-refresh-token' }),
        })
      )
      expect(result.accessToken).toBe('new-access')
    })

    it('throws on expired refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'REFRESH_FAILED', message: 'Token refresh failed' } }),
      })

      await expect(refreshTokens('expired-token')).rejects.toThrow(AuthApiException)
    })
  })

  describe('getCurrentUser', () => {
    it('returns user info with valid access token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          userId: 'user-1',
          email: 'user@test.com',
          userType: 'owner',
        }),
      })

      const user = await getCurrentUser('valid-access-token')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-access-token',
          }),
        })
      )
      expect(user).not.toBeNull()
      expect(user!.userId).toBe('user-1')
      expect(user!.userType).toBe('owner')
    })

    it('returns null on invalid token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } }),
      })

      const user = await getCurrentUser('invalid-token')
      expect(user).toBeNull()
    })

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const user = await getCurrentUser('some-token')
      expect(user).toBeNull()
    })
  })

  describe('signOut', () => {
    it('sends sign-out request with access token', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      await signOut('my-access-token')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/signout'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer my-access-token',
          }),
        })
      )
    })

    it('does not throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      // Should not throw
      await expect(signOut('token')).resolves.toBeUndefined()
    })
  })
})
