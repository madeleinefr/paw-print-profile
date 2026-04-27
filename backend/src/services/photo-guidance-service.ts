/**
 * PhotoGuidanceService - Provides photography tips and image quality feedback
 * for pet owners uploading photos for identification purposes.
 *
 * Requirements: [FR-16]
 */

import { validateImageFormat, validateImageSize } from '../validation/validators'

/**
 * A single photography tip with title and description
 */
export interface PhotoTip {
  title: string
  description: string
}

/**
 * Image format and size requirements
 */
export interface PhotoRequirements {
  formats: string[]
  maxSizeMB: number
  maxSizeBytes: number
  recommendedResolution: string
}

/**
 * Complete photo guidelines response
 */
export interface PhotoGuidelines {
  title: string
  tips: PhotoTip[]
  requirements: PhotoRequirements
}

/**
 * Quality feedback for an uploaded image
 */
export interface ImageQualityFeedback {
  passed: boolean
  issues: string[]
  suggestions: string[]
}

export class PhotoGuidanceService {
  private static readonly SUPPORTED_FORMATS = ['JPEG', 'PNG', 'WebP']
  private static readonly MAX_SIZE_MB = 10
  private static readonly MAX_SIZE_BYTES = 10 * 1024 * 1024
  private static readonly RECOMMENDED_RESOLUTION = '1920x1080 or higher'
  private static readonly MIN_RECOMMENDED_WIDTH = 800
  private static readonly MIN_RECOMMENDED_HEIGHT = 600

  /**
   * Returns photography guidelines including tips and requirements.
   *
   * [FR-16] Display photography guidelines when owner accesses photo upload
   * Include tips for lighting, focus, multiple angles
   * Specify recommended image formats and size limits
   * Recommend close-up face shots and full body images
   */
  getPhotoGuidelines(): PhotoGuidelines {
    return {
      title: 'How to Take Quality Photos of Your Pet',
      tips: [
        {
          title: 'Lighting',
          description:
            'Use natural light from a window or outdoors. Avoid harsh shadows and backlighting.',
        },
        {
          title: 'Focus',
          description:
            "Ensure your pet's face is in sharp focus. Use your phone's focus feature by tapping on your pet.",
        },
        {
          title: 'Multiple Angles',
          description:
            'Take photos from different angles — front, side, and back views help with identification.',
        },
        {
          title: 'Close-up Shots',
          description:
            'Include close-up photos of distinctive features like face markings, scars, or unique patterns.',
        },
        {
          title: 'Full Body Shots',
          description:
            "Include full-body photos showing your pet's overall size and shape.",
        },
      ],
      requirements: {
        formats: PhotoGuidanceService.SUPPORTED_FORMATS,
        maxSizeMB: PhotoGuidanceService.MAX_SIZE_MB,
        maxSizeBytes: PhotoGuidanceService.MAX_SIZE_BYTES,
        recommendedResolution: PhotoGuidanceService.RECOMMENDED_RESOLUTION,
      },
    }
  }

  /**
   * Provides quality feedback for an uploaded image based on format, size,
   * and optional dimensions.
   *
   * [FR-16] Display a visual preview alongside guidelines so the user
   * can self-evaluate quality (backend provides the feedback data; frontend
   * renders the preview).
   */
  getImageQualityFeedback(
    mimeType: string,
    fileSize: number,
    width?: number,
    height?: number
  ): ImageQualityFeedback {
    const issues: string[] = []
    const suggestions: string[] = []

    // Validate format
    const formatErrors = validateImageFormat(mimeType)
    if (formatErrors.length > 0) {
      issues.push(`Unsupported format. Please use ${PhotoGuidanceService.SUPPORTED_FORMATS.join(', ')}.`)
    }

    // Validate size
    const sizeErrors = validateImageSize(fileSize)
    if (sizeErrors.length > 0) {
      issues.push(`File exceeds the ${PhotoGuidanceService.MAX_SIZE_MB} MB size limit.`)
    }

    // Check dimensions if provided
    if (width !== undefined && height !== undefined) {
      if (width < PhotoGuidanceService.MIN_RECOMMENDED_WIDTH || height < PhotoGuidanceService.MIN_RECOMMENDED_HEIGHT) {
        suggestions.push(
          `Image resolution is low (${width}x${height}). For best identification results, use at least ${PhotoGuidanceService.MIN_RECOMMENDED_WIDTH}x${PhotoGuidanceService.MIN_RECOMMENDED_HEIGHT}.`
        )
      }
    }

    // General suggestions when no issues
    if (issues.length === 0 && suggestions.length === 0) {
      suggestions.push('Image meets all requirements. Make sure the photo is well-lit and in focus.')
    }

    return {
      passed: issues.length === 0,
      issues,
      suggestions,
    }
  }
}
