"""
Integration tests for S3 storage functionality
Run with: pytest backend/test_s3_storage.py
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from s3_storage import S3Storage
import os


class TestS3Storage:
    """Test S3Storage class"""

    def test_init_without_config(self):
        """Test that S3Storage initializes as disabled without config"""
        with patch.dict(os.environ, {}, clear=True):
            s3 = S3Storage()
            assert s3.is_enabled() is False
            assert s3.client is None

    def test_init_with_config(self):
        """Test that S3Storage initializes correctly with config"""
        env_vars = {
            'S3_ENDPOINT': 'https://storage.yandexcloud.net',
            'S3_BUCKET': 'test-bucket',
            'S3_ACCESS_KEY_ID': 'test-key-id',
            'S3_SECRET_ACCESS_KEY': 'test-secret-key',
            'S3_REGION': 'ru-central1'
        }

        with patch.dict(os.environ, env_vars):
            with patch('s3_storage.boto3.client') as mock_boto3:
                mock_client = Mock()
                mock_boto3.return_value = mock_client

                s3 = S3Storage()

                assert s3.is_enabled() is True
                assert s3.endpoint == 'https://storage.yandexcloud.net'
                assert s3.bucket == 'test-bucket'
                assert s3.presign_expires == 600  # default
                assert s3.max_upload_mb == 10  # default

    def test_generate_key_structure(self):
        """Test S3 key generation structure"""
        env_vars = {
            'S3_ENDPOINT': 'https://storage.yandexcloud.net',
            'S3_BUCKET': 'test-bucket',
            'S3_ACCESS_KEY_ID': 'test-key-id',
            'S3_SECRET_ACCESS_KEY': 'test-secret-key'
        }

        with patch.dict(os.environ, env_vars):
            with patch('s3_storage.boto3.client'):
                s3 = S3Storage()

                key = s3.generate_key(
                    filename="test.jpg",
                    object_id="obj-123",
                    prefix="objects"
                )

                # Check structure: objects/{object_id}/photos/{uuid}.{ext}
                assert key.startswith("objects/obj-123/photos/")
                assert key.endswith(".jpg")

                parts = key.split('/')
                assert len(parts) == 4  # objects / obj-123 / photos / uuid.ext
                assert parts[0] == "objects"
                assert parts[1] == "obj-123"
                assert parts[2] == "photos"

    def test_validate_file_extension(self):
        """Test file extension extraction and validation"""
        env_vars = {
            'S3_ENDPOINT': 'https://storage.yandexcloud.net',
            'S3_BUCKET': 'test-bucket',
            'S3_ACCESS_KEY_ID': 'test-key-id',
            'S3_SECRET_ACCESS_KEY': 'test-secret-key'
        }

        with patch.dict(os.environ, env_vars):
            with patch('s3_storage.boto3.client'):
                s3 = S3Storage()

                # Test valid extensions
                for filename, expected_ext in [
                    ("photo.jpg", ".jpg"),
                    ("image.PNG", ".png"),
                    ("pic.WEBP", ".webp"),
                    ("test.heic", ".heic")
                ]:
                    key = s3.generate_key(filename, "test-id")
                    assert key.endswith(expected_ext.lower())

                # Test invalid extension (should fallback to .jpg)
                key = s3.generate_key("file.pdf", "test-id")
                assert key.endswith(".jpg")

    def test_file_size_validation(self):
        """Test file size validation"""
        env_vars = {
            'S3_ENDPOINT': 'https://storage.yandexcloud.net',
            'S3_BUCKET': 'test-bucket',
            'S3_ACCESS_KEY_ID': 'test-key-id',
            'S3_SECRET_ACCESS_KEY': 'test-secret-key',
            'UPLOAD_MAX_MB': '5'  # 5 MB limit
        }

        with patch.dict(os.environ, env_vars):
            with patch('s3_storage.boto3.client') as mock_boto3:
                mock_client = Mock()
                mock_boto3.return_value = mock_client

                s3 = S3Storage()

                # Test file within limit (5MB = 5242880 bytes)
                # Should not raise
                try:
                    s3.generate_presigned_put_url(
                        key="test/key",
                        content_type="image/jpeg",
                        content_length=5242880  # Exactly 5MB
                    )
                except ValueError:
                    pytest.fail("Should not raise for file at limit")

                # Test file over limit
                with pytest.raises(ValueError, match="exceeds maximum"):
                    s3.generate_presigned_put_url(
                        key="test/key",
                        content_type="image/jpeg",
                        content_length=5242881  # 1 byte over
                    )

    def test_get_public_url_with_cdn(self):
        """Test public URL generation with CDN"""
        env_vars = {
            'S3_ENDPOINT': 'https://storage.yandexcloud.net',
            'S3_BUCKET': 'test-bucket',
            'S3_ACCESS_KEY_ID': 'test-key-id',
            'S3_SECRET_ACCESS_KEY': 'test-secret-key',
            'S3_PUBLIC_BASE_URL': 'https://cdn.example.com'
        }

        with patch.dict(os.environ, env_vars):
            with patch('s3_storage.boto3.client'):
                s3 = S3Storage()

                url = s3.get_public_url("objects/123/photos/test.jpg")
                assert url == "https://cdn.example.com/objects/123/photos/test.jpg"

    def test_get_public_url_without_cdn(self):
        """Test public URL generation without CDN (direct bucket)"""
        env_vars = {
            'S3_ENDPOINT': 'https://storage.yandexcloud.net',
            'S3_BUCKET': 'my-bucket',
            'S3_ACCESS_KEY_ID': 'test-key-id',
            'S3_SECRET_ACCESS_KEY': 'test-secret-key'
        }

        with patch.dict(os.environ, env_vars):
            with patch('s3_storage.boto3.client'):
                s3 = S3Storage()

                url = s3.get_public_url("objects/123/photos/test.jpg")
                assert url == "https://my-bucket.storage.yandexcloud.net/objects/123/photos/test.jpg"


# Integration test stubs for API endpoints
class TestS3APIEndpoints:
    """
    Integration test stubs for S3 file upload endpoints

    To run full integration tests:
    1. Set up test S3 bucket
    2. Configure test environment variables
    3. Run: pytest backend/test_s3_storage.py -v
    """

    @pytest.mark.skip(reason="Requires live S3 bucket and credentials")
    def test_presign_upload_flow(self):
        """
        Test complete presign -> upload -> confirm flow

        Steps:
        1. POST /api/files/presign with file metadata
        2. Verify presigned URL is returned
        3. PUT file to presigned URL
        4. POST /api/files/confirm
        5. Verify file metadata is stored
        6. Verify public_url is computed correctly
        """
        # TODO: Implement with test client and test S3 bucket
        pass

    @pytest.mark.skip(reason="Requires live S3 bucket and credentials")
    def test_file_type_validation(self):
        """
        Test that only allowed file types can be uploaded

        Should accept: image/jpeg, image/png, image/webp, image/heic
        Should reject: application/pdf, text/plain, etc.
        """
        # TODO: Implement
        pass

    @pytest.mark.skip(reason="Requires live S3 bucket and credentials")
    def test_file_size_validation_endpoint(self):
        """
        Test that files exceeding UPLOAD_MAX_MB are rejected
        """
        # TODO: Implement
        pass

    @pytest.mark.skip(reason="Requires live S3 bucket and credentials")
    def test_presign_url_expiration(self):
        """
        Test that presigned URLs expire after PRESIGN_EXPIRES_SECONDS
        """
        # TODO: Implement
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
