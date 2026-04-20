/**
 * Property-based tests for ImageRepository
 * Uses fast-check with numRuns: 100 against LocalStack at localhost:4566.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { CreateBucketCommand } from '@aws-sdk/client-s3'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { ImageRepository } from '../src/repositories/image-repository'
import { AWSClientFactory } from '../src/infrastructure/aws-client-factory'

const TEST_TABLE = 'VetPetRegistry-ImageRepo-Test'
const TEST_BUCKET = 'paw-print-profile-images-test'

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Non-empty string up to 20 chars */
const petIdArb = fc.string({ minLength: 1, maxLength: 20 })

/** Small image buffer (1–100 bytes) */
const imageBufferArb = fc
  .uint8Array({ minLength: 1, maxLength: 100 })
  .map((arr) => Buffer.from(arr))

/** Valid MIME types */
const mimeTypeArb = fc.constantFrom('image/jpeg', 'image/png', 'image/webp')

/** Array of short tag strings */
const tagsArb = fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 })

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let initializer: DynamoDBTableInitializer
let repo: ImageRepository

beforeAll(async () => {
  // Create DynamoDB table
  initializer = new DynamoDBTableInitializer(TEST_TABLE)
  await initializer.initializeForTesting({ tableName: TEST_TABLE })

  // Create S3 bucket in LocalStack
  const factory = new AWSClientFactory()
  const s3Client = factory.createS3Client()
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))
  } catch (err: any) {
    // Ignore if bucket already exists
    if (err.name !== 'BucketAlreadyOwnedByYou' && err.name !== 'BucketAlreadyExists') {
      throw err
    }
  }

  repo = new ImageRepository(TEST_TABLE)
}, 60_000)

afterAll(async () => {
  try {
    await initializer.deleteTable(TEST_TABLE)
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}, 60_000)

// ── Property 10: Image storage and retrieval ──────────────────────────────────

describe('[FR-05] Property 10: Image storage and retrieval', () => {
  /**
   * For any valid image upload (petId, imageBuffer, mimeType, tags),
   * upload() stores the image and findByPet() returns it with correct metadata.
   * getUrl() returns a non-empty string URL.
   */
  it('upload() stores image and findByPet() returns it with correct metadata', async () => {
    await fc.assert(
      fc.asyncProperty(petIdArb, imageBufferArb, mimeTypeArb, tagsArb, async (petId, imageBuffer, mimeType, tags) => {
        const result = await repo.upload({ petId, imageBuffer, mimeType, tags })

        // Returned record has correct metadata
        expect(result.imageId).toBeTruthy()
        expect(result.s3Key).toBeTruthy()
        expect(result.s3Bucket).toBe(TEST_BUCKET)
        expect(result.mimeType).toBe(mimeType)
        expect(result.tags).toEqual(tags)
        expect(result.fileSize).toBe(imageBuffer.length)
        expect(result.uploadedAt).toBeTruthy()
        expect(result.PK).toBe(`PET#${petId}`)
        expect(result.SK).toBe(`IMAGE#${result.imageId}`)

        // findByPet returns the uploaded image
        const images = await repo.findByPet(petId)
        const found = images.find((img) => img.imageId === result.imageId)
        expect(found).toBeDefined()
        expect(found!.mimeType).toBe(mimeType)
        expect(found!.tags).toEqual(tags)
        expect(found!.fileSize).toBe(imageBuffer.length)
        expect(found!.s3Bucket).toBe(TEST_BUCKET)

        // getUrl returns a non-empty string URL
        const url = await repo.getUrl(result.imageId, petId)
        expect(typeof url).toBe('string')
        expect(url.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  }, 300_000)
})

// ── Property 11: Unique image URLs ────────────────────────────────────────────

describe('[FR-05] Property 11: Unique image URLs', () => {
  /**
   * For any two image uploads for the same pet, the resulting imageIds and
   * s3Keys are different (uniqueness guarantee).
   */
  it('two uploads for the same pet produce different imageIds and s3Keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        petIdArb,
        imageBufferArb,
        imageBufferArb,
        mimeTypeArb,
        tagsArb,
        async (petId, bufferA, bufferB, mimeType, tags) => {
          const [imageA, imageB] = await Promise.all([
            repo.upload({ petId, imageBuffer: bufferA, mimeType, tags }),
            repo.upload({ petId, imageBuffer: bufferB, mimeType, tags }),
          ])

          expect(imageA.imageId).not.toBe(imageB.imageId)
          expect(imageA.s3Key).not.toBe(imageB.s3Key)
        }
      ),
      { numRuns: 100 }
    )
  }, 300_000)
})
