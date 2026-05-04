/**
 * Integration tests for the Missing Pet Workflow (MissingPetService)
 *
 * Tests the complete orchestrated flow:
 *   report missing → flyer generated → clinics notified → mark found → clinics notified
 *
 * Uses LocalStack DynamoDB + S3 for real data persistence and mocks
 * NotificationService for SNS delivery (side effect).
 *
 * Requirements: [FR-08], [FR-09], [FR-10], [NFR-USA-01]
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { PetRepository } from '../src/repositories/pet-repository'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { AWSClientFactory } from '../src/infrastructure/aws-client-factory'
import { CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import type { Clinic, Pet } from '../src/models/entities'

const TEST_TABLE = 'VetPetRegistry-MissingPet-Test'
const TEST_BUCKET = `paw-print-missing-pet-test-${Date.now()}`

// ── Mock NotificationService ─────────────────────────────────────────────────
// We mock the notification service to capture calls without requiring real SNS.

const mockSendMissingPetAlert = vi.fn().mockResolvedValue({
  success: true,
  messageId: 'mock-msg-missing',
  channel: 'sns' as const,
  recipientCount: 0,
  timestamp: new Date().toISOString(),
})

const mockSendPetFoundNotification = vi.fn().mockResolvedValue({
  success: true,
  messageId: 'mock-msg-found',
  channel: 'sns' as const,
  recipientCount: 0,
  timestamp: new Date().toISOString(),
})

vi.mock('../src/services/notification-service', () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    sendMissingPetAlert: mockSendMissingPetAlert,
    sendPetFoundNotification: mockSendPetFoundNotification,
    sendPetOnboardingConfirmation: vi.fn().mockResolvedValue({ success: true, recipientCount: 1, timestamp: new Date().toISOString(), channel: 'sns' }),
    sendAppointmentReminder: vi.fn().mockResolvedValue({ success: true, recipientCount: 1, timestamp: new Date().toISOString(), channel: 'sns' }),
  })),
}))

// Import MissingPetService after mocks are set up
const { MissingPetService } = await import('../src/services/missing-pet-service')

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let petRepo: PetRepository
let clinicRepo: ClinicRepository
let missingPetService: InstanceType<typeof MissingPetService>
let s3Client: S3Client
let sharedClinic: Clinic
let nearbyClinic1: Clinic
let nearbyClinic2: Clinic

beforeAll(async () => {
  // Suppress noisy logs during tests
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // Set env var so FlyerGenerationService uses the isolated test bucket
  process.env.PET_IMAGES_BUCKET = TEST_BUCKET

  // Initialize DynamoDB table
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })

  // Initialize S3 bucket
  const factory = new AWSClientFactory()
  s3Client = factory.createS3Client()
  await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))

  // Create repositories
  petRepo = new PetRepository(TEST_TABLE)
  clinicRepo = new ClinicRepository(TEST_TABLE)

  // Create the service under test
  missingPetService = new MissingPetService(TEST_TABLE)

  // Create a shared clinic (the pet's home clinic)
  sharedClinic = await clinicRepo.create({
    name: 'Home Vet Clinic',
    address: '100 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
    phone: '+12225551234',
    email: 'home@vetclinic.com',
    licenseNumber: `LIC-HOME-${Date.now()}`,
    latitude: 39.78,
    longitude: -89.65,
  })

  // Create nearby clinics (within 50km of the home clinic)
  nearbyClinic1 = await clinicRepo.create({
    name: 'Nearby Clinic 1',
    address: '200 Oak Ave',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62702',
    phone: '+12225552345',
    email: 'nearby1@vetclinic.com',
    licenseNumber: `LIC-NEAR1-${Date.now()}`,
    latitude: 39.79, // ~1km away
    longitude: -89.64,
  })

  nearbyClinic2 = await clinicRepo.create({
    name: 'Nearby Clinic 2',
    address: '300 Elm St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62703',
    phone: '+12225553456',
    email: 'nearby2@vetclinic.com',
    licenseNumber: `LIC-NEAR2-${Date.now()}`,
    latitude: 39.77, // ~1km away
    longitude: -89.66,
  })
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    // ignore cleanup errors
  }
  try {
    const listed = await s3Client.send(new ListObjectsV2Command({ Bucket: TEST_BUCKET }))
    if (listed.Contents && listed.Contents.length > 0) {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: TEST_BUCKET,
        Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key! })) },
      }))
    }
    await s3Client.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }))
  } catch (err) {
    // ignore cleanup errors
  }
  delete process.env.PET_IMAGES_BUCKET
  vi.restoreAllMocks()
}, 60_000)

// ── Helper: create a claimed pet ─────────────────────────────────────────────

async function createClaimedPet(ownerId: string = 'owner-missing-1'): Promise<Pet> {
  const profile = await petRepo.createMedicalProfile({
    name: 'TestPet',
    species: 'Dog',
    breed: 'Beagle',
    age: 4,
    clinicId: sharedClinic.clinicId,
    verifyingVetId: 'vet-1',
  })

  await petRepo.claimProfile(profile.petId, {
    claimingCode: profile.claimingCode,
    ownerName: 'Test Owner',
    ownerEmail: 'owner@test.com',
    ownerPhone: '+19998887777',
  }, ownerId)

  const pet = await petRepo.findById(profile.petId)
  return pet!
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('[FR-08][FR-09][FR-10] Missing Pet Workflow Integration', () => {

  // ── Complete end-to-end flow ──────────────────────────────────────────────

  describe('Complete flow: report missing → flyer generated → clinics notified → mark found', () => {
    let pet: Pet
    const ownerId = 'owner-e2e-1'

    beforeAll(async () => {
      pet = await createClaimedPet(ownerId)
      mockSendMissingPetAlert.mockClear()
      mockSendPetFoundNotification.mockClear()
    })

    it('step 1: reportMissing marks pet as missing and generates flyer', async () => {
      const result = await missingPetService.reportMissing(pet.petId, ownerId, {
        searchRadiusKm: 50,
        lastSeenLocation: 'Central Park',
        additionalNotes: 'Wearing blue collar',
        contactMethod: 'clinic',
      })

      // Verify result
      expect(result.petId).toBe(pet.petId)
      expect(result.isMissing).toBe(true)
      expect(result.flyerUrl).toBeTruthy()
      expect(typeof result.flyerUrl).toBe('string')
      expect(result.searchRadiusKm).toBe(50)
      expect(result.lastSeenLocation).toBe('Central Park')
      expect(result.notifiedClinics).toBeGreaterThanOrEqual(0)
      expect(result.notificationResult).toBeDefined()
      expect(result.notificationResult.success).toBe(true)
    }, 60_000)

    it('step 2: pet is marked as missing in the database', async () => {
      const updatedPet = await petRepo.findById(pet.petId)
      expect(updatedPet).not.toBeNull()
      expect(updatedPet!.isMissing).toBe(true)
    })

    it('step 3: NotificationService.sendMissingPetAlert was called with nearby clinics', () => {
      expect(mockSendMissingPetAlert).toHaveBeenCalledTimes(1)

      const callArgs = mockSendMissingPetAlert.mock.calls[0][0]
      expect(callArgs.pet.petId).toBe(pet.petId)
      expect(callArgs.searchRadiusKm).toBe(50)
      expect(callArgs.lastSeenLocation).toBe('Central Park')
      expect(Array.isArray(callArgs.nearbyClinics)).toBe(true)
      // Should include the home clinic and nearby clinics
      expect(callArgs.nearbyClinics.length).toBeGreaterThanOrEqual(1)
    })

    it('step 4: markAsFound updates pet status and notifies clinics', async () => {
      const result = await missingPetService.markAsFound(pet.petId, ownerId)

      expect(result.petId).toBe(pet.petId)
      expect(result.isMissing).toBe(false)
      expect(result.notifiedClinics).toBeGreaterThanOrEqual(0)
      expect(result.notificationResult).toBeDefined()
      expect(result.notificationResult.success).toBe(true)
    }, 60_000)

    it('step 5: pet is no longer missing in the database', async () => {
      const updatedPet = await petRepo.findById(pet.petId)
      expect(updatedPet).not.toBeNull()
      expect(updatedPet!.isMissing).toBe(false)
    })

    it('step 6: NotificationService.sendPetFoundNotification was called', () => {
      expect(mockSendPetFoundNotification).toHaveBeenCalledTimes(1)

      const callArgs = mockSendPetFoundNotification.mock.calls[0][0]
      expect(callArgs.pet.petId).toBe(pet.petId)
      expect(Array.isArray(callArgs.previouslyAlertedClinics)).toBe(true)
    })
  })

  // ── Flyer generation ─────────────────────────────────────────────────────

  describe('Flyer generation during reportMissing', () => {
    it('generates a flyer URL that is a valid string', async () => {
      const pet = await createClaimedPet('owner-flyer-1')

      const result = await missingPetService.reportMissing(pet.petId, 'owner-flyer-1', {
        searchRadiusKm: 25,
        lastSeenLocation: 'Dog Park',
        contactMethod: 'phone',
      })

      expect(result.flyerUrl).toBeTruthy()
      expect(typeof result.flyerUrl).toBe('string')
      // URL should contain the flyer path pattern
      expect(result.flyerUrl).toContain('flyers/')
    }, 60_000)

    it('generates flyer with each contact method', async () => {
      for (const contactMethod of ['phone', 'email', 'clinic'] as const) {
        const pet = await createClaimedPet(`owner-contact-${contactMethod}`)

        const result = await missingPetService.reportMissing(pet.petId, `owner-contact-${contactMethod}`, {
          searchRadiusKm: 10,
          lastSeenLocation: 'Neighborhood',
          contactMethod,
        })

        expect(result.flyerUrl).toBeTruthy()
        expect(result.isMissing).toBe(true)
      }
    }, 120_000)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  describe('Input validation', () => {
    it('rejects zero search radius', async () => {
      const pet = await createClaimedPet('owner-val-1')

      await expect(
        missingPetService.reportMissing(pet.petId, 'owner-val-1', {
          searchRadiusKm: 0,
          lastSeenLocation: 'Park',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 30_000)

    it('rejects negative search radius', async () => {
      const pet = await createClaimedPet('owner-val-2')

      await expect(
        missingPetService.reportMissing(pet.petId, 'owner-val-2', {
          searchRadiusKm: -10,
          lastSeenLocation: 'Park',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 30_000)

    it('rejects empty last seen location', async () => {
      const pet = await createClaimedPet('owner-val-3')

      await expect(
        missingPetService.reportMissing(pet.petId, 'owner-val-3', {
          searchRadiusKm: 10,
          lastSeenLocation: '',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 30_000)

    it('rejects whitespace-only last seen location', async () => {
      const pet = await createClaimedPet('owner-val-4')

      await expect(
        missingPetService.reportMissing(pet.petId, 'owner-val-4', {
          searchRadiusKm: 10,
          lastSeenLocation: '   ',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 30_000)

    it('rejects invalid contact method', async () => {
      const pet = await createClaimedPet('owner-val-5')

      await expect(
        missingPetService.reportMissing(pet.petId, 'owner-val-5', {
          searchRadiusKm: 10,
          lastSeenLocation: 'Park',
          contactMethod: 'invalid' as any,
        })
      ).rejects.toThrow()
    }, 30_000)

    it('rejects non-existent pet', async () => {
      await expect(
        missingPetService.reportMissing('non-existent-pet', 'owner-val-6', {
          searchRadiusKm: 10,
          lastSeenLocation: 'Park',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 30_000)
  })

  // ── Ownership checks ─────────────────────────────────────────────────────

  describe('Ownership enforcement', () => {
    it('rejects reportMissing from non-owner', async () => {
      const pet = await createClaimedPet('owner-own-1')

      await expect(
        missingPetService.reportMissing(pet.petId, 'wrong-owner', {
          searchRadiusKm: 10,
          lastSeenLocation: 'Park',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 30_000)

    it('rejects markAsFound from non-owner', async () => {
      const pet = await createClaimedPet('owner-own-2')

      // First mark as missing
      await missingPetService.reportMissing(pet.petId, 'owner-own-2', {
        searchRadiusKm: 10,
        lastSeenLocation: 'Park',
        contactMethod: 'clinic',
      })

      // Try to mark as found with wrong owner
      await expect(
        missingPetService.markAsFound(pet.petId, 'wrong-owner')
      ).rejects.toThrow()
    }, 60_000)

    it('rejects markAsFound for non-existent pet', async () => {
      await expect(
        missingPetService.markAsFound('non-existent-pet', 'owner-own-3')
      ).rejects.toThrow()
    }, 30_000)
  })

  // ── State transition guards ───────────────────────────────────────────────

  describe('State transition guards', () => {
    it('rejects reporting an already-missing pet', async () => {
      const pet = await createClaimedPet('owner-state-1')

      // Report missing first time
      await missingPetService.reportMissing(pet.petId, 'owner-state-1', {
        searchRadiusKm: 10,
        lastSeenLocation: 'Park',
        contactMethod: 'clinic',
      })

      // Try to report missing again
      await expect(
        missingPetService.reportMissing(pet.petId, 'owner-state-1', {
          searchRadiusKm: 10,
          lastSeenLocation: 'Different Park',
          contactMethod: 'clinic',
        })
      ).rejects.toThrow()
    }, 60_000)

    it('rejects marking a non-missing pet as found', async () => {
      const pet = await createClaimedPet('owner-state-2')

      // Pet is not missing, so markAsFound should fail
      await expect(
        missingPetService.markAsFound(pet.petId, 'owner-state-2')
      ).rejects.toThrow()
    }, 30_000)

    it('allows re-reporting after pet is found', async () => {
      const pet = await createClaimedPet('owner-state-3')

      // Report missing
      await missingPetService.reportMissing(pet.petId, 'owner-state-3', {
        searchRadiusKm: 10,
        lastSeenLocation: 'Park',
        contactMethod: 'clinic',
      })

      // Mark as found
      await missingPetService.markAsFound(pet.petId, 'owner-state-3')

      // Report missing again — should succeed
      const result = await missingPetService.reportMissing(pet.petId, 'owner-state-3', {
        searchRadiusKm: 20,
        lastSeenLocation: 'Different Park',
        contactMethod: 'email',
      })

      expect(result.isMissing).toBe(true)
      expect(result.flyerUrl).toBeTruthy()
    }, 120_000)
  })

  // ── Geographic clinic notification ────────────────────────────────────────

  describe('Geographic clinic notification via findNearby', () => {
    it('finds nearby clinics and passes them to NotificationService', async () => {
      mockSendMissingPetAlert.mockClear()

      const pet = await createClaimedPet('owner-geo-1')

      await missingPetService.reportMissing(pet.petId, 'owner-geo-1', {
        searchRadiusKm: 100, // Large radius to include all test clinics
        lastSeenLocation: 'Downtown',
        contactMethod: 'clinic',
      })

      expect(mockSendMissingPetAlert).toHaveBeenCalledTimes(1)
      const alertInput = mockSendMissingPetAlert.mock.calls[0][0]

      // Should have found the nearby clinics (home clinic + nearby1 + nearby2)
      expect(alertInput.nearbyClinics.length).toBeGreaterThanOrEqual(1)

      // Verify the clinic IDs include our test clinics
      const clinicIds = alertInput.nearbyClinics.map((c: Clinic) => c.clinicId)
      // At minimum, the home clinic should be in the results
      expect(clinicIds).toContain(sharedClinic.clinicId)
    }, 60_000)

    it('passes correct search parameters to notification', async () => {
      mockSendMissingPetAlert.mockClear()

      const pet = await createClaimedPet('owner-geo-2')

      await missingPetService.reportMissing(pet.petId, 'owner-geo-2', {
        searchRadiusKm: 25,
        lastSeenLocation: 'Near the river',
        contactMethod: 'phone',
      })

      const alertInput = mockSendMissingPetAlert.mock.calls[0][0]
      expect(alertInput.searchRadiusKm).toBe(25)
      expect(alertInput.lastSeenLocation).toBe('Near the river')
      expect(alertInput.pet.petId).toBe(pet.petId)
    }, 60_000)

    it('sends found notification to nearby clinics', async () => {
      mockSendMissingPetAlert.mockClear()
      mockSendPetFoundNotification.mockClear()

      const pet = await createClaimedPet('owner-geo-3')

      // Report missing
      await missingPetService.reportMissing(pet.petId, 'owner-geo-3', {
        searchRadiusKm: 100,
        lastSeenLocation: 'Park',
        contactMethod: 'clinic',
      })

      // Mark as found
      await missingPetService.markAsFound(pet.petId, 'owner-geo-3')

      expect(mockSendPetFoundNotification).toHaveBeenCalledTimes(1)
      const foundInput = mockSendPetFoundNotification.mock.calls[0][0]
      expect(foundInput.pet.petId).toBe(pet.petId)
      expect(Array.isArray(foundInput.previouslyAlertedClinics)).toBe(true)
      expect(foundInput.previouslyAlertedClinics.length).toBeGreaterThanOrEqual(1)
    }, 120_000)
  })
})
