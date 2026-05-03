/**
 * MissingPetService - Orchestrates the complete missing pet workflow
 *
 * This service coordinates:
 * 1. Marking a pet as missing and generating a flyer (via EmergencyToolsService)
 * 2. Finding nearby clinics (via ClinicRepository.findNearby())
 * 3. Sending missing pet alerts to nearby clinics (via NotificationService)
 * 4. Marking a pet as found and notifying previously alerted clinics
 *
 * It acts as the top-level orchestrator that ties together the flyer generation,
 * geographic clinic search, and notification delivery into a single cohesive workflow.
 *
 * Requirements: [FR-08], [FR-09], [FR-10], [NFR-USA-01]
 */

import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { ImageRepository } from '../repositories/image-repository'
import { FlyerGenerationService, ContactMethod, FlyerGenerationInput } from './flyer-generation-service'
import {
  NotificationService,
  MissingPetAlertInput,
  PetFoundNotificationInput,
  NotificationResult,
} from './notification-service'
import { Pet, Clinic, PetImage } from '../models/entities'
import { ValidationException } from '../validation/validators'

/**
 * Input for reporting a pet as missing
 */
export interface MissingPetReportInput {
  searchRadiusKm: number
  lastSeenLocation: string
  additionalNotes?: string
  contactMethod: ContactMethod
}

/**
 * Result of reporting a pet as missing
 */
export interface MissingPetReportResult {
  petId: string
  isMissing: boolean
  flyerUrl: string
  notifiedClinics: number
  searchRadiusKm: number
  lastSeenLocation: string
  notificationResult: NotificationResult
}

/**
 * Result of marking a pet as found
 */
export interface PetFoundResult {
  petId: string
  isMissing: boolean
  notifiedClinics: number
  notificationResult: NotificationResult
}

export class MissingPetService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private imageRepo: ImageRepository
  private flyerService: FlyerGenerationService
  private notificationService: NotificationService

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.imageRepo = new ImageRepository(tableName)
    this.flyerService = new FlyerGenerationService()
    this.notificationService = new NotificationService()
  }

  /**
   * Report a pet as missing — full orchestrated workflow.
   *
   * Steps:
   * 1. Validate input and verify pet ownership
   * 2. Mark pet as missing in the database
   * 3. Generate a missing pet flyer PDF
   * 4. Find nearby clinics using geographic search
   * 5. Send missing pet alerts to all nearby clinics via NotificationService
   *
   * Requirements: [FR-08], [FR-09], [NFR-USA-01]
   */
  async reportMissing(
    petId: string,
    ownerId: string,
    input: MissingPetReportInput
  ): Promise<MissingPetReportResult> {
    // 1. Validate input
    this.validateReportInput(input)

    // 2. Verify pet exists, is owned by the user, and is not already missing
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only report your own active pets as missing' },
      ])
    }
    if (pet.isMissing) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet is already reported as missing' },
      ])
    }

    // 3. Mark pet as missing
    await this.petRepo.setMissingStatus(petId, true)

    // 4. Get clinic info for flyer and geographic search
    const clinic = await this.clinicRepo.findById(pet.clinicId)

    // 5. Get pet images for flyer
    const images = await this.imageRepo.findByPet(petId)

    // 6. Generate the missing pet flyer PDF
    const flyerUrl = await this.generateFlyer(pet, clinic, images, input)

    // 7. Find nearby clinics and send notifications
    const nearbyClinics = await this.findNearbyClinics(clinic, input.searchRadiusKm)
    const notificationResult = await this.notificationService.sendMissingPetAlert({
      pet,
      nearbyClinics,
      searchRadiusKm: input.searchRadiusKm,
      lastSeenLocation: input.lastSeenLocation,
    })

    return {
      petId,
      isMissing: true,
      flyerUrl,
      notifiedClinics: nearbyClinics.length,
      searchRadiusKm: input.searchRadiusKm,
      lastSeenLocation: input.lastSeenLocation,
      notificationResult,
    }
  }

  /**
   * Mark a pet as found — updates status and notifies previously alerted clinics.
   *
   * Steps:
   * 1. Verify pet exists, is owned by the user, and is currently missing
   * 2. Update pet status to not missing
   * 3. Find nearby clinics (same set that was originally notified)
   * 4. Send pet found notifications to all nearby clinics
   *
   * Requirements: [FR-10]
   */
  async markAsFound(
    petId: string,
    ownerId: string
  ): Promise<PetFoundResult> {
    // 1. Verify pet exists and is owned by the user
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

    // 2. Update pet status
    await this.petRepo.setMissingStatus(petId, false)

    // 3. Find nearby clinics that were previously alerted
    const clinic = await this.clinicRepo.findById(pet.clinicId)
    const previouslyAlertedClinics = await this.findNearbyClinics(clinic, 50) // Default radius

    // 4. Send pet found notifications
    const notificationResult = await this.notificationService.sendPetFoundNotification({
      pet,
      previouslyAlertedClinics,
    })

    return {
      petId,
      isMissing: false,
      notifiedClinics: previouslyAlertedClinics.length,
      notificationResult,
    }
  }

  /**
   * Validate the report missing input fields.
   */
  private validateReportInput(input: MissingPetReportInput): void {
    const errors: Array<{ field: string; message: string }> = []

    if (!input.searchRadiusKm || input.searchRadiusKm <= 0) {
      errors.push({ field: 'searchRadiusKm', message: 'Search radius must be greater than 0' })
    }
    if (!input.lastSeenLocation || input.lastSeenLocation.trim().length === 0) {
      errors.push({ field: 'lastSeenLocation', message: 'Last seen location is required' })
    }
    if (!input.contactMethod || !['phone', 'email', 'clinic'].includes(input.contactMethod)) {
      errors.push({ field: 'contactMethod', message: 'Contact method must be phone, email, or clinic' })
    }

    if (errors.length > 0) {
      throw new ValidationException(errors)
    }
  }

  /**
   * Generate a missing pet flyer PDF via FlyerGenerationService.
   *
   * Requirements: [FR-09], [FR-15]
   */
  private async generateFlyer(
    pet: Pet,
    clinic: Clinic | null,
    images: PetImage[],
    input: MissingPetReportInput
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
   * Find nearby clinics using ClinicRepository.findNearby() for geographic search.
   * Returns an empty array if the clinic has no coordinates.
   */
  private async findNearbyClinics(
    clinic: Clinic | null,
    radiusKm: number
  ): Promise<Clinic[]> {
    if (!clinic || !clinic.latitude || !clinic.longitude) {
      return []
    }
    return this.clinicRepo.findNearby(clinic.latitude, clinic.longitude, radiusKm)
  }
}
