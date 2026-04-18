/**
 * ClinicRepository - Data access layer for clinic records in DynamoDB
 * 
 * Implements CRUD operations for veterinary clinics using the single-table
 * design pattern with GSI1 for license number lookups.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
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
  Clinic,
  CreateClinicInput,
  UpdateClinicInput,
} from '../models/entities'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'

export class ClinicRepository {
  private docClient: DynamoDBDocumentClient
  private tableName: string

  constructor(tableName: string = 'VetPetRegistry') {
    const factory = new AWSClientFactory()
    const dynamoClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(dynamoClient)
    this.tableName = tableName
  }

  /**
   * Create a new clinic record
   */
  async create(input: CreateClinicInput): Promise<Clinic> {
    const clinicId = uuidv4()
    const now = new Date().toISOString()

    const clinic: Clinic = {
      PK: `CLINIC#${clinicId}`,
      SK: 'METADATA',
      clinicId,
      name: input.name,
      address: input.address,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      phone: input.phone,
      email: input.email,
      licenseNumber: input.licenseNumber,
      latitude: input.latitude,
      longitude: input.longitude,
      customFields: input.customFields || [],
      createdAt: now,
      updatedAt: now,
      
      // GSI1 attributes for license number lookup
      GSI1PK: `LICENSE#${input.licenseNumber}`,
      GSI1SK: `CLINIC#${clinicId}`,
    }

    const command = new PutCommand({
      TableName: this.tableName,
      Item: clinic,
    })

    await this.docClient.send(command)
    return clinic
  }

  /**
   * Find a clinic by ID
   */
  async findById(clinicId: string): Promise<Clinic | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        PK: `CLINIC#${clinicId}`,
        SK: 'METADATA',
      },
    })

    const response = await this.docClient.send(command)
    return response.Item as Clinic || null
  }

  /**
   * Find a clinic by license number using GSI1
   */
  async findByLicenseNumber(licenseNumber: string): Promise<Clinic | null> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :license',
      ExpressionAttributeValues: {
        ':license': `LICENSE#${licenseNumber}`,
      },
    })

    const response = await this.docClient.send(command)
    const items = response.Items || []
    
    return items.length > 0 ? items[0] as Clinic : null
  }

  /**
   * Update a clinic record
   */
  async update(clinicId: string, updates: UpdateClinicInput): Promise<Clinic> {
    const now = new Date().toISOString()
    
    // Build update expression dynamically
    const updateExpressions: string[] = ['updatedAt = :updatedAt']
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    }

    if (updates.name !== undefined) {
      updateExpressions.push('name = :name')
      expressionAttributeValues[':name'] = updates.name
    }

    if (updates.address !== undefined) {
      updateExpressions.push('address = :address')
      expressionAttributeValues[':address'] = updates.address
    }

    if (updates.city !== undefined) {
      updateExpressions.push('city = :city')
      expressionAttributeValues[':city'] = updates.city
    }

    if (updates.state !== undefined) {
      updateExpressions.push('state = :state')
      expressionAttributeValues[':state'] = updates.state
    }

    if (updates.zipCode !== undefined) {
      updateExpressions.push('zipCode = :zipCode')
      expressionAttributeValues[':zipCode'] = updates.zipCode
    }

    if (updates.phone !== undefined) {
      updateExpressions.push('phone = :phone')
      expressionAttributeValues[':phone'] = updates.phone
    }

    if (updates.email !== undefined) {
      updateExpressions.push('email = :email')
      expressionAttributeValues[':email'] = updates.email
    }

    if (updates.latitude !== undefined) {
      updateExpressions.push('latitude = :latitude')
      expressionAttributeValues[':latitude'] = updates.latitude
    }

    if (updates.longitude !== undefined) {
      updateExpressions.push('longitude = :longitude')
      expressionAttributeValues[':longitude'] = updates.longitude
    }

    if (updates.customFields !== undefined) {
      updateExpressions.push('customFields = :customFields')
      expressionAttributeValues[':customFields'] = updates.customFields
    }

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: `CLINIC#${clinicId}`,
        SK: 'METADATA',
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })

    const response = await this.docClient.send(command)
    return response.Attributes as Clinic
  }

  /**
   * Delete a clinic record
   */
  async delete(clinicId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        PK: `CLINIC#${clinicId}`,
        SK: 'METADATA',
      },
    })

    await this.docClient.send(command)
  }

  /**
   * Find nearby clinics within a radius (simplified implementation)
   * In a production system, this would use geospatial indexing
   */
  async findNearby(latitude: number, longitude: number, radiusKm: number): Promise<Clinic[]> {
    
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': 'CLINIC',
        ':sk': 'METADATA',
      },
    })

    // Since we're using a single table design, we need to scan for clinics
    const allClinics = await this.getAllClinics()
    
    return allClinics.filter(clinic => {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        clinic.latitude,
        clinic.longitude
      )
      return distance <= radiusKm
    })
  }

  /**
   * Get all clinics (helper method for nearby search)
   */
  private async getAllClinics(): Promise<Clinic[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': 'CLINIC#',
        ':sk': 'METADATA',
      },
    })

    // Since DynamoDB doesn't support begins_with in KeyConditionExpression for the main table,
    // we need to use Scan with FilterExpression
    const scanCommand = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': 'CLINIC#',
        ':sk': 'METADATA',
      },
    })

    const response = await this.docClient.send(scanCommand)
    return response.Items as Clinic[] || []
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1)
    const dLon = this.toRadians(lon2 - lon1)
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
  }
}