/**
 * Property-based tests for ErrorHandler and custom error classes
 *
 * Property 45: Error logging — all errors produce structured JSON log entries
 * Property 46: API error responses — errors map to correct HTTP status codes
 * Property 47: Structured logging format — log entries contain required fields
 *
 * Validates: Requirements [NFR-OPS-02], [NFR-USA-04]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ErrorHandler,
  ErrorLogEntry,
} from '../src/errors/index'
import { ValidationException } from '../src/validation/validators'

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary non-empty message string */
const messageArb = fc.stringMatching(/^[a-zA-Z0-9 .,!?'-]{1,100}$/)

/** Arbitrary field name for validation details */
const fieldNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/)

/** Arbitrary validation detail entry */
const validationDetailArb = fc.record({
  field: fieldNameArb,
  message: messageArb,
})

/** Arbitrary non-empty array of validation details */
const validationDetailsArb = fc.array(validationDetailArb, { minLength: 1, maxLength: 10 })

/** Arbitrary context object for error handler */
const contextArb = fc.record({
  handler: fc.stringMatching(/^[a-zA-Z]{1,30}$/),
  petId: fc.stringMatching(/^[a-zA-Z0-9-]{1,36}$/),
})

/** Arbitrary CORS headers */
const corsHeadersArb = fc.constant({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Suppress console.error output during tests */
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** Create a fake AWS SDK-style error with a specific name */
function makeNamedError(name: string, message: string = 'aws error'): Error {
  const err = new Error(message)
  err.name = name
  return err
}

/** Create a legacy ValidationException */
function makeLegacyValidationException(
  details: Array<{ field: string; message: string }>
): ValidationException {
  return new ValidationException(details)
}

// ── Property 45: Error logging ───────────────────────────────────────────────

describe('[NFR-OPS-02] Property 45: Error logging', () => {
  /**
   * For any AppError subclass, ErrorHandler.handle() emits a structured
   * JSON string to console.error containing the error code and message.
   */
  it('all AppError subclasses produce a structured JSON log line', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        const errors = [
          new ValidationError(msg),
          new AuthenticationError(msg),
          new AuthorizationError(msg),
          new NotFoundError(msg),
        ]

        for (const error of errors) {
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
          ErrorHandler.handle(error)

          expect(spy).toHaveBeenCalledOnce()
          const logLine = spy.mock.calls[0][0] as string
          const parsed = JSON.parse(logLine)

          expect(parsed.code).toBe(error.code)
          expect(parsed.message).toBe(msg)
          spy.mockRestore()
        }
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any generic Error, ErrorHandler.handle() still emits a structured
   * JSON log line with code INTERNAL_ERROR.
   */
  it('generic errors produce a structured JSON log line with INTERNAL_ERROR', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        ErrorHandler.handle(new Error(msg))

        expect(spy).toHaveBeenCalledOnce()
        const parsed = JSON.parse(spy.mock.calls[0][0] as string)
        expect(parsed.code).toBe('INTERNAL_ERROR')
        spy.mockRestore()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * For any non-Error thrown value (string, number, object),
   * ErrorHandler.handle() still produces a valid log entry.
   */
  it('non-Error thrown values produce a valid log entry', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
        (thrown) => {
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
          const { logEntry } = ErrorHandler.handle(thrown)

          expect(spy).toHaveBeenCalledOnce()
          expect(logEntry.code).toBe('INTERNAL_ERROR')
          expect(logEntry.statusCode).toBe(500)
          spy.mockRestore()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * When context is provided, the log entry includes it.
   * When context is omitted, the log entry does not have a context field.
   */
  it('context is included in log entry when provided and absent when omitted', () => {
    fc.assert(
      fc.property(messageArb, contextArb, (msg, ctx) => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

        // With context
        const { logEntry: withCtx } = ErrorHandler.handle(new Error(msg), ctx)
        expect(withCtx.context).toEqual(ctx)

        spy.mockRestore()
        const spy2 = vi.spyOn(console, 'error').mockImplementation(() => {})

        // Without context
        const { logEntry: withoutCtx } = ErrorHandler.handle(new Error(msg))
        expect(withoutCtx.context).toBeUndefined()

        spy2.mockRestore()
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property 46: API error responses ─────────────────────────────────────────

describe('[NFR-USA-04] Property 46: API error responses', () => {
  /**
   * ValidationError always maps to 400.
   */
  it('ValidationError maps to HTTP 400', () => {
    fc.assert(
      fc.property(messageArb, validationDetailsArb, (msg, details) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { statusCode, body } = ErrorHandler.handle(new ValidationError(msg, details))

        expect(statusCode).toBe(400)
        expect((body.error as any).code).toBe('VALIDATION_ERROR')
        expect((body.error as any).details).toEqual(details)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * AuthenticationError always maps to 401.
   */
  it('AuthenticationError maps to HTTP 401', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { statusCode, body } = ErrorHandler.handle(new AuthenticationError(msg))

        expect(statusCode).toBe(401)
        expect((body.error as any).code).toBe('AUTHENTICATION_ERROR')
      }),
      { numRuns: 100 }
    )
  })

  /**
   * AuthorizationError always maps to 403.
   */
  it('AuthorizationError maps to HTTP 403', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { statusCode, body } = ErrorHandler.handle(new AuthorizationError(msg))

        expect(statusCode).toBe(403)
        expect((body.error as any).code).toBe('AUTHORIZATION_ERROR')
      }),
      { numRuns: 100 }
    )
  })

  /**
   * NotFoundError always maps to 404.
   */
  it('NotFoundError maps to HTTP 404', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { statusCode, body } = ErrorHandler.handle(new NotFoundError(msg))

        expect(statusCode).toBe(404)
        expect((body.error as any).code).toBe('NOT_FOUND')
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Legacy ValidationException maps to 400 with details preserved.
   */
  it('legacy ValidationException maps to HTTP 400 with details', () => {
    fc.assert(
      fc.property(validationDetailsArb, (details) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const exception = makeLegacyValidationException(details)
        const { statusCode, body } = ErrorHandler.handle(exception)

        expect(statusCode).toBe(400)
        expect((body.error as any).code).toBe('VALIDATION_ERROR')
        expect((body.error as any).details).toEqual(details)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * AWS ResourceNotFoundException maps to 404.
   */
  it('ResourceNotFoundException maps to HTTP 404', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { statusCode, body } = ErrorHandler.handle(
      makeNamedError('ResourceNotFoundException')
    )

    expect(statusCode).toBe(404)
    expect((body.error as any).code).toBe('NOT_FOUND')
  })

  /**
   * AWS ConditionalCheckFailedException maps to 409.
   */
  it('ConditionalCheckFailedException maps to HTTP 409', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { statusCode, body } = ErrorHandler.handle(
      makeNamedError('ConditionalCheckFailedException')
    )

    expect(statusCode).toBe(409)
    expect((body.error as any).code).toBe('CONFLICT')
  })

  /**
   * JSON SyntaxError maps to 400 with INVALID_JSON code.
   */
  it('JSON SyntaxError maps to HTTP 400 with INVALID_JSON', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const jsonError = new SyntaxError('Unexpected token in JSON at position 0')
    const { statusCode, body } = ErrorHandler.handle(jsonError)

    expect(statusCode).toBe(400)
    expect((body.error as any).code).toBe('INVALID_JSON')
  })

  /**
   * Unknown/generic errors always map to 500 and never leak internal details.
   */
  it('generic errors map to HTTP 500 without leaking internal details', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { statusCode, body } = ErrorHandler.handle(new Error(msg))

        expect(statusCode).toBe(500)
        expect((body.error as any).code).toBe('INTERNAL_ERROR')
        // The original message must NOT appear in the response body
        expect((body.error as any).message).toBe('An unexpected error occurred')
        expect((body.error as any).message).not.toBe(msg)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * The response body always has the shape { error: { code, message } }.
   */
  it('response body always has consistent { error: { code, message } } shape', () => {
    const errorFactories = [
      () => new ValidationError('v'),
      () => new AuthenticationError('a'),
      () => new AuthorizationError('z'),
      () => new NotFoundError('n'),
      () => new Error('generic'),
      () => makeNamedError('ResourceNotFoundException'),
      () => 'string throw',
      () => 42,
      () => null,
    ]

    for (const factory of errorFactories) {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { body } = ErrorHandler.handle(factory())

      expect(body).toHaveProperty('error')
      const errorObj = body.error as any
      expect(typeof errorObj.code).toBe('string')
      expect(errorObj.code.length).toBeGreaterThan(0)
      expect(typeof errorObj.message).toBe('string')
      expect(errorObj.message.length).toBeGreaterThan(0)
    }
  })
})

// ── Property 47: Structured logging format ───────────────────────────────────

describe('[NFR-OPS-02] Property 47: Structured logging format', () => {
  /**
   * Every log entry contains timestamp, level, code, message, and statusCode.
   */
  it('every log entry contains all required fields', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        const errors: unknown[] = [
          new ValidationError(msg),
          new AuthenticationError(msg),
          new AuthorizationError(msg),
          new NotFoundError(msg),
          new Error(msg),
          msg, // non-Error throw
        ]

        for (const error of errors) {
          vi.spyOn(console, 'error').mockImplementation(() => {})
          const { logEntry } = ErrorHandler.handle(error)

          expect(logEntry).toHaveProperty('timestamp')
          expect(logEntry).toHaveProperty('level')
          expect(logEntry).toHaveProperty('code')
          expect(logEntry).toHaveProperty('message')
          expect(logEntry).toHaveProperty('statusCode')
        }
      }),
      { numRuns: 100 }
    )
  })

  /**
   * The timestamp is a valid ISO 8601 string.
   */
  it('timestamp is a valid ISO 8601 string', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logEntry } = ErrorHandler.handle(new Error(msg))

        const parsed = new Date(logEntry.timestamp)
        expect(parsed.toISOString()).toBe(logEntry.timestamp)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Client errors (4xx) are logged at 'warn' level;
   * server errors (5xx) are logged at 'error' level.
   */
  it('4xx errors log at warn level, 5xx errors log at error level', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})

        // 4xx → warn
        const { logEntry: warnEntry } = ErrorHandler.handle(new ValidationError(msg))
        expect(warnEntry.level).toBe('warn')

        // 5xx → error
        const { logEntry: errorEntry } = ErrorHandler.handle(new Error(msg))
        expect(errorEntry.level).toBe('error')
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Error instances include a stack trace in the log entry.
   */
  it('Error instances include a stack trace in the log entry', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logEntry } = ErrorHandler.handle(new NotFoundError(msg))

        expect(logEntry.stack).toBeDefined()
        expect(typeof logEntry.stack).toBe('string')
        expect(logEntry.stack!.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Non-Error thrown values do NOT include a stack trace.
   */
  it('non-Error thrown values do not include a stack trace', () => {
    fc.assert(
      fc.property(fc.string(), (thrown) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logEntry } = ErrorHandler.handle(thrown)

        expect(logEntry.stack).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  /**
   * The log line emitted to console.error is valid JSON that can be parsed
   * back into an ErrorLogEntry.
   */
  it('console.error output is valid parseable JSON', () => {
    fc.assert(
      fc.property(messageArb, (msg) => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        ErrorHandler.handle(new AuthorizationError(msg))

        const logLine = spy.mock.calls[0][0] as string
        const parsed: ErrorLogEntry = JSON.parse(logLine)

        expect(parsed.timestamp).toBeDefined()
        expect(parsed.level).toBe('warn')
        expect(parsed.code).toBe('AUTHORIZATION_ERROR')
        expect(parsed.statusCode).toBe(403)
        spy.mockRestore()
      }),
      { numRuns: 100 }
    )
  })
})

// ── Property: toResponse() produces complete API Gateway responses ────────────

describe('[NFR-USA-04] ErrorHandler.toResponse()', () => {
  /**
   * toResponse() returns a complete API Gateway response with statusCode,
   * headers, and a JSON-parseable body string.
   */
  it('produces a complete API Gateway response with headers and JSON body', () => {
    fc.assert(
      fc.property(messageArb, corsHeadersArb, (msg, headers) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const response = ErrorHandler.toResponse(new NotFoundError(msg), headers)

        expect(response.statusCode).toBe(404)
        expect(response.headers).toEqual(headers)

        const parsed = JSON.parse(response.body)
        expect(parsed.error.code).toBe('NOT_FOUND')
        expect(parsed.error.message).toBe(msg)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * toResponse() preserves CORS headers exactly as provided.
   */
  it('preserves CORS headers exactly as provided', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.stringMatching(/^[A-Za-z-]{1,30}$/),
          fc.stringMatching(/^[a-zA-Z0-9*,. ]{1,50}$/),
          { minKeys: 1, maxKeys: 5 }
        ),
        (headers) => {
          vi.spyOn(console, 'error').mockImplementation(() => {})
          const response = ErrorHandler.toResponse(new Error('test'), headers)

          expect(response.headers).toEqual(headers)
        }
      ),
      { numRuns: 100 }
    )
  })
})
