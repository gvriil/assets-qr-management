terraform {
  required_version = ">= 1.0"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.100"
    }
  }
}

# Provider configuration
provider "yandex" {
  token     = var.yc_token
  cloud_id  = var.yc_cloud_id
  folder_id = var.yc_folder_id
  zone      = var.yc_zone
}

# Service Account for Object Storage
resource "yandex_iam_service_account" "storage_sa" {
  name        = "${var.project_name}-storage-sa"
  description = "Service account for Object Storage access"
  folder_id   = var.yc_folder_id
}

# Grant storage.editor role to service account
resource "yandex_resourcemanager_folder_iam_member" "storage_editor" {
  folder_id = var.yc_folder_id
  role      = "storage.editor"
  member    = "serviceAccount:${yandex_iam_service_account.storage_sa.id}"
}

# Create static access key for S3 API
resource "yandex_iam_service_account_static_access_key" "storage_key" {
  service_account_id = yandex_iam_service_account.storage_sa.id
  description        = "Static access key for S3 API"
}

# Create Object Storage bucket
resource "yandex_storage_bucket" "inventory_bucket" {
  bucket     = var.bucket_name
  access_key = yandex_iam_service_account_static_access_key.storage_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.storage_key.secret_key

  # Make bucket private (access through CDN or presigned URLs)
  acl = "private"

  # Enable versioning for file recovery
  versioning {
    enabled = var.enable_versioning
  }

  # CORS configuration for browser uploads
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.cors_origins
    expose_headers  = ["ETag", "Content-Length", "Content-Type"]
    max_age_seconds = 3600
  }

  # Lifecycle rule to clean up temporary/unconfirmed uploads
  lifecycle_rule {
    id      = "cleanup-tmp"
    enabled = true
    prefix  = "tmp/"

    expiration {
      days = var.tmp_cleanup_days
    }
  }

  # Optional: Lifecycle rule for old versions
  dynamic "lifecycle_rule" {
    for_each = var.enable_versioning ? [1] : []
    content {
      id      = "cleanup-old-versions"
      enabled = true

      noncurrent_version_expiration {
        days = var.old_versions_retention_days
      }
    }
  }

  # Server-side encryption
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "aws:kms"
      }
    }
  }

  # Tags
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CDN Resource
resource "yandex_cdn_resource" "inventory_cdn" {
  cname = var.cdn_cname
  active = true

  origin_protocol = "https"

  origin_group_id = yandex_cdn_origin_group.inventory_origin.id

  # SSL certificate
  ssl_certificate {
    type = var.cdn_use_custom_cert ? "cm" : "not_used"
    # certificate_manager_id = var.cdn_use_custom_cert ? var.certificate_manager_id : null
  }

  # Caching settings
  options {
    edge_cache_settings = "345600"  # 4 days in seconds
    browser_cache_settings = "2592000"  # 30 days

    # Enable CORS
    cors = ["*"]

    # Compression
    gzip_on = true

    # Cache query strings
    query_params_options {
      query_params_whitelist = []
    }

    # Allowed HTTP methods
    allowed_http_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST"]
  }
}

# CDN Origin Group
resource "yandex_cdn_origin_group" "inventory_origin" {
  name = "${var.project_name}-origin"

  use_next = true

  origin {
    source = "${var.bucket_name}.storage.yandexcloud.net"
    enabled = true
  }
}
