/**
 * Backend API Entry Point
 *
 * Express server that wraps Lambda handlers for local development.
 * In production, these handlers run as separate Lambda functions.
 */

import express, { Request, Response } from 'express'
import cors from 'cors'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { handler as coOnboardingHandler } from './handlers/pet-co-onboarding-handler'
import { handler as clinicHandler } from './handlers/clinic-handler'
import { handler as searchHandler } from './handlers/search-handler'
import { handler as emergencyToolsHandler } from './handlers/emergency-tools-handler'

import { AWSClientFactory } from './infrastructure/aws-client-factory'
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Helpers ──────────────────────────────────────────────────────────────────

function toEvent(req: Request): APIGatewayProxyEvent {
  return {
    httpMethod: req.method,
    path: req.path,
    resource: req.path,
    pathParameters: req.params as Record<string, string> | null,
    queryStringParameters: req.query as Record<string, string> | null,
    headers: req.headers as Record<string, string>,
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
  }
}

function sendResult(res: Response, result: APIGatewayProxyResult) {
  Object.entries(result.headers ?? {}).forEach(([k, v]) => res.setHeader(k, String(v)))
  res.status(result.statusCode).send(result.body)
}

function wrap(handler: (e: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) {
  return async (req: Request, res: Response) => {
    const event = toEvent(req)
    const result = await handler(event)
    sendResult(res, result)
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    environment: process.env.IS_LOCAL === 'true' ? 'Local (LocalStack)' : 'Cloud (AWS)',
    timestamp: new Date().toISOString(),
  })
})

// ── Pet co-onboarding routes ──────────────────────────────────────────────────

app.post('/claiming-codes/validate', wrap(coOnboardingHandler))
app.post('/profiles/:petId/transfer', wrap(coOnboardingHandler))
app.post('/pets/claim', wrap(coOnboardingHandler))
app.post('/pets/:petId/vaccines', wrap(coOnboardingHandler))
app.post('/pets/:petId/surgeries', wrap(coOnboardingHandler))
app.post('/pets/:petId/images', wrap(coOnboardingHandler))
app.post('/pets', wrap(coOnboardingHandler))
app.get('/pets/pending-claims', wrap(coOnboardingHandler))
app.get('/pets/:petId', wrap(coOnboardingHandler))
app.get('/pets', wrap(coOnboardingHandler))
app.put('/pets/:petId/enrich', wrap(coOnboardingHandler))
app.put('/pets/:petId', wrap(coOnboardingHandler))
app.delete('/pets/:petId', wrap(coOnboardingHandler))

// ── Emergency tools routes ────────────────────────────────────────────────────

app.post('/pets/:petId/missing', wrap(emergencyToolsHandler))
app.put('/pets/:petId/found', wrap(emergencyToolsHandler))
app.get('/pets/:petId/flyer', wrap(emergencyToolsHandler))
app.get('/pets/:petId/photo-guidance', wrap(emergencyToolsHandler))
app.post('/pets/:petId/care-snapshot', wrap(emergencyToolsHandler))
app.get('/care-snapshots/:accessCode', wrap(emergencyToolsHandler))

// ── Clinic routes ─────────────────────────────────────────────────────────────

app.post('/clinics', wrap(clinicHandler))
app.get('/clinics/:clinicId/pending-claims', wrap(clinicHandler))
app.get('/clinics/:clinicId/pets', wrap(clinicHandler))
app.get('/clinics/:clinicId/statistics', wrap(clinicHandler))
app.post('/clinics/:clinicId/custom-fields', wrap(clinicHandler))
app.get('/clinics/:clinicId', wrap(clinicHandler))
app.put('/clinics/:clinicId', wrap(clinicHandler))
app.delete('/clinics/:clinicId', wrap(clinicHandler))
app.get('/clinics', wrap(clinicHandler))

// ── Search routes ─────────────────────────────────────────────────────────────

app.get('/search/pets', wrap(searchHandler))

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(port, async () => {
  console.log(`Paw Print Profile Backend - Server running on port ${port}`)
  console.log(`Environment: ${process.env.IS_LOCAL === 'true' ? 'Local (LocalStack)' : 'Cloud (AWS)'}`)
  console.log(`Health check: http://localhost:${port}/health`)

  // Ensure S3 bucket exists in LocalStack
  if (process.env.IS_LOCAL === 'true') {
    const bucketName = process.env.S3_BUCKET || 'paw-print-profile-images'
    const factory = new AWSClientFactory()
    const s3 = factory.createS3Client()
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucketName }))
      console.log(`S3 bucket "${bucketName}" already exists`)
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucketName }))
        console.log(`S3 bucket "${bucketName}" created`)
      } catch (err) {
        console.error(`Failed to create S3 bucket "${bucketName}":`, err)
      }
    }
  }
})
