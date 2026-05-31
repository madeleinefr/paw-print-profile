# Frameworks, Libraries, and Tools

## Version Control & Project Management

| Tool | Version | Reasoning |
|------|---------|-----------|
| **Git / GitHub** | — | Assignment requirement. Feature branches with PRs provide traceability from requirement → issue → PR → code change. |
| **Docker Compose** | v2.x | Single `docker compose up` starts the full stack (LocalStack, backend, frontend). Eliminates setup friction — evaluators need only Docker installed. |

## Backend

| Tool | Version | Reasoning |
|------|---------|-----------|
| **Node.js** | v20.x | Same language (TypeScript) across frontend and backend enables shared type definitions. Runs natively in AWS Lambda (target platform). |
| **TypeScript** | v5.3 | Professional familiarity. Compile-time type checking catches DynamoDB key pattern errors (`PET#{id}`, `CLAIM#{code}`) and attribute typos that would otherwise only surface at runtime. |
| **Express** | v4.18 | Wraps Lambda handlers locally for sub-second feedback loops. Same handler code runs in both environments. Chosen over Fastify — no need for performance optimizations serving one developer. |
| **AWS SDK v3** | v3.490+ | Modular imports (only DynamoDB, S3, SNS clients) reduce Lambda cold starts for the 2-second response requirement. First-class TypeScript types. Middleware integrates with EnvironmentDetector. |
| **pdfkit** | v0.14 | Pure JavaScript — no native dependencies, deployable to Lambda without platform compilation. Alternatives (Puppeteer: 200MB+ Chrome binary; wkhtmltopdf: native binaries) are impractical for serverless. |
| **uuid** | v9.0 | Generates unique IDs without database coordination. Essential for concurrent Lambda instances creating records in parallel (co-onboarding workflow). |
| **cors** | v2.8 | Local dev only (frontend port 8080 → backend port 3000). In production, API Gateway handles CORS. |

## Frontend

| Tool | Version | Reasoning |
|------|---------|-----------|
| **React** | v18.x | Professional familiarity. Component architecture maps to three role-specific interfaces (vet, owner, public). AuthContext provider handles role-based state without external state management. |
| **Vite** | v5.x | Near-instant HMR during development (only changed module re-evaluated). First-class TypeScript support. Chosen over deprecated Create React App and slower Webpack. |
| **React Router** | v6.x | Nested layouts for role-based routing (`/vet/*`, `/owner/*`, `/search`). RouteGuard wraps protected routes and redirects unauthorized users. |
| **Lucide React** | — | Tree-shakeable icons — only imported icons included in bundle. Lighter than FontAwesome. |

## Testing

| Tool | Version | Reasoning |
|------|---------|-----------|
| **Vitest** | v1.1 | Native ESM and Vite compatibility — no transformation config needed. Same API as Jest (describe/it/expect). One runner for both frontend and backend. Chosen over Jest (ESM issues) and Mocha (requires separate assertion/TypeScript setup). |
| **fast-check** | v3.15 | Property-based testing: generates hundreds of random inputs per test, automatically shrinks failures to minimal counterexamples. Validates universal invariants (authorization, privacy, data integrity) that hand-picked examples would miss. Most actively maintained PBT library for TypeScript. |

**Why not Selenium/Cypress?** The test strategy validates business logic (authorization, data integrity, privacy) at unit/integration level where tests run in milliseconds. Browser automation overhead was not justified for an MVP — can be added post-launch without conflicting with Vitest.

## Infrastructure & DevOps

| Tool | Version | Reasoning |
|------|---------|-----------|
| **Docker** | v24.x | Reproducible environment across machines. Prerequisite for LocalStack. |
| **LocalStack** | v3.8 | Emulates DynamoDB, S3, SNS locally — no AWS costs, no internet required. Critical for academic project with limited credits. Note: Cognito IDP unavailable on free tier → motivated LocalAuthService. |

## AWS Services (Production Target)

**Why AWS?** Professional familiarity (AWS Solutions Architect Associate certification). Understood the service landscape — could focus on implementation rather than learning a new platform.

| Service | Reasoning |
|---------|-----------|
| **Lambda** | Pay-per-invocation for variable traffic (spikes when pets go missing, quiet otherwise). Scales from zero without server management. |
| **DynamoDB** | Single-digit millisecond responses at any scale (satisfies 2s requirement). Single-table design with 6 GSIs supports all access patterns without joins. Zero cost when idle. |
| **S3** | Stores images (up to 10MB) and generated PDFs. Pre-signed URLs enable direct browser uploads without routing through Lambda. |
| **Cognito** | Managed JWT authentication with custom attributes (`userType`, `clinicId`) for stateless authorization. Handles password hashing, token rotation, account recovery — security-critical operations not to implement from scratch. |
| **API Gateway** | HTTPS termination, rate limiting, native Cognito authorizer. Routes to Lambda functions and handles CORS in production. |
| **SNS / SES** | SNS: fan-out missing pet alerts to multiple clinics simultaneously. SES: transactional emails (claiming confirmations, found notifications). Pay-per-message. |

## Key Architectural Decisions

1. **Single-table DynamoDB** — One table to manage. Enables atomic transactions across entity types (e.g., ownership transfer updates pet record and GSI index in one TransactWriteItems call).

2. **Property-based testing** — Validates correctness properties across hundreds of random inputs, catching edge cases hand-picked examples miss (concurrent claims, Unicode names, boundary values).

3. **Environment detection pattern** — `EnvironmentDetector` switches between LocalStack and AWS endpoints via environment variables. Identical application code runs in both environments.

4. **DynamoDB-backed LocalAuthService** — Realistic auth flow for local testing since Cognito IDP is unavailable on LocalStack free tier. Mock tokens carry same claims structure as real Cognito JWTs.

5. **Express wrapper for Lambda handlers** — Same handler functions run as Lambda (production) and Express routes (local). Environment parity with fast development feedback.
