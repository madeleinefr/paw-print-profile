/**
 * EmergencyToolsService - Business logic for missing pet workflow and emergency tools
 *
 * Handles:
 * - Missing pet reporting with 3-click flyer generation from dashboard
 * - Letter-size PDF flyer generation with pet photo, description, and contact info
 * - Pet recovery (mark as found) with clinic notifications
 * - Care snapshot generation for temporary caregivers
 * - Owner contact method selection (phone, email, or clinic contact)
 *
 * Requirements: [FR-08], [FR-09], [FR-10], [FR-13], [NFR-USA-01]
 */

import PDFDocument from 'pdfkit'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { ImageRepository } from '../repositories/image-repository'
import { CareSnapshotService } from './care-snapshot-service'
import {
  Pet,
  Clinic,
  PetImage,
  CreateCareSnapshotInput,
  CareSnapshotResponse,
} from '../models/entities'
import { ValidationException } from '../validation/validators'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'

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
 * Input for reporting a pet as missing
 */
export interface ReportMissingInput {
  searchRadiusKm: number
  lastSeenLocation: string
  additionalNotes?: string
  contactMethod: ContactMethod
}

/**
 * Result of reporting a pet as missing
 */
export interface ReportMissingResult {
  petId: string
  isMissing: boolean
  flyerUrl: string
  notifiedClinics: number
  searchRadiusKm: number
  lastSeenLocation: string
}

/**
 * Result of marking a pet as found
 */
export interface MarkAsFoundResult {
  petId: string
  isMissing: boolean
  notifiedClinics: number
}


export class EmergencyToolsService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private imageRepo: ImageRepository
  private careSnapshotService: CareSnapshotService
  private s3Client: S3Client

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.imageRepo = new ImageRepository(tableName)
    this.careSnapshotService = new CareSnapshotService(tableName)
    const factory = new AWSClientFactory()
    this.s3Client = factory.createS3Client()
  }

  /**
   * Report a pet as missing with 3-click flyer generation from dashboard.
   *
   * Flow (3 clicks):
   * 1. Owner clicks "Report Missing" on pet card
   * 2. Owner fills in location/contact method and confirms
   * 3. System generates flyer, marks pet missing, notifies clinics
   *
   * Requirements: [FR-08], [FR-09], [NFR-USA-01]
   */
  async reportMissing(petId: string, ownerId: string, input: ReportMissingInput): Promise<ReportMissingResult> {
    // Validate input
    if (!input.searchRadiusKm || input.searchRadiusKm <= 0) {
      throw new ValidationException([
        { field: 'searchRadiusKm', message: 'Search radius must be greater than 0' },
      ])
    }
    if (!input.lastSeenLocation || input.lastSeenLocation.trim().length === 0) {
      throw new ValidationException([
        { field: 'lastSeenLocation', message: 'Last seen location is required' },
      ])
    }
    if (!input.contactMethod || !['phone', 'email', 'clinic'].includes(input.contactMethod)) {
      throw new ValidationException([
        { field: 'contactMethod', message: 'Contact method must be phone, email, or clinic' },
      ])
    }

    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only report your own pets as missing' },
      ])
    }
    if (pet.isMissing) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet is already reported as missing' },
      ])
    }

    // Mark pet as missing
    await this.petRepo.setMissingStatus(petId, true)

    // Get clinic info for flyer and notifications
    const clinic = await this.clinicRepo.findById(pet.clinicId)

    // Get pet images for flyer
    const images = await this.imageRepo.findByPet(petId)

    // Generate the missing pet flyer PDF
    const flyerUrl = await this.generateMissingPetFlyer(pet, clinic, images, input)

    // Notify nearby clinics
    let notifiedClinics = 0
    if (clinic && clinic.latitude && clinic.longitude) {
      const nearbyClinics = await this.clinicRepo.findNearby(
        clinic.latitude,
        clinic.longitude,
        input.searchRadiusKm
      )
      notifiedClinics = nearbyClinics.length
      // In production, this would trigger SNS/SES notifications to each clinic
    }

    return {
      petId,
      isMissing: true,
      flyerUrl,
      notifiedClinics,
      searchRadiusKm: input.searchRadiusKm,
      lastSeenLocation: input.lastSeenLocation,
    }
  }

  /**
   * Generate a letter-size (8.5" x 11") missing pet flyer as PDF.
   *
   * Includes:
   * - Pet photo (first available image)
   * - Pet description (name, species, breed, age, distinctive features/tags)
   * - Owner contact information based on selected contact method
   * - Clinic information
   * - Last seen location and additional notes
   *
   * Requirements: [FR-09], [FR-15], [NFR-USA-01]
   */
  async generateMissingPetFlyer(
    pet: Pet,
    clinic: Clinic | null,
    images: PetImage[],
    input: ReportMissingInput
  ): Promise<string> {
    const pdfBuffer = await this.buildFlyerPdf(pet, clinic, images, input)

    // Upload PDF to S3
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
          generatedAt: new Date().toISOString(),
        },
      })
    )

    // Generate a signed URL for download
    const command = new GetObjectCommand({
      Bucket: FLYER_BUCKET,
      Key: s3Key,
    })
    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: SIGNED_URL_EXPIRES_IN,
    })

    return signedUrl
  }

  /**
   * Mark a pet as found, update status, and notify previously alerted clinics.
   *
   * Requirements: [FR-10]
   */
  async markAsFound(petId: string, ownerId: string): Promise<MarkAsFoundResult> {
    // Verify pet exists and is owned by the user
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      throw new ValidationException([{ field: 'petId', message: 'Pet not found' }])
    }
    if (pet.profileStatus !== 'Active' || pet.ownerId !== ownerId) {
      throw new ValidationException([
        { field: 'petId', message: 'You can only mark your own pets as found' },
      ])
    }
    if (!pet.isMissing) {
      throw new ValidationException([
        { field: 'petId', message: 'Pet is not currently reported as missing' },
      ])
    }

    // Update pet status
    await this.petRepo.setMissingStatus(petId, false)

    // Notify previously alerted clinics that the pet has been found
    let notifiedClinics = 0
    const clinic = await this.clinicRepo.findById(pet.clinicId)
    if (clinic && clinic.latitude && clinic.longitude) {
      // Use same radius as original report (default 50km if not stored)
      const nearbyClinics = await this.clinicRepo.findNearby(
        clinic.latitude,
        clinic.longitude,
        50 // Default radius for found notifications
      )
      notifiedClinics = nearbyClinics.length
      // In production, this would trigger SNS/SES notifications to each clinic
    }

    return {
      petId,
      isMissing: false,
      notifiedClinics,
    }
  }

  /**
   * Generate a care snapshot for temporary caregivers.
   * Delegates to CareSnapshotService.
   *
   * Requirements: [FR-13]
   */
  async generateCareSnapshot(input: CreateCareSnapshotInput, ownerId: string): Promise<CareSnapshotResponse> {
    return this.careSnapshotService.generateCareSnapshot(input, ownerId)
  }

  /**
   * Build the PDF buffer for a missing pet flyer.
   * Letter size: 612 x 792 points (8.5" x 11" at 72 DPI)
   */
  private buildFlyerPdf(
    pet: Pet,
    clinic: Clinic | null,
    images: PetImage[],
    input: ReportMissingInput
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

        // --- Clinic Information ---
        if (clinic) {
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('Veterinary Clinic:', { align: 'left' })
          doc
            .font('Helvetica')
            .text(`${clinic.name}`, { align: 'left' })
            .text(`${clinic.address}, ${clinic.city}, ${clinic.state} ${clinic.zipCode}`, { align: 'left' })
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
   * Build a human-readable pet description string.
   */
  private buildPetDescription(pet: Pet): string {
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
   * Requirements: [FR-08] AC2, [FR-15]
   */
  private resolveContactInfo(pet: Pet, clinic: Clinic | null, contactMethod: ContactMethod): string {
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
