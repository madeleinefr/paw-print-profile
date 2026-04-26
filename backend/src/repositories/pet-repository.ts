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

  constructor(tableName: string = 'VetPetRegistry') {
    const factory = new AWSClientFactory()
    const dynamoClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(dynamoClient)
    this.tableName = tableName
  }

  /**
   * Create a medical pet profile (veterinarian only)
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
   * Find a pet by claiming code using GSI4
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
   * Claim a pet profile (pet owner)
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
   * Enrich a claimed pet profile (pet owner only)
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
   * Find pending claims for a clinic
   */
  async findPendingClaims(clinicId: string): Promise<Pet[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'clinicId = :clinicId AND profileStatus = :status AND SK = :sk',
      ExpressionAttributeValues: {
        ':clinicId': clinicId,
        ':status': 'Pending Claim' as ProfileStatus,
        ':sk': 'METADATA',
      },
    })

    const response = await this.docClient.send(command)
    return response.Items as Pet[] || []
  }

  /**
   * Find a pet by ID
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
   * Update a pet record
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
   * Delete a pet record
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
   * Find pets by clinic with pagination
   */
  async findByClinic(clinicId: string, pagination: PaginationParams): Promise<PaginatedResponse<Pet>> {
    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'clinicId = :clinicId AND SK = :sk',
      ExpressionAttributeValues: {
        ':clinicId': clinicId,
        ':sk': 'METADATA',
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
   * Search pets using GSI2 for species/breed queries
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
        pets = pets.filter(pet => pet.breed.toLowerCase().includes(criteria.breed!.toLowerCase()))
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
        pets = pets.filter(pet => pet.breed.toLowerCase().includes(criteria.breed!.toLowerCase()))
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
   * Add a vaccine record to a pet
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
   * Add a surgery record to a pet
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
   * Get all vaccines for a pet
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
   * Get all surgeries for a pet
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
   * Get pets by owner using GSI3 (only claimed pets)
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
   * Update the claiming code and expiry for a pending profile
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
   * Set the isMissing flag on a pet
   */
  async setMissingStatus(petId: string, isMissing: boolean): Promise<Pet> {
    const now = new Date().toISOString()
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: { PK: `PET#${petId}`, SK: 'METADATA' },
      UpdateExpression: 'SET isMissing = :isMissing, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':isMissing': isMissing, ':updatedAt': now },
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