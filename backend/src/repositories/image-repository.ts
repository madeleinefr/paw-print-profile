/**
 * ImageRepository - Data access layer for pet image operations
 *
 * Handles S3 storage for image files and DynamoDB metadata records.
 * Supports both vet and owner image uploads.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { PetImage, UploadImageInput } from '../models/entities'
import { AWSClientFactory } from '../infrastructure/aws-client-factory'

const BUCKET_NAME = process.env.PET_IMAGES_BUCKET ?? 'paw-print-profile-images'
const SIGNED_URL_EXPIRES_IN = 3600 // 1 hour

function mimeTypeToExt(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpeg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpeg'
  }
}

export class ImageRepository {
  private s3Client: S3Client
  private docClient: DynamoDBDocumentClient
  private tableName: string

  constructor(tableName: string = 'VetPetRegistry') {
    const factory = new AWSClientFactory()
    this.s3Client = factory.createS3Client()
    const dynamoClient = factory.createDynamoDBClient()
    this.docClient = DynamoDBDocumentClient.from(dynamoClient)
    this.tableName = tableName
  }

  /**
   * Upload an image to S3 and store metadata in DynamoDB
   */
  async upload(input: UploadImageInput): Promise<PetImage> {
    const imageId = uuidv4()
    const ext = mimeTypeToExt(input.mimeType)
    const s3Key = `pets/${input.petId}/${imageId}.${ext}`
    const uploadedAt = new Date().toISOString()

    // Upload image buffer to S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: input.imageBuffer,
        ContentType: input.mimeType,
        Metadata: {
          petId: input.petId,
          imageId,
          tags: input.tags.join(','),
        },
      })
    )

    const petImage: PetImage = {
      PK: `PET#${input.petId}`,
      SK: `IMAGE#${imageId}`,
      imageId,
      s3Key,
      s3Bucket: BUCKET_NAME,
      url: `s3://${BUCKET_NAME}/${s3Key}`,
      tags: input.tags,
      uploadedAt,
      fileSize: input.imageBuffer.length,
      mimeType: input.mimeType,
    }

    // Store metadata in DynamoDB
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: petImage,
      })
    )

    return petImage
  }

  /**
   * Generate a pre-signed S3 URL for an image (expires in 1 hour)
   */
  async getUrl(imageId: string, petId: string): Promise<string> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `PET#${petId}`,
          SK: `IMAGE#${imageId}`,
        },
      })
    )

    const image = result.Item as PetImage | undefined
    if (!image) {
      throw new Error(`Image ${imageId} not found for pet ${petId}`)
    }

    const command = new GetObjectCommand({
      Bucket: image.s3Bucket,
      Key: image.s3Key,
    })

    return this.toPublicUrl(
      await getSignedUrl(this.s3Client, command, { expiresIn: SIGNED_URL_EXPIRES_IN })
    )
  }

  /**
   * Replace Docker-internal hostnames in S3 signed URLs with localhost
   * so the browser can reach them during local development.
   */
  private toPublicUrl(url: string): string {
    const localstackHost = process.env.LOCALSTACK_HOSTNAME
    if (localstackHost && localstackHost !== 'localhost') {
      return url.replace(`http://${localstackHost}:`, 'http://localhost:')
    }
    return url
  }

  /**
   * Find all images for a pet
   */
  async findByPet(petId: string): Promise<PetImage[]> {
    const response = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `PET#${petId}`,
          ':skPrefix': 'IMAGE#',
        },
      })
    )

    return (response.Items as PetImage[]) ?? []
  }

  /**
   * Delete an image from S3 and remove its DynamoDB metadata record
   */
  async delete(imageId: string, petId: string): Promise<void> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `PET#${petId}`,
          SK: `IMAGE#${imageId}`,
        },
      })
    )

    const image = result.Item as PetImage | undefined
    if (!image) {
      throw new Error(`Image ${imageId} not found for pet ${petId}`)
    }

    // Delete from S3
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: image.s3Bucket,
        Key: image.s3Key,
      })
    )

    // Delete DynamoDB metadata record
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `PET#${petId}`,
          SK: `IMAGE#${imageId}`,
        },
      })
    )
  }
}
