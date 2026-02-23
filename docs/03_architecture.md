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

### System Context Diagram (Level 1)

The System Context Diagram defines the external boundaries of the Paw Print Profile application. It illustrates the B2B2C interaction model, distinguishing between the data-creation role of Veterinary Clinics, the management role of Pet Owners, and the read-only consumption role of Public Users. Furthermore, it outlines external dependencies, specifically delegating authentication to AWS Cognito and notification delivery to AWS SES.

```mermaid
graph TB
    subgraph "External Systems"
        Cognito["AWS Cognito<br/>(Authentication)"]
        SES["AWS SES<br/>(Email Notifications)"]
    end
    
    subgraph "Primary Actors"
        VetClinic["Veterinary Clinic<br/>(B2B)"]
        PetOwner["Pet Owner<br/>(B2C)"]
        PublicUser["Public/Shelter<br/>(Read-Only)"]
    end
    
    subgraph "Paw Print Profile System"
        System["Paw Print Profile<br/>Serverless Web Application"]
    end
    
    VetClinic -->|Create Medical Profiles<br/>Manage Records| System
    PetOwner -->|Claim Profiles<br/>Enrich Data<br/>Emergency Tools| System
    PublicUser -->|Search Lost Pets<br/>Access Care Snapshots| System
    
    System -->|Authenticate Users| Cognito
    System -->|Send Notifications| SES
    Cognito -->|Auth Tokens| System
    SES -->|Delivery Status| System
```

### Component Architecture Diagram (Level 2)

This Component Architecture Diagram illustrates the internal structural design of the system using an AWS Serverless paradigm. The client-side React applications interface with Amazon API Gateway, which securely routes traffic to domain-specific Lambda compute functions. State persistence is handled via a single-table Amazon DynamoDB design, while heavy binary assets, such as pet images and generated missing flyers, are stored in Amazon S3.

```mermaid
flowchart LR
    subgraph Client [Client Layer]
        VetUI["Veterinary Web App<br/>(React)"]
        OwnerUI["Pet Owner Web App<br/>(React)"]
        PublicUI["Public Search<br/>(React)"]
    end
    
    subgraph API [API & Auth Layer]
        APIGW["API Gateway"]
        Cognito["AWS Cognito<br/>User Pools"]
    end
    
    subgraph Compute [Compute Layer - Lambda Functions]
        CoOnboard["Pet Co-Onboarding<br/>Lambda"]
        Clinic["Clinic Management<br/>Lambda"]
        Search["Search Service<br/>Lambda"]
        Emergency["Emergency Tools<br/>Lambda"]
        Notify["Notification Service<br/>Lambda"]
    end
    
    subgraph Data [Data Layer]
        DDB[("DynamoDB<br/>(Single-Table Design)")]
        S3[("S3 Bucket<br/>(Images & Flyers)")]
    end
    
    subgraph External [External Services]
        SES["AWS SES<br/>(Email)"]
        SNS["AWS SNS<br/>(Notifications)"]
    end
    
    VetUI -->|HTTPS| APIGW
    OwnerUI -->|HTTPS| APIGW
    PublicUI -->|HTTPS| APIGW
    
    APIGW -->|Validate Token| Cognito
    APIGW --> CoOnboard
    APIGW --> Clinic
    APIGW --> Search
    APIGW --> Emergency
    
    CoOnboard --> DDB
    CoOnboard --> S3
    Clinic --> DDB
    Search --> DDB
    Search --> S3
    Emergency --> DDB
    Emergency --> S3
    
    CoOnboard -.->|Trigger| Notify
    Emergency -.->|Trigger| Notify
    
    Notify --> SNS
    Notify --> SES
```

### Use Case Diagram

The Use Case Diagram maps the functional requirements to their authorized actors, highlighting the strict separation of concerns within the Co-Onboarding model. It visualizes how the initial "Medical Profile Creation" is securely restricted to the Veterinary Clinic, while the subsequent "Profile Claiming," "Enrichment," and "Flyer Generation" are exclusively handed over to the Pet Owner.

```mermaid
flowchart LR
    subgraph "Paw Print Profile System"
        UC1["Create Medical Profile"]
        UC2["Manage Medical Records"]
        UC3["Claim Pet Profile"]
        UC4["Enrich Profile"]
        UC5["Report Missing Pet"]
        UC6["Generate Flyer"]
        UC7["Create Care Snapshot"]
        UC8["Search Lost Pets"]
        UC9["View Pet Details"]
        UC10["Manage Clinic"]
    end
    
    VetClinic["Veterinary Clinic"]
    PetOwner["Pet Owner"]
    PublicUser["Public/Shelter"]
    
    VetClinic -->|Create| UC1
    VetClinic -->|Manage| UC2
    VetClinic -->|Manage| UC10
    
    PetOwner -->|Claim| UC3
    PetOwner -->|Enrich| UC4
    PetOwner -->|Report| UC5
    PetOwner -->|Generate| UC6
    PetOwner -->|Create| UC7
    PetOwner -->|View| UC9
    
    PublicUser -->|Search| UC8
    PublicUser -->|View| UC9
    
    UC1 -.->|includes| UC2
    UC5 -.->|includes| UC6
    UC3 -.->|precedes| UC4
```

## Summary

This design document provides a comprehensive blueprint for Paw Print Profile, a B2B2C serverless web application that facilitates veterinary pet information management through a co-onboarding model. The architecture leverages AWS serverless services for scalability and cost-effectiveness, while Docker and LocalStack enable efficient local development and testing within academic project constraints.

### Key Design Features

**Co-Onboarding Model**: The system implements a two-phase onboarding process where veterinary clinics create medically verified pet profiles, and pet owners claim and enrich these profiles, ensuring data accuracy while enabling personalization.

**Controlled Access**: The system provides three levels of access - primary B2B (veterinary clinics), secondary B2C (pet owners), and extended read-only access (public, shelters, caregivers) - enabling comprehensive pet care coordination while maintaining data security.

**Environment Flexibility**: Automatic environment detection ensures seamless transitions between local development (LocalStack) and cloud deployment (AWS) without code changes, supporting both academic development and production scalability.

