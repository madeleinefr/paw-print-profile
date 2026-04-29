/**
 * AuthService - Cognito integration for B2B2C authentication with user roles
 *
 * Handles:
 * - Sign-up for veterinarians and pet owners with role selection
 * - Sign-in returning JWT tokens with userType and clinicId
 * - Token refresh for session continuity
 * - Current user retrieval from access tokens
 * - Sign-out (global sign-out invalidating all tokens)
 *
 * Supports three user groups:
 * - Veterinarians (B2B): can create medical profiles, manage clinics
 * - Pet Owners (B2C): can claim profiles, use emergency tools
 * - Public (unauthenticated): can search lost pets, access care snapshots
 *
 * Custom Cognito attributes:
 * - custom:userType ('vet' | 'owner')
 * - custom:clinicId (only for vets)
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'
import { UserType } from '../models/entities'

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? ''

/**
 * Authenticated user information
 */
export interface AuthUser {
  userId: string
  email: string
  userType: UserType
  clinicId?: string
}

/**
 * Authentication tokens returned on sign-in and refresh
 */
export interface AuthTokens {
  accessToken: string
  idToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * Sign-up input
 */
export interface SignUpInput {
  email: string
  password: string
  userType: 'vet' | 'owner'
  clinicId?: string
}

export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient
  private userPoolId: string
  private clientId: string

  constructor(userPoolId?: string, clientId?: string) {
    const factory = new AWSClientFactory()
    this.cognitoClient = factory.createCognitoClient()
    this.userPoolId = userPoolId ?? USER_POOL_ID
    this.clientId = clientId ?? CLIENT_ID
  }

  /**
   * Register a new user with role selection.
   *
   * Stores userType and optional clinicId as custom Cognito attributes.
   * Veterinarians must provide a clinicId; owners do not.
   *
   * In local development (LocalStack), the user is auto-confirmed.
   *
   * Requirements: [NFR-SEC-01]
   */
  async signUp(input: SignUpInput): Promise<AuthUser> {
    const { email, password, userType, clinicId } = input

    if (!email || !password) {
      throw new AuthError('Email and password are required', 'INVALID_INPUT')
    }
    if (!userType || !['vet', 'owner'].includes(userType)) {
      throw new AuthError('User type must be vet or owner', 'INVALID_INPUT')
    }
    if (userType === 'vet' && !clinicId) {
      throw new AuthError('Clinic ID is required for veterinarians', 'INVALID_INPUT')
    }

    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'custom:userType', Value: userType },
    ]
    if (clinicId) {
      userAttributes.push({ Name: 'custom:clinicId', Value: clinicId })
    }

    const result = await this.cognitoClient.send(
      new SignUpCommand({
        ClientId: this.clientId,
        Username: email,
        Password: password,
        UserAttributes: userAttributes,
      })
    )

    const userId = result.UserSub ?? ''

    // Auto-confirm in local development (LocalStack doesn't send emails)
    // Also mark email as verified so forgot-password flow works locally
    // (per AWS docs: AdminConfirmSignUp alone doesn't verify email)
    if (process.env.IS_LOCAL === 'true') {
      try {
        await this.cognitoClient.send(
          new AdminConfirmSignUpCommand({
            UserPoolId: this.userPoolId,
            Username: email,
          })
        )
        await this.cognitoClient.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: this.userPoolId,
            Username: email,
            UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
          })
        )
      } catch {
        // Ignore if already confirmed
      }
    }

    return {
      userId,
      email,
      userType,
      clinicId,
    }
  }

  /**
   * Authenticate a user and return JWT tokens.
   *
   * Uses USER_PASSWORD_AUTH flow. Returns access, ID, and refresh tokens.
   * The ID token contains custom:userType and custom:clinicId claims.
   *
   * Requirements: [NFR-SEC-01]
   */
  async signIn(email: string, password: string): Promise<AuthTokens> {
    if (!email || !password) {
      throw new AuthError('Email and password are required', 'INVALID_INPUT')
    }

    try {
      const result = await this.cognitoClient.send(
        new InitiateAuthCommand({
          ClientId: this.clientId,
          AuthFlow: 'USER_PASSWORD_AUTH',
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        })
      )

      const auth = result.AuthenticationResult
      if (!auth || !auth.AccessToken || !auth.IdToken || !auth.RefreshToken) {
        throw new AuthError('Authentication failed', 'AUTH_FAILED')
      }

      return {
        accessToken: auth.AccessToken,
        idToken: auth.IdToken,
        refreshToken: auth.RefreshToken,
        expiresIn: auth.ExpiresIn ?? 3600,
      }
    } catch (err: any) {
      if (err instanceof AuthError) throw err
      if (err.name === 'NotAuthorizedException') {
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS')
      }
      if (err.name === 'UserNotFoundException') {
        throw new AuthError('User not found', 'USER_NOT_FOUND')
      }
      if (err.name === 'UserNotConfirmedException') {
        throw new AuthError('User is not confirmed', 'USER_NOT_CONFIRMED')
      }
      throw new AuthError(`Authentication error: ${err.message}`, 'AUTH_FAILED')
    }
  }

  /**
   * Get the current authenticated user from an access token.
   *
   * Retrieves user attributes including userType and clinicId
   * from Cognito using the access token.
   *
   * Requirements: [NFR-SEC-02]
   */
  async getCurrentUser(accessToken: string): Promise<AuthUser | null> {
    if (!accessToken) return null

    try {
      const result = await this.cognitoClient.send(
        new GetUserCommand({ AccessToken: accessToken })
      )

      const attrs = result.UserAttributes ?? []
      const getAttr = (name: string) => attrs.find(a => a.Name === name)?.Value ?? ''

      return {
        userId: getAttr('sub'),
        email: getAttr('email'),
        userType: (getAttr('custom:userType') || 'owner') as UserType,
        clinicId: getAttr('custom:clinicId') || undefined,
      }
    } catch {
      return null
    }
  }

  /**
   * Refresh authentication tokens using a refresh token.
   *
   * Returns new access and ID tokens. The refresh token itself
   * is not rotated (Cognito default behavior).
   *
   * Requirements: [NFR-SEC-01]
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new AuthError('Refresh token is required', 'INVALID_INPUT')
    }

    try {
      const result = await this.cognitoClient.send(
        new InitiateAuthCommand({
          ClientId: this.clientId,
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
          },
        })
      )

      const auth = result.AuthenticationResult
      if (!auth || !auth.AccessToken || !auth.IdToken) {
        throw new AuthError('Token refresh failed', 'REFRESH_FAILED')
      }

      return {
        accessToken: auth.AccessToken,
        idToken: auth.IdToken,
        refreshToken, // Cognito doesn't return a new refresh token
        expiresIn: auth.ExpiresIn ?? 3600,
      }
    } catch (err: any) {
      if (err instanceof AuthError) throw err
      throw new AuthError(`Token refresh error: ${err.message}`, 'REFRESH_FAILED')
    }
  }

  /**
   * Sign out the user globally, invalidating all tokens.
   */
  async signOut(accessToken: string): Promise<void> {
    if (!accessToken) return

    try {
      await this.cognitoClient.send(
        new GlobalSignOutCommand({ AccessToken: accessToken })
      )
    } catch {
      // Ignore errors on sign-out (token may already be invalid)
    }
  }

  /**
   * Get user info by username (admin operation).
   * Used internally for authorization checks.
   */
  async getUserByEmail(email: string): Promise<AuthUser | null> {
    if (!email) return null

    try {
      const result = await this.cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
        })
      )

      const attrs = result.UserAttributes ?? []
      const getAttr = (name: string) => attrs.find(a => a.Name === name)?.Value ?? ''

      return {
        userId: getAttr('sub'),
        email: getAttr('email'),
        userType: (getAttr('custom:userType') || 'owner') as UserType,
        clinicId: getAttr('custom:clinicId') || undefined,
      }
    } catch {
      return null
    }
  }
}

/**
 * Custom error class for authentication errors
 */
export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_NOT_CONFIRMED'
  | 'AUTH_FAILED'
  | 'REFRESH_FAILED'

export class AuthError extends Error {
  code: AuthErrorCode

  constructor(message: string, code: AuthErrorCode) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}
