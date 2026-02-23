# Paw Print Profile 🐾

Paw Print Profile is a B2B2C serverless web application that modernizes veterinary record-keeping and provides a rapid-response system for lost pets. 

By utilizing a "Co-Onboarding" model, veterinary clinics establish a medically verified baseline for a pet's digital profile, which the pet owner can then claim, enrich, and use to generate emergency missing pet flyers or secure care snapshots.

## 📚 Project Documentation (Phase 1)

All architectural decisions, requirements, and system designs are documented using a "Docs as Code" approach. Please refer to the `docs/` directory for the complete system conception:

- [Project Profile & Glossary](./docs/01_project_profile.md) (Business Context, Target Groups, Domain and Technical terminology)
- [System Requirements](./docs/02_requirements.md) (Functional Requirements, NFRs)
- [Architecture & Diagrams](./docs/03_architecture.md) (UML Context, Component, and Use Case Diagrams)

## 🛠️ Planned Technology Stack

This project is currently in the architectural phase. The planned implementation (Phase 2) will utilize:

**Infrastructure & Backend:**
- **Architecture:** AWS Serverless 
- **Compute:** AWS Lambda (Node.js/TypeScript)
- **Database:** Amazon DynamoDB
- **Storage:** Amazon S3 (Images & Flyers)
- **Authentication:** AWS Cognito
- **Notifications**: Amazon SNS/SES
- **Local Emulation:** Docker, Docker Compose, & LocalStack

**Frontend:**
- **Framework:** React (TypeScript)

## 🚀 Development

*(Note: Detailed setup instructions, LocalStack configuration, and testing commands will be added here during Phase 2 Implementation).*
