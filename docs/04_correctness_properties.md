# Correctness Properties: Paw Print Profile

## Overview

This document defines the formal correctness properties used to validate the Paw Print Profile system through Property-Based Testing (PBT). Each property encodes a specification that the software must satisfy, and is validated by executable tests using the [fast-check](https://github.com/dubzzz/fast-check) library with a minimum of 100 randomized iterations per property.

Properties are organized by functional domain and mapped to the requirements defined in [02_requirements.md](./02_requirements.md).

## Property Index

| # | Property Name | Domain | Requirements | Test File |
|---|---|---|---|---|
| 1 | Pet data persistence | Data Layer | [FR-03], [FR-05] | `pet-repository.property.test.ts` |
| 2 | Complete pet record retrieval | Service Layer | [FR-03], [FR-05] | `co-onboarding-service.property.test.ts` |
| 3 | Vaccine record persistence | Data Layer | [FR-06] | `pet-repository.property.test.ts` |
| 4 | Surgery record persistence | Data Layer | [FR-07] | `pet-repository.property.test.ts` |
| 5 | Pet update persistence | Data Layer | [FR-05] | `pet-repository.property.test.ts` |
| 6 | Age validation | Validation | [NFR-COMP-03] | `validators.property.test.ts` |
| 7 | Image format validation | Validation | [NFR-COMP-03] | `validators.property.test.ts` |
| 8 | Image size validation | Validation | [NFR-COMP-03] | `validators.property.test.ts` |
| 9 | Required field validation | Validation | [NFR-USA-04] | `validators.property.test.ts` |
| 10 | Image storage and retrieval | Data Layer | [FR-05] | `image-repository.property.test.ts` |
| 11 | Unique image URLs | Data Layer | [FR-05], [NFR-COMP-03] | `image-repository.property.test.ts` |
| 12 | Search criteria matching | Service Layer | [FR-11], [FR-12] | `search-service.property.test.ts` |
| 13 | Complete search results | Service Layer | [FR-11], [FR-12] | `search-service.property.test.ts` |
| 14 | Clinic data persistence | Data Layer | [FR-01] | `clinic-repository.property.test.ts` |
| 15 | Unique clinic identifiers | Data Layer | [FR-01] | `clinic-repository.property.test.ts` |
| 16 | License number uniqueness | Data Layer | [FR-02] | `clinic-repository.property.test.ts` |
| 17 | Unique pet identifiers | Service Layer | [FR-03] | `co-onboarding-service.property.test.ts` |
| 18 | Claiming code validation and expiry | Data/Service | [FR-03], [FR-04] | `co-onboarding-service.property.test.ts` |
| 19 | Profile ownership transfer | Data/Service | [FR-04] | `co-onboarding-service.property.test.ts` |
| 20 | Pet onboarding notification | Service Layer | [FR-03] | `notification-service.property.test.ts` |
| 21 | Clinic pet list completeness | Service Layer | [FR-01] | `clinic-service.property.test.ts` |
| 22 | Clinic pet list fields | Service Layer | [FR-01] | `clinic-service.property.test.ts` |
| 23 | Claiming code uniqueness and expiry | Service Layer | [FR-03], [FR-04] | `co-onboarding-service.property.test.ts` |
| 24 | Pagination consistency | Service Layer | [FR-01] | `clinic-service.property.test.ts` |
| 25 | Durability before confirmation | Data Integrity | [NFR-REL-04] | `data-integrity.property.test.ts` |
| 26 | Concurrent update safety | Data Integrity | [NFR-REL-04] | `data-integrity.property.test.ts` |
| 27 | Transaction rollback | Data Integrity | [NFR-REL-04] | `data-integrity.property.test.ts` |
| 28 | Referential integrity | Data Integrity | [NFR-REL-04] | `data-integrity.property.test.ts` |
| 29 | Profile ownership transfer atomicity | Data Integrity | [FR-04], [NFR-REL-04] | `profile-claiming-transaction.property.test.ts` |
| 30 | Appointment reminder timing | Service Layer | [FR-06] | `notification-service.property.test.ts` |
| 33 | Missing pet flyer generation | Service Layer | [FR-08], [FR-09] | `emergency-tools-service.property.test.ts` |
| 34 | Flyer format | Service Layer | [FR-09] | `emergency-tools-service.property.test.ts` |
| 35 | Geographic clinic notification | Service Layer | [FR-08], [FR-10] | `notification-service.property.test.ts` |
| 36 | Found pet notification | Service Layer | [FR-10] | `notification-service.property.test.ts` |
| 37 | Local environment detection | Infrastructure | [NFR-ARCH-03], [NFR-DEV-04] | `environment-detector.property.test.ts` |
| 38 | Cloud environment detection | Infrastructure | [NFR-ARCH-03], [NFR-DEV-04] | `environment-detector.property.test.ts` |
| 39 | Environment variable configuration | Infrastructure | [NFR-ARCH-03], [NFR-DEV-01] | `aws-client-factory.property.test.ts` |
| 41 | Authentication requirement | Security | [NFR-SEC-01] | `authorization-service.property.test.ts` |
| 42 | Veterinarian authorization | Security | [NFR-SEC-02] | `authorization-service.property.test.ts` |
| 43 | Owner authorization | Security | [NFR-SEC-02] | `authorization-service.property.test.ts` |
| 44 | Public search access | Security | [NFR-SEC-03] | `authorization-service.property.test.ts` |
| 45 | Error logging | Error Handling | [NFR-OPS-02] | `error-handler.property.test.ts` |
| 46 | API error responses | Error Handling | [NFR-USA-04] | `error-handler.property.test.ts` |
| 47 | Structured logging format | Error Handling | [NFR-OPS-02] | `error-handler.property.test.ts` |
| 48 | Care snapshot unique access codes | Service Layer | [FR-13] | `care-snapshot-service.property.test.ts` |
| 49 | Care snapshot access validation | Service Layer | [FR-13] | `care-snapshot-service.property.test.ts` |
| 50 | Care snapshot content correctness | Service Layer | [FR-13] | `care-snapshot-service.property.test.ts` |
| 51 | Care snapshot expiry enforcement | Service Layer | [FR-13] | `care-snapshot-service.property.test.ts` |
| 52 | Care snapshot owner authorization | Service Layer | [FR-13], [NFR-SEC-02] | `care-snapshot-service.property.test.ts` |
| 53 | Snapshot medical detail exclusion | Service Layer | [FR-13] | `care-snapshot-service.property.test.ts` |
| 54 | Owner privacy in public search | Service Layer | [FR-15], [NFR-SEC-03] | `search-service.property.test.ts` |
| 55 | Pending claims visibility | Service Layer | [FR-01], [FR-02] | `clinic-service.property.test.ts` |
| 56 | 3-click flyer generation from dashboard | Service Layer | [NFR-USA-01] | `emergency-tools-service.property.test.ts` |
| 57 | Care snapshot generation and access | Service Layer | [FR-13] | `emergency-tools-service.property.test.ts` |
| 58 | Owner privacy protection in flyers | Service Layer | [FR-15] | `emergency-tools-service.property.test.ts` |
| 59 | Photo guidance display | Service Layer | [FR-16] | `emergency-tools-service.property.test.ts` |
| 60 | Co-onboarding role separation | Security | [NFR-SEC-02] | `authorization-service.property.test.ts` |
| 61 | Profile claiming authorization | Security | [NFR-SEC-02], [FR-04] | `authorization-service.property.test.ts` |
| 62 | Care snapshot access control | Security | [NFR-SEC-02], [FR-13] | `authorization-service.property.test.ts` |

## Property Definitions

### Core Data Persistence (Properties 1-5)

**Property 1: Pet data persistence**
*For any* valid medical profile input (name, species, breed, age, clinicId, verifyingVetId), `createMedicalProfile()` persists all fields and `findById()` returns an equivalent record with profileStatus "Pending Claim", medicallyVerified true, and a valid claiming code.

**Property 2: Complete pet record retrieval**
*For any* pet with associated vaccines, surgeries, and images, `findById()` via the service returns a `CompletePetRecord` containing the pet metadata, all vaccine records, all surgery records, and all image records.

**Property 3: Vaccine record persistence**
*For any* valid vaccine input (name, administered date, next due date, veterinarian), `addVaccine()` persists all fields and `getVaccines()` returns the record with all fields intact.

**Property 4: Surgery record persistence**
*For any* valid surgery input (type, date, notes, recovery info, veterinarian), `addSurgery()` persists all fields and `getSurgeries()` returns the record with all fields intact.

**Property 5: Pet update persistence**
*For any* existing pet and valid update data (name, age >= 0), `update()` persists changes and `findById()` reflects all modifications while preserving unchanged fields.

### Validation (Properties 6-9)

**Property 6: Age validation**
*For any* pet creation or update request, if the age is negative the system rejects the request; if the age is non-negative the system accepts it.

**Property 7: Image format validation**
*For any* image upload, if the format is JPEG, PNG, or WebP the system accepts it; otherwise the system rejects it.

**Property 8: Image size validation**
*For any* image upload, if the file size is 10 MB or less the system accepts it; if it exceeds 10 MB the system rejects it.

**Property 9: Required field validation**
*For any* pet or clinic creation request, if any required field is missing or improperly formatted, the system rejects the request with specific field-level error details.

### Image Management (Properties 10-11)

**Property 10: Image storage and retrieval**
*For any* valid image with tags, uploading produces a unique image ID and URL, and retrieving the pet's images includes that image with all its tags.

**Property 11: Unique image URLs**
*For any* two different images uploaded to the system, each receives a distinct URL and image ID.

### Search and Privacy (Properties 12-13, 54)

**Property 12: Search criteria matching**
*For any* search query with species, breed, and age range, all returned pets match the provided criteria.

**Property 13: Complete search results**
*For any* search result, each pet includes images with tags and clinic details.

**Property 54: Owner privacy in public search**
*For any* public search result, owner phone numbers and email addresses are hidden by default. Only clinic contact information is displayed.

### Clinic Management (Properties 14-16, 21-22, 24, 55)

**Property 14: Clinic data persistence**
*For any* valid clinic input, `create()` persists all fields and `findById()` returns an equivalent record.

**Property 15: Unique clinic identifiers**
*For any* two clinics created, each receives a distinct clinic ID.

**Property 16: License number uniqueness**
*For any* license number, `findByLicenseNumber()` returns the correct clinic, and duplicate license numbers are rejected.

**Property 21: Clinic pet list completeness**
*For any* clinic with N assigned pets, `getPets()` returns at least those N pets.

**Property 22: Clinic pet list fields**
*For any* pet in a clinic's list, the result includes petId, name, species, breed, age, clinicId, profileStatus, and createdAt.

**Property 24: Pagination consistency**
*For any* clinic with multiple pets, paginating with limit=1 yields the same set of pet IDs as fetching with a large limit.

**Property 55: Pending claims visibility**
*For any* newly created medical profile, it appears in `getPendingClaims()` for the clinic. After claiming, it no longer appears.

### Co-Onboarding (Properties 17-19, 23, 29)

**Property 17: Unique pet identifiers**
*For any* two medical profile creations, the resulting petIds are distinct.

**Property 18: Claiming code validation and expiry**
*For any* pet created via `createMedicalProfile()`, the generated claiming code is findable via `findByClaimingCode()`. An expired or already-claimed code is not findable.

**Property 19: Profile ownership transfer**
*For any* valid claiming code, `claimProfile()` atomically sets profileStatus to "Active", assigns ownerId/ownerName/ownerEmail/ownerPhone, removes the claiming code, and makes the pet findable via `findByOwner()`.

**Property 23: Claiming code uniqueness and expiry**
*For any* two pets created by any vet, their claiming codes are never identical.

**Property 29: Profile ownership transfer atomicity**
*For any* two concurrent claims of the same pet, exactly one succeeds and the other fails. No partial state is left.

### Data Integrity (Properties 25-28)

**Property 25: Durability before confirmation**
*For any* successfully confirmed write operation, the data is immediately readable.

**Property 26: Concurrent update safety**
*For any* two concurrent updates to the same record, the final state reflects one of the updates completely (no partial merges).

**Property 27: Transaction rollback**
*For any* multi-item transaction that fails, no partial changes are persisted.

**Property 28: Referential integrity**
*For any* pet deletion, associated records (vaccines, surgeries, images) are also removed.

### Notifications (Properties 20, 30, 35-36)

**Property 20: Pet onboarding notification**
*For any* successfully created medical profile, a notification event is triggered with the correct petId and clinicId.

**Property 30: Appointment reminder timing**
*For any* vaccine record with a nextDueDate, the reminder notification contains the correct pet and date information.

**Property 35: Geographic clinic notification**
*For any* missing pet report with a search radius, all clinics within that radius receive a notification.

**Property 36: Found pet notification**
*For any* pet marked as found, the previously notified clinics receive a found notification.

### Emergency Tools (Properties 33-34, 56-59)

**Property 33: Missing pet flyer generation**
*For any* pet reported as missing, a flyer is generated containing the pet's photo, name, species, breed, and contact information.

**Property 34: Flyer format**
*For any* generated flyer, the output is a valid PDF formatted for letter-size printing.

**Property 56: 3-click flyer generation from dashboard**
*For any* missing pet report, a single API call produces both the status update and the flyer URL in the response.

**Property 57: Care snapshot generation and access**
*For any* care snapshot request, the generated snapshot is accessible via its unique access code without authentication.

**Property 58: Owner privacy protection in flyers**
*For any* flyer generated with contactMethod "clinic", the owner's personal phone and email are not included.

**Property 59: Photo guidance display**
*For any* photo guidance request, the response includes tips for lighting, focus, angles, close-ups, and full-body shots, plus format requirements.

### Security and Authorization (Properties 41-44, 60-62)

**Property 41: Authentication requirement**
*For any* protected endpoint, unauthenticated requests are denied with 401.

**Property 42: Veterinarian authorization**
*For any* vet user and pet from their own clinic, access is granted. For pets from other clinics, access is denied with 403.

**Property 43: Owner authorization**
*For any* owner user and their own claimed pet, access is granted. For pets owned by others, access is denied with 403.

**Property 44: Public search access**
*For any* unauthenticated user, the search endpoint is accessible and returns results without owner PII.

**Property 60: Co-onboarding role separation**
*For any* vet-only operation (create pet, modify medical data), owner users are denied. For any owner-only operation (report missing, enrich profile), vet users are denied.

**Property 61: Profile claiming authorization**
*For any* claim attempt, only users with role "owner" can claim. Vets and unauthenticated users are denied.

**Property 62: Care snapshot access control**
*For any* care snapshot creation, only the pet's owner can create snapshots for their own pets.

### Error Handling (Properties 45-47)

**Property 45: Error logging**
*For any* error thrown during request handling, the error is logged with timestamp, context, and stack trace.

**Property 46: API error responses**
*For any* error, the API returns a structured JSON response with appropriate HTTP status code (400/401/403/404/500) and error details.

**Property 47: Structured logging format**
*For any* logged error, the output is valid JSON containing timestamp, level, message, and context fields.

### Care Snapshots (Properties 48-53)

**Property 48: Care snapshot unique access codes**
*For any* two care snapshots created, each receives a distinct access code.

**Property 49: Care snapshot access validation**
*For any* valid access code, the snapshot is retrievable. For invalid or expired codes, access is denied.

**Property 50: Care snapshot content correctness**
*For any* care snapshot, the returned data includes the correct pet name, care instructions, feeding schedule, medications, and emergency contacts.

**Property 51: Care snapshot expiry enforcement**
*For any* care snapshot past its expiry date, access is denied.

**Property 52: Care snapshot owner authorization**
*For any* care snapshot creation request, only the pet's owner can create snapshots for their own pets.

**Property 53: Snapshot medical detail exclusion**
*For any* care snapshot, sensitive medical details (vaccines, surgeries, full medical history) are excluded from the snapshot content.

### Infrastructure (Properties 37-39)

**Property 37: Local environment detection**
*For any* application instance with IS_LOCAL=true or LOCALSTACK_HOSTNAME set, `isLocal()` returns true and LocalStack endpoints are provided.

**Property 38: Cloud environment detection**
*For any* application instance without local environment variables, `isLocal()` returns false and endpoints default to AWS.

**Property 39: Environment variable configuration**
*For any* AWS service client, the endpoint is determined by environment variables — LocalStack endpoints when IS_LOCAL=true, AWS endpoints otherwise.

## Testing Methodology

All properties are tested using **Property-Based Testing (PBT)** with the following configuration:

- **Library**: [fast-check](https://github.com/dubzzz/fast-check) v3.x
- **Test Runner**: [Vitest](https://vitest.dev/)
- **Minimum Iterations**: 100 randomized inputs per property (`numRuns: 100`)
- **Infrastructure**: Tests run against LocalStack (DynamoDB, S3) at `localhost:4566`
- **Isolation**: Each test suite creates and tears down its own DynamoDB table
- **Total**: 62 correctness properties across 16 test files, all passing

Test files are located in `backend/tests/` and follow the naming convention `*.property.test.ts`.
