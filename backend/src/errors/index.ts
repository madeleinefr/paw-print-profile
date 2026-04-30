/**
 * Custom Error Classes and ErrorHandler for Paw Print Profile
 *
 * Provides a centralized error handling strategy with:
 * - Custom error classes mapped to HTTP status codes
 * - Structured JSON logging (timestamp, context, stack trace)
 * - Consistent API error response formatting
 *
 * Requirements: [NFR-OPS-02], [NFR-USA-04]
 */

// ── Custom Error Classes ─────────────────────────────────────────────────────

/**
 * Base class for all application errors.
 * Carries an error code and HTTP status code so the ErrorHandler can
 * produce a consistent API response without instanceof chains.
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string

  constructor(message: string, statusCode: number, code: string) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    // Restore prototype chain broken by extending built-ins
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * 400 – The request payload failed validation.
 * Optionally carries per-field details so the client can highlight
 * individual form fields.
 */
export class ValidationError extends AppError {
  public readonly details?: Array<{ field: string; message: string }>

  constructor(
    message: string = 'Validation failed',
    details?: Array<{ field: string; message: string }>
  ) {
    super(message, 400, 'VALIDATION_ERROR')
    this.details = details
  }
}

/**
 * 401 – The caller is not authenticated (missing or invalid token).
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR')
  }
}

/**
 * 403 – The caller is authenticated but lacks permission.
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR')
  }
}

/**
 * 404 – The requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND')
  }
}

// ── API Gateway Response Helper ───────────────────────────────────────────────

/**
 * Shape returned by ErrorHandler.toResponse() — ready to return from a
 * Lambda handler without any further transformation.
 */
export interface ErrorResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

// ── Structured Log Entry ─────────────────────────────────────────────────────

/**
 * Shape of a single structured log line emitted by ErrorHandler.
 * Designed for easy ingestion by CloudWatch / ELK / Datadog.
 */
export interface ErrorLogEntry {
  timestamp: string
  level: 'error' | 'warn'
  code: string
  message: string
  statusCode: number
  context?: Record<string, unknown>
  stack?: string
}

// ── ErrorHandler ─────────────────────────────────────────────────────────────

/**
 * Maps any thrown error to a structured JSON log line and an HTTP-friendly
 * response object.  Keeps handler code clean — just call
 * `ErrorHandler.handle(error, context)`.
 *
 * Requirements:
 * - [NFR-OPS-02]  Log all errors with timestamp, context, and stack trace in structured JSON format
 * - [NFR-USA-04]  Provide clear, actionable error messages that guide users toward resolution
 */
export class ErrorHandler {
  /**
   * Process an error and return a structured log entry plus an HTTP response body.
   *
   * @param error   - The caught error (may be anything)
   * @param context - Optional key/value bag for request-scoped metadata
   *                  (handler name, petId, userId, etc.)
   */
  static handle(
    error: unknown,
    context?: Record<string, unknown>
  ): { statusCode: number; body: Record<string, unknown>; logEntry: ErrorLogEntry } {
    const { statusCode, code, message, details, stack } = ErrorHandler.classify(error)

    const logEntry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 500 ? 'error' : 'warn',
      code,
      message,
      statusCode,
      ...(context && { context }),
      ...(stack && { stack }),
    }

    // Emit structured JSON to stdout (picked up by CloudWatch / container logs)
    console.error(JSON.stringify(logEntry))

    // Build the client-facing response body
    const body: Record<string, unknown> = {
      error: {
        code,
        message,
        ...(details && { details }),
      },
    }

    return { statusCode, body, logEntry }
  }

  /**
   * Convenience wrapper that returns a complete API Gateway response object
   * (statusCode + CORS headers + JSON body) — ready to return from a Lambda.
   *
   * @param error      - The caught error
   * @param corsHeaders - CORS headers to attach to the response
   * @param context    - Optional request-scoped metadata for the log entry
   */
  static toResponse(
    error: unknown,
    corsHeaders: Record<string, string>,
    context?: Record<string, unknown>
  ): ErrorResponse {
    const { statusCode, body } = ErrorHandler.handle(error, context)
    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify(body),
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Classify an unknown thrown value into a normalised shape.
   */
  private static classify(error: unknown): {
    statusCode: number
    code: string
    message: string
    details?: Array<{ field: string; message: string }>
    stack?: string
  } {
    // 1. Our own AppError hierarchy (ValidationError, AuthenticationError, etc.)
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
        details: error instanceof ValidationError ? error.details : undefined,
        stack: error.stack,
      }
    }

    // 2. Legacy ValidationException from validators.ts
    if (ErrorHandler.isValidationException(error)) {
      return {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.validationErrors,
        stack: error.stack,
      }
    }

    // 3. AWS SDK ResourceNotFoundException
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Resource not found',
        stack: error.stack,
      }
    }

    // 4. AWS SDK ConditionalCheckFailedException (optimistic locking / conflicts)
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'The resource was modified by another request',
        stack: error.stack,
      }
    }

    // 5. JSON parse errors
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return {
        statusCode: 400,
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
        stack: error.stack,
      }
    }

    // 6. Generic Error
    if (error instanceof Error) {
      return {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        stack: error.stack,
      }
    }

    // 7. Non-Error throw (string, number, etc.)
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    }
  }

  /**
   * Duck-type check for the legacy ValidationException from validators.ts
   * so we don't need a direct import (avoids circular deps).
   */
  private static isValidationException(
    error: unknown
  ): error is Error & { validationErrors: Array<{ field: string; message: string }> } {
    return (
      error instanceof Error &&
      error.name === 'ValidationException' &&
      Array.isArray((error as any).validationErrors)
    )
  }
}
