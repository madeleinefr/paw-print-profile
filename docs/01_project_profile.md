## 1. Introduction

Paw Print Profile is a B2B2C serverless web application that facilitates veterinary pet information management through a co-onboarding model. The system enables veterinary clinics to create medically verified pet profiles, allows pet owners to claim and enrich these profiles, and provides controlled access to shelters, public users, and pet care providers for emergency and care coordination purposes.

### 1.1 Business Context

**Primary Market (B2B)**: Veterinary clinics serve as the primary entry point, creating initial medically verified pet profiles during routine visits.

**Secondary Market (B2C)**: Pet owners claim profiles created by veterinarians, enrich them with personal information and photos, and utilize emergency tools for lost pet scenarios.

**Extended Access (Read-Only)**: Animal shelters, public users, and pet care providers access specific information through controlled sharing mechanisms.

### 1.2 Co-Onboarding Model

The system implements a two-phase onboarding process:
1. **Medical Onboarding**: Veterinary clinics create verified pet profiles with medical data
2. **Owner Claiming**: Pet owners claim and personalize their pet's profile

## 2. Glossary

- **Amazon_CloudFront**: A content delivery network (CDN) used to host and serve the production frontend application globally with low latency
- **Amazon_DynamoDB**: A fully managed NoSQL database service utilized for the system's data persistence, specifically employing a Single-Table Design
- **Amazon_S3**: Amazon Simple Storage Service, utilized to securely store and serve heavy binary assets like pet images and generated PDF flyers
- **Amazon_SNS**: Simple Notification Service, used to send missing pet alerts to nearby clinics and platform messaging notifications to pet owners
- **API_Gateway**: The AWS service that acts as the secure "front door," routing HTTPS requests from the React frontends to the backend compute functions
- **AWS_CloudFormation**: The underlying AWS infrastructure-as-code service that provisions and manages cloud resources from declarative templates; SAM builds on top of it
- **AWS_Cognito**: The cloud authentication service used to manage user pools and secure login sessions for both veterinarians and pet owners
- **AWS_Lambda**: The serverless compute service that runs the application's backend business logic (e.g., Search Service, Co-Onboarding Service) without requiring server provisioning
- **AWS_SAM (Serverless Application Model)**: An infrastructure-as-code framework extending CloudFormation to define and deploy serverless applications (Lambda, API Gateway, DynamoDB) from a single template file
- **AWS_Serverless**: A cloud computing execution model where Amazon Web Services dynamically manages the allocation and provisioning of servers
- **B2B2C**: Business-to-Business-to-Consumer — a model where the business (veterinary clinic) creates value that is consumed by the end consumer (pet owner) and accessible to the public
- **Care_Snapshot**: Secure, read-only summary provided to temporary caregivers, accessible via a time-limited access code
- **Claiming_Code**: A unique 6-character alphanumeric code (format: CLAIM-XXXXXX) generated when a veterinarian creates a pet profile, given to the pet owner to claim ownership
- **Co-Onboarding**: Two-phase process where veterinarians create initial pet profiles and owners claim them
- **Controlled_Sharing**: Permission-based access to pet information for authorized third parties
- **Docker**: A software platform used to containerize the application, ensuring consistent local development and testing environments
- **Emergency_Tools**: Features available to pet owners for lost pet scenarios (missing pet flyer generation, care snapshots)
- **Environment_Detection**: Automatic identification of the runtime environment (local vs. cloud) to select appropriate service endpoints without code changes
- **Global_Secondary_Index (GSI)**: A DynamoDB index that allows efficient queries on non-primary-key attributes, enabling access patterns like clinic-pet lookup, claiming code lookup, and species-based search
- **Kanban**: The agile project management methodology used to visualize work, limit Work-In-Progress (WIP), and ensure a continuous flow of development
- **LocalAuthService**: A DynamoDB-backed authentication service that mirrors the AWS Cognito interface for local development, since Cognito is unavailable on LocalStack's free tier
- **LocalStack**: A cloud service emulator that allows local testing of AWS applications (like DynamoDB and Lambda) without incurring actual cloud costs
- **Medical_Verification**: Veterinary validation of pet identity, species, breed, and medical history
- **Microchip_Number**: A unique identification number from an implanted RFID chip, used by veterinarians to officially identify a pet
- **Missing_Pet_Flyer**: Public PDF document generated for lost pet identification, containing pet photo, description, and authorized contact information
- **MVP**: A minimal viable product, the earliest testable version of the application, that includes only the core functional requirements needed for the Phase 2 submission
- **Pet_Image**: Photograph with descriptive tags for identification
- **Pet_Owner**: Individual who claims and manages a pet profile created by a veterinarian
- **Pet_Profile**: Complete record containing medical and personal information about a pet
- **Profile_Claiming**: Process by which pet owners take ownership of vet-created profiles using a claiming code
- **Profile_Status**: The lifecycle state of a pet profile — "Pending Claim" (awaiting owner), "Active" (claimed and operational), or "Missing" (reported lost)
- **Property-Based_Testing (PBT)**: A testing methodology that generates hundreds of randomized inputs per test cycle to verify system invariants universally, as opposed to example-based testing with fixed inputs
- **Public_Search**: Unauthenticated search functionality for lost pet identification
- **React**: The component-based JavaScript library used to build the interactive user interfaces for the clinic, pet owner, and public web applications
- **Shelter**: An animal rescue organization that utilizes the system's public search to identify found animals
- **Single-Table_Design**: A DynamoDB data modeling pattern where all entities (pets, clinics, users, images) are stored in one table with composite keys and Global Secondary Indexes for efficient access patterns
- **Surgery_Record**: Medical record of surgical procedures
- **System**: Paw Print Profile application as a whole
- **TypeScript**: A statically-typed superset of JavaScript used as the primary programming language for both the backend (Lambda handlers, services) and frontend (React components)
- **Vaccine_Record**: Medical record of administered vaccinations
- **Veterinary_Clinic**: Licensed veterinary practice that creates medically verified pet profiles