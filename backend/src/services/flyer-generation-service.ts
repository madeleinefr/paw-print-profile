/**
 * FlyerGenerationService - Generates letter-size missing pet flyer PDFs
 *
 * Responsibilities:
 * - Generate letter-size (8.5" x 11") PDF flyers with pet information
 * - Include pet photo, name, species, breed, age, distinctive features (tags)
 * - Include selected owner contact information or clinic details
 * - Respect owner privacy preferences (hide contact unless explicitly allowed)
 * - Upload generated PDF to S3 for download access
 *
 * Requirements: [FR-09], [FR-15], [NFR-USA-01]
 */

import PDFDocument from 'pdfkit'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Pet, Clinic, PetImage } from '../models/entities'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'

/** Helper to collect a readable stream into a Buffer */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

const FLYER_BUCKET = process.env.PET_IMAGES_BUCKET ?? 'paw-print-profile-images'
const SIGNED_URL_EXPIRES_IN = 3600 // 1 hour

/**
 * Contact method the owner selects when reporting a pet as missing.
 * - 'phone': owner's phone number displayed on flyer
 * - 'email': owner's email displayed on flyer
 * - 'clinic': veterinary clinic's contact info displayed on flyer
 */
export type ContactMethod = 'phone' | 'email' | 'clinic'

/**
 * Input for flyer generation
 */
export interface FlyerGenerationInput {
  lastSeenLocation: string
  additionalNotes?: string
  contactMethod: ContactMethod
}

/**
 * Result of flyer generation
 */
export interface FlyerGenerationResult {
  flyerUrl: string
  s3Key: string
  generatedAt: string
}

export class FlyerGenerationService {
  private s3Client: S3Client

  constructor() {
    const factory = new AWSClientFactory()
    this.s3Client = factory.createS3Client()
  }

  /**
   * Generate a missing pet flyer PDF and upload to S3.
   *
   * Creates a letter-size PDF containing:
   * - Bold "MISSING PET" header
   * - Pet name, species, breed, age
   * - Distinctive features from image tags
   * - Last seen location and notes
   * - Contact information based on owner's selected method
   * - Clinic information
   *
   * Privacy: Owner contact is only shown if explicitly selected via contactMethod.
   * If contactMethod is 'clinic', only clinic details are shown.
   *
   * Requirements: [FR-09], [FR-15], [NFR-USA-01]
   */
  async generateFlyer(
    pet: Pet,
    clinic: Clinic | null,
    images: PetImage[],
    input: FlyerGenerationInput
  ): Promise<FlyerGenerationResult> {
    // Fetch the first available pet image from S3 for embedding
    const petImageBuffer = await this.fetchPetImage(images)

    const pdfBuffer = await this.buildFlyerPdf(pet, clinic, images, input, petImageBuffer)

    // Upload PDF to S3
    const generatedAt = new Date().toISOString()
    const timestamp = Date.now()
    const s3Key = `flyers/${pet.petId}/${timestamp}.pdf`

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: FLYER_BUCKET,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        Metadata: {
          petId: pet.petId,
          generatedAt,
        },
      })
    )

    // Generate a signed URL for download
    const command = new GetObjectCommand({
      Bucket: FLYER_BUCKET,
      Key: s3Key,
    })
    const flyerUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: SIGNED_URL_EXPIRES_IN,
    })

    return { flyerUrl, s3Key, generatedAt }
  }

  /**
   * Build the PDF buffer for a missing pet flyer.
   * Letter size: 612 x 792 points (8.5" x 11" at 72 DPI)
   */
  buildFlyerPdf(
    pet: Pet,
    clinic: Clinic | null,
    images: PetImage[],
    input: FlyerGenerationInput,
    petImageBuffer?: Buffer | null
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'LETTER', // 8.5" x 11"
          margins: { top: 36, bottom: 36, left: 36, right: 36 },
        })

        const chunks: Buffer[] = []
        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        // --- Header ---
        doc
          .fontSize(36)
          .font('Helvetica-Bold')
          .fillColor('#CC0000')
          .text('MISSING PET', { align: 'center' })
        doc.moveDown(0.5)

        // --- Pet Name ---
        doc
          .fontSize(28)
          .fillColor('#000000')
          .text(pet.name, { align: 'center' })
        doc.moveDown(0.5)

        // --- Pet Photo (embedded from S3) ---
        if (petImageBuffer && petImageBuffer.length > 0) {
          try {
            const pageWidth = 612 - 36 - 36 // letter width minus margins
            const maxImageWidth = Math.min(pageWidth, 300)
            const maxImageHeight = 250
            doc.image(petImageBuffer, {
              fit: [maxImageWidth, maxImageHeight],
              align: 'center',
            })
            doc.moveDown(1)
          } catch {
            // If image embedding fails (corrupt data, unsupported format), skip silently
          }
        }

        // --- Pet Description ---
        doc.fontSize(14).font('Helvetica')
        const description = this.buildPetDescription(pet)
        doc.text(description, { align: 'center' })
        doc.moveDown(1)

        // --- Distinctive Features (tags from images) ---
        const allTags = images.flatMap((img) => img.tags || [])
        const uniqueTags = [...new Set(allTags)]
        if (uniqueTags.length > 0) {
          doc
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('Distinctive Features:', { align: 'left' })
          doc
            .font('Helvetica')
            .text(uniqueTags.join(', '), { align: 'left' })
          doc.moveDown(0.5)
        }

        // --- Last Seen ---
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Last Seen:', { align: 'left' })
        doc.font('Helvetica').text(input.lastSeenLocation, { align: 'left' })
        if (input.additionalNotes) {
          doc.text(input.additionalNotes, { align: 'left' })
        }
        doc.moveDown(1)

        // --- Contact Information ---
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('CONTACT INFORMATION', { align: 'center' })
        doc.moveDown(0.3)

        const contactInfo = this.resolveContactInfo(pet, clinic, input.contactMethod)
        doc.fontSize(14).font('Helvetica').text(contactInfo, { align: 'center' })
        doc.moveDown(1)

        // --- Clinic Information (always shown for identification) ---
        if (clinic) {
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('Veterinary Clinic:', { align: 'left' })
          doc
            .font('Helvetica')
            .text(`${clinic.name}`, { align: 'left' })
            .text(`${clinic.address}, ${clinic.city}, ${clinic.state} ${clinic.zipCode}`, {
              align: 'left',
            })
            .text(`Phone: ${clinic.phone}`, { align: 'left' })
        }

        doc.moveDown(1)

        // --- Footer ---
        doc
          .fontSize(10)
          .font('Helvetica-Oblique')
          .fillColor('#666666')
          .text('Generated by Paw Print Profile', { align: 'center' })

        doc.end()
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Fetch the first available pet image from S3 as a Buffer.
   * Returns null if no images exist or if the fetch fails.
   */
  async fetchPetImage(images: PetImage[]): Promise<Buffer | null> {
    if (!images || images.length === 0) {
      return null
    }

    // Try each image until one succeeds (first image is preferred)
    for (const image of images) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: image.s3Bucket,
            Key: image.s3Key,
          })
        )
        if (response.Body) {
          return await streamToBuffer(response.Body as NodeJS.ReadableStream)
        }
      } catch {
        // Image not found or S3 error — try next image
        continue
      }
    }

    return null
  }

  /**
   * Build a human-readable pet description string.
   * Includes species, breed, and age.
   */
  buildPetDescription(pet: Pet): string {
    const parts: string[] = []
    if (pet.species) parts.push(pet.species)
    if (pet.breed) parts.push(pet.breed)
    if (pet.age !== undefined && pet.age !== null) {
      parts.push(`${pet.age} year${pet.age === 1 ? '' : 's'} old`)
    }
    return parts.join(' • ')
  }

  /**
   * Resolve the contact information to display on the flyer based on
   * the owner's selected contact method.
   *
   * Privacy protection: Owner contact info is only shown when the owner
   * explicitly selects 'phone' or 'email' as their contact method.
   * If 'clinic' is selected, only clinic details are shown.
   * If no valid contact info is available, falls back to platform messaging.
   *
   * Requirements: [FR-08] AC2, [FR-15]
   */
  resolveContactInfo(pet: Pet, clinic: Clinic | null, contactMethod: ContactMethod): string {
    switch (contactMethod) {
      case 'phone':
        return pet.ownerPhone
          ? `Phone: ${pet.ownerPhone}`
          : 'Contact via Paw Print Profile platform'
      case 'email':
        return pet.ownerEmail
          ? `Email: ${pet.ownerEmail}`
          : 'Contact via Paw Print Profile platform'
      case 'clinic':
        if (clinic) {
          return `Contact: ${clinic.name}\nPhone: ${clinic.phone}`
        }
        return 'Contact via Paw Print Profile platform'
      default:
        return 'Contact via Paw Print Profile platform'
    }
  }
}
