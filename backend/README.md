# PawPrint Backend — Source Overview

## Architecture

Layered architecture with strict separation of concerns:

```
Handlers (presentation) → Services (business logic) → Repositories (data access)
```

In production, each handler runs as a separate AWS Lambda function behind API Gateway. Locally, all handlers are wrapped by a single Express server (`src/index.ts`) that replicates API Gateway routing. The business logic is identical in both environments.

## Folder Structure

```
src/
├── errors/          → Custom error classes + ErrorHandler (maps to HTTP status codes)
├── handlers/        → Lambda-compatible request handlers (Express wrappers locally)
│   ├── auth-handler.ts
│   ├── clinic-handler.ts
│   ├── emergency-tools-handler.ts
│   ├── pet-co-onboarding-handler.ts
│   └── search-handler.ts
├── infrastructure/  → AWS client factory, environment detection, DB init, seed scripts
├── models/          → TypeScript interfaces (DynamoDB entities, DTOs)
├── repositories/    → Data access layer (DynamoDB single-table, S3)
│   ├── pet-repository.ts
│   ├── clinic-repository.ts
│   ├── image-repository.ts
│   └── care-snapshot-repository.ts
├── services/        → Business logic
│   ├── pet-co-onboarding-service.ts   → Medical profile creation + claiming codes
│   ├── profile-claiming-service.ts    → Ownership transfer workflow
│   ├── clinic-service.ts              → Clinic management
│   ├── search-service.ts              → Public lost pet search (Haversine proximity)
│   ├── emergency-tools-service.ts     → Missing pet reporting + flyer orchestration
│   ├── flyer-generation-service.ts    → PDF generation via pdfkit
│   ├── missing-pet-service.ts         → Missing/found workflow + clinic notifications
│   ├── care-snapshot-service.ts       → Temporary caregiver access codes
│   ├── notification-service.ts        → SNS/SES notifications
│   ├── photo-guidance-service.ts      → Upload tips and image requirements
│   ├── geocoding-service.ts           → City/ZIP → lat/lng conversion
│   ├── auth-service.ts                → Cognito interface (production)
│   ├── local-auth-service.ts          → DynamoDB-backed auth (local development)
│   └── authorization-service.ts       → Role-based access control (vet/owner/public)
├── validation/      → Input validation functions (pet data, images, required fields)
└── index.ts         → Express entry point (local dev only)
```

## Key Design Decisions

### Express wraps Lambda handlers locally

`src/index.ts` maps Express routes to the same handler functions that run in Lambda. The `toEvent()` helper converts Express `Request` objects into `APIGatewayProxyEvent` format. This means:
- Adding a new endpoint requires registering it in both `template.yaml` (for AWS) and `index.ts` (for local).
- If they drift, you get routes that work in the cloud but 404 locally (or vice versa).

### Single-table DynamoDB with 6 GSIs

All entities share one table (`VetPetRegistry`). Partition/sort key patterns:
- `PET#{id}` / `METADATA` — pet profiles
- `PET#{id}` / `VACCINE#{id}` — vaccine records
- `PET#{id}` / `SURGERY#{id}` — surgery records
- `PET#{id}` / `IMAGE#{id}` — image metadata
- `CLINIC#{id}` / `METADATA` — clinic profiles
- `USER#{id}` / `METADATA` — user accounts (local auth)

GSIs enable efficient queries without table scans (e.g., GSI4 for claiming code lookup, GSI6 for clinic-pet associations).

### LocalAuthService as Cognito replacement

LocalStack free tier doesn't support Cognito. `LocalAuthService` provides the same interface (signUp, signIn, getCurrentUser, refreshToken) backed by DynamoDB with scrypt-hashed passwords and mock JWTs. `EnvironmentDetector` selects the correct implementation at startup.

## Running Tests

Requires LocalStack on `localhost:4566` (Docker Compose provides this).

```bash
npm test                  # All tests (~464)
npm run test:unit         # Unit tests only (~218)
npm run test:property     # Property-based tests (~167, against LocalStack)
npm run test:integration  # Integration tests (~65)
npm run test:coverage     # All tests + coverage report
```

## Running Locally (outside Docker)

```bash
cp .env.example .env     # Only needed outside Docker
npm install
npm run dev              # tsx watch with hot-reload
```

Inside Docker, the `docker-compose.yml` environment section provides all variables — no `.env` file needed.
