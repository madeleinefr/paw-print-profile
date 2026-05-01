/**
 * Unit tests for error handling scenarios
 *
 * Tests concrete, realistic error scenarios to verify:
 * - Validation errors return 400 with field details
 * - Authentication errors return 401
 * - Authorization errors return 403
 * - Not found errors return 404
 *
 * Requirements: [NFR-OPS-02], [NFR-USA-04]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ErrorHandler,
} from '../src/errors/index'
import { ValidationException } from '../src/validation/validators'

// Suppress console.error output during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── Custom Error Class Construction ─────────────────────────────────────────

describe('Custom error classes', () => {
  describe('ValidationError', () => {
    it('has statusCode 400 and code VALIDATION_ERROR', () => {
      const error = new ValidationError()
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.name).toBe('ValidationError')
    })

    it('uses default message when none provided', () => {
      const error = new ValidationError()
      expect(error.message).toBe('Validation failed')
    })

    it('accepts custom message and field details', () => {
      const details = [
        { field: 'name', message: 'Name is required' },
        { field: 'age', message: 'Age must be a non-negative integer' },
      ]
      const error = new ValidationError('Pet data invalid', details)
      expect(error.message).toBe('Pet data invalid')
      expect(error.details).toEqual(details)
    })

    it('details are undefined when not provided', () => {
      const error = new ValidationError('Missing fields')
      expect(error.details).toBeUndefined()
    })

    it('is an instance of AppError and Error', () => {
      const error = new ValidationError()
      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(Error)
    })

    it('has a stack trace', () => {
      const error = new ValidationError()
      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('ValidationError')
    })
  })

  describe('AuthenticationError', () => {
    it('has statusCode 401 and code AUTHENTICATION_ERROR', () => {
      const error = new AuthenticationError()
      expect(error.statusCode).toBe(401)
      expect(error.code).toBe('AUTHENTICATION_ERROR')
      expect(error.name).toBe('AuthenticationError')
    })

    it('uses default message when none provided', () => {
      const error = new AuthenticationError()
      expect(error.message).toBe('Authentication required')
    })

    it('accepts custom message', () => {
      const error = new AuthenticationError('Token expired')
      expect(error.message).toBe('Token expired')
    })

    it('is an instance of AppError and Error', () => {
      const error = new AuthenticationError()
      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('AuthorizationError', () => {
    it('has statusCode 403 and code AUTHORIZATION_ERROR', () => {
      const error = new AuthorizationError()
      expect(error.statusCode).toBe(403)
      expect(error.code).toBe('AUTHORIZATION_ERROR')
      expect(error.name).toBe('AuthorizationError')
    })

    it('uses default message when none provided', () => {
      const error = new AuthorizationError()
      expect(error.message).toBe('Access denied')
    })

    it('accepts custom message', () => {
      const error = new AuthorizationError('Only veterinarians can create pet profiles')
      expect(error.message).toBe('Only veterinarians can create pet profiles')
    })

    it('is an instance of AppError and Error', () => {
      const error = new AuthorizationError()
      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('NotFoundError', () => {
    it('has statusCode 404 and code NOT_FOUND', () => {
      const error = new NotFoundError()
      expect(error.statusCode).toBe(404)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.name).toBe('NotFoundError')
    })

    it('uses default message when none provided', () => {
      const error = new NotFoundError()
      expect(error.message).toBe('Resource not found')
    })

    it('accepts custom message', () => {
      const error = new NotFoundError('Pet pet-456 not found')
      expect(error.message).toBe('Pet pet-456 not found')
    })

    it('is an instance of AppError and Error', () => {
      const error = new NotFoundError()
      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(Error)
    })
  })
})

// ── Validation errors return 400 with field details ─────────────────────────

describe('Validation errors return 400 with field details', () => {
  it('returns 400 with field-level details for missing pet name', () => {
    const details = [{ field: 'name', message: 'Name is required' }]
    const { statusCode, body } = ErrorHandler.handle(new ValidationError('Validation failed', details))

    expect(statusCode).toBe(400)
    expect((body.error as any).code).toBe('VALIDATION_ERROR')
    expect((body.error as any).details).toEqual(details)
  })

  it('returns 400 with multiple field errors', () => {
    const details = [
      { field: 'name', message: 'Name is required' },
      { field: 'species', message: 'Species is required' },
      { field: 'age', message: 'Age must be a non-negative integer' },
    ]
    const { statusCode, body } = ErrorHandler.handle(new ValidationError('Validation failed', details))

    expect(statusCode).toBe(400)
    expect((body.error as any).details).toHaveLength(3)
    expect((body.error as any).details[0].field).toBe('name')
    expect((body.error as any).details[1].field).toBe('species')
    expect((body.error as any).details[2].field).toBe('age')
  })

  it('returns 400 without details when none provided', () => {
    const { statusCode, body } = ErrorHandler.handle(new ValidationError('Invalid input'))

    expect(statusCode).toBe(400)
    expect((body.error as any).code).toBe('VALIDATION_ERROR')
    expect((body.error as any).details).toBeUndefined()
  })

  it('handles legacy ValidationException with field details', () => {
    const details = [
      { field: 'ownerEmail', message: 'Invalid email format' },
      { field: 'ownerPhone', message: 'Phone must have at least 10 digits' },
    ]
    const exception = new ValidationException(details)
    const { statusCode, body } = ErrorHandler.handle(exception)

    expect(statusCode).toBe(400)
    expect((body.error as any).code).toBe('VALIDATION_ERROR')
    expect((body.error as any).details).toEqual(details)
  })

  it('handles JSON parse error as 400', () => {
    const jsonError = new SyntaxError('Unexpected token < in JSON at position 0')
    const { statusCode, body } = ErrorHandler.handle(jsonError)

    expect(statusCode).toBe(400)
    expect((body.error as any).code).toBe('INVALID_JSON')
    expect((body.error as any).message).toBe('Request body contains invalid JSON')
  })
})

// ── Authentication errors return 401 ────────────────────────────────────────

describe('Authentication errors return 401', () => {
  it('returns 401 for missing authentication', () => {
    const { statusCode, body } = ErrorHandler.handle(new AuthenticationError())

    expect(statusCode).toBe(401)
    expect((body.error as any).code).toBe('AUTHENTICATION_ERROR')
    expect((body.error as any).message).toBe('Authentication required')
  })

  it('returns 401 for expired token', () => {
    const { statusCode, body } = ErrorHandler.handle(new AuthenticationError('Token expired'))

    expect(statusCode).toBe(401)
    expect((body.error as any).message).toBe('Token expired')
  })

  it('returns 401 for invalid token', () => {
    const { statusCode, body } = ErrorHandler.handle(new AuthenticationError('Invalid JWT token'))

    expect(statusCode).toBe(401)
    expect((body.error as any).message).toBe('Invalid JWT token')
  })
})

// ── Authorization errors return 403 ─────────────────────────────────────────

describe('Authorization errors return 403', () => {
  it('returns 403 for owner trying to create medical profile', () => {
    const { statusCode, body } = ErrorHandler.handle(
      new AuthorizationError('Only veterinarians can create pet profiles')
    )

    expect(statusCode).toBe(403)
    expect((body.error as any).code).toBe('AUTHORIZATION_ERROR')
    expect((body.error as any).message).toBe('Only veterinarians can create pet profiles')
  })

  it('returns 403 for vet trying to claim a profile', () => {
    const { statusCode, body } = ErrorHandler.handle(
      new AuthorizationError('Only pet owners can claim profiles')
    )

    expect(statusCode).toBe(403)
    expect((body.error as any).message).toBe('Only pet owners can claim profiles')
  })

  it('returns 403 for accessing another clinic\'s pets', () => {
    const { statusCode, body } = ErrorHandler.handle(
      new AuthorizationError('You can only access pets from your own clinic')
    )

    expect(statusCode).toBe(403)
    expect((body.error as any).message).toBe('You can only access pets from your own clinic')
  })

  it('returns 403 with default message', () => {
    const { statusCode, body } = ErrorHandler.handle(new AuthorizationError())

    expect(statusCode).toBe(403)
    expect((body.error as any).message).toBe('Access denied')
  })
})

// ── Not found errors return 404 ─────────────────────────────────────────────

describe('Not found errors return 404', () => {
  it('returns 404 for missing pet', () => {
    const { statusCode, body } = ErrorHandler.handle(new NotFoundError('Pet pet-456 not found'))

    expect(statusCode).toBe(404)
    expect((body.error as any).code).toBe('NOT_FOUND')
    expect((body.error as any).message).toBe('Pet pet-456 not found')
  })

  it('returns 404 for missing clinic', () => {
    const { statusCode, body } = ErrorHandler.handle(new NotFoundError('Clinic clinic-123 not found'))

    expect(statusCode).toBe(404)
    expect((body.error as any).message).toBe('Clinic clinic-123 not found')
  })

  it('returns 404 for AWS ResourceNotFoundException', () => {
    const awsError = new Error('Requested resource not found')
    awsError.name = 'ResourceNotFoundException'
    const { statusCode, body } = ErrorHandler.handle(awsError)

    expect(statusCode).toBe(404)
    expect((body.error as any).code).toBe('NOT_FOUND')
  })

  it('returns 404 with default message', () => {
    const { statusCode, body } = ErrorHandler.handle(new NotFoundError())

    expect(statusCode).toBe(404)
    expect((body.error as any).message).toBe('Resource not found')
  })
})

// ── Internal server errors (500) ────────────────────────────────────────────

describe('Internal server errors return 500', () => {
  it('returns 500 for unexpected Error and hides internal message', () => {
    const { statusCode, body } = ErrorHandler.handle(new Error('Database connection failed'))

    expect(statusCode).toBe(500)
    expect((body.error as any).code).toBe('INTERNAL_ERROR')
    expect((body.error as any).message).toBe('An unexpected error occurred')
    // Must NOT leak the internal error message
    expect((body.error as any).message).not.toContain('Database')
  })

  it('returns 500 for thrown string', () => {
    const { statusCode, body } = ErrorHandler.handle('something went wrong')

    expect(statusCode).toBe(500)
    expect((body.error as any).code).toBe('INTERNAL_ERROR')
  })

  it('returns 500 for thrown null', () => {
    const { statusCode, body } = ErrorHandler.handle(null)

    expect(statusCode).toBe(500)
    expect((body.error as any).code).toBe('INTERNAL_ERROR')
  })

  it('returns 500 for thrown undefined', () => {
    const { statusCode, body } = ErrorHandler.handle(undefined)

    expect(statusCode).toBe(500)
    expect((body.error as any).code).toBe('INTERNAL_ERROR')
  })
})

// ── Conflict errors (409) ───────────────────────────────────────────────────

describe('Conflict errors return 409', () => {
  it('returns 409 for ConditionalCheckFailedException', () => {
    const awsError = new Error('The conditional request failed')
    awsError.name = 'ConditionalCheckFailedException'
    const { statusCode, body } = ErrorHandler.handle(awsError)

    expect(statusCode).toBe(409)
    expect((body.error as any).code).toBe('CONFLICT')
  })
})

// ── Structured log entry content ────────────────────────────────────────────

describe('Structured log entries', () => {
  it('includes handler context in log entry', () => {
    const context = { handler: 'PetCoOnboardingHandler', petId: 'pet-456' }
    const { logEntry } = ErrorHandler.handle(new NotFoundError('Pet not found'), context)

    expect(logEntry.context).toEqual(context)
    expect(logEntry.context!.handler).toBe('PetCoOnboardingHandler')
    expect(logEntry.context!.petId).toBe('pet-456')
  })

  it('log entry has warn level for 4xx errors', () => {
    const { logEntry: v } = ErrorHandler.handle(new ValidationError())
    const { logEntry: a } = ErrorHandler.handle(new AuthenticationError())
    const { logEntry: z } = ErrorHandler.handle(new AuthorizationError())
    const { logEntry: n } = ErrorHandler.handle(new NotFoundError())

    expect(v.level).toBe('warn')
    expect(a.level).toBe('warn')
    expect(z.level).toBe('warn')
    expect(n.level).toBe('warn')
  })

  it('log entry has error level for 5xx errors', () => {
    const { logEntry } = ErrorHandler.handle(new Error('unexpected'))

    expect(logEntry.level).toBe('error')
  })

  it('log entry timestamp is a valid ISO 8601 date', () => {
    const { logEntry } = ErrorHandler.handle(new Error('test'))
    const parsed = new Date(logEntry.timestamp)

    expect(parsed.toISOString()).toBe(logEntry.timestamp)
  })

  it('log entry includes stack trace for Error instances', () => {
    const { logEntry } = ErrorHandler.handle(new ValidationError('bad input'))

    expect(logEntry.stack).toBeDefined()
    expect(logEntry.stack).toContain('ValidationError')
  })

  it('log entry omits stack trace for non-Error throws', () => {
    const { logEntry } = ErrorHandler.handle('string error')

    expect(logEntry.stack).toBeUndefined()
  })

  it('emits valid JSON to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ErrorHandler.handle(new AuthorizationError('forbidden'))

    expect(spy).toHaveBeenCalledOnce()
    const logLine = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(logLine)

    expect(parsed.code).toBe('AUTHORIZATION_ERROR')
    expect(parsed.statusCode).toBe(403)
    expect(parsed.message).toBe('forbidden')
    spy.mockRestore()
  })
})

// ── toResponse() integration ────────────────────────────────────────────────

describe('ErrorHandler.toResponse()', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  }

  it('returns complete API Gateway response for validation error', () => {
    const details = [{ field: 'name', message: 'Name is required' }]
    const response = ErrorHandler.toResponse(new ValidationError('Invalid', details), corsHeaders)

    expect(response.statusCode).toBe(400)
    expect(response.headers).toEqual(corsHeaders)

    const parsed = JSON.parse(response.body)
    expect(parsed.error.code).toBe('VALIDATION_ERROR')
    expect(parsed.error.details).toEqual(details)
  })

  it('returns complete API Gateway response for 500 error', () => {
    const response = ErrorHandler.toResponse(new Error('db crash'), corsHeaders)

    expect(response.statusCode).toBe(500)
    expect(response.headers).toEqual(corsHeaders)

    const parsed = JSON.parse(response.body)
    expect(parsed.error.code).toBe('INTERNAL_ERROR')
    expect(parsed.error.message).not.toContain('db crash')
  })

  it('passes context through to log entry', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ErrorHandler.toResponse(
      new NotFoundError(),
      corsHeaders,
      { handler: 'ClinicHandler', clinicId: 'clinic-123' }
    )

    const logLine = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(logLine)
    expect(parsed.context.handler).toBe('ClinicHandler')
    expect(parsed.context.clinicId).toBe('clinic-123')
    spy.mockRestore()
  })
})
