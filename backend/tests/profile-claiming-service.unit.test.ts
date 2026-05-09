/**
 * Unit tests for ProfileClaimingService.transferPet() transaction support
 *
 * Tests the atomic pet transfer operation using DynamoDB transactions.
 * Validates:
 * - [NFR-REL-04]: Multi-step operations should be atomic
 * - [NFR-REL-03]: Partial changes should be rolled back on failure
 * - [NFR-REL-04]: Transaction integrity for data operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProfileClaimingService, TransferPetInput, TransactionError } from '../src/services/profile-claiming-service'

// Mock the AWS client factory
vi.mock('../src/infrastructure/aws-client-factory', () => ({
  AWSClientFactory: vi.fn().mockImplementation(() => ({
    createDynamoDBClient: vi.fn().mockReturnValue({}),
  })),
}))

// Mock DynamoDBDocumentClient
const mockSend = vi.fn()
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({ send: (...args: any[]) => mockSend(...args) }),
  },
  TransactWriteCommand: vi.fn().mockImplementation((input) => ({ input, type: 'TransactWrite' })),
  GetCommand: vi.fn().mockImplementation((input) => ({ input, type: 'Get' })),
  QueryCommand: vi.fn().mockImplementation((input) => ({ input, type: 'Query' })),
  PutCommand: vi.fn().mockImplementation((input) => ({ input, type: 'Put' })),
  UpdateCommand: vi.fn().mockImplementation((input) => ({ input, type: 'Update' })),
  DeleteCommand: vi.fn().mockImplementation((input) => ({ input, type: 'Delete' })),
  ScanCommand: vi.fn().mockImplementation((input) => ({ input, type: 'Scan' })),
}))

describe('ProfileClaimingService', () => {
  let service: ProfileClaimingService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProfileClaimingService('TestTable')
  })

  describe('transferPet()', () => {
    const validInput: TransferPetInput = {
      petId: 'pet-123',
      sourceOwnerId: 'owner-source',
      targetOwnerId: 'owner-target',
      targetOwnerName: 'Jane Doe',
      targetOwnerEmail: 'jane@example.com',
      targetOwnerPhone: '+1234567890',
    }

    const activePet = {
      PK: 'PET#pet-123',
      SK: 'METADATA',
      petId: 'pet-123',
      name: 'Max',
      species: 'Dog',
      breed: 'Golden Retriever',
      age: 3,
      clinicId: 'clinic-1',
      profileStatus: 'Active',
      ownerId: 'owner-source',
      ownerName: 'John Doe',
      ownerEmail: 'john@example.com',
      ownerPhone: '+0987654321',
      medicallyVerified: true,
      verifyingVetId: 'vet-1',
      verificationDate: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isMissing: false,
      GSI2PK: 'SPECIES#Dog',
      GSI2SK: 'BREED#Golden Retriever#AGE#3',
      GSI3PK: 'OWNER#owner-source',
      GSI3SK: 'PET#pet-123',
      GSI6PK: 'CLINIC#clinic-1',
      GSI6SK: 'PET#pet-123',
    }

    it('should successfully transfer pet ownership', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: activePet })
        .mockResolvedValueOnce({})

      const result = await service.transferPet(validInput)

      expect(result.petId).toBe('pet-123')
      expect(result.previousOwnerId).toBe('owner-source')
      expect(result.newOwnerId).toBe('owner-target')
      expect(result.newOwnerName).toBe('Jane Doe')
      expect(result.transferredAt).toBeDefined()
      expect(result.clinicChanged).toBe(false)
    })

    it('should transfer pet with clinic change', async () => {
      const inputWithClinic: TransferPetInput = {
        ...validInput,
        targetClinicId: 'clinic-2',
      }

      mockSend
        .mockResolvedValueOnce({ Item: activePet })
        .mockResolvedValueOnce({})

      const result = await service.transferPet(inputWithClinic)

      expect(result.clinicChanged).toBe(true)
      expect(result.petId).toBe('pet-123')
    })

    it('should throw TransactionError when pet is not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined })

      try {
        await service.transferPet(validInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('NOT_FOUND')
        expect((error as TransactionError).statusCode).toBe(404)
      }
    })

    it('should throw TransactionError when pet is not Active', async () => {
      const pendingPet = { ...activePet, profileStatus: 'Pending Claim' }
      mockSend.mockResolvedValueOnce({ Item: pendingPet })

      try {
        await service.transferPet(validInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('INVALID_STATE')
        expect((error as TransactionError).statusCode).toBe(400)
      }
    })

    it('should throw TransactionError when source owner does not match', async () => {
      const wrongOwnerPet = { ...activePet, ownerId: 'someone-else' }
      mockSend.mockResolvedValueOnce({ Item: wrongOwnerPet })

      try {
        await service.transferPet(validInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('OWNERSHIP_MISMATCH')
        expect((error as TransactionError).statusCode).toBe(403)
      }
    })

    it('should throw TransactionError on concurrent modification (rollback)', async () => {
      const transactionCancelledError = new Error('Transaction cancelled')
      transactionCancelledError.name = 'TransactionCanceledException'
      ;(transactionCancelledError as any).CancellationReasons = [
        { Code: 'ConditionalCheckFailed', Message: 'Condition not met' },
        { Code: 'None' },
      ]

      mockSend
        .mockResolvedValueOnce({ Item: activePet })
        .mockRejectedValueOnce(transactionCancelledError)

      try {
        await service.transferPet(validInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('CONCURRENT_MODIFICATION')
        expect((error as TransactionError).statusCode).toBe(409)
        expect((error as TransactionError).message).toContain('concurrent transfer')
      }
    })

    it('should throw TransactionError on duplicate transfer', async () => {
      const transactionCancelledError = new Error('Transaction cancelled')
      transactionCancelledError.name = 'TransactionCanceledException'
      ;(transactionCancelledError as any).CancellationReasons = [
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed', Message: 'Item already exists' },
      ]

      mockSend
        .mockResolvedValueOnce({ Item: activePet })
        .mockRejectedValueOnce(transactionCancelledError)

      try {
        await service.transferPet(validInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('DUPLICATE_TRANSFER')
        expect((error as TransactionError).statusCode).toBe(409)
      }
    })

    it('should throw validation error when petId is missing', async () => {
      const invalidInput = { ...validInput, petId: '' }

      try {
        await service.transferPet(invalidInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('VALIDATION_ERROR')
        expect((error as TransactionError).statusCode).toBe(400)
      }
    })

    it('should throw validation error when source and target owner are the same', async () => {
      const sameOwnerInput = { ...validInput, targetOwnerId: 'owner-source' }

      try {
        await service.transferPet(sameOwnerInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('VALIDATION_ERROR')
        expect((error as TransactionError).statusCode).toBe(400)
      }
    })

    it('should throw validation error when target owner details are missing', async () => {
      const missingDetailsInput = { ...validInput, targetOwnerName: '' }

      try {
        await service.transferPet(missingDetailsInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('VALIDATION_ERROR')
        expect((error as TransactionError).statusCode).toBe(400)
      }
    })

    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('Service unavailable')
      serviceError.name = 'ServiceUnavailableException'

      mockSend
        .mockResolvedValueOnce({ Item: activePet })
        .mockRejectedValueOnce(serviceError)

      try {
        await service.transferPet(validInput)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe('SERVICE_ERROR')
        expect((error as TransactionError).statusCode).toBe(500)
      }
    })
  })
})
