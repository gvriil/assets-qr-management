"""
Backend API Tests for Inventory System MVP
Tests: Auth, Rates, Users, Invites, Export, QA, Objects, References
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "0020992@gmail.com"
TEST_PASSWORD = "admin123"


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self):
        """Test health check returns OK"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✅ Health check passed")


class TestAuthentication:
    """Authentication flow tests"""
    
    def test_login_returns_2fa_code(self):
        """Test login triggers 2FA and returns dev_code"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["requires_2fa"] == True
        assert "dev_code" in data
        assert len(data["dev_code"]) == 6
        print(f"✅ Login returned 2FA code: {data['dev_code']}")
    
    def test_2fa_verification(self):
        """Test 2FA verification returns token"""
        # First get 2FA code
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        
        # Verify 2FA
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        assert verify_res.status_code == 200
        data = verify_res.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✅ 2FA verification successful, token received")
    
    def test_invalid_2fa_code(self):
        """Test invalid 2FA code is rejected"""
        # First trigger 2FA
        requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        # Try invalid code
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": "000000"
        })
        assert verify_res.status_code == 400
        print("✅ Invalid 2FA code correctly rejected")


class TestAuthenticatedEndpoints:
    """Tests requiring authentication"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token before each test"""
        # Login
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        
        # Verify 2FA
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_current_user(self):
        """Test /auth/me returns current user"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        assert data["role"] == "admin"
        print(f"✅ Current user: {data['name']} ({data['role']})")


class TestRatesAPI:
    """Rates endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_rates(self):
        """Test GET /rates returns S, M, L rates"""
        response = requests.get(f"{BASE_URL}/api/rates", headers=self.headers)
        assert response.status_code == 200
        rates = response.json()
        
        # Should have 3 rates
        assert len(rates) >= 3
        
        # Check for S, M, L complexity
        complexities = [r["complexity"] for r in rates]
        assert "S" in complexities
        assert "M" in complexities
        assert "L" in complexities
        
        # Check rates have correct values
        rate_values = {r["complexity"]: r["rate"] for r in rates}
        assert rate_values["S"] == 50
        assert rate_values["M"] == 100
        assert rate_values["L"] == 200
        
        print(f"✅ Rates: S={rate_values['S']}₽, M={rate_values['M']}₽, L={rate_values['L']}₽")


class TestUsersAPI:
    """Users endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_users(self):
        """Test GET /users returns user list"""
        response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0
        
        # Check user structure
        user = users[0]
        assert "id" in user
        assert "email" in user
        assert "name" in user
        assert "role" in user
        
        print(f"✅ Found {len(users)} users")


class TestInvitesAPI:
    """Invites endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_invites(self):
        """Test GET /invites returns invite list"""
        response = requests.get(f"{BASE_URL}/api/invites", headers=self.headers)
        assert response.status_code == 200
        invites = response.json()
        assert isinstance(invites, list)
        print(f"✅ Found {len(invites)} invites")
    
    def test_create_invite_with_unlimited_option(self):
        """Test POST /invites with long expiration (unlimited option)"""
        # Create invite with 3650 days (10 years = "unlimited")
        response = requests.post(f"{BASE_URL}/api/invites", 
            headers=self.headers,
            json={
                "role": "field_worker",
                "max_uses": 5,
                "expires_days": 3650  # 10 years for "unlimited"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "code" in data
        assert data["role"] == "field_worker"
        assert data["max_uses"] == 5
        
        # Check expiration is ~10 years from now
        from datetime import datetime
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        now = datetime.now(expires_at.tzinfo)
        days_until_expiry = (expires_at - now).days
        assert days_until_expiry >= 3640  # Allow some margin
        
        print(f"✅ Created invite {data['code']} with {days_until_expiry} days expiry (unlimited)")


class TestExportAPI:
    """Export endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_export_objects_xlsx(self):
        """Test GET /export/objects returns xlsx file"""
        response = requests.get(f"{BASE_URL}/api/export/objects?format=xlsx", headers=self.headers)
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "")
        print("✅ Export XLSX endpoint working")
    
    def test_export_objects_csv(self):
        """Test GET /export/objects returns csv file"""
        response = requests.get(f"{BASE_URL}/api/export/objects?format=csv", headers=self.headers)
        assert response.status_code == 200
        assert "csv" in response.headers.get("content-type", "")
        print("✅ Export CSV endpoint working")


class TestQAAPI:
    """QA queue endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_qa_queue_with_sorting(self):
        """Test GET /qa/queue with sort parameter"""
        # Test different sort options
        sort_options = ["date_desc", "date_asc", "name_asc", "floor_asc", "user_asc"]
        
        for sort in sort_options:
            response = requests.get(
                f"{BASE_URL}/api/qa/queue?filter_type=pending&sort={sort}", 
                headers=self.headers
            )
            assert response.status_code == 200
            data = response.json()
            assert "items" in data
            assert "total" in data
            print(f"✅ QA queue with sort={sort}: {data['total']} items")


class TestObjectsAPI:
    """Objects endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_objects(self):
        """Test GET /objects returns object list"""
        response = requests.get(f"{BASE_URL}/api/objects", headers=self.headers)
        assert response.status_code == 200
        objects = response.json()
        assert isinstance(objects, list)
        print(f"✅ Found {len(objects)} objects")
    
    def test_create_object(self):
        """Test POST /objects creates new object"""
        response = requests.post(f"{BASE_URL}/api/objects", 
            headers=self.headers,
            json={
                "name": "TEST_Object_API_Test",
                "category": "Мебель",
                "floor": "1",
                "room": "101",
                "complexity": "S"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Object_API_Test"
        assert "qr_code" in data
        assert data["status"] == "new"
        print(f"✅ Created object: {data['qr_code']}")
        
        # Store for cleanup
        self.created_object_id = data["id"]


class TestReferencesAPI:
    """References endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_references(self):
        """Test GET /references returns reference list"""
        response = requests.get(f"{BASE_URL}/api/references", headers=self.headers)
        assert response.status_code == 200
        refs = response.json()
        assert isinstance(refs, list)
        print(f"✅ Found {len(refs)} references")
    
    def test_list_categories(self):
        """Test GET /categories returns category list"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200
        cats = response.json()
        assert isinstance(cats, list)
        print(f"✅ Found {len(cats)} categories")


class TestStatsAPI:
    """Stats endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        code = login_res.json()["dev_code"]
        verify_res = requests.post(f"{BASE_URL}/api/auth/verify-2fa", json={
            "email": TEST_EMAIL,
            "code": code
        })
        self.token = verify_res.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_overview_stats(self):
        """Test GET /stats/overview returns stats"""
        response = requests.get(f"{BASE_URL}/api/stats/overview", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "by_status" in data
        assert "by_complexity" in data
        print(f"✅ Stats: {data['total']} total objects")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
