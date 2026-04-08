/**
 * Unit tests for DynamoDB table schema initialization
 * 
 * These tests verify that the VetPetRegistry table is created correctly
 * with all required Global Secondary Indexes in LocalStack.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DynamoDBTableInitializer } from '../src/infrastructure/init-dynamodb'
import { EnvironmentDetector } from '../src/infrastructure/environment-detector'

describe('DynamoDB Table Schema', () => {
  let initializer: DynamoDBTableInitializer
  const testTableName = 'VetPetRegistry-Test'

  beforeAll(async () => {
    // Ensure we're running in local environment
    const envDetector = EnvironmentDetector.getInstance()
    expect(envDetector.isLocal()).toBe(true)

    initializer = new DynamoDBTableInitializer(testTableName)
    
    // Clean up any existing test table
    if (await initializer.tableExists(testTableName)) {
      await initializer.deleteTable(testTableName)
    }
  })

  afterAll(async () => {
    // Clean up test table
    try {
      if (await initializer.tableExists(testTableName)) {
        await initializer.deleteTable(testTableName)
      }
    } catch (error) {
      console.error('Error cleaning up test table:', error)
    }
  })

  it('should create table successfully in LocalStack', async () => {
    await initializer.createTable({ tableName: testTableName })
    
    const exists = await initializer.tableExists(testTableName)
    expect(exists).toBe(true)
  })

  it('should have correct primary key schema', async () => {
    const description = await initializer.describeTable(testTableName)
    
    expect(description).toBeDefined()
    expect(description.KeySchema).toBeDefined()
    expect(description.KeySchema).toHaveLength(2)
    
    const hashKey = description.KeySchema.find((key: any) => key.KeyType === 'HASH')
    const rangeKey = description.KeySchema.find((key: any) => key.KeyType === 'RANGE')
    
    expect(hashKey).toBeDefined()
    expect(hashKey.AttributeName).toBe('PK')
    
    expect(rangeKey).toBeDefined()
    expect(rangeKey.AttributeName).toBe('SK')
  })

  it('should have all required attribute definitions', async () => {
    const description = await initializer.describeTable(testTableName)
    
    expect(description.AttributeDefinitions).toBeDefined()
    
    const attributeNames = description.AttributeDefinitions.map((attr: any) => attr.AttributeName)
    
    expect(attributeNames).toContain('PK')
    expect(attributeNames).toContain('SK')
    expect(attributeNames).toContain('GSI1PK')
    expect(attributeNames).toContain('GSI1SK')
    expect(attributeNames).toContain('GSI2PK')
    expect(attributeNames).toContain('GSI2SK')
    expect(attributeNames).toContain('GSI3PK')
    expect(attributeNames).toContain('GSI3SK')
    expect(attributeNames).toContain('GSI4PK')
    expect(attributeNames).toContain('GSI4SK')
    expect(attributeNames).toContain('GSI5PK')
    expect(attributeNames).toContain('GSI5SK')
    
    // All attributes should be strings
    description.AttributeDefinitions.forEach((attr: any) => {
      expect(attr.AttributeType).toBe('S')
    })
  })

  it('should have GSI1 configured correctly for license number lookup', async () => {
    const description = await initializer.describeTable(testTableName)
    
    expect(description.GlobalSecondaryIndexes).toBeDefined()
    
    const gsi1 = description.GlobalSecondaryIndexes.find((gsi: any) => gsi.IndexName === 'GSI1')
    
    expect(gsi1).toBeDefined()
    expect(gsi1.KeySchema).toHaveLength(2)
    
    const hashKey = gsi1.KeySchema.find((key: any) => key.KeyType === 'HASH')
    const rangeKey = gsi1.KeySchema.find((key: any) => key.KeyType === 'RANGE')
    
    expect(hashKey.AttributeName).toBe('GSI1PK')
    expect(rangeKey.AttributeName).toBe('GSI1SK')
    
    expect(gsi1.Projection.ProjectionType).toBe('ALL')
  })

  it('should have GSI2 configured correctly for species/breed search', async () => {
    const description = await initializer.describeTable(testTableName)
    
    const gsi2 = description.GlobalSecondaryIndexes.find((gsi: any) => gsi.IndexName === 'GSI2')
    
    expect(gsi2).toBeDefined()
    expect(gsi2.KeySchema).toHaveLength(2)
    
    const hashKey = gsi2.KeySchema.find((key: any) => key.KeyType === 'HASH')
    const rangeKey = gsi2.KeySchema.find((key: any) => key.KeyType === 'RANGE')
    
    expect(hashKey.AttributeName).toBe('GSI2PK')
    expect(rangeKey.AttributeName).toBe('GSI2SK')
    
    expect(gsi2.Projection.ProjectionType).toBe('ALL')
  })

  it('should have GSI3 configured correctly for owner lookup', async () => {
    const description = await initializer.describeTable(testTableName)
    
    const gsi3 = description.GlobalSecondaryIndexes.find((gsi: any) => gsi.IndexName === 'GSI3')
    
    expect(gsi3).toBeDefined()
    expect(gsi3.KeySchema).toHaveLength(2)
    
    const hashKey = gsi3.KeySchema.find((key: any) => key.KeyType === 'HASH')
    const rangeKey = gsi3.KeySchema.find((key: any) => key.KeyType === 'RANGE')
    
    expect(hashKey.AttributeName).toBe('GSI3PK')
    expect(rangeKey.AttributeName).toBe('GSI3SK')
    
    expect(gsi3.Projection.ProjectionType).toBe('ALL')
  })

  it('should have exactly 5 Global Secondary Indexes', async () => {
    const description = await initializer.describeTable(testTableName)
    
    expect(description.GlobalSecondaryIndexes).toHaveLength(5)
    
    const indexNames = description.GlobalSecondaryIndexes.map((gsi: any) => gsi.IndexName)
    expect(indexNames).toContain('GSI1')
    expect(indexNames).toContain('GSI2')
    expect(indexNames).toContain('GSI3')
    expect(indexNames).toContain('GSI4')
    expect(indexNames).toContain('GSI5')
  })

  it('should have GSI4 configured correctly for claiming code lookup', async () => {
    const description = await initializer.describeTable(testTableName)
    
    const gsi4 = description.GlobalSecondaryIndexes.find((gsi: any) => gsi.IndexName === 'GSI4')
    expect(gsi4).toBeDefined()
    
    expect(gsi4.KeySchema).toHaveLength(2)
    expect(gsi4.KeySchema[0].AttributeName).toBe('GSI4PK')
    expect(gsi4.KeySchema[0].KeyType).toBe('HASH')
    expect(gsi4.KeySchema[1].AttributeName).toBe('GSI4SK')
    expect(gsi4.KeySchema[1].KeyType).toBe('RANGE')
    
    expect(gsi4.Projection.ProjectionType).toBe('ALL')
  })

  it('should have GSI5 configured correctly for care snapshot access', async () => {
    const description = await initializer.describeTable(testTableName)
    
    const gsi5 = description.GlobalSecondaryIndexes.find((gsi: any) => gsi.IndexName === 'GSI5')
    expect(gsi5).toBeDefined()
    
    expect(gsi5.KeySchema).toHaveLength(2)
    expect(gsi5.KeySchema[0].AttributeName).toBe('GSI5PK')
    expect(gsi5.KeySchema[0].KeyType).toBe('HASH')
    expect(gsi5.KeySchema[1].AttributeName).toBe('GSI5SK')
    expect(gsi5.KeySchema[1].KeyType).toBe('RANGE')
    
    expect(gsi5.Projection.ProjectionType).toBe('ALL')
  })

  it('should use PAY_PER_REQUEST billing mode by default', async () => {
    const description = await initializer.describeTable(testTableName)
    
    expect(description.BillingModeSummary).toBeDefined()
    expect(description.BillingModeSummary.BillingMode).toBe('PAY_PER_REQUEST')
  })

  it('should handle table already exists error gracefully', async () => {
    // Table already exists from previous test
    await expect(
      initializer.createTable({ tableName: testTableName })
    ).resolves.not.toThrow()
  })

  it('should return false for non-existent table', async () => {
    const exists = await initializer.tableExists('NonExistentTable')
    expect(exists).toBe(false)
  })

  it('should initialize table for testing (delete and recreate)', async () => {
    await initializer.initializeForTesting({ tableName: testTableName })
    
    const exists = await initializer.tableExists(testTableName)
    expect(exists).toBe(true)
    
    const description = await initializer.describeTable(testTableName)
    expect(description.TableStatus).toBe('ACTIVE')
  })
})
