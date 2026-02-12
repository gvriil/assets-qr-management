# Infrastructure as Code

Automated infrastructure setup for S3 Object Storage + CDN using Terraform.

## Quick Start

```bash
# 1. Configure Terraform variables
cd terraform
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Fill in your Yandex Cloud credentials

# 2. Apply infrastructure
cd ..
./apply.sh

# 3. Export credentials to .env
./outputs-to-env.sh

# 4. Configure DNS CNAME (see output)

# 5. Restart backend
cd ../deploy
docker compose -f docker-compose.prod.yml restart backend
```

## What Gets Created

- ✅ Service Account for S3 access
- ✅ Static Access Key (for API)
- ✅ Object Storage Bucket (private)
- ✅ CORS configuration for browser uploads
- ✅ Lifecycle rules for cleanup
- ✅ CDN Resource with caching
- ✅ Server-side encryption

## Files

- `terraform/` - Terraform configuration
  - `main.tf` - Main resources
  - `variables.tf` - Input variables
  - `outputs.tf` - Output values
  - `terraform.tfvars.example` - Example configuration
- `apply.sh` - Apply infrastructure
- `outputs-to-env.sh` - Export credentials to .env
- `destroy.sh` - Destroy all resources (WARNING!)

## Requirements

- Terraform >= 1.0
- Yandex Cloud account with billing enabled
- OAuth token (get from Yandex OAuth)

## Documentation

See **`docs/STORAGE_S3_CDN.md`** for complete setup guide.

## Costs

Approximately ₽27/month for 1000 photos:
- Storage: ~₽8
- Uploads: ~₽0.30
- CDN: ~₽18

See [Yandex Cloud Pricing](https://cloud.yandex.ru/docs/storage/pricing) for details.

## Cleanup

To destroy all resources:

```bash
./destroy.sh
```

⚠️ **WARNING:** This will delete the bucket and all files!
