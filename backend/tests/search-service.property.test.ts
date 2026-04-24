/**
 * Property-based tests for SearchService
 * Uses fast-check with numRuns: 25 against LocalStack at localhost:4566.
 *
 * Properties covered:
 *   Property 12: Search criteria matching
 *   Property 13: Complete search results
 *   Property 54: Owner privacy protection in public search
 *
 * Validates: Requirements [FR-11], [FR-12], [FR-15]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { SearchService, SearchResult } from '../src/services/search-service'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { PetRepository } from '../src/repositories/pet-repository'
import { Clinic } from '../src/models/entities'

const TEST_TABLE = 'VetPetRegistry-SearchService-Test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Non-whitespace string that passes trim().length > 0 validation */
const validStr = fc.string({ minLength: 2, maxLength: 10 }).filter(s => s.trim().length > 0)

const speciesArb = fc.constantFrom('Dog', 'Cat', 'Bird', 'Rabbit')
const breedArb = fc.constantFrom('Labrador', 'Siamese', 'Parrot', 'Lop')
const ageArb = fc.integer({ min: 0, max: 20 })

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let searchService: SearchService
let clinicRepo: ClinicRepository
let petRepo: PetRepository
let sharedClinic: Clinic

beforeAll(async () => {
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  searchService = new SearchService(TEST_TABLE)
  clinicRepo = new ClinicRepository(TEST_TABLE)
  petRepo = new PetRepository(TEST_TABLE)

  // Create a shared clinic for all tests
  sharedClinic = await clinicRepo.create({
    name: 'Search Test Clinic',
    address: '123 Test St',
    city: 'TestCity',
    state: 'TS',
    zipCode: '12345',
    phone: '+12345678901',
    email: 'search-test@example.com',
    licenseNumber: `LIC-SEARCH-${uuidv4()}`,
    latitude: 40.0,
    longitude: -74.0,
  })
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}, 60_000)


// ── Property 12: Search criteria matching ─────────────────────────────────────

describe('[FR-11][FR-12] Property 12: Search criteria matching', () => {
  /**
   * **Validates: Requirements [FR-11], [FR-12]**
   *
   * When pets are created with specific species/breed/age, searching with
   * matching criteria returns those pets. Searching with non-matching
   * criteria does not return them.
   */
  it('search with matching species returns the created pet', async () => {
    await fc.assert(
      fc.asyncProperty(
        speciesArb,
        breedArb,
        ageArb,
        validStr,
        async (species, breed, age, petName) => {
          // Create a pet with known species/breed/age
          const created = await petRepo.createMedicalProfile({
            name: petName,
            species,
            breed,
            age,
            clinicId: sharedClinic.clinicId,
            verifyingVetId: 'vet-search-test',
          })

          // Search by matching species
          const results = await searchService.search({ species })
          const found = results.find(r => r.petId === created.petId)

          expect(found).toBeDefined()
          expect(found!.species).toBe(species)
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)

  it('search with matching species and breed returns the created pet', async () => {
    await fc.assert(
      fc.asyncProperty(
        speciesArb,
        breedArb,
        ageArb,
        validStr,
        async (species, breed, age, petName) => {
          const created = await petRepo.createMedicalProfile({
            name: petName,
            species,
            breed,
            age,
            clinicId: sharedClinic.clinicId,
            verifyingVetId: 'vet-search-test',
          })

          // Search by matching species + breed
          const results = await searchService.search({ species, breed })
          const found = results.find(r => r.petId === created.petId)

          expect(found).toBeDefined()
          expect(found!.species).toBe(species)
          expect(found!.breed).toBe(breed)
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)

  it('search with matching age range returns the created pet', async () => {
    await fc.assert(
      fc.asyncProperty(
        speciesArb,
        breedArb,
        ageArb,
        validStr,
        async (species, breed, age, petName) => {
          const created = await petRepo.createMedicalProfile({
            name: petName,
            species,
            breed,
            age,
            clinicId: sharedClinic.clinicId,
            verifyingVetId: 'vet-search-test',
          })

          // Search by species + age range that includes the pet's age
          const results = await searchService.search({
            species,
            ageMin: age,
            ageMax: age,
          })
          const found = results.find(r => r.petId === created.petId)

          expect(found).toBeDefined()
          expect(found!.age).toBe(age)
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)

  it('search with non-matching species does not return the pet', async () => {
    await fc.assert(
      fc.asyncProperty(
        validStr,
        async (petName) => {
          // Create a pet with a unique species
          const uniqueSpecies = `UniqueSpecies-${uuidv4().slice(0, 8)}`
          const created = await petRepo.createMedicalProfile({
            name: petName,
            species: uniqueSpecies,
            breed: 'TestBreed',
            age: 5,
            clinicId: sharedClinic.clinicId,
            verifyingVetId: 'vet-search-test',
          })

          // Search with a different species
          const differentSpecies = `Other-${uuidv4().slice(0, 8)}`
          const results = await searchService.search({ species: differentSpecies })
          const found = results.find(r => r.petId === created.petId)

          expect(found).toBeUndefined()
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)
})


// ── Property 13: Complete search results ──────────────────────────────────────

describe('[FR-11][FR-12] Property 13: Complete search results', () => {
  /**
   * **Validates: Requirements [FR-11], [FR-12]**
   *
   * Search results contain all required fields (petId, name, species, breed,
   * age, clinic info). The clinic information in results matches the actual
   * clinic data.
   */
  it('search results contain all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        speciesArb,
        breedArb,
        ageArb,
        validStr,
        async (species, breed, age, petName) => {
          await petRepo.createMedicalProfile({
            name: petName,
            species,
            breed,
            age,
            clinicId: sharedClinic.clinicId,
            verifyingVetId: 'vet-search-test',
          })

          const results = await searchService.search({ species })
          expect(results.length).toBeGreaterThan(0)

          for (const result of results) {
            // Core pet fields
            expect(result.petId).toBeTruthy()
            expect(result.name).toBeTruthy()
            expect(result.species).toBeTruthy()
            expect(result.breed).toBeTruthy()
            expect(typeof result.age).toBe('number')
            expect(typeof result.isMissing).toBe('boolean')

            // Images array exists (may be empty)
            expect(Array.isArray(result.images)).toBe(true)

            // Clinic info is present and complete
            expect(result.clinic).toBeDefined()
            expect(result.clinic.name).toBeTruthy()
            expect(result.clinic.phone).toBeTruthy()
            expect(result.clinic.address).toBeTruthy()
            expect(result.clinic.city).toBeTruthy()
            expect(result.clinic.state).toBeTruthy()
          }
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)

  it('clinic information in results matches the actual clinic', async () => {
    await fc.assert(
      fc.asyncProperty(
        speciesArb,
        breedArb,
        ageArb,
        validStr,
        async (species, breed, age, petName) => {
          const created = await petRepo.createMedicalProfile({
            name: petName,
            species,
            breed,
            age,
            clinicId: sharedClinic.clinicId,
            verifyingVetId: 'vet-search-test',
          })

          const results = await searchService.search({ species })
          const found = results.find(r => r.petId === created.petId)

          expect(found).toBeDefined()
          expect(found!.clinic.name).toBe(sharedClinic.name)
          expect(found!.clinic.phone).toBe(sharedClinic.phone)
          expect(found!.clinic.address).toBe(sharedClinic.address)
          expect(found!.clinic.city).toBe(sharedClinic.city)
          expect(found!.clinic.state).toBe(sharedClinic.state)
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)
})

// ── Helper: create a claimed, missing pet with owner contact info ─────────────

async function createClaimedMissingPet(
  species: string,
  breed: string,
  age: number,
  petName: string,
  clinicId: string
): Promise<{ petId: string; ownerId: string }> {
  const profile = await petRepo.createMedicalProfile({
    name: petName,
    species,
    breed,
    age,
    clinicId,
    verifyingVetId: 'vet-privacy-test',
  })

  const claimed = await petRepo.claimProfile(profile.petId, {
    claimingCode: profile.claimingCode,
    ownerName: 'Private Owner',
    ownerEmail: 'private@example.com',
    ownerPhone: '+19999999999',
  })

  await petRepo.setMissingStatus(profile.petId, true)

  return { petId: profile.petId, ownerId: claimed.ownerId }
}

// ── Property 54: Owner privacy protection in public search ───────────────────

describe('[FR-15] Property 54: Owner privacy protection in public search', () => {
  /**
   * **Validates: Requirements [FR-15]**
   *
   * searchPublic() never exposes owner phone or email in results.
   * The owner field must be undefined for every result.
   */
  it('searchPublic never returns owner contact information', async () => {
    await fc.assert(
      fc.asyncProperty(speciesArb, breedArb, ageArb, validStr, async (species, breed, age, petName) => {
        await createClaimedMissingPet(species, breed, age, petName, sharedClinic.clinicId)

        const results = await searchService.searchPublic({ species })

        for (const result of results) {
          expect(result.owner).toBeUndefined()
        }
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-15]**
   *
   * Every result from searchPublic() includes contactMethod='platform_messaging'
   * and a messageUrl for anonymous contact.
   */
  it('searchPublic provides platform messaging for every result', async () => {
    await fc.assert(
      fc.asyncProperty(speciesArb, breedArb, ageArb, validStr, async (species, breed, age, petName) => {
        const pet = await createClaimedMissingPet(species, breed, age, petName, sharedClinic.clinicId)

        const results = await searchService.searchPublic({ species })
        const found = results.find(r => r.petId === pet.petId)

        expect(found).toBeDefined()
        expect(found!.contactMethod).toBe('platform_messaging')
        expect(found!.messageUrl).toContain(pet.petId)
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-15]**
   *
   * searchPublic() always includes full clinic contact details
   * (name, phone, address) even though owner info is masked.
   */
  it('searchPublic includes full clinic contact details', async () => {
    await fc.assert(
      fc.asyncProperty(speciesArb, breedArb, ageArb, validStr, async (species, breed, age, petName) => {
        await createClaimedMissingPet(species, breed, age, petName, sharedClinic.clinicId)

        const results = await searchService.searchPublic({ species })

        for (const result of results) {
          expect(result.clinic).toBeDefined()
          expect(result.clinic.name).toBeTruthy()
          expect(result.clinic.phone).toBeTruthy()
          expect(result.clinic.address).toBeTruthy()
        }
      }),
      { numRuns: 100 }
    )
  }, 300_000)

  /**
   * **Validates: Requirements [FR-11], [FR-15]**
   *
   * searchPublic() only returns pets that are marked as missing.
   * Non-missing pets with owner info must never appear.
   */
  it('searchPublic only returns missing pets', async () => {
    await fc.assert(
      fc.asyncProperty(speciesArb, breedArb, ageArb, validStr, async (species, breed, age, petName) => {
        await createClaimedMissingPet(species, breed, age, petName, sharedClinic.clinicId)

        const results = await searchService.searchPublic({ species })

        for (const result of results) {
          expect(result.isMissing).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})
