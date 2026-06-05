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
    console.log('Table already exists — seeding into existing table.')
  }

  const clinicRepo = new ClinicRepository(TABLE_NAME)
  const petRepo = new PetRepository(TABLE_NAME)
  const authService = new LocalAuthService()

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

  // Pet 6: Claimed + Active (owned by owner-1)
  const bella = await petRepo.createMedicalProfile({
    name: 'Susi',
    species: 'Dog',
    breed: 'English Setter/Labrador Mix',
    age: 0,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(bella.petId, {
    claimingCode: bella.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  await petRepo.update(bella.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  console.log(`  ✓ Susi (English Setter/Labrador Mix, 4 months) — Active, owned by ${OWNER_ID}`)

  // Pet 7: Claimed + Active (owned by owner-1) — Cat
  const simba = await petRepo.createMedicalProfile({
    name: 'Timmi',
    species: 'Cat',
    breed: 'Domestic Shorthair',
    age: 6,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(simba.petId, {
    claimingCode: simba.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  await petRepo.update(simba.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  console.log(`  ✓ Timmi (Domestic Shorthair, 6y) — Active, owned by ${OWNER_ID}`)

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

  // Pet 10: Claimed + Active (owned by owner-1) — Dog
  const lotte = await petRepo.createMedicalProfile({
    name: 'Lotte',
    species: 'Dog',
    breed: 'Dachshund',
    age: 9,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(lotte.petId, {
    claimingCode: lotte.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  await petRepo.update(lotte.petId, {
    ownerStreet: 'Leopoldstraße',
    ownerHouseNumber: '27',
    ownerZipCode: '80802',
    ownerCity: 'München',
  })
  console.log(`  ✓ Lotte (Dachshund, 9y) — Active, owned by ${OWNER_ID}`)

  // ── 3. Add medical records ───────────────────────────────────────────────
  console.log('\n💉 Adding medical records...')

  await petRepo.addVaccine(buddy.petId, {
    vaccineName: 'Tollwut',
    administeredDate: '2024-06-15',
    nextDueDate: '2025-06-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(buddy.petId, {
    vaccineName: 'SHPPi (Staupe, Hepatitis, Parvo, Parainfluenza)',
    administeredDate: '2024-06-15',
    nextDueDate: '2025-06-15',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Balu: Tollwut + SHPPi Impfungen')

  await petRepo.addSurgery(buddy.petId, {
    surgeryType: 'Kastration',
    surgeryDate: '2023-03-10',
    notes: 'Routineeingriff, keine Komplikationen',
    recoveryInfo: 'Vollständige Erholung in 10 Tagen, Schonkost für 3 Tage',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Balu: Kastration')

  await petRepo.addVaccine(luna.petId, {
    vaccineName: 'RCP (Katzenschnupfen, Katzenseuche)',
    administeredDate: '2024-08-01',
    nextDueDate: '2025-08-01',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Luna: RCP Impfung')

  await petRepo.addVaccine(bella.petId, {
    vaccineName: 'Tollwut',
    administeredDate: '2024-01-20',
    nextDueDate: '2025-01-20',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(bella.petId, {
    vaccineName: 'Leptospirose',
    administeredDate: '2024-01-20',
    nextDueDate: '2025-01-20',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(bella.petId, {
    surgeryType: 'Zahnreinigung',
    surgeryDate: '2024-11-05',
    notes: 'Jährliche Zahnreinigung, zwei Zähne extrahiert',
    recoveryInfo: 'Weichfutter für 5 Tage, Antibiotika für 7 Tage',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Susi: Tollwut + Leptospirose Impfungen, Zahnreinigung')

  await petRepo.addVaccine(simba.petId, {
    vaccineName: 'RCP (Katzenschnupfen, Katzenseuche)',
    administeredDate: '2024-03-10',
    nextDueDate: '2025-03-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addVaccine(simba.petId, {
    vaccineName: 'FeLV (Katzenleukämie)',
    administeredDate: '2024-03-10',
    nextDueDate: '2025-03-10',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Timmi: RCP + FeLV Impfungen')

  await petRepo.addVaccine(lotte.petId, {
    vaccineName: 'Tollwut',
    administeredDate: '2024-09-01',
    nextDueDate: '2025-09-01',
    veterinarianName: 'Dr. Sarah Weber',
  })
  await petRepo.addSurgery(lotte.petId, {
    surgeryType: 'Bandscheibenoperation',
    surgeryDate: '2024-04-20',
    notes: 'Bandscheibenvorfall L2-L3, minimalinvasiv',
    recoveryInfo: 'Strikte Ruhe für 6 Wochen, Physiotherapie empfohlen',
    veterinarianName: 'Dr. Sarah Weber',
  })
  console.log('  ✓ Lotte: Tollwut Impfung, Bandscheibenoperation')

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('✅ Seed data created successfully!\n')
  console.log('Test Accounts (Login Credentials):')
  console.log(`  Tierarzt: ${VET_EMAIL} / ${VET_PASSWORD}`)
  console.log(`  Besitzer: ${OWNER_EMAIL} / ${OWNER_PASSWORD}\n`)
  console.log('Pets:')
  console.log(`  Balu   (Golden Retriever)            — Active`)
  console.log(`  Luna   (Siamese)                     — MISSING ← visible in public search`)
  console.log(`  Rex    (German Shepherd)              — MISSING ← visible in public search`)
  console.log(`  Minka  (Domestic Shorthair)           — Pending Claim (code: ${whiskers.claimingCode})`)
  console.log(`  Olive  (Ridgeback)                    — Pending Claim (code: ${charlie.claimingCode})`)
  console.log(`  Susi   (English Setter/Labrador Mix)  — Active`)
  console.log(`  Timmi  (Domestic Shorthair)           — Active`)
  console.log(`  Nala   (Persian)                      — MISSING ← visible in public search`)
  console.log(`  Askari (Australian Shepherd)          — Pending Claim (code: ${rocky.claimingCode})`)
  console.log(`  Lotte  (Dachshund)                    — Active`)
  console.log('\nPublic Search:')
  console.log('  Search for "Cat" or "Dog" to see missing pets.')
  console.log('  Luna, Rex, and Nala will appear in results.\n')
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
