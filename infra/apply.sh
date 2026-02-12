#!/bin/bash
#
# Terraform Apply Script
# Initializes and applies Terraform configuration for Yandex Cloud infrastructure
#

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/terraform"

echo "🚀 Yandex Cloud Infrastructure Setup"
echo "===================================="
echo ""

# Check if terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform is not installed"
    echo "Install from: https://www.terraform.io/downloads"
    exit 1
fi

# Check if terraform.tfvars exists
if [ ! -f "$TERRAFORM_DIR/terraform.tfvars" ]; then
    echo "❌ terraform.tfvars not found!"
    echo ""
    echo "Please create it from the example:"
    echo "  cd $TERRAFORM_DIR"
    echo "  cp terraform.tfvars.example terraform.tfvars"
    echo "  nano terraform.tfvars  # Edit with your values"
    echo ""
    exit 1
fi

cd "$TERRAFORM_DIR"

echo "📋 Terraform Configuration:"
echo "  Working directory: $TERRAFORM_DIR"
echo ""

# Initialize Terraform
echo "🔧 Initializing Terraform..."
terraform init

# Validate configuration
echo ""
echo "✅ Validating configuration..."
terraform validate

# Plan changes
echo ""
echo "📊 Planning changes..."
terraform plan -out=tfplan

# Ask for confirmation
echo ""
read -p "Apply these changes? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "❌ Aborted by user"
    rm -f tfplan
    exit 1
fi

# Apply changes
echo ""
echo "🚀 Applying changes..."
terraform apply tfplan

# Clean up plan file
rm -f tfplan

# Show outputs
echo ""
echo "✅ Infrastructure created successfully!"
echo ""
echo "📝 Outputs:"
terraform output

# Offer to export to .env
echo ""
read -p "Export credentials to deploy/.env? (yes/no): " export_env

if [ "$export_env" = "yes" ]; then
    bash "$SCRIPT_DIR/outputs-to-env.sh"
fi

echo ""
echo "✅ Done!"
echo ""
echo "Next steps:"
echo "1. Configure CNAME for CDN: $(terraform output -raw cdn_domain)"
echo "2. Update deploy/.env with S3 credentials"
echo "3. Restart backend: docker compose -f deploy/docker-compose.prod.yml restart backend"
echo ""
