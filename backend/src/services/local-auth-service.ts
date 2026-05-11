/**
 * LocalAuthService - DynamoDB-backed authentication for local development.
 *
 * When Cognito is unavailable (LocalStack free tier), this service provides
 * a fully functional auth layer using DynamoDB for user storage and Node's
 * built-in crypto module for password hashing.
 *
 * This is used ONLY in local development (IS_LOCAL=true) and provides the
 * same interface as the Cognito-based AuthService.
 *
 * Users are persisted in DynamoDB so accounts survive backend restarts.
 *
 * Requirements: [NFR-SEC-01], [NFR-SEC-02]
 */

import { randomBytes, scryptSync, randomUUID } from 'crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'
import type { AuthUser, AuthTokens, SignUpInput } from './auth-service'
import { AuthError } from './auth-service'

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'VetPetRegistry'

/** Token expiry: 1 hour */
const TOKEN_EXPIRY_SECONDS = 3600

export class LocalAuthService {
  private docClient: DynamoDBDocumentClient

  constructor() {
    const factory = new AWSClientFactory()
    const client: DynamoDBClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(client)
  }

  /**
   * Hash a password using scrypt with a random salt.
   */
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
  }

  /**
   * Verify a password against a stored hash.
   */
  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':')
    const attempt = scryptSync(password, salt, 64).toString('hex')
    return hash === attempt
  }

  /**
   * Generate a mock JWT-like token containing user info.
   * Not a real JWT, but carries the same claims the frontend expects.
   */
  private generateToken(userId: string, email: string, userType: string, clinicId?: string): string {
    const payload = {
      sub: userId,
      email,
      'custom:userType': userType,
      'custom:clinicId': clinicId || '',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
    }
    // Base64-encode the payload (mimics JWT structure: header.payload.signature)
    const header = Buffer.from(JSON.stringify({ alg: 'local', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = randomBytes(32).toString('base64url')
    return `${header}.${body}.${sig}`
  }

  /**
   * Decode a mock token to extract user info.
   */
  private decodeToken(token: string): { sub: string; email: string; 'custom:userType': string; 'custom:clinicId': string; exp: number } | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      return payload
    } catch {
      return null
    }
  }

  /**
   * Register a new user. Stores in DynamoDB with hashed password.
   */
  async signUp(input: SignUpInput): Promise<AuthUser> {
    const { email, password, userType, clinicId } = input

    if (!email || !password) {
      throw new AuthError('Email and password are required', 'INVALID_INPUT')
    }
    if (!userType || !['vet', 'owner'].includes(userType)) {
      throw new AuthError('User type must be vet or owner', 'INVALID_INPUT')
    }
    if (password.length < 8) {
      throw new AuthError('Password must be at least 8 characters', 'INVALID_INPUT')
    }

    // Check if user already exists
    const existing = await this.getUserByEmail(email)
    if (existing) {
      throw new AuthError('An account with this email already exists', 'INVALID_INPUT')
    }

    const userId = randomUUID()
    const hashedPassword = this.hashPassword(password)

    await this.docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: 'METADATA',
        userId,
        email,
        userType,
        clinicId: clinicId || null,
        passwordHash: hashedPassword,
        createdAt: new Date().toISOString(),
        // GSI for email lookup
        GSI1PK: `EMAIL#${email.toLowerCase()}`,
        GSI1SK: `USER#${userId}`,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }))

    return { userId, email, userType, clinicId }
  }

  /**
   * Authenticate a user and return mock JWT tokens.
   */
  async signIn(email: string, password: string): Promise<AuthTokens> {
    if (!email || !password) {
      throw new AuthError('Email and password are required', 'INVALID_INPUT')
    }

    // Look up user by email using GSI1
    const result = await this.docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `EMAIL#${email.toLowerCase()}`,
      },
      Limit: 1,
    }))

    const user = result.Items?.[0]
    if (!user) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS')
    }

    // Verify password
    if (!this.verifyPassword(password, user.passwordHash)) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS')
    }

    // Generate tokens
    const accessToken = this.generateToken(user.userId, user.email, user.userType, user.clinicId)
    const idToken = this.generateToken(user.userId, user.email, user.userType, user.clinicId)
    const refreshToken = randomBytes(64).toString('base64url')

    // Store refresh token for later validation
    await this.docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `REFRESH#${refreshToken}`,
        SK: 'TOKEN',
        userId: user.userId,
        email: user.email,
        userType: user.userType,
        clinicId: user.clinicId || null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      },
    }))

    return {
      accessToken,
      idToken,
      refreshToken,
      expiresIn: TOKEN_EXPIRY_SECONDS,
    }
  }

  /**
   * Get the current user from an access token.
   */
  async getCurrentUser(accessToken: string): Promise<AuthUser | null> {
    if (!accessToken) return null

    const payload = this.decodeToken(accessToken)
    if (!payload) return null

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return {
      userId: payload.sub,
      email: payload.email,
      userType: payload['custom:userType'] as 'vet' | 'owner',
      clinicId: payload['custom:clinicId'] || undefined,
    }
  }

  /**
   * Refresh tokens using a stored refresh token.
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new AuthError('Refresh token is required', 'INVALID_INPUT')
    }

    // Look up refresh token
    const result = await this.docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `REFRESH#${refreshToken}`, SK: 'TOKEN' },
    }))

    const tokenRecord = result.Item
    if (!tokenRecord) {
      throw new AuthError('Invalid refresh token', 'REFRESH_FAILED')
    }

    // Check expiry
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      throw new AuthError('Refresh token expired', 'REFRESH_FAILED')
    }

    // Generate new access/id tokens
    const accessToken = this.generateToken(
      tokenRecord.userId, tokenRecord.email, tokenRecord.userType, tokenRecord.clinicId
    )
    const idToken = this.generateToken(
      tokenRecord.userId, tokenRecord.email, tokenRecord.userType, tokenRecord.clinicId
    )

    return {
      accessToken,
      idToken,
      refreshToken, // Reuse same refresh token
      expiresIn: TOKEN_EXPIRY_SECONDS,
    }
  }

  /**
   * Sign out — no-op for local (tokens are stateless mock JWTs).
   */
  async signOut(_accessToken: string): Promise<void> {
    // In local mode, we don't invalidate tokens server-side
  }

  /**
   * Associate a clinic ID with an existing user.
   * Used when a vet creates a clinic after signing up without one.
   */
  async associateClinic(userId: string, clinicId: string): Promise<void> {
    await this.docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'METADATA' },
      UpdateExpression: 'SET clinicId = :clinicId',
      ExpressionAttributeValues: { ':clinicId': clinicId },
    }))
  }

  /**
   * Look up a user by email.
   */
  async getUserByEmail(email: string): Promise<AuthUser | null> {
    if (!email) return null

    const result = await this.docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `EMAIL#${email.toLowerCase()}`,
      },
      Limit: 1,
    }))

    const user = result.Items?.[0]
    if (!user) return null

    return {
      userId: user.userId,
      email: user.email,
      userType: user.userType,
      clinicId: user.clinicId || undefined,
    }
  }
}
