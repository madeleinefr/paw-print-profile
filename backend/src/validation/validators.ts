/**
 * Validation functions for pet data and other entities
 * 
 * Provides comprehensive validation for all user inputs including
 * pet data, clinic data, and image uploads.
 */

export interface ValidationError {
  field: string
  message: string
}

export class ValidationException extends Error {
  public validationErrors: ValidationError[]

  constructor(errors: ValidationError[]) {
    super('Validation failed')
    this.name = 'ValidationException'
    this.validationErrors = errors
  }
}

/**
 * Validate pet data for creation or update
 */
export function validatePetData(data: any, isUpdate: boolean = false): ValidationError[] {
  const errors: ValidationError[] = []

  // Required fields for creation
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Pet name is required and must be a non-empty string' })
    }

    if (!data.species || typeof data.species !== 'string' || data.species.trim().length === 0) {
      errors.push({ field: 'species', message: 'Species is required and must be a non-empty string' })
    }

    if (!data.breed || typeof data.breed !== 'string' || data.breed.trim().length === 0) {
      errors.push({ field: 'breed', message: 'Breed is required and must be a non-empty string' })
    }

    if (data.age === undefined || data.age === null) {
      errors.push({ field: 'age', message: 'Age is required' })
    }

    if (!data.clinicId || typeof data.clinicId !== 'string' || data.clinicId.trim().length === 0) {
      errors.push({ field: 'clinicId', message: 'Clinic ID is required and must be a non-empty string' })
    }

    if (!data.ownerId || typeof data.ownerId !== 'string' || data.ownerId.trim().length === 0) {
      errors.push({ field: 'ownerId', message: 'Owner ID is required and must be a non-empty string' })
    }

    if (!data.ownerName || typeof data.ownerName !== 'string' || data.ownerName.trim().length === 0) {
      errors.push({ field: 'ownerName', message: 'Owner name is required and must be a non-empty string' })
    }

    if (!data.ownerEmail || typeof data.ownerEmail !== 'string' || data.ownerEmail.trim().length === 0) {
      errors.push({ field: 'ownerEmail', message: 'Owner email is required and must be a non-empty string' })
    }

    if (!data.ownerPhone || typeof data.ownerPhone !== 'string' || data.ownerPhone.trim().length === 0) {
      errors.push({ field: 'ownerPhone', message: 'Owner phone is required and must be a non-empty string' })
    }
  }

  // Validate age (required for both creation and update if provided)
  if (data.age !== undefined && data.age !== null) {
    if (typeof data.age !== 'number' || !Number.isInteger(data.age) || data.age < 0) {
      errors.push({ field: 'age', message: 'Age must be a non-negative integer' })
    }
  }

  // Validate name length if provided
  if (data.name !== undefined && typeof data.name === 'string' && data.name.length > 100) {
    errors.push({ field: 'name', message: 'Pet name must be 100 characters or less' })
  }

  // Validate species if provided
  if (data.species !== undefined && typeof data.species === 'string' && data.species.length > 50) {
    errors.push({ field: 'species', message: 'Species must be 50 characters or less' })
  }

  // Validate breed if provided
  if (data.breed !== undefined && typeof data.breed === 'string' && data.breed.length > 100) {
    errors.push({ field: 'breed', message: 'Breed must be 100 characters or less' })
  }

  // Validate email format if provided
  if (data.ownerEmail !== undefined && typeof data.ownerEmail === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.ownerEmail)) {
      errors.push({ field: 'ownerEmail', message: 'Owner email must be a valid email address' })
    }
  }

  // Validate phone format if provided
  if (data.ownerPhone !== undefined && typeof data.ownerPhone === 'string') {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
    if (!phoneRegex.test(data.ownerPhone)) {
      errors.push({ field: 'ownerPhone', message: 'Owner phone must be a valid phone number' })
    }
  }

  return errors
}

/**
 * Validate clinic data for creation or update
 */
export function validateClinicData(data: any, isUpdate: boolean = false): ValidationError[] {
  const errors: ValidationError[] = []

  // Required fields for creation
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Clinic name is required and must be a non-empty string' })
    }

    if (!data.address || typeof data.address !== 'string' || data.address.trim().length === 0) {
      errors.push({ field: 'address', message: 'Address is required and must be a non-empty string' })
    }

    if (!data.city || typeof data.city !== 'string' || data.city.trim().length === 0) {
      errors.push({ field: 'city', message: 'City is required and must be a non-empty string' })
    }

    if (!data.state || typeof data.state !== 'string' || data.state.trim().length === 0) {
      errors.push({ field: 'state', message: 'State is required and must be a non-empty string' })
    }

    if (!data.zipCode || typeof data.zipCode !== 'string' || data.zipCode.trim().length === 0) {
      errors.push({ field: 'zipCode', message: 'ZIP code is required and must be a non-empty string' })
    }

    if (!data.phone || typeof data.phone !== 'string' || data.phone.trim().length === 0) {
      errors.push({ field: 'phone', message: 'Phone is required and must be a non-empty string' })
    }

    if (!data.email || typeof data.email !== 'string' || data.email.trim().length === 0) {
      errors.push({ field: 'email', message: 'Email is required and must be a non-empty string' })
    }

    if (!data.licenseNumber || typeof data.licenseNumber !== 'string' || data.licenseNumber.trim().length === 0) {
      errors.push({ field: 'licenseNumber', message: 'License number is required and must be a non-empty string' })
    }

    if (data.latitude === undefined || data.latitude === null) {
      errors.push({ field: 'latitude', message: 'Latitude is required' })
    }

    if (data.longitude === undefined || data.longitude === null) {
      errors.push({ field: 'longitude', message: 'Longitude is required' })
    }
  }

  // Validate email format if provided
  if (data.email !== undefined && typeof data.email === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      errors.push({ field: 'email', message: 'Email must be a valid email address' })
    }
  }

  // Validate phone format if provided
  if (data.phone !== undefined && typeof data.phone === 'string') {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
    if (!phoneRegex.test(data.phone)) {
      errors.push({ field: 'phone', message: 'Phone must be a valid phone number' })
    }
  }

  // Validate latitude if provided
  if (data.latitude !== undefined && data.latitude !== null) {
    if (typeof data.latitude !== 'number' || data.latitude < -90 || data.latitude > 90) {
      errors.push({ field: 'latitude', message: 'Latitude must be a number between -90 and 90' })
    }
  }

  // Validate longitude if provided
  if (data.longitude !== undefined && data.longitude !== null) {
    if (typeof data.longitude !== 'number' || data.longitude < -180 || data.longitude > 180) {
      errors.push({ field: 'longitude', message: 'Longitude must be a number between -180 and 180' })
    }
  }

  // Validate ZIP code format if provided
  if (data.zipCode !== undefined && typeof data.zipCode === 'string') {
    const zipRegex = /^\d{5}(-\d{4})?$/
    if (!zipRegex.test(data.zipCode)) {
      errors.push({ field: 'zipCode', message: 'ZIP code must be in format 12345 or 12345-6789' })
    }
  }

  return errors
}

/**
 * Validate image format
 */
export function validateImageFormat(mimeType: string): ValidationError[] {
  const errors: ValidationError[] = []
  const allowedFormats = ['image/jpeg', 'image/png', 'image/webp']

  if (!allowedFormats.includes(mimeType.toLowerCase())) {
    errors.push({
      field: 'image',
      message: 'Image format must be JPEG, PNG, or WebP'
    })
  }

  return errors
}

/**
 * Validate image size (10MB limit)
 */
export function validateImageSize(fileSize: number): ValidationError[] {
  const errors: ValidationError[] = []
  const maxSize = 10 * 1024 * 1024 // 10MB in bytes

  if (fileSize > maxSize) {
    errors.push({
      field: 'image',
      message: 'Image size must be 10MB or less'
    })
  }

  return errors
}

/**
 * Validate vaccine record data
 */
export function validateVaccineData(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.vaccineName || typeof data.vaccineName !== 'string' || data.vaccineName.trim().length === 0) {
    errors.push({ field: 'vaccineName', message: 'Vaccine name is required and must be a non-empty string' })
  }

  if (!data.administeredDate || typeof data.administeredDate !== 'string') {
    errors.push({ field: 'administeredDate', message: 'Administered date is required and must be a valid date string' })
  } else {
    // Validate date format (ISO 8601)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(data.administeredDate)) {
      errors.push({ field: 'administeredDate', message: 'Administered date must be in YYYY-MM-DD format' })
    }
  }

  if (!data.nextDueDate || typeof data.nextDueDate !== 'string') {
    errors.push({ field: 'nextDueDate', message: 'Next due date is required and must be a valid date string' })
  } else {
    // Validate date format (ISO 8601)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(data.nextDueDate)) {
      errors.push({ field: 'nextDueDate', message: 'Next due date must be in YYYY-MM-DD format' })
    }
  }

  if (!data.veterinarianName || typeof data.veterinarianName !== 'string' || data.veterinarianName.trim().length === 0) {
    errors.push({ field: 'veterinarianName', message: 'Veterinarian name is required and must be a non-empty string' })
  }

  return errors
}

/**
 * Validate surgery record data
 */
export function validateSurgeryData(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.surgeryType || typeof data.surgeryType !== 'string' || data.surgeryType.trim().length === 0) {
    errors.push({ field: 'surgeryType', message: 'Surgery type is required and must be a non-empty string' })
  }

  if (!data.surgeryDate || typeof data.surgeryDate !== 'string') {
    errors.push({ field: 'surgeryDate', message: 'Surgery date is required and must be a valid date string' })
  } else {
    // Validate date format (ISO 8601)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(data.surgeryDate)) {
      errors.push({ field: 'surgeryDate', message: 'Surgery date must be in YYYY-MM-DD format' })
    }
  }

  if (!data.veterinarianName || typeof data.veterinarianName !== 'string' || data.veterinarianName.trim().length === 0) {
    errors.push({ field: 'veterinarianName', message: 'Veterinarian name is required and must be a non-empty string' })
  }

  // Notes and recovery info are optional but should be strings if provided
  if (data.notes !== undefined && typeof data.notes !== 'string') {
    errors.push({ field: 'notes', message: 'Notes must be a string if provided' })
  }

  if (data.recoveryInfo !== undefined && typeof data.recoveryInfo !== 'string') {
    errors.push({ field: 'recoveryInfo', message: 'Recovery info must be a string if provided' })
  }

  return errors
}

/**
 * Validate search criteria
 */
export function validateSearchCriteria(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (data.ageMin !== undefined && (typeof data.ageMin !== 'number' || data.ageMin < 0)) {
    errors.push({ field: 'ageMin', message: 'Minimum age must be a non-negative number' })
  }

  if (data.ageMax !== undefined && (typeof data.ageMax !== 'number' || data.ageMax < 0)) {
    errors.push({ field: 'ageMax', message: 'Maximum age must be a non-negative number' })
  }

  if (data.ageMin !== undefined && data.ageMax !== undefined && data.ageMin > data.ageMax) {
    errors.push({ field: 'ageRange', message: 'Minimum age cannot be greater than maximum age' })
  }

  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    errors.push({ field: 'tags', message: 'Tags must be an array of strings' })
  } else if (data.tags !== undefined) {
    const invalidTags = data.tags.filter((tag: any) => typeof tag !== 'string')
    if (invalidTags.length > 0) {
      errors.push({ field: 'tags', message: 'All tags must be strings' })
    }
  }

  return errors
}

/**
 * Validate medical profile data for creation (veterinarian)
 */
export function validateMedicalProfileData(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Pet name is required and must be a non-empty string' })
  }

  if (!data.species || typeof data.species !== 'string' || data.species.trim().length === 0) {
    errors.push({ field: 'species', message: 'Species is required and must be a non-empty string' })
  }

  if (!data.breed || typeof data.breed !== 'string' || data.breed.trim().length === 0) {
    errors.push({ field: 'breed', message: 'Breed is required and must be a non-empty string' })
  }

  if (data.age === undefined || data.age === null) {
    errors.push({ field: 'age', message: 'Age is required' })
  } else if (typeof data.age !== 'number' || !Number.isInteger(data.age) || data.age < 0) {
    errors.push({ field: 'age', message: 'Age must be a non-negative integer' })
  }

  if (!data.clinicId || typeof data.clinicId !== 'string' || data.clinicId.trim().length === 0) {
    errors.push({ field: 'clinicId', message: 'Clinic ID is required and must be a non-empty string' })
  }

  if (!data.verifyingVetId || typeof data.verifyingVetId !== 'string' || data.verifyingVetId.trim().length === 0) {
    errors.push({ field: 'verifyingVetId', message: 'Verifying veterinarian ID is required and must be a non-empty string' })
  }

  // Validate field lengths
  if (data.name && data.name.length > 100) {
    errors.push({ field: 'name', message: 'Pet name must be 100 characters or less' })
  }

  if (data.species && data.species.length > 50) {
    errors.push({ field: 'species', message: 'Species must be 50 characters or less' })
  }

  if (data.breed && data.breed.length > 100) {
    errors.push({ field: 'breed', message: 'Breed must be 100 characters or less' })
  }

  return errors
}

/**
 * Validate claim profile data (pet owner)
 */
export function validateClaimProfileData(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.claimingCode || typeof data.claimingCode !== 'string' || data.claimingCode.trim().length === 0) {
    errors.push({ field: 'claimingCode', message: 'Claiming code is required and must be a non-empty string' })
  }

  if (!data.ownerName || typeof data.ownerName !== 'string' || data.ownerName.trim().length === 0) {
    errors.push({ field: 'ownerName', message: 'Owner name is required and must be a non-empty string' })
  }

  if (!data.ownerEmail || typeof data.ownerEmail !== 'string' || data.ownerEmail.trim().length === 0) {
    errors.push({ field: 'ownerEmail', message: 'Owner email is required and must be a non-empty string' })
  }

  if (!data.ownerPhone || typeof data.ownerPhone !== 'string' || data.ownerPhone.trim().length === 0) {
    errors.push({ field: 'ownerPhone', message: 'Owner phone is required and must be a non-empty string' })
  }

  // Validate email format
  if (data.ownerEmail && typeof data.ownerEmail === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.ownerEmail)) {
      errors.push({ field: 'ownerEmail', message: 'Owner email must be a valid email address' })
    }
  }

  // Validate phone format
  if (data.ownerPhone && typeof data.ownerPhone === 'string') {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
    if (!phoneRegex.test(data.ownerPhone)) {
      errors.push({ field: 'ownerPhone', message: 'Owner phone must be a valid phone number' })
    }
  }

  return errors
}

/**
 * Validate enrich profile data (pet owner)
 */
export function validateEnrichProfileData(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  // All fields are optional for enrichment, but validate format if provided
  if (data.ownerName !== undefined && (typeof data.ownerName !== 'string' || data.ownerName.trim().length === 0)) {
    errors.push({ field: 'ownerName', message: 'Owner name must be a non-empty string if provided' })
  }

  if (data.ownerEmail !== undefined && typeof data.ownerEmail === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.ownerEmail)) {
      errors.push({ field: 'ownerEmail', message: 'Owner email must be a valid email address' })
    }
  }

  if (data.ownerPhone !== undefined && typeof data.ownerPhone === 'string') {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
    if (!phoneRegex.test(data.ownerPhone)) {
      errors.push({ field: 'ownerPhone', message: 'Owner phone must be a valid phone number' })
    }
  }

  return errors
}

/**
 * Validate care snapshot data
 */
export function validateCareSnapshotData(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.petId || typeof data.petId !== 'string' || data.petId.trim().length === 0) {
    errors.push({ field: 'petId', message: 'Pet ID is required and must be a non-empty string' })
  }

  if (!data.careInstructions || typeof data.careInstructions !== 'string' || data.careInstructions.trim().length === 0) {
    errors.push({ field: 'careInstructions', message: 'Care instructions are required and must be a non-empty string' })
  }

  if (!data.feedingSchedule || typeof data.feedingSchedule !== 'string' || data.feedingSchedule.trim().length === 0) {
    errors.push({ field: 'feedingSchedule', message: 'Feeding schedule is required and must be a non-empty string' })
  }

  if (!data.medications || !Array.isArray(data.medications)) {
    errors.push({ field: 'medications', message: 'Medications must be an array of strings' })
  } else {
    const invalidMedications = data.medications.filter((med: any) => typeof med !== 'string')
    if (invalidMedications.length > 0) {
      errors.push({ field: 'medications', message: 'All medications must be strings' })
    }
  }

  if (data.expiryHours === undefined || data.expiryHours === null) {
    errors.push({ field: 'expiryHours', message: 'Expiry hours is required' })
  } else if (typeof data.expiryHours !== 'number' || data.expiryHours <= 0 || data.expiryHours > 168) {
    errors.push({ field: 'expiryHours', message: 'Expiry hours must be a number between 1 and 168 (1 week)' })
  }

  return errors
}

/**
 * Throw ValidationException if there are validation errors
 */
export function throwIfInvalid(errors: ValidationError[]): void {
  if (errors.length > 0) {
    throw new ValidationException(errors)
  }
}