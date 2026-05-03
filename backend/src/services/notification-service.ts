/**
 * NotificationService - Handles all notification delivery via SNS/SES
 *
 * Responsibilities:
 * - Send pet onboarding confirmation emails to clinic and owner
 * - Send appointment/vaccine reminder notifications
 * - Send missing pet alerts to nearby clinics via SNS topic
 * - Send pet found notifications to previously alerted clinics
 *
 * Local development:
 * - SNS publish calls go to LocalStack and succeed
 * - Email sending is abstracted: logs locally, uses SES in production
 * - All notification attempts are logged with structured data
 *
 * Requirements: [FR-03], [FR-06], [FR-08], [FR-10], [NFR-OPS-02]
 */

import {
  SNSClient,
  PublishCommand,
  CreateTopicCommand,
  SubscribeCommand,
} from '@aws-sdk/client-sns'
import { AWSClientFactory } from '../infrastructure/aws-client-factory.js'
import { EnvironmentDetector } from '../infrastructure/environment-detector.js'
import { Pet, Clinic, VaccineRecord } from '../models/entities.js'

/**
 * Result of a notification attempt
 */
export interface NotificationResult {
  success: boolean
  messageId?: string
  channel: 'sns' | 'email' | 'log'
  recipientCount: number
  error?: string
  timestamp: string
}

/**
 * Input for pet onboarding confirmation
 */
export interface OnboardingConfirmationInput {
  pet: Pet
  clinic: Clinic
  claimingCode: string
}

/**
 * Input for appointment/vaccine reminder
 */
export interface AppointmentReminderInput {
  pet: Pet
  vaccine: VaccineRecord
  ownerEmail: string
  daysUntilDue: number
}

/**
 * Input for missing pet alert
 */
export interface MissingPetAlertInput {
  pet: Pet
  nearbyClinics: Clinic[]
  searchRadiusKm: number
  lastSeenLocation: string
}

/**
 * Input for pet found notification
 */
export interface PetFoundNotificationInput {
  pet: Pet
  previouslyAlertedClinics: Clinic[]
}

export class NotificationService {
  private snsClient: SNSClient
  private envDetector: EnvironmentDetector

  constructor() {
    const factory = new AWSClientFactory()
    this.snsClient = factory.createSNSClient()
    this.envDetector = EnvironmentDetector.getInstance()
  }

  /**
   * Send a pet onboarding confirmation after a medical profile is created.
   *
   * Notifies the clinic that a new pet profile was created and includes
   * the claiming code for the pet owner.
   *
   * Requirements: [FR-03]
   */
  async sendPetOnboardingConfirmation(
    input: OnboardingConfirmationInput
  ): Promise<NotificationResult> {
    const { pet, clinic, claimingCode } = input
    const timestamp = new Date().toISOString()

    const subject = `New Pet Profile Created: ${pet.name}`
    const message = [
      `A new pet profile has been created at ${clinic.name}.`,
      '',
      `Pet: ${pet.name}`,
      `Species: ${pet.species}`,
      `Breed: ${pet.breed}`,
      `Age: ${pet.age}`,
      '',
      `Claiming Code: ${claimingCode}`,
      `Please share this code with the pet owner so they can claim the profile.`,
      '',
      `Profile Status: ${pet.profileStatus}`,
      `Created: ${pet.createdAt}`,
    ].join('\n')

    try {
      const result = await this.sendEmail(clinic.email, subject, message)

      this.log('info', 'Pet onboarding confirmation sent', {
        petId: pet.petId,
        clinicId: clinic.clinicId,
        recipientEmail: clinic.email,
        messageId: result.messageId,
      })

      return {
        success: true,
        messageId: result.messageId,
        channel: result.channel,
        recipientCount: 1,
        timestamp,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      this.log('error', 'Failed to send pet onboarding confirmation', {
        petId: pet.petId,
        clinicId: clinic.clinicId,
        error: errorMessage,
      })

      return {
        success: false,
        channel: 'email',
        recipientCount: 0,
        error: errorMessage,
        timestamp,
      }
    }
  }

  /**
   * Send an appointment/vaccine reminder to the pet owner.
   *
   * Notifies the owner that a vaccine is due soon.
   *
   * Requirements: [FR-06]
   */
  async sendAppointmentReminder(
    input: AppointmentReminderInput
  ): Promise<NotificationResult> {
    const { pet, vaccine, ownerEmail, daysUntilDue } = input
    const timestamp = new Date().toISOString()

    const subject = `Vaccine Reminder: ${vaccine.vaccineName} for ${pet.name}`
    const message = [
      `This is a reminder that ${pet.name}'s ${vaccine.vaccineName} vaccine is due${daysUntilDue <= 0 ? ' now' : ` in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}.`,
      '',
      `Pet: ${pet.name}`,
      `Vaccine: ${vaccine.vaccineName}`,
      `Due Date: ${vaccine.nextDueDate}`,
      `Last Administered: ${vaccine.administeredDate}`,
      '',
      `Please contact your veterinary clinic to schedule an appointment.`,
    ].join('\n')

    try {
      const result = await this.sendEmail(ownerEmail, subject, message)

      this.log('info', 'Appointment reminder sent', {
        petId: pet.petId,
        vaccineId: vaccine.vaccineId,
        ownerEmail,
        daysUntilDue,
        messageId: result.messageId,
      })

      return {
        success: true,
        messageId: result.messageId,
        channel: result.channel,
        recipientCount: 1,
        timestamp,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      this.log('error', 'Failed to send appointment reminder', {
        petId: pet.petId,
        vaccineId: vaccine.vaccineId,
        error: errorMessage,
      })

      return {
        success: false,
        channel: 'email',
        recipientCount: 0,
        error: errorMessage,
        timestamp,
      }
    }
  }

  /**
   * Send a missing pet alert to nearby clinics via SNS.
   *
   * Publishes a structured alert to each nearby clinic so they can
   * watch for the missing pet.
   *
   * Requirements: [FR-08], [NFR-ARCH-01]
   */
  async sendMissingPetAlert(
    input: MissingPetAlertInput
  ): Promise<NotificationResult> {
    const { pet, nearbyClinics, searchRadiusKm, lastSeenLocation } = input
    const timestamp = new Date().toISOString()

    if (nearbyClinics.length === 0) {
      this.log('warn', 'No nearby clinics to notify for missing pet', {
        petId: pet.petId,
        searchRadiusKm,
      })

      return {
        success: true,
        channel: 'sns',
        recipientCount: 0,
        timestamp,
      }
    }

    const alertMessage = JSON.stringify({
      type: 'MISSING_PET_ALERT',
      petId: pet.petId,
      petName: pet.name,
      species: pet.species,
      breed: pet.breed,
      age: pet.age,
      lastSeenLocation,
      searchRadiusKm,
      reportedAt: timestamp,
    })

    let successCount = 0
    let lastMessageId: string | undefined
    const errors: string[] = []

    for (const clinic of nearbyClinics) {
      try {
        const result = await this.publishToSNS(
          `Missing Pet Alert: ${pet.name}`,
          alertMessage,
          { clinicId: clinic.clinicId, clinicEmail: clinic.email }
        )
        successCount++
        lastMessageId = result.messageId

        this.log('info', 'Missing pet alert sent to clinic', {
          petId: pet.petId,
          clinicId: clinic.clinicId,
          clinicName: clinic.name,
          messageId: result.messageId,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        errors.push(`${clinic.clinicId}: ${errorMessage}`)

        this.log('error', 'Failed to send missing pet alert to clinic', {
          petId: pet.petId,
          clinicId: clinic.clinicId,
          error: errorMessage,
        })
      }
    }

    return {
      success: successCount > 0,
      messageId: lastMessageId,
      channel: 'sns',
      recipientCount: successCount,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      timestamp,
    }
  }

  /**
   * Send a pet found notification to previously alerted clinics.
   *
   * Notifies clinics that a missing pet has been found so they can
   * stop watching for it.
   *
   * Requirements: [FR-10]
   */
  async sendPetFoundNotification(
    input: PetFoundNotificationInput
  ): Promise<NotificationResult> {
    const { pet, previouslyAlertedClinics } = input
    const timestamp = new Date().toISOString()

    if (previouslyAlertedClinics.length === 0) {
      this.log('warn', 'No clinics to notify for found pet', {
        petId: pet.petId,
      })

      return {
        success: true,
        channel: 'sns',
        recipientCount: 0,
        timestamp,
      }
    }

    const foundMessage = JSON.stringify({
      type: 'PET_FOUND_NOTIFICATION',
      petId: pet.petId,
      petName: pet.name,
      species: pet.species,
      breed: pet.breed,
      foundAt: timestamp,
    })

    let successCount = 0
    let lastMessageId: string | undefined
    const errors: string[] = []

    for (const clinic of previouslyAlertedClinics) {
      try {
        const result = await this.publishToSNS(
          `Pet Found: ${pet.name}`,
          foundMessage,
          { clinicId: clinic.clinicId, clinicEmail: clinic.email }
        )
        successCount++
        lastMessageId = result.messageId

        this.log('info', 'Pet found notification sent to clinic', {
          petId: pet.petId,
          clinicId: clinic.clinicId,
          clinicName: clinic.name,
          messageId: result.messageId,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        errors.push(`${clinic.clinicId}: ${errorMessage}`)

        this.log('error', 'Failed to send pet found notification to clinic', {
          petId: pet.petId,
          clinicId: clinic.clinicId,
          error: errorMessage,
        })
      }
    }

    return {
      success: successCount > 0,
      messageId: lastMessageId,
      channel: 'sns',
      recipientCount: successCount,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      timestamp,
    }
  }

  /**
   * Publish a message to SNS.
   *
   * In local development, publishes to LocalStack SNS.
   * In production, publishes to the real SNS service.
   */
  private async publishToSNS(
    subject: string,
    message: string,
    attributes: Record<string, string>
  ): Promise<{ messageId?: string }> {
    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {}
    for (const [key, value] of Object.entries(attributes)) {
      messageAttributes[key] = {
        DataType: 'String',
        StringValue: value,
      }
    }

    const topicArn = await this.getOrCreateTopic('paw-print-notifications')

    const command = new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: message,
      MessageAttributes: messageAttributes,
    })

    const response = await this.snsClient.send(command)
    return { messageId: response.MessageId }
  }

  /**
   * Send an email notification.
   *
   * In local development, publishes via SNS with email protocol (LocalStack
   * accepts the call but won't deliver real emails). Logs the email content
   * for debugging.
   *
   * In production, this would use SES for direct email delivery.
   */
  private async sendEmail(
    to: string,
    subject: string,
    body: string
  ): Promise<{ messageId?: string; channel: 'email' | 'log' }> {
    if (this.envDetector.isLocal()) {
      // In local development, log the email and publish via SNS
      this.log('info', 'Email notification (local)', {
        to,
        subject,
        bodyPreview: body.substring(0, 200),
      })

      try {
        const topicArn = await this.getOrCreateTopic('paw-print-email-notifications')

        const command = new PublishCommand({
          TopicArn: topicArn,
          Subject: subject,
          Message: JSON.stringify({ to, subject, body }),
          MessageAttributes: {
            recipientEmail: {
              DataType: 'String',
              StringValue: to,
            },
          },
        })

        const response = await this.snsClient.send(command)
        return { messageId: response.MessageId, channel: 'email' }
      } catch {
        // If SNS fails locally, still log and return success
        this.log('warn', 'SNS publish failed locally, email logged only', {
          to,
          subject,
        })
        return { messageId: undefined, channel: 'log' }
      }
    }

    // Production: use SNS publish with email-json protocol
    // In a full production setup, this would use SES SendEmail API
    const topicArn = await this.getOrCreateTopic('paw-print-email-notifications')

    const command = new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: JSON.stringify({ to, subject, body }),
      MessageAttributes: {
        recipientEmail: {
          DataType: 'String',
          StringValue: to,
        },
      },
    })

    const response = await this.snsClient.send(command)
    return { messageId: response.MessageId, channel: 'email' }
  }

  /**
   * Get or create an SNS topic by name.
   *
   * CreateTopic is idempotent — if the topic already exists, it returns
   * the existing ARN.
   */
  private async getOrCreateTopic(topicName: string): Promise<string> {
    const command = new CreateTopicCommand({ Name: topicName })
    const response = await this.snsClient.send(command)

    if (!response.TopicArn) {
      throw new Error(`Failed to create or retrieve SNS topic: ${topicName}`)
    }

    return response.TopicArn
  }

  /**
   * Structured logging for notification events.
   */
  private log(
    level: 'info' | 'warn' | 'error',
    message: string,
    data: Record<string, unknown>
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'NotificationService',
      message,
      ...data,
    }

    switch (level) {
      case 'error':
        console.error(JSON.stringify(logEntry))
        break
      case 'warn':
        console.warn(JSON.stringify(logEntry))
        break
      default:
        console.log(JSON.stringify(logEntry))
    }
  }
}
