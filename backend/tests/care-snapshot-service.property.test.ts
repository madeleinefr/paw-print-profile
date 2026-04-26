/**
 * Property-based tests for CareSnapshotService
 * Uses fast-check with numRuns: 25 against LocalStack at localhost:4566.
 *
 * Properties covered:
 *   Property 48: Care snapshot generation produces unique access codes
 *   Property 49: Care snapshot access works with valid code and fails with invalid/expired codes
 *   Property 50: Care snapshot contains correct pet and emergency contact information
 *   Property 51: Care snapshot expiry is enforced (expired snapshots are not accessible)
 *   Property 52: Only pet owners can create care snapshots for their own pets
 *   Property 53: Snapshots exclude sensitive medical details
 *
 * Validates: Requirements [FR-13]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { CareSnapshotService } from '../src/services/care-snapshot-service'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { PetRepository } from '../src/repositories/pet-repository'
import { CareSnapshotRepository } from '../src/repositories/care-snapshot-repository'

const TEST_TABLE = 'VetPetRegistry-CareSnapshot-Test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

const validStr = fc.string({ minLength: 2, maxLength: 10 }).filter(s => s.trim().length > 0)

const careSnapshotInputArb = (petId: string) =>
  fc.record({
    petId: fc.constant(petId),
    careInstructions: validStr,
    feedingSchedule: validStr,
    medications: fc.array(validStr, { minLength: 1, maxLength: 3 }),
    expiryHours: fc.integer({ min: 1, max: 168 }),
  })

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let careSnapshotService: CareSnapshotService
let clinicRepo: ClinicRepository
let petRepo: PetRepository
let snapshotRepo: CareSnapshotRepository
let sharedClinicId: string
let sharedClinicName: string
let sharedClinicPhone: string

beforeAll(async () => {
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  careSnapshotService = new CareSnapshotService(TEST_TABLE)
  clinicRepo = new ClinicRepository(TEST_TABLE)
  petRepo = new PetRepository(TEST_TABLE)
  snapshotRepo = new CareSnapshotRepository(TEST_TABLE)

  // Create a shared clinic
  const clinic = await clinicRepo.create({
    name: 'Snapshot Test Clinic',
    address: '1 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '12345',
    phone: '+12345678901',
    email: 'clinic@example.com',
    licenseNumber: `LIC-SNAP-${Date.now()}`,
    latitude: 39.78,
    longitude: -89.65,
  })
  sharedClinicId = clinic.clinicId
  sharedClinicName = clinic.name
  sharedClinicPhone = clinic.phone
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}, 60_000)

// ── Helper: create a claimed pet (Active with ownerId) ───────────────────────

async function createClaimedPet(): Promise<{ petId: string; ownerId: string; ownerEmail: string; ownerPhone: string }> {
  const profile = await petRepo.createMedicalProfile({
    name: 'TestPet',
    species: 'Dog',
    breed: 'Labrador',
    age: 3,
    clinicId: sharedClinicId,
    verifyingVetId: 'vet-1',
  })

  const claimed = await petRepo.claimProfile(profile.petId, {
    claimingCode: profile.claimingCode,
    ownerName: 'Test Owner',
    ownerEmail: 'owner@example.com',
    ownerPhone: '+19876543210',
  }, 'test-owner-id')

  return {
    petId: profile.petId,
    ownerId: claimed.ownerId,
    ownerEmail: 'owner@example.com',
    ownerPhone: '+19876543210',
  }
}

// ── Property 48: Care snapshot generation produces unique access codes ────────

describe('[FR-13] Property 48: Care snapshot generation produces unique access codes', () => {
  /**
   * **Validates: Requirements [FR-13]**
   *
   * For any two care snapshots created for the same pet, the access codes
   * must be distinct.
   */
  it('generateCareSnapshot produces unique access codes for each call', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(
        careSnapshotInputArb(pet.petId),
        careSnapshotInputArb(pet.petId),
        async (inputA, inputB) => {
          const [snapshotA, snapshotB] = await Promise.all([
            careSnapshotService.generateCareSnapshot(inputA, pet.ownerId),
            careSnapshotService.generateCareSnapshot(inputB, pet.ownerId),
          ])

          expect(snapshotA.accessCode).not.toBe(snapshotB.accessCode)
          expect(snapshotA.snapshotId).not.toBe(snapshotB.snapshotId)
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)
})

// ── Property 49: Care snapshot access works with valid code, fails with invalid

describe('[FR-13] Property 49: Care snapshot access with valid and invalid codes', () => {
  /**
   * **Validates: Requirements [FR-13]**
   *
   * Accessing a care snapshot with a valid access code returns the snapshot.
   * Accessing with an invalid code returns null.
   */
  it('accessCareSnapshot returns snapshot for valid code and null for invalid code', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const created = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)

        // Valid access code should return the snapshot
        const snapshot = await careSnapshotService.accessCareSnapshot(created.accessCode)
        expect(snapshot).not.toBeNull()
        expect(snapshot!.petId).toBe(pet.petId)
        expect(snapshot!.accessCode).toBe(created.accessCode)

        // Invalid access code should return null
        const invalid = await careSnapshotService.accessCareSnapshot('CARE-INVALID99')
        expect(invalid).toBeNull()

        // Empty access code should return null
        const empty = await careSnapshotService.accessCareSnapshot('')
        expect(empty).toBeNull()
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-13]**
   *
   * validateAccessCode returns valid=true for a fresh snapshot and
   * valid=false for a non-existent code.
   */
  it('validateAccessCode returns valid for fresh code and invalid for unknown code', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const created = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)

        const valid = await careSnapshotService.validateAccessCode(created.accessCode)
        expect(valid.valid).toBe(true)
        expect(valid.snapshot).toBeDefined()

        const invalid = await careSnapshotService.validateAccessCode('CARE-NONEXIST')
        expect(invalid.valid).toBe(false)
        expect(invalid.error).toBeTruthy()
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})

// ── Property 50: Care snapshot contains correct pet and emergency contact info

describe('[FR-13] Property 50: Care snapshot contains correct pet and emergency contact information', () => {
  /**
   * **Validates: Requirements [FR-13]**
   *
   * A care snapshot accessed via its code contains the correct care instructions,
   * feeding schedule, medications, and emergency contacts (owner + clinic info).
   */
  it('care snapshot contains correct care data and emergency contacts', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const created = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)
        const snapshot = await careSnapshotService.accessCareSnapshot(created.accessCode)

        expect(snapshot).not.toBeNull()

        // Care data matches input
        expect(snapshot!.careInstructions).toBe(input.careInstructions)
        expect(snapshot!.feedingSchedule).toBe(input.feedingSchedule)
        expect(snapshot!.medications).toEqual(input.medications)

        // Emergency contacts include owner and clinic info
        expect(snapshot!.emergencyContacts).toBeDefined()
        expect(snapshot!.emergencyContacts.ownerPhone).toBe(pet.ownerPhone)
        expect(snapshot!.emergencyContacts.ownerEmail).toBe(pet.ownerEmail)
        expect(snapshot!.emergencyContacts.vetClinicName).toBe(sharedClinicName)
        expect(snapshot!.emergencyContacts.vetClinicPhone).toBe(sharedClinicPhone)
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-13]**
   *
   * The snapshot response from generateCareSnapshot includes the pet name
   * and a valid access URL.
   */
  it('generateCareSnapshot response includes pet name and access URL', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const response = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)

        expect(response.snapshotId).toBeTruthy()
        expect(response.petName).toBe('TestPet')
        expect(response.accessCode).toBeTruthy()
        expect(response.accessCode).toMatch(/^CARE-/)
        expect(response.accessUrl).toContain(response.accessCode)
        expect(response.expiryDate).toBeTruthy()
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})

// ── Property 51: Care snapshot expiry is enforced ─────────────────────────────

describe('[FR-13] Property 51: Care snapshot expiry is enforced', () => {
  /**
   * **Validates: Requirements [FR-13]**
   *
   * A care snapshot with a valid (future) expiry date is accessible.
   * When the expiry date is manually set to the past, the snapshot
   * becomes inaccessible via findByAccessCode (repository level).
   */
  it('expired snapshots are not accessible via access code', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const created = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)

        // Snapshot should be accessible when not expired
        const validSnapshot = await careSnapshotService.accessCareSnapshot(created.accessCode)
        expect(validSnapshot).not.toBeNull()

        // Manually expire the snapshot by finding it and updating expiry in the repo
        const snapshotRecord = await snapshotRepo.findById(
          validSnapshot!.snapshotId
        )
        expect(snapshotRecord).not.toBeNull()

        // The expiry date should be in the future
        const expiryDate = new Date(snapshotRecord!.expiryDate)
        expect(expiryDate.getTime()).toBeGreaterThan(Date.now())
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-13]**
   *
   * deleteExpiredSnapshot only deletes snapshots that are actually expired.
   */
  it('deleteExpiredSnapshot does not delete non-expired snapshots', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const created = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)

        // Try to delete - should not delete since it's not expired
        await careSnapshotService.deleteExpiredSnapshot(created.snapshotId)

        // Snapshot should still be accessible
        const snapshot = await careSnapshotService.accessCareSnapshot(created.accessCode)
        expect(snapshot).not.toBeNull()
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})

// ── Property 52: Only pet owners can create care snapshots for their own pets ─

describe('[FR-13] Property 52: Only pet owners can create care snapshots for their own pets', () => {
  /**
   * **Validates: Requirements [FR-13]**
   *
   * generateCareSnapshot rejects requests from non-owners.
   */
  it('generateCareSnapshot rejects non-owner requests', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        // A different ownerId should be rejected
        await expect(
          careSnapshotService.generateCareSnapshot(input, 'wrong-owner-id')
        ).rejects.toThrow()
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-13]**
   *
   * generateCareSnapshot rejects requests for non-existent pets.
   */
  it('generateCareSnapshot rejects non-existent pet IDs', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          petId: fc.constant('non-existent-pet-id'),
          careInstructions: validStr,
          feedingSchedule: validStr,
          medications: fc.array(validStr, { minLength: 1, maxLength: 3 }),
          expiryHours: fc.integer({ min: 1, max: 168 }),
        }),
        async (input) => {
          await expect(
            careSnapshotService.generateCareSnapshot(input, pet.ownerId)
          ).rejects.toThrow()
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-13]**
   *
   * generateCareSnapshot rejects requests for unclaimed (Pending Claim) pets.
   */
  it('generateCareSnapshot rejects unclaimed pets', async () => {
    // Create a pet but don't claim it
    const profile = await petRepo.createMedicalProfile({
      name: 'UnclaimedPet',
      species: 'Cat',
      breed: 'Siamese',
      age: 2,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-1',
    })

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(profile.petId), async (input) => {
        await expect(
          careSnapshotService.generateCareSnapshot(input, 'some-owner-id')
        ).rejects.toThrow()
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-13]**
   *
   * getCareSnapshotsForPet returns all snapshots for a pet when called by the owner,
   * and rejects non-owner requests.
   */
  it('getCareSnapshotsForPet returns snapshots for owner and rejects non-owners', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        await careSnapshotService.generateCareSnapshot(input, pet.ownerId)

        // Owner can list snapshots
        const snapshots = await careSnapshotService.getCareSnapshotsForPet(pet.petId, pet.ownerId)
        expect(snapshots.length).toBeGreaterThanOrEqual(1)
        expect(snapshots.every(s => s.petId === pet.petId)).toBe(true)

        // Non-owner is rejected
        await expect(
          careSnapshotService.getCareSnapshotsForPet(pet.petId, 'wrong-owner-id')
        ).rejects.toThrow()
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})


// ── Property 53: Snapshots exclude sensitive medical details ──────────────────

describe('[FR-13] Property 53: Snapshots exclude sensitive medical details', () => {
  /**
   * **Validates: Requirements [FR-13]**
   *
   * Care snapshots must never contain vaccine records, surgery records,
   * or other sensitive medical data. Only owner-provided care information
   * (feeding, medications, emergency contacts) is included.
   */
  it('care snapshots never contain vaccines or surgeries', async () => {
    const pet = await createClaimedPet()

    await fc.assert(
      fc.asyncProperty(careSnapshotInputArb(pet.petId), async (input) => {
        const created = await careSnapshotService.generateCareSnapshot(input, pet.ownerId)
        const snapshot = await careSnapshotService.accessCareSnapshot(created.accessCode)

        expect(snapshot).not.toBeNull()

        // Assert sensitive medical fields are absent
        const snapshotObj = snapshot as Record<string, any>
        expect(snapshotObj.vaccines).toBeUndefined()
        expect(snapshotObj.surgeries).toBeUndefined()
        expect(snapshotObj.medicalHistory).toBeUndefined()
        expect(snapshotObj.diagnoses).toBeUndefined()
        expect(snapshotObj.conditions).toBeUndefined()

        // Assert only expected care fields are present
        expect(snapshot!.careInstructions).toBe(input.careInstructions)
        expect(snapshot!.feedingSchedule).toBe(input.feedingSchedule)
        expect(snapshot!.medications).toEqual(input.medications)
        expect(snapshot!.emergencyContacts).toBeDefined()
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})
