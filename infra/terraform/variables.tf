variable "yc_token" {
  description = "Yandex Cloud OAuth token"
  type        = string
  sensitive   = true
}

variable "yc_cloud_id" {
  description = "Yandex Cloud ID"
  type        = string
}

variable "yc_folder_id" {
  description = "Yandex Cloud Folder ID"
  type        = string
}

variable "yc_zone" {
  description = "Yandex Cloud default zone"
  type        = string
  default     = "ru-central1-a"
}

variable "project_name" {
  description = "Project name (used for naming resources)"
  type        = string
  default     = "inventory"
}

variable "environment" {
  description = "Environment (prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "bucket_name" {
  description = "Object Storage bucket name (must be globally unique)"
  type        = string
}

variable "enable_versioning" {
  description = "Enable bucket versioning for file recovery"
  type        = bool
  default     = false
}

variable "cors_origins" {
  description = "Allowed CORS origins for direct browser uploads"
  type        = list(string)
  default     = ["*"]
}

variable "tmp_cleanup_days" {
  description = "Days before temporary files are deleted"
  type        = number
  default     = 7
}

variable "old_versions_retention_days" {
  description = "Days to retain old versions (if versioning enabled)"
  type        = number
  default     = 30
}

variable "cdn_cname" {
  description = "CDN CNAME (e.g., cdn.yourdomain.ru)"
  type        = string
}

variable "cdn_use_custom_cert" {
  description = "Use custom SSL certificate from Certificate Manager"
  type        = bool
  default     = false
}

variable "certificate_manager_id" {
  description = "Certificate Manager ID for custom SSL cert"
  type        = string
  default     = ""
}
