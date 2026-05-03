/**
 * Property-based tests for NotificationService
 *
 * Properties covered:
 *   Property 20: Pet onboarding notification
 *   Property 30: Appointment reminder timing
 *   Property 35: Geographic clinic notification
 *   Property 36: Found pet notification
 *
 * Validates: Requirements:  [FR-03], [FR-06], [FR-08], [FR-10]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { Pet, Clinic, VaccineRecord } from '../src/models/entities'
import type {
  OnboardingConfirmationInput,
  AppointmentReminderInput,
  MissingPetAlertInput,
  PetFoundNotificationInput,
} from '../src/services/notification-service'

// ── Mock AWS SDK before importing the service ────────────────────────────────

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PublishCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'Publish' })),
  CreateTopicCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'CreateTopic' })),
  SubscribeCommand: vi.fn(),
}))

vi.mock('../src/infrastructure/aws-client-factory', () => ({
  AWSClientFactory: vi.fn().mockImplementation(() => ({
    createSNSClient: vi.fn().mockReturnValue({ send: mockSend }),
  })),
}))

vi.mock('../src/infrastructure/environment-detector', () => ({
  EnvironmentDetector: {
    getInstance: vi.fn().mockReturnValue({
      isLocal: vi.fn().mockReturnValue(true),
      getServiceEndpoint: vi.fn().mockReturnValue('http://localhost:4566'),
      getRegion: vi.fn().mockReturnValue('us-east-1'),
      getConfig: vi.fn().mockReturnValue({ region: 'us-east-1' }),
    }),
  },
}))

// Import after mocks are set up
const { NotificationService } = await import('../src/services/notification-service')

// ── Arbitraries ──────────────────────────────────────────────────────────────

const nonEmptyStr = fc
  .stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{0,18}[a-zA-Z0-9]$/)
  .filter((s) => s.trim().length > 0)

const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.stringMatching(/^[a-z]{2,4}$/)
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

const speciesArb = fc.constantFrom('Dog', 'Cat', 'Bird', 'Rabbit', 'Hamster')
const breedArb = fc.constantFrom('Labrador', 'Siamese', 'Parrot', 'Angora', 'Syrian')

const petArb: fc.Arbitrary<Pet> = fc.record({
  PK: nonEmptyStr.map((id) => `PET#${id}`),
  SK: fc.constant('METADATA'),
  petId: nonEmptyStr,
  name: nonEmptyStr,
  species: speciesArb,
  breed: breedArb,
  age: fc.integer({ min: 0, max: 25 }),
  clinicId: nonEmptyStr,
  profileStatus: fc.constantFrom('Pending Claim' as const, 'Active' as const, 'Inactive' as const),
  medicallyVerified: fc.boolean(),
  verifyingVetId: nonEmptyStr,
  verificationDate: fc.constant('2024-01-15T10:00:00Z'),
  ownerId: nonEmptyStr,
  ownerName: nonEmptyStr,
  ownerEmail: validEmailArb,
  ownerPhone: fc.integer({ min: 1000000000, max: 9999999999 }).map((n) => `+${n}`),
  isMissing: fc.boolean(),
  createdAt: fc.constant('2024-01-15T10:00:00Z'),
  updatedAt: fc.constant('2024-01-15T10:00:00Z'),
  GSI2PK: speciesArb.map((s) => `SPECIES#${s}`),
  GSI2SK: fc.constant('BREED#Lab#AGE#3'),
})

const clinicArb: fc.Arbitrary<Clinic> = fc.record({
  PK: nonEmptyStr.map((id) => `CLINIC#${id}`),
  SK: fc.constant('METADATA'),
  clinicId: nonEmptyStr,
  name: nonEmptyStr,
  address: nonEmptyStr,
  city: nonEmptyStr,
  state: fc.stringMatching(/^[A-Z]{2}$/),
  zipCode: fc.stringMatching(/^[0-9]{5}$/),
  phone: fc.integer({ min: 1000000000, max: 9999999999 }).map((n) => `+${n}`),
  email: validEmailArb,
  licenseNumber: nonEmptyStr.map((s) => `VET-${s}`),
  latitude: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
  customFields: fc.constant([]),
  createdAt: fc.constant('2024-01-01T00:00:00Z'),
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
  GSI1PK: nonEmptyStr.map((s) => `LICENSE#VET-${s}`),
  GSI1SK: nonEmptyStr.map((s) => `CLINIC#${s}`),
})

const vaccineArb: fc.Arbitrary<VaccineRecord> = fc.record({
  PK: nonEmptyStr.map((id) => `PET#${id}`),
  SK: nonEmptyStr.map((id) => `VACCINE#${id}`),
  vaccineId: nonEmptyStr,
  vaccineName: fc.constantFrom('Rabies', 'Distemper', 'Parvovirus', 'Bordetella', 'Leptospirosis'),
  administeredDate: fc.constant('2024-01-15'),
  nextDueDate: fc.constant('2025-01-15'),
  veterinarianName: nonEmptyStr.map((s) => `Dr. ${s}`),
  createdAt: fc.constant('2024-01-15T10:00:00Z'),
})

const claimingCodeArb = fc
  .stringMatching(/^[A-Z0-9]{6}$/)
  .map((s) => `CLAIM-${s}`)

/** Generate a list of N unique clinics */
const clinicListArb = (minLen: number, maxLen: number) =>
  fc.integer({ min: minLen, max: maxLen }).chain((n) =>
    fc.array(clinicArb, { minLength: n, maxLength: n }).map((clinics) =>
      clinics.map((c, i) => ({
        ...c,
        clinicId: `clinic-${i}`,
        PK: `CLINIC#clinic-${i}`,
        email: `clinic${i}@vet.com`,
        name: `Clinic ${i}`,
      }))
    )
  )

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService Property Tests', () => {
  let service: InstanceType<typeof NotificationService>

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: SNS calls succeed
    mockSend.mockResolvedValue({
      TopicArn: 'arn:aws:sns:us-east-1:000000000000:paw-print-notifications',
      MessageId: 'msg-test-123',
    })
    service = new NotificationService()
  })

  // ── Property 20: Pet onboarding notification ─────────────────────────────

  describe('Property 20: Pet onboarding notification', () => {
    /**
     * **Validates: [FR-03]**
     *
     * For any valid pet and clinic, onboarding confirmation always returns
     * success with recipientCount >= 1.
     */
    it('for any valid pet and clinic, onboarding confirmation returns success with recipientCount >= 1', async () => {
      await fc.assert(
        fc.asyncProperty(petArb, clinicArb, claimingCodeArb, async (pet, clinic, claimingCode) => {
          const input: OnboardingConfirmationInput = { pet, clinic, claimingCode }
          const result = await service.sendPetOnboardingConfirmation(input)

          expect(result.success).toBe(true)
          expect(result.recipientCount).toBeGreaterThanOrEqual(1)
          expect(result.timestamp).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-03]**
     *
     * Onboarding notification results always include a valid ISO timestamp.
     */
    it('onboarding notification results always include a valid ISO timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(petArb, clinicArb, claimingCodeArb, async (pet, clinic, claimingCode) => {
          const input: OnboardingConfirmationInput = { pet, clinic, claimingCode }
          const result = await service.sendPetOnboardingConfirmation(input)

          expect(result.timestamp).toBeTruthy()
          expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-03]**
     *
     * Onboarding notification failures never throw — they return a result object.
     */
    it('onboarding notification failures never throw', async () => {
      mockSend.mockRejectedValue(new Error('SNS unavailable'))

      await fc.assert(
        fc.asyncProperty(petArb, clinicArb, claimingCodeArb, async (pet, clinic, claimingCode) => {
          const input: OnboardingConfirmationInput = { pet, clinic, claimingCode }
          const result = await service.sendPetOnboardingConfirmation(input)

          // In local mode, failures fall back to log channel — still success
          expect(result).toBeDefined()
          expect(typeof result.success).toBe('boolean')
          expect(result.timestamp).toBeTruthy()
        }),
        { numRuns: 100 }
      )
    })
  })

  // ── Property 30: Appointment reminder timing ────────────────────────────

  describe('Property 30: Appointment reminder timing', () => {
    /**
     * **Validates: [FR-06]**
     *
     * For any valid pet, vaccine, and daysUntilDue, appointment reminder
     * always returns success.
     */
    it('for any valid pet, vaccine, and daysUntilDue, appointment reminder returns success', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          vaccineArb,
          validEmailArb,
          fc.integer({ min: 0, max: 365 }),
          async (pet, vaccine, ownerEmail, daysUntilDue) => {
            const input: AppointmentReminderInput = {
              pet,
              vaccine,
              ownerEmail,
              daysUntilDue,
            }
            const result = await service.sendAppointmentReminder(input)

            expect(result.success).toBe(true)
            expect(result.recipientCount).toBe(1)
            expect(result.timestamp).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-06]**
     *
     * Appointment reminder results always include a valid ISO timestamp.
     */
    it('appointment reminder results always include a valid ISO timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          vaccineArb,
          validEmailArb,
          fc.integer({ min: 0, max: 365 }),
          async (pet, vaccine, ownerEmail, daysUntilDue) => {
            const input: AppointmentReminderInput = {
              pet,
              vaccine,
              ownerEmail,
              daysUntilDue,
            }
            const result = await service.sendAppointmentReminder(input)

            expect(result.timestamp).toBeTruthy()
            expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-06]**
     *
     * Appointment reminder failures never throw.
     */
    it('appointment reminder failures never throw', async () => {
      mockSend.mockRejectedValue(new Error('Email delivery failed'))

      await fc.assert(
        fc.asyncProperty(
          petArb,
          vaccineArb,
          validEmailArb,
          fc.integer({ min: 0, max: 365 }),
          async (pet, vaccine, ownerEmail, daysUntilDue) => {
            const input: AppointmentReminderInput = {
              pet,
              vaccine,
              ownerEmail,
              daysUntilDue,
            }
            const result = await service.sendAppointmentReminder(input)

            expect(result).toBeDefined()
            expect(typeof result.success).toBe('boolean')
            expect(result.timestamp).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // ── Property 35: Geographic clinic notification ──────────────────────────

  describe('Property 35: Geographic clinic notification', () => {
    /**
     * **Validates: [FR-08]**
     *
     * For any list of nearby clinics, missing pet alert recipientCount
     * equals the number of clinics (when SNS succeeds).
     */
    it('missing pet alert recipientCount equals the number of nearby clinics', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          clinicListArb(1, 10),
          fc.integer({ min: 1, max: 200 }),
          nonEmptyStr,
          async (pet, nearbyClinics, searchRadiusKm, lastSeenLocation) => {
            const input: MissingPetAlertInput = {
              pet: { ...pet, isMissing: true },
              nearbyClinics,
              searchRadiusKm,
              lastSeenLocation,
            }
            const result = await service.sendMissingPetAlert(input)

            expect(result.success).toBe(true)
            expect(result.recipientCount).toBe(nearbyClinics.length)
            expect(result.channel).toBe('sns')
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-08]**
     *
     * Empty clinic lists return recipientCount 0 and success true.
     */
    it('empty clinic lists return recipientCount 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          fc.integer({ min: 1, max: 200 }),
          nonEmptyStr,
          async (pet, searchRadiusKm, lastSeenLocation) => {
            const input: MissingPetAlertInput = {
              pet: { ...pet, isMissing: true },
              nearbyClinics: [],
              searchRadiusKm,
              lastSeenLocation,
            }
            const result = await service.sendMissingPetAlert(input)

            expect(result.success).toBe(true)
            expect(result.recipientCount).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-08]**
     *
     * Missing pet alert results always include a valid ISO timestamp.
     */
    it('missing pet alert results always include a valid ISO timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          clinicListArb(0, 5),
          fc.integer({ min: 1, max: 200 }),
          nonEmptyStr,
          async (pet, nearbyClinics, searchRadiusKm, lastSeenLocation) => {
            const input: MissingPetAlertInput = {
              pet: { ...pet, isMissing: true },
              nearbyClinics,
              searchRadiusKm,
              lastSeenLocation,
            }
            const result = await service.sendMissingPetAlert(input)

            expect(result.timestamp).toBeTruthy()
            expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // ── Property 36: Found pet notification ──────────────────────────────────

  describe('Property 36: Found pet notification', () => {
    /**
     * **Validates: [FR-10]**
     *
     * For any list of previously alerted clinics, found notification
     * recipientCount equals the number of clinics (when SNS succeeds).
     */
    it('found notification recipientCount equals the number of previously alerted clinics', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          clinicListArb(1, 10),
          async (pet, previouslyAlertedClinics) => {
            const input: PetFoundNotificationInput = {
              pet,
              previouslyAlertedClinics,
            }
            const result = await service.sendPetFoundNotification(input)

            expect(result.success).toBe(true)
            expect(result.recipientCount).toBe(previouslyAlertedClinics.length)
            expect(result.channel).toBe('sns')
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-10]**
     *
     * Empty clinic lists return recipientCount 0 and success true.
     */
    it('empty clinic lists return recipientCount 0', async () => {
      await fc.assert(
        fc.asyncProperty(petArb, async (pet) => {
          const input: PetFoundNotificationInput = {
            pet,
            previouslyAlertedClinics: [],
          }
          const result = await service.sendPetFoundNotification(input)

          expect(result.success).toBe(true)
          expect(result.recipientCount).toBe(0)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-10]**
     *
     * Found pet notification results always include a valid ISO timestamp.
     */
    it('found notification results always include a valid ISO timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(
          petArb,
          clinicListArb(0, 5),
          async (pet, previouslyAlertedClinics) => {
            const input: PetFoundNotificationInput = {
              pet,
              previouslyAlertedClinics,
            }
            const result = await service.sendPetFoundNotification(input)

            expect(result.timestamp).toBeTruthy()
            expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: [FR-10]**
     *
     * Found pet notification failures never throw.
     */
    it('found notification failures never throw', async () => {
      mockSend.mockImplementation((cmd: any) => {
        if (cmd._type === 'CreateTopic') {
          return Promise.resolve({
            TopicArn: 'arn:aws:sns:us-east-1:000000000000:paw-print-notifications',
          })
        }
        return Promise.reject(new Error('SNS down'))
      })

      await fc.assert(
        fc.asyncProperty(
          petArb,
          clinicListArb(1, 5),
          async (pet, previouslyAlertedClinics) => {
            const input: PetFoundNotificationInput = {
              pet,
              previouslyAlertedClinics,
            }
            const result = await service.sendPetFoundNotification(input)

            expect(result).toBeDefined()
            expect(typeof result.success).toBe('boolean')
            expect(result.timestamp).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
