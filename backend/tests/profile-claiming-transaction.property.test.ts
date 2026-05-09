/**
 * Property-based tests for ProfileClaimingService.transferPet() transaction handling
 * Uses fast-check with numRuns: 100 (mocked DynamoDB, pure logic verification).
 *
 * Properties covered:
 *   Property 25: Durability before confirmation — transfer result is only returned after transaction commit
 *   Property 26: Concurrent update safety — two concurrent transfers of the same pet cannot both succeed
 *   Property 27: Transaction rollback — if any part of the transaction fails, no changes are persisted
 *   Property 28: Referential integrity — after transfer, pet's owner fields are consistent with transfer target
 *
 * Validates: Requirements [NFR-REL-03], [NFR-REL-04]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { ProfileClaimingService, TransferPetInput, TransferPetResult, TransactionError } from '../src/services/profile-claiming-service'

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

const idArb = fc.uuid()
const nameArb = fc.string({ minLength: 2, maxLength: 30 }).filter((s) => s.trim().length > 0)
const emailArb = fc.constant('test@example.com')
const phoneArb = fc.constant('+12345678901')

const transferInputArb: fc.Arbitrary<TransferPetInput> = fc.record({
  petId: idArb,
  sourceOwnerId: idArb,
  targetOwnerId: idArb,
  targetOwnerName: nameArb,
  targetOwnerEmail: emailArb,
  targetOwnerPhone: phoneArb,
}).filter((input) => input.sourceOwnerId !== input.targetOwnerId)

const transferInputWithClinicArb: fc.Arbitrary<TransferPetInput> = fc.record({
  petId: idArb,
  sourceOwnerId: idArb,
  targetOwnerId: idArb,
  targetOwnerName: nameArb,
  targetOwnerEmail: emailArb,
  targetOwnerPhone: phoneArb,
  targetClinicId: idArb,
}).filter((input) => input.sourceOwnerId !== input.targetOwnerId)

/**
 * Creates a mock active pet record matching the given transfer input
 */
function createActivePet(input: TransferPetInput) {
  return {
    PK: `PET#${input.petId}`,
    SK: 'METADATA',
    petId: input.petId,
    name: 'TestPet',
    species: 'Dog',
    breed: 'Labrador',
    age: 3,
    clinicId: 'clinic-1',
    profileStatus: 'Active',
    ownerId: input.sourceOwnerId,
    ownerName: 'Original Owner',
    ownerEmail: 'original@example.com',
    ownerPhone: '+10000000000',
    medicallyVerified: true,
    verifyingVetId: 'vet-1',
    verificationDate: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    isMissing: false,
    GSI2PK: 'SPECIES#Dog',
    GSI2SK: 'BREED#Labrador#AGE#3',
    GSI3PK: `OWNER#${input.sourceOwnerId}`,
    GSI3SK: `PET#${input.petId}`,
    GSI6PK: 'CLINIC#clinic-1',
    GSI6SK: `PET#${input.petId}`,
  }
}

// ── Property 25: Durability before confirmation ──────────────────────────────

describe('Property 25: Durability before confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * For any valid transfer input, the transfer result is only returned after
   * the TransactWriteCommand has been successfully sent (committed). If the
   * transaction send resolves, the result is returned; if it rejects, no
   * result is returned.
   */
  it('transfer result is only returned after successful transaction commit', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        // Mock: GetCommand returns the pet, TransactWriteCommand succeeds
        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockResolvedValueOnce({})

        const result = await service.transferPet(input)

        // The result is only returned after the transaction was committed
        // Verify that mockSend was called exactly twice (Get + TransactWrite)
        expect(mockSend).toHaveBeenCalledTimes(2)

        // The result must contain the correct transfer data
        expect(result).toBeDefined()
        expect(result.petId).toBe(input.petId)
        expect(result.previousOwnerId).toBe(input.sourceOwnerId)
        expect(result.newOwnerId).toBe(input.targetOwnerId)
        expect(result.transferredAt).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * If the transaction send fails (rejects), no result is returned — an error
   * is thrown instead, confirming that results are only returned on commit success.
   */
  it('no result is returned when transaction commit fails', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        // Mock: GetCommand returns the pet, TransactWriteCommand fails
        const serviceError = new Error('DynamoDB service error')
        serviceError.name = 'InternalServerError'
        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockRejectedValueOnce(serviceError)

        let result: TransferPetResult | undefined
        let errorThrown = false

        try {
          result = await service.transferPet(input)
        } catch (error) {
          errorThrown = true
          expect(error).toBeInstanceOf(TransactionError)
        }

        // Either an error was thrown (no result) or no result was returned
        expect(errorThrown).toBe(true)
        expect(result).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 26: Concurrent update safety ────────────────────────────────────

describe('Property 26: Concurrent update safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * For any two concurrent transfers of the same pet, at most one can succeed.
   * DynamoDB's TransactWriteItems with ConditionExpression ensures that if the
   * ownership has already changed, the second transfer fails with a
   * ConditionalCheckFailed error.
   */
  it('two concurrent transfers of the same pet cannot both succeed', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferInputArb,
        idArb,
        nameArb,
        async (input, secondTargetId, secondTargetName) => {
          // Ensure the second target is different from both source and first target
          fc.pre(secondTargetId !== input.sourceOwnerId && secondTargetId !== input.targetOwnerId)

          vi.clearAllMocks()
          const service = new ProfileClaimingService('TestTable')
          const pet = createActivePet(input)

          // Simulate: first transfer succeeds, second fails due to condition check
          // First call: Get succeeds, TransactWrite succeeds
          // Second call: Get succeeds (returns original pet), TransactWrite fails
          const transactionCancelledError = new Error('Transaction cancelled')
          transactionCancelledError.name = 'TransactionCanceledException'
          ;(transactionCancelledError as any).CancellationReasons = [
            { Code: 'ConditionalCheckFailed', Message: 'Condition not met' },
            { Code: 'None' },
          ]

          // First transfer succeeds
          mockSend
            .mockResolvedValueOnce({ Item: pet })
            .mockResolvedValueOnce({})

          const result1 = await service.transferPet(input)
          expect(result1.newOwnerId).toBe(input.targetOwnerId)

          // Second transfer: pet still appears as owned by source (stale read),
          // but the transaction condition check catches the conflict
          const secondInput: TransferPetInput = {
            petId: input.petId,
            sourceOwnerId: input.sourceOwnerId,
            targetOwnerId: secondTargetId,
            targetOwnerName: secondTargetName,
            targetOwnerEmail: 'second@example.com',
            targetOwnerPhone: '+19999999999',
          }

          mockSend
            .mockResolvedValueOnce({ Item: pet })
            .mockRejectedValueOnce(transactionCancelledError)

          let secondSucceeded = false
          try {
            await service.transferPet(secondInput)
            secondSucceeded = true
          } catch (error) {
            expect(error).toBeInstanceOf(TransactionError)
            expect((error as TransactionError).code).toBe('CONCURRENT_MODIFICATION')
          }

          // At most one transfer succeeds
          expect(secondSucceeded).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * The condition expression in the transaction ensures that the pet must still
   * be owned by the source owner AND be in Active status. This prevents any
   * concurrent modification from succeeding.
   */
  it('condition expression prevents transfer when ownership already changed', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, idArb, async (input, differentOwnerId) => {
        fc.pre(differentOwnerId !== input.sourceOwnerId)

        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')

        // Pet is owned by a different owner than expected (simulating a race condition)
        const pet = createActivePet(input)
        pet.ownerId = differentOwnerId

        mockSend.mockResolvedValueOnce({ Item: pet })

        let errorThrown = false
        try {
          await service.transferPet(input)
        } catch (error) {
          errorThrown = true
          expect(error).toBeInstanceOf(TransactionError)
          expect((error as TransactionError).code).toBe('OWNERSHIP_MISMATCH')
        }

        expect(errorThrown).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 27: Transaction rollback ────────────────────────────────────────

describe('Property 27: Transaction rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: [NFR-REL-03]**
   *
   * If any part of the DynamoDB transaction fails, the entire transaction is
   * rejected atomically — no partial changes are persisted. This is guaranteed
   * by DynamoDB's TransactWriteItems semantics.
   */
  it('failed transaction leaves no partial state (atomic rejection)', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        // Simulate: the audit record condition fails (duplicate transfer)
        const transactionCancelledError = new Error('Transaction cancelled')
        transactionCancelledError.name = 'TransactionCanceledException'
        ;(transactionCancelledError as any).CancellationReasons = [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed', Message: 'Item already exists' },
        ]

        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockRejectedValueOnce(transactionCancelledError)

        let errorThrown = false
        try {
          await service.transferPet(input)
        } catch (error) {
          errorThrown = true
          expect(error).toBeInstanceOf(TransactionError)
          // The error indicates the transaction was cancelled — no partial writes
          expect((error as TransactionError).code).toBe('DUPLICATE_TRANSFER')
        }

        expect(errorThrown).toBe(true)

        // Verify: only 2 calls were made (Get + failed TransactWrite)
        // No additional writes or cleanup calls — DynamoDB handles rollback atomically
        expect(mockSend).toHaveBeenCalledTimes(2)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-03]**
   *
   * For any service-level error during the transaction, the system throws a
   * TransactionError and does not attempt partial writes. The data remains
   * in its original state.
   */
  it('service errors during transaction result in error with no partial writes', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferInputArb,
        fc.constantFrom(
          'ServiceUnavailableException',
          'ProvisionedThroughputExceededException',
          'InternalServerError',
          'RequestLimitExceeded'
        ),
        async (input, errorName) => {
          vi.clearAllMocks()
          const service = new ProfileClaimingService('TestTable')
          const pet = createActivePet(input)

          const serviceError = new Error(`${errorName}: service failure`)
          serviceError.name = errorName

          mockSend
            .mockResolvedValueOnce({ Item: pet })
            .mockRejectedValueOnce(serviceError)

          let errorThrown = false
          try {
            await service.transferPet(input)
          } catch (error) {
            errorThrown = true
            expect(error).toBeInstanceOf(TransactionError)
            expect((error as TransactionError).code).toBe('SERVICE_ERROR')
            expect((error as TransactionError).statusCode).toBe(500)
          }

          expect(errorThrown).toBe(true)
          // Only Get + failed TransactWrite — no partial state persisted
          expect(mockSend).toHaveBeenCalledTimes(2)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-03]**
   *
   * When the first condition check in the transaction fails (ownership changed),
   * the entire transaction is rolled back — including the audit record Put.
   */
  it('ownership condition failure rolls back the entire transaction including audit record', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        // First item condition fails (ownership changed)
        const transactionCancelledError = new Error('Transaction cancelled')
        transactionCancelledError.name = 'TransactionCanceledException'
        ;(transactionCancelledError as any).CancellationReasons = [
          { Code: 'ConditionalCheckFailed', Message: 'Ownership changed' },
          { Code: 'None' },
        ]

        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockRejectedValueOnce(transactionCancelledError)

        let errorThrown = false
        try {
          await service.transferPet(input)
        } catch (error) {
          errorThrown = true
          expect(error).toBeInstanceOf(TransactionError)
          expect((error as TransactionError).code).toBe('CONCURRENT_MODIFICATION')
        }

        expect(errorThrown).toBe(true)
        // No additional calls beyond Get + TransactWrite — atomic rollback
        expect(mockSend).toHaveBeenCalledTimes(2)
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 28: Referential integrity ───────────────────────────────────────

describe('Property 28: Referential integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * After a successful transfer, the result's owner fields are consistent
   * with the transfer input — the new owner ID and name match exactly.
   */
  it('after transfer, owner fields in result match the transfer target', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockResolvedValueOnce({})

        const result = await service.transferPet(input)

        // Referential integrity: result fields match the transfer input
        expect(result.newOwnerId).toBe(input.targetOwnerId)
        expect(result.newOwnerName).toBe(input.targetOwnerName)
        expect(result.previousOwnerId).toBe(input.sourceOwnerId)
        expect(result.petId).toBe(input.petId)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * After a successful transfer with clinic change, the clinicChanged flag
   * is true and the transaction includes the clinic update in the same
   * atomic operation.
   */
  it('after transfer with clinic change, clinicChanged flag is consistent', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputWithClinicArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockResolvedValueOnce({})

        const result = await service.transferPet(input)

        // When targetClinicId is provided and differs from current clinic,
        // clinicChanged should be true
        expect(result.clinicChanged).toBe(true)
        expect(result.newOwnerId).toBe(input.targetOwnerId)
        expect(result.newOwnerName).toBe(input.targetOwnerName)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * The TransactWriteCommand includes the correct owner fields in the update
   * expression, ensuring the DynamoDB record will be consistent with the
   * transfer input after commit.
   */
  it('transaction command includes correct owner fields for DynamoDB update', async () => {
    const { TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb')

    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockResolvedValueOnce({})

        await service.transferPet(input)

        // Verify the TransactWriteCommand was called with correct owner fields
        expect(TransactWriteCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            TransactItems: expect.arrayContaining([
              expect.objectContaining({
                Update: expect.objectContaining({
                  ExpressionAttributeValues: expect.objectContaining({
                    ':targetOwnerId': input.targetOwnerId,
                    ':targetOwnerName': input.targetOwnerName,
                    ':targetOwnerEmail': input.targetOwnerEmail,
                    ':targetOwnerPhone': input.targetOwnerPhone,
                  }),
                }),
              }),
            ]),
          })
        )
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: [NFR-REL-04]**
   *
   * The transfer result always includes a valid ISO timestamp, confirming
   * the transfer was recorded with temporal consistency.
   */
  it('transfer result includes valid ISO timestamp for temporal consistency', async () => {
    await fc.assert(
      fc.asyncProperty(transferInputArb, async (input) => {
        vi.clearAllMocks()
        const service = new ProfileClaimingService('TestTable')
        const pet = createActivePet(input)

        mockSend
          .mockResolvedValueOnce({ Item: pet })
          .mockResolvedValueOnce({})

        const result = await service.transferPet(input)

        // transferredAt must be a valid ISO date string
        const parsed = new Date(result.transferredAt)
        expect(parsed.toISOString()).toBe(result.transferredAt)
        expect(isNaN(parsed.getTime())).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
