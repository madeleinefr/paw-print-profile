# Design Document: Paw Print Profile

### Co-Onboarding Model

The system implements a two-phase onboarding process:

1. **Medical Onboarding (B2B)**: Veterinary clinics create initial medically verified pet profiles during routine visits, establishing the foundation of accurate medical data
2. **Owner Claiming (B2C)**: Pet owners claim profiles created by veterinarians using claiming codes, then enrich them with personal information and photos

### User Roles and Access Levels

- **Primary (B2B) - Veterinary Clinics**: Create medically verified pet profiles, manage medical records, and provide claiming codes to pet owners
- **Secondary (B2C) - Pet Owners**: Claim vet-created profiles, enrich with personal data, and utilize emergency tools for lost pet scenarios  
- **Extended (Read-Only) - Public/Shelters/Caregivers**: Access controlled information through public search, care snapshots, or emergency flyers

The system emphasizes developer experience by providing automatic environment detection that seamlessly switches between LocalStack (local) and AWS (cloud) without code changes, supporting both MVP development constraints and post-launch scalability requirements.

## Architecture

### System Context Diagram (C4 Level 1)

The System Context Diagram follows the C4 model (Level 1) as described by Simon Brown. It defines the external boundaries of the Paw Print Profile application, illustrating the B2B2C interaction model, distinguishing between the data-creation role of Veterinary Clinics, the management role of Pet Owners, and the read-only consumption role of Public Users. Furthermore, it outlines external dependencies, specifically delegating authentication to AWS Cognito and notification delivery to AWS SES. Elements use standard C4 tags: `[Person]` for actors, `[Software System]` for the system under design, and `[External System]` for dependencies.

```mermaid
graph TB
    Vet["Veterinarian\n[Person]\nCreates medically verified pet\nprofiles and manages medical records"]
    Owner["Pet Owner\n[Person]\nClaims pet profiles, enriches with\npersonal data, uses emergency tools"]
    Public["Public User / Shelter\n[Person]\nSearches for lost pets,\naccesses care snapshots"]

    PawPrint["Paw Print Profile\n[Software System]\nB2B2C serverless web application for\nveterinary pet information management\nthrough a co-onboarding model"]

    Cognito["AWS Cognito\n[External System]\nManaged authentication service\nproviding JWT tokens and user pools"]
    SES["AWS SES / SNS\n[External System]\nEmail and notification delivery for\nmissing pet alerts and platform messaging"]

    Vet -->|"Creates medical profiles,\nmanages records [HTTPS]"| PawPrint
    Owner -->|"Claims profiles, enriches data,\nreports missing [HTTPS]"| PawPrint
    Public -->|"Searches lost pets, contacts\nowners anonymously [HTTPS]"| PawPrint

    PawPrint -->|"Authenticates users [AWS SDK]"| Cognito
    PawPrint -->|"Sends notifications [AWS SDK]"| SES

    style Vet fill:#08427B,color:#fff,stroke:#073B6F
    style Owner fill:#08427B,color:#fff,stroke:#073B6F
    style Public fill:#08427B,color:#fff,stroke:#073B6F
    style PawPrint fill:#438DD5,color:#fff,stroke:#3C7FC0
    style Cognito fill:#999999,color:#fff,stroke:#8A8A8A
    style SES fill:#999999,color:#fff,stroke:#8A8A8A
```

### UML Component Diagram (Level 2)

This UML Component Diagram (UML 2.5, SS11.6) illustrates the internal structural design of the system using an AWS Serverless paradigm. Components are shown with the standard UML component notation (rectangle with the component stereotype). Dependencies between components are shown as dashed arrows with the use stereotype. The diagram shows how the client-side React applications interface with the API layer, which routes traffic to domain-specific compute functions. State persistence is handled via a single-table Amazon DynamoDB design, while heavy binary assets, such as pet images and generated missing flyers, are stored in Amazon S3.

**Deployment note:** This diagram represents the target AWS deployment architecture where each compute component maps to an individual AWS Lambda function behind API Gateway. In local development, the same handler modules run within a single Express.js server (`index.ts`) that replicates API Gateway routing. The layered separation is identical in both environments — only the entry point differs. The `EnvironmentDetector` class selects the appropriate service endpoints at startup, ensuring identical business logic executes locally and in production.

**Abstraction note:** For clarity, the diagram shows the primary domain-boundary services. Each compute component internally delegates to additional sub-services not shown here (e.g., Emergency Tools internally uses `FlyerGenerationService`, `MissingPetService`, `PhotoGuidanceService`, and `CareSnapshotService`; Pet Co-Onboarding uses `ProfileClaimingService`). An `AuthorizationService` is used as a cross-cutting concern by all handlers to enforce role-based access control.

```plantuml
@startuml Component Diagram
skinparam componentStyle uml2
left to right direction

package "Client Layer" <<subsystem>> {
    [Veterinary Web App] <<component>> as VetUI
    [Pet Owner Web App] <<component>> as OwnerUI
    [Public Search App] <<component>> as PublicUI
}

package "API & Authentication Layer" <<subsystem>> {
    [API Gateway] <<component>> as APIGW
    [AWS Cognito\nUser Pools] <<component>> as Cognito
    note bottom of Cognito
        Local dev uses
        LocalAuthService
        (DynamoDB-backed)
    end note
}

package "Compute Layer (AWS Lambda)" <<subsystem>> {
    [Pet Co-Onboarding\nService] <<component>> as CoOnboard
    [Clinic Management\nService] <<component>> as Clinic
    [Search Service] <<component>> as Search
    [Emergency Tools\nService] <<component>> as Emergency
    [Notification\nService] <<component>> as Notify
}

package "Data Access Layer" <<subsystem>> {
    [PetRepository] <<component>> as PetRepo
    [ClinicRepository] <<component>> as ClinicRepo
    [ImageRepository] <<component>> as ImageRepo
    [CareSnapshotRepository] <<component>> as SnapshotRepo
}

package "Data Layer" <<subsystem>> {
    [<<datastore>>\nDynamoDB\n(Single-Table Design)] <<component>> as DDB
    [<<storage>>\nS3 Bucket\n(Images & Flyers)] <<component>> as S3
}

package "External Services" <<subsystem>> {
    [AWS SES] <<component>> as SES
    [AWS SNS] <<component>> as SNS
}

' Client to API
VetUI ..> APIGW : <<use>>
OwnerUI ..> APIGW : <<use>>
PublicUI ..> APIGW : <<use>>

' Auth
APIGW ..> Cognito : <<use>>

' API to Compute
APIGW ..> CoOnboard : <<delegate>>
APIGW ..> Clinic : <<delegate>>
APIGW ..> Search : <<delegate>>
APIGW ..> Emergency : <<delegate>>

' Compute to Data Access
CoOnboard ..> PetRepo : <<use>>
CoOnboard ..> ImageRepo : <<use>>
Clinic ..> ClinicRepo : <<use>>
Search ..> PetRepo : <<use>>
Search ..> ClinicRepo : <<use>>
Emergency ..> PetRepo : <<use>>
Emergency ..> SnapshotRepo : <<use>>
Emergency ..> ImageRepo : <<use>>

' Data Access to Storage
PetRepo ..> DDB : <<use>>
ClinicRepo ..> DDB : <<use>>
ImageRepo ..> DDB : <<use>>
ImageRepo ..> S3 : <<use>>
SnapshotRepo ..> DDB : <<use>>

' Notifications
CoOnboard ..> Notify : <<trigger>>
Emergency ..> Notify : <<trigger>>
Notify ..> SNS : <<use>>
Notify ..> SES : <<use>>

@enduml
```

### UML Use Case Diagram

The Use Case Diagram (UML 2.5, SS18.1) maps the primary functional requirements to their authorized actors, highlighting the strict separation of concerns within the Co-Onboarding model. It visualizes how the initial "Medical Profile Creation" is securely restricted to the Veterinary Clinic, while the subsequent "Profile Claiming," "Enrichment," and "Flyer Generation" are exclusively handed over to the Pet Owner. Actors are represented as stick figures (external entities interacting with the system). Use cases are shown as ovals within the system boundary rectangle. Actor-to-use-case associations are plain lines (no arrowheads). Relationships between use cases use standard UML stereotypes: <<include>> for mandatory sub-behavior and <<extend>> for optional/conditional behavior.

**Scope note:** For readability, this diagram shows the primary use cases that define the system's core value proposition. Additional sub-features (e.g., photo upload guidance, vaccine reminder scheduling, platform messaging delivery) are implemented but omitted here to maintain diagram clarity. The full set of implemented features is documented in the Requirements Verification document.

```plantuml
@startuml Use Case Diagram
left to right direction

actor "Veterinarian" as Vet
actor "Pet Owner" as Owner
actor "Public User /\nShelter" as Public

rectangle "Paw Print Profile System" {
    usecase "Create Account" as UC16
    usecase "Register Clinic" as UC10
    usecase "Create Medical Profile" as UC1
    usecase "Manage Medical Records\n(Vaccines, Surgeries)" as UC2
    usecase "Claim Pet Profile" as UC3
    usecase "Enrich Profile\n(Photos, Contact)" as UC4
    usecase "Report Missing Pet" as UC5
    usecase "Generate Missing\nPet Flyer" as UC6
    usecase "Mark Pet as Found" as UC13
    usecase "Create Care Snapshot" as UC7
    usecase "Search Lost Pets" as UC8
    usecase "Contact Pet Owner\n(Anonymous)" as UC14
    usecase "Access Care Snapshot" as UC15
    usecase "Upload Pet Photos" as UC11
    usecase "Manage Account\nSettings" as UC12
}

Vet -- UC16
Vet -- UC10
Vet -- UC1
Vet -- UC2

Owner -- UC16
Owner -- UC3
Owner -- UC5
Owner -- UC13
Owner -- UC7
Owner -- UC12

Public -- UC8
Public -- UC15

UC1 ..> UC2 : <<include>>
UC3 <.. UC4 : <<extend>>
UC4 <.. UC11 : <<extend>>
UC5 <.. UC6 : <<extend>>
UC8 <.. UC14 : <<extend>>

@enduml
```

## Summary

This design document provides a comprehensive blueprint for Paw Print Profile, a B2B2C serverless web application that facilitates veterinary pet information management through a co-onboarding model. The architecture leverages AWS serverless services for scalability and cost-effectiveness, while Docker and LocalStack enable efficient local development and testing within academic project constraints.

### Key Design Features

**Co-Onboarding Model**: The system implements a two-phase onboarding process where veterinary clinics create medically verified pet profiles, and pet owners claim and enrich these profiles, ensuring data accuracy while enabling personalization.

**Controlled Access**: The system provides three levels of access — primary B2B (veterinary clinics), secondary B2C (pet owners), and extended read-only access (public, shelters, caregivers) — enabling comprehensive pet care coordination while maintaining data security.

**Environment Flexibility**: Automatic environment detection ensures seamless transitions between local development (LocalStack) and cloud deployment (AWS) without code changes, supporting both academic development and production scalability.
