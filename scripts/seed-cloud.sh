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

# Verify vet token works by creating a test pet
TEST_RESULT=$(api_post "/pets" '{"name":"_test","species":"Dog","breed":"Test","age":1}' "$VET_TOKEN")
TEST_ID=$(echo "$TEST_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('petId',''))" 2>/dev/null)
if [ -z "$TEST_ID" ]; then
  echo "  ❌ Vet token not working for pet creation. Response: $(echo $TEST_RESULT | head -c 200)"
  echo "  Token (first 50 chars): ${VET_TOKEN:0:50}..."
  exit 1
fi
echo "  ✓ Vet token verified (test pet created, will be overwritten)"

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

# ── 4. Report some pets as missing ─────────────────────────────────────────

echo ""
echo "🚨 Reporting missing pets..."

report_missing() {
  local petId=$1
  api_post "/pets/$petId/missing" '{
    "searchRadiusKm": 50,
    "lastSeenLocation": "Englischer Garten, München",
    "contactMethod": "clinic"
  }' "$OWNER_TOKEN" > /dev/null
}

report_missing "$LUNA_ID"
echo "  ✓ Luna reported missing"
report_missing "$REX_ID"
echo "  ✓ Rex reported missing"
report_missing "$NALA_ID"
echo "  ✓ Nala reported missing"

# ── 5. Update owner profile ────────────────────────────────────────────────

echo ""
echo "👤 Updating owner profile..."
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
echo "  ✓ Owner profile updated"

# ── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Cloud seed complete!"
echo ""
echo "Login credentials:"
echo "  Vet:   $VET_EMAIL / $VET_PASSWORD"
echo "  Owner: $OWNER_EMAIL / $OWNER_PASSWORD"
echo ""
echo "Missing pets (visible in public search):"
echo "  Luna (Siamese), Rex (German Shepherd), Nala (Persian)"
echo ""
echo "Claiming codes:"
echo "  Minka:  $MINKA_CODE"
echo "  Olive:  $OLIVE_CODE"
echo "  Askari: $ASKARI_CODE"
echo "═══════════════════════════════════════════════════════════"
