/**
 * Integration tests for Lambda handlers
 *
 * Tests invoke the actual Lambda handler functions with crafted API Gateway events
 * to verify the full request/response cycle through the handlers.
 *
 * Coverage:
 * - Co-onboarding workflow end-to-end (Vet creates → Owner claims → Owner enriches)
 * - Role-based authorization (Vet vs Owner vs Public)
 * - Claiming code validation and expiry
 * - Care snapshot access and expiry
 * - 3-click missing pet flyer generation
 *
 * Requirements: [FR-03], [FR-04], [FR-05], [NFR-SEC-02], [NFR-USA-01]
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { ClinicRepository } from '../src/repositories/clinic-repository'
import { PetRepository } from '../src/repositories/pet-repository'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The handlers instantiate services at module scope using the default table
 * name 'VetPetRegistry'. We create that table in beforeAll so the handlers
 * work against a real DynamoDB (LocalStack) instance.
 */
const TABLE_NAME = 'VetPetRegistry'

/**
 * Build a minimal APIGatewayProxyEvent for testing.
 */
function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    resource: '/',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  }
}

function vetHeaders(clinicId: string, vetId: string = 'vet-integ-1') {
  return {
    'x-user-type': 'vet',
    'x-user-id': vetId,
    'x-clinic-id': clinicId,
  }
}

function ownerHeaders(ownerId: string = 'owner-integ-1') {
  return {
    'x-user-type': 'owner',
    'x-user-id': ownerId,
  }
}

function parseBody(result: APIGatewayProxyResult): any {
  return result.body ? JSON.parse(result.body) : null
}

// ── Table Setup / Teardown ───────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let clinicRepo: ClinicRepository
let petRepo: PetRepository
let sharedClinicId: string

// Dynamically import handlers after table is ready (they create services at module scope)
let petHandler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
let clinicHandler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
let emergencyHandler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>
let searchHandler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>

beforeAll(async () => {
  // Suppress noisy handler logs during tests
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  initializer = new DynamoDBTableInitializer(TABLE_NAME)
  await initializer.initializeForTesting({ tableName: TABLE_NAME })

  // Repositories for direct data setup
  clinicRepo = new ClinicRepository(TABLE_NAME)
  petRepo = new PetRepository(TABLE_NAME)

  // Create a shared clinic for all tests
  const clinic = await clinicRepo.create({
    name: 'Integration Test Clinic',
    address: '100 Test Blvd',
    city: 'Testville',
    state: 'TX',
    zipCode: '75001',
    phone: '+15551112222',
    email: 'integ@vetclinic.com',
    licenseNumber: `LIC-INTEG-${Date.now()}`,
    latitude: 32.78,
    longitude: -96.80,
  })
  sharedClinicId = clinic.clinicId

  // Import handlers (they instantiate services at module scope)
  const petMod = await import('../src/handlers/pet-co-onboarding-handler')
  const clinicMod = await import('../src/handlers/clinic-handler')
  const emergencyMod = await import('../src/handlers/emergency-tools-handler')
  const searchMod = await import('../src/handlers/search-handler')

  petHandler = petMod.handler
  clinicHandler = clinicMod.handler
  emergencyHandler = emergencyMod.handler
  searchHandler = searchMod.handler
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TABLE_NAME)
  } catch {
    // ignore cleanup errors
  }
  vi.restoreAllMocks()
}, 60_000)


// ── 1. Co-Onboarding Workflow End-to-End ─────────────────────────────────────

describe('[FR-03][FR-04][FR-05] Co-onboarding workflow end-to-end', () => {
  let createdPetId: string
  let claimingCode: string

  it('Vet creates a medical pet profile via POST /pets', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets',
        resource: '/pets',
        headers: vetHeaders(sharedClinicId),
        body: JSON.stringify({
          name: 'Buddy',
          species: 'Dog',
          breed: 'Golden Retriever',
          age: 3,
        }),
      })
    )

    expect(result.statusCode).toBe(201)
    const body = parseBody(result)
    expect(body.petId).toBeDefined()
    expect(body.name).toBe('Buddy')
    expect(body.profileStatus).toBe('Pending Claim')
    expect(body.claimingCode).toBeDefined()
    expect(body.medicallyVerified).toBe(true)

    createdPetId = body.petId
    claimingCode = body.claimingCode
  })

  it('Owner validates the claiming code via POST /claiming-codes/validate', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/claiming-codes/validate',
        resource: '/claiming-codes/validate',
        headers: ownerHeaders(),
        body: JSON.stringify({ claimingCode }),
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.valid).toBe(true)
    expect(body.pet.petId).toBe(createdPetId)
    expect(body.pet.name).toBe('Buddy')
  })

  it('Owner claims the pet profile via POST /pets/claim', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets/claim',
        resource: '/pets/claim',
        headers: ownerHeaders(),
        body: JSON.stringify({
          claimingCode,
          ownerName: 'Jane Doe',
          ownerEmail: 'jane@example.com',
          ownerPhone: '+15559876543',
        }),
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.petId).toBe(createdPetId)
    expect(body.profileStatus).toBe('Active')
    expect(body.ownerId).toBe('owner-integ-1')
  })

  it('Owner enriches the claimed profile via PUT /pets/{petId}/enrich', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'PUT',
        path: `/pets/${createdPetId}/enrich`,
        resource: '/pets/{petId}/enrich',
        headers: ownerHeaders(),
        pathParameters: { petId: createdPetId },
        body: JSON.stringify({
          ownerName: 'Jane Doe-Smith',
          customFields: { favoriteFood: 'Salmon' },
        }),
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.ownerName).toBe('Jane Doe-Smith')
  })

  it('Owner can GET the pet details after claiming', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${createdPetId}`,
        resource: '/pets/{petId}',
        headers: ownerHeaders(),
        pathParameters: { petId: createdPetId },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.pet.petId).toBe(createdPetId)
    expect(body.pet.profileStatus).toBe('Active')
  })

  it('Vet can also GET the pet details (same clinic)', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${createdPetId}`,
        resource: '/pets/{petId}',
        headers: vetHeaders(sharedClinicId),
        pathParameters: { petId: createdPetId },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.pet.petId).toBe(createdPetId)
  })
})

// ── 2. Role-Based Authorization ──────────────────────────────────────────────

describe('[NFR-SEC-02] Role-based authorization', () => {
  it('unauthenticated request to POST /pets returns 401', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets',
        resource: '/pets',
        headers: {},
        body: JSON.stringify({ name: 'Nope', species: 'Cat', breed: 'Siamese', age: 2 }),
      })
    )

    expect(result.statusCode).toBe(401)
    const body = parseBody(result)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('Owner cannot create a medical profile (POST /pets)', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets',
        resource: '/pets',
        headers: ownerHeaders(),
        body: JSON.stringify({ name: 'Nope', species: 'Cat', breed: 'Siamese', age: 2 }),
      })
    )

    expect(result.statusCode).toBe(403)
    const body = parseBody(result)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('Vet cannot claim a pet profile (POST /pets/claim)', async () => {
    // First create a pet to have a valid claiming code
    const profile = await petRepo.createMedicalProfile({
      name: 'AuthzTestPet',
      species: 'Cat',
      breed: 'Persian',
      age: 2,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })

    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets/claim',
        resource: '/pets/claim',
        headers: vetHeaders(sharedClinicId),
        body: JSON.stringify({
          claimingCode: profile.claimingCode,
          ownerName: 'Vet Trying',
          ownerEmail: 'vet@example.com',
          ownerPhone: '+15551111111',
        }),
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('Vet from a different clinic cannot access pet', async () => {
    // Create a pet in the shared clinic
    const profile = await petRepo.createMedicalProfile({
      name: 'ClinicBoundPet',
      species: 'Dog',
      breed: 'Poodle',
      age: 4,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })

    const result = await petHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${profile.petId}`,
        resource: '/pets/{petId}',
        headers: vetHeaders('other-clinic-id', 'vet-other'),
        pathParameters: { petId: profile.petId },
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('Owner cannot access another owner\'s pet', async () => {
    // Create and claim a pet for owner-A
    const profile = await petRepo.createMedicalProfile({
      name: 'OwnerAPet',
      species: 'Cat',
      breed: 'Maine Coon',
      age: 3,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Owner A',
      ownerEmail: 'a@example.com',
      ownerPhone: '+15550000001',
    }, 'owner-A')

    // Owner B tries to access
    const result = await petHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${profile.petId}`,
        resource: '/pets/{petId}',
        headers: ownerHeaders('owner-B'),
        pathParameters: { petId: profile.petId },
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('Owner cannot add vaccine records (Vet only)', async () => {
    const profile = await petRepo.createMedicalProfile({
      name: 'VaccineAuthzPet',
      species: 'Dog',
      breed: 'Beagle',
      age: 1,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })

    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${profile.petId}/vaccines`,
        resource: '/pets/{petId}/vaccines',
        headers: ownerHeaders(),
        pathParameters: { petId: profile.petId },
        body: JSON.stringify({
          vaccineName: 'Rabies',
          administeredDate: '2024-01-15',
          nextDueDate: '2025-01-15',
          veterinarianName: 'Dr. Test',
        }),
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('Search handler works without authentication (public)', async () => {
    const result = await searchHandler(
      makeEvent({
        httpMethod: 'GET',
        path: '/search/pets',
        resource: '/search/pets',
        headers: {},
        queryStringParameters: { species: 'Dog' },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.results).toBeDefined()
  })

  it('OPTIONS requests return 200 for CORS preflight', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'OPTIONS',
        path: '/pets',
        resource: '/pets',
        headers: {},
      })
    )

    expect(result.statusCode).toBe(200)
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*')
  })
})

// ── 3. Claiming Code Validation and Expiry ───────────────────────────────────

describe('[FR-04] Claiming code validation and expiry', () => {
  it('invalid claiming code returns valid=false', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/claiming-codes/validate',
        resource: '/claiming-codes/validate',
        headers: ownerHeaders(),
        body: JSON.stringify({ claimingCode: 'CLAIM-INVALID' }),
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.valid).toBe(false)
  })

  it('already-claimed profile cannot be claimed again', async () => {
    // Create and claim a pet
    const profile = await petRepo.createMedicalProfile({
      name: 'AlreadyClaimed',
      species: 'Dog',
      breed: 'Labrador',
      age: 5,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'First Owner',
      ownerEmail: 'first@example.com',
      ownerPhone: '+15550000002',
    }, 'owner-first')

    // Try to claim again with the same code
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets/claim',
        resource: '/pets/claim',
        headers: ownerHeaders('owner-second'),
        body: JSON.stringify({
          claimingCode: profile.claimingCode,
          ownerName: 'Second Owner',
          ownerEmail: 'second@example.com',
          ownerPhone: '+15550000003',
        }),
      })
    )

    // Should fail — profile is already claimed
    expect(result.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('missing claimingCode in validate request returns 400', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/claiming-codes/validate',
        resource: '/claiming-codes/validate',
        headers: ownerHeaders(),
        body: JSON.stringify({}),
      })
    )

    expect(result.statusCode).toBe(400)
    const body = parseBody(result)
    expect(body.error.code).toBe('MISSING_CODE')
  })

  it('Vet cannot validate claiming codes (Owner only)', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/claiming-codes/validate',
        resource: '/claiming-codes/validate',
        headers: vetHeaders(sharedClinicId),
        body: JSON.stringify({ claimingCode: 'CLAIM-ANYTHING' }),
      })
    )

    expect(result.statusCode).toBe(403)
  })
})


// ── 4. Care Snapshot Access and Expiry ───────────────────────────────────────

describe('[FR-13] Care snapshot access and expiry', () => {
  let snapshotPetId: string
  let snapshotAccessCode: string

  beforeAll(async () => {
    // Create and claim a pet for snapshot tests
    const profile = await petRepo.createMedicalProfile({
      name: 'SnapshotPet',
      species: 'Cat',
      breed: 'Siamese',
      age: 2,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Snapshot Owner',
      ownerEmail: 'snapshot@example.com',
      ownerPhone: '+15550000004',
    }, 'owner-snapshot')
    snapshotPetId = profile.petId
  })

  it('Owner creates a care snapshot via POST /pets/{petId}/care-snapshot', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${snapshotPetId}/care-snapshot`,
        resource: '/pets/{petId}/care-snapshot',
        headers: ownerHeaders('owner-snapshot'),
        pathParameters: { petId: snapshotPetId },
        body: JSON.stringify({
          petId: snapshotPetId,
          careInstructions: 'Feed twice daily',
          feedingSchedule: '8 AM and 6 PM',
          medications: ['Heartgard'],
          expiryHours: 48,
        }),
      })
    )

    expect(result.statusCode).toBe(201)
    const body = parseBody(result)
    expect(body.accessCode).toBeDefined()
    expect(body.accessCode).toMatch(/^CARE-/)
    expect(body.expiryDate).toBeDefined()

    snapshotAccessCode = body.accessCode
  })

  it('Public can access care snapshot with valid access code', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/care-snapshots/${snapshotAccessCode}`,
        resource: '/care-snapshots/{accessCode}',
        headers: {},
        pathParameters: { accessCode: snapshotAccessCode },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.petName).toBe('SnapshotPet')
    expect(body.careInstructions).toBe('Feed twice daily')
    expect(body.feedingSchedule).toBe('8 AM and 6 PM')
    expect(body.medications).toContain('Heartgard')
    expect(body.emergencyContacts).toBeDefined()
  })

  it('invalid access code returns 404', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: '/care-snapshots/CARE-INVALID',
        resource: '/care-snapshots/{accessCode}',
        headers: {},
        pathParameters: { accessCode: 'CARE-INVALID' },
      })
    )

    expect(result.statusCode).toBe(404)
    const body = parseBody(result)
    expect(body.error.code).toBe('SNAPSHOT_NOT_FOUND')
  })

  it('Vet cannot create care snapshots (Owner only)', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${snapshotPetId}/care-snapshot`,
        resource: '/pets/{petId}/care-snapshot',
        headers: vetHeaders(sharedClinicId),
        pathParameters: { petId: snapshotPetId },
        body: JSON.stringify({
          petId: snapshotPetId,
          careInstructions: 'Vet trying',
          feedingSchedule: 'N/A',
          medications: [],
          expiryHours: 24,
        }),
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('unauthenticated user cannot create care snapshots', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${snapshotPetId}/care-snapshot`,
        resource: '/pets/{petId}/care-snapshot',
        headers: {},
        pathParameters: { petId: snapshotPetId },
        body: JSON.stringify({
          petId: snapshotPetId,
          careInstructions: 'No auth',
          feedingSchedule: 'N/A',
          medications: [],
          expiryHours: 24,
        }),
      })
    )

    expect(result.statusCode).toBe(401)
  })
})

// ── 4b. Photo Guidance Endpoint ───────────────────────────────────────────────

describe('[FR-16] Photo guidance endpoint', () => {
  let guidancePetId: string

  beforeAll(async () => {
    const profile = await petRepo.createMedicalProfile({
      name: 'GuidancePet',
      species: 'Dog',
      breed: 'Corgi',
      age: 2,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Guidance Owner',
      ownerEmail: 'guidance@example.com',
      ownerPhone: '+15550000008',
    }, 'owner-guidance')
    guidancePetId = profile.petId
  })

  it('Owner gets photo guidelines via GET /pets/{petId}/photo-guidance', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${guidancePetId}/photo-guidance`,
        resource: '/pets/{petId}/photo-guidance',
        headers: ownerHeaders('owner-guidance'),
        pathParameters: { petId: guidancePetId },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.guidelines).toBeDefined()
    expect(body.guidelines.tips).toBeDefined()
    expect(Array.isArray(body.guidelines.tips)).toBe(true)
    expect(body.guidelines.tips.length).toBeGreaterThan(0)
    expect(body.guidelines.requirements).toBeDefined()
    expect(body.guidelines.requirements.formats).toContain('JPEG')
    expect(body.guidelines.requirements.maxSizeMB).toBeDefined()
  })

  it('Owner gets photo guidelines with quality feedback when query params provided', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${guidancePetId}/photo-guidance`,
        resource: '/pets/{petId}/photo-guidance',
        headers: ownerHeaders('owner-guidance'),
        pathParameters: { petId: guidancePetId },
        queryStringParameters: {
          mimeType: 'image/jpeg',
          fileSize: '5242880',
          width: '1920',
          height: '1080',
        },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.guidelines).toBeDefined()
    expect(body.qualityFeedback).toBeDefined()
  })

  it('Vet cannot access photo guidance (Owner only)', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${guidancePetId}/photo-guidance`,
        resource: '/pets/{petId}/photo-guidance',
        headers: vetHeaders(sharedClinicId),
        pathParameters: { petId: guidancePetId },
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('unauthenticated user cannot access photo guidance', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${guidancePetId}/photo-guidance`,
        resource: '/pets/{petId}/photo-guidance',
        headers: {},
        pathParameters: { petId: guidancePetId },
      })
    )

    expect(result.statusCode).toBe(401)
  })
})

// ── 5. 3-Click Missing Pet Flyer Generation ──────────────────────────────────

describe('[FR-08][FR-09][NFR-USA-01] 3-click missing pet flyer generation', () => {
  let missingPetId: string

  beforeAll(async () => {
    // Create and claim a pet for missing pet tests
    const profile = await petRepo.createMedicalProfile({
      name: 'MissingPet',
      species: 'Dog',
      breed: 'Beagle',
      age: 4,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Missing Owner',
      ownerEmail: 'missing@example.com',
      ownerPhone: '+15550000005',
    }, 'owner-missing')
    missingPetId = profile.petId
  })

  it('Owner reports pet as missing via POST /pets/{petId}/missing', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${missingPetId}/missing`,
        resource: '/pets/{petId}/missing',
        headers: ownerHeaders('owner-missing'),
        pathParameters: { petId: missingPetId },
        body: JSON.stringify({
          searchRadiusKm: 50,
          lastSeenLocation: 'Central Park',
          contactMethod: 'clinic',
        }),
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.petId).toBe(missingPetId)
    expect(body.isMissing).toBe(true)
    expect(body.flyerUrl).toBeDefined()
    expect(typeof body.notifiedClinics).toBe('number')
  })

  it('Owner can download the flyer via GET /pets/{petId}/flyer', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'GET',
        path: `/pets/${missingPetId}/flyer`,
        resource: '/pets/{petId}/flyer',
        headers: ownerHeaders('owner-missing'),
        pathParameters: { petId: missingPetId },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.flyerUrl).toBeDefined()
    expect(body.petId).toBe(missingPetId)
  })

  it('Owner marks pet as found via PUT /pets/{petId}/found', async () => {
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'PUT',
        path: `/pets/${missingPetId}/found`,
        resource: '/pets/{petId}/found',
        headers: ownerHeaders('owner-missing'),
        pathParameters: { petId: missingPetId },
      })
    )

    expect(result.statusCode).toBe(200)
    const body = parseBody(result)
    expect(body.isMissing).toBe(false)
  })

  it('Vet cannot report a pet as missing (Owner only)', async () => {
    // Create another pet for this test
    const profile = await petRepo.createMedicalProfile({
      name: 'VetMissingTest',
      species: 'Cat',
      breed: 'Tabby',
      age: 1,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Some Owner',
      ownerEmail: 'some@example.com',
      ownerPhone: '+15550000006',
    }, 'owner-some')

    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${profile.petId}/missing`,
        resource: '/pets/{petId}/missing',
        headers: vetHeaders(sharedClinicId),
        pathParameters: { petId: profile.petId },
        body: JSON.stringify({
          searchRadiusKm: 10,
          lastSeenLocation: 'Somewhere',
          contactMethod: 'clinic',
        }),
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('cannot report an already-missing pet as missing again', async () => {
    // Create, claim, and mark as missing
    const profile = await petRepo.createMedicalProfile({
      name: 'DoubleMissing',
      species: 'Dog',
      breed: 'Husky',
      age: 3,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    await petRepo.claimProfile(profile.petId, {
      claimingCode: profile.claimingCode,
      ownerName: 'Double Owner',
      ownerEmail: 'double@example.com',
      ownerPhone: '+15550000007',
    }, 'owner-double')

    // First report
    await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${profile.petId}/missing`,
        resource: '/pets/{petId}/missing',
        headers: ownerHeaders('owner-double'),
        pathParameters: { petId: profile.petId },
        body: JSON.stringify({
          searchRadiusKm: 10,
          lastSeenLocation: 'Park',
          contactMethod: 'clinic',
        }),
      })
    )

    // Second report should fail
    const result = await emergencyHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${profile.petId}/missing`,
        resource: '/pets/{petId}/missing',
        headers: ownerHeaders('owner-double'),
        pathParameters: { petId: profile.petId },
        body: JSON.stringify({
          searchRadiusKm: 10,
          lastSeenLocation: 'Park again',
          contactMethod: 'clinic',
        }),
      })
    )

    expect(result.statusCode).toBe(403)
  })
})

// ── 6. Clinic Handler Authorization ──────────────────────────────────────────

describe('Clinic handler authorization', () => {
  it('Vet can create a clinic via POST /clinics', async () => {
    const result = await clinicHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/clinics',
        resource: '/clinics',
        headers: vetHeaders(sharedClinicId),
        body: JSON.stringify({
          name: 'New Test Clinic',
          address: '200 Clinic St',
          city: 'Clinicville',
          state: 'CA',
          zipCode: '90001',
          phone: '+15553334444',
          email: 'new@clinic.com',
          licenseNumber: `LIC-NEW-${Date.now()}`,
          latitude: 34.05,
          longitude: -118.24,
        }),
      })
    )

    expect(result.statusCode).toBe(201)
    const body = parseBody(result)
    expect(body.clinicId).toBeDefined()
    expect(body.name).toBe('New Test Clinic')
  })

  it('Owner cannot create a clinic', async () => {
    const result = await clinicHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/clinics',
        resource: '/clinics',
        headers: ownerHeaders(),
        body: JSON.stringify({
          name: 'Owner Clinic',
          address: '300 Nope St',
          city: 'Nopeville',
          state: 'CA',
          zipCode: '90002',
          phone: '+15555556666',
          email: 'nope@clinic.com',
          licenseNumber: 'LIC-NOPE',
          latitude: 34.05,
          longitude: -118.24,
        }),
      })
    )

    expect(result.statusCode).toBe(403)
  })

  it('unauthenticated user cannot create a clinic', async () => {
    const result = await clinicHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/clinics',
        resource: '/clinics',
        headers: {},
        body: JSON.stringify({
          name: 'Anon Clinic',
          address: '400 Anon St',
          city: 'Anonville',
          state: 'CA',
          zipCode: '90003',
          phone: '+15557778888',
          email: 'anon@clinic.com',
          licenseNumber: 'LIC-ANON',
          latitude: 34.05,
          longitude: -118.24,
        }),
      })
    )

    expect(result.statusCode).toBe(401)
  })
})

// ── 7. Vet Medical Record Management ─────────────────────────────────────────

describe('[FR-06][FR-07] Vet medical record management', () => {
  let medPetId: string

  beforeAll(async () => {
    const profile = await petRepo.createMedicalProfile({
      name: 'MedRecordPet',
      species: 'Dog',
      breed: 'Dachshund',
      age: 6,
      clinicId: sharedClinicId,
      verifyingVetId: 'vet-integ-1',
    })
    medPetId = profile.petId
  })

  it('Vet adds a vaccine record via POST /pets/{petId}/vaccines', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${medPetId}/vaccines`,
        resource: '/pets/{petId}/vaccines',
        headers: vetHeaders(sharedClinicId),
        pathParameters: { petId: medPetId },
        body: JSON.stringify({
          vaccineName: 'Rabies',
          administeredDate: '2024-06-01',
          nextDueDate: '2025-06-01',
          veterinarianName: 'Dr. Integration',
        }),
      })
    )

    expect(result.statusCode).toBe(201)
    const body = parseBody(result)
    expect(body.vaccineId).toBeDefined()
    expect(body.vaccineName).toBe('Rabies')
  })

  it('Vet adds a surgery record via POST /pets/{petId}/surgeries', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: `/pets/${medPetId}/surgeries`,
        resource: '/pets/{petId}/surgeries',
        headers: vetHeaders(sharedClinicId),
        pathParameters: { petId: medPetId },
        body: JSON.stringify({
          surgeryType: 'Dental Cleaning',
          surgeryDate: '2024-05-15',
          notes: 'Routine dental cleaning',
          recoveryInfo: 'Soft food for 3 days',
          veterinarianName: 'Dr. Integration',
        }),
      })
    )

    expect(result.statusCode).toBe(201)
    const body = parseBody(result)
    expect(body.surgeryId).toBeDefined()
    expect(body.surgeryType).toBe('Dental Cleaning')
  })
})

// ── 8. Error Handling ────────────────────────────────────────────────────────

describe('Error handling across handlers', () => {
  it('unsupported HTTP method returns 405', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'PATCH',
        path: '/pets',
        resource: '/pets',
        headers: vetHeaders(sharedClinicId),
      })
    )

    expect(result.statusCode).toBe(405)
    const body = parseBody(result)
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED')
  })

  it('invalid JSON body returns error', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets',
        resource: '/pets',
        headers: vetHeaders(sharedClinicId),
        body: '{invalid json',
      })
    )

    // Should return 400 for invalid JSON
    expect(result.statusCode).toBeGreaterThanOrEqual(400)
    expect(result.statusCode).toBeLessThan(500)
  })

  it('missing body on POST returns 400', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/pets',
        resource: '/pets',
        headers: vetHeaders(sharedClinicId),
        body: null,
      })
    )

    expect(result.statusCode).toBe(400)
    const body = parseBody(result)
    expect(body.error.code).toBe('MISSING_BODY')
  })

  it('search handler rejects non-GET methods', async () => {
    const result = await searchHandler(
      makeEvent({
        httpMethod: 'POST',
        path: '/search/pets',
        resource: '/search/pets',
        headers: {},
      })
    )

    expect(result.statusCode).toBe(405)
  })

  it('all responses include CORS headers', async () => {
    const result = await petHandler(
      makeEvent({
        httpMethod: 'GET',
        path: '/pets',
        resource: '/pets',
        headers: ownerHeaders(),
      })
    )

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*')
    expect(result.headers?.['Access-Control-Allow-Methods']).toBeDefined()
  })
})
