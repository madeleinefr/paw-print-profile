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

- **AWS_Serverless**: A cloud computing execution model where Amazon Web Services dynamically manages the allocation and provisioning of servers
- **Care_Snapshot**: Secure, read-only summary provided to temporary caregivers
- **Co-Onboarding**: Two-phase process where veterinarians create initial pet profiles and owners claim them
- **Controlled_Sharing**: Permission-based access to pet information for authorized third parties
- **Docker**: A software platform used to containerize the application, ensuring consistent local development and testing environments
- **Emergency_Tools**: Features available to pet owners for lost pet scenarios
- **Kanban**: The agile project management methodology used to visualize work, limit Work-In-Progress (WIP), and ensure a continuous flow of development
- **LocalStack**: A cloud service emulator that allows local testing of AWS applications (like DynamoDB and Lambda) without incurring actual cloud costs
- **Medical_Verification**: Veterinary validation of pet identity, species, breed, and medical history
- **Microchip_Number**: A unique identification number from an implanted RFID chip, used by veterinarians to officially identify a pet
- **Missing_Pet_Flyer**: Public document generated for lost pet identification
- **MVP**: A minimal viable product, the earliest testable version of the application, that includes only the core functional requirements needed for the Phase 2 submission
- **Pet_Image**: Photograph with descriptive tags for identification
- **Pet_Owner**: Individual who claims and manages a pet profile created by a veterinarian
- **Pet_Profile**: Complete record containing medical and personal information about a pet
- **Profile_Claiming**: Process by which pet owners take ownership of vet-created profiles
- **Public_Search**: Unauthenticated search functionality for lost pet identification
- **Shelter**: An animal rescue organization that utilizes the system's public search to identify found animals
- **Surgery_Record**: Medical record of surgical procedures
- **System**: Paw Print Profile application as a whole
- **Vaccine_Record**: Medical record of administered vaccinations
- **Veterinary_Clinic**: Licensed veterinary practice that creates medically verified pet profiles