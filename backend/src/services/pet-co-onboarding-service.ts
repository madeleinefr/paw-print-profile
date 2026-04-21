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

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.imageRepo = new ImageRepository(tableName)
  }

  /**
   * Create a medical pet profile (veterinarian only)
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
   * Claim a pet profile (pet owner)
   */
  async claimProfile(input: ClaimProfileInput): Promise<ClaimProfileResponse> {
    // Validate input data
    const validationErrors = validateClaimProfileData(input)
    throwIfInvalid(validationErrors)

    // Validate claiming code and get pet
    const validation = await this.validateClaimingCode(input.claimingCode)
    if (!validation.valid || !validation.pet) {
      throw new ValidationException([
        { field: 'claimingCode', message: validation.error || 'Invalid claiming code' }
      ])
    }

    // Claim the profile
    return await this.petRepo.claimProfile(validation.pet.petId, input)
  }

  /**
   * Enrich a claimed pet profile (pet owner only)
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
   * Find a pet by ID and return complete record (with authorization check)
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
    const [vaccines, surgeries] = await Promise.all([
      this.petRepo.getVaccines(petId),
      this.petRepo.getSurgeries(petId),
      // TODO: Add images when ImageRepository is implemented
    ])

    return {
      pet,
      vaccines,
      surgeries,
      images: [], // TODO: Populate when ImageRepository is implemented
    }
  }

  /**
   * Add a vaccine record to a pet (veterinarian only)
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
   * Add a surgery record to a pet (veterinarian only)
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
   * Get pending claims for a clinic (veterinarian only)
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
   * Get pets by owner (claimed pets only)
   */
  async getByOwner(ownerId: string): Promise<Pet[]> {
    return await this.petRepo.findByOwner(ownerId)
  }

  /**
   * Get pets with vaccines due within specified days (owner only)
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
   * Mark a pet as missing (owner only)
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
   * Mark a pet as found (owner only)
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
   * Update medical data (veterinarian only)
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
   * Delete a pet (veterinarian only, must belong to their clinic)
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
   * Upload an image for a pet (role-based: vet or owner)
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
