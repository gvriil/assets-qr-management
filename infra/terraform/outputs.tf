output "s3_endpoint" {
  description = "S3 endpoint URL"
  value       = "https://storage.yandexcloud.net"
}

output "s3_region" {
  description = "S3 region"
  value       = "ru-central1"
}

output "bucket_name" {
  description = "Object Storage bucket name"
  value       = yandex_storage_bucket.inventory_bucket.bucket
}

output "bucket_domain" {
  description = "Bucket domain name"
  value       = yandex_storage_bucket.inventory_bucket.bucket_domain_name
}

output "s3_access_key_id" {
  description = "S3 access key ID"
  value       = yandex_iam_service_account_static_access_key.storage_key.access_key
  sensitive   = false  # Needed for output to .env
}

output "s3_secret_access_key" {
  description = "S3 secret access key"
  value       = yandex_iam_service_account_static_access_key.storage_key.secret_key
  sensitive   = true
}

output "cdn_domain" {
  description = "CDN domain name"
  value       = yandex_cdn_resource.inventory_cdn.cname
}

output "cdn_id" {
  description = "CDN resource ID"
  value       = yandex_cdn_resource.inventory_cdn.id
}

output "service_account_id" {
  description = "Service account ID"
  value       = yandex_iam_service_account.storage_sa.id
}

# Summary output for easy copy-paste to .env
output "env_variables" {
  description = "Environment variables for .env file"
  value = <<-EOT
    # Add these to your .env file:
    S3_ENDPOINT=https://storage.yandexcloud.net
    S3_REGION=ru-central1
    S3_BUCKET=${yandex_storage_bucket.inventory_bucket.bucket}
    S3_ACCESS_KEY_ID=${yandex_iam_service_account_static_access_key.storage_key.access_key}
    S3_SECRET_ACCESS_KEY=${yandex_iam_service_account_static_access_key.storage_key.secret_key}
    S3_PUBLIC_BASE_URL=https://${yandex_cdn_resource.inventory_cdn.cname}
  EOT
  sensitive = true
}
