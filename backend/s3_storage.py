"""
S3-compatible storage module for file uploads
Supports Yandex Object Storage, AWS S3, and other S3-compatible services
"""
import os
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import logging
import mimetypes
import hashlib

logger = logging.getLogger(__name__)


class S3Storage:
    """S3-compatible storage handler"""

    def __init__(self):
        """Initialize S3 client with environment variables"""
        self.endpoint = os.getenv('S3_ENDPOINT')
        self.region = os.getenv('S3_REGION', 'ru-central1')
        self.bucket = os.getenv('S3_BUCKET')
        self.access_key_id = os.getenv('S3_ACCESS_KEY_ID')
        self.secret_access_key = os.getenv('S3_SECRET_ACCESS_KEY')
        self.public_base_url = os.getenv('S3_PUBLIC_BASE_URL')
        self.presign_expires = int(os.getenv('PRESIGN_EXPIRES_SECONDS', '600'))  # 10 minutes default
        self.max_upload_mb = int(os.getenv('UPLOAD_MAX_MB', '10'))

        # Validate configuration
        if not all([self.endpoint, self.bucket, self.access_key_id, self.secret_access_key]):
            logger.warning("S3 storage not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY")
            self.enabled = False
            self.client = None
            return

        self.enabled = True

        # Initialize boto3 client
        try:
            self.client = boto3.client(
                's3',
                endpoint_url=self.endpoint,
                region_name=self.region,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                config=Config(
                    signature_version='s3v4',
                    s3={'addressing_style': 'virtual'}
                )
            )
            logger.info(f"S3 storage initialized: endpoint={self.endpoint}, bucket={self.bucket}")
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.enabled = False
            self.client = None

    def is_enabled(self) -> bool:
        """Check if S3 storage is enabled and configured"""
        return self.enabled and self.client is not None

    def generate_key(self, filename: str, object_id: str, prefix: str = "objects") -> str:
        """
        Generate unique S3 key for file
        Format: objects/{object_id}/photos/{uuid}.{ext}

        Args:
            filename: Original filename (to extract extension)
            object_id: Object ID this file belongs to
            prefix: Base prefix (default: "objects")

        Returns:
            S3 key path
        """
        import uuid as uuid_module

        # Extract file extension
        ext = ""
        if "." in filename:
            ext = filename.rsplit(".", 1)[-1].lower()
            # Validate extension
            allowed_exts = ["jpg", "jpeg", "png", "webp", "heic", "heif"]
            if ext not in allowed_exts:
                ext = "jpg"  # fallback
        else:
            ext = "jpg"

        # Generate UUID for uniqueness
        file_uuid = str(uuid_module.uuid4())

        # Build key: objects/{object_id}/photos/{uuid}.{ext}
        key = f"{prefix}/{object_id}/photos/{file_uuid}.{ext}"
        return key

    def generate_presigned_put_url(
        self,
        key: str,
        content_type: str,
        content_length: int,
        expires_in: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate presigned URL for PUT upload

        Args:
            key: S3 object key
            content_type: MIME type of the file
            content_length: Size of file in bytes
            expires_in: URL expiration in seconds (default: from config)

        Returns:
            dict with 'url', 'key', 'fields' (for POST) or just 'url' (for PUT)
        """
        if not self.is_enabled():
            raise RuntimeError("S3 storage is not enabled")

        # Validate file size
        max_bytes = self.max_upload_mb * 1024 * 1024
        if content_length > max_bytes:
            raise ValueError(f"File size {content_length} exceeds maximum {max_bytes} bytes ({self.max_upload_mb}MB)")

        expires = expires_in or self.presign_expires

        try:
            # Generate presigned PUT URL
            url = self.client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket,
                    'Key': key,
                    'ContentType': content_type,
                    'ContentLength': content_length,
                },
                ExpiresIn=expires,
                HttpMethod='PUT'
            )

            return {
                'url': url,
                'key': key,
                'method': 'PUT',
                'headers': {
                    'Content-Type': content_type,
                    'Content-Length': str(content_length)
                },
                'expires_at': datetime.now(timezone.utc).timestamp() + expires
            }
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise RuntimeError(f"Failed to generate upload URL: {str(e)}")

    def get_public_url(self, key: str) -> str:
        """
        Get public URL for uploaded file
        Uses CDN URL if S3_PUBLIC_BASE_URL is set, otherwise generates S3 URL
        """
        if self.public_base_url:
            # Use CDN or custom domain
            base = self.public_base_url.rstrip('/')
            return f"{base}/{key}"
        else:
            # Generate direct S3 URL
            if 'storage.yandexcloud.net' in self.endpoint:
                # Yandex Cloud format
                return f"https://{self.bucket}.storage.yandexcloud.net/{key}"
            else:
                # Generic S3 format
                endpoint = self.endpoint.replace('https://', '').replace('http://', '')
                return f"https://{self.bucket}.{endpoint}/{key}"

    def delete_object(self, key: str) -> bool:
        """Delete object from S3"""
        if not self.is_enabled():
            return False

        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
            logger.info(f"Deleted S3 object: {key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete S3 object {key}: {e}")
            return False

    def check_object_exists(self, key: str) -> bool:
        """Check if object exists in S3"""
        if not self.is_enabled():
            return False

        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    def get_object_metadata(self, key: str) -> Optional[Dict[str, Any]]:
        """Get object metadata from S3"""
        if not self.is_enabled():
            return None

        try:
            response = self.client.head_object(Bucket=self.bucket, Key=key)
            return {
                'size': response['ContentLength'],
                'content_type': response.get('ContentType'),
                'last_modified': response.get('LastModified'),
                'etag': response.get('ETag', '').strip('"')
            }
        except ClientError as e:
            logger.error(f"Failed to get metadata for {key}: {e}")
            return None


# Global instance
s3_storage = S3Storage()


def get_s3_storage() -> S3Storage:
    """Get S3 storage instance"""
    return s3_storage
