/**
 * ProfileClaimingService - Business logic for pet profile ownership workflow
 *
 * Handles finding pending claims, transferring ownership atomically,
 * validating owner eligibility, managing claiming code expiry, and
 * transactional pet transfers between owners.
 *
 * Requirements: [FR-04], [NFR-REL-03], [NFR-REL-04]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'
import { Pet, ClaimProfileInput, ClaimProfileResponse } from '../models/entities'
import { ValidationException } from '../validation/validators'

/**
 * Input for transferring a pet between owners/clinics
 */
export interface TransferPetInput {
  petId: string
  /** The current owner ID (for verification) */
  sourceOwnerId: string
  /** The new owner ID to transfer to */
  targetOwnerId: string
  /** The new owner's name */
  targetOwnerName: string
  /** The new owner's email */
  targetOwnerEmail: string
  /** The new owner's phone */
  targetOwnerPhone: string
  /** Optional: transfer to a different clinic */
  targetClinicId?: string
}

/**
 * Result of a successful pet transfer
 */
export interface TransferPetResult {
  petId: string
  previousOwnerId: string
  newOwnerId: string
  newOwnerName: string
  transferredAt: string
  clinicChanged: boolean
}

/**
 * Error thrown when a transfer transaction fails
 */
export class TransactionError extends Error {
  public readonly code: string
  public readonly statusCode: number

  constructor(message: string, code: string = 'TRANSACTION_FAILED', statusCode: number = 409) {
    super(message)
    this.name = 'TransactionError'
    this.code = code
    this.statusCode = statusCode
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ProfileClaimingService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private docClient: DynamoDBDocumentClient
  private tableName: string

  constructor(tableName: string = 'VetPetRegistry') {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.tableName = tableName
    const factory = new AWSClientFactory()
    const dynamoClient: DynamoDBClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(dynamoClient)
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
  async transferOwnership(input: ClaimProfileInput, ownerId: string): Promise<ClaimProfileResponse> {
    // Validate owner eligibility first
    const eligibility = await this.validateOwnerEligibility(input.claimingCode)
    if (!eligibility.eligible) {
      throw new ValidationException([
        { field: 'claimingCode', message: eligibility.reason ?? 'Not eligible to claim this profile' },
      ])
    }

    // Perform the atomic ownership transfer via the repository
    return this.petRepo.claimProfile(eligibility.pet!.petId, input, ownerId)
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

  /**
   * Transfer pet ownership atomically using DynamoDB transactions.
   *
   * This operation uses TransactWriteItems to ensure that:
   * 1. The pet exists and is currently owned by the source owner (condition check)
   * 2. The pet's owner fields are updated to the target owner
   * 3. The GSI3 (owner lookup) index attributes are updated atomically
   * 4. If a clinic change is requested, the GSI6 (clinic lookup) is also updated
   *
   * If any condition fails (e.g., pet was already transferred by another request),
   * the entire transaction is rejected — no partial changes occur.
   *
   * Requirements:
   * - [NFR-REL-04]: Multi-step operations should be atomic
   * - [NFR-REL-03]: Partial changes should be rolled back on failure
   * - [NFR-REL-04]: Transaction integrity for data operations
   */
  async transferPet(input: TransferPetInput): Promise<TransferPetResult> {
    // Validate input
    if (!input.petId) {
      throw new TransactionError('Pet ID is required', 'VALIDATION_ERROR', 400)
    }
    if (!input.sourceOwnerId) {
      throw new TransactionError('Source owner ID is required', 'VALIDATION_ERROR', 400)
    }
    if (!input.targetOwnerId) {
      throw new TransactionError('Target owner ID is required', 'VALIDATION_ERROR', 400)
    }
    if (input.sourceOwnerId === input.targetOwnerId) {
      throw new TransactionError(
        'Source and target owner cannot be the same',
        'VALIDATION_ERROR',
        400
      )
    }
    if (!input.targetOwnerName || !input.targetOwnerEmail || !input.targetOwnerPhone) {
      throw new TransactionError(
        'Target owner name, email, and phone are required',
        'VALIDATION_ERROR',
        400
      )
    }

    // First, verify the pet exists and get current state
    const pet = await this.petRepo.findById(input.petId)
    if (!pet) {
      throw new TransactionError('Pet not found', 'NOT_FOUND', 404)
    }

    if (pet.profileStatus !== 'Active') {
      throw new TransactionError(
        'Only active pet profiles can be transferred',
        'INVALID_STATE',
        400
      )
    }

    if (pet.ownerId !== input.sourceOwnerId) {
      throw new TransactionError(
        'Pet is not owned by the specified source owner',
        'OWNERSHIP_MISMATCH',
        403
      )
    }

    const now = new Date().toISOString()
    const clinicChanged = !!input.targetClinicId && input.targetClinicId !== pet.clinicId

    // Build the transactional write with condition expressions for safety
    const transactItems: TransactWriteCommandInput['TransactItems'] = []

    // Item 1: Update the pet record with new owner information
    const updateExpression = clinicChanged
      ? `SET ownerId = :targetOwnerId, ownerName = :targetOwnerName, ownerEmail = :targetOwnerEmail, ownerPhone = :targetOwnerPhone, updatedAt = :now, GSI3PK = :newGsi3pk, GSI3SK = :gsi3sk, clinicId = :newClinicId, GSI6PK = :newGsi6pk, GSI6SK = :gsi6sk`
      : `SET ownerId = :targetOwnerId, ownerName = :targetOwnerName, ownerEmail = :targetOwnerEmail, ownerPhone = :targetOwnerPhone, updatedAt = :now, GSI3PK = :newGsi3pk, GSI3SK = :gsi3sk`

    const expressionAttributeValues: Record<string, any> = {
      ':sourceOwnerId': input.sourceOwnerId,
      ':activeStatus': 'Active',
      ':targetOwnerId': input.targetOwnerId,
      ':targetOwnerName': input.targetOwnerName,
      ':targetOwnerEmail': input.targetOwnerEmail,
      ':targetOwnerPhone': input.targetOwnerPhone,
      ':now': now,
      ':newGsi3pk': `OWNER#${input.targetOwnerId}`,
      ':gsi3sk': `PET#${input.petId}`,
    }

    if (clinicChanged) {
      expressionAttributeValues[':newClinicId'] = input.targetClinicId
      expressionAttributeValues[':newGsi6pk'] = `CLINIC#${input.targetClinicId}`
      expressionAttributeValues[':gsi6sk'] = `PET#${input.petId}`
    }

    transactItems.push({
      Update: {
        TableName: this.tableName,
        Key: {
          PK: `PET#${input.petId}`,
          SK: 'METADATA',
        },
        UpdateExpression: updateExpression,
        ConditionExpression:
          'ownerId = :sourceOwnerId AND profileStatus = :activeStatus',
        ExpressionAttributeValues: expressionAttributeValues,
      },
    })

    // Item 2: Create a transfer audit record for traceability
    transactItems.push({
      Put: {
        TableName: this.tableName,
        Item: {
          PK: `PET#${input.petId}`,
          SK: `TRANSFER#${now}`,
          petId: input.petId,
          previousOwnerId: input.sourceOwnerId,
          newOwnerId: input.targetOwnerId,
          newOwnerName: input.targetOwnerName,
          previousClinicId: pet.clinicId,
          newClinicId: clinicChanged ? input.targetClinicId : pet.clinicId,
          transferredAt: now,
          type: 'OWNERSHIP_TRANSFER',
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    })

    // Execute the transaction
    try {
      const command = new TransactWriteCommand({
        TransactItems: transactItems,
      })

      await this.docClient.send(command)

      return {
        petId: input.petId,
        previousOwnerId: input.sourceOwnerId,
        newOwnerId: input.targetOwnerId,
        newOwnerName: input.targetOwnerName,
        transferredAt: now,
        clinicChanged,
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'TransactionCanceledException') {
          const cancelledError = error as Error & {
            CancellationReasons?: Array<{ Code?: string; Message?: string }>
          }
          const reasons = cancelledError.CancellationReasons || []

          if (reasons[0]?.Code === 'ConditionalCheckFailed') {
            throw new TransactionError(
              'Transfer failed: pet ownership has changed or pet is no longer active. ' +
                'This may be due to a concurrent transfer by another user.',
              'CONCURRENT_MODIFICATION',
              409
            )
          }

          if (reasons[1]?.Code === 'ConditionalCheckFailed') {
            throw new TransactionError(
              'Transfer failed: a transfer was already recorded at this timestamp. ' +
                'Please retry the operation.',
              'DUPLICATE_TRANSFER',
              409
            )
          }

          throw new TransactionError(
            `Transfer transaction was cancelled: ${reasons.map((r) => r.Code).join(', ')}`,
            'TRANSACTION_CANCELLED',
            409
          )
        }

        throw new TransactionError(
          `Transfer failed due to a service error: ${error.message}`,
          'SERVICE_ERROR',
          500
        )
      }

      throw new TransactionError(
        'Transfer failed due to an unexpected error',
        'UNKNOWN_ERROR',
        500
      )
    }
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
