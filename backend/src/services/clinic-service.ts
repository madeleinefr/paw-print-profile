/**
 * ClinicService - Business logic layer for clinic management
 * 
 * Orchestrates clinic operations including validation, data persistence,
 * and integration with pet management.
 */

import { ClinicRepository } from '../repositories/clinic-repository'
import { PetRepository } from '../repositories/pet-repository'
import {
  Clinic,
  Pet,
  CreateClinicInput,
  UpdateClinicInput,
  PaginationParams,
  PaginatedResponse,
} from '../models/entities'
import {
  validateClinicData,
  throwIfInvalid,
  ValidationException,
} from '../validation/validators'

export class ClinicService {
  private clinicRepo: ClinicRepository
  private petRepo: PetRepository

  constructor(tableName?: string) {
    this.clinicRepo = new ClinicRepository(tableName)
    this.petRepo = new PetRepository(tableName)
  }

  /**
   * Create a new clinic with validation and license number uniqueness check.
   *
   * @param input - Clinic details (name, address, phone, license, coordinates)
   * @returns The created clinic record
   * @throws ValidationException if input is invalid or license number already exists
   */
  async create(input: CreateClinicInput): Promise<Clinic> {
    // Validate input data
    const validationErrors = validateClinicData(input, false)
    throwIfInvalid(validationErrors)

    // Check for license number uniqueness
    const existingClinic = await this.clinicRepo.findByLicenseNumber(input.licenseNumber)
    if (existingClinic) {
      throw new ValidationException([
        { field: 'licenseNumber', message: 'A clinic with this license number already exists' }
      ])
    }

    // Create the clinic
    return await this.clinicRepo.create(input)
  }

  /**
   * Find a clinic by ID.
   *
   * @param clinicId - The clinic's unique identifier
   * @returns The clinic record or null if not found
   */
  async findById(clinicId: string): Promise<Clinic | null> {
    return await this.clinicRepo.findById(clinicId)
  }

  /**
   * Find a clinic by license number.
   *
   * @param licenseNumber - The clinic's veterinary license number
   * @returns The clinic record or null if not found
   */
  async findByLicenseNumber(licenseNumber: string): Promise<Clinic | null> {
    return await this.clinicRepo.findByLicenseNumber(licenseNumber)
  }

  /**
   * Update a clinic with validation.
   *
   * @param clinicId - The clinic to update
   * @param updates - Partial fields to update
   * @returns The updated clinic record
   * @throws ValidationException if input is invalid or clinic not found
   */
  async update(clinicId: string, updates: UpdateClinicInput): Promise<Clinic> {
    // Validate input data
    const validationErrors = validateClinicData(updates, true)
    throwIfInvalid(validationErrors)

    // Verify clinic exists
    const existingClinic = await this.clinicRepo.findById(clinicId)
    if (!existingClinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    // Update the clinic
    return await this.clinicRepo.update(clinicId, updates)
  }

  /**
   * Delete a clinic. Fails if clinic has assigned pets.
   *
   * @param clinicId - The clinic to delete
   * @throws ValidationException if clinic not found or has assigned pets
   */
  async delete(clinicId: string): Promise<void> {
    // Verify clinic exists
    const existingClinic = await this.clinicRepo.findById(clinicId)
    if (!existingClinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    // Check if clinic has any pets assigned
    const petsPage = await this.petRepo.findByClinic(clinicId, { page: 1, limit: 1 })
    if (petsPage.items.length > 0) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Cannot delete clinic with assigned pets. Transfer pets to another clinic first.' }
      ])
    }

    // Delete the clinic
    await this.clinicRepo.delete(clinicId)
  }

  /**
   * Get all pets assigned to a clinic with pagination.
   *
   * @param clinicId - The clinic to query
   * @param pagination - Page number and limit
   * @returns Paginated list of pets
   * @throws ValidationException if clinic not found
   */
  async getPets(clinicId: string, pagination: PaginationParams): Promise<PaginatedResponse<Pet>> {
    // Verify clinic exists
    const clinic = await this.clinicRepo.findById(clinicId)
    if (!clinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    return await this.petRepo.findByClinic(clinicId, pagination)
  }

  /**
   * Get clinic statistics (total pets, species breakdown, recent additions).
   *
   * @param clinicId - The clinic to get stats for
   * @returns Object with totalPets, petsBySpecies map, and recentPets array
   * @throws ValidationException if clinic not found
   */
  async getStatistics(clinicId: string): Promise<{
    totalPets: number
    petsBySpecies: Record<string, number>
    recentPets: Pet[]
  }> {
    // Verify clinic exists
    const clinic = await this.clinicRepo.findById(clinicId)
    if (!clinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    // Get all pets for the clinic (for statistics, we'll get all pages)
    let allPets: Pet[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const petsPage = await this.petRepo.findByClinic(clinicId, { page, limit: 100 })
      allPets = allPets.concat(petsPage.items)
      hasMore = petsPage.pagination.hasNext
      page++
    }

    // Calculate statistics
    const petsBySpecies: Record<string, number> = {}
    allPets.forEach(pet => {
      petsBySpecies[pet.species] = (petsBySpecies[pet.species] || 0) + 1
    })

    // Get recent pets (last 10, sorted by creation date)
    const recentPets = allPets
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)

    return {
      totalPets: allPets.length,
      petsBySpecies,
      recentPets,
    }
  }

  /**
   * Find nearby clinics within a radius.
   *
   * @param latitude - Center point latitude (-90 to 90)
   * @param longitude - Center point longitude (-180 to 180)
   * @param radiusKm - Search radius in kilometers (must be > 0)
   * @returns Array of clinics within the radius
   * @throws ValidationException if coordinates or radius are invalid
   */
  async findNearby(latitude: number, longitude: number, radiusKm: number): Promise<Clinic[]> {
    // Validate coordinates
    if (latitude < -90 || latitude > 90) {
      throw new ValidationException([
        { field: 'latitude', message: 'Latitude must be between -90 and 90' }
      ])
    }

    if (longitude < -180 || longitude > 180) {
      throw new ValidationException([
        { field: 'longitude', message: 'Longitude must be between -180 and 180' }
      ])
    }

    if (radiusKm <= 0) {
      throw new ValidationException([
        { field: 'radiusKm', message: 'Radius must be greater than 0' }
      ])
    }

    return await this.clinicRepo.findNearby(latitude, longitude, radiusKm)
  }

  /**
   * Update clinic custom fields configuration.
   *
   * @param clinicId - The clinic to update
   * @param customFields - Array of field definitions (fieldName, fieldType, required)
   * @returns The updated clinic record
   * @throws ValidationException if clinic not found or fields are invalid
   */
  async updateCustomFields(clinicId: string, customFields: any[]): Promise<Clinic> {
    // Verify clinic exists
    const existingClinic = await this.clinicRepo.findById(clinicId)
    if (!existingClinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    // Validate custom fields structure
    const validationErrors = this.validateCustomFields(customFields)
    throwIfInvalid(validationErrors)

    // Update the clinic
    return await this.clinicRepo.update(clinicId, { customFields })
  }

  /**
   * Validate custom fields configuration
   */
  private validateCustomFields(customFields: any[]): any[] {
    const errors: any[] = []

    if (!Array.isArray(customFields)) {
      errors.push({ field: 'customFields', message: 'Custom fields must be an array' })
      return errors
    }

    customFields.forEach((field, index) => {
      if (!field.fieldName || typeof field.fieldName !== 'string') {
        errors.push({ 
          field: `customFields[${index}].fieldName`, 
          message: 'Field name is required and must be a string' 
        })
      }

      if (!field.fieldType || !['text', 'number', 'date', 'boolean'].includes(field.fieldType)) {
        errors.push({ 
          field: `customFields[${index}].fieldType`, 
          message: 'Field type must be one of: text, number, date, boolean' 
        })
      }

      if (field.required !== undefined && typeof field.required !== 'boolean') {
        errors.push({ 
          field: `customFields[${index}].required`, 
          message: 'Required field must be a boolean' 
        })
      }
    })

    // Check for duplicate field names
    const fieldNames = customFields.map(field => field.fieldName).filter(Boolean)
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index)
    if (duplicates.length > 0) {
      errors.push({ 
        field: 'customFields', 
        message: `Duplicate field names found: ${duplicates.join(', ')}` 
      })
    }

    return errors
  }

  /**
   * Get all pending (unclaimed) pet profiles for a clinic dashboard.
   *
   * @param clinicId - The clinic to query
   * @returns Array of pets with 'Pending Claim' status
   * @throws ValidationException if clinic not found
   *
   * Requirements: [FR-01], [FR-02]
   */
  async getPendingClaims(clinicId: string): Promise<Pet[]> {
    const clinic = await this.clinicRepo.findById(clinicId)
    if (!clinic) {
      throw new ValidationException([{ field: 'clinicId', message: 'Clinic not found' }])
    }
    return this.petRepo.findPendingClaims(clinicId)
  }

  /**
   * Get all clinics (for admin purposes).
   *
   * @returns Array of all clinic records
   */
  async getAll(): Promise<Clinic[]> {
    // This is a simplified implementation - in production you'd want pagination
    // For now, we'll use the findNearby method with a very large radius to get all clinics
    // This is not optimal and should be replaced with a proper scan operation
    return await this.clinicRepo.findNearby(0, 0, 20000) // 20,000 km radius covers the entire Earth
  }
}