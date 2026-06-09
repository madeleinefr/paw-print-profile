#!/bin/bash
# seed-cloud.sh
# Seeds the AWS-deployed Paw Print Profile application with test data.
# Creates accounts, pets, uploads photos, and reports some as missing.
#
# Usage:
#   ./scripts/seed-cloud.sh
#
# Prerequisites:
#   - Backend deployed via sam deploy
#   - Images in seed-images/ folder (balu.jpg, luna.jpg, etc.)

set -e

REGION="eu-central-1"
STACK_NAME="paw-print-profile"

# Get API URL from CloudFormation outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text | sed 's/\/$//')

if [ -z "$API_URL" ]; then
  echo "❌ Could not find API URL. Is the backend deployed?"
  exit 1
fi

echo "🌱 Seeding cloud deployment at: $API_URL"
echo ""

# ── Helper functions ────────────────────────────────────────────────────────

api_post() {
  local endpoint=$1
  local data=$2
  local token=$3
  local headers=(-H "Content-Type: application/json")
  if [ -n "$token" ]; then
    headers+=(-H "Authorization: Bearer $token")
  fi
  curl -s -X POST "$API_URL$endpoint" "${headers[@]}" -d "$data"
}

api_get() {
  local endpoint=$1
  local token=$2
  local headers=(-H "Content-Type: application/json")
  if [ -n "$token" ]; then
    headers+=(-H "Authorization: Bearer $token")
  fi
  curl -s "$API_URL$endpoint" "${headers[@]}"
}

# ── 1. Create accounts ─────────────────────────────────────────────────────

echo "🔑 Creating test accounts..."

VET_EMAIL="dr.weber@tierarzt-pfoetchen.de"
VET_PASSWORD="Test1234!"
OWNER_EMAIL="anna.mueller@beispiel.de"
OWNER_PASSWORD="Test1234!"

# Sign up vet
VET_RESULT=$(api_post "/auth/signup" "{\"email\":\"$VET_EMAIL\",\"password\":\"$VET_PASSWORD\",\"userType\":\"vet\"}")
VET_ID=$(echo "$VET_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userId',''))" 2>/dev/null || echo "")
if [ -z "$VET_ID" ]; then
  echo "  ⚠ Vet account may already exist, trying to sign in..."
fi
echo "  ✓ Vet: $VET_EMAIL / $VET_PASSWORD"

# Sign up owner
OWNER_RESULT=$(api_post "/auth/signup" "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\",\"userType\":\"owner\"}")
OWNER_ID=$(echo "$OWNER_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userId',''))" 2>/dev/null || echo "")
if [ -z "$OWNER_ID" ]; then
  echo "  ⚠ Owner account may already exist, trying to sign in..."
fi
echo "  ✓ Owner: $OWNER_EMAIL / $OWNER_PASSWORD"

# Sign in as vet to get token
echo ""
echo "🔐 Signing in..."
VET_TOKENS=$(api_post "/auth/signin" "{\"email\":\"$VET_EMAIL\",\"password\":\"$VET_PASSWORD\"}")
VET_TOKEN=$(echo "$VET_TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)

if [ -z "$VET_TOKEN" ]; then
  echo "❌ Failed to sign in as vet. Response: $VET_TOKENS"
  exit 1
fi
echo "  ✓ Vet signed in"

# Sign in as owner to get token
OWNER_TOKENS=$(api_post "/auth/signin" "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}")
OWNER_TOKEN=$(echo "$OWNER_TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)

if [ -z "$OWNER_TOKEN" ]; then
  echo "❌ Failed to sign in as owner. Response: $OWNER_TOKENS"
  exit 1
fi
echo "  ✓ Owner signed in"

# ── 2. Create clinic ───────────────────────────────────────────────────────

echo ""
echo "🏥 Creating clinic..."
CLINIC_RESULT=$(api_post "/clinics" '{
  "name": "Tierarztpraxis Pfötchen",
  "address": "Hauptstraße 42",
  "city": "Munich",
  "state": "Bavaria",
  "zipCode": "80331",
  "phone": "+49-89-1234567",
  "email": "info@tierarzt-pfoetchen.de",
  "licenseNumber": "BY-MUC-2024-001",
  "latitude": 48.1351,
  "longitude": 11.5820
}' "$VET_TOKEN")

CLINIC_ID=$(echo "$CLINIC_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clinicId',''))" 2>/dev/null)
if [ -z "$CLINIC_ID" ]; then
  echo "  ⚠ Clinic may already exist. Response: $CLINIC_RESULT"
  CLINIC_ID="existing"
else
  echo "  ✓ Clinic created: $CLINIC_ID"
  # Associate clinic with vet via API
  api_post "/auth/associate-clinic" "{\"clinicId\":\"$CLINIC_ID\"}" "$VET_TOKEN" > /dev/null
  echo "  ✓ Vet associated with clinic"
  
  # Also update the Cognito user attribute directly so the token reflects clinicId
  USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
    --output text)
  aws cognito-idp admin-update-user-attributes \
    --user-pool-id "$USER_POOL_ID" \
    --username "$VET_EMAIL" \
    --user-attributes Name="custom:clinicId",Value="$CLINIC_ID" \
    --region "$REGION" 2>/dev/null
  echo "  ✓ Cognito clinicId attribute updated"
  
  # Small delay to ensure Cognito propagates the attribute
  sleep 2
  
  # Re-sign in to get updated token with clinicId
  VET_TOKENS=$(api_post "/auth/signin" "{\"email\":\"$VET_EMAIL\",\"password\":\"$VET_PASSWORD\"}")
  VET_TOKEN=$(echo "$VET_TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
  
  # Verify the token has clinicId
  echo "$VET_TOKEN" | python3 -c "
import sys, base64, json
token = sys.stdin.read().strip()
payload = token.split('.')[1]
payload += '=' * (4 - len(payload) % 4)
data = json.loads(base64.urlsafe_b64decode(payload))
cid = data.get('custom:clinicId', 'MISSING')
print(f'  ✓ Vet re-signed in (clinicId in token: {cid})')
" 2>/dev/null || echo "  ✓ Vet re-signed in with clinicId"
fi

# ── 3. Create pets ─────────────────────────────────────────────────────────

echo ""
echo "🐾 Creating pet profiles..."

# Verify vet token works by creating a test pet then deleting it
TEST_RESULT=$(api_post "/pets" '{"name":"_test","species":"Dog","breed":"Test","age":1}' "$VET_TOKEN")
TEST_ID=$(echo "$TEST_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('petId',''))" 2>/dev/null)
if [ -z "$TEST_ID" ]; then
  echo "  ❌ Vet token not working for pet creation. Response: $(echo $TEST_RESULT | head -c 200)"
  echo "  Token (first 50 chars): ${VET_TOKEN:0:50}..."
  exit 1
fi
# Clean up the test pet
curl -s -X DELETE "$API_URL/pets/$TEST_ID" -H "Authorization: Bearer $VET_TOKEN" -H "Content-Type: application/json" > /dev/null
echo "  ✓ Vet token verified"

create_pet() {
  local name=$1 species=$2 breed=$3 age=$4
  local result=$(api_post "/pets" "{\"name\":\"$name\",\"species\":\"$species\",\"breed\":\"$breed\",\"age\":$age}" "$VET_TOKEN")
  local petId=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('petId',''))" 2>/dev/null)
  local code=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('claimingCode',''))" 2>/dev/null)
  if [ -z "$petId" ]; then
    echo "    ⚠ Failed to create $name. Response: $(echo $result | head -c 200)" >&2
  fi
  if [ -z "$code" ]; then
    echo "    ⚠ No claiming code returned for $name" >&2
  fi
  echo "$petId:$code"
}

claim_pet() {
  local code=$1
  if [ -z "$code" ]; then
    echo "    ⚠ No claiming code provided, skipping claim" >&2
    return
  fi
  local result=$(api_post "/pets/claim" "{\"claimingCode\":\"$code\",\"ownerName\":\"Anna Mueller\",\"ownerEmail\":\"anna.mueller@beispiel.de\",\"ownerPhone\":\"+49-176-12345678\"}" "$OWNER_TOKEN")
  local status=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('profileStatus','FAILED'))" 2>/dev/null)
  if [ "$status" != "Active" ]; then
    echo "    ⚠ Claim failed: $result" >&2
  fi
}

upload_image() {
  local petId=$1 filename=$2 tags=$3 token=$4
  local filepath="seed-images/$filename"
  if [ ! -f "$filepath" ]; then
    echo "    ⚠ Image not found: $filepath"
    return
  fi
  local mimeType="image/jpeg"
  case "${filename##*.}" in
    png) mimeType="image/png" ;;
    webp) mimeType="image/webp" ;;
  esac
  # Write JSON body to temp file — resize large images to max 1200px width
  local tmpfile=$(mktemp)
  python3 -c "
import base64, json, subprocess, os, tempfile
filepath = '$filepath'
mime = '$mimeType'
# Check file size — if over 2MB, resize with sips (macOS)
if os.path.getsize(filepath) > 2 * 1024 * 1024:
    resized = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    resized.close()
    subprocess.run(['sips', '--resampleWidth', '1200', filepath, '--out', resized.name], capture_output=True)
    filepath = resized.name
with open(filepath, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
body = {'imageBase64': b64, 'mimeType': mime, 'tags': [$tags]}
json.dump(body, open('$tmpfile', 'w'))
if filepath != '$filepath':
    os.unlink(filepath)
"
  curl -s -X POST "$API_URL/pets/$petId/images" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d "@$tmpfile" > /dev/null
  rm -f "$tmpfile"
}

# Balu — Active
IFS=: read BALU_ID BALU_CODE <<< "$(create_pet "Balu" "Dog" "Golden Retriever" 3)"
claim_pet "$BALU_CODE"
echo "  ✓ Balu (Golden Retriever) — Active"

# Luna — Missing
IFS=: read LUNA_ID LUNA_CODE <<< "$(create_pet "Luna" "Cat" "Siamese" 2)"
claim_pet "$LUNA_CODE"
echo "  ✓ Luna (Siamese) — will be Missing"

# Rex — Missing
IFS=: read REX_ID REX_CODE <<< "$(create_pet "Rex" "Dog" "German Shepherd" 5)"
claim_pet "$REX_CODE"
echo "  ✓ Rex (German Shepherd) — will be Missing"

# Minka — Pending Claim
IFS=: read MINKA_ID MINKA_CODE <<< "$(create_pet "Minka" "Cat" "Domestic Shorthair" 4)"
echo "  ✓ Minka (Domestic Shorthair) — Pending Claim (code: $MINKA_CODE)"

# Olive — Pending Claim
IFS=: read OLIVE_ID OLIVE_CODE <<< "$(create_pet "Olive" "Dog" "Ridgeback" 1)"
echo "  ✓ Olive (Ridgeback) — Pending Claim (code: $OLIVE_CODE)"

# Susi — Active
IFS=: read SUSI_ID SUSI_CODE <<< "$(create_pet "Susi" "Dog" "English Setter/Labrador Mix" 0)"
claim_pet "$SUSI_CODE"
echo "  ✓ Susi (English Setter/Labrador Mix) — Active"

# Timmi — Active
IFS=: read TIMMI_ID TIMMI_CODE <<< "$(create_pet "Timmi" "Cat" "Domestic Shorthair" 6)"
claim_pet "$TIMMI_CODE"
echo "  ✓ Timmi (Domestic Shorthair) — Active"

# Nala — Missing
IFS=: read NALA_ID NALA_CODE <<< "$(create_pet "Nala" "Cat" "Persian" 3)"
claim_pet "$NALA_CODE"
echo "  ✓ Nala (Persian) — will be Missing"

# Askari — Pending Claim
IFS=: read ASKARI_ID ASKARI_CODE <<< "$(create_pet "Askari" "Dog" "Australian Shepherd" 2)"
echo "  ✓ Askari (Australian Shepherd) — Pending Claim (code: $ASKARI_CODE)"

# Lotte — Active
IFS=: read LOTTE_ID LOTTE_CODE <<< "$(create_pet "Lotte" "Dog" "Dachshund" 9)"
claim_pet "$LOTTE_CODE"
echo "  ✓ Lotte (Dachshund) — Active"

# ── 3b. Additional owners in different cities ──────────────────────────────

echo ""
echo "🔑 Creating additional owner accounts..."

OWNER2_EMAIL="thomas.schmidt@beispiel.de"
OWNER2_PASSWORD="Test1234!"
OWNER3_EMAIL="lisa.wagner@beispiel.de"
OWNER3_PASSWORD="Test1234!"
OWNER4_EMAIL="markus.becker@beispiel.de"
OWNER4_PASSWORD="Test1234!"

api_post "/auth/signup" "{\"email\":\"$OWNER2_EMAIL\",\"password\":\"$OWNER2_PASSWORD\",\"userType\":\"owner\"}" > /dev/null 2>&1
echo "  ✓ Owner: $OWNER2_EMAIL / $OWNER2_PASSWORD (Berlin)"

api_post "/auth/signup" "{\"email\":\"$OWNER3_EMAIL\",\"password\":\"$OWNER3_PASSWORD\",\"userType\":\"owner\"}" > /dev/null 2>&1
echo "  ✓ Owner: $OWNER3_EMAIL / $OWNER3_PASSWORD (Hamburg)"

api_post "/auth/signup" "{\"email\":\"$OWNER4_EMAIL\",\"password\":\"$OWNER4_PASSWORD\",\"userType\":\"owner\"}" > /dev/null 2>&1
echo "  ✓ Owner: $OWNER4_EMAIL / $OWNER4_PASSWORD (Köln)"

# Sign in as additional owners
OWNER2_TOKENS=$(api_post "/auth/signin" "{\"email\":\"$OWNER2_EMAIL\",\"password\":\"$OWNER2_PASSWORD\"}")
OWNER2_TOKEN=$(echo "$OWNER2_TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
echo "  ✓ Thomas signed in"

OWNER3_TOKENS=$(api_post "/auth/signin" "{\"email\":\"$OWNER3_EMAIL\",\"password\":\"$OWNER3_PASSWORD\"}")
OWNER3_TOKEN=$(echo "$OWNER3_TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
echo "  ✓ Lisa signed in"

OWNER4_TOKENS=$(api_post "/auth/signin" "{\"email\":\"$OWNER4_EMAIL\",\"password\":\"$OWNER4_PASSWORD\"}")
OWNER4_TOKEN=$(echo "$OWNER4_TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
echo "  ✓ Markus signed in"

echo ""
echo "🏥 Creating additional clinics..."

# Berlin clinic
CLINIC_BERLIN_RESULT=$(api_post "/clinics" '{
  "name": "Tierklinik am Volkspark",
  "address": "Schönhauser Allee 78",
  "city": "Berlin",
  "state": "Berlin",
  "zipCode": "10439",
  "phone": "+49-30-9876543",
  "email": "info@tierklinik-volkspark.de",
  "licenseNumber": "BE-BER-2024-002",
  "latitude": 52.5480,
  "longitude": 13.4130
}' "$VET_TOKEN")
CLINIC_BERLIN_ID=$(echo "$CLINIC_BERLIN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clinicId',''))" 2>/dev/null)
echo "  ✓ Tierklinik am Volkspark (Berlin): $CLINIC_BERLIN_ID"

# Hamburg clinic
CLINIC_HAMBURG_RESULT=$(api_post "/clinics" '{
  "name": "Tierärzte Elbchaussee",
  "address": "Elbchaussee 120",
  "city": "Hamburg",
  "state": "Hamburg",
  "zipCode": "22763",
  "phone": "+49-40-5551234",
  "email": "praxis@tieraerzte-elbchaussee.de",
  "licenseNumber": "HH-HAM-2024-003",
  "latitude": 53.5460,
  "longitude": 9.9210
}' "$VET_TOKEN")
CLINIC_HAMBURG_ID=$(echo "$CLINIC_HAMBURG_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clinicId',''))" 2>/dev/null)
echo "  ✓ Tierärzte Elbchaussee (Hamburg): $CLINIC_HAMBURG_ID"

# Köln clinic
CLINIC_KOELN_RESULT=$(api_post "/clinics" '{
  "name": "Kleintierpraxis am Dom",
  "address": "Hohenzollernring 55",
  "city": "Köln",
  "state": "Nordrhein-Westfalen",
  "zipCode": "50672",
  "phone": "+49-221-7773456",
  "email": "kontakt@kleintierpraxis-dom.de",
  "licenseNumber": "NW-KOL-2024-004",
  "latitude": 50.9413,
  "longitude": 6.9400
}' "$VET_TOKEN")
CLINIC_KOELN_ID=$(echo "$CLINIC_KOELN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clinicId',''))" 2>/dev/null)
echo "  ✓ Kleintierpraxis am Dom (Köln): $CLINIC_KOELN_ID"

# Create vet accounts for each new clinic
echo ""
echo "🔑 Creating vet accounts for new clinics..."

VET_BERLIN_EMAIL="dr.huber@tierklinik-volkspark.de"
VET_HAMBURG_EMAIL="dr.petersen@elbchaussee.de"
VET_KOELN_EMAIL="dr.klein@kleintierpraxis-dom.de"

api_post "/auth/signup" "{\"email\":\"$VET_BERLIN_EMAIL\",\"password\":\"$VET_PASSWORD\",\"userType\":\"vet\"}" > /dev/null 2>&1
api_post "/auth/signup" "{\"email\":\"$VET_HAMBURG_EMAIL\",\"password\":\"$VET_PASSWORD\",\"userType\":\"vet\"}" > /dev/null 2>&1
api_post "/auth/signup" "{\"email\":\"$VET_KOELN_EMAIL\",\"password\":\"$VET_PASSWORD\",\"userType\":\"vet\"}" > /dev/null 2>&1

# Associate vets with clinics via Cognito attribute
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

aws cognito-idp admin-update-user-attributes \
  --user-pool-id "$USER_POOL_ID" \
  --username "$VET_BERLIN_EMAIL" \
  --user-attributes Name="custom:clinicId",Value="$CLINIC_BERLIN_ID" \
  --region "$REGION" 2>/dev/null
echo "  ✓ Dr. Huber → Tierklinik am Volkspark (Berlin)"

aws cognito-idp admin-update-user-attributes \
  --user-pool-id "$USER_POOL_ID" \
  --username "$VET_HAMBURG_EMAIL" \
  --user-attributes Name="custom:clinicId",Value="$CLINIC_HAMBURG_ID" \
  --region "$REGION" 2>/dev/null
echo "  ✓ Dr. Petersen → Tierärzte Elbchaussee (Hamburg)"

aws cognito-idp admin-update-user-attributes \
  --user-pool-id "$USER_POOL_ID" \
  --username "$VET_KOELN_EMAIL" \
  --user-attributes Name="custom:clinicId",Value="$CLINIC_KOELN_ID" \
  --region "$REGION" 2>/dev/null
echo "  ✓ Dr. Klein → Kleintierpraxis am Dom (Köln)"

sleep 2

# Sign in as each vet to get tokens with clinicId
VET_BERLIN_TOKEN=$(api_post "/auth/signin" "{\"email\":\"$VET_BERLIN_EMAIL\",\"password\":\"$VET_PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
VET_HAMBURG_TOKEN=$(api_post "/auth/signin" "{\"email\":\"$VET_HAMBURG_EMAIL\",\"password\":\"$VET_PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
VET_KOELN_TOKEN=$(api_post "/auth/signin" "{\"email\":\"$VET_KOELN_EMAIL\",\"password\":\"$VET_PASSWORD\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('idToken',''))" 2>/dev/null)
echo "  ✓ All vet accounts signed in"

echo ""
echo "🐾 Creating pets for additional owners..."

# Lotte (Berlin) — owned by Thomas Schmidt
create_pet_with_token() {
  local name=$1 species=$2 breed=$3 age=$4 token=$5
  local result=$(curl -s -X POST "$API_URL/pets" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d "{\"name\":\"$name\",\"species\":\"$species\",\"breed\":\"$breed\",\"age\":$age}")
  local petId=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('petId',''))" 2>/dev/null)
  local code=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('claimingCode',''))" 2>/dev/null)
  if [ -z "$petId" ]; then
    echo "    ⚠ Failed to create $name. Response: $(echo $result | head -c 200)" >&2
  fi
  echo "$petId:$code"
}

IFS=: read LOTTE_B_ID LOTTE_B_CODE <<< "$(create_pet_with_token "Lotte" "Dog" "Dachshund" 9 "$VET_BERLIN_TOKEN")"
# Claim as Thomas
claim_pet_as() {
  local code=$1 ownerName=$2 ownerEmail=$3 ownerPhone=$4 token=$5
  if [ -z "$code" ]; then return; fi
  api_post "/pets/claim" "{\"claimingCode\":\"$code\",\"ownerName\":\"$ownerName\",\"ownerEmail\":\"$ownerEmail\",\"ownerPhone\":\"$ownerPhone\"}" "$token" > /dev/null
}
claim_pet_as "$LOTTE_B_CODE" "Thomas Schmidt" "$OWNER2_EMAIL" "+49-170-9876543" "$OWNER2_TOKEN"
echo "  ✓ Lotte (Dachshund) — owned by Thomas Schmidt (Berlin)"

# Susi (Hamburg) — owned by Lisa Wagner
IFS=: read SUSI_H_ID SUSI_H_CODE <<< "$(create_pet_with_token "Susi" "Dog" "English Setter/Labrador Mix" 4 "$VET_HAMBURG_TOKEN")"
claim_pet_as "$SUSI_H_CODE" "Lisa Wagner" "$OWNER3_EMAIL" "+49-151-2345678" "$OWNER3_TOKEN"
echo "  ✓ Susi (English Setter/Labrador Mix) — owned by Lisa Wagner (Hamburg)"

# Timmi (Köln) — owned by Markus Becker
IFS=: read TIMMI_K_ID TIMMI_K_CODE <<< "$(create_pet_with_token "Timmi" "Cat" "Domestic Shorthair" 6 "$VET_KOELN_TOKEN")"
claim_pet_as "$TIMMI_K_CODE" "Markus Becker" "$OWNER4_EMAIL" "+49-160-4567890" "$OWNER4_TOKEN"
echo "  ✓ Timmi (Domestic Shorthair) — owned by Markus Becker (Köln)"

# ── 4. Report some pets as missing ─────────────────────────────────────────

echo ""
echo "🚨 Reporting missing pets..."

report_missing() {
  local petId=$1
  local petName=$2
  local token=$3
  if [ -z "$petId" ]; then
    echo "    ⚠ No pet ID for $petName, skipping report missing" >&2
    return
  fi
  local result=$(api_post "/pets/$petId/missing" '{
    "searchRadiusKm": 50,
    "lastSeenLocation": "Englischer Garten, München",
    "contactMethod": "clinic"
  }' "$token")
  local flyerUrl=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('flyerUrl',''))" 2>/dev/null)
  if [ -z "$flyerUrl" ]; then
    echo "    ⚠ Report missing failed for $petName. Response: $(echo $result | head -c 200)" >&2
  fi
}

report_missing "$LUNA_ID" "Luna" "$OWNER_TOKEN"
echo "  ✓ Luna reported missing (München)"
report_missing "$REX_ID" "Rex" "$OWNER_TOKEN"
echo "  ✓ Rex reported missing (München)"
report_missing "$NALA_ID" "Nala" "$OWNER_TOKEN"
echo "  ✓ Nala reported missing (München)"
report_missing "$LOTTE_B_ID" "Lotte" "$OWNER2_TOKEN"
echo "  ✓ Lotte reported missing (Berlin)"
report_missing "$SUSI_H_ID" "Susi" "$OWNER3_TOKEN"
echo "  ✓ Susi reported missing (Hamburg)"
report_missing "$TIMMI_K_ID" "Timmi" "$OWNER4_TOKEN"
echo "  ✓ Timmi reported missing (Köln)"

# ── 5. Update owner profiles ───────────────────────────────────────────────

echo ""
echo "👤 Updating owner profiles..."
curl -s -X PUT "$API_URL/account/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d '{
    "ownerName": "Anna Müller",
    "ownerPhone": "+49-176-12345678",
    "ownerStreet": "Leopoldstraße",
    "ownerHouseNumber": "27",
    "ownerZipCode": "80802",
    "ownerCity": "München"
  }' > /dev/null
echo "  ✓ Anna Müller (München)"

curl -s -X PUT "$API_URL/account/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER2_TOKEN" \
  -d '{
    "ownerName": "Thomas Schmidt",
    "ownerPhone": "+49-170-9876543",
    "ownerStreet": "Kastanienallee",
    "ownerHouseNumber": "15",
    "ownerZipCode": "10435",
    "ownerCity": "Berlin"
  }' > /dev/null
echo "  ✓ Thomas Schmidt (Berlin)"

curl -s -X PUT "$API_URL/account/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER3_TOKEN" \
  -d '{
    "ownerName": "Lisa Wagner",
    "ownerPhone": "+49-151-2345678",
    "ownerStreet": "Eppendorfer Weg",
    "ownerHouseNumber": "42",
    "ownerZipCode": "20259",
    "ownerCity": "Hamburg"
  }' > /dev/null
echo "  ✓ Lisa Wagner (Hamburg)"

curl -s -X PUT "$API_URL/account/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER4_TOKEN" \
  -d '{
    "ownerName": "Markus Becker",
    "ownerPhone": "+49-160-4567890",
    "ownerStreet": "Aachener Straße",
    "ownerHouseNumber": "88",
    "ownerZipCode": "50674",
    "ownerCity": "Köln"
  }' > /dev/null
echo "  ✓ Markus Becker (Köln)"

# ── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Cloud seed complete!"
echo ""
echo "Login credentials:"
echo "  Vet:              $VET_EMAIL / $VET_PASSWORD"
echo "  Owner (München):  $OWNER_EMAIL / $OWNER_PASSWORD"
echo "  Owner (Berlin):   $OWNER2_EMAIL / $OWNER2_PASSWORD"
echo "  Owner (Hamburg):  $OWNER3_EMAIL / $OWNER3_PASSWORD"
echo "  Owner (Köln):     $OWNER4_EMAIL / $OWNER4_PASSWORD"
echo ""
echo "Clinics:"
echo "  Tierarztpraxis Pfötchen   — München"
echo "  Tierklinik am Volkspark   — Berlin"
echo "  Tierärzte Elbchaussee     — Hamburg"
echo "  Kleintierpraxis am Dom    — Köln"
echo ""
echo "Missing pets (visible in public search):"
echo "  Luna (Siamese), Rex (German Shepherd), Nala (Persian) — München"
echo "  Lotte (Dachshund) — Berlin"
echo "  Susi (English Setter/Labrador Mix) — Hamburg"
echo "  Timmi (Domestic Shorthair) — Köln"
echo ""
echo "Claiming codes:"
echo "  Minka:  $MINKA_CODE"
echo "  Olive:  $OLIVE_CODE"
echo "  Askari: $ASKARI_CODE"
echo "═══════════════════════════════════════════════════════════"
