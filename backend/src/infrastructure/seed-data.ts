/**
 * Seed Data Script for Manual Testing
 *
 * Creates realistic test data in LocalStack DynamoDB:
 * - 1 veterinary clinic ("Happy Paws Veterinary Clinic")
 * - 6 pets with various statuses (pending, active, missing)
 * - Vaccine and surgery records
 * - Pre-configured test users:
 *   - Vet:   userId=vet-1, clinicId=<created clinic>
 *   - Owner: userId=owner-1
 *
 * Usage:
 *   IS_LOCAL=true LOCALSTACK_HOSTNAME=localhost AWS_REGION=us-east-1 \
 *   AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
 *   npx tsx src/infrastructure/seed-data.ts
 *
 * Or with the .env file:
 *   npx tsx --env-file=.env src/infrastructure/seed-data.ts
 */

import { DynamoDBTableInitializer } from './init-dynamodb'
import { ClinicRepository } from '../repositories/clinic-repository'
import { PetRepository } from '../repositories/pet-repository'
import { LocalAuthService } from '../services/local-auth-service'

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'VetPetRegistry'

async function seed() {
  console.log('🌱 Seeding test data...\n')

  // ── Ensure table exists ──────────────────────────────────────────────────
  const initializer = new DynamoDBTableInitializer(TABLE_NAME)
  const exists = await initializer.tableExists(TABLE_NAME)
  if (!exists) {
    console.log('Creating DynamoDB table...')
    await initializer.createTable({ tableName: TABLE_NAME })
  } else {
    console.log('Table already exists — checking for existing data...')
  }

  const clinicRepo = new ClinicRepository(TABLE_NAME)
  const petRepo = new PetRepository(TABLE_NAME)
  const authService = new LocalAuthService()

  // ── Idempotency check: skip if data already exists ───────────────────────
  if (exists) {
    const existingVet = await authService.getUserByEmail('dr.weber@tierarzt-pfoetchen.de')
    if (existingVet) {
      console.log('\n⚠️  Seed data already exists (found vet account). Skipping.')
      console.log('   To re-seed, run: docker compose down -v && docker compose up -d')
      console.log('   Then run this script again.\n')
      return
    }
  }

  // ── 0. Create test user accounts ────────────────────────────────────────
  console.log('\n🔑 Creating test user accounts...')

  const VET_EMAIL = 'dr.weber@tierarzt-pfoetchen.de'
  const VET_PASSWORD = 'Test1234!'
  const OWNER_EMAIL = 'anna.mueller@beispiel.de'
  const OWNER_PASSWORD = 'Test1234!'

  let vetUserId: string
  let ownerUserId: string

  try {
    const vetUser = await authService.signUp({
      email: VET_EMAIL,
      password: VET_PASSWORD,
      userType: 'vet',
    })
    vetUserId = vetUser.userId
    console.log(`  ✓ Vet account: ${VET_EMAIL} / ${VET_PASSWORD} (ID: ${vetUserId})`)
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log(`  ⚠ Vet account already exists: ${VET_EMAIL}`)
      const existing = await authService.getUserByEmail(VET_EMAIL)
      vetUserId = existing!.userId
    } else {
      throw err
    }
  }

  try {
    const ownerUser = await authService.signUp({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      userType: 'owner',
    })
    ownerUserId = ownerUser.userId
    // Populate user profile with contact details (used by Account Settings)
    await authService.updateProfile(ownerUserId, {
      ownerName: 'Anna Müller',
      ownerPhone: '+49-176-12345678',
      ownerStreet: 'Leopoldstraße',
      ownerHouseNumber: '27',
      ownerZipCode: '80802',
      ownerCity: 'München',
    })
    console.log(`  ✓ Owner account: ${OWNER_EMAIL} / ${OWNER_PASSWORD} (ID: ${ownerUserId})`)
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log(`  ⚠ Owner account already exists: ${OWNER_EMAIL}`)
      const existing = await authService.getUserByEmail(OWNER_EMAIL)
      ownerUserId = existing!.userId
    } else {
      throw err
    }
  }

  // ── 1. Create clinic ─────────────────────────────────────────────────────
  console.log('\n Creating clinic...')
  const clinic = await clinicRepo.create({
    name: 'Tierarztpraxis Pfötchen',
    address: 'Hauptstraße 42',
    city: 'Munich',
    state: 'Bavaria',
    zipCode: '80331',
    phone: '+49-89-1234567',
    email: 'info@tierarzt-pfoetchen.de',
    licenseNumber: 'BY-MUC-2024-001',
    latitude: 48.1351,
    longitude: 11.5820,
  })
  console.log(`  ✓ Clinic: ${clinic.name} (ID: ${clinic.clinicId})`)

  // Associate clinic with vet account
  await authService.associateClinic(vetUserId, clinic.clinicId)
  console.log(`  ✓ Vet account associated with clinic`)

  const VET_ID = vetUserId
  const OWNER_ID = ownerUserId

  // ── 2. Create pets ───────────────────────────────────────────────────────
  console.log('\n Creating pet profiles...')

  // Pet 1: Claimed + Active (owned by owner-1)
  const buddy = await petRepo.createMedicalProfile({
    name: 'Balu',
    species: 'Dog',
    breed: 'Golden Retriever',
    age: 3,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(buddy.petId, {
    claimingCode: buddy.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  // Add address for claimed pet
  await petRepo.update(buddy.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  console.log(`  ✓ Balu (Golden Retriever, 3y) — Active, owned by ${OWNER_ID}`)

  // Pet 2: Claimed + Missing (owned by owner-1) — shows up in public search
  const luna = await petRepo.createMedicalProfile({
    name: 'Luna',
    species: 'Cat',
    breed: 'Siamese',
    age: 2,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(luna.petId, {
    claimingCode: luna.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  await petRepo.update(luna.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  await petRepo.setMissingStatus(luna.petId, true)
  console.log(`  ✓ Luna (Siamese, 2y) — MISSING, owned by ${OWNER_ID}`)

  // Pet 3: Claimed + Missing (owned by owner-1)
  const max = await petRepo.createMedicalProfile({
    name: 'Rex',
    species: 'Dog',
    breed: 'German Shepherd',
    age: 5,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(max.petId, {
    claimingCode: max.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  await petRepo.update(max.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  await petRepo.setMissingStatus(max.petId, true)
  console.log(`  ✓ Rex (German Shepherd, 5y) — MISSING, owned by ${OWNER_ID}`)

  // Pet 4: Pending Claim (not yet claimed — vet can see claiming code)
  const whiskers = await petRepo.createMedicalProfile({
    name: 'Minka',
    species: 'Cat',
    breed: 'Domestic Shorthair',
    age: 4,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  console.log(`  ✓ Minka (Domestic Shorthair, 4y) — Pending Claim (code: ${whiskers.claimingCode})`)

  // Pet 5: Pending Claim
  const charlie = await petRepo.createMedicalProfile({
    name: 'Olive',
    species: 'Dog',
    breed: 'Ridgeback',
    age: 1,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  console.log(`  ✓ Olive (Ridgeback, 1y) — Pending Claim (code: ${charlie.claimingCode})`)

  // Pet 8: Claimed + Missing (owned by owner-1) — another missing Cat
  const nala = await petRepo.createMedicalProfile({
    name: 'Nala',
    species: 'Cat',
    breed: 'Persian',
    age: 3,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(nala.petId, {
    claimingCode: nala.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  await petRepo.update(nala.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  await petRepo.setMissingStatus(nala.petId, true)
  console.log(`  ✓ Nala (Persian, 3y) — MISSING, owned by ${OWNER_ID}`)

  // Pet 9: Pending Claim — Dog
  const rocky = await petRepo.createMedicalProfile({
    name: 'Askari',
    species: 'Dog',
    breed: 'Australian Shepherd',
    age: 2,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  console.log(`  ✓ Askari (Australian Shepherd, 2y) — Pending Claim (code: ${rocky.claimingCode})`)

  // ── 2b. Additional owners, clinics, and pets in other cities ─────────────
  console.log('\n🏥 Creating additional clinics in other cities...')

  // Berlin clinic
  const clinicBerlin = await clinicRepo.create({
    name: 'Tierklinik am Volkspark',
    address: 'Schönhauser Allee 78',
    city: 'Berlin',
    state: 'Berlin',
    zipCode: '10439',
    phone: '+49-30-9876543',
    email: 'info@tierklinik-volkspark.de',
    licenseNumber: 'BE-BER-2024-002',
    latitude: 52.5480,
    longitude: 13.4130,
  })
  console.log(`  ✓ Clinic: ${clinicBerlin.name} (Berlin)`)

  // Hamburg clinic
  const clinicHamburg = await clinicRepo.create({
    name: 'Tierärzte Elbchaussee',
    address: 'Elbchaussee 120',
    city: 'Hamburg',
    state: 'Hamburg',
    zipCode: '22763',
    phone: '+49-40-5551234',
    email: 'praxis@tieraerzte-elbchaussee.de',
    licenseNumber: 'HH-HAM-2024-003',
    latitude: 53.5460,
    longitude: 9.9210,
  })
  console.log(`  ✓ Clinic: ${clinicHamburg.name} (Hamburg)`)

  // Köln clinic
  const clinicKoeln = await clinicRepo.create({
    name: 'Kleintierpraxis am Dom',
    address: 'Hohenzollernring 55',
    city: 'Köln',
    state: 'Nordrhein-Westfalen',
    zipCode: '50672',
    phone: '+49-221-7773456',
    email: 'kontakt@kleintierpraxis-dom.de',
    licenseNumber: 'NW-KOL-2024-004',
    latitude: 50.9413,
    longitude: 6.9400,
  })
  console.log(`  ✓ Clinic: ${clinicKoeln.name} (Köln)`)

  // Create 3 new owner accounts
  console.log('\n🔑 Creating additional owner accounts...')

  const OWNER2_EMAIL = 'thomas.schmidt@beispiel.de'
  const OWNER2_PASSWORD = 'Test1234!'
  let owner2UserId: string
  try {
    const owner2 = await authService.signUp({
      email: OWNER2_EMAIL,
      password: OWNER2_PASSWORD,
      userType: 'owner',
    })
    owner2UserId = owner2.userId
    await authService.updateProfile(owner2UserId, {
      ownerName: 'Thomas Schmidt',
      ownerPhone: '+49-170-9876543',
      ownerStreet: 'Kastanienallee',
      ownerHouseNumber: '15',
      ownerZipCode: '10435',
      ownerCity: 'Berlin',
    })
    console.log(`  ✓ Owner: ${OWNER2_EMAIL} / ${OWNER2_PASSWORD} (Berlin)`)
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log(`  ⚠ Owner account already exists: ${OWNER2_EMAIL}`)
      const existing = await authService.getUserByEmail(OWNER2_EMAIL)
      owner2UserId = existing!.userId
    } else {
      throw err
    }
  }

  const OWNER3_EMAIL = 'lisa.wagner@beispiel.de'
  const OWNER3_PASSWORD = 'Test1234!'
  let owner3UserId: string
  try {
    const owner3 = await authService.signUp({
      email: OWNER3_EMAIL,
      password: OWNER3_PASSWORD,
      userType: 'owner',
    })
    owner3UserId = owner3.userId
    await authService.updateProfile(owner3UserId, {
      ownerName: 'Lisa Wagner',
      ownerPhone: '+49-151-2345678',
      ownerStreet: 'Eppendorfer Weg',
      ownerHouseNumber: '42',
      ownerZipCode: '20259',
      ownerCity: 'Hamburg',
    })
    console.log(`  ✓ Owner: ${OWNER3_EMAIL} / ${OWNER3_PASSWORD} (Hamburg)`)
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log(`  ⚠ Owner account already exists: ${OWNER3_EMAIL}`)
      const existing = await authService.getUserByEmail(OWNER3_EMAIL)
      owner3UserId = existing!.userId
    } else {
      throw err
    }
  }

  const OWNER4_EMAIL = 'markus.becker@beispiel.de'
  const OWNER4_PASSWORD = 'Test1234!'
  let owner4UserId: string
  try {
    const owner4 = await authService.signUp({
      email: OWNER4_EMAIL,
      password: OWNER4_PASSWORD,
      userType: 'owner',
    })
    owner4UserId = owner4.userId
    await authService.updateProfile(owner4UserId, {
      ownerName: 'Markus Becker',
      ownerPhone: '+49-160-4567890',
      ownerStreet: 'Aachener Straße',
      ownerHouseNumber: '88',
      ownerZipCode: '50674',
      ownerCity: 'Köln',
    })
    console.log(`  ✓ Owner: ${OWNER4_EMAIL} / ${OWNER4_PASSWORD} (Köln)`)
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      console.log(`  ⚠ Owner account already exists: ${OWNER4_EMAIL}`)
      const existing = await authService.getUserByEmail(OWNER4_EMAIL)
      owner4UserId = existing!.userId
    } else {
      throw err
    }
  }

  // Create pets for new owners
  console.log('\n🐾 Creating pets for additional owners...')

  // Lotte → owned by Thomas Schmidt in Berlin
  const lotteBerlin = await petRepo.createMedicalProfile({
    name: 'Lotte',
    species: 'Dog',
    breed: 'Dachshund',
    age: 9,
    clinicId: clinicBerlin.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(lotteBerlin.petId, {
    claimingCode: lotteBerlin.claimingCode,
    ownerName: 'Thomas Schmidt',
    ownerEmail: OWNER2_EMAIL,
    ownerPhone: '+49-170-9876543',
  }, owner2UserId)
  await petRepo.update(lotteBerlin.petId, {
    ownerStreet: 'Kastanienallee',
    ownerHouseNumber: '15',
    ownerZipCode: '10435',
    ownerCity: 'Berlin',
  })
  await petRepo.setMissingStatus(lotteBerlin.petId, true)
  console.log(`  ✓ Lotte (Dachshund, 9y) — MISSING, owned by Thomas Schmidt (Berlin)`)

  // Susi → owned by Lisa Wagner in Hamburg
  const susiHamburg = await petRepo.createMedicalProfile({
    name: 'Susi',
    species: 'Dog',
    breed: 'English Setter/Labrador Mix',
    age: 4,
    clinicId: clinicHamburg.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(susiHamburg.petId, {
    claimingCode: susiHamburg.claimingCode,
    ownerName: 'Lisa Wagner',
    ownerEmail: OWNER3_EMAIL,
    ownerPhone: '+49-151-2345678',
  }, owner3UserId)
  await petRepo.update(susiHamburg.petId, {
    ownerStreet: 'Eppendorfer Weg',
    ownerHouseNumber: '42',
    ownerZipCode: '20259',
    ownerCity: 'Hamburg',
  })
  await petRepo.setMissingStatus(susiHamburg.petId, true)
  console.log(`  ✓ Susi (English Setter/Labrador Mix, 4y) — MISSING, owned by Lisa Wagner (Hamburg)`)

  // Timmi → owned by Markus Becker in Köln
  const timmiKoeln = await petRepo.createMedicalProfile({
    name: 'Timmi',
    species: 'Cat',
    breed: 'Domestic Shorthair',
    age: 6,
    clinicId: clinicKoeln.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(timmiKoeln.petId, {
    claimingCode: timmiKoeln.claimingCode,
    ownerName: 'Markus Becker',
    ownerEmail: OWNER4_EMAIL,
    ownerPhone: '+49-160-4567890',
  }, owner4UserId)
  await petRepo.update(timmiKoeln.petId, {
    ownerStreet: 'Aachener Straße',
    ownerHouseNumber: '88',
    ownerZipCode: '50674',
    ownerCity: 'Köln',
  })
  await petRepo.setMissingStatus(timmiKoeln.petId, true)
  console.log(`  ✓ Timmi (Domestic Shorthair, 6y) — MISSING, owned by Markus Becker (Köln)`)

  // ── 3. Add medical records ───────────────────────────────────────────────
  console.log('\n💉 Adding medical records...')

  // ─ Balu (Golden Retriever, 3y) ─
  await petRepo.addVaccine(buddy.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-06-15',
    nextDueDate: '2025-06-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(buddy.petId, {
    vaccineName: 'DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)',
    administeredDate: '2024-06-15',
    nextDueDate: '2025-06-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(buddy.petId, {
    vaccineName: 'Leptospirosis',
    administeredDate: '2024-06-15',
    nextDueDate: '2025-06-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(buddy.petId, {
    surgeryType: 'Neutering',
    surgeryDate: '2023-03-10',
    notes: 'Routine procedure, no complications',
    recoveryInfo: 'Full recovery in 10 days, bland diet for 3 days',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Balu: Rabies, DHPP, Leptospirosis + Neutering')

  // ─ Luna (Siamese, 2y) ─
  await petRepo.addVaccine(luna.petId, {
    vaccineName: 'FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia)',
    administeredDate: '2024-08-01',
    nextDueDate: '2025-08-01',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(luna.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-08-01',
    nextDueDate: '2027-08-01',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(luna.petId, {
    surgeryType: 'Spay',
    surgeryDate: '2023-11-20',
    notes: 'Routine procedure, laparoscopic',
    recoveryInfo: 'Recovery in 7 days, wear cone collar',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Luna: FVRCP, Rabies + Spay')

  // ─ Rex (German Shepherd, 5y) ─
  await petRepo.addVaccine(max.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-04-10',
    nextDueDate: '2027-04-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(max.petId, {
    vaccineName: 'DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)',
    administeredDate: '2024-04-10',
    nextDueDate: '2025-04-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(max.petId, {
    vaccineName: 'Bordetella (Kennel Cough)',
    administeredDate: '2024-04-10',
    nextDueDate: '2025-04-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(max.petId, {
    surgeryType: 'Cruciate Ligament Repair (TPLO)',
    surgeryDate: '2023-09-15',
    notes: 'Left anterior cruciate ligament tear, TPLO method',
    recoveryInfo: 'Strict rest 8 weeks, physiotherapy 3x/week, follow-up X-ray after 6 weeks',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Rex: Rabies, DHPP, Bordetella + Cruciate Ligament Repair')

  // ─ Minka (Domestic Shorthair, 4y) ─
  await petRepo.addVaccine(whiskers.petId, {
    vaccineName: 'FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia)',
    administeredDate: '2024-05-20',
    nextDueDate: '2025-05-20',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(whiskers.petId, {
    vaccineName: 'FeLV (Feline Leukemia Virus)',
    administeredDate: '2024-05-20',
    nextDueDate: '2025-05-20',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Minka: FVRCP, FeLV')

  // ─ Olive (Ridgeback, 1y) ─
  await petRepo.addVaccine(charlie.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2025-02-10',
    nextDueDate: '2028-02-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(charlie.petId, {
    vaccineName: 'DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)',
    administeredDate: '2025-02-10',
    nextDueDate: '2026-02-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(charlie.petId, {
    vaccineName: 'Leptospirosis',
    administeredDate: '2025-02-10',
    nextDueDate: '2026-02-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Olive: Rabies, DHPP, Leptospirosis (Puppy primary vaccination)')

  // ─ Nala (Persian, 3y) ─
  await petRepo.addVaccine(nala.petId, {
    vaccineName: 'FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia)',
    administeredDate: '2024-10-01',
    nextDueDate: '2025-10-01',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(nala.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-10-01',
    nextDueDate: '2027-10-01',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(nala.petId, {
    surgeryType: 'Spay',
    surgeryDate: '2023-06-15',
    notes: 'Routine procedure, uncomplicated',
    recoveryInfo: 'Recovery in 10 days, cone collar for 7 days',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Nala: FVRCP, Rabies + Spay')

  // ─ Askari (Australian Shepherd, 2y) ─
  await petRepo.addVaccine(rocky.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2025-01-15',
    nextDueDate: '2028-01-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(rocky.petId, {
    vaccineName: 'DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)',
    administeredDate: '2025-01-15',
    nextDueDate: '2026-01-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(rocky.petId, {
    vaccineName: 'Leptospirosis',
    administeredDate: '2025-01-15',
    nextDueDate: '2026-01-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(rocky.petId, {
    surgeryType: 'Neutering',
    surgeryDate: '2024-08-20',
    notes: 'Routine neutering, no complications',
    recoveryInfo: 'Recovery in 10 days, restricted activity',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Askari: Rabies, DHPP, Leptospirosis + Neutering')

  // ─ Lotte Berlin (Dachshund, 9y) ─
  await petRepo.addVaccine(lotteBerlin.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-09-01',
    nextDueDate: '2027-09-01',
    veterinarianName: 'Dr. Michael Huber',
  })
  await petRepo.addVaccine(lotteBerlin.petId, {
    vaccineName: 'DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)',
    administeredDate: '2024-09-01',
    nextDueDate: '2025-09-01',
    veterinarianName: 'Dr. Michael Huber',
  })
  await petRepo.addSurgery(lotteBerlin.petId, {
    surgeryType: 'Intervertebral Disc Surgery',
    surgeryDate: '2024-04-20',
    notes: 'Herniated disc L2-L3, minimally invasive (IVDD)',
    recoveryInfo: 'Strict rest 6 weeks, physiotherapy recommended, follow-up after 4 weeks',
    veterinarianName: 'Dr. Michael Huber',
  })
  console.log('  ✓ Lotte (Berlin): Rabies, DHPP + Intervertebral Disc Surgery')

  // ─ Susi Hamburg (English Setter/Labrador Mix, 4y) ─
  await petRepo.addVaccine(susiHamburg.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-01-20',
    nextDueDate: '2027-01-20',
    veterinarianName: 'Dr. Jan Petersen',
  })
  await petRepo.addVaccine(susiHamburg.petId, {
    vaccineName: 'DHPP (Distemper, Hepatitis, Parvovirus, Parainfluenza)',
    administeredDate: '2024-01-20',
    nextDueDate: '2025-01-20',
    veterinarianName: 'Dr. Jan Petersen',
  })
  await petRepo.addVaccine(susiHamburg.petId, {
    vaccineName: 'Leptospirosis',
    administeredDate: '2024-01-20',
    nextDueDate: '2025-01-20',
    veterinarianName: 'Dr. Jan Petersen',
  })
  await petRepo.addSurgery(susiHamburg.petId, {
    surgeryType: 'Dental Cleaning',
    surgeryDate: '2024-11-05',
    notes: 'Annual dental cleaning under anesthesia, two teeth extracted',
    recoveryInfo: 'Soft food for 5 days, antibiotics for 7 days',
    veterinarianName: 'Dr. Jan Petersen',
  })
  console.log('  ✓ Susi (Hamburg): Rabies, DHPP, Leptospirosis + Dental Cleaning')

  // ─ Timmi Köln (Domestic Shorthair, 6y) ─
  await petRepo.addVaccine(timmiKoeln.petId, {
    vaccineName: 'FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia)',
    administeredDate: '2024-03-10',
    nextDueDate: '2025-03-10',
    veterinarianName: 'Dr. Claudia Klein',
  })
  await petRepo.addVaccine(timmiKoeln.petId, {
    vaccineName: 'FeLV (Feline Leukemia Virus)',
    administeredDate: '2024-03-10',
    nextDueDate: '2025-03-10',
    veterinarianName: 'Dr. Claudia Klein',
  })
  await petRepo.addVaccine(timmiKoeln.petId, {
    vaccineName: 'Rabies',
    administeredDate: '2024-03-10',
    nextDueDate: '2027-03-10',
    veterinarianName: 'Dr. Claudia Klein',
  })
  await petRepo.addSurgery(timmiKoeln.petId, {
    surgeryType: 'Neutering',
    surgeryDate: '2020-07-15',
    notes: 'Routine neutering at age 1 year',
    recoveryInfo: 'Uncomplicated recovery in 7 days',
    veterinarianName: 'Dr. Claudia Klein',
  })
  console.log('  ✓ Timmi (Köln): FVRCP, FeLV, Rabies + Neutering')

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('✅ Seed data created successfully!\n')
  console.log('Test Accounts (Login Credentials):')
  console.log(`  Vet:              ${VET_EMAIL} / ${VET_PASSWORD}`)
  console.log(`  Owner (München):  ${OWNER_EMAIL} / ${OWNER_PASSWORD}`)
  console.log(`  Owner (Berlin):   ${OWNER2_EMAIL} / ${OWNER2_PASSWORD}`)
  console.log(`  Owner (Hamburg):  ${OWNER3_EMAIL} / ${OWNER3_PASSWORD}`)
  console.log(`  Owner (Köln):     ${OWNER4_EMAIL} / ${OWNER4_PASSWORD}\n`)
  console.log('Clinics:')
  console.log(`  Tierarztpraxis Pfötchen   — München  (48.14, 11.58)`)
  console.log(`  Tierklinik am Volkspark   — Berlin   (52.55, 13.41)`)
  console.log(`  Tierärzte Elbchaussee     — Hamburg   (53.55, 9.92)`)
  console.log(`  Kleintierpraxis am Dom    — Köln     (50.94, 6.94)\n`)
  console.log('Pets:')
  console.log(`  Balu   (Golden Retriever)            — Active  (München, Anna Müller)`)
  console.log(`  Luna   (Siamese)                     — MISSING (München, Anna Müller)`)
  console.log(`  Rex    (German Shepherd)              — MISSING (München, Anna Müller)`)
  console.log(`  Minka  (Domestic Shorthair)           — Pending Claim (code: ${whiskers.claimingCode})`)
  console.log(`  Olive  (Ridgeback)                    — Pending Claim (code: ${charlie.claimingCode})`)
  console.log(`  Nala   (Persian)                      — MISSING (München, Anna Müller)`)
  console.log(`  Askari (Australian Shepherd)          — Pending Claim (code: ${rocky.claimingCode})`)
  console.log(`  Lotte  (Dachshund)                    — MISSING (Berlin, Thomas Schmidt)`)
  console.log(`  Susi   (English Setter/Labrador Mix)  — MISSING (Hamburg, Lisa Wagner)`)
  console.log(`  Timmi  (Domestic Shorthair)           — MISSING (Köln, Markus Becker)`)
  console.log('\nPublic Search:')
  console.log('  Search for "Dog" or "Cat" to see missing pets.')
  console.log('  Search by location: Berlin, Hamburg, Köln, München (80331)')
  console.log('  Luna, Rex, Nala (München), Lotte (Berlin), Susi (Hamburg), Timmi (Köln)\n')
  console.log('Claiming:')
  console.log(`  Use code "${whiskers.claimingCode}" to claim Minka`)
  console.log(`  Use code "${charlie.claimingCode}" to claim Olive`)
  console.log(`  Use code "${rocky.claimingCode}" to claim Askari`)
  console.log('═'.repeat(60))
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
