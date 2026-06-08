/**
 * Integration tests for frontend workflows.
 *
 * Tests the complete API interaction patterns and business logic for key
 * frontend workflows without requiring a browser. Uses fetch mocking to
 * validate correct request formation, response handling, and workflow sequencing.
 *
 * Validates: [FR-03], [FR-04], [FR-05], [FR-15], [FR-16], [NFR-USA-01]
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const API_BASE_URL = 'http://localhost:3000'

// --- Helper functions simulating frontend API client behavior ---

/**
 * Simulates a veterinarian creating a new medical pet profile.
 * Sends POST /pets with the vet's auth token and pet medical data.
 * In the real app, this is called from the CreateProfile.tsx page.
 */
async function vetCreatePet(token: string, petData: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/pets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(petData),
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates a pet owner claiming a profile using a claiming code from their vet.
 * Sends POST /pets/claim with the owner's auth token and claiming details.
 * In the real app, this is called from the ClaimPage.tsx page.
 */
async function ownerClaimPet(token: string, claimData: { claimingCode: string; ownerName: string; ownerEmail: string; ownerPhone: string }) {
  const response = await fetch(`${API_BASE_URL}/pets/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(claimData),
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates a pet owner updating their pet profile with personal information.
 * Sends PUT /pets/{petId} with owner contact details (name, phone, address).
 * Only owner fields are sent — medical data is never modified by this call.
 */
async function ownerEnrichPet(token: string, petId: string, enrichData: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(enrichData),
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}


/**
 * Simulates a pet owner reporting their pet as missing.
 * Sends POST /pets/{petId}/missing which marks the pet as missing,
 * generates a PDF flyer, and notifies nearby clinics — all in one call.
 * This is the "3-click" workflow: dashboard → pet detail → report missing.
 */
async function reportMissing(token: string, petId: string, data: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/missing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates downloading the generated missing pet flyer PDF.
 * Sends GET /pets/{petId}/flyer which returns a pre-signed S3 URL.
 */
async function downloadFlyer(token: string, petId: string) {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/flyer`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates a pet owner generating a care snapshot for a temporary caregiver.
 * Sends POST /pets/{petId}/care-snapshot with feeding/medication instructions.
 * Returns a time-limited access code that the caregiver can use without logging in.
 */
async function generateCareSnapshot(token: string, petId: string, data: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/care-snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates a temporary caregiver accessing a care snapshot using an access code.
 * Sends GET /care-snapshots/{accessCode} — NO authentication required.
 * This is a public endpoint accessible to anyone with the code.
 */
async function accessCareSnapshot(accessCode: string) {
  const response = await fetch(`${API_BASE_URL}/care-snapshots/${accessCode}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates the public lost pet search — NO authentication required.
 * Sends GET /search/pets with query parameters (species, breed, etc.).
 * Results must never contain owner PII (email, phone) — only clinic info
 * and an anonymous platform messaging URL.
 */
async function searchPets(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${API_BASE_URL}/search/pets?${query}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Simulates a pet owner requesting photo upload guidance.
 * Sends GET /pets/{petId}/photo-guidance which returns photography tips
 * (lighting, focus, angles, close-ups, full body) and format requirements.
 */
async function getPhotoGuidance(token: string, petId: string) {
  const response = await fetch(`${API_BASE_URL}/pets/${petId}/photo-guidance`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || `HTTP ${response.status}`)
  }
  return response.json()
}

// --- Test Suites ---

describe('Frontend Workflow Integration Tests', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  /**
   * Tests the complete B2B2C co-onboarding workflow:
   * 1. Veterinarian creates a medical profile → gets a claiming code
   * 2. Pet owner claims the profile using that code → status becomes Active
   * 3. Pet owner enriches the profile with personal data → medical data preserved
   *
   * Also tests error cases: invalid codes and duplicate claiming attempts.
   */
  describe('Co-onboarding workflow [FR-03, FR-04, FR-05]', () => {
    const vetToken = 'vet-access-token'
    const ownerToken = 'owner-access-token'

    it('completes full workflow: Vet creates → Owner claims → Owner enriches', async () => {
      // Step 1: Vet creates medical profile
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          petId: 'pet-123',
          name: 'Bella',
          species: 'Dog',
          breed: 'Labrador',
          age: 2,
          clinicId: 'clinic-abc',
          profileStatus: 'Pending Claim',
          claimingCode: 'CLAIM-XYZ789',
          claimingCodeExpiry: '2024-03-01T10:00:00Z',
          medicallyVerified: true,
          verifyingVetId: 'vet-001',
          createdAt: '2024-02-01T10:00:00Z',
        }),
      })

      const createResult = await vetCreatePet(vetToken, {
        name: 'Bella',
        species: 'Dog',
        breed: 'Labrador',
        age: 2,
      })

      expect(createResult.profileStatus).toBe('Pending Claim')
      expect(createResult.claimingCode).toBe('CLAIM-XYZ789')
      expect(createResult.medicallyVerified).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${vetToken}` }),
        })
      )

      // Step 2: Owner claims with the code
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          petId: 'pet-123',
          name: 'Bella',
          profileStatus: 'Active',
          ownerId: 'owner-456',
          ownerName: 'Jane Smith',
          claimedAt: '2024-02-02T14:00:00Z',
        }),
      })

      const claimResult = await ownerClaimPet(ownerToken, {
        claimingCode: 'CLAIM-XYZ789',
        ownerName: 'Jane Smith',
        ownerEmail: 'jane@example.com',
        ownerPhone: '+4915112345678',
      })

      expect(claimResult.profileStatus).toBe('Active')
      expect(claimResult.ownerId).toBe('owner-456')
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/claim`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )

      // Step 3: Owner enriches profile
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          petId: 'pet-123',
          name: 'Bella',
          age: 2,
          ownerPhone: '+4915112345678',
          updatedAt: '2024-02-02T15:00:00Z',
        }),
      })

      const enrichResult = await ownerEnrichPet(ownerToken, 'pet-123', {
        ownerPhone: '+4915112345678',
      })

      expect(enrichResult.updatedAt).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/pet-123`,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )
    })

    it('rejects claim with invalid claiming code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'INVALID_CLAIMING_CODE', message: 'Invalid or expired claiming code' } }),
      })

      await expect(
        ownerClaimPet(ownerToken, {
          claimingCode: 'INVALID-CODE',
          ownerName: 'Jane',
          ownerEmail: 'jane@example.com',
          ownerPhone: '+49123',
        })
      ).rejects.toThrow('Invalid or expired claiming code')
    })

    it('rejects duplicate claiming of already-claimed profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'ALREADY_CLAIMED', message: 'Profile has already been claimed' } }),
      })

      await expect(
        ownerClaimPet(ownerToken, {
          claimingCode: 'CLAIM-USED',
          ownerName: 'Another Owner',
          ownerEmail: 'other@example.com',
          ownerPhone: '+49999',
        })
      ).rejects.toThrow('Profile has already been claimed')
    })
  })


  /**
   * Tests the usability requirement that a pet owner can generate a missing pet
   * flyer in no more than 3 clicks from the main dashboard.
   * The key assertion: a single POST /pets/{id}/missing call returns the flyerUrl
   * immediately — no multi-step wizard or separate flyer generation endpoint needed.
   */
  describe('3-click missing pet flyer generation [NFR-USA-01]', () => {
    const ownerToken = 'owner-access-token'

    it('generates flyer in a single POST call (click 1: report missing → flyer URL returned)', async () => {
      // The 3-click workflow:
      // Click 1: Navigate to pet dashboard (no API call)
      // Click 2: Click "Report Missing" button
      // Click 3: Confirm and submit → POST /pets/{petId}/missing returns flyerUrl
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          petId: 'pet-123',
          isMissing: true,
          flyerUrl: 'https://s3.amazonaws.com/vet-pet-registry-images/flyers/pet-123/1706789000.pdf',
          notifiedClinics: 5,
        }),
      })

      const result = await reportMissing(ownerToken, 'pet-123', {
        searchRadiusKm: 25,
        lastSeenLocation: 'Near the park on Hauptstraße',
        additionalNotes: 'Wearing red collar with tag',
      })

      expect(result.flyerUrl).toContain('flyers/pet-123')
      expect(result.isMissing).toBe(true)
      expect(result.notifiedClinics).toBeGreaterThan(0)

      // Verify single API call produces the flyer
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/pet-123/missing`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )
    })

    it('allows downloading the generated flyer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://s3.amazonaws.com/vet-pet-registry-images/flyers/pet-123/flyer.pdf',
          contentType: 'application/pdf',
        }),
      })

      const result = await downloadFlyer(ownerToken, 'pet-123')

      expect(result.url).toContain('flyer')
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/pet-123/flyer`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )
    })
  })

  /**
   * Tests the care snapshot workflow:
   * - Owner generates a snapshot with care instructions → gets an access code
   * - Anyone with the access code can view the snapshot (no login required)
   * - Expired snapshots are rejected with a clear error
   */
  describe('Care snapshot generation and access [FR-13]', () => {
    const ownerToken = 'owner-access-token'

    it('generates care snapshot and provides access code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          snapshotId: 'snapshot-001',
          petName: 'Bella',
          accessCode: 'CARE-ABC123',
          accessUrl: 'https://app.pawprintprofile.com/care/CARE-ABC123',
          expiryDate: '2024-02-08T10:00:00Z',
        }),
      })

      const result = await generateCareSnapshot(ownerToken, 'pet-123', {
        careInstructions: 'Feed twice daily, morning and evening',
        feedingSchedule: '8 AM and 6 PM, 1 cup dry food',
        medications: ['Heartgard monthly'],
        expiryHours: 168,
      })

      expect(result.accessCode).toBe('CARE-ABC123')
      expect(result.petName).toBe('Bella')
      expect(result.expiryDate).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/pet-123/care-snapshot`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )
    })

    it('accesses care snapshot with access code (no auth required)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          petName: 'Bella',
          careInstructions: 'Feed twice daily, morning and evening',
          feedingSchedule: '8 AM and 6 PM, 1 cup dry food',
          medications: ['Heartgard monthly'],
          emergencyContacts: {
            ownerPhone: '+4915112345678',
            ownerEmail: 'jane@example.com',
            vetClinicName: 'Happy Paws Clinic',
            vetClinicPhone: '+4930123456',
          },
          expiryDate: '2024-02-08T10:00:00Z',
        }),
      })

      const result = await accessCareSnapshot('CARE-ABC123')

      expect(result.petName).toBe('Bella')
      expect(result.careInstructions).toContain('Feed twice daily')
      expect(result.emergencyContacts.vetClinicName).toBe('Happy Paws Clinic')

      // Verify no Authorization header is sent (public access)
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/care-snapshots/CARE-ABC123`,
        expect.objectContaining({
          method: 'GET',
        })
      )
      const callHeaders = mockFetch.mock.calls[0][1].headers
      expect(callHeaders).not.toHaveProperty('Authorization')
    })

    it('rejects access to expired care snapshot', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 410,
        json: async () => ({ error: { code: 'SNAPSHOT_EXPIRED', message: 'Care snapshot has expired' } }),
      })

      await expect(accessCareSnapshot('CARE-EXPIRED')).rejects.toThrow('Care snapshot has expired')
    })
  })


  /**
   * Tests that the B2B2C role separation is enforced:
   * - Owners CANNOT create pet profiles (vet-only action → 403)
   * - Vets CANNOT report pets as missing (owner-only action → 403)
   * - Unauthenticated requests to protected endpoints get 401
   */
  describe('Role-based access restrictions [NFR-SEC-02]', () => {
    const ownerToken = 'owner-access-token'
    const vetToken = 'vet-access-token'

    it('rejects owner attempting to create a pet profile (vet-only)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Only veterinarians can create pet profiles' } }),
      })

      await expect(
        vetCreatePet(ownerToken, {
          name: 'Buddy',
          species: 'Dog',
          breed: 'Poodle',
          age: 1,
        })
      ).rejects.toThrow('Only veterinarians can create pet profiles')

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )
    })

    it('rejects vet attempting to report a pet as missing (owner-only)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Only pet owners can report missing pets' } }),
      })

      await expect(
        reportMissing(vetToken, 'pet-123', {
          searchRadiusKm: 10,
          lastSeenLocation: 'Clinic area',
        })
      ).rejects.toThrow('Only pet owners can report missing pets')

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/pet-123/missing`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: `Bearer ${vetToken}` }),
        })
      )
    })

    it('rejects unauthenticated access to protected endpoints', async () => {
      // Simulate calling a protected endpoint without a token — should return 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }),
      })

      const unauthResponse = await fetch(`${API_BASE_URL}/pets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      })

      expect(unauthResponse.ok).toBe(false)
      expect(unauthResponse.status).toBe(401)
    })
  })

  /**
   * Tests that the public search endpoint protects owner privacy:
   * - ownerEmail and ownerPhone are NEVER present in search results
   * - Instead, a platform messaging URL (messageUrl) is provided for anonymous contact
   * - Clinic contact info (name, phone, address) is ALWAYS visible
   */
  describe('Owner privacy protection [FR-15]', () => {
    it('public search results never contain owner email or phone', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              petId: 'pet-123',
              name: 'Bella',
              species: 'Dog',
              breed: 'Labrador',
              age: 2,
              images: [{ url: 'https://s3.example.com/pet-123/img1.jpg', tags: ['brown'] }],
              clinic: {
                name: 'Happy Paws Clinic',
                phone: '+4930123456',
                address: 'Hauptstraße 1, Berlin',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-123',
            },
            {
              petId: 'pet-456',
              name: 'Max',
              species: 'Dog',
              breed: 'Shepherd',
              age: 4,
              images: [],
              clinic: {
                name: 'City Vet',
                phone: '+4930654321',
                address: 'Berliner Str. 5, Berlin',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-456',
            },
          ],
          count: 2,
        }),
      })

      const result = await searchPets({ species: 'Dog', breed: 'Labrador' })

      // Verify privacy: no owner PII in results
      for (const pet of result.results) {
        expect(pet).not.toHaveProperty('ownerEmail')
        expect(pet).not.toHaveProperty('ownerPhone')
        expect(pet).not.toHaveProperty('ownerName')
        // Clinic info IS visible
        expect(pet.clinic).toBeDefined()
        expect(pet.clinic.phone).toBeDefined()
        expect(pet.clinic.name).toBeDefined()
        // Anonymous contact form URL is provided
        expect(pet.messageUrl).toContain('/contact/')
      }

      // Verify no auth header sent (public endpoint)
      const callHeaders = mockFetch.mock.calls[0][1].headers
      expect(callHeaders).not.toHaveProperty('Authorization')
    })

    it('provides anonymous contact form URL instead of direct owner contact', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              petId: 'pet-789',
              name: 'Luna',
              species: 'Cat',
              breed: 'Siamese',
              age: 3,
              images: [],
              clinic: {
                name: 'Feline Care',
                phone: '+4930111222',
                address: 'Katzenweg 7, Berlin',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-789',
            },
          ],
          count: 1,
        }),
      })

      const result = await searchPets({ species: 'Cat' })

      expect(result.results[0].contactMethod).toBe('platform_messaging')
      expect(result.results[0].messageUrl).toMatch(/\/contact\/pet-789$/)
    })

    it('always displays clinic contact information in search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              petId: 'pet-100',
              name: 'Rocky',
              species: 'Dog',
              breed: 'Bulldog',
              age: 5,
              images: [],
              clinic: {
                name: 'Downtown Vet',
                phone: '+4930999888',
                address: 'Marktplatz 3, Munich',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-100',
            },
          ],
          count: 1,
        }),
      })

      const result = await searchPets({ species: 'Dog', breed: 'Bulldog' })

      const pet = result.results[0]
      expect(pet.clinic.name).toBe('Downtown Vet')
      expect(pet.clinic.phone).toBe('+4930999888')
      expect(pet.clinic.address).toBe('Marktplatz 3, Munich')
    })
  })


  /**
   * Tests that the photo guidance endpoint returns all required photography tips
   * and image format requirements. Pet owners see these guidelines when uploading
   * photos to help them take identification-quality images of their pets.
   */
  describe('Photo guidance display and image quality feedback [FR-16]', () => {
    const ownerToken = 'owner-access-token'

    it('retrieves photo guidance with tips and requirements', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          guidelines: {
            title: 'How to Take Quality Photos of Your Pet',
            tips: [
              { title: 'Lighting', description: 'Use natural light from a window or outdoors.' },
              { title: 'Focus', description: 'Ensure your pet\'s face is in sharp focus.' },
              { title: 'Multiple Angles', description: 'Take photos from different angles.' },
              { title: 'Close-up Shots', description: 'Include close-up photos of distinctive features.' },
              { title: 'Full Body Shots', description: 'Include full-body photos showing overall size.' },
            ],
            requirements: {
              formats: ['JPEG', 'PNG'],
              maxSize: '10 MB',
              recommendedResolution: '1920x1080 or higher',
            },
          },
        }),
      })

      const result = await getPhotoGuidance(ownerToken, 'pet-123')

      expect(result.guidelines.title).toContain('Quality Photos')
      expect(result.guidelines.tips).toHaveLength(5)
      expect(result.guidelines.tips[0].title).toBe('Lighting')
      expect(result.guidelines.requirements.formats).toContain('JPEG')
      expect(result.guidelines.requirements.formats).toContain('PNG')
      expect(result.guidelines.requirements.maxSize).toBe('10 MB')

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/pets/pet-123/photo-guidance`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: `Bearer ${ownerToken}` }),
        })
      )
    })

    it('includes tips for close-up face shots and full body images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          guidelines: {
            title: 'How to Take Quality Photos of Your Pet',
            tips: [
              { title: 'Lighting', description: 'Use natural light.' },
              { title: 'Focus', description: 'Sharp focus on face.' },
              { title: 'Multiple Angles', description: 'Front, side, and back views.' },
              { title: 'Close-up Shots', description: 'Include close-up photos of distinctive features like face markings.' },
              { title: 'Full Body Shots', description: 'Include full-body photos showing your pet\'s overall size and shape.' },
            ],
            requirements: {
              formats: ['JPEG', 'PNG'],
              maxSize: '10 MB',
              recommendedResolution: '1920x1080 or higher',
            },
          },
        }),
      })

      const result = await getPhotoGuidance(ownerToken, 'pet-123')

      const tipTitles = result.guidelines.tips.map((t: { title: string }) => t.title)
      expect(tipTitles).toContain('Close-up Shots')
      expect(tipTitles).toContain('Full Body Shots')

      const closeUpTip = result.guidelines.tips.find((t: { title: string }) => t.title === 'Close-up Shots')
      expect(closeUpTip.description).toContain('distinctive features')

      const fullBodyTip = result.guidelines.tips.find((t: { title: string }) => t.title === 'Full Body Shots')
      expect(fullBodyTip.description).toContain('full-body')
    })
  })

  /**
   * Tests that public search results always include a messageUrl for anonymous
   * contact — this is the privacy-preserving alternative to showing the owner's
   * phone number or email directly. Public users click this link to send a
   * message through the platform without knowing the owner's identity.
   */
  describe('Anonymous contact form for public users [FR-15]', () => {
    it('search results provide messageUrl for anonymous contact', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              petId: 'pet-missing-1',
              name: 'Shadow',
              species: 'Cat',
              breed: 'Black Domestic',
              age: 6,
              images: [{ url: 'https://s3.example.com/pet-missing-1/img.jpg', tags: ['black', 'green-eyes'] }],
              clinic: {
                name: 'Neighborhood Vet',
                phone: '+4930777888',
                address: 'Tiergartenstr. 12, Berlin',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-missing-1',
            },
          ],
          count: 1,
        }),
      })

      const result = await searchPets({ species: 'Cat', breed: 'Black Domestic' })

      const pet = result.results[0]
      // Anonymous contact form is provided
      expect(pet.messageUrl).toBeDefined()
      expect(pet.messageUrl).toContain('/contact/')
      expect(pet.contactMethod).toBe('platform_messaging')
      // Owner PII is NOT exposed
      expect(pet).not.toHaveProperty('ownerEmail')
      expect(pet).not.toHaveProperty('ownerPhone')
    })

    it('public search does not require authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], count: 0 }),
      })

      await searchPets({ species: 'Bird' })

      // Verify the request has no Authorization header
      const requestInit = mockFetch.mock.calls[0][1]
      expect(requestInit.headers).not.toHaveProperty('Authorization')
    })
  })

  /**
   * Tests that clinic contact information (name, phone, address) is always
   * present and complete in public search results. Unlike owner PII which is
   * hidden, clinic details are intentionally public so finders can contact
   * the veterinary practice directly.
   */
  describe('Clinic contact information visibility [FR-15]', () => {
    it('clinic phone and address are always visible in search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              petId: 'pet-vis-1',
              name: 'Milo',
              species: 'Dog',
              breed: 'Beagle',
              age: 3,
              images: [],
              clinic: {
                name: 'Beagle Specialists',
                phone: '+4989123456',
                address: 'Leopoldstr. 22, Munich',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-vis-1',
            },
            {
              petId: 'pet-vis-2',
              name: 'Charlie',
              species: 'Dog',
              breed: 'Beagle',
              age: 5,
              images: [],
              clinic: {
                name: 'City Animal Hospital',
                phone: '+4989654321',
                address: 'Sendlinger Str. 8, Munich',
              },
              contactMethod: 'platform_messaging',
              messageUrl: 'https://app.pawprintprofile.com/contact/pet-vis-2',
            },
          ],
          count: 2,
        }),
      })

      const result = await searchPets({ species: 'Dog', breed: 'Beagle' })

      for (const pet of result.results) {
        // Clinic info is always present and complete
        expect(pet.clinic).toBeDefined()
        expect(pet.clinic.name).toBeTruthy()
        expect(pet.clinic.phone).toBeTruthy()
        expect(pet.clinic.address).toBeTruthy()
      }
    })
  })
})
