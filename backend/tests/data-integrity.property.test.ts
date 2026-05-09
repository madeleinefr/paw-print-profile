/**
 * Property-based tests for transactional data integrity against LocalStack.
 * Uses fast-check with numRuns: 100.
 *
 * Properties covered:
 *   Property 25: Durability before confirmation — data is persisted before success response
 *   Property 26: Concurrent update safety — simultaneous updates don't corrupt data
 *   Property 27: Transaction rollback — failed multi-step operations leave no partial state
 *   Property 28: Referential integrity — clinic deletion rejected with pets, pet deletion cascades
 *
 * Validates: Requirements [NFR-REL-03], [NFR-REL-04]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { PetCoOnboardingService } from '../src/services/pet-co-onboarding-service'
import { ProfileClaimingService } from '../src/services/profile-claiming-service'
import { ClinicService } from '../src/services/clinic-service'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { PetRepository } from '../src/repositories/pet-repository'
import { ValidationException } from '../src/validation/validators'

const TEST_TABLE = 'VetPetRegistry-DataIntegrity-Test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

const shortStr = fc.string({ minLength: 2, maxLength: 20 }).filter(s => s.trim().length > 0)

const medicalProfileArb = (clinicId: string) =>
  fc.record({
    name: shortStr,
    species: shortStr,
    breed: shortStr,
    age: fc.integer({ min: 0, max: 30 }),
    clinicId: fc.constant(clinicId),
    verifyingVetId: shortStr,
  })

const ownerInfoArb = fc.record({
  ownerName: shortStr,
  ownerEmail: fc.constant('owner@example.com'),
  ownerPhone: fc.constant('+12345678901'),
})

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let coOnboardingService: PetCoOnboardingService
let claimingService: ProfileClaimingService
let clinicService: ClinicService
let clinicRepo: ClinicRepository
let petRepo: PetRepository
let sharedClinicId: string

beforeAll(async () => {
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  coOnboardingService = new PetCoOnboardingService(TEST_TABLE)
  claimingService = new ProfileClaimingService(TEST_TABLE)
  clinicService = new ClinicService(TEST_TABLE)
  clinicRepo = new ClinicRepository(TEST_TABLE)
  petRepo = new PetRepository(TEST_TABLE)

  // Create a shared clinic for tests
  const clinic = await clinicRepo.create({
    name: 'Integrity Test Clinic',
    address: '1 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '12345',
    phone: '+12345678901',
    email: 'integrity@example.com',
    licenseNumber: `LIC-INTEGRITY-${Date.now()}`,
    latitude: 39.78,
    longitude: -89.65,
  })
  sharedClinicId = clinic.clinicId
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}, 60_000)

// ── Property 25: Durability before confirmation ──────────────────────────────

describe('[NFR-REL-04] Property 25: Durability before confirmation', () => {
  /**
   * After createMedicalProfile() returns, the data is immediately readable
   * from DynamoDB — confirming persistence before the response.
   */
  it('created pet is immediately readable after success response', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        const created = await coOnboardingService.createMedicalProfile(input)

        // Immediately read back — must exist
        const pet = await petRepo.findById(created.petId)
        expect(pet).not.toBeNull()
        expect(pet!.petId).toBe(created.petId)
        expect(pet!.name).toBe(input.name)
        expect(pet!.species).toBe(input.species)
        expect(pet!.profileStatus).toBe('Pending Claim')
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * After claimProfile() returns, the ownership change is immediately
   * reflected in a subsequent read.
   */
  it('claimed pet ownership is immediately readable after success response', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await coOnboardingService.createMedicalProfile(input)
        const claimed = await coOnboardingService.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'durability-owner')

        // Immediately read back — must reflect new ownership
        const pet = await petRepo.findById(created.petId)
        expect(pet).not.toBeNull()
        expect(pet!.profileStatus).toBe('Active')
        expect(pet!.ownerId).toBe(claimed.ownerId)
        expect(pet!.ownerName).toBe(ownerInfo.ownerName)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 26: Concurrent update safety ────────────────────────────────────

describe('[NFR-REL-04] Property 26: Concurrent update safety', () => {
  /**
   * Two simultaneous claims of the same pet profile cannot both succeed.
   * The ConditionExpression on claimProfile ensures only one claim wins.
   */
  it('two concurrent claims of the same pet — only one succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        const created = await coOnboardingService.createMedicalProfile(input)

        // Attempt two concurrent claims with the same claiming code
        const claim1 = coOnboardingService.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: 'Owner A',
          ownerEmail: 'a@example.com',
          ownerPhone: '+11111111111',
        }, 'owner-a')

        const claim2 = coOnboardingService.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: 'Owner B',
          ownerEmail: 'b@example.com',
          ownerPhone: '+22222222222',
        }, 'owner-b')

        const results = await Promise.allSettled([claim1, claim2])

        const successes = results.filter(r => r.status === 'fulfilled')
        const failures = results.filter(r => r.status === 'rejected')

        // At most one succeeds
        expect(successes.length).toBeLessThanOrEqual(1)
        // At least one fails (could be both if timing is very tight and code is already consumed)
        expect(failures.length).toBeGreaterThanOrEqual(1)

        // The pet should have exactly one owner
        const pet = await petRepo.findById(created.petId)
        if (successes.length === 1) {
          expect(pet!.profileStatus).toBe('Active')
          expect(pet!.ownerId).toBeDefined()
        }
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 27: Transaction rollback ────────────────────────────────────────

describe('[NFR-REL-03] Property 27: Transaction rollback', () => {
  /**
   * If claiming fails (e.g., invalid code), the pet remains in its original state.
   * No partial updates are applied.
   */
  it('failed claim leaves pet in original Pending Claim state', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        const created = await coOnboardingService.createMedicalProfile(input)

        // Attempt to claim with an invalid code
        try {
          await coOnboardingService.claimProfile({
            claimingCode: 'CLAIM-INVALID',
            ownerName: 'Should Not Work',
            ownerEmail: 'nope@example.com',
            ownerPhone: '+10000000000',
          }, 'bad-owner')
        } catch {
          // Expected to fail
        }

        // Pet must still be in original state
        const pet = await petRepo.findById(created.petId)
        expect(pet).not.toBeNull()
        expect(pet!.profileStatus).toBe('Pending Claim')
        expect(pet!.ownerId).toBeUndefined()
        expect(pet!.claimingCode).toBe(created.claimingCode)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * If a second claim attempt fails (profile already claimed), the first
   * claim's data remains intact — no corruption from the failed attempt.
   */
  it('failed second claim does not corrupt the first successful claim', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await coOnboardingService.createMedicalProfile(input)

        // First claim succeeds
        await coOnboardingService.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'first-owner')

        // Second claim attempt with same code should fail
        try {
          await coOnboardingService.claimProfile({
            claimingCode: created.claimingCode,
            ownerName: 'Attacker',
            ownerEmail: 'attacker@example.com',
            ownerPhone: '+19999999999',
          }, 'attacker-owner')
        } catch {
          // Expected to fail
        }

        // Original claim data must be intact
        const pet = await petRepo.findById(created.petId)
        expect(pet!.profileStatus).toBe('Active')
        expect(pet!.ownerId).toBe('first-owner')
        expect(pet!.ownerName).toBe(ownerInfo.ownerName)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 28: Referential integrity ───────────────────────────────────────

describe('[NFR-REL-04] Property 28: Referential integrity', () => {
  /**
   * Deleting a clinic that has pets assigned is rejected.
   * The clinic and all its pets remain intact.
   */
  it('deleting a clinic with assigned pets is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(shortStr, shortStr, async (clinicName, petName) => {
        // Create a fresh clinic for this test
        const clinic = await clinicRepo.create({
          name: clinicName,
          address: '1 Test St',
          city: 'TestCity',
          state: 'TS',
          zipCode: '99999',
          phone: '+10000000000',
          email: 'ref-test@example.com',
          licenseNumber: `LIC-REF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          latitude: 40.0,
          longitude: -74.0,
        })

        // Create a pet assigned to this clinic
        const pet = await coOnboardingService.createMedicalProfile({
          name: petName,
          species: 'Dog',
          breed: 'Labrador',
          age: 3,
          clinicId: clinic.clinicId,
          verifyingVetId: 'vet-ref-test',
        })

        // Attempt to delete the clinic — should be rejected
        let deleteRejected = false
        try {
          await clinicService.delete(clinic.clinicId)
        } catch (error) {
          deleteRejected = true
          expect(error).toBeInstanceOf(ValidationException)
          expect((error as ValidationException).validationErrors[0].message).toContain('Cannot delete clinic with assigned pets')
        }

        expect(deleteRejected).toBe(true)

        // Clinic still exists
        const clinicAfter = await clinicRepo.findById(clinic.clinicId)
        expect(clinicAfter).not.toBeNull()
        expect(clinicAfter!.clinicId).toBe(clinic.clinicId)

        // Pet still exists
        const petAfter = await petRepo.findById(pet.petId)
        expect(petAfter).not.toBeNull()
        expect(petAfter!.petId).toBe(pet.petId)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * Deleting a clinic with no pets succeeds.
   */
  it('deleting a clinic with no pets succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(shortStr, async (clinicName) => {
        // Create a fresh clinic with no pets
        const clinic = await clinicRepo.create({
          name: clinicName,
          address: '2 Empty St',
          city: 'EmptyCity',
          state: 'EM',
          zipCode: '00000',
          phone: '+10000000001',
          email: 'empty@example.com',
          licenseNumber: `LIC-EMPTY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          latitude: 41.0,
          longitude: -75.0,
        })

        // Delete should succeed
        await clinicService.delete(clinic.clinicId)

        // Clinic no longer exists
        const clinicAfter = await clinicRepo.findById(clinic.clinicId)
        expect(clinicAfter).toBeNull()
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * Deleting a pet removes all associated records (vaccines, surgeries).
   * After deletion, the pet and its related records are gone.
   */
  it('deleting a pet removes associated vaccine and surgery records', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        // Create a pet
        const created = await coOnboardingService.createMedicalProfile(input)

        // Add a vaccine record
        await petRepo.addVaccine(created.petId, {
          vaccineName: 'Rabies',
          administeredDate: '2024-01-15',
          nextDueDate: '2025-01-15',
          veterinarianName: 'Dr. Test',
        })

        // Add a surgery record
        await petRepo.addSurgery(created.petId, {
          surgeryType: 'Spay',
          surgeryDate: '2024-02-01',
          notes: 'Routine procedure',
          recoveryInfo: '10-14 days recovery',
          veterinarianName: 'Dr. Test',
        })

        // Verify records exist
        const vaccinesBefore = await petRepo.getVaccines(created.petId)
        const surgeriesBefore = await petRepo.getSurgeries(created.petId)
        expect(vaccinesBefore.length).toBe(1)
        expect(surgeriesBefore.length).toBe(1)

        // Delete the pet
        await petRepo.delete(created.petId)

        // Pet is gone
        const petAfter = await petRepo.findById(created.petId)
        expect(petAfter).toBeNull()

        // Associated records are also gone
        const vaccinesAfter = await petRepo.getVaccines(created.petId)
        const surgeriesAfter = await petRepo.getSurgeries(created.petId)
        expect(vaccinesAfter.length).toBe(0)
        expect(surgeriesAfter.length).toBe(0)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})
