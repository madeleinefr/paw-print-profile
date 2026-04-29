/**
 * Property-based tests for AuthorizationService
 * Uses fast-check with numRuns: 100 (pure logic, no external dependencies).
 *
 * Properties covered:
 *   Property 41: Authentication requirement — all methods deny unauthenticated users
 *   Property 42: Veterinarian authorization — vet-only actions allow vets, deny owners
 *   Property 43: Owner authorization — owner-only actions allow owners, deny vets
 *   Property 44: Public search access — public endpoints don't require auth (tested implicitly)
 *   Property 60: Co-onboarding role separation — vets and owners have non-overlapping write permissions
 *   Property 61: Profile claiming authorization — only owners can claim unclaimed profiles
 *   Property 62: Care snapshot access control — only pet owners can create snapshots for their own pets
 *
 * Validates: Requirements [NFR-SEC-01], [NFR-SEC-02], [NFR-SEC-03]
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { AuthorizationService } from '../src/services/authorization-service'
import { AuthUser } from '../src/services/auth-service'
import { Pet } from '../src/models/entities'

const authService = new AuthorizationService()

// ── Arbitraries ──────────────────────────────────────────────────────────────

const idArb = fc.uuid()
const emailArb = fc.emailAddress()

const vetUserArb: fc.Arbitrary<AuthUser> = fc.record({
  userId: idArb,
  email: emailArb,
  userType: fc.constant('vet' as const),
  clinicId: idArb,
})

const ownerUserArb: fc.Arbitrary<AuthUser> = fc.record({
  userId: idArb,
  email: emailArb,
  userType: fc.constant('owner' as const),
  clinicId: fc.constant(undefined),
})

const vetWithoutClinicArb: fc.Arbitrary<AuthUser> = fc.record({
  userId: idArb,
  email: emailArb,
  userType: fc.constant('vet' as const),
  clinicId: fc.constant(undefined),
})

const pendingPetArb = (clinicId: string): fc.Arbitrary<Pet> =>
  fc.record({
    PK: fc.constant('PET#test'),
    SK: fc.constant('METADATA'),
    petId: idArb,
    name: fc.string({ minLength: 1, maxLength: 20 }),
    species: fc.constantFrom('Dog', 'Cat', 'Bird'),
    breed: fc.string({ minLength: 1, maxLength: 20 }),
    age: fc.integer({ min: 0, max: 20 }),
    clinicId: fc.constant(clinicId),
    profileStatus: fc.constant('Pending Claim' as const),
    medicallyVerified: fc.constant(true),
    verifyingVetId: idArb,
    verificationDate: fc.constant(new Date().toISOString()),
    createdAt: fc.constant(new Date().toISOString()),
    updatedAt: fc.constant(new Date().toISOString()),
    isMissing: fc.constant(false),
    GSI2PK: fc.constant('SPECIES#Dog'),
    GSI2SK: fc.constant('BREED#Lab#AGE#3'),
  })

const activePetArb = (clinicId: string, ownerId: string): fc.Arbitrary<Pet> =>
  fc.record({
    PK: fc.constant('PET#test'),
    SK: fc.constant('METADATA'),
    petId: idArb,
    name: fc.string({ minLength: 1, maxLength: 20 }),
    species: fc.constantFrom('Dog', 'Cat', 'Bird'),
    breed: fc.string({ minLength: 1, maxLength: 20 }),
    age: fc.integer({ min: 0, max: 20 }),
    clinicId: fc.constant(clinicId),
    profileStatus: fc.constant('Active' as const),
    medicallyVerified: fc.constant(true),
    verifyingVetId: idArb,
    verificationDate: fc.constant(new Date().toISOString()),
    ownerId: fc.constant(ownerId),
    ownerName: fc.constant('Test Owner'),
    ownerEmail: emailArb,
    ownerPhone: fc.constant('+11234567890'),
    createdAt: fc.constant(new Date().toISOString()),
    updatedAt: fc.constant(new Date().toISOString()),
    isMissing: fc.constant(false),
    GSI2PK: fc.constant('SPECIES#Dog'),
    GSI2SK: fc.constant('BREED#Lab#AGE#3'),
  })


const missingPetArb = (clinicId: string, ownerId: string): fc.Arbitrary<Pet> =>
  fc.record({
    PK: fc.constant('PET#test'),
    SK: fc.constant('METADATA'),
    petId: idArb,
    name: fc.string({ minLength: 1, maxLength: 20 }),
    species: fc.constantFrom('Dog', 'Cat'),
    breed: fc.string({ minLength: 1, maxLength: 20 }),
    age: fc.integer({ min: 0, max: 20 }),
    clinicId: fc.constant(clinicId),
    profileStatus: fc.constant('Active' as const),
    medicallyVerified: fc.constant(true),
    verifyingVetId: idArb,
    verificationDate: fc.constant(new Date().toISOString()),
    ownerId: fc.constant(ownerId),
    ownerName: fc.constant('Test Owner'),
    ownerEmail: emailArb,
    ownerPhone: fc.constant('+11234567890'),
    createdAt: fc.constant(new Date().toISOString()),
    updatedAt: fc.constant(new Date().toISOString()),
    isMissing: fc.constant(true),
    GSI2PK: fc.constant('SPECIES#Dog'),
    GSI2SK: fc.constant('BREED#Lab#AGE#3'),
  })

// ── Property 41: Authentication requirement ──────────────────────────────────

describe('[NFR-SEC-01] Property 41: Authentication requirement', () => {
  /**
   * For any authorization method, passing null as the user always results
   * in denial with "Authentication required".
   */
  it('all methods deny unauthenticated (null) users', () => {
    fc.assert(
      fc.property(idArb, (clinicId) => {
        const pet = {
          PK: 'PET#x', SK: 'METADATA', petId: 'x', name: 'X', species: 'Dog',
          breed: 'Lab', age: 3, clinicId, profileStatus: 'Active' as const,
          medicallyVerified: true, verifyingVetId: 'v', verificationDate: '',
          ownerId: 'o', createdAt: '', updatedAt: '', isMissing: false,
          GSI2PK: '', GSI2SK: '',
        } as Pet

        expect(authService.canCreatePet(null).allowed).toBe(false)
        expect(authService.canClaimPet(null, pet).allowed).toBe(false)
        expect(authService.canAccessPet(null, pet).allowed).toBe(false)
        expect(authService.canModifyMedicalData(null, pet).allowed).toBe(false)
        expect(authService.canEnrichProfile(null, pet).allowed).toBe(false)
        expect(authService.canCreateCareSnapshot(null, pet).allowed).toBe(false)
        expect(authService.canAccessClinic(null, clinicId).allowed).toBe(false)
        expect(authService.canReportMissing(null, pet).allowed).toBe(false)
        expect(authService.canDeletePet(null, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('all denial reasons mention authentication', () => {
    const pet = {
      PK: 'PET#x', SK: 'METADATA', petId: 'x', name: 'X', species: 'Dog',
      breed: 'Lab', age: 3, clinicId: 'c', profileStatus: 'Active' as const,
      medicallyVerified: true, verifyingVetId: 'v', verificationDate: '',
      ownerId: 'o', createdAt: '', updatedAt: '', isMissing: false,
      GSI2PK: '', GSI2SK: '',
    } as Pet

    const methods = [
      authService.canCreatePet(null),
      authService.canClaimPet(null, pet),
      authService.canAccessPet(null, pet),
      authService.canModifyMedicalData(null, pet),
      authService.canEnrichProfile(null, pet),
      authService.canCreateCareSnapshot(null, pet),
      authService.canAccessClinic(null, 'c'),
      authService.canReportMissing(null, pet),
      authService.canDeletePet(null, pet),
    ]

    for (const result of methods) {
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Authentication required')
    }
  })
})

// ── Property 42: Veterinarian authorization ──────────────────────────────────

describe('[NFR-SEC-02] Property 42: Veterinarian authorization', () => {
  /**
   * Vet-only actions (createPet, modifyMedicalData, deletePet, accessClinic)
   * allow vets with correct clinic, deny owners.
   */
  it('vets can create pets, modify medical data, delete pets, access clinic', () => {
    fc.assert(
      fc.property(vetUserArb, (vet) => {
        // canCreatePet
        expect(authService.canCreatePet(vet).allowed).toBe(true)

        // canModifyMedicalData for pet in same clinic
        const pet = { clinicId: vet.clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet
        expect(authService.canModifyMedicalData(vet, pet).allowed).toBe(true)

        // canDeletePet for pet in same clinic
        expect(authService.canDeletePet(vet, pet).allowed).toBe(true)

        // canAccessClinic for own clinic
        expect(authService.canAccessClinic(vet, vet.clinicId!).allowed).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('owners cannot perform vet-only actions', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, (owner, clinicId) => {
        expect(authService.canCreatePet(owner).allowed).toBe(false)

        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: owner.userId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet
        expect(authService.canModifyMedicalData(owner, pet).allowed).toBe(false)
        expect(authService.canDeletePet(owner, pet).allowed).toBe(false)
        expect(authService.canAccessClinic(owner, clinicId).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('vets without clinicId cannot create pets', () => {
    fc.assert(
      fc.property(vetWithoutClinicArb, (vet) => {
        expect(authService.canCreatePet(vet).allowed).toBe(false)
        expect(authService.canCreatePet(vet).reason).toContain('clinic')
      }),
      { numRuns: 100 }
    )
  })

  it('vets cannot access pets from other clinics', () => {
    fc.assert(
      fc.property(vetUserArb, idArb, (vet, otherClinicId) => {
        fc.pre(otherClinicId !== vet.clinicId)
        const pet = { clinicId: otherClinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canAccessPet(vet, pet).allowed).toBe(false)
        expect(authService.canModifyMedicalData(vet, pet).allowed).toBe(false)
        expect(authService.canDeletePet(vet, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})


// ── Property 43: Owner authorization ─────────────────────────────────────────

describe('[NFR-SEC-02] Property 43: Owner authorization', () => {
  /**
   * Owner-only actions (claimPet, enrichProfile, createCareSnapshot, reportMissing)
   * allow owners for their own pets, deny vets.
   */
  it('owners can enrich, create snapshots, and report missing for their own pets', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, (owner, clinicId) => {
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: owner.userId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canEnrichProfile(owner, pet).allowed).toBe(true)
        expect(authService.canCreateCareSnapshot(owner, pet).allowed).toBe(true)
        expect(authService.canReportMissing(owner, pet).allowed).toBe(true)
        expect(authService.canAccessPet(owner, pet).allowed).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('vets cannot perform owner-only actions', () => {
    fc.assert(
      fc.property(vetUserArb, (vet) => {
        const pet = { clinicId: vet.clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: 'some-owner', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet
        const pendingPet = { ...pet, profileStatus: 'Pending Claim' as const, ownerId: undefined } as unknown as Pet

        expect(authService.canClaimPet(vet, pendingPet).allowed).toBe(false)
        expect(authService.canEnrichProfile(vet, pet).allowed).toBe(false)
        expect(authService.canCreateCareSnapshot(vet, pet).allowed).toBe(false)
        expect(authService.canReportMissing(vet, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('owners cannot access other owners pets', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, idArb, (owner, clinicId, otherOwnerId) => {
        fc.pre(otherOwnerId !== owner.userId)
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: otherOwnerId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canAccessPet(owner, pet).allowed).toBe(false)
        expect(authService.canEnrichProfile(owner, pet).allowed).toBe(false)
        expect(authService.canCreateCareSnapshot(owner, pet).allowed).toBe(false)
        expect(authService.canReportMissing(owner, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 44: Public search access ────────────────────────────────────────

describe('[NFR-SEC-03] Property 44: Public search access', () => {
  /**
   * Public endpoints (search, care snapshot access) don't require authentication.
   * The AuthorizationService doesn't have methods for these because they're
   * handled at the handler level without auth checks. This test verifies
   * that the service correctly denies all protected operations for null users,
   * confirming that public access is only possible through unprotected endpoints.
   */
  it('null user is denied for all protected operations (public access is handler-level)', () => {
    fc.assert(
      fc.property(idArb, (clinicId) => {
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: 'o', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        // Every protected method denies null
        const results = [
          authService.canCreatePet(null),
          authService.canClaimPet(null, pet),
          authService.canAccessPet(null, pet),
          authService.canModifyMedicalData(null, pet),
          authService.canEnrichProfile(null, pet),
          authService.canCreateCareSnapshot(null, pet),
          authService.canAccessClinic(null, clinicId),
          authService.canReportMissing(null, pet),
          authService.canDeletePet(null, pet),
        ]

        expect(results.every(r => !r.allowed)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 60: Co-onboarding role separation ───────────────────────────────

describe('[NFR-SEC-02] Property 60: Co-onboarding role separation', () => {
  /**
   * Vets and owners have non-overlapping write permissions:
   * - Vets can create/modify medical data but cannot claim/enrich/report missing
   * - Owners can claim/enrich/report missing but cannot create medical profiles or modify medical data
   */
  it('vet write permissions and owner write permissions do not overlap', () => {
    fc.assert(
      fc.property(vetUserArb, ownerUserArb, (vet, owner) => {
        const clinicId = vet.clinicId!
        const activePet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: owner.userId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet
        const pendingPet = { ...activePet, profileStatus: 'Pending Claim' as const, ownerId: undefined } as unknown as Pet

        // Vet write permissions
        const vetCanCreate = authService.canCreatePet(vet).allowed
        const vetCanModifyMedical = authService.canModifyMedicalData(vet, activePet).allowed
        const vetCanDelete = authService.canDeletePet(vet, activePet).allowed

        // Owner write permissions
        const ownerCanClaim = authService.canClaimPet(owner, pendingPet).allowed
        const ownerCanEnrich = authService.canEnrichProfile(owner, activePet).allowed
        const ownerCanSnapshot = authService.canCreateCareSnapshot(owner, activePet).allowed
        const ownerCanReportMissing = authService.canReportMissing(owner, activePet).allowed

        // Vet has vet permissions
        expect(vetCanCreate).toBe(true)
        expect(vetCanModifyMedical).toBe(true)
        expect(vetCanDelete).toBe(true)

        // Owner has owner permissions
        expect(ownerCanClaim).toBe(true)
        expect(ownerCanEnrich).toBe(true)
        expect(ownerCanSnapshot).toBe(true)
        expect(ownerCanReportMissing).toBe(true)

        // Cross-role: vet cannot do owner actions
        expect(authService.canClaimPet(vet, pendingPet).allowed).toBe(false)
        expect(authService.canEnrichProfile(vet, activePet).allowed).toBe(false)
        expect(authService.canCreateCareSnapshot(vet, activePet).allowed).toBe(false)
        expect(authService.canReportMissing(vet, activePet).allowed).toBe(false)

        // Cross-role: owner cannot do vet actions
        expect(authService.canCreatePet(owner).allowed).toBe(false)
        expect(authService.canModifyMedicalData(owner, activePet).allowed).toBe(false)
        expect(authService.canDeletePet(owner, activePet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 61: Profile claiming authorization ──────────────────────────────

describe('[NFR-SEC-02] Property 61: Profile claiming authorization', () => {
  /**
   * Only owners can claim profiles, and only when the profile is in "Pending Claim"
   * status with no existing owner.
   */
  it('owners can claim pending profiles without an owner', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, (owner, clinicId) => {
        const pendingPet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Pending Claim' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canClaimPet(owner, pendingPet).allowed).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('owners cannot claim active (already claimed) profiles', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, idArb, (owner, clinicId, existingOwnerId) => {
        const activePet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: existingOwnerId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canClaimPet(owner, activePet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('owners cannot claim profiles that already have an ownerId', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, idArb, (owner, clinicId, existingOwnerId) => {
        // Pending Claim but with ownerId set (edge case)
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Pending Claim' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: existingOwnerId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canClaimPet(owner, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('canClaimPet denies when pet is null', () => {
    fc.assert(
      fc.property(ownerUserArb, (owner) => {
        expect(authService.canClaimPet(owner, null).allowed).toBe(false)
        expect(authService.canClaimPet(owner, null).reason).toContain('not found')
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 62: Care snapshot access control ────────────────────────────────

describe('[NFR-SEC-02] Property 62: Care snapshot access control', () => {
  /**
   * Only pet owners can create care snapshots, and only for their own active pets.
   */
  it('owners can create snapshots for their own active pets', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, (owner, clinicId) => {
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: owner.userId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canCreateCareSnapshot(owner, pet).allowed).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('owners cannot create snapshots for other owners pets', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, idArb, (owner, clinicId, otherOwnerId) => {
        fc.pre(otherOwnerId !== owner.userId)
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: otherOwnerId, createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canCreateCareSnapshot(owner, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('owners cannot create snapshots for pending (unclaimed) pets', () => {
    fc.assert(
      fc.property(ownerUserArb, idArb, (owner, clinicId) => {
        const pet = { clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Pending Claim' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canCreateCareSnapshot(owner, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('vets cannot create care snapshots', () => {
    fc.assert(
      fc.property(vetUserArb, (vet) => {
        const pet = { clinicId: vet.clinicId, PK: '', SK: '', petId: 'p', name: 'P', species: 'Dog', breed: 'Lab', age: 1, profileStatus: 'Active' as const, medicallyVerified: true, verifyingVetId: 'v', verificationDate: '', ownerId: 'some-owner', createdAt: '', updatedAt: '', isMissing: false, GSI2PK: '', GSI2SK: '' } as Pet

        expect(authService.canCreateCareSnapshot(vet, pet).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('canCreateCareSnapshot denies when pet is null', () => {
    fc.assert(
      fc.property(ownerUserArb, (owner) => {
        expect(authService.canCreateCareSnapshot(owner, null).allowed).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
