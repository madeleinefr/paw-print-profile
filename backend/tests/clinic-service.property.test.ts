/**
 * Property-based tests for ClinicService
 * Uses fast-check with numRuns: 100 against LocalStack at localhost:4566.
 *
 * Properties covered:
 *   Property 21: Clinic pet list completeness
 *   Property 22: Clinic pet list fields
 *   Property 24: Pagination consistency
 *   Property 25: Pending claims visibility
 *
 * Validates: Requirements [FR-01], [FR-02]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { ClinicService } from '../src/services/clinic-service'
import { PetRepository } from '../src/repositories/pet-repository'
import { Pet, PaginationParams } from '../src/models/entities'

const TEST_TABLE = 'VetPetRegistry-ClinicService-Test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Non-whitespace string that passes trim().length > 0 validation */
const validStr = fc.string({ minLength: 2, maxLength: 10 }).filter(s => s.trim().length > 0)

const clinicArb = fc.record({
  name: validStr,
  address: validStr,
  city: validStr,
  state: validStr,
  zipCode: fc.constant('12345'),
  phone: fc.constant('+12345678901'),
  email: fc.constant('clinic@example.com'),
  licenseNumber: validStr,
  latitude: fc.float({ min: -89, max: 89, noNaN: true }),
  longitude: fc.float({ min: -179, max: 179, noNaN: true }),
})

const medicalProfileArb = (clinicId: string) =>
  fc.record({
    name: validStr,
    species: validStr,
    breed: validStr,
    age: fc.integer({ min: 0, max: 30 }),
    clinicId: fc.constant(clinicId),
    verifyingVetId: validStr,
  })

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect ALL pets for a clinic by paginating through DynamoDB scan results.
 * DynamoDB Scan Limit applies before FilterExpression, so a single page may
 * return fewer items than requested. We must paginate until no lastEvaluatedKey.
 */
async function getAllClinicPets(service: ClinicService, clinicId: string): Promise<Pet[]> {
  const allPets: Pet[] = []
  let lastKey: Record<string, any> | undefined = undefined
  let pageNum = 1

  do {
    const page = await service.getPets(clinicId, {
      page: pageNum,
      limit: 100,
      lastEvaluatedKey: lastKey,
    })
    allPets.push(...page.items)
    lastKey = page.pagination.lastEvaluatedKey
    pageNum++
    if (!page.pagination.hasNext) break
  } while (lastKey)

  return allPets
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let clinicService: ClinicService
let petRepo: PetRepository

beforeAll(async () => {
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  clinicService = new ClinicService(TEST_TABLE)
  petRepo = new PetRepository(TEST_TABLE)
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}, 60_000)

// ── Property 21: Clinic pet list completeness ─────────────────────────────────

describe('[FR-01] Property 21: Clinic pet list completeness', () => {
  /**
   * **Validates: Requirements [FR-01]**
   *
   * For any N pets created for a clinic, collecting all paginated results
   * from getPets() returns at least those N pets.
   */
  it('getPets returns all pets created for the clinic', async () => {
    await fc.assert(
      fc.asyncProperty(
        clinicArb,
        fc.array(medicalProfileArb('placeholder'), { minLength: 1, maxLength: 5 }),
        async (clinicInput, petInputs) => {
          const uniqueClinic = { ...clinicInput, licenseNumber: `${clinicInput.licenseNumber}-${uuidv4()}` }
          const clinic = await clinicService.create(uniqueClinic)

          const createdPetIds: string[] = []
          for (const petInput of petInputs) {
            const result = await petRepo.createMedicalProfile({ ...petInput, clinicId: clinic.clinicId })
            createdPetIds.push(result.petId)
          }

          const allPets = await getAllClinicPets(clinicService, clinic.clinicId)
          const returnedIds = allPets.map((p) => p.petId)

          for (const id of createdPetIds) {
            expect(returnedIds).toContain(id)
          }
        }
      ),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 22: Clinic pet list fields ──────────────────────────────────────

describe('[FR-01] Property 22: Clinic pet list fields', () => {
  /**
   * **Validates: Requirements [FR-01]**
   *
   * Every pet returned by getPets() has the required fields populated.
   */
  it('getPets returns pets with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(clinicArb, medicalProfileArb('placeholder'), async (clinicInput, petInput) => {
        const uniqueClinic = { ...clinicInput, licenseNumber: `${clinicInput.licenseNumber}-${uuidv4()}` }
        const clinic = await clinicService.create(uniqueClinic)

        await petRepo.createMedicalProfile({ ...petInput, clinicId: clinic.clinicId })

        const allPets = await getAllClinicPets(clinicService, clinic.clinicId)
        // Filter to actual pet records (PK starts with PET#)
        const petRecords = allPets.filter((p) => p.PK && p.PK.startsWith('PET#'))
        expect(petRecords.length).toBeGreaterThan(0)

        for (const pet of petRecords) {
          expect(pet.petId).toBeTruthy()
          expect(pet.name).toBeTruthy()
          expect(pet.species).toBeTruthy()
          expect(pet.breed).toBeTruthy()
          expect(typeof pet.age).toBe('number')
          expect(pet.clinicId).toBe(clinic.clinicId)
          expect(pet.profileStatus).toBeTruthy()
          expect(pet.createdAt).toBeTruthy()
        }
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 24: Pagination consistency ──────────────────────────────────────

describe('[FR-01] Property 24: Pagination consistency', () => {
  /**
   * **Validates: Requirements [FR-01]**
   *
   * Paginating through all pets with limit=1 yields the same set of pet IDs
   * as fetching with a large limit.
   */
  it('paginated results are consistent with single-page results', async () => {
    await fc.assert(
      fc.asyncProperty(
        clinicArb,
        fc.array(medicalProfileArb('placeholder'), { minLength: 2, maxLength: 4 }),
        async (clinicInput, petInputs) => {
          const uniqueClinic = { ...clinicInput, licenseNumber: `${clinicInput.licenseNumber}-${uuidv4()}` }
          const clinic = await clinicService.create(uniqueClinic)

          for (const petInput of petInputs) {
            await petRepo.createMedicalProfile({ ...petInput, clinicId: clinic.clinicId })
          }

          // Fetch all using large limit (paginated helper)
          const allPets = await getAllClinicPets(clinicService, clinic.clinicId)

          // Paginate with limit=1 and collect all
          let collectedIds: string[] = []
          let lastKey: Record<string, any> | undefined = undefined
          let pageNum = 1

          do {
            const page = await clinicService.getPets(clinic.clinicId, {
              page: pageNum,
              limit: 1,
              lastEvaluatedKey: lastKey,
            })
            collectedIds = collectedIds.concat(page.items.map((p) => p.petId))
            lastKey = page.pagination.lastEvaluatedKey
            pageNum++
            if (!page.pagination.hasNext) break
          } while (lastKey)

          // All IDs from large-limit fetch should appear in paginated results
          for (const pet of allPets) {
            expect(collectedIds).toContain(pet.petId)
          }
        }
      ),
      { numRuns: 100 }
    )
  }, 600_000)
})

// ── Property 25: Pending claims visibility ────────────────────────────────────

describe('[FR-01][FR-02] Property 25: Pending claims visibility', () => {
  /**
   * **Validates: Requirements [FR-01], [FR-02]**
   *
   * A newly created medical profile (Pending Claim) appears in getPendingClaims()
   * for the clinic. After claiming, it no longer appears.
   */
  it('getPendingClaims shows unclaimed profiles and hides claimed ones', async () => {
    await fc.assert(
      fc.asyncProperty(clinicArb, medicalProfileArb('placeholder'), async (clinicInput, petInput) => {
        const uniqueClinic = { ...clinicInput, licenseNumber: `${clinicInput.licenseNumber}-${uuidv4()}` }
        const clinic = await clinicService.create(uniqueClinic)

        const created = await petRepo.createMedicalProfile({ ...petInput, clinicId: clinic.clinicId })

        // Should appear in pending claims
        const pendingBefore = await clinicService.getPendingClaims(clinic.clinicId)
        expect(pendingBefore.some((p) => p.petId === created.petId)).toBe(true)

        // Claim the profile
        await petRepo.claimProfile(created.petId, {
          claimingCode: created.claimingCode,
          ownerName: 'Test Owner',
          ownerEmail: 'owner@example.com',
          ownerPhone: '+12345678901',
        })

        // Should no longer appear in pending claims
        const pendingAfter = await clinicService.getPendingClaims(clinic.clinicId)
        expect(pendingAfter.some((p) => p.petId === created.petId)).toBe(false)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-01], [FR-02]**
   *
   * getPendingClaims only returns profiles with profileStatus='Pending Claim'.
   */
  it('getPendingClaims returns only Pending Claim profiles', async () => {
    await fc.assert(
      fc.asyncProperty(clinicArb, medicalProfileArb('placeholder'), async (clinicInput, petInput) => {
        const uniqueClinic = { ...clinicInput, licenseNumber: `${clinicInput.licenseNumber}-${uuidv4()}` }
        const clinic = await clinicService.create(uniqueClinic)

        await petRepo.createMedicalProfile({ ...petInput, clinicId: clinic.clinicId })

        const pending = await clinicService.getPendingClaims(clinic.clinicId)
        for (const pet of pending) {
          expect(pet.profileStatus).toBe('Pending Claim')
        }
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})
