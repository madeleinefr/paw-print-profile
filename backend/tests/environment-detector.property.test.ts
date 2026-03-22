import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { EnvironmentDetector } from '../src/infrastructure/environment-detector'

describe('Feature: paw-print-profile, Environment Detection Properties', () => {
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

  describe('Property 1: Local environment detection', () => {
    it('should detect local environment when IS_LOCAL=true and provide LocalStack endpoints', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('localhost', '127.0.0.1', 'localstack'),
          fc.constantFrom('4566', '4567', '8080'),
          (hostname, port) => {
            // Set up local environment
            process.env.IS_LOCAL = 'true'
            process.env.LOCALSTACK_HOSTNAME = hostname
            process.env.LOCALSTACK_PORT = port
            
            // Reset singleton to pick up new env vars
            ;(EnvironmentDetector as any).instance = undefined
            const detector = EnvironmentDetector.getInstance()

            // Verify local detection
            expect(detector.isLocal()).toBe(true)

            // Verify LocalStack endpoint is provided
            const endpoint = detector.getServiceEndpoint()
            expect(endpoint).toBeDefined()
            expect(endpoint).toBe(`http://${hostname}:${port}`)

            // Verify config includes endpoint and test credentials
            const config = detector.getConfig()
            expect(config.endpoint).toBe(`http://${hostname}:${port}`)
            expect(config.credentials).toEqual({
              accessKeyId: 'test',
              secretAccessKey: 'test'
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should detect local environment when LOCALSTACK_HOSTNAME is set', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('localhost', 'localstack', 'host.docker.internal'),
          (hostname) => {
            // Set up local environment with only LOCALSTACK_HOSTNAME
            delete process.env.IS_LOCAL
            process.env.LOCALSTACK_HOSTNAME = hostname
            delete process.env.AWS_SAM_LOCAL

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const detector = EnvironmentDetector.getInstance()

            // Verify local detection
            expect(detector.isLocal()).toBe(true)

            // Verify endpoint is provided
            const endpoint = detector.getServiceEndpoint()
            expect(endpoint).toContain(hostname)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should detect local environment when AWS_SAM_LOCAL=true', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            // Set up SAM local environment
            delete process.env.IS_LOCAL
            delete process.env.LOCALSTACK_HOSTNAME
            process.env.AWS_SAM_LOCAL = 'true'

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const detector = EnvironmentDetector.getInstance()

            // Verify local detection
            expect(detector.isLocal()).toBe(true)

            // Verify endpoint is provided
            const endpoint = detector.getServiceEndpoint()
            expect(endpoint).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 2: Cloud environment detection', () => {
    it('should detect cloud environment when no local variables are set and provide undefined endpoints', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'),
          (region) => {
            // Set up cloud environment (no local indicators)
            delete process.env.IS_LOCAL
            delete process.env.LOCALSTACK_HOSTNAME
            delete process.env.AWS_SAM_LOCAL
            process.env.AWS_REGION = region

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const detector = EnvironmentDetector.getInstance()

            // Verify cloud detection
            expect(detector.isLocal()).toBe(false)

            // Verify no endpoint is provided (defaults to AWS)
            const endpoint = detector.getServiceEndpoint()
            expect(endpoint).toBeUndefined()

            // Verify config does not include endpoint or test credentials
            const config = detector.getConfig()
            expect(config.endpoint).toBeUndefined()
            expect(config.credentials).toBeUndefined()
            expect(config.region).toBe(region)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should use default region when AWS_REGION is not set in cloud environment', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            // Set up cloud environment without region
            delete process.env.IS_LOCAL
            delete process.env.LOCALSTACK_HOSTNAME
            delete process.env.AWS_SAM_LOCAL
            delete process.env.AWS_REGION

            // Reset singleton
            ;(EnvironmentDetector as any).instance = undefined
            const detector = EnvironmentDetector.getInstance()

            // Verify cloud detection
            expect(detector.isLocal()).toBe(false)

            // Verify default region is used
            expect(detector.getRegion()).toBe('us-east-1')
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
