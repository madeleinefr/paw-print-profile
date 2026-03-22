/**
 * EnvironmentDetector - Automatically detects whether the application is running
 * in a local development environment (with LocalStack) or in the cloud (AWS).
 * 
 * This enables seamless switching between local and cloud environments without
 * code changes.
 */
export class EnvironmentDetector {
  private static instance: EnvironmentDetector

  private constructor() {}

  /**
   * Get the singleton instance of EnvironmentDetector
   */
  static getInstance(): EnvironmentDetector {
    if (!EnvironmentDetector.instance) {
      EnvironmentDetector.instance = new EnvironmentDetector()
    }
    return EnvironmentDetector.instance
  }

  /**
   * Determine if the application is running in a local environment
   * Checks for IS_LOCAL, LOCALSTACK_HOSTNAME, or AWS_SAM_LOCAL environment variables
   * 
   * @returns true if running locally, false if running in cloud
   */
  isLocal(): boolean {
    return (
      process.env.IS_LOCAL === 'true' ||
      !!process.env.LOCALSTACK_HOSTNAME ||
      process.env.AWS_SAM_LOCAL === 'true'
    )
  }

  /**
   * Get the service endpoint for AWS services
   * Returns LocalStack endpoint if running locally, undefined for cloud (uses default AWS endpoints)
   * 
   * @param service - The AWS service name (optional, for future service-specific endpoints)
   * @returns The endpoint URL for LocalStack, or undefined for AWS
   */
  getServiceEndpoint(service?: string): string | undefined {
    if (!this.isLocal()) {
      return undefined  // Use default AWS endpoints
    }

    const localstackHost = process.env.LOCALSTACK_HOSTNAME || 'localhost'
    const localstackPort = process.env.LOCALSTACK_PORT || '4566'

    return `http://${localstackHost}:${localstackPort}`
  }

  /**
   * Get the AWS region to use
   * 
   * @returns The AWS region from environment variable or default to us-east-1
   */
  getRegion(): string {
    return process.env.AWS_REGION || 'us-east-1'
  }

  /**
   * Get the complete configuration object for AWS SDK clients
   * Includes region, endpoint (if local), and credentials (if local)
   * 
   * @returns Configuration object for AWS SDK v3 clients
   */
  getConfig() {
    const config: any = {
      region: this.getRegion()
    }

    if (this.isLocal()) {
      config.endpoint = this.getServiceEndpoint('default')
      config.credentials = {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    }

    return config
  }
}
