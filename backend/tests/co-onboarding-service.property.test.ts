/**
 * Property-based tests for PetCoOnboardingService and ProfileClaimingService
 * Uses fast-check with numRuns: 100 against LocalStack at localhost:4566.
 *
 * Properties covered:
 *   Property 2:  Complete pet record retrieval (co-onboarding)
 *   Property 17: Unique pet identifiers
 *   Property 18: Claiming code uniqueness and expiry
 *   Property 19: Profile ownership transfer atomicity
 *
 * Validates: Requirements [FR-03], [FR-04], [FR-05]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { PetCoOnboardingService } from '../src/services/pet-co-onboarding-service'
import { ProfileClaimingService } from '../src/services/profile-claiming-service'
import { ClinicRepository } from '../src/repositories/clinic-repository'

const TEST_TABLE = 'VetPetRegistry-CoOnboarding-Test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

const shortStr = fc.string({ minLength: 2, maxLength: 20 }).filter(s => s.trim().length > 0)

const clinicInputArb = fc.record({
  name: shortStr,
  address: shortStr,
  city: shortStr,
  state: shortStr,
  zipCode: fc.constant('12345'),
  phone: fc.constant('+12345678901'),
  email: fc.constant('clinic@example.com'),
  licenseNumber: shortStr,
  latitude: fc.float({ min: -89, max: 89, noNaN: true }),
  longitude: fc.float({ min: -179, max: 179, noNaN: true }),
})

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

const enrichArb = fc.record({
  ownerName: shortStr,
  ownerEmail: fc.constant('enriched@example.com'),
  ownerPhone: fc.constant('+19876543210'),
})

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let service: PetCoOnboardingService
let claimingService: ProfileClaimingService
let clinicRepo: ClinicRepository
let sharedClinicId: string

beforeAll(async () => {
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  service = new PetCoOnboardingService(TEST_TABLE)
  claimingService = new ProfileClaimingService(TEST_TABLE)
  clinicRepo = new ClinicRepository(TEST_TABLE)

  // Create a shared clinic for tests that need a valid clinicId
  const clinic = await clinicRepo.create({
    name: 'Test Clinic',
    address: '1 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '12345',
    phone: '+12345678901',
    email: 'clinic@example.com',
    licenseNumber: `LIC-${Date.now()}`,
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

// ── Property 2: Complete pet record retrieval (co-onboarding) ─────────────────

describe('[FR-03][FR-05] Property 2: Complete pet record retrieval (co-onboarding)', () => {
  /**
   * After createMedicalProfile(), findById() via the service returns a
   * CompletePetRecord with the correct pet, empty vaccines, and empty surgeries.
   * After claiming, the vet can still retrieve the full record.
   */
  it('findById returns complete record with correct fields for vet', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        const created = await service.createMedicalProfile(input)

        const record = await service.findById(created.petId, 'vet', 'vet-1', sharedClinicId)
        expect(record).not.toBeNull()
        expect(record!.pet.petId).toBe(created.petId)
        expect(record!.pet.name).toBe(input.name)
        expect(record!.pet.species).toBe(input.species)
        expect(record!.pet.breed).toBe(input.breed)
        expect(record!.pet.age).toBe(input.age)
        expect(record!.pet.clinicId).toBe(sharedClinicId)
        expect(record!.pet.medicallyVerified).toBe(true)
        expect(record!.pet.profileStatus).toBe('Pending Claim')
        expect(Array.isArray(record!.vaccines)).toBe(true)
        expect(Array.isArray(record!.surgeries)).toBe(true)
        expect(Array.isArray(record!.images)).toBe(true)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  it('findById returns complete record for owner after claiming', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await service.createMedicalProfile(input)
        const claimed = await service.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'test-owner-id')

        const record = await service.findById(created.petId, 'owner', claimed.ownerId)
        expect(record).not.toBeNull()
        expect(record!.pet.petId).toBe(created.petId)
        expect(record!.pet.profileStatus).toBe('Active')
        expect(record!.pet.ownerId).toBe(claimed.ownerId)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 17: Unique pet identifiers ──────────────────────────────────────

describe('[FR-03] Property 17: Unique pet identifiers', () => {
  /**
   * For any two medical profile creations, the resulting petIds are distinct.
   */
  it('createMedicalProfile generates unique petIds for each call', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalProfileArb(sharedClinicId),
        medicalProfileArb(sharedClinicId),
        async (inputA, inputB) => {
          const [a, b] = await Promise.all([
            service.createMedicalProfile(inputA),
            service.createMedicalProfile(inputB),
          ])
          expect(a.petId).not.toBe(b.petId)
        }
      ),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 18: Claiming code uniqueness and expiry ──────────────────────────

describe('[FR-03][FR-04] Property 18: Claiming code uniqueness and expiry', () => {
  /**
   * For any two medical profiles, their claiming codes are distinct.
   */
  it('createMedicalProfile generates unique claiming codes', async () => {
    await fc.assert(
      fc.asyncProperty(
        medicalProfileArb(sharedClinicId),
        medicalProfileArb(sharedClinicId),
        async (inputA, inputB) => {
          const [a, b] = await Promise.all([
            service.createMedicalProfile(inputA),
            service.createMedicalProfile(inputB),
          ])
          expect(a.claimingCode).not.toBe(b.claimingCode)
        }
      ),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * validateClaimingCode returns valid=true for a freshly created profile
   * and valid=false for a non-existent code.
   */
  it('validateClaimingCode returns valid for fresh code and invalid for unknown code', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        const created = await service.createMedicalProfile(input)

        // Valid code
        const valid = await service.validateClaimingCode(created.claimingCode)
        expect(valid.valid).toBe(true)
        expect(valid.pet).toBeDefined()
        expect(valid.pet!.petId).toBe(created.petId)

        // Invalid code
        const invalid = await service.validateClaimingCode('CLAIM-XXXXXX')
        expect(invalid.valid).toBe(false)
        expect(invalid.error).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * validateOwnerEligibility (ProfileClaimingService) mirrors the same logic.
   */
  it('validateOwnerEligibility returns eligible for valid pending profile', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), async (input) => {
        const created = await service.createMedicalProfile(input)

        const result = await claimingService.validateOwnerEligibility(created.claimingCode)
        expect(result.eligible).toBe(true)
        expect(result.pet).toBeDefined()
        expect(result.pet!.petId).toBe(created.petId)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * After claiming, validateClaimingCode returns valid=false (code consumed).
   */
  it('validateClaimingCode returns invalid after profile is claimed', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await service.createMedicalProfile(input)
        await service.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'test-owner-id')

        const result = await service.validateClaimingCode(created.claimingCode)
        expect(result.valid).toBe(false)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 19: Profile ownership transfer atomicity ─────────────────────────

describe('[FR-04] Property 19: Profile ownership transfer atomicity', () => {
  /**
   * transferOwnership() atomically:
   * - Sets profileStatus to 'Active'
   * - Assigns ownerId, ownerName, ownerEmail, ownerPhone
   * - Removes the claiming code from the record
   * - Makes the pet findable via findByOwner
   */
  it('transferOwnership atomically transfers ownership and removes claiming code', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await service.createMedicalProfile(input)

        const result = await claimingService.transferOwnership({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'test-owner-id')

        expect(result.petId).toBe(created.petId)
        expect(result.profileStatus).toBe('Active')
        expect(result.ownerId).toBeTruthy()
        expect(result.ownerName).toBe(ownerInfo.ownerName)
        expect(result.claimedAt).toBeTruthy()

        // Claiming code is no longer valid
        const codeCheck = await claimingService.validateOwnerEligibility(created.claimingCode)
        expect(codeCheck.eligible).toBe(false)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * claimProfile() via PetCoOnboardingService produces the same atomicity guarantees.
   */
  it('claimProfile via service sets Active status and owner fields', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await service.createMedicalProfile(input)

        const claimed = await service.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'test-owner-id')

        expect(claimed.profileStatus).toBe('Active')
        expect(claimed.ownerId).toBeTruthy()
        expect(claimed.ownerName).toBe(ownerInfo.ownerName)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * enrichProfile() persists owner personalisation without altering medical data.
   */
  it('enrichProfile persists owner data without changing medical verification', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, enrichArb, async (input, ownerInfo, enrichData) => {
        const created = await service.createMedicalProfile(input)
        const claimed = await service.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'test-owner-id')

        const enriched = await service.enrichProfile(created.petId, claimed.ownerId, enrichData)

        expect(enriched.ownerName).toBe(enrichData.ownerName)
        expect(enriched.ownerEmail).toBe(enrichData.ownerEmail)
        expect(enriched.ownerPhone).toBe(enrichData.ownerPhone)
        // Medical data unchanged
        expect(enriched.medicallyVerified).toBe(true)
        expect(enriched.clinicId).toBe(sharedClinicId)
        expect(enriched.profileStatus).toBe('Active')
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * findPendingClaims returns only Pending Claim profiles for the clinic.
   */
  it('findPendingClaims returns only unclaimed profiles for the clinic', async () => {
    await fc.assert(
      fc.asyncProperty(medicalProfileArb(sharedClinicId), ownerInfoArb, async (input, ownerInfo) => {
        const created = await service.createMedicalProfile(input)

        // Before claiming: should appear in pending list
        const pendingBefore = await claimingService.findPendingClaims(sharedClinicId)
        const foundBefore = pendingBefore.some((p) => p.petId === created.petId)
        expect(foundBefore).toBe(true)

        // After claiming: should NOT appear in pending list
        await service.claimProfile({
          claimingCode: created.claimingCode,
          ownerName: ownerInfo.ownerName,
          ownerEmail: ownerInfo.ownerEmail,
          ownerPhone: ownerInfo.ownerPhone,
        }, 'test-owner-id')

        const pendingAfter = await claimingService.findPendingClaims(sharedClinicId)
        const foundAfter = pendingAfter.some((p) => p.petId === created.petId)
        expect(foundAfter).toBe(false)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})
