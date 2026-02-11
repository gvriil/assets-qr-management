#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for MVP Field Inventory System
Tests all required endpoints with proper authentication flow including 2FA
"""

import requests
import sys
import json
import time
import subprocess
from datetime import datetime
from typing import Dict, Any, Optional

class InventoryAPITester:
    def __init__(self, base_url: str = "https://assettracker-41.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data storage
        self.created_objects = []
        self.created_categories = []
        self.created_references = []
        self.created_rates = []
        self.created_qr_batches = []

    def log_result(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}")
        if details:
            print(f"    {details}")

    def make_request(self, method: str, endpoint: str, data: Any = None, 
                    expected_status: int = 200, auth_required: bool = True) -> tuple[bool, Any]:
        """Make HTTP request with proper error handling"""
        url = f"{self.base_url}/api/{endpoint.lstrip('/')}"
        headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        try:
            if method.upper() == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return False, f"Unsupported method: {method}"
            
            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text[:200]}
            
            return success, response_data
            
        except requests.exceptions.RequestException as e:
            return False, f"Request error: {str(e)}"

    def get_2fa_code_from_logs(self, email: str) -> Optional[str]:
        """Extract 2FA code from backend logs"""
        try:
            # Try to get the specific code for this email
            result = subprocess.run([
                'bash', '-c', 
                f'tail -n 20 /var/log/supervisor/backend.*.log | grep "2FA code for {email}" | tail -1'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0 and result.stdout.strip():
                # Extract 6-digit code from log line
                import re
                match = re.search(r'2FA code for .+: (\d{6})', result.stdout)
                if match:
                    return match.group(1)
            
            # Fallback: get the most recent 2FA code
            result2 = subprocess.run([
                'bash', '-c', 
                'tail -n 20 /var/log/supervisor/backend.*.log | grep "2FA code" | tail -1'
            ], capture_output=True, text=True, timeout=10)
            
            if result2.returncode == 0 and result2.stdout.strip():
                import re
                match = re.search(r'2FA code for .+: (\d{6})', result2.stdout)
                if match:
                    return match.group(1)
            
            return None
            
        except Exception as e:
            print(f"Error extracting 2FA code: {e}")
            return None

    def test_1_health_check(self):
        """Test: Health Check - GET /api/health"""
        success, response = self.make_request('GET', '/health', auth_required=False)
        
        if success and response.get("status") == "ok":
            self.log_result("Health Check", True, "API is healthy")
        else:
            self.log_result("Health Check", False, "Health check failed", response)
        
        return success

    def test_2_user_registration(self):
        """Test: User Registration - POST /api/auth/register"""
        test_email = f"test_admin_{int(time.time())}@example.com"
        user_data = {
            "email": test_email,
            "password": "TestPassword123!",
            "name": "Test Admin User",
            "role": "admin"  # Use admin role to test all endpoints
        }
        
        success, response = self.make_request('POST', '/auth/register', user_data, 200, False)
        
        if success and response.get("id"):
            self.user_data = {**user_data, "id": response.get("id")}
            self.log_result("User Registration", True, f"Admin user created: {test_email}")
        else:
            self.log_result("User Registration", False, "Failed to create user", response)
        
        return success

    def test_3_user_login(self):
        """Test: User Login (2FA initiation) - POST /api/auth/login"""
        if not self.user_data:
            self.log_result("User Login", False, "No user data available")
            return False
        
        login_data = {
            "email": self.user_data["email"],
            "password": self.user_data["password"]
        }
        
        success, response = self.make_request('POST', '/auth/login', login_data, 200, False)
        
        if success and response.get("requires_2fa"):
            self.log_result("User Login (2FA Init)", True, "2FA code requested successfully")
            return True
        else:
            self.log_result("User Login (2FA Init)", False, "Failed to initiate 2FA", response)
            return False

    def test_4_verify_2fa(self):
        """Test: 2FA Verification - POST /api/auth/verify-2fa"""
        if not self.user_data:
            self.log_result("2FA Verification", False, "No user data available")
            return False
        
        # Get 2FA code from backend logs
        code = self.get_2fa_code_from_logs(self.user_data["email"])
        
        if not code:
            self.log_result("2FA Verification", False, "Could not extract 2FA code from logs")
            return False
        
        verify_data = {
            "email": self.user_data["email"],
            "code": code
        }
        
        success, response = self.make_request('POST', '/auth/verify-2fa', verify_data, 200, False)
        
        if success and response.get("access_token"):
            self.token = response.get("access_token")
            self.log_result("2FA Verification", True, f"2FA verified with code: {code}")
            return True
        else:
            self.log_result("2FA Verification", False, f"2FA verification failed with code: {code}", response)
            return False

    def test_5_get_current_user(self):
        """Test: Get Current User - GET /api/auth/me"""
        if not self.token:
            self.log_result("Get Current User", False, "No authentication token available")
            return False
        
        success, response = self.make_request('GET', '/auth/me', expected_status=200)
        
        if success and response.get("id"):
            self.log_result("Get Current User", True, f"User info retrieved: {response.get('name')}")
        else:
            self.log_result("Get Current User", False, "Failed to get user info", response)
        
        return success

    def test_6_create_category(self):
        """Test: Create Category - POST /api/categories"""
        if not self.token:
            self.log_result("Create Category", False, "No authentication token")
            return False
        
        category_data = {
            "name": f"Test Category {int(time.time())}",
            "complexity_default": "S",
            "required_fields": ["name", "description"]
        }
        
        success, response = self.make_request('POST', '/categories', category_data, 200)
        
        if success and response.get("id"):
            self.created_categories.append(response)
            self.log_result("Create Category", True, f"Category created: {response.get('name')}")
        else:
            self.log_result("Create Category", False, "Failed to create category", response)
        
        return success

    def test_7_create_reference(self):
        """Test: Create Reference - POST /api/references"""
        if not self.token:
            self.log_result("Create Reference", False, "No authentication token")
            return False
        
        reference_data = {
            "name": f"Test MOL {int(time.time())}",
            "type": "mol"
        }
        
        success, response = self.make_request('POST', '/references', reference_data, 200)
        
        if success and response.get("id"):
            self.created_references.append(response)
            self.log_result("Create Reference", True, f"Reference created: {response.get('name')}")
        else:
            self.log_result("Create Reference", False, "Failed to create reference", response)
        
        return success

    def test_8_create_rate(self):
        """Test: Create Rate - POST /api/rates"""
        if not self.token:
            self.log_result("Create Rate", False, "No authentication token")
            return False
        
        rate_data = {
            "complexity": "S",
            "rate": 100.0,
            "time_norm_minutes": 30
        }
        
        success, response = self.make_request('POST', '/rates', rate_data, 200)
        
        if success and response.get("id"):
            self.created_rates.append(response)
            self.log_result("Create Rate", True, f"Rate created: {rate_data['complexity']} - {rate_data['rate']}")
        else:
            self.log_result("Create Rate", False, "Failed to create rate", response)
        
        return success

    def test_9_create_object(self):
        """Test: Create Object - POST /api/objects"""
        if not self.token:
            self.log_result("Create Object", False, "No authentication token")
            return False
        
        object_data = {
            "name": f"Test Object {int(time.time())}",
            "description": "Test object for API testing",
            "characteristics": "Test characteristics",
            "floor": "1",
            "department": "IT",
            "complexity": "S",
            "external_id": f"EXT-{int(time.time())}"
        }
        
        # Add category if available
        if self.created_categories:
            object_data["category_id"] = self.created_categories[0]["id"]
        
        # Add MOL if available
        if self.created_references:
            object_data["mol_id"] = self.created_references[0]["id"]
        
        success, response = self.make_request('POST', '/objects', object_data, 201)
        
        if success and response.get("id"):
            self.created_objects.append(response)
            self.log_result("Create Object", True, 
                          f"Object created: {response.get('name')} (QR: {response.get('qr_code')})")
        else:
            self.log_result("Create Object", False, "Failed to create object", response)
        
        return success

    def test_10_get_object_by_qr(self):
        """Test: Get Object by QR - GET /api/objects/by-qr/{qr_code}"""
        if not self.token or not self.created_objects:
            self.log_result("Get Object by QR", False, "No token or objects available")
            return False
        
        qr_code = self.created_objects[0]["qr_code"]
        success, response = self.make_request('GET', f'/objects/by-qr/{qr_code}')
        
        if success and response.get("id"):
            self.log_result("Get Object by QR", True, f"Object retrieved by QR: {qr_code}")
        else:
            self.log_result("Get Object by QR", False, f"Failed to get object by QR: {qr_code}", response)
        
        return success

    def test_11_update_object(self):
        """Test: Update Object - PUT /api/objects/{id}"""
        if not self.token or not self.created_objects:
            self.log_result("Update Object", False, "No token or objects available")
            return False
        
        object_id = self.created_objects[0]["id"]
        update_data = {
            "description": "Updated description for testing",
            "status": "pending"
        }
        
        success, response = self.make_request('PUT', f'/objects/{object_id}', update_data)
        
        if success and response.get("id"):
            self.log_result("Update Object", True, f"Object {object_id} updated successfully")
        else:
            self.log_result("Update Object", False, f"Failed to update object {object_id}", response)
        
        return success

    def test_12_create_qr_batch(self):
        """Test: Create QR Batch - POST /api/qr-batches"""
        if not self.token:
            self.log_result("Create QR Batch", False, "No authentication token")
            return False
        
        batch_data = {
            "name": f"Test Batch {int(time.time())}",
            "count": 5,  # Small batch for testing
            "prefix": "TEST-"
        }
        
        success, response = self.make_request('POST', '/qr-batches', batch_data, 200)
        
        if success and response.get("id"):
            self.created_qr_batches.append(response)
            self.log_result("Create QR Batch", True, f"QR Batch created: {response.get('name')} ({response.get('count')} codes)")
        else:
            self.log_result("Create QR Batch", False, "Failed to create QR batch", response)
        
        return success

    def test_13_get_stats_overview(self):
        """Test: Get Statistics Overview - GET /api/stats/overview"""
        if not self.token:
            self.log_result("Get Stats Overview", False, "No authentication token")
            return False
        
        success, response = self.make_request('GET', '/stats/overview')
        
        if success and "total" in response:
            total = response.get("total", 0)
            by_status = response.get("by_status", {})
            self.log_result("Get Stats Overview", True, f"Stats retrieved - Total: {total}, By status: {by_status}")
        else:
            self.log_result("Get Stats Overview", False, "Failed to get stats", response)
        
        return success

    def run_all_tests(self):
        """Run all backend API tests in sequence"""
        print("🚀 Starting Comprehensive MVP Field Inventory System API Tests")
        print(f"📡 Backend URL: {self.base_url}")
        print("=" * 70)
        
        # Test sequence - order matters due to dependencies
        tests = [
            self.test_1_health_check,
            self.test_2_user_registration,
            self.test_3_user_login,
            self.test_4_verify_2fa,
            self.test_5_get_current_user,
            self.test_6_create_category,
            self.test_7_create_reference,
            self.test_8_create_rate,
            self.test_9_create_object,
            self.test_10_get_object_by_qr,
            self.test_11_update_object,
            self.test_12_create_qr_batch,
            self.test_13_get_stats_overview,
        ]
        
        for test_func in tests:
            try:
                test_func()
            except Exception as e:
                test_name = test_func.__name__.replace('test_', '').replace('_', ' ').title()
                self.log_result(test_name, False, f"Exception: {str(e)}")
            
            # Small delay between tests
            time.sleep(0.5)
        
        self.print_summary()
        return self.tests_passed, self.tests_run

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 70)
        print("📊 COMPREHENSIVE TEST SUMMARY")
        print("=" * 70)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test']}: {test['details']}")
        
        # Show created resources
        print(f"\n📊 CREATED RESOURCES:")
        print(f"  📦 Objects: {len(self.created_objects)}")
        print(f"  📂 Categories: {len(self.created_categories)}")
        print(f"  📋 References: {len(self.created_references)}")
        print(f"  💰 Rates: {len(self.created_rates)}")
        print(f"  🏷️  QR Batches: {len(self.created_qr_batches)}")

def main():
    """Main test execution"""
    tester = InventoryAPITester()
    
    try:
        passed, total = tester.run_all_tests()
        
        # Save detailed results
        with open('/app/comprehensive_backend_test_results.json', 'w') as f:
            json.dump({
                "summary": {
                    "total_tests": total,
                    "passed_tests": passed,
                    "failed_tests": total - passed,
                    "success_rate": (passed/total*100) if total > 0 else 0,
                    "timestamp": datetime.now().isoformat()
                },
                "test_results": tester.test_results,
                "created_resources": {
                    "objects": tester.created_objects,
                    "categories": tester.created_categories,
                    "references": tester.created_references,
                    "rates": tester.created_rates,
                    "qr_batches": tester.created_qr_batches
                }
            }, indent=2)
        
        print(f"\n💾 Detailed results saved to: /app/comprehensive_backend_test_results.json")
        
        # Return appropriate exit code
        return 0 if passed == total else 1
        
    except Exception as e:
        print(f"❌ Test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())