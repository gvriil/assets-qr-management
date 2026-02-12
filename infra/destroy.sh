#!/bin/bash
#
# Terraform Destroy Script
# WARNING: This will DELETE all cloud resources!
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/terraform"

echo "⚠️  WARNING: DESTRUCTIVE OPERATION"
echo "=================================="
echo ""
echo "This will DESTROY all cloud resources including:"
echo "  - Object Storage bucket (and all files!)"
echo "  - CDN resource"
echo "  - Service account and access keys"
echo ""

read -p "Are you absolutely sure? Type 'destroy' to confirm: " confirmation

if [ "$confirmation" != "destroy" ]; then
    echo "❌ Aborted"
    exit 1
fi

cd "$TERRAFORM_DIR"

echo ""
echo "🗑️  Destroying infrastructure..."
terraform destroy

echo ""
echo "✅ All resources destroyed"
echo ""
echo "⚠️  Remember to:"
echo "1. Remove S3_ variables from deploy/.env"
echo "2. Remove DNS CNAME record for CDN"
echo ""
