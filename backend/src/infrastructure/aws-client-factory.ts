import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { SNSClient } from '@aws-sdk/client-sns'
import { EnvironmentDetector } from './environment-detector'

/**
 * AWSClientFactory - Creates AWS SDK clients with environment-aware configuration
 * 
 * Automatically configures clients to use LocalStack endpoints when running locally
 * and AWS endpoints when running in the cloud.
 */
export class AWSClientFactory {
  private envDetector: EnvironmentDetector

  constructor() {
    this.envDetector = EnvironmentDetector.getInstance()
  }

  /**
   * Create a DynamoDB client configured for the current environment
   * 
   * @returns Configured DynamoDBClient instance
   */
  createDynamoDBClient(): DynamoDBClient {
    const config = this.envDetector.getConfig()
    return new DynamoDBClient(config)
  }

  /**
   * Create an S3 client configured for the current environment
   * Uses forcePathStyle for LocalStack compatibility
   * 
   * @returns Configured S3Client instance
   */
  createS3Client(): S3Client {
    const config = this.envDetector.getConfig()
    return new S3Client({
      ...config,
      forcePathStyle: this.envDetector.isLocal()  // Required for LocalStack
    })
  }

  /**
   * Create a Cognito Identity Provider client configured for the current environment
   * 
   * @returns Configured CognitoIdentityProviderClient instance
   */
  createCognitoClient(): CognitoIdentityProviderClient {
    const config = this.envDetector.getConfig()
    return new CognitoIdentityProviderClient(config)
  }

  /**
   * Create an SNS client configured for the current environment
   * 
   * @returns Configured SNSClient instance
   */
  createSNSClient(): SNSClient {
    const config = this.envDetector.getConfig()
    return new SNSClient(config)
  }
}
