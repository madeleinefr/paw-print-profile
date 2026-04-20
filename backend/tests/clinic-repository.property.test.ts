/**
 * Property-based tests for ClinicRepository
 * Uses fast-check with numRuns: 100 against LocalStack at localhost:4566.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { v4 as uuidv4 } from 'uuid'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { ClinicRepository } from '../src/repositories/clinic-repository'

const TEST_TABLE = 'VetPetRegistry-ClinicRepo-Test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Non-empty string up to 15 chars */
const shortStr = fc.string({ minLength: 1, maxLength: 15 })

/** Valid CreateClinicInput arbitrary */
const clinicArb = fc.record({
  name: shortStr,
  address: shortStr,
  city: shortStr,
  state: shortStr,
  zipCode: fc.constant('12345'),
  phone: fc.constant('+12345678901'),
  email: fc.constant('test@example.com'),
  licenseNumber: shortStr,
  latitude: fc.float({ min: -89, max: 89, noNaN: true }),
  longitude: fc.float({ min: -179, max: 179, noNaN: true }),
})

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let repo: ClinicRepository

beforeAll(async () => {
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })
  repo = new ClinicRepository(TEST_TABLE)
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}, 60_000)

// ── Property 14: Clinic data persistence ─────────────────────────────────────

describe('[FR-01] Property 14: Clinic data persistence', () => {
  /**
   * For any valid clinic input, create() persists all fields and findById()
   * returns them correctly.
   */
  it('create() persists all fields and findById() returns them correctly', async () => {
    await fc.assert(
      fc.asyncProperty(clinicArb, async (input) => {
        const created = await repo.create(input)

        // Response fields match input
        expect(created.name).toBe(input.name)
        expect(created.address).toBe(input.address)
        expect(created.city).toBe(input.city)
        expect(created.state).toBe(input.state)
        expect(created.zipCode).toBe(input.zipCode)
        expect(created.phone).toBe(input.phone)
        expect(created.email).toBe(input.email)
        expect(created.licenseNumber).toBe(input.licenseNumber)
        expect(created.latitude).toBe(input.latitude)
        expect(created.longitude).toBe(input.longitude)
        expect(created.clinicId).toBeTruthy()

        // Persisted record matches via findById
        const persisted = await repo.findById(created.clinicId)
        expect(persisted).not.toBeNull()
        expect(persisted!.name).toBe(input.name)
        expect(persisted!.address).toBe(input.address)
        expect(persisted!.city).toBe(input.city)
        expect(persisted!.state).toBe(input.state)
        expect(persisted!.zipCode).toBe(input.zipCode)
        expect(persisted!.phone).toBe(input.phone)
        expect(persisted!.email).toBe(input.email)
        expect(persisted!.licenseNumber).toBe(input.licenseNumber)
        // Use closeTo to handle -0 vs 0 float edge cases from DynamoDB round-trip
        expect(persisted!.latitude).toBeCloseTo(input.latitude, 5)
        expect(persisted!.longitude).toBeCloseTo(input.longitude, 5)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 15: Unique clinic identifiers ────────────────────────────────────

describe('[FR-01] Property 15: Unique clinic identifiers', () => {
  /**
   * For any two valid clinic inputs, create() generates different clinicIds
   * for each.
   */
  it('create() generates different clinicIds for each clinic', async () => {
    await fc.assert(
      fc.asyncProperty(clinicArb, clinicArb, async (inputA, inputB) => {
        const clinicA = await repo.create(inputA)
        const clinicB = await repo.create(inputB)

        expect(clinicA.clinicId).not.toBe(clinicB.clinicId)
        expect(clinicA.PK).not.toBe(clinicB.PK)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 16: License number uniqueness ────────────────────────────────────

describe('[FR-02] Property 16: License number uniqueness', () => {
  /**
   * For any valid clinic, findByLicenseNumber() returns the correct clinic
   * by its license number using GSI1.
   */
  it('findByLicenseNumber() returns the correct clinic via GSI1', async () => {
    await fc.assert(
      fc.asyncProperty(clinicArb, async (input) => {
        // Append a unique suffix to avoid license number collisions across runs
        const uniqueInput = { ...input, licenseNumber: `${input.licenseNumber}-${uuidv4()}` }
        const created = await repo.create(uniqueInput)

        const found = await repo.findByLicenseNumber(uniqueInput.licenseNumber)
        expect(found).not.toBeNull()
        expect(found!.clinicId).toBe(created.clinicId)
        expect(found!.licenseNumber).toBe(uniqueInput.licenseNumber)
        expect(found!.name).toBe(uniqueInput.name)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})
