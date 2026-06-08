#!/bin/bash
# build-and-deploy.sh
# Builds and deploys the backend SAM stack.
# Includes post-build step to install pdfkit (with font data files)
# into the EmergencyTools Lambda package.
#
# Usage:
#   ./scripts/build-and-deploy.sh

set -e

echo "🔨 Building SAM template..."
sam build

echo "📦 Installing pdfkit into EmergencyTools Lambda package..."
npm install --prefix .aws-sam/build/EmergencyToolsFunction pdfkit --quiet 2>/dev/null

echo "🚀 Deploying..."
sam deploy --no-confirm-changeset

echo "✅ Backend deployed successfully!"
