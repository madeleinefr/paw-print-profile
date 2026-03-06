/**
 * Backend API Entry Point
 * 
 * Express server that wraps Lambda handlers for local development.
 * Handlers will be integrated in future feature branches.
 * In production, these handlers run as separate Lambda functions.
 */

import express from 'express'
import cors from 'cors'

const app = express()
const port = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    environment: process.env.IS_LOCAL === 'true' ? 'Local (LocalStack)' : 'Cloud (AWS)',
    timestamp: new Date().toISOString(),
    message: 'Backend scaffolding successful. Handlers pending.',
  })
})

  
  app.listen(port, () => {
    console.log(`Paw Print Profile Backend - Server running on port ${port}`)
    console.log(`Environment: ${process.env.IS_LOCAL === 'true' ? 'Local (LocalStack)' : 'Cloud (AWS)'}`)
    console.log(`Health check: http://localhost:${port}/health`)
  })
