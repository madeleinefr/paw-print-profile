/**
 * CareSnapshotRepository - Data access layer for care snapshot records in DynamoDB
 * 
 * Implements CRUD operations for care snapshots that provide temporary
 * caregiver access to essential pet care information.
 */

import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import {
  CareSnapshot,
  CreateCareSnapshotInput,
  CareSnapshotResponse,
} from '../models/entities'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'

export class CareSnapshotRepository {
  private docClient: DynamoDBDocumentClient
  private tableName: string

  constructor(tableName: string = 'VetPetRegistry') {
    const factory = new AWSClientFactory()
    const dynamoClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(dynamoClient)
    this.tableName = tableName
  }

  /**
   * Create a care snapshot with time-limited access
   */
  async create(input: CreateCareSnapshotInput, emergencyContacts: CareSnapshot['emergencyContacts']): Promise<CareSnapshotResponse> {
    const snapshotId = uuidv4()
    const accessCode = this.generateAccessCode()
    const now = new Date().toISOString()
    const expiryDate = new Date(Date.now() + input.expiryHours * 60 * 60 * 1000).toISOString()

    const snapshot: CareSnapshot = {
      PK: `SNAPSHOT#${snapshotId}`,
      SK: 'METADATA',
      snapshotId,
      petId: input.petId,
      petName: '', // Will be populated by service layer
      careInstructions: input.careInstructions,
      feedingSchedule: input.feedingSchedule,
      medications: input.medications,
      emergencyContacts,
      accessCode,
      expiryDate,
      createdAt: now,
      
      // GSI5 attributes for access code lookup
      GSI5PK: `ACCESS#${accessCode}`,
      GSI5SK: `SNAPSHOT#${snapshotId}`,
    }

    const command = new PutCommand({
      TableName: this.tableName,
      Item: snapshot,
    })

    await this.docClient.send(command)

    return {
      snapshotId,
      petName: snapshot.petName,
      accessCode,
      accessUrl: `${process.env.APP_BASE_URL || (process.env.IS_LOCAL === 'true' ? 'http://localhost:8080' : 'https://app.pawprintprofile.com')}/care/${accessCode}`,
      expiryDate,
    }
  }

  /**
   * Find a care snapshot by access code using GSI5
   */
  async findByAccessCode(accessCode: string): Promise<CareSnapshot | null> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'GSI5',
      KeyConditionExpression: 'GSI5PK = :accessCode',
      ExpressionAttributeValues: {
        ':accessCode': `ACCESS#${accessCode}`,
      },
    })

    const response = await this.docClient.send(command)
    const snapshots = response.Items as CareSnapshot[] || []
    
    if (snapshots.length === 0) {
      return null
    }

    const snapshot = snapshots[0]
    
    // Check if access code has expired
    if (new Date(snapshot.expiryDate) < new Date()) {
      return null
    }

    return snapshot
  }

  /**
   * Find a care snapshot by ID
   */
  async findById(snapshotId: string): Promise<CareSnapshot | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        PK: `SNAPSHOT#${snapshotId}`,
        SK: 'METADATA',
      },
    })

    const response = await this.docClient.send(command)
    return response.Item as CareSnapshot || null
  }

  /**
   * Update access timestamp when snapshot is accessed
   */
  async recordAccess(snapshotId: string): Promise<void> {
    const now = new Date().toISOString()

    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: `SNAPSHOT#${snapshotId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET accessedAt = :accessedAt',
      ExpressionAttributeValues: {
        ':accessedAt': now,
      },
    })

    await this.docClient.send(command)
  }

  /**
   * Delete an expired care snapshot
   */
  async delete(snapshotId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        PK: `SNAPSHOT#${snapshotId}`,
        SK: 'METADATA',
      },
    })

    await this.docClient.send(command)
  }

  /**
   * Find all care snapshots for a pet
   */
  async findByPet(petId: string): Promise<CareSnapshot[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'petId = :petId AND SK = :sk',
      ExpressionAttributeValues: {
        ':petId': petId,
        ':sk': 'METADATA',
      },
    })

    const response = await this.docClient.send(command)
    return response.Items as CareSnapshot[] || []
  }

  /**
   * Generate a unique access code
   */
  private generateAccessCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = 'CARE-'
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }
}