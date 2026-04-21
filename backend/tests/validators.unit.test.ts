/**
 * Unit tests for validation edge cases
 * 
 * Tests empty strings, null values, boundary conditions, and various invalid formats
 */

import { describe, it, expect } from 'vitest'
import {
  validatePetData,
  validateClinicData,
  validateImageFormat,
  validateImageSize,
  validateVaccineData,
  validateSurgeryData,
  validateSearchCriteria,
  validateMedicalProfileData,
  validateClaimProfileData,
  validateEnrichProfileData,
  validateCareSnapshotData,
  ValidationException,
  throwIfInvalid,
} from '../src/validation/validators'

// ── Pet Data Validation Edge Cases ──────────────────────────────────────────

describe('validatePetData - Edge Cases', () => {
  describe('Empty string handling', () => {
    it('rejects empty string for name', () => {
      const data = {
        name: '',
        species: 'Dog',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'name')).toBe(true)
    })

    it('rejects empty string for species', () => {
      const data = {
        name: 'Max',
        species: '',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'species')).toBe(true)
    })

    it('rejects empty string for breed', () => {
      const data = {
        name: 'Max',
        species: 'Dog',
        breed: '',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'breed')).toBe(true)
    })
  })

  describe('Whitespace-only string handling', () => {
    it('rejects whitespace-only name', () => {
      const data = {
        name: '   ',
        species: 'Dog',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'name')).toBe(true)
    })

    it('rejects whitespace-only species', () => {
      const data = {
        name: 'Max',
        species: '\t\n  ',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'species')).toBe(true)
    })
  })

  describe('Null and undefined handling', () => {
    it('rejects null for required name field', () => {
      const data = {
        name: null,
        species: 'Dog',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'name')).toBe(true)
    })

    it('rejects undefined for required age field', () => {
      const data = {
        name: 'Max',
        species: 'Dog',
        breed: 'Lab',
        age: undefined,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'age')).toBe(true)
    })

    it('rejects null for age field', () => {
      const data = {
        name: 'Max',
        species: 'Dog',
        breed: 'Lab',
        age: null,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'age')).toBe(true)
    })
  })

  describe('Age boundary conditions', () => {
    it('accepts age of 0', () => {
      const data = {
        name: 'Max',
        species: 'Dog',
        breed: 'Lab',
        age: 0,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.filter(e => e.field === 'age')).toHaveLength(0)
    })

    it('rejects age of -1', () => {
      const data = { age: -1 }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'age')).toBe(true)
    })

    it('rejects fractional age', () => {
      const data = { age: 3.5 }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'age')).toBe(true)
    })

    it('rejects NaN for age', () => {
      const data = { age: NaN }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'age')).toBe(true)
    })

    it('rejects Infinity for age', () => {
      const data = { age: Infinity }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'age')).toBe(true)
    })
  })

  describe('String length boundary conditions', () => {
    it('accepts name with exactly 100 characters', () => {
      const data = {
        name: 'a'.repeat(100),
        species: 'Dog',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.filter(e => e.field === 'name')).toHaveLength(0)
    })

    it('rejects name with 101 characters', () => {
      const data = {
        name: 'a'.repeat(101),
        species: 'Dog',
        breed: 'Lab',
        age: 3,
        clinicId: 'c1',
        ownerId: 'o1',
        ownerName: 'John',
        ownerEmail: 'john@example.com',
        ownerPhone: '+1234567890',
      }
      const errors = validatePetData(data)
      expect(errors.some(e => e.field === 'name')).toBe(true)
    })

    it('accepts species with exactly 50 characters', () => {
      const data = { species: 'a'.repeat(50) }
      const errors = validatePetData(data, true)
      expect(errors.filter(e => e.field === 'species')).toHaveLength(0)
    })

    it('rejects species with 51 characters', () => {
      const data = { species: 'a'.repeat(51) }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'species')).toBe(true)
    })

    it('accepts breed with exactly 100 characters', () => {
      const data = { breed: 'a'.repeat(100) }
      const errors = validatePetData(data, true)
      expect(errors.filter(e => e.field === 'breed')).toHaveLength(0)
    })

    it('rejects breed with 101 characters', () => {
      const data = { breed: 'a'.repeat(101) }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'breed')).toBe(true)
    })
  })

  describe('Email validation edge cases', () => {
    it('rejects email without @ symbol', () => {
      const data = { ownerEmail: 'invalidemail.com' }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'ownerEmail')).toBe(true)
    })

    it('rejects email without domain', () => {
      const data = { ownerEmail: 'user@' }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'ownerEmail')).toBe(true)
    })

    it('rejects email without TLD', () => {
      const data = { ownerEmail: 'user@domain' }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'ownerEmail')).toBe(true)
    })

    it('rejects email with spaces', () => {
      const data = { ownerEmail: 'user name@domain.com' }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'ownerEmail')).toBe(true)
    })

    it('accepts valid email with subdomain', () => {
      const data = { ownerEmail: 'user@mail.example.com' }
      const errors = validatePetData(data, true)
      expect(errors.filter(e => e.field === 'ownerEmail')).toHaveLength(0)
    })
  })

  describe('Phone validation edge cases', () => {
    it('rejects phone with less than 10 digits', () => {
      const data = { ownerPhone: '123456789' }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'ownerPhone')).toBe(true)
    })

    it('accepts phone with exactly 10 digits', () => {
      const data = { ownerPhone: '1234567890' }
      const errors = validatePetData(data, true)
      expect(errors.filter(e => e.field === 'ownerPhone')).toHaveLength(0)
    })

    it('accepts phone with country code', () => {
      const data = { ownerPhone: '+11234567890' }
      const errors = validatePetData(data, true)
      expect(errors.filter(e => e.field === 'ownerPhone')).toHaveLength(0)
    })

    it('accepts phone with formatting', () => {
      const data = { ownerPhone: '+1 (123) 456-7890' }
      const errors = validatePetData(data, true)
      expect(errors.filter(e => e.field === 'ownerPhone')).toHaveLength(0)
    })

    it('rejects phone with letters', () => {
      const data = { ownerPhone: '123-456-ABCD' }
      const errors = validatePetData(data, true)
      expect(errors.some(e => e.field === 'ownerPhone')).toBe(true)
    })
  })
})

// ── Image Validation Edge Cases ─────────────────────────────────────────────

describe('validateImageFormat - Edge Cases', () => {
  it('accepts image/jpeg', () => {
    const errors = validateImageFormat('image/jpeg')
    expect(errors).toHaveLength(0)
  })

  it('accepts image/png', () => {
    const errors = validateImageFormat('image/png')
    expect(errors).toHaveLength(0)
  })

  it('accepts image/webp', () => {
    const errors = validateImageFormat('image/webp')
    expect(errors).toHaveLength(0)
  })

  it('accepts IMAGE/JPEG (uppercase)', () => {
    const errors = validateImageFormat('IMAGE/JPEG')
    expect(errors).toHaveLength(0)
  })

  it('accepts Image/Png (mixed case)', () => {
    const errors = validateImageFormat('Image/Png')
    expect(errors).toHaveLength(0)
  })

  it('rejects image/gif', () => {
    const errors = validateImageFormat('image/gif')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].field).toBe('image')
  })

  it('rejects image/bmp', () => {
    const errors = validateImageFormat('image/bmp')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects image/svg+xml', () => {
    const errors = validateImageFormat('image/svg+xml')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects image/tiff', () => {
    const errors = validateImageFormat('image/tiff')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects application/pdf', () => {
    const errors = validateImageFormat('application/pdf')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects text/plain', () => {
    const errors = validateImageFormat('text/plain')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects empty string', () => {
    const errors = validateImageFormat('')
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects random string', () => {
    const errors = validateImageFormat('not-a-mime-type')
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe('validateImageSize - Edge Cases', () => {
  const TEN_MB = 10 * 1024 * 1024

  it('accepts 0 bytes', () => {
    const errors = validateImageSize(0)
    expect(errors).toHaveLength(0)
  })

  it('accepts 1 byte', () => {
    const errors = validateImageSize(1)
    expect(errors).toHaveLength(0)
  })

  it('accepts exactly 10 MB', () => {
    const errors = validateImageSize(TEN_MB)
    expect(errors).toHaveLength(0)
  })

  it('rejects 10 MB + 1 byte', () => {
    const errors = validateImageSize(TEN_MB + 1)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].field).toBe('image')
  })

  it('rejects 11 MB', () => {
    const errors = validateImageSize(11 * 1024 * 1024)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects 100 MB', () => {
    const errors = validateImageSize(100 * 1024 * 1024)
    expect(errors.length).toBeGreaterThan(0)
  })
})

// ── Clinic Data Validation Edge Cases ───────────────────────────────────────

describe('validateClinicData - Edge Cases', () => {
  describe('Coordinate boundary conditions', () => {
    it('accepts latitude of -90', () => {
      const data = { latitude: -90 }
      const errors = validateClinicData(data, true)
      expect(errors.filter(e => e.field === 'latitude')).toHaveLength(0)
    })

    it('accepts latitude of 90', () => {
      const data = { latitude: 90 }
      const errors = validateClinicData(data, true)
      expect(errors.filter(e => e.field === 'latitude')).toHaveLength(0)
    })

    it('rejects latitude of -90.1', () => {
      const data = { latitude: -90.1 }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'latitude')).toBe(true)
    })

    it('rejects latitude of 90.1', () => {
      const data = { latitude: 90.1 }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'latitude')).toBe(true)
    })

    it('accepts longitude of -180', () => {
      const data = { longitude: -180 }
      const errors = validateClinicData(data, true)
      expect(errors.filter(e => e.field === 'longitude')).toHaveLength(0)
    })

    it('accepts longitude of 180', () => {
      const data = { longitude: 180 }
      const errors = validateClinicData(data, true)
      expect(errors.filter(e => e.field === 'longitude')).toHaveLength(0)
    })

    it('rejects longitude of -180.1', () => {
      const data = { longitude: -180.1 }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'longitude')).toBe(true)
    })

    it('rejects longitude of 180.1', () => {
      const data = { longitude: 180.1 }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'longitude')).toBe(true)
    })
  })

  describe('ZIP code validation', () => {
    it('accepts 5-digit ZIP code', () => {
      const data = { zipCode: '12345' }
      const errors = validateClinicData(data, true)
      expect(errors.filter(e => e.field === 'zipCode')).toHaveLength(0)
    })

    it('accepts ZIP+4 format', () => {
      const data = { zipCode: '12345-6789' }
      const errors = validateClinicData(data, true)
      expect(errors.filter(e => e.field === 'zipCode')).toHaveLength(0)
    })

    it('rejects 4-digit ZIP code', () => {
      const data = { zipCode: '1234' }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'zipCode')).toBe(true)
    })

    it('rejects 6-digit ZIP code', () => {
      const data = { zipCode: '123456' }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'zipCode')).toBe(true)
    })

    it('rejects ZIP code with letters', () => {
      const data = { zipCode: '1234A' }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'zipCode')).toBe(true)
    })

    it('rejects ZIP code with spaces', () => {
      const data = { zipCode: '12 345' }
      const errors = validateClinicData(data, true)
      expect(errors.some(e => e.field === 'zipCode')).toBe(true)
    })
  })
})

// ── Search Criteria Validation Edge Cases ───────────────────────────────────

describe('validateSearchCriteria - Edge Cases', () => {
  it('accepts ageMin of 0', () => {
    const data = { ageMin: 0 }
    const errors = validateSearchCriteria(data)
    expect(errors.filter(e => e.field === 'ageMin')).toHaveLength(0)
  })

  it('rejects negative ageMin', () => {
    const data = { ageMin: -1 }
    const errors = validateSearchCriteria(data)
    expect(errors.some(e => e.field === 'ageMin')).toBe(true)
  })

  it('rejects ageMin greater than ageMax', () => {
    const data = { ageMin: 10, ageMax: 5 }
    const errors = validateSearchCriteria(data)
    expect(errors.some(e => e.field === 'ageRange')).toBe(true)
  })

  it('accepts ageMin equal to ageMax', () => {
    const data = { ageMin: 5, ageMax: 5 }
    const errors = validateSearchCriteria(data)
    expect(errors.filter(e => e.field === 'ageRange')).toHaveLength(0)
  })

  it('rejects tags as non-array', () => {
    const data = { tags: 'brown' }
    const errors = validateSearchCriteria(data)
    expect(errors.some(e => e.field === 'tags')).toBe(true)
  })

  it('rejects tags array with non-string elements', () => {
    const data = { tags: ['brown', 123, 'white'] }
    const errors = validateSearchCriteria(data)
    expect(errors.some(e => e.field === 'tags')).toBe(true)
  })

  it('accepts empty tags array', () => {
    const data = { tags: [] }
    const errors = validateSearchCriteria(data)
    expect(errors.filter(e => e.field === 'tags')).toHaveLength(0)
  })
})

// ── Care Snapshot Validation Edge Cases ─────────────────────────────────────

describe('validateCareSnapshotData - Edge Cases', () => {
  it('accepts expiryHours of 1', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: [],
      expiryHours: 1,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.filter(e => e.field === 'expiryHours')).toHaveLength(0)
  })

  it('accepts expiryHours of 168 (1 week)', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: [],
      expiryHours: 168,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.filter(e => e.field === 'expiryHours')).toHaveLength(0)
  })

  it('rejects expiryHours of 0', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: [],
      expiryHours: 0,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.some(e => e.field === 'expiryHours')).toBe(true)
  })

  it('rejects expiryHours of 169', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: [],
      expiryHours: 169,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.some(e => e.field === 'expiryHours')).toBe(true)
  })

  it('rejects negative expiryHours', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: [],
      expiryHours: -1,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.some(e => e.field === 'expiryHours')).toBe(true)
  })

  it('accepts empty medications array', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: [],
      expiryHours: 24,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.filter(e => e.field === 'medications')).toHaveLength(0)
  })

  it('rejects medications as non-array', () => {
    const data = {
      petId: 'pet1',
      careInstructions: 'Feed twice daily',
      feedingSchedule: '8 AM and 6 PM',
      medications: 'Heartgard',
      expiryHours: 24,
    }
    const errors = validateCareSnapshotData(data)
    expect(errors.some(e => e.field === 'medications')).toBe(true)
  })
})

// ── ValidationException Tests ───────────────────────────────────────────────

describe('ValidationException', () => {
  it('creates exception with validation errors', () => {
    const errors = [
      { field: 'name', message: 'Name is required' },
      { field: 'age', message: 'Age must be positive' },
    ]
    const exception = new ValidationException(errors)
    
    expect(exception.name).toBe('ValidationException')
    expect(exception.message).toBe('Validation failed')
    expect(exception.validationErrors).toEqual(errors)
  })

  it('is an instance of Error', () => {
    const exception = new ValidationException([])
    expect(exception).toBeInstanceOf(Error)
  })
})

describe('throwIfInvalid', () => {
  it('throws ValidationException when errors exist', () => {
    const errors = [{ field: 'name', message: 'Name is required' }]
    expect(() => throwIfInvalid(errors)).toThrow(ValidationException)
  })

  it('does not throw when no errors', () => {
    expect(() => throwIfInvalid([])).not.toThrow()
  })

  it('thrown exception contains all errors', () => {
    const errors = [
      { field: 'name', message: 'Name is required' },
      { field: 'age', message: 'Age must be positive' },
    ]
    
    try {
      throwIfInvalid(errors)
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationException)
      expect((e as ValidationException).validationErrors).toEqual(errors)
    }
  })
})
