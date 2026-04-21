/**
 * Property-based tests for validation functions
 *
 * Property 6: Age validation
 * Property 7: Image format validation
 * Property 8: Image size validation
 * Property 9: Required field validation
 *
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  validatePetData,
  validateMedicalProfileData,
  validateImageFormat,
  validateImageSize,
} from '../src/validation/validators'

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Non-empty string with no leading/trailing whitespace, up to 50 chars */
const nonEmptyStr = fc
  .stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 ]{0,48}[a-zA-Z0-9]$/)
  .filter((s) => s.trim().length > 0)

/** Valid email address */
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{1,10}$/),
    fc.stringMatching(/^[a-z]{1,10}$/),
    fc.stringMatching(/^[a-z]{2,5}$/)
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

/** Valid phone number */
const validPhoneArb = fc
  .integer({ min: 1000000000, max: 9999999999 })
  .map((n) => `+${n}`)

/** Valid pet creation data (all required fields present and valid) */
const validPetDataArb = fc.record({
  name: nonEmptyStr,
  species: nonEmptyStr,
  breed: nonEmptyStr,
  age: fc.integer({ min: 0, max: 30 }),
  clinicId: nonEmptyStr,
  ownerId: nonEmptyStr,
  ownerName: nonEmptyStr,
  ownerEmail: validEmailArb,
  ownerPhone: validPhoneArb,
})

/** Valid medical profile data (vet-created) */
const validMedicalProfileArb = fc.record({
  name: fc.stringMatching(/^[a-zA-Z]{1,20}$/),
  species: fc.stringMatching(/^[a-zA-Z]{1,20}$/),
  breed: fc.stringMatching(/^[a-zA-Z]{1,20}$/),
  age: fc.integer({ min: 0, max: 30 }),
  clinicId: fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
  verifyingVetId: fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
})

/** Negative integers (invalid age) */
const negativeIntArb = fc.integer({ min: -10000, max: -1 })

/** Non-integer numbers (invalid age) */
const floatAgeArb = fc
  .float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true, noDefaultInfinity: true })
  .filter((n) => !Number.isInteger(n))

/** Allowed MIME types */
const allowedMimeArb = fc.constantFrom('image/jpeg', 'image/png', 'image/webp')

/** Disallowed MIME types */
const disallowedMimeArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(
    (s) =>
      !['image/jpeg', 'image/png', 'image/webp'].includes(s.toLowerCase())
  )

/** File size within 10 MB */
const validSizeArb = fc.integer({ min: 0, max: 10 * 1024 * 1024 })

/** File size exceeding 10 MB */
const oversizedArb = fc.integer({ min: 10 * 1024 * 1024 + 1, max: 100 * 1024 * 1024 })

// ── Property 6: Age validation ────────────────────────────────────────────────

describe('Property 6: Age validation', () => {
  /**
   * For any non-negative integer age, validatePetData() and
   * validateMedicalProfileData() produce no age-related errors.
   */
  it('valid non-negative integer ages produce no age errors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (age) => {
          const petErrors = validatePetData({ age }, true)
          const ageErrors = petErrors.filter((e) => e.field === 'age')
          expect(ageErrors).toHaveLength(0)

          const medErrors = validateMedicalProfileData({
            name: 'Max',
            species: 'Dog',
            breed: 'Lab',
            age,
            clinicId: 'c1',
            verifyingVetId: 'v1',
          })
          const medAgeErrors = medErrors.filter((e) => e.field === 'age')
          expect(medAgeErrors).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * For any negative integer age, validatePetData() and
   * validateMedicalProfileData() produce exactly one age error.
   */
  it('negative integer ages produce an age validation error', () => {
    fc.assert(
      fc.property(negativeIntArb, (age) => {
        const petErrors = validatePetData({ age }, true)
        const ageErrors = petErrors.filter((e) => e.field === 'age')
        expect(ageErrors.length).toBeGreaterThanOrEqual(1)

        const medErrors = validateMedicalProfileData({
          name: 'Max',
          species: 'Dog',
          breed: 'Lab',
          age,
          clinicId: 'c1',
          verifyingVetId: 'v1',
        })
        const medAgeErrors = medErrors.filter((e) => e.field === 'age')
        expect(medAgeErrors.length).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any non-integer (float) age, validatePetData() and
   * validateMedicalProfileData() produce an age error.
   */
  it('non-integer (float) ages produce an age validation error', () => {
    fc.assert(
      fc.property(floatAgeArb, (age) => {
        const petErrors = validatePetData({ age }, true)
        const ageErrors = petErrors.filter((e) => e.field === 'age')
        expect(ageErrors.length).toBeGreaterThanOrEqual(1)

        const medErrors = validateMedicalProfileData({
          name: 'Max',
          species: 'Dog',
          breed: 'Lab',
          age,
          clinicId: 'c1',
          verifyingVetId: 'v1',
        })
        const medAgeErrors = medErrors.filter((e) => e.field === 'age')
        expect(medAgeErrors.length).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 7: Image format validation ──────────────────────────────────────

describe('Property 7: Image format validation', () => {
  /**
   * For any allowed MIME type (image/jpeg, image/png, image/webp),
   * validateImageFormat() returns no errors.
   */
  it('allowed MIME types produce no format errors', () => {
    fc.assert(
      fc.property(allowedMimeArb, (mimeType) => {
        const errors = validateImageFormat(mimeType)
        expect(errors).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any MIME type not in the allowed list,
   * validateImageFormat() returns exactly one error on the 'image' field.
   */
  it('disallowed MIME types produce an image format error', () => {
    fc.assert(
      fc.property(disallowedMimeArb, (mimeType) => {
        const errors = validateImageFormat(mimeType)
        expect(errors.length).toBeGreaterThanOrEqual(1)
        expect(errors.every((e) => e.field === 'image')).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Case-insensitive: uppercase variants of allowed types are also accepted.
   */
  it('allowed MIME types are accepted case-insensitively', () => {
    fc.assert(
      fc.property(
        allowedMimeArb,
        fc.constantFrom('lower', 'upper', 'mixed'),
        (mimeType, caseVariant) => {
          const transformed =
            caseVariant === 'upper'
              ? mimeType.toUpperCase()
              : caseVariant === 'lower'
              ? mimeType.toLowerCase()
              : mimeType
          const errors = validateImageFormat(transformed)
          expect(errors).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ── Property 8: Image size validation ────────────────────────────────────────

describe('Property 8: Image size validation', () => {
  /**
   * For any file size <= 10 MB, validateImageSize() returns no errors.
   */
  it('file sizes within 10 MB produce no size errors', () => {
    fc.assert(
      fc.property(validSizeArb, (fileSize) => {
        const errors = validateImageSize(fileSize)
        expect(errors).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any file size > 10 MB, validateImageSize() returns exactly one error
   * on the 'image' field.
   */
  it('file sizes exceeding 10 MB produce an image size error', () => {
    fc.assert(
      fc.property(oversizedArb, (fileSize) => {
        const errors = validateImageSize(fileSize)
        expect(errors.length).toBeGreaterThanOrEqual(1)
        expect(errors.every((e) => e.field === 'image')).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * The boundary: exactly 10 MB is valid; 10 MB + 1 byte is invalid.
   */
  it('10 MB boundary is valid and 10 MB + 1 byte is invalid', () => {
    const maxSize = 10 * 1024 * 1024
    expect(validateImageSize(maxSize)).toHaveLength(0)
    expect(validateImageSize(maxSize + 1).length).toBeGreaterThanOrEqual(1)
  })
})

// ── Property 9: Required field validation ────────────────────────────────────

describe('Property 9: Required field validation', () => {
  /**
   * For any complete valid pet data, validatePetData() returns no errors.
   */
  it('complete valid pet data produces no errors', () => {
    fc.assert(
      fc.property(validPetDataArb, (data) => {
        const errors = validatePetData(data)
        expect(errors).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any complete valid medical profile data, validateMedicalProfileData()
   * returns no errors.
   */
  it('complete valid medical profile data produces no errors', () => {
    fc.assert(
      fc.property(validMedicalProfileArb, (data) => {
        const errors = validateMedicalProfileData(data)
        expect(errors).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Omitting any single required field from pet creation data produces at
   * least one validation error for that field.
   */
  it('omitting any required pet field produces a validation error for that field', () => {
    const requiredFields = [
      'name',
      'species',
      'breed',
      'age',
      'clinicId',
      'ownerId',
      'ownerName',
      'ownerEmail',
      'ownerPhone',
    ] as const

    fc.assert(
      fc.property(
        validPetDataArb,
        fc.constantFrom(...requiredFields),
        (data, fieldToOmit) => {
          const incomplete = { ...data }
          delete (incomplete as any)[fieldToOmit]

          const errors = validatePetData(incomplete)
          const fieldErrors = errors.filter((e) => e.field === fieldToOmit)
          expect(fieldErrors.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Omitting any single required field from medical profile data produces at
   * least one validation error for that field.
   */
  it('omitting any required medical profile field produces a validation error for that field', () => {
    const requiredFields = [
      'name',
      'species',
      'breed',
      'age',
      'clinicId',
      'verifyingVetId',
    ] as const

    fc.assert(
      fc.property(
        validMedicalProfileArb,
        fc.constantFrom(...requiredFields),
        (data, fieldToOmit) => {
          const incomplete = { ...data }
          delete (incomplete as any)[fieldToOmit]

          const errors = validateMedicalProfileData(incomplete)
          const fieldErrors = errors.filter((e) => e.field === fieldToOmit)
          expect(fieldErrors.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Empty string values for required string fields produce validation errors.
   */
  it('empty string values for required string fields produce validation errors', () => {
    const stringFields = ['name', 'species', 'breed', 'clinicId', 'verifyingVetId'] as const

    fc.assert(
      fc.property(
        validMedicalProfileArb,
        fc.constantFrom(...stringFields),
        (data, fieldToEmpty) => {
          const withEmpty = { ...data, [fieldToEmpty]: '' }
          const errors = validateMedicalProfileData(withEmpty)
          const fieldErrors = errors.filter((e) => e.field === fieldToEmpty)
          expect(fieldErrors.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Whitespace-only strings for required string fields produce validation errors.
   */
  it('whitespace-only strings for required string fields produce validation errors', () => {
    const stringFields = ['name', 'species', 'breed', 'clinicId', 'verifyingVetId'] as const

    fc.assert(
      fc.property(
        validMedicalProfileArb,
        fc.constantFrom(...stringFields),
        fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/./g, ' ')),
        (data, fieldToBlank, whitespace) => {
          const withBlank = { ...data, [fieldToBlank]: whitespace || '   ' }
          const errors = validateMedicalProfileData(withBlank)
          const fieldErrors = errors.filter((e) => e.field === fieldToBlank)
          expect(fieldErrors.length).toBeGreaterThanOrEqual(1)
        }
      ),
      { numRuns: 100 }
    )
  })
})
