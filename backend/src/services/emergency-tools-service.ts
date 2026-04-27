/**
 * EmergencyToolsService - Business logic for missing pet workflow and emergency tools
 *
 * Handles:
 * - Missing pet reporting with 3-click flyer generation from dashboard
 * - Letter-size PDF flyer generation with pet photo, description, and contact info
 * - Pet recovery (mark as found) with clinic notifications
 * - Care snapshot generation for temporary caregivers
 * - Owner contact method selection (phone, email, or clinic contact)
 *
 * Requirements: [FR-08], [FR-09], [FR-10], [FR-13], [NFR-USA-01]
 */

import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { ImageRepository } from '../repositories/image-repository'
import { CareSnapshotService } from './care-snapshot-service'
import { FlyerGenerationService, ContactMethod, FlyerGenerationInput } from './flyer-generation-service'
import {
  Pet,
  Clinic,
  PetImage,
  CreateCareSnapshotInput,
  CareSnapshotResponse,
} from '../models/entities'
import { ValidationException } from '../validation/validators'

// ContactMethod is re-exported from FlyerGenerationService
export type { ContactMethod } from './flyer-generation-service'

/**
 * Input for reporting a pet as missing
 */
export interface ReportMissingInput {
  searchRadiusKm: number
  lastSeenLocation: string
  additionalNotes?: string
  contactMethod: ContactMethod
}

/**
 * Result of reporting a pet as missing
 */
export interface ReportMissingResult {
  petId: string
  isMissing: boolean
  flyerUrl: string
  notifiedClinics: number
  searchRadiusKm: number
  lastSeenLocation: string
}

/**
 * Result of marking a pet as found
 */
export interface MarkAsFoundResult {
  petId: string
  isMissing: boolean
  notifiedClinics: number
}


export class EmergencyToolsService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private imageRepo: ImageRepository
  private careSnapshotService: CareSnapshotService
  private flyerService: FlyerGenerationService

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.imageRepo = new ImageRepository(tableName)
    this.careSnapshotService = new CareSnapshotService(tableName)
    this.flyerService = new FlyerGenerationService()
  }

  /**
   * Report a pet as missing with 3-click flyer generation from dashboard.
   *
   * Flow (3 clicks):
   * 1. Owner clicks "Report Missing" on pet card
   * 2. Owner fills in location/contact method and confirms
   * 3. System generates flyer, marks pet missing, notifies clinics
   *
   * Requirements: [FR-08], [FR-09], [NFR-USA-01]
   */
  async reportMissing(petId: string, ownerId: string, input: ReportMissingInput): Promise<ReportMissingResult> {
    // Validate input
    if (!input.searchRadiusKm || input.searchRadiusKm <= 0) {
      throw new ValidationException([
        { field: 'searchRadiusKm', message: 'Search radius must be greater than 0' },
      ])
    }
    if (!input.lastSeenLocation || input.lastSeenLocation.trim().length === 0) {
      throw new ValidationException([
        { field: 'lastSeenLocation', message: 'Last seen location is required' },
      ])
    }
    if (!input.contactMethod || !['phone', 'email', 'clinic'].includes(input.contactMethod)) {
      throw new ValidationException([
        { field: 'contactMethod', message: 'Contact method must be phone, email, or clinic' },
      ])
    }

    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only report your own pets as missing' },
      ])
    }
    if (pet.isMissing) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet is already reported as missing' },
      ])
    }

    // Mark pet as missing
    await this.petRepo.setMissingStatus(petId, true)

    // Get clinic info for flyer and notifications
    const clinic = await this.clinicRepo.findById(pet.clinicId)

    // Get pet images for flyer
    const images = await this.imageRepo.findByPet(petId)

    // Generate the missing pet flyer PDF
    const flyerUrl = await this.generateMissingPetFlyer(pet, clinic, images, input)

    // Notify nearby clinics
    let notifiedClinics = 0
    if (clinic && clinic.latitude && clinic.longitude) {
      const nearbyClinics = await this.clinicRepo.findNearby(
        clinic.latitude,
        clinic.longitude,
        input.searchRadiusKm
      )
      notifiedClinics = nearbyClinics.length
      // In production, this would trigger SNS/SES notifications to each clinic
    }

    return {
      petId,
      isMissing: true,
      flyerUrl,
      notifiedClinics,
      searchRadiusKm: input.searchRadiusKm,
      lastSeenLocation: input.lastSeenLocation,
    }
  }

  /**
   * Generate a letter-size (8.5" x 11") missing pet flyer as PDF.
   * Delegates to FlyerGenerationService.
   *
   * Requirements: [FR-09], [FR-15], [NFR-USA-01]
   */
  async generateMissingPetFlyer(
    pet: Pet,
    clinic: Clinic | null,
    images: PetImage[],
    input: ReportMissingInput
  ): Promise<string> {
    const flyerInput: FlyerGenerationInput = {
      lastSeenLocation: input.lastSeenLocation,
      additionalNotes: input.additionalNotes,
      contactMethod: input.contactMethod,
    }
    const result = await this.flyerService.generateFlyer(pet, clinic, images, flyerInput)
    return result.flyerUrl
  }

  /**
   * Mark a pet as found, update status, and notify previously alerted clinics.
   *
   * Requirements: [FR-10]
   */
  async markAsFound(petId: string, ownerId: string): Promise<MarkAsFoundResult> {
    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only mark your own pets as found' },
      ])
    }
    if (!pet.isMissing) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet is not currently reported as missing' },
      ])
    }

    // Update pet status
    await this.petRepo.setMissingStatus(petId, false)

    // Notify previously alerted clinics that the pet has been found
    let notifiedClinics = 0
    const clinic = await this.clinicRepo.findById(pet.clinicId)
    if (clinic && clinic.latitude && clinic.longitude) {
      // Use same radius as original report (default 50km if not stored)
      const nearbyClinics = await this.clinicRepo.findNearby(
        clinic.latitude,
        clinic.longitude,
        50 // Default radius for found notifications
      )
      notifiedClinics = nearbyClinics.length
      // In production, this would trigger SNS/SES notifications to each clinic
    }

    return {
      petId,
      isMissing: false,
      notifiedClinics,
    }
  }

  /**
   * Generate a care snapshot for temporary caregivers.
   * Delegates to CareSnapshotService.
   *
   * Requirements: [FR-13]
   */
  async generateCareSnapshot(input: CreateCareSnapshotInput, ownerId: string): Promise<CareSnapshotResponse> {
    return this.careSnapshotService.generateCareSnapshot(input, ownerId)
  }
}
