#!/bin/bash
# cleanup-cloud.sh
# Removes all test data from the AWS deployment so seed-cloud.sh can run fresh.
# Deletes Cognito users and clears the DynamoDB table.
#
# Usage:
#   ./scripts/cleanup-cloud.sh

set -e

REGION="eu-central-1"
STACK_NAME="paw-print-profile"

echo "🧹 Cleaning up cloud test data..."
echo ""

# Get resource IDs from CloudFormation outputs
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" \
  --output text)

if [ -z "$USER_POOL_ID" ] || [ -z "$TABLE_NAME" ]; then
  echo "❌ Could not get stack outputs. Is the backend deployed?"
  exit 1
fi

echo "  User Pool: $USER_POOL_ID"
echo "  Table: $TABLE_NAME"
echo ""

# ── 1. Delete Cognito users ────────────────────────────────────────────────

echo "🔑 Deleting Cognito users..."

# List all users in the pool
USERS=$(aws cognito-idp list-users \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query "Users[].Username" \
  --output text)

if [ -n "$USERS" ]; then
  for username in $USERS; do
    aws cognito-idp admin-delete-user \
      --user-pool-id "$USER_POOL_ID" \
      --username "$username" \
      --region "$REGION"
    echo "  ✓ Deleted user: $username"
  done
else
  echo "  No users to delete"
fi

# ── 2. Clear DynamoDB table ────────────────────────────────────────────────

echo ""
echo "🗄️  Clearing DynamoDB table: $TABLE_NAME..."

# Scan all items and delete them in batches
ITEMS=$(aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --projection-expression "PK, SK" \
  --query "Items[].{PK:PK.S,SK:SK.S}" \
  --output json)

COUNT=$(echo "$ITEMS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [ "$COUNT" -gt "0" ]; then
  echo "  Deleting $COUNT items..."
  echo "$ITEMS" | python3 -c "
import sys, json, subprocess

items = json.load(sys.stdin)
batch = []
deleted = 0

for item in items:
    batch.append({
        'DeleteRequest': {
            'Key': {
                'PK': {'S': item['PK']},
                'SK': {'S': item['SK']}
            }
        }
    })
    
    # DynamoDB batch limit is 25
    if len(batch) == 25:
        request = json.dumps({'$TABLE_NAME': batch})
        subprocess.run([
            'aws', 'dynamodb', 'batch-write-item',
            '--request-items', request,
            '--region', '$REGION'
        ], capture_output=True)
        deleted += len(batch)
        batch = []

# Remaining items
if batch:
    request = json.dumps({'$TABLE_NAME': batch})
    subprocess.run([
        'aws', 'dynamodb', 'batch-write-item',
        '--request-items', request,
        '--region', '$REGION'
    ], capture_output=True)
    deleted += len(batch)

print(f'  ✓ Deleted {deleted} items')
"
else
  echo "  Table is already empty"
fi

echo ""
echo "✅ Cleanup complete! Run ./scripts/seed-cloud.sh to re-seed."
