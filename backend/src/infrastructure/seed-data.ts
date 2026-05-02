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

  const VET_ID = 'vet-1'
  const OWNER_ID = 'owner-1'

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
  await petRepo.setMissingStatus(max.petId, true)
  console.log(`  ✓ Rex (German Shepherd, 5y) — MISSING, owned by ${OWNER_ID}`)

  // Pet 4: Pending Claim (not yet claimed — vet can see claiming code)
  const whiskers = await petRepo.createMedicalProfile({
    name: 'Minka',
    species: 'Cat',
    breed: 'Maine Coon',
    age: 4,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  console.log(`  ✓ Minka (Maine Coon, 4y) — Pending Claim (code: ${whiskers.claimingCode})`)

  // Pet 5: Pending Claim
  const charlie = await petRepo.createMedicalProfile({
    name: 'Fritz',
    species: 'Dog',
    breed: 'Beagle',
    age: 1,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  console.log(`  ✓ Fritz (Beagle, 1y) — Pending Claim (code: ${charlie.claimingCode})`)

  // Pet 6: Claimed + Active (owned by owner-1)
  const bella = await petRepo.createMedicalProfile({
    name: 'Bella',
    species: 'Dog',
    breed: 'Labrador Retriever',
    age: 7,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  await petRepo.claimProfile(bella.petId, {
    claimingCode: bella.claimingCode,
    ownerName: 'Anna Müller',
    ownerEmail: 'anna.mueller@beispiel.de',
    ownerPhone: '+49-176-12345678',
  }, OWNER_ID)
  console.log(`  ✓ Bella (Labrador, 7y) — Active, owned by ${OWNER_ID}`)

  // Pet 7: Claimed + Active (owned by owner-1) — Cat
  const simba = await petRepo.createMedicalProfile({
    name: 'Simba',
    species: 'Cat',
    breed: 'British Shorthair',
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
  console.log(`  ✓ Simba (British Shorthair, 6y) — Active, owned by ${OWNER_ID}`)

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
  await petRepo.setMissingStatus(nala.petId, true)
  console.log(`  ✓ Nala (Persian, 3y) — MISSING, owned by ${OWNER_ID}`)

  // Pet 9: Pending Claim — Dog
  const rocky = await petRepo.createMedicalProfile({
    name: 'Rocky',
    species: 'Dog',
    breed: 'Rottweiler',
    age: 2,
    clinicId: clinic.clinicId,
    verifyingVetId: VET_ID,
  })
  console.log(`  ✓ Rocky (Rottweiler, 2y) — Pending Claim (code: ${rocky.claimingCode})`)

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
  console.log('  ✓ Bella: Tollwut + Leptospirose Impfungen, Zahnreinigung')

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
  console.log('  ✓ Simba: RCP + FeLV Impfungen')

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
  console.log('Test Users:')
  console.log(`  Tierarzt: Log in with User ID "vet-1", Clinic ID "${clinic.clinicId}"`)
  console.log(`  Besitzer: Log in with User ID "owner-1"\n`)
  console.log('Pets:')
  console.log(`  Balu   (Golden Retriever)       — Active`)
  console.log(`  Luna   (Siamese)                — MISSING ← visible in public search`)
  console.log(`  Rex    (German Shepherd)         — MISSING ← visible in public search`)
  console.log(`  Minka  (Maine Coon)              — Pending Claim (code: ${whiskers.claimingCode})`)
  console.log(`  Fritz  (Beagle)                  — Pending Claim (code: ${charlie.claimingCode})`)
  console.log(`  Bella  (Labrador)                — Active`)
  console.log(`  Simba  (British Shorthair)       — Active`)
  console.log(`  Nala   (Persian)                 — MISSING ← visible in public search`)
  console.log(`  Rocky  (Rottweiler)              — Pending Claim (code: ${rocky.claimingCode})`)
  console.log(`  Lotte  (Dachshund)               — Active`)
  console.log('\nPublic Search:')
  console.log('  Search for "Cat" or "Dog" to see missing pets.')
  console.log('  Luna, Rex, and Nala will appear in results.\n')
  console.log('Claiming:')
  console.log(`  Use code "${whiskers.claimingCode}" to claim Minka`)
  console.log(`  Use code "${charlie.claimingCode}" to claim Fritz`)
  console.log(`  Use code "${rocky.claimingCode}" to claim Rocky`)
  console.log('═'.repeat(60))
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
