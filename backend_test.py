#!/usr/bin/env python3
"""
Backend API Testing for MVP Inventory System
Tests all endpoints with proper authentication flow including 2FA
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

class InventoryAPITester:
    def __init__(self, base_url: str = "https://qrscan-system.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.admin_user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        
        # Test data storage
        self.created_objects = []
        self.created_categories = []
        self.created_references = []
        self.created_rates = []
        self.created_qr_batches = []

    def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}")
        if details:
            print(f"    {details}")
        
        if success:
            self.tests_passed += 1
        else:
            self.failed_tests.append(f"{test_name}: {details}")

    def make_request(self, method: str, endpoint: str, data: Dict = None, 
                    files: Dict = None, expected_status: int = 200, 
                    headers: Dict = None) -> tuple[bool, Dict]:
        """Make HTTP request with error handling"""
        url = f"{self.base_url}/api/{endpoint.lstrip('/')}"
        
        request_headers = {'Content-Type': 'application/json'}
        if self.token:
            request_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            request_headers.update(headers)
        
        try:
            if method.upper() == 'GET':
                response = requests.get(url, headers=request_headers, timeout=30)
            elif method.upper() == 'POST':
                if files:
                    # Remove Content-Type for file uploads
                    request_headers.pop('Content-Type', None)
                    response = requests.post(url, files=files, data=data, headers=request_headers, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=request_headers, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, headers=request_headers, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=request_headers, timeout=30)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            try:
                response_data = response.json() if response.content else {}
            except:
                response_data = {"text": response.text, "status_code": response.status_code}
            
            return success, response_data

        except requests.exceptions.Timeout:
            return False, {"error": "Request timeout"}
        except requests.exceptions.ConnectionError:
            return False, {"error": "Connection error"}
        except Exception as e:
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test health endpoint"""
        success, response = self.make_request('GET', '/health')
        self.log_result("Health Check", success, 
                       f"Status: {response.get('status', 'unknown')}" if success else str(response))
        return success

    def test_register_admin(self):
        """Register admin user for testing"""
        admin_data = {
            "email": f"admin_{int(time.time())}@test.com",
            "password": "AdminPass123!",
            "name": "Test Admin",
            "role": "admin"
        }
        
        success, response = self.make_request('POST', '/auth/register', admin_data, expected_status=200)
        if success:
            self.admin_user = admin_data
            self.log_result("Admin Registration", True, f"Admin: {admin_data['email']}")
        else:
            self.log_result("Admin Registration", False, str(response))
        return success

    def test_login_and_2fa(self):
        """Test login flow with 2FA"""
        if not self.admin_user:
            self.log_result("Login (No Admin)", False, "Admin user not created")
            return False
        
        # Step 1: Login
        login_data = {
            "email": self.admin_user["email"],
            "password": self.admin_user["password"]
        }
        
        success, response = self.make_request('POST', '/auth/login', login_data)
        if not success:
            self.log_result("Login Step 1", False, str(response))
            return False
        
        if not response.get('requires_2fa'):
            self.log_result("Login Step 1", False, "2FA not required")
            return False
        
        self.log_result("Login Step 1", True, "2FA code requested")
        
        # Step 2: Get 2FA code from server logs
        # For MVP, 2FA codes are logged to server logs
        import subprocess
        try:
            # Get the latest 2FA code from logs
            result = subprocess.run([
                'bash', '-c', 
                f'tail -n 20 /var/log/supervisor/backend.*.log | grep "2FA code for {self.admin_user["email"]}" | tail -1 | grep -o "[0-9]\\{{6\\}}"'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0 and result.stdout.strip():
                code = result.stdout.strip()
                verify_data = {
                    "email": self.admin_user["email"],
                    "code": code
                }
                
                success, response = self.make_request('POST', '/auth/verify-2fa', verify_data)
                if success and response.get('access_token'):
                    self.token = response['access_token']
                    self.log_result("Login Step 2 (2FA)", True, f"Token received with code: {code}")
                    return True
                else:
                    self.log_result("Login Step 2 (2FA)", False, f"2FA verification failed with code: {code}")
            else:
                self.log_result("Login Step 2 (2FA)", False, "Could not extract 2FA code from logs")
        except Exception as e:
            self.log_result("Login Step 2 (2FA)", False, f"Error getting 2FA code: {str(e)}")
        
        return False

    def test_auth_me(self):
        """Test /auth/me endpoint"""
        if not self.token:
            self.log_result("Auth Me (No Token)", False, "No authentication token")
            return False
        
        success, response = self.make_request('GET', '/auth/me')
        if success:
            self.log_result("Auth Me", True, f"User: {response.get('name', 'unknown')}")
        else:
            self.log_result("Auth Me", False, str(response))
        return success

    def test_categories_crud(self):
        """Test categories CRUD operations"""
        if not self.token:
            return False
        
        # Create category
        category_data = {
            "name": f"Test Category {int(time.time())}",
            "complexity_default": "M",
            "required_fields": ["name", "description"]
        }
        
        success, response = self.make_request('POST', '/categories', category_data)
        if success:
            category_id = response.get('id')
            self.created_categories.append(category_id)
            self.log_result("Create Category", True, f"ID: {category_id}")
        else:
            self.log_result("Create Category", False, str(response))
            return False
        
        # List categories
        success, response = self.make_request('GET', '/categories')
        if success:
            categories = response if isinstance(response, list) else []
            self.log_result("List Categories", True, f"Found {len(categories)} categories")
        else:
            self.log_result("List Categories", False, str(response))
        
        return success

    def test_references_crud(self):
        """Test references CRUD operations"""
        if not self.token:
            return False
        
        # Create references for floor, department, mol
        ref_types = [
            {"name": f"Floor {int(time.time())}", "type": "floor"},
            {"name": f"Department {int(time.time())}", "type": "department"},
            {"name": f"MOL {int(time.time())}", "type": "mol"}
        ]
        
        for ref_data in ref_types:
            success, response = self.make_request('POST', '/references', ref_data)
            if success:
                ref_id = response.get('id')
                self.created_references.append(ref_id)
                self.log_result(f"Create Reference ({ref_data['type']})", True, f"ID: {ref_id}")
            else:
                self.log_result(f"Create Reference ({ref_data['type']})", False, str(response))
        
        # List references
        success, response = self.make_request('GET', '/references')
        if success:
            refs = response if isinstance(response, list) else []
            self.log_result("List References", True, f"Found {len(refs)} references")
        else:
            self.log_result("List References", False, str(response))
        
        return success

    def test_rates_crud(self):
        """Test rates CRUD operations"""
        if not self.token:
            return False
        
        # Create rates for each complexity
        rates_data = [
            {"complexity": "S", "rate": 10.0, "time_norm_minutes": 15},
            {"complexity": "M", "rate": 20.0, "time_norm_minutes": 30},
            {"complexity": "L", "rate": 30.0, "time_norm_minutes": 60}
        ]
        
        for rate_data in rates_data:
            success, response = self.make_request('POST', '/rates', rate_data)
            if success:
                rate_id = response.get('id')
                self.created_rates.append(rate_id)
                self.log_result(f"Create Rate ({rate_data['complexity']})", True, f"ID: {rate_id}")
            else:
                self.log_result(f"Create Rate ({rate_data['complexity']})", False, str(response))
        
        # List rates
        success, response = self.make_request('GET', '/rates')
        if success:
            rates = response if isinstance(response, list) else []
            self.log_result("List Rates", True, f"Found {len(rates)} rates")
        else:
            self.log_result("List Rates", False, str(response))
        
        return success

    def test_objects_crud(self):
        """Test objects CRUD operations"""
        if not self.token:
            return False
        
        # Create object
        object_data = {
            "name": f"Test Object {int(time.time())}",
            "description": "Test object description",
            "characteristics": "Test characteristics",
            "complexity": "M",
            "floor": "1",
            "department": "IT"
        }
        
        success, response = self.make_request('POST', '/objects', object_data)
        if success:
            object_id = response.get('id')
            qr_code = response.get('qr_code')
            self.created_objects.append(object_id)
            self.log_result("Create Object", True, f"ID: {object_id}, QR: {qr_code}")
        else:
            self.log_result("Create Object", False, str(response))
            return False
        
        # Get object by ID
        success, response = self.make_request('GET', f'/objects/{object_id}')
        if success:
            self.log_result("Get Object by ID", True, f"Name: {response.get('name')}")
        else:
            self.log_result("Get Object by ID", False, str(response))
        
        # Get object by QR code
        if qr_code:
            success, response = self.make_request('GET', f'/objects/by-qr/{qr_code}')
            if success:
                self.log_result("Get Object by QR", True, f"Found: {response.get('name')}")
            else:
                self.log_result("Get Object by QR", False, str(response))
        
        # Update object
        update_data = {
            "description": "Updated description",
            "status": "pending"
        }
        success, response = self.make_request('PUT', f'/objects/{object_id}', update_data)
        if success:
            self.log_result("Update Object", True, f"Status: {response.get('status')}")
        else:
            self.log_result("Update Object", False, str(response))
        
        # List objects
        success, response = self.make_request('GET', '/objects')
        if success:
            objects = response if isinstance(response, list) else []
            self.log_result("List Objects", True, f"Found {len(objects)} objects")
        else:
            self.log_result("List Objects", False, str(response))
        
        return success

    def test_qr_batches(self):
        """Test QR batch operations"""
        if not self.token:
            return False
        
        # Create QR batch
        batch_data = {
            "name": f"Test Batch {int(time.time())}",
            "count": 10,
            "prefix": "TEST-"
        }
        
        success, response = self.make_request('POST', '/qr-batches', batch_data)
        if success:
            batch_id = response.get('id')
            self.created_qr_batches.append(batch_id)
            self.log_result("Create QR Batch", True, f"ID: {batch_id}, Count: {response.get('count')}")
        else:
            self.log_result("Create QR Batch", False, str(response))
            return False
        
        # List QR batches
        success, response = self.make_request('GET', '/qr-batches')
        if success:
            batches = response if isinstance(response, list) else []
            self.log_result("List QR Batches", True, f"Found {len(batches)} batches")
        else:
            self.log_result("List QR Batches", False, str(response))
        
        # Download PDF (this might take time)
        success, response = self.make_request('GET', f'/qr-batches/{batch_id}/pdf', expected_status=200)
        if success:
            self.log_result("Download QR Batch PDF", True, "PDF generated successfully")
        else:
            self.log_result("Download QR Batch PDF", False, str(response))
        
        return success

    def test_import_preview(self):
        """Test import preview functionality"""
        if not self.token:
            return False
        
        # Create a simple CSV content for testing
        csv_content = """name,description,complexity,floor
Test Item 1,Description 1,S,1
Test Item 2,Description 2,M,2
Test Item 3,Description 3,L,3"""
        
        files = {'file': ('test_import.csv', csv_content, 'text/csv')}
        
        success, response = self.make_request('POST', '/import/preview', files=files)
        if success:
            columns = response.get('columns', [])
            total_rows = response.get('total_rows', 0)
            self.log_result("Import Preview", True, f"Columns: {len(columns)}, Rows: {total_rows}")
        else:
            self.log_result("Import Preview", False, str(response))
        
        return success

    def test_export_objects(self):
        """Test export functionality"""
        if not self.token:
            return False
        
        success, response = self.make_request('GET', '/export/objects?format=csv', expected_status=200)
        if success:
            self.log_result("Export Objects (CSV)", True, "Export successful")
        else:
            self.log_result("Export Objects (CSV)", False, str(response))
        
        return success

    def test_stats_and_progress(self):
        """Test statistics endpoints"""
        if not self.token:
            return False
        
        # Overview stats
        success, response = self.make_request('GET', '/stats/overview')
        if success:
            total = response.get('total', 0)
            self.log_result("Stats Overview", True, f"Total objects: {total}")
        else:
            self.log_result("Stats Overview", False, str(response))
        
        # Progress stats
        success, response = self.make_request('GET', '/stats/progress')
        if success:
            total = response.get('total', 0)
            verified = response.get('verified', 0)
            self.log_result("Stats Progress", True, f"Total: {total}, Verified: {verified}")
        else:
            self.log_result("Stats Progress", False, str(response))
        
        return success

    def test_qa_queue(self):
        """Test QA queue functionality"""
        if not self.token:
            return False
        
        # Get QA queue
        success, response = self.make_request('GET', '/qa/queue')
        if success:
            items = response.get('items', [])
            total = response.get('total', 0)
            self.log_result("QA Queue", True, f"Items: {len(items)}, Total: {total}")
        else:
            self.log_result("QA Queue", False, str(response))
        
        return success

    def test_audit_log(self):
        """Test audit log functionality"""
        if not self.token:
            return False
        
        success, response = self.make_request('GET', '/audit-log')
        if success:
            logs = response if isinstance(response, list) else []
            self.log_result("Audit Log", True, f"Found {len(logs)} audit entries")
        else:
            self.log_result("Audit Log", False, str(response))
        
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting MVP Inventory System API Tests")
        print("=" * 60)
        
        # Basic connectivity
        if not self.test_health_check():
            print("❌ Health check failed - stopping tests")
            return False
        
        # Authentication flow
        if not self.test_register_admin():
            print("❌ Admin registration failed - stopping tests")
            return False
        
        if not self.test_login_and_2fa():
            print("❌ Login/2FA failed - stopping tests")
            return False
        
        if not self.test_auth_me():
            print("❌ Auth verification failed - stopping tests")
            return False
        
        # Core functionality tests
        self.test_categories_crud()
        self.test_references_crud()
        self.test_rates_crud()
        self.test_objects_crud()
        self.test_qr_batches()
        self.test_import_preview()
        self.test_export_objects()
        self.test_stats_and_progress()
        self.test_qa_queue()
        self.test_audit_log()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for failure in self.failed_tests:
                print(f"  - {failure}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\n✨ Success Rate: {success_rate:.1f}%")
        
        return success_rate >= 80  # Consider 80%+ as successful

def main():
    """Main test execution"""
    tester = InventoryAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())