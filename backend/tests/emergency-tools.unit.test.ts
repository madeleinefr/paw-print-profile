/**
 * Unit tests for flyer content, care snapshots, and photo guidance.
 *
 * These tests verify specific behaviors without requiring LocalStack/DynamoDB
 * for the flyer and photo guidance portions, and use LocalStack for care snapshot tests.
 *
 * Test coverage:
 * - PDF contains all required information (pet name, species, breed, age, location)
 * - PDF dimensions are letter-size (612 x 792 points)
 * - Care snapshot access code validation
 * - Care snapshot expiry handling
 * - Owner contact information is hidden by default
 * - Photo guidelines are displayed correctly
 *
 * Validates: Requirements [FR-09], [FR-13], [FR-15], [FR-16]
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { FlyerGenerationService, ContactMethod } from '../src/services/flyer-generation-service'
import { PhotoGuidanceService } from '../src/services/photo-guidance-service'
import { CareSnapshotService } from '../src/services/care-snapshot-service'
import { CareSnapshotRepository } from '../src/repositories/care-snapshot-repository'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { PetRepository } from '../src/repositories/pet-repository'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { Pet, Clinic, PetImage } from '../src/models/entities'

// ── Shared test fixtures ─────────────────────────────────────────────────────

const TEST_TABLE = 'VetPetRegistry-UnitTest-Emergency'

const testClinic: Clinic = {
  PK: 'CLINIC#clinic-unit', SK: 'METADATA',
  clinicId: 'clinic-unit',
  name: 'Unit Test Veterinary Clinic',
  address: '456 Test Ave',
  city: 'Testville',
  state: 'TX',
  zipCode: '75001',
  phone: '+15551234567',
  email: 'unit@vetclinic.com',
  licenseNumber: 'VET-TX-UNIT-001',
  latitude: 32.78,
  longitude: -96.80,
  customFields: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  GSI1PK: 'LICENSE#VET-TX-UNIT-001',
  GSI1SK: 'CLINIC#clinic-unit',
}

const testPet: Pet = {
  PK: 'PET#pet-unit', SK: 'METADATA',
  petId: 'pet-unit',
  name: 'Buddy',
  species: 'Dog',
  breed: 'Golden Retriever',
  age: 5,
  clinicId: 'clinic-unit',
  profileStatus: 'Active',
  medicallyVerified: true,
  verifyingVetId: 'vet-unit-1',
  verificationDate: '2024-01-15T10:00:00Z',
  ownerId: 'owner-unit-1',
  ownerName: 'Jane Doe',
  ownerEmail: 'jane@example.com',
  ownerPhone: '+15559876543',
  isMissing: true,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-20T14:00:00Z',
  GSI2PK: 'SPECIES#Dog',
  GSI2SK: 'BREED#Golden Retriever#AGE#5',
}

const testImages: PetImage[] = [
  {
    PK: 'PET#pet-unit', SK: 'IMAGE#img-1',
    imageId: 'img-1',
    s3Key: 'pets/pet-unit/images/img-1.jpg',
    s3Bucket: 'paw-print-profile-images',
    url: 'https://example.com/img-1.jpg',
    tags: ['golden', 'fluffy', 'scar-left-ear'],
    uploadedAt: '2024-01-15T11:00:00Z',
    fileSize: 2048000,
    mimeType: 'image/jpeg',
  },
]

// ── Flyer Content Tests ──────────────────────────────────────────────────────

describe('[FR-09] Flyer content and format', () => {
  const flyerService = new FlyerGenerationService()

  describe('PDF contains all required information', () => {
    it('buildPetDescription includes species, breed, and age', () => {
      const desc = flyerService.buildPetDescription(testPet)
      expect(desc).toContain('Dog')
      expect(desc).toContain('Golden Retriever')
      expect(desc).toContain('5 years old')
    })

    it('buildPetDescription handles singular year', () => {
      const youngPet = { ...testPet, age: 1 }
      const desc = flyerService.buildPetDescription(youngPet)
      expect(desc).toContain('1 year old')
      expect(desc).not.toContain('1 years old')
    })

    it('buildPetDescription handles zero age', () => {
      const puppyPet = { ...testPet, age: 0 }
      const desc = flyerService.buildPetDescription(puppyPet)
      expect(desc).toContain('0 years old')
    })

    it('resolveContactInfo includes phone when phone method selected', () => {
      const info = flyerService.resolveContactInfo(testPet, testClinic, 'phone')
      expect(info).toContain('+15559876543')
    })

    it('resolveContactInfo includes email when email method selected', () => {
      const info = flyerService.resolveContactInfo(testPet, testClinic, 'email')
      expect(info).toContain('jane@example.com')
    })

    it('resolveContactInfo includes clinic info when clinic method selected', () => {
      const info = flyerService.resolveContactInfo(testPet, testClinic, 'clinic')
      expect(info).toContain('Unit Test Veterinary Clinic')
      expect(info).toContain('+15551234567')
    })

    it('PDF with embedded photo is larger than PDF without photo', async () => {
      // Minimal valid 1x1 red PNG (68 bytes)
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
      )

      const input = { lastSeenLocation: 'Park', contactMethod: 'phone' as ContactMethod }

      const pdfWithoutPhoto = await flyerService.buildFlyerPdf(testPet, testClinic, [], input, null)
      const pdfWithPhoto = await flyerService.buildFlyerPdf(testPet, testClinic, [], input, pngBuffer)

      // PDF with an embedded image should be larger
      expect(pdfWithPhoto.length).toBeGreaterThan(pdfWithoutPhoto.length)

      // Both should still be valid PDFs
      expect(pdfWithPhoto.subarray(0, 5).toString('ascii')).toBe('%PDF-')
      expect(pdfWithoutPhoto.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    })
  })

  describe('PDF dimensions are letter-size', () => {
    it('generated PDF has MediaBox [0 0 612 792] (letter-size)', async () => {
      const input = { lastSeenLocation: 'Central Park', contactMethod: 'clinic' as ContactMethod }
      const pdfBuffer = await flyerService.buildFlyerPdf(testPet, testClinic, [], input, null)

      // Check for letter-size MediaBox in PDF structure
      const pdfText = pdfBuffer.toString('latin1')
      expect(pdfText).toContain('/MediaBox [0 0 612 792]')
    })

    it('generated PDF starts with valid PDF header', async () => {
      const input = { lastSeenLocation: 'Downtown', contactMethod: 'phone' as ContactMethod }
      const pdfBuffer = await flyerService.buildFlyerPdf(testPet, testClinic, [], input, null)

      const header = pdfBuffer.subarray(0, 8).toString('ascii')
      expect(header).toMatch(/^%PDF-1\.\d/)
    })

    it('generated PDF ends with %%EOF marker', async () => {
      const input = { lastSeenLocation: 'Beach', contactMethod: 'email' as ContactMethod }
      const pdfBuffer = await flyerService.buildFlyerPdf(testPet, testClinic, [], input, null)

      const tail = pdfBuffer.subarray(-10).toString('ascii')
      expect(tail).toContain('%%EOF')
    })
  })
})


// ── Care Snapshot Tests ──────────────────────────────────────────────────────

describe('[FR-13] Care snapshot access code validation and expiry', () => {
  let initializer: DynamoDBTableInitializer
  let careSnapshotService: CareSnapshotService
  let snapshotRepo: CareSnapshotRepository
  let clinicRepo: ClinicRepository
  let petRepo: PetRepository
  let sharedClinicId: string
  let claimedPetId: string
  let claimedOwnerId: string

  beforeAll(async () => {
    initializer = new DynamoDBTableInitializer(TEST_TABLE)
    await initializer.initializeForTesting({ tableName: TEST_TABLE })
    careSnapshotService = new CareSnapshotService(TEST_TABLE)
    snapshotRepo = new CareSnapshotRepository(TEST_TABLE)
    clinicRepo = new ClinicRepository(TEST_TABLE)
    petRepo = new PetRepository(TEST_TABLE)

    // Create clinic
    const clinic = await clinicRepo.create({
      name: 'Snapshot Unit Clinic',
      address: '789 Unit St',
      city: 'UnitCity',
      state: 'CA',
      zipCode: '90001',
      phone: '+15550001111',
      email: 'snapshot-unit@vet.com',
      licenseNumber: `LIC-UNIT-${Date.now()}`,
      latitude: 34.05,
      longitude: -118.24,
    })
    sharedClinicId = clinic.clinicId

    // Create and claim a pet
    const profile = await petRepo.createMedicalProfile({
      name: 'SnapshotPet',
      species: 'Cat',
      breed: 'Maine Coon',
      age: 4,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-unit-1',
    })
    const claimed = await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Snapshot Owner',
      ownerEmail: 'snapshot@owner.com',
      ownerPhone: '+15552223333',
    }, 'owner-snapshot-unit')
    claimedPetId = profile.petId
    claimedOwnerId = claimed.ownerId
  }, 60_000)

  afterAll(async () => {
    try {
      await initializer.deleteTable(TEST_TABLE)
    } catch (err) {
      console.error('Cleanup error:', err)
    }
  }, 60_000)

  describe('Care snapshot access code validation', () => {
    it('generated access code starts with CARE- prefix', async () => {
      const result = await careSnapshotService.generateCareSnapshot({
        petId: claimedPetId,
        careInstructions: 'Feed twice daily',
        feedingSchedule: '8 AM and 6 PM',
        medications: ['Heartgard'],
        expiryHours: 48,
      }, claimedOwnerId)

      expect(result.accessCode).toMatch(/^CARE-/)
    })

    it('access code is at least 8 characters long', async () => {
      const result = await careSnapshotService.generateCareSnapshot({
        petId: claimedPetId,
        careInstructions: 'Walk 3 times daily',
        feedingSchedule: 'Morning and evening',
        medications: [],
        expiryHours: 24,
      }, claimedOwnerId)

      expect(result.accessCode.length).toBeGreaterThanOrEqual(8)
    })

    it('validateAccessCode returns valid for fresh snapshot', async () => {
      const result = await careSnapshotService.generateCareSnapshot({
        petId: claimedPetId,
        careInstructions: 'Keep indoors',
        feedingSchedule: 'Free feeding',
        medications: ['Flea prevention'],
        expiryHours: 72,
      }, claimedOwnerId)

      const validation = await careSnapshotService.validateAccessCode(result.accessCode)
      expect(validation.valid).toBe(true)
      expect(validation.snapshot).toBeDefined()
      expect(validation.snapshot!.petId).toBe(claimedPetId)
    })

    it('validateAccessCode returns invalid for non-existent code', async () => {
      const validation = await careSnapshotService.validateAccessCode('CARE-NONEXISTENT')
      expect(validation.valid).toBe(false)
      expect(validation.error).toBeTruthy()
    })

    it('validateAccessCode returns invalid for empty code', async () => {
      const validation = await careSnapshotService.validateAccessCode('')
      expect(validation.valid).toBe(false)
      expect(validation.error).toBeTruthy()
    })
  })

  describe('Care snapshot expiry handling', () => {
    it('snapshot expiry date is in the future', async () => {
      const result = await careSnapshotService.generateCareSnapshot({
        petId: claimedPetId,
        careInstructions: 'Medication at noon',
        feedingSchedule: 'Three times daily',
        medications: ['Insulin'],
        expiryHours: 168, // 7 days
      }, claimedOwnerId)

      const expiryDate = new Date(result.expiryDate)
      expect(expiryDate.getTime()).toBeGreaterThan(Date.now())
    })

    it('snapshot expiry respects the requested hours', async () => {
      const expiryHours = 24
      const beforeCreate = Date.now()

      const result = await careSnapshotService.generateCareSnapshot({
        petId: claimedPetId,
        careInstructions: 'Basic care',
        feedingSchedule: 'Twice daily',
        medications: [],
        expiryHours,
      }, claimedOwnerId)

      const expiryDate = new Date(result.expiryDate)
      const expectedMin = beforeCreate + (expiryHours * 60 * 60 * 1000) - 5000 // 5s tolerance
      const expectedMax = Date.now() + (expiryHours * 60 * 60 * 1000) + 5000

      expect(expiryDate.getTime()).toBeGreaterThanOrEqual(expectedMin)
      expect(expiryDate.getTime()).toBeLessThanOrEqual(expectedMax)
    })

    it('deleteExpiredSnapshot does not delete non-expired snapshots', async () => {
      const result = await careSnapshotService.generateCareSnapshot({
        petId: claimedPetId,
        careInstructions: 'Do not delete me',
        feedingSchedule: 'Hourly',
        medications: [],
        expiryHours: 48,
      }, claimedOwnerId)

      // Try to delete — should not delete since it's not expired
      await careSnapshotService.deleteExpiredSnapshot(result.snapshotId)

      // Should still be accessible
      const snapshot = await careSnapshotService.accessCareSnapshot(result.accessCode)
      expect(snapshot).not.toBeNull()
    })
  })
})

// ── Owner Privacy Tests ──────────────────────────────────────────────────────

describe('[FR-15] Owner contact information is hidden by default', () => {
  const flyerService = new FlyerGenerationService()

  it('clinic contact method does not expose owner phone or email', () => {
    const info = flyerService.resolveContactInfo(testPet, testClinic, 'clinic')
    expect(info).not.toContain(testPet.ownerPhone)
    expect(info).not.toContain(testPet.ownerEmail)
    expect(info).toContain(testClinic.name)
  })

  it('falls back to platform messaging when owner has no phone', () => {
    const petNoPhone = { ...testPet, ownerPhone: '' }
    const info = flyerService.resolveContactInfo(petNoPhone, testClinic, 'phone')
    expect(info).toContain('Paw Print Profile platform')
  })

  it('falls back to platform messaging when owner has no email', () => {
    const petNoEmail = { ...testPet, ownerEmail: '' }
    const info = flyerService.resolveContactInfo(petNoEmail, testClinic, 'email')
    expect(info).toContain('Paw Print Profile platform')
  })

  it('falls back to platform messaging when no clinic provided', () => {
    const info = flyerService.resolveContactInfo(testPet, null, 'clinic')
    expect(info).toContain('Paw Print Profile platform')
  })

  it('unknown contact method defaults to platform messaging', () => {
    const info = flyerService.resolveContactInfo(testPet, testClinic, 'unknown' as ContactMethod)
    expect(info).toContain('Paw Print Profile platform')
  })
})

// ── Photo Guidelines Tests ───────────────────────────────────────────────────

describe('[FR-16] Photo guidelines are displayed correctly', () => {
  const photoService = new PhotoGuidanceService()

  it('returns exactly 5 photography tips', () => {
    const guidelines = photoService.getPhotoGuidelines()
    expect(guidelines.tips).toHaveLength(5)
  })

  it('includes all required tip categories', () => {
    const guidelines = photoService.getPhotoGuidelines()
    const titles = guidelines.tips.map(t => t.title)
    expect(titles).toContain('Lighting')
    expect(titles).toContain('Focus')
    expect(titles).toContain('Multiple Angles')
    expect(titles).toContain('Close-up Shots')
    expect(titles).toContain('Full Body Shots')
  })

  it('specifies correct supported formats', () => {
    const guidelines = photoService.getPhotoGuidelines()
    expect(guidelines.requirements.formats).toEqual(['JPEG', 'PNG', 'WebP'])
  })

  it('specifies 10MB size limit', () => {
    const guidelines = photoService.getPhotoGuidelines()
    expect(guidelines.requirements.maxSizeMB).toBe(10)
    expect(guidelines.requirements.maxSizeBytes).toBe(10 * 1024 * 1024)
  })

  it('includes a recommended resolution', () => {
    const guidelines = photoService.getPhotoGuidelines()
    expect(guidelines.requirements.recommendedResolution).toBeTruthy()
  })

  it('each tip has a non-empty title and description', () => {
    const guidelines = photoService.getPhotoGuidelines()
    for (const tip of guidelines.tips) {
      expect(tip.title.length).toBeGreaterThan(0)
      expect(tip.description.length).toBeGreaterThan(0)
    }
  })

  it('quality feedback passes a valid JPEG under 10MB', () => {
    const feedback = photoService.getImageQualityFeedback('image/jpeg', 5 * 1024 * 1024, 1920, 1080)
    expect(feedback.passed).toBe(true)
    expect(feedback.issues).toHaveLength(0)
  })

  it('quality feedback rejects a GIF', () => {
    const feedback = photoService.getImageQualityFeedback('image/gif', 1024)
    expect(feedback.passed).toBe(false)
    expect(feedback.issues[0]).toContain('Unsupported format')
  })

  it('quality feedback rejects a file over 10MB', () => {
    const feedback = photoService.getImageQualityFeedback('image/png', 11 * 1024 * 1024)
    expect(feedback.passed).toBe(false)
    expect(feedback.issues[0]).toContain('10 MB')
  })

  it('quality feedback suggests higher resolution for small images', () => {
    const feedback = photoService.getImageQualityFeedback('image/jpeg', 500 * 1024, 320, 240)
    expect(feedback.passed).toBe(true) // low res is a suggestion, not a failure
    expect(feedback.suggestions[0]).toContain('resolution is low')
  })

  it('quality feedback reports both format and size issues together', () => {
    const feedback = photoService.getImageQualityFeedback('image/gif', 15 * 1024 * 1024)
    expect(feedback.passed).toBe(false)
    expect(feedback.issues.length).toBe(2)
  })
})
