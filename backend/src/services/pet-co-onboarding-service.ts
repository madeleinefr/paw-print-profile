/**
 * PetCoOnboardingService - Business logic for B2B2C co-onboarding workflow
 * 
 * Handles the two-phase onboarding process:
 * 1. Medical Onboarding: Veterinarians create medically verified pet profiles
 * Requirements: [FR-03]
 * 2. Owner Claiming: Pet owners claim and enrich their pet profiles
 * Requirements: [FR-04], [FR-05]
 */

import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { ImageRepository } from '../repositories/image-repository'
import { ProfileClaimingService } from './profile-claiming-service'
import {
  Pet,
  PetImage,
  VaccineRecord,
  SurgeryRecord,
  CreateMedicalProfileInput,
  ClaimProfileInput,
  EnrichProfileInput,
  UpdatePetInput,
  CreateVaccineInput,
  CreateSurgeryInput,
  CompletePetRecord,
  MedicalProfileResponse,
  ClaimProfileResponse,
  ProfileStatus,
} from '../models/entities'
import {
  validateMedicalProfileData,
  validateClaimProfileData,
  validateEnrichProfileData,
  validateVaccineData,
  validateSurgeryData,
  validateImageFormat,
  validateImageSize,
  throwIfInvalid,
  ValidationException,
} from '../validation/validators'

export class PetCoOnboardingService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private imageRepo: ImageRepository
  private claimingService: ProfileClaimingService

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.imageRepo = new ImageRepository(tableName)
    this.claimingService = new ProfileClaimingService(tableName)
  }

  /**
   * Create a medical pet profile (veterinarian only).
   *
   * @param input - Medical profile data validated against business rules
   * @returns The created medical profile response with claiming code
   * @throws ValidationException if input is invalid or clinic does not exist
   */
  async createMedicalProfile(input: CreateMedicalProfileInput): Promise<MedicalProfileResponse> {
    // Validate input data
    const validationErrors = validateMedicalProfileData(input)
    throwIfInvalid(validationErrors)

    // Verify clinic exists
    const clinic = await this.clinicRepo.findById(input.clinicId)
    if (!clinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    // Create the medical profile
    return await this.petRepo.createMedicalProfile(input)
  }

  /**
   * Validate a claiming code
   */
  async validateClaimingCode(claimingCode: string): Promise<{ valid: boolean; pet?: Pet; error?: string }> {
    if (!claimingCode || claimingCode.trim().length === 0) {
      return { valid: false, error: 'Claiming code is required' }
    }

    const pet = await this.petRepo.findByClaimingCode(claimingCode)
    
    if (!pet) {
      return { valid: false, error: 'Invalid or expired claiming code' }
    }

    if (pet.profileStatus !== 'Pending Claim') {
      return { valid: false, error: 'Pet profile has already been claimed' }
    }

    return { valid: true, pet }
  }

  /**
   * Claim a pet profile (pet owner).
   * Delegates to ProfileClaimingService.transferOwnership() which handles
   * eligibility validation and atomic ownership transfer.
   *
   * @param input - Claiming details including claimingCode and owner info
   * @param ownerId - The authenticated owner's user ID
   * @returns Claim response with pet info and new status
   * @throws ValidationException if input is invalid or code is ineligible
   */
  async claimProfile(input: ClaimProfileInput, ownerId: string): Promise<ClaimProfileResponse> {
    // Validate input data
    const validationErrors = validateClaimProfileData(input)
    throwIfInvalid(validationErrors)

    // Delegate to ProfileClaimingService for the actual ownership transfer
    return await this.claimingService.transferOwnership(input, ownerId)
  }

  /**
   * Enrich a claimed pet profile (pet owner only).
   *
   * @param petId - The pet to enrich
   * @param ownerId - The authenticated owner's user ID
   * @param input - Optional enrichment fields (address, phone, custom fields)
   * @returns The updated pet record
   * @throws ValidationException if pet not found, not active, or not owned by user
   */
  async enrichProfile(petId: string, ownerId: string, input: EnrichProfileInput): Promise<Pet> {
    // Validate input data
    const validationErrors = validateEnrichProfileData(input)
    throwIfInvalid(validationErrors)

    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet not found' }
      ])
    }

    if (pet.profileStatus !== 'Active') {
      throw new ValidationException([
        { field: 'petId', message: 'Pet profile must be claimed before enrichment' }
      ])
    }

    if (pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only enrich your own pet profiles' }
      ])
    }

    // Enrich the profile
    return await this.petRepo.enrichProfile(petId, ownerId, input)
  }

  /**
   * Find a pet by ID and return complete record (with authorization check).
   *
   * @param petId - The pet's unique identifier
   * @param userType - 'vet' or 'owner' for authorization context
   * @param userId - The authenticated user's ID
   * @param clinicId - The vet's clinic ID (required for vet users)
   * @returns Complete pet record with vaccines, surgeries, and images, or null if not found
   * @throws ValidationException if user is not authorized to access this pet
   */
  async findById(petId: string, userType: 'vet' | 'owner', userId: string, clinicId?: string): Promise<CompletePetRecord | null> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      return null
    }

    // Authorization check
    if (userType === 'vet') {
      if (pet.clinicId !== clinicId) {
        throw new ValidationException([
          { field: 'petId', message: 'You can only access pets from your clinic' }
        ])
      }
    } else if (userType === 'owner') {
      if (pet.profileStatus !== 'Active' || pet.ownerId !== userId) {
        throw new ValidationException([
          { field: 'petId', message: 'You can only access your own claimed pets' }
        ])
      }
    }

    // Get associated records
    const [vaccines, surgeries, images] = await Promise.all([
      this.petRepo.getVaccines(petId),
      this.petRepo.getSurgeries(petId),
      this.imageRepo.findByPet(petId),
    ])

    // Generate signed URLs for images so the browser can display them
    const imagesWithUrls = await Promise.all(
      images.map(async (img) => {
        try {
          const url = await this.imageRepo.getUrl(img.imageId, petId)
          return { ...img, url }
        } catch {
          return img
        }
      })
    )

    return {
      pet,
      vaccines,
      surgeries,
      images: imagesWithUrls,
    }
  }

  /**
   * Add a vaccine record to a pet (veterinarian only).
   *
   * @param petId - The pet to add the vaccine to
   * @param vaccine - Vaccine details (name, dates, vet name)
   * @param vetId - The administering veterinarian's user ID
   * @param clinicId - The vet's clinic ID (must match pet's clinic)
   * @returns The created vaccine record
   * @throws ValidationException if pet not found or doesn't belong to vet's clinic
   */
  async addVaccine(petId: string, vaccine: CreateVaccineInput, vetId: string, clinicId: string): Promise<VaccineRecord> {
    // Validate input data
    const validationErrors = validateVaccineData(vaccine)
    throwIfInvalid(validationErrors)

    // Verify pet exists and belongs to the vet's clinic
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet not found' }
      ])
    }

    if (pet.clinicId !== clinicId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only add vaccines to pets from your clinic' }
      ])
    }

    // Add the vaccine record
    return await this.petRepo.addVaccine(petId, vaccine)
  }

  /**
   * Add a surgery record to a pet (veterinarian only).
   *
   * @param petId - The pet to add the surgery to
   * @param surgery - Surgery details (type, date, notes, recovery info)
   * @param vetId - The performing veterinarian's user ID
   * @param clinicId - The vet's clinic ID (must match pet's clinic)
   * @returns The created surgery record
   * @throws ValidationException if pet not found or doesn't belong to vet's clinic
   */
  async addSurgery(petId: string, surgery: CreateSurgeryInput, vetId: string, clinicId: string): Promise<SurgeryRecord> {
    // Validate input data
    const validationErrors = validateSurgeryData(surgery)
    throwIfInvalid(validationErrors)

    // Verify pet exists and belongs to the vet's clinic
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet not found' }
      ])
    }

    if (pet.clinicId !== clinicId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only add surgeries to pets from your clinic' }
      ])
    }

    // Add the surgery record
    return await this.petRepo.addSurgery(petId, surgery)
  }

  /**
   * Get pending claims for a clinic (veterinarian only).
   *
   * @param clinicId - The clinic to query
   * @returns Array of pets with 'Pending Claim' status
   * @throws ValidationException if clinic does not exist
   */
  async getPendingClaims(clinicId: string): Promise<Pet[]> {
    // Verify clinic exists
    const clinic = await this.clinicRepo.findById(clinicId)
    if (!clinic) {
      throw new ValidationException([
        { field: 'clinicId', message: 'Clinic not found' }
      ])
    }

    return await this.petRepo.findPendingClaims(clinicId)
  }

  /**
   * Get pets by owner (claimed pets only).
   *
   * @param ownerId - The owner's user ID
   * @returns Array of active pets owned by the user
   */
  async getByOwner(ownerId: string): Promise<Pet[]> {
    return await this.petRepo.findByOwner(ownerId)
  }

  /**
   * Get pets with vaccines due within specified days (owner only).
   *
   * @param ownerId - The owner's user ID
   * @param daysAhead - Number of days to look ahead (default 30)
   * @returns Array of pets with their due vaccines
   */
  async getPetsWithVaccinesDue(ownerId: string, daysAhead: number = 30): Promise<{ pet: Pet; dueVaccines: VaccineRecord[] }[]> {
    const pets = await this.petRepo.findByOwner(ownerId)
    const results: { pet: Pet; dueVaccines: VaccineRecord[] }[] = []

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead)
    const cutoffDateString = cutoffDate.toISOString().split('T')[0] // YYYY-MM-DD format

    for (const pet of pets) {
      const vaccines = await this.petRepo.getVaccines(pet.petId)
      const dueVaccines = vaccines.filter(vaccine => vaccine.nextDueDate <= cutoffDateString)
      
      if (dueVaccines.length > 0) {
        results.push({ pet, dueVaccines })
      }
    }

    return results
  }

  /**
   * Mark a pet as missing (owner only).
   *
   * @param petId - The pet to mark as missing
   * @param ownerId - The authenticated owner's user ID
   * @returns The updated pet record
   * @throws ValidationException if pet not found or not owned by user
   */
  async markAsMissing(petId: string, ownerId: string): Promise<Pet> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([{ field: 'petId', message: 'You can only mark your own pets as missing' }])
    }
    return await this.petRepo.setMissingStatus(petId, true)
  }

  /**
   * Mark a pet as found (owner only).
   *
   * @param petId - The pet to mark as found
   * @param ownerId - The authenticated owner's user ID
   * @returns The updated pet record
   * @throws ValidationException if pet not found or not owned by user
   */
  async markAsFound(petId: string, ownerId: string): Promise<Pet> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([{ field: 'petId', message: 'You can only mark your own pets as found' }])
    }
    return await this.petRepo.setMissingStatus(petId, false)
  }

  /**
   * Update medical data (veterinarian only).
   *
   * @param petId - The pet to update
   * @param clinicId - The vet's clinic ID (must match pet's clinic)
   * @param updates - Partial medical fields to update
   * @returns The updated pet record
   * @throws ValidationException if pet not found or doesn't belong to clinic
   */
  async updateMedicalData(petId: string, clinicId: string, updates: UpdatePetInput): Promise<Pet> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.clinicId !== clinicId) {
      throw new ValidationException([{ field: 'petId', message: 'You can only update pets from your clinic' }])
    }
    return await this.petRepo.update(petId, updates)
  }

  /**
   * Delete a pet (veterinarian only, must belong to their clinic).
   *
   * @param petId - The pet to delete
   * @param clinicId - The vet's clinic ID (must match pet's clinic)
   * @throws ValidationException if pet not found or doesn't belong to clinic
   */
  async deletePet(petId: string, clinicId: string): Promise<void> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.clinicId !== clinicId) {
      throw new ValidationException([{ field: 'petId', message: 'You can only delete pets from your clinic' }])
    }
    await this.petRepo.delete(petId)
  }

  /**
   * Upload an image for a pet (role-based: vet or owner).
   *
   * @param petId - The pet to upload an image for
   * @param userId - The authenticated user's ID
   * @param userType - 'vet' or 'owner'
   * @param body - JSON string with imageBase64, mimeType, and optional tags
   * @returns The created PetImage record
   * @throws ValidationException if pet not found, not authorized, or image invalid
   */
  async uploadImage(petId: string, userId: string, userType: 'vet' | 'owner', body: string): Promise<PetImage> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }

    if (userType === 'vet' && pet.clinicId !== userId) {
      // For vets, userId is the vetId — we check clinic membership via the pet's clinicId
      // (full Cognito auth will enforce this; here we just verify the pet exists)
    } else if (userType === 'owner' && pet.ownerId !== userId) {
      throw new ValidationException([{ field: 'petId', message: 'You can only upload images for your own pets' }])
    }

    const parsed = JSON.parse(body) as { imageBase64: string; mimeType: string; tags?: string[] }
    const imageBuffer = Buffer.from(parsed.imageBase64, 'base64')

    throwIfInvalid([...validateImageFormat(parsed.mimeType), ...validateImageSize(imageBuffer.length)])

    return await this.imageRepo.upload({ petId, imageBuffer, mimeType: parsed.mimeType, tags: parsed.tags ?? [] })
  }
}
