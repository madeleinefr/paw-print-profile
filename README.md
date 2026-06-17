# Paw Print Profile 🐾

A B2B2C serverless web application that modernizes veterinary record-keeping and provides a rapid-response system for lost pets.

Veterinary clinics create medically verified pet profiles ("Co-Onboarding"), which pet owners claim, enrich with photos and personal data, and use to generate emergency missing pet flyers or secure care snapshots for temporary caregivers.

## 📚 Documentation

All architectural decisions, requirements, and system designs are in the `docs/` directory:

- [Project Profile & Glossary](./docs/01_project_profile.md)
- [System Requirements](./docs/02_requirements.md)
- [Architecture & Diagrams](./docs/03_architecture.md)
- [Design & Implementation](./docs/05_design_and_implementation.md)
- [Frameworks & Tools](./docs/06_frameworks_and_tools.md)
- [Test Case Specifications](./docs/07_test_case_specifications.md)
- [Requirements Verification](./docs/08_requirements_verification.md)
- [Testing Strategy](./docs/09_testing_strategy.md)

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| Compute | AWS Lambda (Node.js 22 / TypeScript 5.3) |
| Database | Amazon DynamoDB (single-table, 6 GSIs) |
| Storage | Amazon S3 (pet images & PDF flyers) |
| Auth | AWS Cognito (local: DynamoDB-backed LocalAuthService) |
| Notifications | Amazon SNS / SES |
| Frontend | React 18, Vite, React Router v6 |
| Testing | Vitest, fast-check (property-based testing) |
| Local Dev | Docker Compose, LocalStack 3.8 |

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2 installed
- No other dependencies required — everything runs in containers

> **Note:** No `.env` configuration needed for Docker-based development. All environment variables are set in `docker-compose.yml`. The `backend/.env` file is only used when running the backend directly outside Docker (e.g., for running tests locally with `npm test`).

### 1. Start all services

```bash
git clone <repository-url>
cd PawPrint
docker compose up -d
```

This starts:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:8080 | React web application |
| Backend | http://localhost:3000 | Express API server |
| LocalStack | http://localhost:4566 | AWS emulator (DynamoDB, S3, SNS) |

Wait ~30 seconds for all services to initialize (backend runs `npm ci` on first start).

### 2. Seed test data

```bash
docker compose exec backend npx tsx src/infrastructure/seed-data.ts
```

This creates the DynamoDB table and populates it with test data including user accounts, pets with medical records, clinics, and veterinary history.

### 3. Log in

Open http://localhost:8080 and use these credentials:

| Role | Email | Password |
|------|-------|----------|
| Veterinarian | `dr.weber@tierarzt-pfoetchen.de` | `Test1234!` |
| Pet Owner (Munich) | `anna.mueller@beispiel.de` | `Test1234!` |
| Pet Owner (Berlin) | `thomas.schmidt@beispiel.de` | `Test1234!` |
| Pet Owner (Hamburg) | `lisa.wagner@beispiel.de` | `Test1234!` |
| Pet Owner (Cologne) | `markus.becker@beispiel.de` | `Test1234!` |

Or click **Sign up** to create a new account.

### 4. Explore the features

**Public (no login required):**
- Search for missing pets by species/breed
- Contact a pet owner anonymously via the contact form
- Access care snapshots using an access code

**As Veterinarian:**
- View clinic dashboard with pending claims and claiming codes
- Create new medical pet profiles
- Add vaccine and surgery records
- Manage clinic settings

**As Pet Owner:**
- Claim a pet profile using a claiming code (copy from vet dashboard)
- Report a pet as missing → download PDF flyer
- Mark a missing pet as found
- Upload pet photos (with photography guidance)
- Generate care snapshots for temporary caregivers
- Manage account settings (contact details, address)

### Stopping / Resetting

```bash
docker compose down          # Stop all services
docker compose down -v       # Stop and remove volumes (full reset)
docker compose up -d         # Restart
docker compose exec backend npx tsx src/infrastructure/seed-data.ts  # Re-seed
```

## ☁️ AWS Cloud Deployment

### Prerequisites

- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed and configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed
- Node.js 20+ installed locally (for frontend build via `deploy-frontend.sh`)
- An AWS account with permissions for Lambda, DynamoDB, S3, Cognito, API Gateway, SNS, and CloudFormation

### 1. Deploy the backend

```bash
sam build
sam deploy --guided
```

On first deploy, SAM will prompt for:
- Stack name: `paw-print-profile`
- Region: `eu-central-1` (or your preferred region)
- Confirm changes and allow IAM role creation

Subsequent deploys:

```bash
sam build && sam deploy
```

### 2. Deploy the frontend

The frontend deploys to S3 + CloudFront. It automatically pulls the API URL from the backend stack outputs:

```bash
./scripts/deploy-frontend.sh
```

This script:
1. Reads the API Gateway URL from the backend CloudFormation stack
2. Deploys the frontend infrastructure (S3 bucket + CloudFront distribution) via `template-frontend.yaml`
3. Builds the React app with the production API URL
4. Uploads the build to S3 and invalidates the CloudFront cache

CloudFront may take 5–10 minutes to propagate globally after the first deploy.

### 3. Seed test data

Once the backend is deployed, seed the cloud environment with test accounts and sample data:

```bash
./scripts/seed-cloud.sh
```

This creates:
- Test user accounts (veterinarians and pet owners)
- Veterinary clinics in multiple German cities (Munich, Berlin, Hamburg, Cologne)
- Pet profiles in various states (Active, Pending Claim, Missing)
- Sample missing pet reports with flyers

### 4. Verify deployment

After seeding, the script prints a summary with login credentials and claiming codes. You can verify the deployment by:

1. Opening the CloudFront URL from the `deploy-frontend.sh` output
2. Signing in with the test credentials printed by `seed-cloud.sh`
3. Searching for missing pets on the public search page (no login required)

### Cloud architecture

The deployed stack includes:

| Resource | Service |
|----------|---------|
| API | API Gateway (REST) with Cognito authorizer |
| Compute | 5 Lambda functions (TypeScript, arm64) |
| Database | DynamoDB (single-table, 6 GSIs, PAY_PER_REQUEST) |
| Storage | S3 (pet images, flyers, care snapshots) |
| Auth | Cognito User Pool with custom attributes |
| Notifications | SNS topics (claiming confirmations, missing pet alerts) |
| Frontend | S3 + CloudFront (SPA hosting) |

## 🧪 Running Tests

Tests require LocalStack running on `localhost:4566`. If Docker Compose is up, it's already running.

### Backend (~464 tests)

```bash
cd backend
npm install
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:property     # Property-based tests only
npm run test:integration  # Integration tests only
npm run test:coverage     # All tests + coverage report
```

### Frontend (~69 tests)

```bash
cd frontend
npm install
npm run test:unit         # All frontend tests
```

### Test summary

```
Backend:  ~464 tests, 26 files, ~25s (against LocalStack)
Frontend:  ~69 tests,  4 files, <1s (fetch mocking)
Total:    ~533 automated tests
```

## 📁 Project Structure

```
PawPrint/
├── backend/
│   ├── src/
│   │   ├── errors/          # Centralized error handling
│   │   ├── handlers/        # Lambda handlers (Express wrappers locally)
│   │   ├── infrastructure/  # AWS clients, environment detection, DB init, seed data
│   │   ├── models/          # TypeScript interfaces (DynamoDB entities)
│   │   ├── repositories/    # Data access layer (DynamoDB, S3)
│   │   ├── services/        # Business logic (co-onboarding, search, emergency tools)
│   │   └── validation/      # Input validation
│   └── tests/               # Property-based, unit, and integration tests
├── frontend/
│   └── src/
│       ├── auth/            # Authentication context and route guards
│       ├── layout/          # App shell with role-based navigation
│       └── pages/
│           ├── vet/         # Veterinarian interface (B2B)
│           ├── owner/       # Pet owner interface (B2C)
│           └── public/      # Public interface (search, contact, care snapshots)
├── docs/                    # Architecture and requirements documentation
├── docker-compose.yml       # Local development environment
└── .github/workflows/       # CI/CD pipeline (GitHub Actions)
```

## 🔑 Key Concepts

### Co-Onboarding Model
1. **Veterinarian** creates a medically verified pet profile → generates a claiming code
2. **Pet Owner** claims the profile using the code → enriches with photos and contact info
3. **Public** can search for missing pets and contact owners anonymously

### Privacy Protection
Owner phone numbers and email addresses are hidden from public search results. Public users contact owners through an anonymous messaging form. Clinic contact information is always displayed.

### 3-Click Missing Pet Flyer
1. Click "Report Missing" on the pet dashboard
2. Enter last seen location + confirm
3. Download the generated PDF flyer
