#!/bin/bash
# deploy-frontend.sh
# Deploys the React frontend to S3 + CloudFront.
# Run this AFTER sam deploy (backend) has completed.
#
# Usage:
#   ./scripts/deploy-frontend.sh [environment]
#   ./scripts/deploy-frontend.sh dev
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Backend stack already deployed (sam deploy)
#   - Node.js installed locally

set -e

ENVIRONMENT=${1:-dev}
STACK_NAME="paw-print-profile-frontend"
BACKEND_STACK_NAME="paw-print-profile"
REGION="eu-central-1"

echo "🚀 Deploying frontend for environment: $ENVIRONMENT"

# Step 1: Get the API Gateway URL from the backend stack
echo "📡 Getting API URL from backend stack..."
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$BACKEND_STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

if [ -z "$API_URL" ]; then
  echo "❌ Could not find API URL from backend stack '$BACKEND_STACK_NAME'"
  echo "   Make sure the backend is deployed first: sam deploy --guided"
  exit 1
fi

echo "✅ API URL: $API_URL"

# Step 2: Deploy the frontend infrastructure (S3 + CloudFront) if not already done
echo "🏗️  Deploying frontend infrastructure (S3 + CloudFront)..."
aws cloudformation deploy \
  --template-file template-frontend.yaml \
  --stack-name "$STACK_NAME" \
  --parameter-overrides Environment="$ENVIRONMENT" BackendApiUrl="$API_URL" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

# Step 3: Get the S3 bucket name and CloudFront distribution ID
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)

FRONTEND_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text)

echo "✅ S3 Bucket: $BUCKET_NAME"
echo "✅ CloudFront Distribution: $DISTRIBUTION_ID"

# Step 4: Build the React app with the production API URL
echo "🔨 Building React app..."
cd frontend
VITE_API_URL="$API_URL" npm run build
cd ..

# Step 5: Upload to S3
echo "📤 Uploading to S3..."
aws s3 sync frontend/dist/ "s3://$BUCKET_NAME" \
  --delete \
  --region "$REGION"

# Step 6: Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region "$REGION" > /dev/null

echo ""
echo "✅ Frontend deployed successfully!"
echo "🌐 URL: $FRONTEND_URL"
echo ""
echo "Note: CloudFront may take 5-10 minutes to propagate globally."
