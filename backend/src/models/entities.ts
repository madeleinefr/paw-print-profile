/**
 * DynamoDB Entity Interfaces for Paw Print Profile
 * 
 * This file defines TypeScript interfaces for all entities in the single-table design.
 * The system uses DynamoDB with partition key (PK) and sort key (SK) for the main table,
 * plus five Global Secondary Indexes (GSI1-GSI5) for different access patterns.
 */

/**
 * Base interface for all DynamoDB entities
 */
export interface DynamoDBEntity {
  PK: string
  SK: string
}

/**
 * Pet entity stored in DynamoDB with co-onboarding support
 * 
 * Access patterns:
 * - Get pet by ID: PK = "PET#{petId}", SK = "METADATA"
 * - Search by species/breed: GSI2PK = "SPECIES#{species}", GSI2SK = "BREED#{breed}#AGE#{age}"
 * - Get pets by owner: GSI3PK = "OWNER#{ownerId}", GSI3SK = "PET#{petId}" (only when claimed)
 * - Find by claiming code: GSI4PK = "CLAIM#{claimingCode}", GSI4SK = "PET#{petId}" (only when pending)
 * - Get pets by clinic: GSI6PK = "CLINIC#{clinicId}", GSI6SK = "PET#{petId}" (always present)
 */
export interface Pet extends DynamoDBEntity {
  PK: string                    // "PET#{petId}"
  SK: string                    // "METADATA"
  petId: string
  name: string
  species: string
  breed: string
  age: number
  clinicId: string
  
  // Co-onboarding fields
  profileStatus: 'Pending Claim' | 'Active' | 'Inactive'
  claimingCode?: string         // Only present when status is 'Pending Claim'
  claimingCodeExpiry?: string   // Expiry date for claiming code
  medicallyVerified: boolean    // True when created by veterinarian
  
  // Owner information (populated after claiming)
  ownerId?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  ownerStreet?: string
  ownerHouseNumber?: string
  ownerZipCode?: string
  ownerCity?: string
  
  // Medical verification metadata
  verifyingVetId: string
  verificationDate: string
  
  createdAt: string
  updatedAt: string
  isMissing: boolean
  customFields?: Record<string, any>
  
  // GSI2 attributes for species/breed search
  GSI2PK: string               // "SPECIES#{species}"
  GSI2SK: string               // "BREED#{breed}#AGE#{age}"
  
  // GSI3 attributes for owner lookup (only when claimed)
  GSI3PK?: string              // "OWNER#{ownerId}" (only when claimed)
  GSI3SK?: string              // "PET#{petId}" (only when claimed)
  
  // GSI4 attributes for claiming code lookup (only when pending)
  GSI4PK?: string              // "CLAIM#{claimingCode}" (only when pending)
  GSI4SK?: string              // "PET#{petId}" (only when pending)
  
  // GSI6 attributes for clinic-pet lookup (always present)
  GSI6PK?: string              // "CLINIC#{clinicId}"
  GSI6SK?: string              // "PET#{petId}"
}

/**
 * Vaccine record associated with a pet
 * 
 * Access pattern:
 * - Get all vaccines for a pet: PK = "PET#{petId}", SK begins with "VACCINE#"
 */
export interface VaccineRecord extends DynamoDBEntity {
  PK: string                    // "PET#{petId}"
  SK: string                    // "VACCINE#{vaccineId}"
  vaccineId: string
  vaccineName: string
  administeredDate: string
  nextDueDate: string
  veterinarianName: string
  createdAt: string
}

/**
 * Surgery record associated with a pet
 * 
 * Access pattern:
 * - Get all surgeries for a pet: PK = "PET#{petId}", SK begins with "SURGERY#"
 */
export interface SurgeryRecord extends DynamoDBEntity {
  PK: string                    // "PET#{petId}"
  SK: string                    // "SURGERY#{surgeryId}"
  surgeryId: string
  surgeryType: string
  surgeryDate: string
  notes: string
  recoveryInfo: string
  veterinarianName: string
  createdAt: string
}

/**
 * Clinic entity stored in DynamoDB
 * 
 * Access patterns:
 * - Get clinic by ID: PK = "CLINIC#{clinicId}", SK = "METADATA"
 * - Get clinic by license number: GSI1PK = "LICENSE#{licenseNumber}", GSI1SK = "CLINIC#{clinicId}"
 */
export interface Clinic extends DynamoDBEntity {
  PK: string                    // "CLINIC#{clinicId}"
  SK: string                    // "METADATA"
  clinicId: string
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  phone: string
  email: string
  licenseNumber: string
  latitude: number
  longitude: number
  customFields: CustomFieldDefinition[]
  createdAt: string
  updatedAt: string
  
  // GSI1 attributes for license number lookup
  GSI1PK: string               // "LICENSE#{licenseNumber}"
  GSI1SK: string               // "CLINIC#{clinicId}"
}

/**
 * Custom field definition for clinic-specific data fields
 */
export interface CustomFieldDefinition {
  fieldName: string
  fieldType: 'text' | 'number' | 'date' | 'boolean'
  required: boolean
  defaultValue?: any
}

/**
 * Pet image record stored in DynamoDB with S3 reference
 * 
 * Access pattern:
 * - Get all images for a pet: PK = "PET#{petId}", SK begins with "IMAGE#"
 */
export interface PetImage extends DynamoDBEntity {
  PK: string                    // "PET#{petId}"
  SK: string                    // "IMAGE#{imageId}"
  imageId: string
  s3Key: string
  s3Bucket: string
  url: string
  tags: string[]               // e.g., ["brown", "white-paws", "scar-left-ear"]
  uploadedAt: string
  fileSize: number
  mimeType: string
}

/**
 * Care snapshot record for temporary caregiver access
 * 
 * Access patterns:
 * - Get snapshot by ID: PK = "SNAPSHOT#{snapshotId}", SK = "METADATA"
 * - Find by access code: GSI5PK = "ACCESS#{accessCode}", GSI5SK = "SNAPSHOT#{snapshotId}"
 */
export interface CareSnapshot extends DynamoDBEntity {
  PK: string                    // "SNAPSHOT#{snapshotId}"
  SK: string                    // "METADATA"
  snapshotId: string
  petId: string
  petName: string
  careInstructions: string
  feedingSchedule: string
  medications: string[]
  emergencyContacts: {
    ownerPhone: string
    ownerEmail: string
    vetClinicName: string
    vetClinicPhone: string
  }
  accessCode: string
  expiryDate: string
  createdAt: string
  accessedAt?: string
  
  // GSI5 attributes for access code lookup
  GSI5PK: string               // "ACCESS#{accessCode}"
  GSI5SK: string               // "SNAPSHOT#{snapshotId}"
}

/**
 * Input type for creating a medical pet profile (veterinarian)
 */
export interface CreateMedicalProfileInput {
  /** Pet's display name */
  name: string
  /** Species (e.g., "Dog", "Cat", "Bird") */
  species: string
  /** Breed within the species (e.g., "Golden Retriever") */
  breed: string
  /** Age in years. Must be >= 0 */
  age: number
  /** The clinic creating this profile */
  clinicId: string
  /** The veterinarian verifying the medical data */
  verifyingVetId: string
  /** Clinic-specific custom data fields */
  customFields?: Record<string, any>
}

/**
 * Input type for creating a new pet
 */
export interface CreatePetInput {
  name: string
  species: string
  breed: string
  age: number
  clinicId: string
  ownerId: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  customFields?: Record<string, any>
}

/**
 * Input type for claiming a pet profile (pet owner)
 */
export interface ClaimProfileInput {
  /** The claiming code provided by the veterinary clinic (e.g., "CLAIM-ABC123") */
  claimingCode: string
  /** Owner's full name */
  ownerName: string
  /** Owner's email address (used for notifications) */
  ownerEmail: string
  /** Owner's phone number */
  ownerPhone: string
}

/**
 * Input type for enriching a claimed pet profile (pet owner).
 * All fields are optional — only provided fields are updated.
 */
export interface EnrichProfileInput {
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  /** Street name portion of owner's address */
  ownerStreet?: string
  /** House/building number */
  ownerHouseNumber?: string
  /** German postal code (PLZ, 5 digits) */
  ownerZipCode?: string
  /** City name */
  ownerCity?: string
  /** Clinic-specific custom data fields */
  customFields?: Record<string, any>
}

/**
 * Input type for creating a care snapshot
 */
export interface CreateCareSnapshotInput {
  /** The pet to create the snapshot for */
  petId: string
  /** Free-form care instructions for the caregiver */
  careInstructions: string
  /** Feeding schedule details (times, amounts, dietary restrictions) */
  feedingSchedule: string
  /** List of medications the pet is currently taking */
  medications: string[]
  /** Number of hours until the snapshot access code expires. Must be > 0 */
  expiryHours: number
}

/**
 * Input type for updating a pet
 */
export interface UpdatePetInput {
  name?: string
  age?: number
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  ownerStreet?: string
  ownerHouseNumber?: string
  ownerZipCode?: string
  ownerCity?: string
  customFields?: Record<string, any>
}

/**
 * Input type for creating a vaccine record
 */
export interface CreateVaccineInput {
  /** Name of the vaccine administered */
  vaccineName: string
  /** Date the vaccine was given (ISO 8601 date string, YYYY-MM-DD) */
  administeredDate: string
  /** Date the next dose is due (ISO 8601 date string, YYYY-MM-DD) */
  nextDueDate: string
  /** Name of the veterinarian who administered the vaccine */
  veterinarianName: string
}

/**
 * Input type for creating a surgery record
 */
export interface CreateSurgeryInput {
  /** Type of surgery performed (e.g., "Spay", "Dental Cleaning") */
  surgeryType: string
  /** Date the surgery was performed (ISO 8601 date string, YYYY-MM-DD) */
  surgeryDate: string
  /** Veterinarian notes about the procedure */
  notes: string
  /** Post-surgery recovery instructions */
  recoveryInfo: string
  /** Name of the veterinarian who performed the surgery */
  veterinarianName: string
}

/**
 * Input type for creating a clinic
 */
export interface CreateClinicInput {
  /** Clinic display name */
  name: string
  /** Street address */
  address: string
  /** City */
  city: string
  /** State/region (e.g., "Bayern", "Berlin") */
  state: string
  /** German postal code (PLZ, 5 digits) */
  zipCode: string
  /** Clinic phone number */
  phone: string
  /** Clinic email address */
  email: string
  /** Unique veterinary license number (used for GSI1 lookup) */
  licenseNumber: string
  /** GPS latitude for location-based searches */
  latitude: number
  /** GPS longitude for location-based searches */
  longitude: number
  /** Clinic-defined custom data field definitions */
  customFields?: CustomFieldDefinition[]
}

/**
 * Input type for updating a clinic
 */
export interface UpdateClinicInput {
  name?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  phone?: string
  email?: string
  latitude?: number
  longitude?: number
  customFields?: CustomFieldDefinition[]
}

/**
 * Input type for uploading a pet image
 */
export interface UploadImageInput {
  /** The pet this image belongs to */
  petId: string
  /** Raw image binary data */
  imageBuffer: Buffer
  /** MIME type (must be "image/jpeg" or "image/png") */
  mimeType: string
  /** Distinctive feature tags (e.g., ["brown", "white-paws", "scar-left-ear"]) */
  tags: string[]
}

/**
 * Metadata for image uploads
 */
export interface ImageMetadata {
  mimeType: string
  tags: string[]
  fileSize: number
}

/**
 * Search criteria for finding lost pets
 */
export interface SearchCriteria {
  /** Filter by species (e.g., "Dog", "Cat"). Case-sensitive, title-case expected */
  species?: string
  /** Filter by breed. Case-insensitive partial match */
  breed?: string
  /** Minimum age (inclusive). Must be >= 0 */
  ageMin?: number
  /** Maximum age (inclusive). Must be >= ageMin */
  ageMax?: number
  /** Filter by distinctive feature tags (e.g., ["brown", "white-paws"]) */
  tags?: string[]
  /** Geographic search center and radius */
  location?: {
    latitude: number
    longitude: number
    /** Search radius in kilometers. Must be > 0 */
    radiusKm: number
  }
}

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  /** Current page number (1-based) */
  page: number
  /** Maximum items per page */
  limit: number
  /** DynamoDB ExclusiveStartKey for cursor-based pagination (opaque to client) */
  lastEvaluatedKey?: Record<string, any>
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    page: number
    limit: number
    total?: number
    hasNext: boolean
    lastEvaluatedKey?: Record<string, any>
  }
}

/**
 * Missing pet information for flyer generation
 */
export interface MissingPetInfo {
  searchRadiusKm: number
  lastSeenLocation: string
  additionalNotes?: string
}

/**
 * Complete pet record with all associated data
 */
export interface CompletePetRecord {
  pet: Pet
  vaccines: VaccineRecord[]
  surgeries: SurgeryRecord[]
  images: PetImage[]
}

/**
 * Response type for medical profile creation
 */
export interface MedicalProfileResponse {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  clinicId: string
  profileStatus: ProfileStatus
  claimingCode: string
  claimingCodeExpiry: string
  medicallyVerified: boolean
  verifyingVetId: string
  createdAt: string
}

/**
 * Response type for profile claiming
 */
export interface ClaimProfileResponse {
  petId: string
  name: string
  profileStatus: ProfileStatus
  ownerId: string
  ownerName: string
  claimedAt: string
}

/**
 * Response type for care snapshot creation
 */
export interface CareSnapshotResponse {
  snapshotId: string
  petName: string
  accessCode: string
  accessUrl: string
  expiryDate: string
}

/**
 * Profile status type
 */
export type ProfileStatus = 'Pending Claim' | 'Active' | 'Inactive'

/**
 * User type for authentication
 */
export type UserType = 'vet' | 'owner' | 'public'
