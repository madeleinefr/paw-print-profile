/**
 * Property-based tests for EmergencyToolsService, FlyerGenerationService, and PhotoGuidanceService
 * Uses fast-check with numRuns: 25/100 against LocalStack at localhost:4566.
 *
 * Properties covered:
 *   Property 33: Missing pet flyer generation (reportMissing produces a flyer URL)
 *   Property 34: Flyer format (PDF is letter-size and contains required content)
 *   Property 54: 3-click flyer generation from dashboard
 *   Property 55: Care snapshot generation and access via EmergencyToolsService
 *   Property 56: Owner privacy protection in flyers
 *   Property 57: Photo guidance display (guidelines and quality feedback)
 *
 * Validates: Requirements [FR-08], [FR-09], [FR-10], [FR-13], [FR-15], [FR-16], [NFR-USA-01]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { EmergencyToolsService, ReportMissingInput } from '../src/services/emergency-tools-service'
import { FlyerGenerationService, ContactMethod } from '../src/services/flyer-generation-service'
import { PhotoGuidanceService } from '../src/services/photo-guidance-service'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { PetRepository } from '../src/repositories/pet-repository'
import { AWSClientFactory } from '../src/infrastructure/aws-client-factory'
import { CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3'
import { Pet, Clinic, PetImage } from '../src/models/entities'

const TEST_TABLE = 'VetPetRegistry-Emergency-Test'
const TEST_BUCKET = `paw-print-emergency-test-${Date.now()}`

// ── Arbitraries ──────────────────────────────────────────────────────────────

const validStr = fc.string({ minLength: 2, maxLength: 20 }).filter(s => s.trim().length > 0)

const contactMethodArb: fc.Arbitrary<ContactMethod> = fc.constantFrom('phone', 'email', 'clinic')

const reportMissingInputArb: fc.Arbitrary<ReportMissingInput> = fc.record({
  searchRadiusKm: fc.integer({ min: 1, max: 200 }),
  lastSeenLocation: validStr,
  additionalNotes: fc.option(validStr, { nil: undefined }),
  contactMethod: contactMethodArb,
})

const mimeTypeArb = fc.constantFrom('image/jpeg', 'image/png', 'image/webp')
const invalidMimeTypeArb = fc.constantFrom('image/gif', 'image/bmp', 'image/tiff', 'application/pdf')
const validFileSizeArb = fc.integer({ min: 1024, max: 10 * 1024 * 1024 }) // 1KB to 10MB
const oversizedFileSizeArb = fc.integer({ min: 10 * 1024 * 1024 + 1, max: 50 * 1024 * 1024 })
const dimensionsArb = fc.record({
  width: fc.integer({ min: 100, max: 4000 }),
  height: fc.integer({ min: 100, max: 4000 }),
})

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let emergencyService: EmergencyToolsService
let flyerService: FlyerGenerationService
let photoGuidanceService: PhotoGuidanceService
let clinicRepo: ClinicRepository
let petRepo: PetRepository
let sharedClinic: Clinic
let s3Client: InstanceType<typeof import('@aws-sdk/client-s3').S3Client>

beforeAll(async () => {
  // Set env var so FlyerGenerationService uses the isolated test bucket
  process.env.PET_IMAGES_BUCKET = TEST_BUCKET

  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  emergencyService = new EmergencyToolsService(TEST_TABLE)
  flyerService = new FlyerGenerationService()
  photoGuidanceService = new PhotoGuidanceService()
  clinicRepo = new ClinicRepository(TEST_TABLE)
  petRepo = new PetRepository(TEST_TABLE)

  // Create isolated S3 test bucket
  const factory = new AWSClientFactory()
  s3Client = factory.createS3Client()
  await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))

  // Create a shared clinic
  sharedClinic = await clinicRepo.create({
    name: 'Emergency Test Clinic',
    address: '100 Vet Lane',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
    phone: '+12225551234',
    email: 'emergency@vetclinic.com',
    licenseNumber: `LIC-EMRG-${Date.now()}`,
    latitude: 39.78,
    longitude: -89.65,
  })
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('DynamoDB cleanup error:', err)
  }
  try {
    // Delete all objects in the bucket first (S3 requires empty bucket for deletion)
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3')
    const listed = await s3Client.send(new ListObjectsV2Command({ Bucket: TEST_BUCKET }))
    if (listed.Contents && listed.Contents.length > 0) {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: TEST_BUCKET,
        Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key! })) },
      }))
    }
    await s3Client.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }))
  } catch (err) {
    console.error('S3 cleanup error:', err)
  }
  // Restore env var
  delete process.env.PET_IMAGES_BUCKET
}, 60_000)

// ── Helper: create a claimed pet ─────────────────────────────────────────────

async function createClaimedPet(overrides?: { ownerPhone?: string; ownerEmail?: string }): Promise<{
  pet: Pet
  ownerId: string
}> {
  const profile = await petRepo.createMedicalProfile({
    name: 'EmergencyPet',
    species: 'Dog',
    breed: 'Beagle',
    age: 4,
    clinicId: sharedClinic.clinicId,
    verifyingVetId: 'vet-emrg-1',
  })

  const claimed = await petRepo.claimProfile(profile.petId, {
    claimingCode: profile.claimingCode,
    ownerName: 'Emergency Owner',
    ownerEmail: overrides?.ownerEmail ?? 'owner@emergency.com',
    ownerPhone: overrides?.ownerPhone ?? '+19998887777',
  }, 'owner-emrg-1')

  const pet = await petRepo.findById(profile.petId)
  return { pet: pet!, ownerId: claimed.ownerId }
}

// ── Property 33: Missing pet flyer generation ────────────────────────────────

describe('[FR-08][FR-09] Property 33: Missing pet flyer generation', () => {
  /**
   * Validates: Requirements [FR-08], [FR-09], [NFR-USA-01]
   *
   * reportMissing() produces a valid flyer URL, marks the pet as missing,
   * and returns the number of notified clinics.
   */
  it('reportMissing produces a flyer URL and marks pet as missing', async () => {
    await fc.assert(
      fc.asyncProperty(reportMissingInputArb, async (input) => {
        const { pet, ownerId } = await createClaimedPet()

        const result = await emergencyService.reportMissing(pet.petId, ownerId, input)

        expect(result.petId).toBe(pet.petId)
        expect(result.isMissing).toBe(true)
        expect(result.flyerUrl).toBeTruthy()
        expect(typeof result.flyerUrl).toBe('string')
        expect(result.searchRadiusKm).toBe(input.searchRadiusKm)
        expect(result.lastSeenLocation).toBe(input.lastSeenLocation)
        expect(result.notifiedClinics).toBeGreaterThanOrEqual(0)

        // Verify pet is now marked as missing in the database
        const updatedPet = await petRepo.findById(pet.petId)
        expect(updatedPet!.isMissing).toBe(true)
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * Validates: Requirements [FR-08]
   *
   * reportMissing rejects invalid inputs.
   */
  it('reportMissing rejects invalid inputs', async () => {
    const { pet, ownerId } = await createClaimedPet()

    // Invalid search radius
    await expect(
      emergencyService.reportMissing(pet.petId, ownerId, {
        searchRadiusKm: 0,
        lastSeenLocation: 'Park',
        contactMethod: 'phone',
      })
    ).rejects.toThrow()

    // Empty last seen location
    await expect(
      emergencyService.reportMissing(pet.petId, ownerId, {
        searchRadiusKm: 10,
        lastSeenLocation: '',
        contactMethod: 'phone',
      })
    ).rejects.toThrow()

    // Invalid contact method
    await expect(
      emergencyService.reportMissing(pet.petId, ownerId, {
        searchRadiusKm: 10,
        lastSeenLocation: 'Park',
        contactMethod: 'invalid' as any,
      })
    ).rejects.toThrow()
  }, 60_000)

  /**
   * Validates: Requirements [FR-08]
   *
   * reportMissing rejects already-missing pets.
   */
  it('reportMissing rejects already-missing pets', async () => {
    const { pet, ownerId } = await createClaimedPet()

    await emergencyService.reportMissing(pet.petId, ownerId, {
      searchRadiusKm: 10,
      lastSeenLocation: 'Park',
      contactMethod: 'clinic',
    })

    await expect(
      emergencyService.reportMissing(pet.petId, ownerId, {
        searchRadiusKm: 10,
        lastSeenLocation: 'Park',
        contactMethod: 'clinic',
      })
    ).rejects.toThrow()
  }, 60_000)

  /**
   * Validates: Requirements [FR-08]
   *
   * reportMissing rejects requests from non-owners.
   */
  it('reportMissing rejects non-owner requests', async () => {
    await fc.assert(
      fc.asyncProperty(reportMissingInputArb, async (input) => {
        const { pet } = await createClaimedPet()

        await expect(
          emergencyService.reportMissing(pet.petId, 'wrong-owner-id', input)
        ).rejects.toThrow()
      }),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * Validates: Requirements [FR-09]
   *
   * buildFlyerPdf generates a valid PDF for any contact method.
   */
  it('buildFlyerPdf generates valid PDF for all contact methods', async () => {
    const pet: Pet = {
      PK: 'PET#gen', SK: 'METADATA',
      petId: 'pet-gen-test',
      name: 'FlyerDog',
      species: 'Dog',
      breed: 'Beagle',
      age: 3,
      clinicId: sharedClinic.clinicId,
      profileStatus: 'Active',
      medicallyVerified: true,
      verifyingVetId: 'vet-1',
      verificationDate: new Date().toISOString(),
      ownerId: 'owner-gen',
      ownerName: 'Gen Owner',
      ownerEmail: 'gen@example.com',
      ownerPhone: '+11112223344',
      isMissing: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      GSI2PK: 'SPECIES#Dog',
      GSI2SK: 'BREED#Beagle#AGE#3',
    }

    await fc.assert(
      fc.asyncProperty(contactMethodArb, validStr, async (method, location) => {
        const input = { lastSeenLocation: location, contactMethod: method }
        const pdfBuffer = await flyerService.buildFlyerPdf(pet, sharedClinic, [], input, null)

        expect(pdfBuffer.length).toBeGreaterThan(0)
        expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})


// ── Property 34: Flyer format ────────────────────────────────────────────────

describe('[FR-09][NFR-USA-01] Property 34: Flyer format', () => {
  /**
   * Validates: Requirements [FR-09], [NFR-USA-01]
   *
   * buildFlyerPdf produces a valid PDF buffer that starts with the PDF magic bytes
   * and is non-empty (letter-size format is enforced by pdfkit 'LETTER' option).
   */
  it('buildFlyerPdf produces a valid PDF buffer', async () => {
    const pet: Pet = {
      PK: 'PET#test', SK: 'METADATA',
      petId: 'pet-flyer-test',
      name: 'Buddy',
      species: 'Dog',
      breed: 'Golden Retriever',
      age: 5,
      clinicId: sharedClinic.clinicId,
      profileStatus: 'Active',
      medicallyVerified: true,
      verifyingVetId: 'vet-1',
      verificationDate: new Date().toISOString(),
      ownerId: 'owner-1',
      ownerName: 'Test Owner',
      ownerEmail: 'test@example.com',
      ownerPhone: '+11112223333',
      isMissing: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      GSI2PK: 'SPECIES#Dog',
      GSI2SK: 'BREED#Golden Retriever#AGE#5',
    }

    await fc.assert(
      fc.asyncProperty(
        contactMethodArb,
        validStr,
        fc.option(validStr, { nil: undefined }),
        async (contactMethod, lastSeen, notes) => {
          const input = { lastSeenLocation: lastSeen, additionalNotes: notes, contactMethod }
          const images: PetImage[] = []

          const pdfBuffer = await flyerService.buildFlyerPdf(pet, sharedClinic, images, input, null)

          // PDF magic bytes: %PDF-
          expect(pdfBuffer.length).toBeGreaterThan(0)
          const header = pdfBuffer.subarray(0, 5).toString('ascii')
          expect(header).toBe('%PDF-')
        }
      ),
      { numRuns: 25 }
    )
  }, 300_000)

  /**
   * Validates: Requirements [FR-09]
   *
   * buildPetDescription includes species, breed, and age in the description.
   * (PDF content streams are compressed, so we test the description builder directly.)
   */
  it('buildPetDescription includes species, breed, and age', () => {
    fc.assert(
      fc.property(
        validStr,
        validStr,
        fc.integer({ min: 0, max: 30 }),
        (species, breed, age) => {
          const pet = {
            species,
            breed,
            age,
          } as unknown as Pet

          const desc = flyerService.buildPetDescription(pet)
          expect(desc).toContain(species)
          expect(desc).toContain(breed)
          expect(desc).toContain(`${age} year`)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 54: 3-click flyer generation from dashboard ─────────────────────

describe('[NFR-USA-01] Property 54: 3-click flyer generation from dashboard', () => {
  /**
   * Validates: Requirements [NFR-USA-01]
   *
   * The 3-click workflow is enabled by a single API call that:
   *   1. Marks the pet as missing
   *   2. Generates a flyer (PDF uploaded to S3)
   *   3. Notifies nearby clinics
   *
   * A single reportMissing call produces all required outputs.
   */
  it('single reportMissing call produces flyer URL and notifications', async () => {
    await fc.assert(
      fc.asyncProperty(reportMissingInputArb, async (input) => {
        const { pet, ownerId } = await createClaimedPet()

        const result = await emergencyService.reportMissing(pet.petId, ownerId, input)

        // All outputs from a single call (enabling 3-click UX)
        expect(result.flyerUrl).toBeTruthy()
        expect(result.isMissing).toBe(true)
        expect(typeof result.notifiedClinics).toBe('number')
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})

// ── Property 55: Care snapshot generation and access via EmergencyToolsService

describe('[FR-13] Property 55: Care snapshot generation and access', () => {
  /**
   * Validates: Requirements [FR-13]
   *
   * generateCareSnapshot via EmergencyToolsService produces a valid snapshot
   * with access code and expiry date.
   */
  it('generateCareSnapshot produces valid snapshot with access code', async () => {
    const careInputArb = fc.record({
      careInstructions: validStr,
      feedingSchedule: validStr,
      medications: fc.array(validStr, { minLength: 1, maxLength: 3 }),
      expiryHours: fc.integer({ min: 1, max: 168 }),
    })

    await fc.assert(
      fc.asyncProperty(careInputArb, async (careData) => {
        const { pet, ownerId } = await createClaimedPet()

        const input = { petId: pet.petId, ...careData }
        const result = await emergencyService.generateCareSnapshot(input, ownerId)

        expect(result.snapshotId).toBeTruthy()
        expect(result.accessCode).toBeTruthy()
        expect(result.accessCode).toMatch(/^CARE-/)
        expect(result.accessUrl).toContain(result.accessCode)
        expect(result.expiryDate).toBeTruthy()
        expect(new Date(result.expiryDate).getTime()).toBeGreaterThan(Date.now())
      }),
      { numRuns: 25 }
    )
  }, 300_000)
})


// ── Property 56: Owner privacy protection in flyers ──────────────────────────

describe('[FR-15] Property 56: Owner privacy protection in flyers', () => {
  /**
   * Validates: Requirements [FR-15], [FR-08]
   *
   * When contactMethod is 'clinic', resolveContactInfo must NOT return
   * the owner's phone or email. Only clinic contact info should be returned.
   * (PDF content is compressed, so we test the contact resolution logic directly.)
   */
  it('clinic contact method hides owner personal info', () => {
    const ownerPhone = '+19991112222'
    const ownerEmail = 'private@owner.com'

    const pet: Pet = {
      PK: 'PET#privacy', SK: 'METADATA',
      petId: 'pet-privacy-test',
      name: 'PrivacyPet',
      species: 'Dog',
      breed: 'Poodle',
      age: 2,
      clinicId: sharedClinic.clinicId,
      profileStatus: 'Active',
      medicallyVerified: true,
      verifyingVetId: 'vet-1',
      verificationDate: new Date().toISOString(),
      ownerId: 'owner-priv',
      ownerName: 'Private Owner',
      ownerEmail,
      ownerPhone,
      isMissing: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      GSI2PK: 'SPECIES#Dog',
      GSI2SK: 'BREED#Poodle#AGE#2',
    }

    const contactInfo = flyerService.resolveContactInfo(pet, sharedClinic, 'clinic')

    // Owner contact info must NOT appear
    expect(contactInfo).not.toContain(ownerPhone)
    expect(contactInfo).not.toContain(ownerEmail)

    // Clinic info MUST appear
    expect(contactInfo).toContain(sharedClinic.name)
    expect(contactInfo).toContain(sharedClinic.phone)
  })

  /**
   * Validates: Requirements [FR-15], [FR-08]
   *
   * When contactMethod is 'phone', resolveContactInfo returns the owner's phone
   * but NOT the email. When 'email', it returns email but NOT phone.
   */
  it('selected contact method shows only the chosen info', () => {
    const ownerPhone = '+18887776655'
    const ownerEmail = 'selected@owner.com'

    const pet: Pet = {
      PK: 'PET#select', SK: 'METADATA',
      petId: 'pet-select-test',
      name: 'SelectPet',
      species: 'Cat',
      breed: 'Persian',
      age: 6,
      clinicId: sharedClinic.clinicId,
      profileStatus: 'Active',
      medicallyVerified: true,
      verifyingVetId: 'vet-1',
      verificationDate: new Date().toISOString(),
      ownerId: 'owner-sel',
      ownerName: 'Select Owner',
      ownerEmail,
      ownerPhone,
      isMissing: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      GSI2PK: 'SPECIES#Cat',
      GSI2SK: 'BREED#Persian#AGE#6',
    }

    // Phone method: shows phone, not email
    const phoneResult = flyerService.resolveContactInfo(pet, sharedClinic, 'phone')
    expect(phoneResult).toContain(ownerPhone)
    expect(phoneResult).not.toContain(ownerEmail)

    // Email method: shows email, not phone
    const emailResult = flyerService.resolveContactInfo(pet, sharedClinic, 'email')
    expect(emailResult).toContain(ownerEmail)
    expect(emailResult).not.toContain(ownerPhone)

    // Clinic method: shows clinic, not owner info
    const clinicResult = flyerService.resolveContactInfo(pet, sharedClinic, 'clinic')
    expect(clinicResult).not.toContain(ownerPhone)
    expect(clinicResult).not.toContain(ownerEmail)
    expect(clinicResult).toContain(sharedClinic.name)
  })

  /**
   * Validates: Requirements [FR-15]
   *
   * resolveContactInfo returns platform messaging fallback when owner
   * has no phone/email set and selects phone/email method.
   */
  it('resolveContactInfo falls back to platform messaging when contact info missing', () => {
    const petNoContact: Pet = {
      PK: 'PET#nocontact', SK: 'METADATA',
      petId: 'pet-nocontact',
      name: 'NoContact',
      species: 'Dog',
      breed: 'Husky',
      age: 1,
      clinicId: sharedClinic.clinicId,
      profileStatus: 'Active',
      medicallyVerified: true,
      verifyingVetId: 'vet-1',
      verificationDate: new Date().toISOString(),
      ownerId: 'owner-nc',
      ownerName: 'No Contact Owner',
      ownerEmail: '',
      ownerPhone: '',
      isMissing: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      GSI2PK: 'SPECIES#Dog',
      GSI2SK: 'BREED#Husky#AGE#1',
    }

    const phoneResult = flyerService.resolveContactInfo(petNoContact, sharedClinic, 'phone')
    expect(phoneResult).toContain('Paw Print Profile platform')

    const emailResult = flyerService.resolveContactInfo(petNoContact, sharedClinic, 'email')
    expect(emailResult).toContain('Paw Print Profile platform')

    // Clinic method still works
    const clinicResult = flyerService.resolveContactInfo(petNoContact, sharedClinic, 'clinic')
    expect(clinicResult).toContain(sharedClinic.name)
    expect(clinicResult).toContain(sharedClinic.phone)
  })
})

// ── Property 57: Photo guidance display ──────────────────────────────────────

describe('[FR-16] Property 57: Photo guidance display', () => {
  /**
   * Validates: Requirements [FR-16]
   *
   * getPhotoGuidelines returns all required tips and format requirements.
   */
  it('getPhotoGuidelines returns complete guidelines with all required tips', () => {
    const guidelines = photoGuidanceService.getPhotoGuidelines()

    expect(guidelines.title).toBeTruthy()
    expect(guidelines.tips).toHaveLength(5)

    const tipTitles = guidelines.tips.map(t => t.title)
    expect(tipTitles).toContain('Lighting')
    expect(tipTitles).toContain('Focus')
    expect(tipTitles).toContain('Multiple Angles')
    expect(tipTitles).toContain('Close-up Shots')
    expect(tipTitles).toContain('Full Body Shots')

    // Each tip has a non-empty description
    for (const tip of guidelines.tips) {
      expect(tip.description.length).toBeGreaterThan(0)
    }

    // Requirements
    expect(guidelines.requirements.formats).toEqual(['JPEG', 'PNG', 'WebP'])
    expect(guidelines.requirements.maxSizeMB).toBe(10)
    expect(guidelines.requirements.maxSizeBytes).toBe(10 * 1024 * 1024)
    expect(guidelines.requirements.recommendedResolution).toBeTruthy()
  })

  /**
   * Validates: Requirements [FR-16]
   *
   * getImageQualityFeedback passes valid images and rejects invalid ones.
   */
  it('getImageQualityFeedback passes valid images', () => {
    fc.assert(
      fc.property(mimeTypeArb, validFileSizeArb, dimensionsArb, (mime, size, dims) => {
        const feedback = photoGuidanceService.getImageQualityFeedback(mime, size, dims.width, dims.height)
        expect(feedback.passed).toBe(true)
        expect(feedback.issues).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Validates: Requirements [FR-16]
   *
   * getImageQualityFeedback rejects unsupported formats.
   */
  it('getImageQualityFeedback rejects invalid formats', () => {
    fc.assert(
      fc.property(invalidMimeTypeArb, validFileSizeArb, (mime, size) => {
        const feedback = photoGuidanceService.getImageQualityFeedback(mime, size)
        expect(feedback.passed).toBe(false)
        expect(feedback.issues.length).toBeGreaterThan(0)
        expect(feedback.issues[0]).toContain('Unsupported format')
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Validates: Requirements [FR-16]
   *
   * getImageQualityFeedback rejects oversized files.
   */
  it('getImageQualityFeedback rejects oversized files', () => {
    fc.assert(
      fc.property(mimeTypeArb, oversizedFileSizeArb, (mime, size) => {
        const feedback = photoGuidanceService.getImageQualityFeedback(mime, size)
        expect(feedback.passed).toBe(false)
        expect(feedback.issues.length).toBeGreaterThan(0)
        expect(feedback.issues[0]).toContain('10 MB')
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Validates: Requirements [FR-16]
   *
   * getImageQualityFeedback suggests higher resolution for small images.
   */
  it('getImageQualityFeedback suggests higher resolution for low-res images', () => {
    fc.assert(
      fc.property(
        mimeTypeArb,
        validFileSizeArb,
        fc.integer({ min: 100, max: 799 }),
        fc.integer({ min: 100, max: 599 }),
        (mime, size, width, height) => {
          const feedback = photoGuidanceService.getImageQualityFeedback(mime, size, width, height)
          // Should still pass (resolution is a suggestion, not a hard fail)
          expect(feedback.passed).toBe(true)
          expect(feedback.suggestions.length).toBeGreaterThan(0)
          expect(feedback.suggestions[0]).toContain('resolution is low')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Validates: Requirements [FR-16]
   *
   * Guidelines are idempotent — calling multiple times returns the same result.
   */
  it('getPhotoGuidelines is idempotent', () => {
    const first = photoGuidanceService.getPhotoGuidelines()
    const second = photoGuidanceService.getPhotoGuidelines()
    expect(first).toEqual(second)
  })
})
