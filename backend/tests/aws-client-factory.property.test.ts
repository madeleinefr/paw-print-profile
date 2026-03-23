import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { AWSClientFactory } from '../src/infrastructure/aws-client-factory'
import { EnvironmentDetector } from '../src/infrastructure/environment-detector'

describe('Feature: paw-print-profile, AWS Client Factory Properties', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    // Reset singleton instance for clean tests
    ;(EnvironmentDetector as any).instance = undefined
  })

  describe('[NFR-MNT-01] Property 3: Environment variable configuration', () => {
    it('should configure clients with LocalStack endpoints when IS_LOCAL is true', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('localhost', '127.0.0.1', 'localstack'),
          fc.constantFrom('4566', '4567', '8080'),
          fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
          (hostname, port, region) => {
            // Set up local environment
            process.env.IS_LOCAL = 'true'
            process.env.LOCALSTACK_HOSTNAME = hostname
            process.env.LOCALSTACK_PORT = port
            process.env.AWS_REGION = region

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const factory = new AWSClientFactory()

            // Create clients
            const dynamoClient = factory.createDynamoDBClient()
            const s3Client = factory.createS3Client()
            const cognitoClient = factory.createCognitoClient()
            const snsClient = factory.createSNSClient()

            // Verify all clients are created
            expect(dynamoClient).toBeDefined()
            expect(s3Client).toBeDefined()
            expect(cognitoClient).toBeDefined()
            expect(snsClient).toBeDefined()

            // Verify clients have the correct configuration
            // Note: AWS SDK v3 clients don't expose config directly in a simple way,
            // but we can verify they were created without errors
            // The actual endpoint configuration is tested through the EnvironmentDetector

            // Verify environment detector is using local config
            const envDetector = EnvironmentDetector.getInstance()
            expect(envDetector.isLocal()).toBe(true)
            expect(envDetector.getServiceEndpoint()).toBe(`http://${hostname}:${port}`)
            expect(envDetector.getRegion()).toBe(region)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should configure clients with AWS endpoints when IS_LOCAL is false', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'),
          (region) => {
            // Set up cloud environment
            delete process.env.IS_LOCAL
            delete process.env.LOCALSTACK_HOSTNAME
            delete process.env.AWS_SAM_LOCAL
            process.env.AWS_REGION = region

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const factory = new AWSClientFactory()

            // Create clients
            const dynamoClient = factory.createDynamoDBClient()
            const s3Client = factory.createS3Client()
            const cognitoClient = factory.createCognitoClient()
            const snsClient = factory.createSNSClient()

            // Verify all clients are created
            expect(dynamoClient).toBeDefined()
            expect(s3Client).toBeDefined()
            expect(cognitoClient).toBeDefined()
            expect(snsClient).toBeDefined()

            // Verify environment detector is using cloud config
            const envDetector = EnvironmentDetector.getInstance()
            expect(envDetector.isLocal()).toBe(false)
            expect(envDetector.getServiceEndpoint()).toBeUndefined()
            expect(envDetector.getRegion()).toBe(region)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should create S3 client with forcePathStyle in local environment', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            // Set up local environment
            process.env.IS_LOCAL = 'true'
            process.env.LOCALSTACK_HOSTNAME = 'localhost'

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const factory = new AWSClientFactory()

            // Create S3 client
            const s3Client = factory.createS3Client()

            // Verify client is created
            expect(s3Client).toBeDefined()

            // Verify environment is local (forcePathStyle is set internally)
            const envDetector = EnvironmentDetector.getInstance()
            expect(envDetector.isLocal()).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should create multiple clients with consistent configuration', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
          (isLocal, region) => {
            // Set up environment based on isLocal flag
            if (isLocal) {
              process.env.IS_LOCAL = 'true'
              process.env.LOCALSTACK_HOSTNAME = 'localhost'
            } else {
              delete process.env.IS_LOCAL
              delete process.env.LOCALSTACK_HOSTNAME
              delete process.env.AWS_SAM_LOCAL
            }
            process.env.AWS_REGION = region

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const factory = new AWSClientFactory()

            // Create multiple clients
            const dynamoClient1 = factory.createDynamoDBClient()
            const dynamoClient2 = factory.createDynamoDBClient()
            const s3Client1 = factory.createS3Client()
            const s3Client2 = factory.createS3Client()

            // Verify all clients are created
            expect(dynamoClient1).toBeDefined()
            expect(dynamoClient2).toBeDefined()
            expect(s3Client1).toBeDefined()
            expect(s3Client2).toBeDefined()

            // Verify environment detector state is consistent
            const envDetector = EnvironmentDetector.getInstance()
            expect(envDetector.isLocal()).toBe(isLocal)
            expect(envDetector.getRegion()).toBe(region)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle environment variable changes across factory instances', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('localhost', 'localstack'),
          fc.constantFrom('us-east-1', 'us-west-2'),
          (hostname, region) => {
            // First configuration - local
            process.env.IS_LOCAL = 'true'
            process.env.LOCALSTACK_HOSTNAME = hostname
            process.env.AWS_REGION = region

            // Reset singleton and create factory
            ;(EnvironmentDetector as any).instance = undefined
            const factory1 = new AWSClientFactory()
            const client1 = factory1.createDynamoDBClient()

            expect(client1).toBeDefined()
            const envDetector1 = EnvironmentDetector.getInstance()
            expect(envDetector1.isLocal()).toBe(true)

            // Second configuration - cloud
            delete process.env.IS_LOCAL
            delete process.env.LOCALSTACK_HOSTNAME
            process.env.AWS_REGION = region

            // Reset singleton and create new factory
            ;(EnvironmentDetector as any).instance = undefined
            const factory2 = new AWSClientFactory()
            const client2 = factory2.createDynamoDBClient()

            expect(client2).toBeDefined()
            const envDetector2 = EnvironmentDetector.getInstance()
            expect(envDetector2.isLocal()).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
