#!/bin/bash
# build-and-deploy.sh
# Builds and deploys the backend SAM stack.
# Includes post-build step to install pdfkit (with font data files)
# into the EmergencyTools Lambda package.
# Automatically resolves the frontend CloudFront URL for APP_BASE_URL.
#
# Usage:
#   ./scripts/build-and-deploy.sh

set -e

REGION="eu-central-1"
FRONTEND_STACK_NAME="paw-print-profile-frontend"

echo "🔨 Building SAM template..."
sam build

echo "📦 Installing pdfkit into EmergencyTools Lambda package..."
npm install --prefix .aws-sam/build/EmergencyToolsFunction pdfkit --quiet 2>/dev/null

# Resolve frontend URL from CloudFront stack (if deployed)
APP_BASE_URL="http://localhost:8080"
FRONTEND_URL=$(aws cloudformation describe-stacks \
  --stack-name "$FRONTEND_STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -n "$FRONTEND_URL" ] && [ "$FRONTEND_URL" != "None" ]; then
  APP_BASE_URL="$FRONTEND_URL"
  echo "🌐 Frontend URL resolved: $APP_BASE_URL"
else
  echo "⚠ Frontend stack not found, using default: $APP_BASE_URL"
fi

echo "🚀 Deploying..."
sam deploy --no-confirm-changeset --parameter-overrides "AppBaseUrl=$APP_BASE_URL"

echo "✅ Backend deployed successfully!"
