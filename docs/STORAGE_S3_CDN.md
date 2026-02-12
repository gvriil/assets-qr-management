# S3 Object Storage + CDN Setup Guide

This guide explains how to set up S3-compatible object storage with CDN for photo uploads in the Inventory Management System.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Option A: Yandex Cloud (Recommended for RU)](#option-a-yandex-cloud-recommended-for-ru)
- [Option B: Manual Setup (Any S3-compatible)](#option-b-manual-setup-any-s3-compatible)
- [Backend Configuration](#backend-configuration)
- [Frontend Integration](#frontend-integration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

The S3 + CDN storage solution provides:

✅ **Direct Browser Uploads** - Files upload directly to S3, bypassing backend server
✅ **CDN Distribution** - Fast content delivery with edge caching
✅ **Cost Effective** - Pay only for storage and bandwidth used
✅ **Scalable** - Handles unlimited files without backend load
✅ **Secure** - Presigned URLs with expiration, private bucket
✅ **Auto Cleanup** - Lifecycle rules remove orphaned temporary files

### Upload Flow

```
┌─────────┐   1. Request    ┌─────────┐
│         │  presigned URL  │         │
│ Browser │────────────────>│ Backend │
│         │                 │         │
└────┬────┘                 └────┬────┘
     │                           │
     │ 2. Presigned URL          │
     │<──────────────────────────┘
     │
     │ 3. PUT file directly
     ├──────────────────────────>┌─────────┐
     │                           │   S3    │
     │ 4. Success                │ Bucket  │
     │<──────────────────────────│         │
     │                           └─────────┘
     │ 5. Confirm upload
     ├──────────────────────────>┌─────────┐
     │                           │ Backend │
     │ 6. Save metadata          │ MongoDB │
     │<──────────────────────────│         │
     │                           └─────────┘
     │ 7. Access via CDN
     ├──────────────────────────>┌─────────┐
                                 │   CDN   │
                                 └─────────┘
```

---

## Architecture

### Components

1. **Object Storage (S3)** - Private bucket for file storage
2. **CDN** - Content delivery network with edge caching
3. **Backend** - Issues presigned URLs, validates uploads, stores metadata
4. **MongoDB** - Stores file metadata (key, URL, size, type, etc.)

### Files Organization

```
bucket-name/
├── uploads/
│   ├── 2026/
│   │   ├── 02/
│   │   │   ├── 13/
│   │   │   │   ├── 1739404800000_a1b2c3d4_photo.jpg
│   │   │   │   └── 1739404801000_e5f6g7h8_image.png
└── tmp/
    └── (auto-deleted after 7 days)
```

---

## Prerequisites

### For Yandex Cloud

- Yandex Cloud account
- Cloud and Folder created
- Billing account activated
- Terraform installed (v1.0+)

### For Any S3-compatible Service

- S3 bucket created
- Access credentials (Access Key ID + Secret)
- CORS configured for browser uploads

---

## Option A: Yandex Cloud (Recommended for RU)

### Step 1: Get Yandex Cloud Credentials

#### 1.1 Get OAuth Token

Visit: https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb

After authorization, copy the `access_token` from the URL.

**Example:**
```
https://oauth.yandex.ru/verification_code#access_token=AQAAAAAxxxxxx...
                                         ^^^^^^^^^^^^^^^^^
                                         Copy this token
```

#### 1.2 Get Cloud and Folder IDs

Go to [Yandex Cloud Console](https://console.cloud.yandex.ru/):

1. Click on your cloud name
2. Copy **Cloud ID** (format: `b1gxxxxxxxxxx`)
3. Click on a folder (or create new)
4. Copy **Folder ID** (format: `b1gxxxxxxxxxx`)

### Step 2: Configure Terraform

```bash
cd infra/terraform

# Copy example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

Fill in the values:

```hcl
# From Step 1
yc_token     = "AQAAAAAxxxxxx..."
yc_cloud_id  = "b1gxxxxxxxxxx"
yc_folder_id = "b1gxxxxxxxxxx"

# Bucket must be globally unique
bucket_name = "mycompany-inventory-prod"

# Your domains
cors_origins = [
  "https://inventory.mycompany.ru",
  "https://www.inventory.mycompany.ru"
]

# CDN subdomain (must configure CNAME later)
cdn_cname = "cdn.mycompany.ru"
```

### Step 3: Apply Terraform

```bash
# From project root
cd infra

# Run apply script
./apply.sh
```

The script will:
1. Initialize Terraform
2. Validate configuration
3. Show planned changes
4. Ask for confirmation
5. Create all resources
6. Offer to export credentials to `.env`

### Step 4: Configure DNS CNAME

After Terraform completes, configure DNS:

```
Type: CNAME
Name: cdn
Value: <from Terraform output>
TTL: 3600
```

**Get CDN endpoint from console:**
1. Go to [CDN Resources](https://console.cloud.yandex.ru/folders/{folder-id}/cdn/resources)
2. Find your resource
3. Copy the **Origin domain** value

Example:
```
Name: cdn.mycompany.ru
Type: CNAME
Value: cl-abc12345.edgecdn.ru
```

### Step 5: Update Environment

If you didn't auto-export in Step 3:

```bash
# Export credentials to deploy/.env
./outputs-to-env.sh
```

Or manually add to `deploy/.env`:

```env
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET=mycompany-inventory-prod
S3_ACCESS_KEY_ID=YCAJExxxxxxxxxx
S3_SECRET_ACCESS_KEY=YCOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_PUBLIC_BASE_URL=https://cdn.mycompany.ru
```

### Step 6: Restart Backend

```bash
cd deploy
docker compose -f docker-compose.prod.yml restart backend

# Check logs
docker compose -f docker-compose.prod.yml logs -f backend
```

---

## Option B: Manual Setup (Any S3-compatible)

### Step 1: Create S3 Bucket

Create a bucket in your S3 service (AWS, DigitalOcean Spaces, MinIO, etc.)

### Step 2: Configure CORS

Add CORS policy to allow browser uploads:

```json
[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 3: Create Access Keys

Generate S3 access credentials:
- Access Key ID
- Secret Access Key

### Step 4: Configure Backend

Edit `deploy/.env`:

```env
# AWS S3 example
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=AKIAxxxxxxxxxx
S3_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
S3_PUBLIC_BASE_URL=https://d111111abcdef8.cloudfront.net  # CDN domain

# DigitalOcean Spaces example
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=your-space-name
S3_ACCESS_KEY_ID=DO00xxxxxxxxxx
S3_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
S3_PUBLIC_BASE_URL=https://your-space-name.nyc3.cdn.digitaloceanspaces.com
```

### Step 5: Optional - Setup CDN

For AWS: CloudFront
For DigitalOcean: CDN included
For others: Cloudflare, Fastly, etc.

Update `S3_PUBLIC_BASE_URL` with CDN domain.

---

## Backend Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `S3_ENDPOINT` | Yes | - | S3 service endpoint URL |
| `S3_REGION` | Yes | `ru-central1` | S3 region |
| `S3_BUCKET` | Yes | - | Bucket name |
| `S3_ACCESS_KEY_ID` | Yes | - | Access key ID |
| `S3_SECRET_ACCESS_KEY` | Yes | - | Secret access key |
| `S3_PUBLIC_BASE_URL` | No | Auto | Public URL for files (CDN domain) |
| `PRESIGN_EXPIRES_SECONDS` | No | `3600` | Presigned URL lifetime (seconds) |
| `UPLOAD_MAX_MB` | No | `10` | Maximum file size (MB) |

### API Endpoints

#### 1. Request Presigned URL

```http
POST /api/files/presign
Authorization: Bearer {token}
Content-Type: application/json

{
  "filename": "photo.jpg",
  "content_type": "image/jpeg",
  "content_length": 1024000,
  "prefix": "uploads"
}
```

**Response:**
```json
{
  "upload_url": "https://storage.yandexcloud.net/bucket/...",
  "key": "uploads/2026/02/13/1739404800_a1b2c3d4_photo.jpg",
  "method": "PUT",
  "headers": {
    "Content-Type": "image/jpeg",
    "Content-Length": "1024000"
  },
  "expires_at": 1739408400.0
}
```

#### 2. Upload to S3

```http
PUT {upload_url}
Content-Type: image/jpeg
Content-Length: 1024000

<binary file data>
```

#### 3. Confirm Upload

```http
POST /api/files/confirm
Authorization: Bearer {token}
Content-Type: application/json

{
  "key": "uploads/2026/02/13/1739404800_a1b2c3d4_photo.jpg",
  "filename": "photo.jpg",
  "content_type": "image/jpeg",
  "size": 1024000
}
```

**Response:**
```json
{
  "id": "uuid",
  "key": "uploads/...",
  "filename": "photo.jpg",
  "content_type": "image/jpeg",
  "size": 1024000,
  "public_url": "https://cdn.mycompany.ru/uploads/...",
  "created_at": "2026-02-13T12:00:00Z",
  "created_by": "user-id"
}
```

---

## Frontend Integration

### Example: React Upload Component

```typescript
async function uploadFile(file: File) {
  // 1. Request presigned URL
  const presignResponse = await fetch('/api/files/presign', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      content_length: file.size,
      prefix: 'uploads'
    })
  });

  const { upload_url, key, headers } = await presignResponse.json();

  // 2. Upload directly to S3
  await fetch(upload_url, {
    method: 'PUT',
    headers: headers,
    body: file
  });

  // 3. Confirm upload
  const confirmResponse = await fetch('/api/files/confirm', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key: key,
      filename: file.name,
      content_type: file.type,
      size: file.size
    })
  });

  const fileMetadata = await confirmResponse.json();

  // Use fileMetadata.public_url to display image
  return fileMetadata;
}
```

---

## Testing

### Test S3 Upload Flow

```bash
# 1. Get presigned URL
curl -X POST https://your-domain.ru/api/files/presign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.jpg",
    "content_type": "image/jpeg",
    "content_length": 1024,
    "prefix": "uploads"
  }'

# 2. Upload file to presigned URL
curl -X PUT "PRESIGNED_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test.jpg

# 3. Confirm upload
curl -X POST https://your-domain.ru/api/files/confirm \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "KEY_FROM_STEP_1",
    "filename": "test.jpg",
    "content_type": "image/jpeg",
    "size": 1024
  }'
```

### Check Backend Logs

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f backend | grep -i s3
```

### Verify in Yandex Cloud Console

1. Go to Object Storage
2. Open your bucket
3. Check files in `uploads/` folder

---

## Troubleshooting

### S3 Not Enabled

**Error:** `S3 storage is not configured`

**Fix:** Check environment variables in `deploy/.env`:
```bash
docker compose -f deploy/docker-compose.prod.yml exec backend env | grep S3
```

### CORS Error

**Error:** `Access to fetch at '...' from origin '...' has been blocked by CORS`

**Fix:** Update CORS settings in Terraform:
```hcl
cors_origins = [
  "https://your-domain.ru",
  "https://www.your-domain.ru"
]
```

Re-apply Terraform:
```bash
cd infra && ./apply.sh
```

### Presigned URL Expired

**Error:** `Request has expired`

**Fix:** Increase expiration time in `.env`:
```env
PRESIGN_EXPIRES_SECONDS=7200  # 2 hours
```

### File Too Large

**Error:** `File size exceeds maximum`

**Fix:** Increase limit in `.env`:
```env
UPLOAD_MAX_MB=50  # 50 MB
```

### CDN Not Working

**Check:**
1. DNS CNAME configured correctly
2. CDN resource is active in Yandex Cloud
3. Wait for DNS propagation (up to 24h, usually 15min)

```bash
# Test DNS
dig cdn.your-domain.ru

# Should show CNAME to Yandex CDN
```

---

## Cost Estimation (Yandex Cloud)

### Object Storage

- Storage: ₽1.61 per GB/month
- GET requests: ₽0.30 per 10,000
- PUT requests: ₽3.20 per 10,000

### CDN

- Traffic RU: ₽1.80 per GB
- Traffic Worldwide: ₽3.50 per GB

### Example: 1000 photos/month

- Storage: 5GB × ₽1.61 = ₽8.05
- Uploads: 1000 × ₽0.00032 = ₽0.32
- CDN: 10GB × ₽1.80 = ₽18

**Total:** ~₽27/month (~$0.30 USD)

---

## Security Best Practices

1. ✅ **Private Bucket** - Never make bucket public
2. ✅ **Presigned URLs** - Use expiring URLs for uploads
3. ✅ **File Validation** - Check file type and size
4. ✅ **Access Control** - Only authenticated users can upload
5. ✅ **CORS** - Restrict to your domains only
6. ✅ **Lifecycle Rules** - Auto-delete temporary files
7. ✅ **Encryption** - Enable server-side encryption
8. ✅ **Monitoring** - Track bucket access logs

---

## Additional Resources

- [Yandex Object Storage Docs](https://cloud.yandex.ru/docs/storage/)
- [Yandex CDN Docs](https://cloud.yandex.ru/docs/cdn/)
- [Terraform Yandex Provider](https://registry.terraform.io/providers/yandex-cloud/yandex/latest/docs)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [S3 Presigned URLs Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)

---

**Last Updated:** February 2026
