/**
 * Unit tests for contact image attachment via pre-signed S3 upload pattern
 *
 * Tests verify:
 * - POST /pets/{petId}/contact/upload-url generates a pre-signed PUT URL
 * - POST /pets/{petId}/contact accepts imageKey and generates GET pre-signed URL
 * - Text-only messages still work (backward compatibility)
 * - Validation rejects invalid mime types, invalid imageKey prefixes
 * - Image is NOT added to pet profile (temporary attachment only)
 *
 * Validates: [FR-12], [FR-15]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'

// ── Mock S3 ──────────────────────────────────────────────────────────────────

const mockS3Send = vi.fn()
const mockGetSignedUrl = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'PutObject' })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'GetObject' })),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
}))

// ── Mock SNS ─────────────────────────────────────────────────────────────────

const mockSnsSend = vi.fn()

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(() => ({ send: mockSnsSend })),
  PublishCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'Publish' })),
  CreateTopicCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'CreateTopic' })),
  SubscribeCommand: vi.fn(),
}))

// ── Mock DynamoDB ────────────────────────────────────────────────────────────

const mockDocSend = vi.fn()

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({ send: mockDocSend }),
  },
  GetCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'Get' })),
  PutCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'Put' })),
  QueryCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'Query' })),
  DeleteCommand: vi.fn(),
}))

// ── Mock infrastructure ──────────────────────────────────────────────────────

vi.mock('../src/infrastructure/aws-client-factory', () => ({
  AWSClientFactory: vi.fn().mockImplementation(() => ({
    createDynamoDBClient: vi.fn().mockReturnValue({}),
    createS3Client: vi.fn().mockReturnValue({ send: mockS3Send }),
    createSNSClient: vi.fn().mockReturnValue({ send: mockSnsSend }),
    createCognitoClient: vi.fn().mockReturnValue({}),
  })),
}))

vi.mock('../src/infrastructure/environment-detector', () => ({
  EnvironmentDetector: {
    getInstance: vi.fn().mockReturnValue({
      isLocal: vi.fn().mockReturnValue(true),
      getServiceEndpoint: vi.fn().mockReturnValue('http://localhost:4566'),
      getRegion: vi.fn().mockReturnValue('us-east-1'),
      getConfig: vi.fn().mockReturnValue({ region: 'us-east-1' }),
    }),
  },
}))

// ── Mock Cognito ─────────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn().mockImplementation(() => ({})),
  AdminGetUserCommand: vi.fn(),
  GetUserCommand: vi.fn(),
}))

// Import handler after mocks
const { handler } = await import('../src/handlers/emergency-tools-handler')

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/pets/pet-123/contact',
    resource: '/pets/{petId}/contact',
    pathParameters: { petId: 'pet-123' },
    headers: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    multiValueHeaders: {},
    stageVariable: null,
    requestContext: {} as any,
    isBase64Encoded: false,
    body: null,
    ...overrides,
  }
}

const claimedPet = {
  PK: 'PET#pet-123',
  SK: 'METADATA',
  petId: 'pet-123',
  name: 'Buddy',
  species: 'Dog',
  breed: 'Labrador',
  age: 4,
  clinicId: 'clinic-1',
  profileStatus: 'Active',
  medicallyVerified: true,
  verifyingVetId: 'vet-1',
  verificationDate: '2024-01-01T00:00:00Z',
  ownerId: 'owner-1',
  ownerName: 'Jane',
  ownerEmail: 'jane@example.com',
  ownerPhone: '+1555000000',
  isMissing: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  GSI2PK: 'SPECIES#Dog',
  GSI2SK: 'BREED#Labrador#AGE#4',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /pets/{petId}/contact/upload-url — Pre-signed Upload URL [FR-12][FR-15]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.IS_LOCAL = 'true'
    mockGetSignedUrl.mockResolvedValue('http://localhost:4566/paw-print-profile-images/contact-images/pet-123/123456.jpg?X-Amz-Signature=abc')
  })

  it('returns a pre-signed PUT URL and imageKey for JPEG', async () => {
    const event = makeEvent({
      path: '/pets/pet-123/contact/upload-url',
      resource: '/pets/{petId}/contact/upload-url',
      body: JSON.stringify({ mimeType: 'image/jpeg' }),
    })

    const result = await handler(event)
    const body = JSON.parse(result.body)

    expect(result.statusCode).toBe(200)
    expect(body.uploadUrl).toContain('localhost')
    expect(body.imageKey).toMatch(/^contact-images\/pet-123\/\d+\.jpg$/)
  })

  it('returns .png extension for PNG images', async () => {
    const event = makeEvent({
      path: '/pets/pet-123/contact/upload-url',
      resource: '/pets/{petId}/contact/upload-url',
      body: JSON.stringify({ mimeType: 'image/png' }),
    })

    const result = await handler(event)
    const body = JSON.parse(result.body)

    expect(result.statusCode).toBe(200)
    expect(body.imageKey).toMatch(/^contact-images\/pet-123\/\d+\.png$/)
  })

  it('rejects missing mimeType', async () => {
    const event = makeEvent({
      path: '/pets/pet-123/contact/upload-url',
      resource: '/pets/{petId}/contact/upload-url',
      body: JSON.stringify({}),
    })

    const result = await handler(event)
    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body).error.message).toContain('mimeType is required')
  })

  it('rejects unsupported mime types (e.g., image/gif)', async () => {
    const event = makeEvent({
      path: '/pets/pet-123/contact/upload-url',
      resource: '/pets/{petId}/contact/upload-url',
      body: JSON.stringify({ mimeType: 'image/gif' }),
    })

    const result = await handler(event)
    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body).error.message).toContain('JPEG or PNG')
  })

  it('generates pre-signed URL with 15 minute expiry', async () => {
    const event = makeEvent({
      path: '/pets/pet-123/contact/upload-url',
      resource: '/pets/{petId}/contact/upload-url',
      body: JSON.stringify({ mimeType: 'image/jpeg' }),
    })

    await handler(event)

    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ _type: 'PutObject' }),
      { expiresIn: 900 }
    )
  })
})

describe('POST /pets/{petId}/contact — Contact with imageKey [FR-12][FR-15]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.IS_LOCAL = 'true'
    mockDocSend.mockResolvedValue({ Item: claimedPet })
    mockSnsSend.mockResolvedValue({
      TopicArn: 'arn:aws:sns:us-east-1:000000000000:paw-print-email-notifications',
      MessageId: 'msg-001',
    })
    mockGetSignedUrl.mockResolvedValue('http://localhost:4566/paw-print-profile-images/contact-images/pet-123/123456.jpg?X-Amz-Signature=xyz')
  })

  describe('Backward compatibility — text-only messages', () => {
    it('sends text-only message successfully without image', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          senderName: 'Alice',
          senderEmail: 'alice@example.com',
          message: 'I think I found your dog!',
        }),
      })

      const result = await handler(event)
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.success).toBe(true)
      // getSignedUrl should NOT be called for text-only messages
      expect(mockGetSignedUrl).not.toHaveBeenCalled()
    })
  })

  describe('imageKey-based image reference', () => {
    it('accepts imageKey and generates a 7-day GET pre-signed URL', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          senderName: 'Bob',
          senderEmail: 'bob@example.com',
          message: 'Found a dog matching your description',
          imageKey: 'contact-images/pet-123/1700000000.jpg',
        }),
      })

      const result = await handler(event)
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.success).toBe(true)

      // Should generate a GET pre-signed URL with 7-day expiry
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ _type: 'GetObject', Key: 'contact-images/pet-123/1700000000.jpg' }),
        { expiresIn: 7 * 24 * 60 * 60 }
      )
    })

    it('rejects imageKey that does not match the petId prefix', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          senderName: 'Eve',
          senderEmail: 'eve@example.com',
          message: 'Spoofed image key',
          imageKey: 'contact-images/pet-999/1700000000.jpg',
        }),
      })

      const result = await handler(event)
      expect(result.statusCode).toBe(400)
      expect(JSON.parse(result.body).error.message).toContain('must belong to this pet')
    })

    it('rejects imageKey with path traversal attempt', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          senderName: 'Mallory',
          senderEmail: 'mallory@example.com',
          message: 'Path traversal',
          imageKey: 'pets/pet-123/private-image.jpg',
        }),
      })

      const result = await handler(event)
      expect(result.statusCode).toBe(400)
      expect(JSON.parse(result.body).error.message).toContain('must belong to this pet')
    })
  })

  describe('Image is NOT added to pet profile', () => {
    it('does not write to DynamoDB IMAGE# record for contact images', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          senderName: 'Jake',
          senderEmail: 'jake@example.com',
          message: 'Photo attached',
          imageKey: 'contact-images/pet-123/1700000000.jpg',
        }),
      })

      await handler(event)

      for (const call of mockDocSend.mock.calls) {
        const item = call[0]?.Item
        if (item && item.SK) {
          expect(item.SK).not.toMatch(/^IMAGE#/)
        }
      }
    })
  })

  describe('Required field validation', () => {
    it('still validates required text fields', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          senderName: '',
          senderEmail: 'test@test.com',
          message: 'Hi',
          imageKey: 'contact-images/pet-123/1700000000.jpg',
        }),
      })

      const result = await handler(event)
      expect(result.statusCode).toBe(400)
    })
  })
})
