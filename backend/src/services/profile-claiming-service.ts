/**
 * ProfileClaimingService - Business logic for pet profile ownership workflow
 *
 * Handles finding pending claims, transferring ownership atomically,
 * validating owner eligibility, and managing claiming code expiry.
 * Requirements: [FR-04]
 */

import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { Pet, ClaimProfileInput, ClaimProfileResponse } from '../models/entities'
import { ValidationException } from '../validation/validators'

export class ProfileClaimingService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
  }

  /**
   * Find all pending (unclaimed) profiles for a clinic dashboard.
   * Requirements: [FR-04]
   */
  async findPendingClaims(clinicId: string): Promise<Pet[]> {
    const clinic = await this.clinicRepo.findById(clinicId)
    if (!clinic) {
      throw new ValidationException([{ field: 'clinicId', message: 'Clinic not found' }])
    }
    return this.petRepo.findPendingClaims(clinicId)
  }

  /**
   * Transfer ownership of a pet profile to a new owner atomically.
   * Validates the claiming code and owner eligibility before transferring.
   * Requirements: [FR-04]
   */
  async transferOwnership(input: ClaimProfileInput): Promise<ClaimProfileResponse> {
    // Validate owner eligibility first
    const eligibility = await this.validateOwnerEligibility(input.claimingCode)
    if (!eligibility.eligible) {
      throw new ValidationException([
        { field: 'claimingCode', message: eligibility.reason ?? 'Not eligible to claim this profile' },
      ])
    }

    // Perform the atomic ownership transfer via the repository
    return this.petRepo.claimProfile(eligibility.pet!.petId, input)
  }

  /**
   * Validate whether a claiming code is valid and the profile is eligible to be claimed.
   * Returns the pet if eligible, or a reason string if not.
   * Requirements: [FR-04]
   */
  async validateOwnerEligibility(
    claimingCode: string
  ): Promise<{ eligible: boolean; pet?: Pet; reason?: string }> {
    if (!claimingCode || claimingCode.trim().length === 0) {
      return { eligible: false, reason: 'Claiming code is required' }
    }

    const pet = await this.petRepo.findByClaimingCode(claimingCode)

    if (!pet) {
      return { eligible: false, reason: 'Invalid or expired claiming code' }
    }

    if (pet.profileStatus !== 'Pending Claim') {
      return { eligible: false, reason: 'Pet profile has already been claimed' }
    }

    // Check expiry explicitly (repository also checks, but we surface a clear reason here)
    if (pet.claimingCodeExpiry && new Date(pet.claimingCodeExpiry) < new Date()) {
      return { eligible: false, reason: 'Claiming code has expired' }
    }

    return { eligible: true, pet }
  }

  /**
   * Regenerate a claiming code for a pending profile (e.g. after expiry).
   * Only allowed when the profile is still in 'Pending Claim' status.
   * Requirements: [FR-04]
   */
  async regenerateClaimingCode(petId: string, clinicId: string): Promise<{ claimingCode: string; expiryDate: string }> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.clinicId !== clinicId) {
      throw new ValidationException([{ field: 'petId', message: 'You can only regenerate codes for pets from your clinic' }])
    }
    if (pet.profileStatus !== 'Pending Claim') {
      throw new ValidationException([{ field: 'petId', message: 'Claiming code can only be regenerated for pending profiles' }])
    }

    // Generate a new code and expiry (30 days)
    const newCode = this.generateClaimingCode()
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await this.petRepo.update(petId, {})
    // Update the claiming code fields directly via a targeted update
    // We reuse the internal update path by patching through a raw update
    await this.petRepo.updateClaimingCode(petId, newCode, newExpiry)

    return { claimingCode: newCode, expiryDate: newExpiry }
  }

  private generateClaimingCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = 'CLAIM-'
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }
}
