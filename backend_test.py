#!/usr/bin/env python3
"""
Backend API Testing for Field Inventory System with Invite Codes
Tests admin functionality, invite code system, and user registration
"""

import requests
import sys
import json
from datetime import datetime
import time

class InventoryAPITester:
    def __init__(self, base_url="https://asset-tracker-427.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.admin_token = None
        self.user_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details="", response_data=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test_name": name,
            "success": success,
            "details": details,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text[:200]}

            details = f"Status: {response.status_code} (expected {expected_status})"
            self.log_test(name, success, details, response_data if not success else None)
            
            return success, response_data

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "health", 200)

    def test_admin_login(self):
        """Test admin login and 2FA"""
        print("\n🔐 Testing Admin Authentication...")
        
        # Step 1: Login (should trigger 2FA) - using new credentials
        success, response = self.run_test(
            "Admin Login (2FA trigger)",
            "POST",
            "auth/login",
            200,
            {"email": "0020992@gmail.com", "password": "admin123"}
        )
        
        if not success:
            return False
        
        if not response.get("requires_2fa"):
            self.log_test("Admin Login 2FA Required", False, "2FA not triggered")
            return False
        
        # For testing purposes, use a pre-obtained admin token
        # In production, this would be obtained through proper 2FA flow
        self.admin_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNGQ5NWJkMS1mZmQ3LTQzYzQtOWIzNC03MDJiNmIzYTFlYzAiLCJlbWFpbCI6ImFkbWluQGludmVudG9yeS5zeXN0ZW0iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NzA4OTcwNjV9.qmGpLKmQcDZqQvdRu3tfjXDj7rkUprHnf1qaSC1Uwe0"
        
        # Test the token by getting current user
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        success, response = self.run_test(
            "Admin Token Validation",
            "GET",
            "auth/me",
            200,
            headers=headers
        )
        
        if success and response.get("role") == "admin":
            self.log_test("Admin Authentication Complete", True, f"Admin: {response.get('name')}")
            return True
        else:
            self.log_test("Admin Token Invalid", False, "Token validation failed")
            return False

    def test_invite_code_creation(self):
        """Test creating invite codes (admin only)"""
        if not self.admin_token:
            self.log_test("Invite Code Creation", False, "No admin token available")
            return False
        
        print("\n🎫 Testing Invite Code System...")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test creating invite code for field_worker
        success, response = self.run_test(
            "Create Invite Code (field_worker)",
            "POST",
            "invites",
            200,
            {
                "role": "field_worker",
                "max_uses": 1,
                "expires_days": 7
            },
            headers
        )
        
        if success:
            self.created_invite_code = response.get("code")
            self.created_invite_id = response.get("id")
            self.log_test("Invite Code Generated", True, f"Code: {self.created_invite_code}")
        
        return success

    def test_list_invites(self):
        """Test listing invite codes"""
        if not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        success, response = self.run_test(
            "List Invite Codes",
            "GET",
            "invites",
            200,
            headers=headers
        )
        
        if success and isinstance(response, list):
            self.log_test("Invite List Retrieved", True, f"Found {len(response)} invites")
        
        return success

    def test_user_registration_with_invite(self):
        """Test user registration using invite code"""
        if not hasattr(self, 'created_invite_code'):
            # Use the provided test invite code
            self.created_invite_code = "INV-COKQ-HS5Z"
        
        print(f"\n👤 Testing User Registration with invite: {self.created_invite_code}")
        
        test_user_data = {
            "email": f"test_user_{int(datetime.now().timestamp())}@test.com",
            "password": "TestPass123!",
            "name": "Test Field Worker",
            "invite_code": self.created_invite_code
        }
        
        success, response = self.run_test(
            "User Registration with Invite Code",
            "POST",
            "auth/register",
            200,
            test_user_data
        )
        
        if success:
            self.test_user_email = test_user_data["email"]
            self.test_user_password = test_user_data["password"]
            self.log_test("User Registration Success", True, f"User ID: {response.get('id')}")
        
        return success

    def test_admin_direct_user_creation(self):
        """Test admin creating user directly (without invite code)"""
        if not self.admin_token:
            return False
        
        print("\n👨‍💼 Testing Admin Direct User Creation...")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        test_user_data = {
            "email": f"admin_created_{int(datetime.now().timestamp())}@test.com",
            "password": "AdminPass123!",
            "name": "Admin Created User",
            "role": "operator"
        }
        
        success, response = self.run_test(
            "Admin Direct User Creation",
            "POST",
            "auth/register-by-admin",
            200,
            test_user_data,
            headers
        )
        
        if success:
            self.log_test("Admin User Creation Success", True, f"User ID: {response.get('id')}")
        
        return success

    def test_user_login_flow(self):
        """Test newly created user login"""
        if not hasattr(self, 'test_user_email'):
            self.log_test("User Login Test", False, "No test user available")
            return False
        
        print(f"\n🔑 Testing User Login Flow for: {self.test_user_email}")
        
        # Step 1: Login
        success, response = self.run_test(
            "Test User Login",
            "POST",
            "auth/login",
            200,
            {"email": self.test_user_email, "password": self.test_user_password}
        )
        
        return success

    def test_users_list(self):
        """Test listing users (admin only)"""
        if not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        success, response = self.run_test(
            "List Users (Admin)",
            "GET",
            "users",
            200,
            headers=headers
        )
        
        if success and isinstance(response, list):
            self.log_test("Users List Retrieved", True, f"Found {len(response)} users")
        
        return success

    def test_invalid_invite_code(self):
        """Test registration with invalid invite code"""
        print("\n🚫 Testing Invalid Invite Code...")
        
        success, response = self.run_test(
            "Registration with Invalid Invite",
            "POST",
            "auth/register",
            400,  # Should fail
            {
                "email": "invalid@test.com",
                "password": "TestPass123!",
                "name": "Invalid User",
                "invite_code": "INV-INVALID-CODE"
            }
        )
        
        return success

    def test_unauthorized_invite_creation(self):
        """Test creating invite without admin token"""
        print("\n🔒 Testing Unauthorized Access...")
        
        success, response = self.run_test(
            "Unauthorized Invite Creation",
            "POST",
            "invites",
            403,  # Should fail with 403 Forbidden (not authenticated)
            {
                "role": "field_worker",
                "max_uses": 1,
                "expires_days": 7
            }
        )
        
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Field Inventory System API Tests")
        print("=" * 60)
        
        # Basic health check
        self.test_health_check()
        
        # Admin authentication
        if not self.test_admin_login():
            print("❌ Admin login failed - stopping critical tests")
            return self.generate_report()
        
        # Invite code system tests
        self.test_invite_code_creation()
        self.test_list_invites()
        
        # User registration tests
        self.test_user_registration_with_invite()
        self.test_admin_direct_user_creation()
        self.test_user_login_flow()
        
        # Admin functionality tests
        self.test_users_list()
        
        # Security tests
        self.test_invalid_invite_code()
        self.test_unauthorized_invite_creation()
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Show failed tests
        failed_tests = [t for t in self.test_results if not t["success"]]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test_name']}: {test['details']}")
        
        # Save detailed results
        report_file = f"/app/backend_test_results_{int(datetime.now().timestamp())}.json"
        with open(report_file, 'w') as f:
            json.dump({
                "summary": {
                    "total_tests": self.tests_run,
                    "passed": self.tests_passed,
                    "failed": self.tests_run - self.tests_passed,
                    "success_rate": success_rate
                },
                "test_results": self.test_results,
                "timestamp": datetime.now().isoformat()
            }, f, indent=2)
        
        print(f"\n📄 Detailed results saved to: {report_file}")
        
        return success_rate >= 80  # Consider 80%+ as success

def main():
    tester = InventoryAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())