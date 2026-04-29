/**
 * AuthorizationService - Co-onboarding access control for B2B2C roles
 *
 * Enforces role-based permissions for the two-phase co-onboarding model:
 * - Veterinarians (B2B): create medical profiles, manage medical data, access clinic pets
 * - Pet Owners (B2C): claim profiles, enrich with personal data, use emergency tools
 * - Public: search lost pets, access care snapshots (no auth required)
 *
 * Authorization decisions are based on:
 * - User's role (custom:userType from Cognito)
 * - User's clinic association (custom:clinicId for vets)
 * - Pet's ownership and profile status
 * - Resource-level ownership checks
 *
 * Per AWS Cognito RBAC best practices, custom:userType is set at sign-up
 * and not user-modifiable via the client, making it safe for access control.
 *
 * Requirements: [NFR-SEC-02], [FR-03], [FR-04], [FR-05], [FR-13]
 */

import { AuthUser } from './auth-service'
import { Pet } from '../models/entities'

/**
 * Result of an authorization check
 */
export interface AuthorizationResult {
  allowed: boolean
  reason?: string
}

const ALLOWED: AuthorizationResult = { allowed: true }
const denied = (reason: string): AuthorizationResult => ({ allowed: false, reason })

export class AuthorizationService {
  /**
   * Can the user create a new medical pet profile?
   * Only veterinarians can create medically verified profiles.
   *
   * Requirements: [FR-03], [NFR-SEC-02]
   */
  canCreatePet(user: AuthUser | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (user.userType !== 'vet') return denied('Only veterinarians can create medical profiles')
    if (!user.clinicId) return denied('Veterinarian must be associated with a clinic')
    return ALLOWED
  }

  /**
   * Can the user claim a pet profile?
   * Only pet owners can claim unclaimed profiles.
   *
   * Requirements: [FR-04], [NFR-SEC-02]
   */
  canClaimPet(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (user.userType !== 'owner') return denied('Only pet owners can claim profiles')
    if (!pet) return denied('Pet not found')
    if (pet.profileStatus !== 'Pending Claim') return denied('Pet profile is not available for claiming')
    if (pet.ownerId) return denied('Pet profile has already been claimed')
    return ALLOWED
  }

  /**
   * Can the user access a pet's details?
   * - Vets can access pets from their own clinic
   * - Owners can access their own claimed pets
   *
   * Requirements: [NFR-SEC-02]
   */
  canAccessPet(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (!pet) return denied('Pet not found')

    if (user.userType === 'vet') {
      if (pet.clinicId !== user.clinicId) {
        return denied('Veterinarians can only access pets from their own clinic')
      }
      return ALLOWED
    }

    if (user.userType === 'owner') {
      if (pet.ownerId !== user.userId) {
        return denied('Pet owners can only access their own pets')
      }
      return ALLOWED
    }

    return denied('Insufficient permissions')
  }

  /**
   * Can the user modify medical data (vaccines, surgeries, medical fields)?
   * Only veterinarians from the pet's clinic can modify medical data.
   *
   * Requirements: [FR-06], [FR-07], [NFR-SEC-02]
   */
  canModifyMedicalData(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (!pet) return denied('Pet not found')
    if (user.userType !== 'vet') return denied('Only veterinarians can modify medical data')
    if (pet.clinicId !== user.clinicId) {
      return denied('Veterinarians can only modify medical data for pets in their clinic')
    }
    return ALLOWED
  }

  /**
   * Can the user enrich a pet profile with personal data (photos, preferences)?
   * Only the pet's owner can enrich a claimed profile.
   *
   * Requirements: [FR-05], [NFR-SEC-02]
   */
  canEnrichProfile(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (!pet) return denied('Pet not found')
    if (user.userType !== 'owner') return denied('Only pet owners can enrich profiles')
    if (pet.profileStatus !== 'Active') return denied('Pet profile must be active to enrich')
    if (pet.ownerId !== user.userId) return denied('You can only enrich your own pet profiles')
    return ALLOWED
  }

  /**
   * Can the user create a care snapshot for a pet?
   * Only the pet's owner can create care snapshots.
   *
   * Requirements: [FR-13], [NFR-SEC-02]
   */
  canCreateCareSnapshot(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (!pet) return denied('Pet not found')
    if (user.userType !== 'owner') return denied('Only pet owners can create care snapshots')
    if (pet.profileStatus !== 'Active') return denied('Pet profile must be active')
    if (pet.ownerId !== user.userId) return denied('You can only create care snapshots for your own pets')
    return ALLOWED
  }

  /**
   * Can the user access a clinic's data?
   * Only veterinarians associated with the clinic can access it.
   *
   * Requirements: [NFR-SEC-02]
   */
  canAccessClinic(user: AuthUser | null, clinicId: string): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (user.userType !== 'vet') return denied('Only veterinarians can access clinic data')
    if (user.clinicId !== clinicId) return denied('You can only access your own clinic')
    return ALLOWED
  }

  /**
   * Can the user report a pet as missing?
   * Only the pet's owner can report it missing.
   *
   * Requirements: [FR-08], [NFR-SEC-02]
   */
  canReportMissing(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (!pet) return denied('Pet not found')
    if (user.userType !== 'owner') return denied('Only pet owners can report pets as missing')
    if (pet.profileStatus !== 'Active') return denied('Pet profile must be active')
    if (pet.ownerId !== user.userId) return denied('You can only report your own pets as missing')
    if (pet.isMissing) return denied('Pet is already reported as missing')
    return ALLOWED
  }

  /**
   * Can the user delete a pet profile?
   * Only veterinarians from the pet's clinic can delete profiles.
   *
   * Requirements: [NFR-SEC-02]
   */
  canDeletePet(user: AuthUser | null, pet: Pet | null): AuthorizationResult {
    if (!user) return denied('Authentication required')
    if (!pet) return denied('Pet not found')
    if (user.userType !== 'vet') return denied('Only veterinarians can delete pet profiles')
    if (pet.clinicId !== user.clinicId) {
      return denied('Veterinarians can only delete pets from their own clinic')
    }
    return ALLOWED
  }
}
