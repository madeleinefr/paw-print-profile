/**
 * PetRepository - Data access layer for pet records in DynamoDB
 * 
 * Implements CRUD operations and search functionality for pets using
 * the single-table design pattern with Global Secondary Indexes.
 */

import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import {
  Pet,
  VaccineRecord,
  SurgeryRecord,
  CreateMedicalProfileInput,
  ClaimProfileInput,
  EnrichProfileInput,
  UpdatePetInput,
  CreateVaccineInput,
  CreateSurgeryInput,
  SearchCriteria,
  PaginationParams,
  PaginatedResponse,
  MedicalProfileResponse,
  ClaimProfileResponse,
  ProfileStatus,
} from '../models/entities'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'

export class PetRepository {
  private docClient: DynamoDBDocumentClient
  private tableName: string

  constructor(tableName: string = process.env.DYNAMODB_TABLE || 'VetPetRegistry') {
    const factory = new AWSClientFactory()
    const dynamoClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(dynamoClient)
    this.tableName = tableName
  }

  /**
   * Create a medical pet profile (veterinarian only).
   * Generates a claiming code valid for 30 days and sets up GSI attributes
   * for species/breed search (GSI2), claiming code lookup (GSI4), and clinic lookup (GSI6).
   *
   * @param input - Medical profile data including name, species, breed, age, clinicId, and verifyingVetId
   * @returns The created medical profile response with claiming code and expiry
   */
  async createMedicalProfile(input: CreateMedicalProfileInput): Promise<MedicalProfileResponse> {
    const petId = uuidv4()
    const claimingCode = this.generateClaimingCode()
    const now = new Date().toISOString()
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

    const pet: Pet = {
      PK: `PET#${petId}`,
      SK: 'METADATA',
      petId,
      name: input.name,
      species: input.species,
      breed: input.breed,
      age: input.age,
      clinicId: input.clinicId,
      
      // Co-onboarding fields
      profileStatus: 'Pending Claim',
      claimingCode,
      claimingCodeExpiry: expiryDate,
      medicallyVerified: true,
      
      // Medical verification metadata
      verifyingVetId: input.verifyingVetId,
      verificationDate: now,
      
      createdAt: now,
      updatedAt: now,
      isMissing: false,
      customFields: input.customFields || {},
      
      // GSI2 attributes for species/breed search
      GSI2PK: `SPECIES#${input.species}`,
      GSI2SK: `BREED#${input.breed}#AGE#${input.age}`,
      
      // GSI4 attributes for claiming code lookup (only when pending)
      GSI4PK: `CLAIM#${claimingCode}`,
      GSI4SK: `PET#${petId}`,
      
      // GSI6 attributes for clinic-pet lookup (always present)
      GSI6PK: `CLINIC#${input.clinicId}`,
      GSI6SK: `PET#${petId}`,
    }

    const command = new PutCommand({
      TableName: this.tableName,
      Item: pet,
    })

    await this.docClient.send(command)
    
    return {
      petId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      age: pet.age,
      clinicId: pet.clinicId,
      profileStatus: pet.profileStatus,
      claimingCode,
      claimingCodeExpiry: expiryDate,
      medicallyVerified: true,
      verifyingVetId: input.verifyingVetId,
      createdAt: now,
    }
  }

  /**
   * Find a pet by claiming code using GSI4.
   * Returns null if the code is invalid or expired.
   *
   * @param claimingCode - The claiming code to look up (e.g., "CLAIM-ABC123")
   * @returns The pet record if found and code is not expired, or null
   */
  async findByClaimingCode(claimingCode: string): Promise<Pet | null> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI4',
      KeyConditionExpression: 'GSI4PK = :claimingCode',
      ExpressionAttributeValues: {
        ':claimingCode': `CLAIM#${claimingCode}`,
      },
    })

    const response = await this.docClient.send(command)
    const pets = response.Items as Pet[] || []
    
    if (pets.length === 0) {
      return null
    }

    const pet = pets[0]
    
    // Check if claiming code has expired
    if (pet.claimingCodeExpiry && new Date(pet.claimingCodeExpiry) < new Date()) {
      return null
    }

    return pet
  }

  /**
   * Claim a pet profile (pet owner).
   * Atomically transitions the profile from 'Pending Claim' to 'Active',
   * sets owner fields, creates GSI3 owner lookup, and removes claiming code attributes.
   *
   * @param petId - The pet to claim
   * @param input - Owner details (name, email, phone)
   * @param ownerId - The authenticated owner's user ID
   * @returns The claim response with new profile status
   * @throws ConditionalCheckFailedException if pet is not in 'Pending Claim' status
   */
  async claimProfile(petId: string, input: ClaimProfileInput, ownerId: string): Promise<ClaimProfileResponse> {
    const now = new Date().toISOString()

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: `PET#${petId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET 
        profileStatus = :status,
        ownerId = :ownerId,
        ownerName = :ownerName,
        ownerEmail = :ownerEmail,
        ownerPhone = :ownerPhone,
        updatedAt = :updatedAt,
        GSI3PK = :gsi3pk,
        GSI3SK = :gsi3sk
        REMOVE claimingCode, claimingCodeExpiry, GSI4PK, GSI4SK`,
      ConditionExpression: 'profileStatus = :pendingStatus AND attribute_exists(claimingCode)',
      ExpressionAttributeValues: {
        ':status': 'Active' as ProfileStatus,
        ':ownerId': ownerId,
        ':ownerName': input.ownerName,
        ':ownerEmail': input.ownerEmail,
        ':ownerPhone': input.ownerPhone,
        ':updatedAt': now,
        ':gsi3pk': `OWNER#${ownerId}`,
        ':gsi3sk': `PET#${petId}`,
        ':pendingStatus': 'Pending Claim' as ProfileStatus,
      },
      ReturnValues: 'ALL_NEW',
    })

    const response = await this.docClient.send(command)
    const pet = response.Attributes as Pet

    return {
      petId,
      name: pet.name,
      profileStatus: 'Active' as ProfileStatus,
      ownerId,
      ownerName: input.ownerName,
      claimedAt: now,
    }
  }

  /**
   * Enrich a claimed pet profile (pet owner only).
   * Dynamically builds an update expression for the provided fields.
   * Condition: pet must be owned by ownerId and in 'Active' status.
   *
   * @param petId - The pet to enrich
   * @param ownerId - The authenticated owner's user ID (used in condition check)
   * @param input - Optional enrichment fields (address, phone, custom fields, etc.)
   * @returns The updated pet record
   * @throws ConditionalCheckFailedException if ownership or status check fails
   */
  async enrichProfile(petId: string, ownerId: string, input: EnrichProfileInput): Promise<Pet> {
    const now = new Date().toISOString()
    
    // Build update expression dynamically
    const updateExpressions: string[] = ['updatedAt = :updatedAt']
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
      ':ownerId': ownerId,
      ':activeStatus': 'Active' as ProfileStatus,
    }

    if (input.ownerName !== undefined) {
      updateExpressions.push('ownerName = :ownerName')
      expressionAttributeValues[':ownerName'] = input.ownerName
    }

    if (input.ownerEmail !== undefined) {
      updateExpressions.push('ownerEmail = :ownerEmail')
      expressionAttributeValues[':ownerEmail'] = input.ownerEmail
    }

    if (input.ownerPhone !== undefined) {
      updateExpressions.push('ownerPhone = :ownerPhone')
      expressionAttributeValues[':ownerPhone'] = input.ownerPhone
    }

    if (input.ownerStreet !== undefined) {
      updateExpressions.push('ownerStreet = :ownerStreet')
      expressionAttributeValues[':ownerStreet'] = input.ownerStreet
    }

    if (input.ownerHouseNumber !== undefined) {
      updateExpressions.push('ownerHouseNumber = :ownerHouseNumber')
      expressionAttributeValues[':ownerHouseNumber'] = input.ownerHouseNumber
    }

    if (input.ownerZipCode !== undefined) {
      updateExpressions.push('ownerZipCode = :ownerZipCode')
      expressionAttributeValues[':ownerZipCode'] = input.ownerZipCode
    }

    if (input.ownerCity !== undefined) {
      updateExpressions.push('ownerCity = :ownerCity')
      expressionAttributeValues[':ownerCity'] = input.ownerCity
    }

    if (input.customFields !== undefined) {
      updateExpressions.push('customFields = :customFields')
      expressionAttributeValues[':customFields'] = input.customFields
    }

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: `PET#${petId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ConditionExpression: 'ownerId = :ownerId AND profileStatus = :activeStatus',
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })

    const response = await this.docClient.send(command)
    return response.Attributes as Pet
  }

  /**
   * Find pending claims for a clinic using GSI6 with filter on profileStatus.
   *
   * @param clinicId - The clinic to query
   * @returns Array of pets with 'Pending Claim' status belonging to the clinic
   */
  async findPendingClaims(clinicId: string): Promise<Pet[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI6',
      KeyConditionExpression: 'GSI6PK = :clinicPk',
      FilterExpression: 'profileStatus = :status',
      ExpressionAttributeValues: {
        ':clinicPk': `CLINIC#${clinicId}`,
        ':status': 'Pending Claim' as ProfileStatus,
      },
    })

    const response = await this.docClient.send(command)
    return response.Items as Pet[] || []
  }

  /**
   * Find a pet by ID using DynamoDB GetItem on the main table.
   *
   * @param petId - The pet's unique identifier
   * @returns The pet record or null if not found
   */
  async findById(petId: string): Promise<Pet | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        PK: `PET#${petId}`,
        SK: 'METADATA',
      },
    })

    const response = await this.docClient.send(command)
    return response.Item as Pet || null
  }

  /**
   * Update a pet record with dynamic field updates.
   * Handles reserved keyword escaping (e.g., "name") and GSI2SK updates when age changes.
   *
   * @param petId - The pet to update
   * @param updates - Partial fields to update
   * @returns The fully updated pet record (ReturnValues: ALL_NEW)
   */
  async update(petId: string, updates: UpdatePetInput): Promise<Pet> {
    const now = new Date().toISOString()
    
    // Build update expression dynamically
    const updateExpressions: string[] = ['updatedAt = :updatedAt']
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    }
    // ExpressionAttributeNames is required for reserved keywords (e.g. "name")
    const expressionAttributeNames: Record<string, string> = {}

    if (updates.name !== undefined) {
      updateExpressions.push('#petName = :name')
      expressionAttributeNames['#petName'] = 'name'
      expressionAttributeValues[':name'] = updates.name
    }

    if (updates.age !== undefined) {
      updateExpressions.push('age = :age')
      expressionAttributeValues[':age'] = updates.age
      // Update GSI2SK when age changes
      const pet = await this.findById(petId)
      if (pet) {
        updateExpressions.push('GSI2SK = :gsi2sk')
        expressionAttributeValues[':gsi2sk'] = `BREED#${pet.breed}#AGE#${updates.age}`
      }
    }

    if (updates.ownerName !== undefined) {
      updateExpressions.push('ownerName = :ownerName')
      expressionAttributeValues[':ownerName'] = updates.ownerName
    }

    if (updates.ownerEmail !== undefined) {
      updateExpressions.push('ownerEmail = :ownerEmail')
      expressionAttributeValues[':ownerEmail'] = updates.ownerEmail
    }

    if (updates.ownerPhone !== undefined) {
      updateExpressions.push('ownerPhone = :ownerPhone')
      expressionAttributeValues[':ownerPhone'] = updates.ownerPhone
    }

    if (updates.ownerStreet !== undefined) {
      updateExpressions.push('ownerStreet = :ownerStreet')
      expressionAttributeValues[':ownerStreet'] = updates.ownerStreet
    }

    if (updates.ownerHouseNumber !== undefined) {
      updateExpressions.push('ownerHouseNumber = :ownerHouseNumber')
      expressionAttributeValues[':ownerHouseNumber'] = updates.ownerHouseNumber
    }

    if (updates.ownerZipCode !== undefined) {
      updateExpressions.push('ownerZipCode = :ownerZipCode')
      expressionAttributeValues[':ownerZipCode'] = updates.ownerZipCode
    }

    if (updates.ownerCity !== undefined) {
      updateExpressions.push('ownerCity = :ownerCity')
      expressionAttributeValues[':ownerCity'] = updates.ownerCity
    }

    if (updates.customFields !== undefined) {
      updateExpressions.push('customFields = :customFields')
      expressionAttributeValues[':customFields'] = updates.customFields
    }

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: `PET#${petId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(Object.keys(expressionAttributeNames).length > 0 && {
        ExpressionAttributeNames: expressionAttributeNames,
      }),
      ReturnValues: 'ALL_NEW',
    })

    const response = await this.docClient.send(command)
    return response.Attributes as Pet
  }

  /**
   * Delete a pet record and all associated records (vaccines, surgeries, images).
   *
   * @param petId - The pet to delete
   */
  async delete(petId: string): Promise<void> {
    // First, delete all associated records (vaccines, surgeries, images)
    await this.deleteAssociatedRecords(petId)

    // Then delete the pet metadata
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        PK: `PET#${petId}`,
        SK: 'METADATA',
      },
    })

    await this.docClient.send(command)
  }

  /**
   * Find pets by clinic with pagination using GSI6.
   *
   * @param clinicId - The clinic to query
   * @param pagination - Page number, limit, and optional last evaluated key for cursor-based pagination
   * @returns Paginated list of pets with hasNext indicator
   */
  async findByClinic(clinicId: string, pagination: PaginationParams): Promise<PaginatedResponse<Pet>> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI6',
      KeyConditionExpression: 'GSI6PK = :clinicPk',
      ExpressionAttributeValues: {
        ':clinicPk': `CLINIC#${clinicId}`,
      },
      Limit: pagination.limit,
      ExclusiveStartKey: pagination.lastEvaluatedKey,
    })

    const response = await this.docClient.send(command)
    
    return {
      items: response.Items as Pet[] || [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        hasNext: !!response.LastEvaluatedKey,
        lastEvaluatedKey: response.LastEvaluatedKey,
      },
    }
  }

  /**
   * Search pets using GSI2 for species/breed queries.
   * Falls back to a full table scan when no species is specified.
   * Applies in-memory filters for breed, ageMin, and ageMax.
   *
   * @param criteria - Search filters (species, breed, ageMin, ageMax, tags)
   * @returns Array of matching pet records
   */
  async search(criteria: SearchCriteria): Promise<Pet[]> {
    if (criteria.species) {
      // Use GSI2 for species-based search
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :species',
        ExpressionAttributeValues: {
          ':species': `SPECIES#${criteria.species}`,
        },
      })

      const response = await this.docClient.send(command)
      let pets = response.Items as Pet[] || []

      // Apply additional filters
      if (criteria.breed) {
        pets = pets.filter(pet => pet.breed && pet.breed.toLowerCase().includes(criteria.breed!.toLowerCase()))
      }

      if (criteria.ageMin !== undefined) {
        pets = pets.filter(pet => pet.age >= criteria.ageMin!)
      }

      if (criteria.ageMax !== undefined) {
        pets = pets.filter(pet => pet.age <= criteria.ageMax!)
      }

      return pets
    } else {
      // Fallback to scan if no species specified
      const command = new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: {
          ':sk': 'METADATA',
        },
      })

      const response = await this.docClient.send(command)
      let pets = response.Items as Pet[] || []

      // Apply filters
      if (criteria.breed) {
        pets = pets.filter(pet => pet.breed && pet.breed.toLowerCase().includes(criteria.breed!.toLowerCase()))
      }

      if (criteria.ageMin !== undefined) {
        pets = pets.filter(pet => pet.age >= criteria.ageMin!)
      }

      if (criteria.ageMax !== undefined) {
        pets = pets.filter(pet => pet.age <= criteria.ageMax!)
      }

      return pets
    }
  }

  /**
   * Add a vaccine record to a pet. Stores as a separate item with SK "VACCINE#{vaccineId}".
   *
   * @param petId - The pet to add the vaccine to
   * @param vaccine - Vaccine details (name, dates, vet name)
   * @returns The created vaccine record with generated vaccineId
   */
  async addVaccine(petId: string, vaccine: CreateVaccineInput): Promise<VaccineRecord> {
    const vaccineId = uuidv4()
    const now = new Date().toISOString()

    const vaccineRecord: VaccineRecord = {
      PK: `PET#${petId}`,
      SK: `VACCINE#${vaccineId}`,
      vaccineId,
      vaccineName: vaccine.vaccineName,
      administeredDate: vaccine.administeredDate,
      nextDueDate: vaccine.nextDueDate,
      veterinarianName: vaccine.veterinarianName,
      createdAt: now,
    }

    const command = new PutCommand({
      TableName: this.tableName,
      Item: vaccineRecord,
    })

    await this.docClient.send(command)
    return vaccineRecord
  }

  /**
   * Add a surgery record to a pet. Stores as a separate item with SK "SURGERY#{surgeryId}".
   *
   * @param petId - The pet to add the surgery to
   * @param surgery - Surgery details (type, date, notes, recovery info, vet name)
   * @returns The created surgery record with generated surgeryId
   */
  async addSurgery(petId: string, surgery: CreateSurgeryInput): Promise<SurgeryRecord> {
    const surgeryId = uuidv4()
    const now = new Date().toISOString()

    const surgeryRecord: SurgeryRecord = {
      PK: `PET#${petId}`,
      SK: `SURGERY#${surgeryId}`,
      surgeryId,
      surgeryType: surgery.surgeryType,
      surgeryDate: surgery.surgeryDate,
      notes: surgery.notes,
      recoveryInfo: surgery.recoveryInfo,
      veterinarianName: surgery.veterinarianName,
      createdAt: now,
    }

    const command = new PutCommand({
      TableName: this.tableName,
      Item: surgeryRecord,
    })

    await this.docClient.send(command)
    return surgeryRecord
  }

  /**
   * Get all vaccines for a pet using Query with SK begins_with "VACCINE#".
   *
   * @param petId - The pet to query vaccines for
   * @returns Array of vaccine records
   */
  async getVaccines(petId: string): Promise<VaccineRecord[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `PET#${petId}`,
        ':sk': 'VACCINE#',
      },
    })

    const response = await this.docClient.send(command)
    return response.Items as VaccineRecord[] || []
  }

  /**
   * Get all surgeries for a pet using Query with SK begins_with "SURGERY#".
   *
   * @param petId - The pet to query surgeries for
   * @returns Array of surgery records
   */
  async getSurgeries(petId: string): Promise<SurgeryRecord[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `PET#${petId}`,
        ':sk': 'SURGERY#',
      },
    })

    const response = await this.docClient.send(command)
    return response.Items as SurgeryRecord[] || []
  }

  /**
   * Get pets by owner using GSI3 (only active/claimed pets).
   *
   * @param ownerId - The owner's user ID
   * @returns Array of active pets owned by this user
   */
  async findByOwner(ownerId: string): Promise<Pet[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI3',
      KeyConditionExpression: 'GSI3PK = :owner',
      FilterExpression: 'profileStatus = :status',
      ExpressionAttributeValues: {
        ':owner': `OWNER#${ownerId}`,
        ':status': 'Active' as ProfileStatus,
      },
    })

    const response = await this.docClient.send(command)
    return response.Items as Pet[] || []
  }

  /**
   * Update the claiming code and expiry for a pending profile.
   * Also updates the GSI4 key attributes to reflect the new code.
   *
   * @param petId - The pet to update
   * @param claimingCode - New claiming code
   * @param expiryDate - New expiry date (ISO string)
   */
  async updateClaimingCode(petId: string, claimingCode: string, expiryDate: string): Promise<void> {
    const now = new Date().toISOString()
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      UpdateExpression: 'SET claimingCode = :code, claimingCodeExpiry = :expiry, GSI4PK = :gsi4pk, GSI4SK = :gsi4sk, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':code': claimingCode,
        ':expiry': expiryDate,
        ':gsi4pk': `CLAIM#${claimingCode}`,
        ':gsi4sk': `PET#${petId}`,
        ':updatedAt': now,
      },
    })
    await this.docClient.send(command)
  }

  /**
   * Set the isMissing flag on a pet.
   *
   * @param petId - The pet to update
   * @param isMissing - Whether the pet is currently missing
   * @returns The updated pet record
   */
  async setMissingStatus(petId: string, isMissing: boolean, missingData?: { lastSeenLocation?: string; flyerUrl?: string }): Promise<Pet> {
    const now = new Date().toISOString()
    let updateExpression = 'SET isMissing = :isMissing, updatedAt = :updatedAt'
    const expressionAttributeValues: Record<string, any> = {
      ':isMissing': isMissing,
      ':updatedAt': now,
    }
    const removeFields: string[] = []

    if (isMissing && missingData?.lastSeenLocation) {
      updateExpression += ', lastSeenLocation = :lastSeenLocation'
      expressionAttributeValues[':lastSeenLocation'] = missingData.lastSeenLocation
    }
    if (isMissing && missingData?.flyerUrl) {
      updateExpression += ', flyerUrl = :flyerUrl'
      expressionAttributeValues[':flyerUrl'] = missingData.flyerUrl
    }
    if (!isMissing) {
      removeFields.push('lastSeenLocation', 'flyerUrl')
    }

    const fullExpression = removeFields.length > 0
      ? `${updateExpression} REMOVE ${removeFields.join(', ')}`
      : updateExpression

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      UpdateExpression: fullExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
    const response = await this.docClient.send(command)
    return response.Attributes as Pet
  }

  /**
   * Generate a unique claiming code
   */
  private generateClaimingCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = 'CLAIM-'
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Delete all associated records for a pet (vaccines, surgeries, images)
   */
  private async deleteAssociatedRecords(petId: string): Promise<void> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `PET#${petId}`,
      },
    })

    const response = await this.docClient.send(command)
    const items = response.Items || []

    // Delete all associated records except the main pet metadata
    const deletePromises = items
      .filter(item => item.SK !== 'METADATA')
      .map(item => {
        const deleteCommand = new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: item.PK,
            SK: item.SK,
          },
        })
        return this.docClient.send(deleteCommand)
      })

    await Promise.all(deletePromises)
  }
}