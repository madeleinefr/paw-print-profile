/**
 * Seed Images Script for Local Development
 *
 * Uploads pet photos from the seed-images/ directory to LocalStack S3
 * and creates corresponding DynamoDB metadata records.
 *
 * Must be run AFTER seed-data.ts (pets must exist in DynamoDB).
 *
 * Usage (inside Docker):
 *   docker compose exec backend npx tsx src/infrastructure/seed-images.ts
 *
 * Usage (outside Docker, with .env):
 *   npx tsx --env-file=.env src/infrastructure/seed-images.ts
 */

import { readFileSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ImageRepository } from '../repositories/image-repository'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { AWSClientFactory } from './aws-client-factory'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface PetRecord {
  petId: string
  name: string
}

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'VetPetRegistry'

/** Map of image filenames (lowercase, without extension) to descriptive tags */
const IMAGE_TAGS: Record<string, string[]> = {
  balu: ['golden', 'friendly', 'large'],
  luna: ['siamese', 'blue-eyes', 'cream'],
  rex: ['german-shepherd', 'black-tan', 'large'],
  minka: ['tabby', 'domestic-shorthair', 'grey'],
  olive: ['ridgeback', 'brown', 'muscular'],
  nala: ['persian', 'fluffy', 'white'],
  askari: ['australian-shepherd', 'white-brown', 'blue-eyes'],
  lotte: ['dachshund', 'brown', 'small'],
  susi: ['setter-mix', 'black-white', 'medium'],
  timmi: ['domestic-shorthair', 'tabby', 'green-eyes'],
}

async function seedImages() {
  console.log('🖼️  Seeding pet images...\n')

  const imageRepo = new ImageRepository(TABLE_NAME)

  // Scan for all pet records (dev-only, small dataset)
  const factory = new AWSClientFactory()
  const docClient = DynamoDBDocumentClient.from(factory.createDynamoDBClient())
  const scanResult = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': 'PET#',
      ':sk': 'METADATA',
    },
    ProjectionExpression: 'petId, #n',
    ExpressionAttributeNames: { '#n': 'name' },
  }))

  const allPets = (scanResult.Items || []) as PetRecord[]

  // Resolve the seed-images directory
  const possiblePaths = [
    resolve('/seed-images'),                     // Docker mount
    resolve(__dirname, '../../../seed-images'),   // From dist/
    resolve(process.cwd(), '../seed-images'),     // From backend/
    resolve(process.cwd(), 'seed-images'),        // From project root
  ]

  let seedImagesDir: string | null = null
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      seedImagesDir = p
      break
    }
  }

  if (!seedImagesDir) {
    console.error('❌ Could not find seed-images/ directory.')
    console.error('   Searched:', possiblePaths.join(', '))
    process.exit(1)
  }

  console.log(`  Using images from: ${seedImagesDir}\n`)
  if (allPets.length === 0) {
    console.error('❌ No pets found in DynamoDB. Run seed-data.ts first.')
    process.exit(1)
  }

  console.log(`  Found ${allPets.length} pets in database.\n`)

  let uploaded = 0
  let skipped = 0

  for (const pet of allPets) {
    const petNameLower = pet.name.toLowerCase()
    const possibleFiles = [
      join(seedImagesDir, `${petNameLower}.jpg`),
      join(seedImagesDir, `${petNameLower}.jpeg`),
      join(seedImagesDir, `${petNameLower}.png`),
      join(seedImagesDir, `${pet.name}.jpg`),   // Original case (e.g., "Balu.jpg")
      join(seedImagesDir, `${pet.name}.jpeg`),
      join(seedImagesDir, `${pet.name}.png`),
    ]

    const imageFile = possibleFiles.find((f) => existsSync(f))
    if (!imageFile) {
      console.log(`  ⚠ No image found for ${pet.name} — skipping`)
      skipped++
      continue
    }

    // Check if pet already has images
    const existingImages = await imageRepo.findByPet(pet.petId)
    if (existingImages.length > 0) {
      console.log(`  ⚠ ${pet.name} already has ${existingImages.length} image(s) — skipping`)
      skipped++
      continue
    }

    // Read and upload
    const imageBuffer = readFileSync(imageFile)
    const mimeType = imageFile.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const tags = IMAGE_TAGS[petNameLower] || []

    await imageRepo.upload({
      petId: pet.petId,
      imageBuffer: Buffer.from(imageBuffer),
      mimeType,
      tags,
    })

    uploaded++
    console.log(`  ✓ ${pet.name}: uploaded (${(imageBuffer.length / 1024).toFixed(0)} KB, tags: ${tags.join(', ')})`)
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`✅ Image seeding complete: ${uploaded} uploaded, ${skipped} skipped`)
  console.log('═'.repeat(60))
}

seedImages().catch((err) => {
  console.error('❌ Image seeding failed:', err)
  process.exit(1)
})
