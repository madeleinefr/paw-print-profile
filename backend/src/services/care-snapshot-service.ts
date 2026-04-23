/**
 * CareSnapshotService - Business logic for care snapshot management
 * 
 * Handles creation and access of time-limited care snapshots for
 * temporary caregivers (pet sitters, boarding facilities, etc.)
 * Requirements: [FR-13]
 */

import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { CareSnapshotRepository } from '../repositories/care-snapshot-repository'
import {
  Pet,
  CareSnapshot,
  CreateCareSnapshotInput,
  CareSnapshotResponse,
} from '../models/entities'
import {
  validateCareSnapshotData,
  throwIfInvalid,
  ValidationException,
} from '../validation/validators'

export class CareSnapshotService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private snapshotRepo: CareSnapshotRepository

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.snapshotRepo = new CareSnapshotRepository(tableName)
  }

  /**
   * Generate a care snapshot for temporary caregivers (owner only)
   *
   * [FR-13] Sensitive medical details (vaccines, surgeries, diagnoses)
   * are intentionally excluded. The snapshot only contains owner-provided
   * care instructions, feeding schedule, medications, and emergency contacts.
   */
  async generateCareSnapshot(input: CreateCareSnapshotInput, ownerId: string): Promise<CareSnapshotResponse> {
    // Validate input data
    const validationErrors = validateCareSnapshotData(input)
    throwIfInvalid(validationErrors)

    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(input.petId)
    if (!pet) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet not found' }
      ])
    }

    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only create care snapshots for your own pets' }
      ])
    }

    // Get clinic information for emergency contacts
    const clinic = await this.clinicRepo.findById(pet.clinicId)
    if (!clinic) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet clinic information not found' }
      ])
    }

    // Prepare emergency contacts
    const emergencyContacts = {
      ownerPhone: pet.ownerPhone || '',
      ownerEmail: pet.ownerEmail || '',
      vetClinicName: clinic.name,
      vetClinicPhone: clinic.phone,
    }

    // Create the care snapshot
    const response = await this.snapshotRepo.create(input, emergencyContacts)
    
    // Update the response with pet name
    response.petName = pet.name
    
    return response
  }

  /**
   * Access a care snapshot using access code (public access)
   */
  async accessCareSnapshot(accessCode: string): Promise<CareSnapshot | null> {
    if (!accessCode || accessCode.trim().length === 0) {
      return null
    }

    const snapshot = await this.snapshotRepo.findByAccessCode(accessCode)
    
    if (!snapshot) {
      return null
    }

    // Record the access
    await this.snapshotRepo.recordAccess(snapshot.snapshotId)

    // Get pet name for the snapshot
    const pet = await this.petRepo.findById(snapshot.petId)
    if (pet) {
      snapshot.petName = pet.name
    }

    return snapshot
  }

  /**
   * Validate access code without recording access
   */
  async validateAccessCode(accessCode: string): Promise<{ valid: boolean; snapshot?: CareSnapshot; error?: string }> {
    if (!accessCode || accessCode.trim().length === 0) {
      return { valid: false, error: 'Access code is required' }
    }

    const snapshot = await this.snapshotRepo.findByAccessCode(accessCode)
    
    if (!snapshot) {
      return { valid: false, error: 'Invalid or expired access code' }
    }

    return { valid: true, snapshot }
  }

  /**
   * Get all care snapshots for a pet (owner only)
   */
  async getCareSnapshotsForPet(petId: string, ownerId: string): Promise<CareSnapshot[]> {
    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet not found' }
      ])
    }

    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only view care snapshots for your own pets' }
      ])
    }

    return await this.snapshotRepo.findByPet(petId)
  }

  /**
   * Delete an expired care snapshot
   */
  async deleteExpiredSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.snapshotRepo.findById(snapshotId)
    
    if (!snapshot) {
      return // Already deleted or doesn't exist
    }

    // Check if expired
    if (new Date(snapshot.expiryDate) < new Date()) {
      await this.snapshotRepo.delete(snapshotId)
    }
  }

  /**
   * Cleanup expired care snapshots (maintenance function)
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    // This would typically be called by a scheduled job
    // For now, we'll implement a basic version
    // In production, this should use DynamoDB TTL or a more efficient cleanup process
    
    let cleanedCount = 0
    // TODO: Implement efficient cleanup using DynamoDB scan with filter
    // This is a placeholder implementation
    
    return cleanedCount
  }
}