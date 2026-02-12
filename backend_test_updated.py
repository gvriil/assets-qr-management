#!/usr/bin/env python3
"""
Backend API Testing for Field Inventory System - Updated for New Object Fields
Tests admin functionality, object creation with new fields, and Excel import
"""

import requests
import sys
import json
from datetime import datetime
import time

class InventoryAPITester:
    def __init__(self, base_url="https://qrscan-6.preview.emergentagent.com/api"):
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

    def test_admin_login_with_2fa(self):
        """Test admin login with new credentials and 2FA"""
        print("\n🔐 Testing Admin Authentication with New Credentials...")
        
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
        
        # Get the 2FA code from response (MVP feature)
        if "dev_code" in response:
            tfa_code = response["dev_code"]
            self.log_test("2FA Code Retrieved", True, f"Code: {tfa_code}")
            
            # Step 2: Verify 2FA
            verify_success, verify_response = self.run_test(
                "Admin 2FA Verification",
                "POST",
                "auth/verify-2fa",
                200,
                {"email": "0020992@gmail.com", "code": tfa_code}
            )
            
            if verify_success and verify_response.get("access_token"):
                self.admin_token = verify_response["access_token"]
                self.log_test("Admin Authentication Complete", True, f"Admin: {verify_response.get('user', {}).get('name', 'Unknown')}")
                return True
            else:
                self.log_test("Admin 2FA Verification Failed", False, "Token not received")
                return False
        else:
            self.log_test("2FA Code Not Found", False, "dev_code not in response")
            return False

    def test_object_creation_with_new_fields(self):
        """Test creating objects with all new fields"""
        if not self.admin_token:
            self.log_test("Object Creation Test", False, "No admin token available")
            return False
        
        print("\n📦 Testing Object Creation with New Fields...")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test creating object with all new fields
        object_data = {
            "name": "Test Office Chair",
            "category": "Мебель",
            "characteristics": "Эргономичное кресло с подлокотниками",
            "serial_number": "SN123456789",
            "inventory_number": "INV-2024-001",
            "year": "2024",
            "condition": "Исправен",
            "floor": "2",
            "room": "205",
            "department": "IT отдел",
            "mol": "Иванов И.И.",
            "quantity": "1",
            "complexity": "S",
            "notes": "Тестовый объект для проверки новых полей"
        }
        
        success, response = self.run_test(
            "Create Object with New Fields",
            "POST",
            "objects",
            200,
            object_data,
            headers
        )
        
        if success:
            self.created_object_id = response.get("id")
            self.created_object_qr = response.get("qr_code")
            self.log_test("Object Creation Success", True, f"Object ID: {self.created_object_id}, QR: {self.created_object_qr}")
            
            # Verify all fields were saved correctly
            expected_fields = ["serial_number", "inventory_number", "year", "condition", "room", "quantity", "notes"]
            missing_fields = []
            for field in expected_fields:
                if field not in response or response[field] != object_data[field]:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log_test("Object Fields Validation", False, f"Missing or incorrect fields: {missing_fields}")
                return False
            else:
                self.log_test("Object Fields Validation", True, "All new fields saved correctly")
        
        return success

    def test_object_retrieval(self):
        """Test retrieving created object"""
        if not hasattr(self, 'created_object_id') or not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        success, response = self.run_test(
            "Retrieve Created Object",
            "GET",
            f"objects/{self.created_object_id}",
            200,
            headers=headers
        )
        
        if success:
            # Verify QR code retrieval
            qr_success, qr_response = self.run_test(
                "Retrieve Object by QR Code",
                "GET",
                f"objects/by-qr/{self.created_object_qr}",
                200,
                headers=headers
            )
            return qr_success
        
        return success

    def test_object_update(self):
        """Test updating object with new fields"""
        if not hasattr(self, 'created_object_id') or not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        update_data = {
            "condition": "Требует ремонта",
            "notes": "Обновлено через API тест",
            "quantity": "2"
        }
        
        success, response = self.run_test(
            "Update Object Fields",
            "PUT",
            f"objects/{self.created_object_id}",
            200,
            update_data,
            headers
        )
        
        return success

    def test_objects_list_and_search(self):
        """Test listing and searching objects"""
        if not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test basic listing
        success, response = self.run_test(
            "List Objects",
            "GET",
            "objects",
            200,
            headers=headers
        )
        
        if success:
            # Test search functionality
            search_success, search_response = self.run_test(
                "Search Objects",
                "GET",
                "objects?search=Test Office Chair",
                200,
                headers=headers
            )
            
            if search_success and isinstance(search_response, list):
                self.log_test("Object Search Success", True, f"Found {len(search_response)} objects")
            
            return search_success
        
        return success

    def test_excel_import_preview(self):
        """Test Excel import preview functionality"""
        if not self.admin_token:
            return False
        
        print("\n📊 Testing Excel Import Functionality...")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test if the endpoint exists and returns proper error for missing file
        try:
            response = requests.post(
                f"{self.base_url}/import/preview",
                headers=headers
            )
            
            # We expect 422 (validation error) since we didn't send a file
            if response.status_code == 422:
                self.log_test("Excel Import Preview Endpoint", True, "Endpoint exists and validates file requirement")
                return True
            else:
                self.log_test("Excel Import Preview Endpoint", False, f"Unexpected status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Excel Import Preview Endpoint", False, f"Exception: {str(e)}")
            return False

    def test_categories_and_references(self):
        """Test categories and references endpoints"""
        if not self.admin_token:
            return False
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test categories
        success, response = self.run_test(
            "List Categories",
            "GET",
            "categories",
            200,
            headers=headers
        )
        
        if success:
            # Test references
            ref_success, ref_response = self.run_test(
                "List References",
                "GET",
                "references",
                200,
                headers=headers
            )
            return ref_success
        
        return success

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

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Field Inventory System API Tests - Updated Version")
        print("=" * 70)
        
        # Basic health check
        self.test_health_check()
        
        # Admin authentication with new credentials
        if not self.test_admin_login_with_2fa():
            print("❌ Admin login failed - stopping critical tests")
            return self.generate_report()
        
        # Object management tests (new functionality)
        self.test_object_creation_with_new_fields()
        self.test_object_retrieval()
        self.test_object_update()
        self.test_objects_list_and_search()
        
        # Import functionality test
        self.test_excel_import_preview()
        
        # Reference data tests
        self.test_categories_and_references()
        
        # Invite code system test
        self.test_invite_code_creation()
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("\n" + "=" * 70)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 70)
        
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