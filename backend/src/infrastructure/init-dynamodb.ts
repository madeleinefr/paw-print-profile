/**
 * DynamoDB Table Initialization Script
 * 
 * This script creates the VetPetRegistry table with all required Global Secondary Indexes.
 * It supports both LocalStack (local development) and AWS (cloud deployment) environments.
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb'
import { AWSClientFactory } from './aws-client-factory'

export interface TableConfig {
  tableName: string
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED'
  readCapacity?: number
  writeCapacity?: number
}

export class DynamoDBTableInitializer {
  private client: DynamoDBClient
  private tableName: string

  constructor(tableName: string = 'VetPetRegistry') {
    const factory = new AWSClientFactory()
    this.client = factory.createDynamoDBClient()
    this.tableName = tableName
  }

  /**
   * Create the VetPetRegistry table with all GSIs
   */
  async createTable(config?: TableConfig): Promise<void> {
    const tableName = config?.tableName || this.tableName
    const billingMode = config?.billingMode || 'PAY_PER_REQUEST'

    console.log(`Creating DynamoDB table: ${tableName}`)

    const command = new CreateTableCommand({
      TableName: tableName,
      BillingMode: billingMode,
      
      // Attribute definitions for all keys used in table and GSIs
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'GSI2PK', AttributeType: 'S' },
        { AttributeName: 'GSI2SK', AttributeType: 'S' },
        { AttributeName: 'GSI3PK', AttributeType: 'S' },
        { AttributeName: 'GSI3SK', AttributeType: 'S' },
        { AttributeName: 'GSI4PK', AttributeType: 'S' },
        { AttributeName: 'GSI4SK', AttributeType: 'S' },
        { AttributeName: 'GSI5PK', AttributeType: 'S' },
        { AttributeName: 'GSI5SK', AttributeType: 'S' },
      ],

      // Primary key schema
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],

      // Global Secondary Indexes
      GlobalSecondaryIndexes: [
        {
          // GSI1: License number lookup for clinics
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ...(billingMode === 'PROVISIONED' && {
            ProvisionedThroughput: {
              ReadCapacityUnits: config?.readCapacity || 5,
              WriteCapacityUnits: config?.writeCapacity || 5,
            },
          }),
        },
        {
          // GSI2: Pet search by species and breed
          IndexName: 'GSI2',
          KeySchema: [
            { AttributeName: 'GSI2PK', KeyType: 'HASH' },
            { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ...(billingMode === 'PROVISIONED' && {
            ProvisionedThroughput: {
              ReadCapacityUnits: config?.readCapacity || 5,
              WriteCapacityUnits: config?.writeCapacity || 5,
            },
          }),
        },
        {
          // GSI3: Owner lookup (only for claimed pets)
          IndexName: 'GSI3',
          KeySchema: [
            { AttributeName: 'GSI3PK', KeyType: 'HASH' },
            { AttributeName: 'GSI3SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ...(billingMode === 'PROVISIONED' && {
            ProvisionedThroughput: {
              ReadCapacityUnits: config?.readCapacity || 5,
              WriteCapacityUnits: config?.writeCapacity || 5,
            },
          }),
        },
        {
          // GSI4: Claiming code lookup (only for pending pets)
          IndexName: 'GSI4',
          KeySchema: [
            { AttributeName: 'GSI4PK', KeyType: 'HASH' },
            { AttributeName: 'GSI4SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ...(billingMode === 'PROVISIONED' && {
            ProvisionedThroughput: {
              ReadCapacityUnits: config?.readCapacity || 5,
              WriteCapacityUnits: config?.writeCapacity || 5,
            },
          }),
        },
        {
          // GSI5: Care snapshot access code lookup
          IndexName: 'GSI5',
          KeySchema: [
            { AttributeName: 'GSI5PK', KeyType: 'HASH' },
            { AttributeName: 'GSI5SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
          ...(billingMode === 'PROVISIONED' && {
            ProvisionedThroughput: {
              ReadCapacityUnits: config?.readCapacity || 5,
              WriteCapacityUnits: config?.writeCapacity || 5,
            },
          }),
        },
      ],

      // Provisioned throughput (only for PROVISIONED billing mode)
      ...(billingMode === 'PROVISIONED' && {
        ProvisionedThroughput: {
          ReadCapacityUnits: config?.readCapacity || 5,
          WriteCapacityUnits: config?.writeCapacity || 5,
        },
      }),
    })

    try {
      await this.client.send(command)
      console.log(`Table ${tableName} creation initiated`)

      // Wait for table to be active
      await waitUntilTableExists(
        { client: this.client, maxWaitTime: 60 },
        { TableName: tableName }
      )

      console.log(`Table ${tableName} is now active`)
    } catch (error: any) {
      if (error.name === 'ResourceInUseException') {
        console.log(`Table ${tableName} already exists`)
      } else {
        console.error(`Error creating table ${tableName}:`, error)
        throw error
      }
    }
  }

  /**
   * Delete the VetPetRegistry table
   * WARNING: This will delete all data in the table
   */
  async deleteTable(tableName?: string): Promise<void> {
    const table = tableName || this.tableName
    console.log(`Deleting DynamoDB table: ${table}`)

    try {
      const command = new DeleteTableCommand({ TableName: table })
      await this.client.send(command)
      console.log(`Table ${table} deletion initiated`)

      // Wait for table to be deleted
      await waitUntilTableNotExists(
        { client: this.client, maxWaitTime: 60 },
        { TableName: table }
      )

      console.log(`Table ${table} has been deleted`)
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`Table ${table} does not exist`)
      } else {
        console.error(`Error deleting table ${table}:`, error)
        throw error
      }
    }
  }

  /**
   * Check if the table exists
   */
  async tableExists(tableName?: string): Promise<boolean> {
    const table = tableName || this.tableName
    try {
      const command = new DescribeTableCommand({ TableName: table })
      await this.client.send(command)
      return true
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false
      }
      throw error
    }
  }

  /**
   * Get table description including GSI information
   */
  async describeTable(tableName?: string): Promise<any> {
    const table = tableName || this.tableName
    const command = new DescribeTableCommand({ TableName: table })
    const response = await this.client.send(command)
    return response.Table
  }

  /**
   * Initialize table for testing (delete if exists, then create)
   */
  async initializeForTesting(config?: TableConfig): Promise<void> {
    const tableName = config?.tableName || this.tableName
    
    if (await this.tableExists(tableName)) {
      await this.deleteTable(tableName)
    }
    
    await this.createTable(config)
  }
}

/**
 * CLI script to initialize the table
 * Usage: tsx src/infrastructure/init-dynamodb.ts [create|delete|describe]
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'create'
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'VetPetRegistry'
  
  const initializer = new DynamoDBTableInitializer(tableName)

  async function main() {
    try {
      switch (command) {
        case 'create':
          await initializer.createTable()
          break
        case 'delete':
          await initializer.deleteTable()
          break
        case 'describe':
          const description = await initializer.describeTable()
          console.log(JSON.stringify(description, null, 2))
          break
        case 'init-test':
          await initializer.initializeForTesting()
          break
        default:
          console.error(`Unknown command: ${command}`)
          console.log('Usage: tsx src/infrastructure/init-dynamodb.ts [create|delete|describe|init-test]')
          process.exit(1)
      }
    } catch (error) {
      console.error('Error:', error)
      process.exit(1)
    }
  }

  main()
}
