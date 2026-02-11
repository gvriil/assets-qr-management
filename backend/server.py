from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import random
import string
import qrcode
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from PIL import Image
import aiofiles
import json
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'inventory-mvp-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# File Storage
UPLOAD_DIR = ROOT_DIR / "uploads"
PHOTOS_DIR = UPLOAD_DIR / "photos"
QR_DIR = UPLOAD_DIR / "qr"
PDF_DIR = UPLOAD_DIR / "pdf"

for d in [UPLOAD_DIR, PHOTOS_DIR, QR_DIR, PDF_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Inventory System MVP")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserRole:
    ADMIN = "admin"
    OPERATOR = "operator"
    FIELD_WORKER = "field_worker"
    AUDITOR = "auditor"
    MOL = "mol"

class ObjectStatus:
    NEW = "new"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"

class ComplexityLevel:
    SIMPLE = "S"
    MEDIUM = "M"
    COMPLEX = "L"

# Auth Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    invite_code: str  # Required invite code
    role: str = UserRole.FIELD_WORKER

class UserCreateByAdmin(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = UserRole.FIELD_WORKER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class InviteCodeCreate(BaseModel):
    role: str = UserRole.FIELD_WORKER
    max_uses: int = 1
    expires_days: int = 7

class InviteCodeResponse(BaseModel):
    id: str
    code: str
    role: str
    max_uses: int
    used_count: int
    expires_at: str
    created_by: str
    is_active: bool

class Verify2FA(BaseModel):
    email: EmailStr
    code: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str
    is_active: bool = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Object Models
class ObjectCreate(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    characteristics: Optional[str] = None
    serial_number: Optional[str] = None
    inventory_number: Optional[str] = None
    year: Optional[str] = None
    condition: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    department: Optional[str] = None
    mol: Optional[str] = None
    quantity: Optional[str] = "1"
    complexity: str = ComplexityLevel.SIMPLE
    external_id: Optional[str] = None
    notes: Optional[str] = None

class ObjectUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    characteristics: Optional[str] = None
    serial_number: Optional[str] = None
    inventory_number: Optional[str] = None
    year: Optional[str] = None
    condition: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    department: Optional[str] = None
    mol: Optional[str] = None
    quantity: Optional[str] = None
    complexity: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class ObjectResponse(BaseModel):
    id: str
    name: str
    qr_code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    characteristics: Optional[str] = None
    serial_number: Optional[str] = None
    inventory_number: Optional[str] = None
    year: Optional[str] = None
    condition: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    department: Optional[str] = None
    mol: Optional[str] = None
    quantity: Optional[str] = None
    complexity: str = "S"
    status: str = "new"
    photos: List[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    assigned_to: Optional[str] = None
    external_id: Optional[str] = None
    notes: Optional[str] = None

# Reference Models
class CategoryCreate(BaseModel):
    name: str
    complexity_default: str = ComplexityLevel.SIMPLE
    required_fields: List[str] = []

class ReferenceCreate(BaseModel):
    name: str
    type: str  # floor, department, mol

class RateCreate(BaseModel):
    complexity: str
    rate: float
    time_norm_minutes: int

# QR Batch Models
class QRBatchCreate(BaseModel):
    name: str
    count: int
    prefix: str = ""

class QRBatchResponse(BaseModel):
    id: str
    name: str
    count: int
    prefix: str
    created_at: str
    created_by: str
    status: str
    printed: int = 0
    spoiled: int = 0

# Sync Models
class SyncAction(BaseModel):
    action_type: str  # create, update, scan, photo
    object_id: Optional[str] = None
    data: Dict[str, Any]
    timestamp: str
    local_id: str

class SyncBatch(BaseModel):
    actions: List[SyncAction]
    device_id: str

# ==================== HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def generate_2fa_code() -> str:
    return ''.join(random.choices(string.digits, k=6))

def generate_invite_code() -> str:
    """Generate a readable invite code like INV-XXXX-XXXX"""
    chars = string.ascii_uppercase + string.digits
    part1 = ''.join(random.choices(chars, k=4))
    part2 = ''.join(random.choices(chars, k=4))
    return f"INV-{part1}-{part2}"

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Пользователь не найден")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Токен истёк")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")

def require_roles(*roles):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return user
    return role_checker

async def log_audit(object_id: str, action: str, changes: dict, user_id: str):
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "object_id": object_id,
        "action": action,
        "changes": changes,
        "user_id": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

def generate_qr_image(data: str, size: int = 200) -> BytesIO:
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer

async def compress_image(file_data: bytes, max_size: int = 1200, quality: int = 80) -> bytes:
    img = Image.open(BytesIO(file_data))
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')
    ratio = min(max_size / img.width, max_size / img.height)
    if ratio < 1:
        new_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)
    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()

# ==================== AUTH ROUTES ====================

# Default admin credentials
DEFAULT_ADMIN_EMAIL = "admin@inventory.system"
DEFAULT_ADMIN_PASSWORD = "admin123"

@api_router.on_event("startup")
async def create_default_admin():
    """Create default admin user on startup if not exists"""
    existing = await db.users.find_one({"email": DEFAULT_ADMIN_EMAIL})
    if not existing:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": DEFAULT_ADMIN_EMAIL,
            "password": hash_password(DEFAULT_ADMIN_PASSWORD),
            "name": "Администратор",
            "role": UserRole.ADMIN,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        logger.info(f"Default admin created: {DEFAULT_ADMIN_EMAIL}")
    
    # Create default rates if not exist
    existing_rates = await db.rates.count_documents({})
    if existing_rates == 0:
        default_rates = [
            {"id": str(uuid.uuid4()), "complexity": "S", "rate": 50, "time_norm_minutes": 3, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "complexity": "M", "rate": 100, "time_norm_minutes": 7, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "complexity": "L", "rate": 200, "time_norm_minutes": 15, "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.rates.insert_many(default_rates)
        logger.info("Default rates created")

@api_router.post("/auth/register", response_model=UserResponse)
async def register(user: UserCreate):
    # Validate invite code
    invite = await db.invite_codes.find_one({
        "code": user.invite_code.upper(),
        "is_active": True
    }, {"_id": 0})
    
    if not invite:
        raise HTTPException(status_code=400, detail="Неверный или недействительный инвайт-код")
    
    # Check expiration
    if datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Инвайт-код истёк")
    
    # Check max uses
    if invite["used_count"] >= invite["max_uses"]:
        raise HTTPException(status_code=400, detail="Инвайт-код уже использован максимальное число раз")
    
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user.email,
        "password": hash_password(user.password),
        "name": user.name,
        "role": invite["role"],  # Role from invite code
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "invited_by": invite["created_by"]
    }
    await db.users.insert_one(user_doc)
    
    # Update invite code usage
    await db.invite_codes.update_one(
        {"code": user.invite_code.upper()},
        {"$inc": {"used_count": 1}}
    )
    
    return UserResponse(
        id=user_id,
        email=user.email,
        name=user.name,
        role=invite["role"],
        created_at=user_doc["created_at"],
        is_active=True
    )

@api_router.post("/auth/register-by-admin", response_model=UserResponse)
async def register_by_admin(user: UserCreateByAdmin, admin: dict = Depends(require_roles(UserRole.ADMIN))):
    """Admin can create users without invite code"""
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user.email,
        "password": hash_password(user.password),
        "name": user.name,
        "role": user.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_admin": admin["id"]
    }
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        id=user_id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user_doc["created_at"],
        is_active=True
    )

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Аккаунт деактивирован")
    
    # Generate 2FA code
    code = generate_2fa_code()
    await db.two_fa_codes.update_one(
        {"email": credentials.email},
        {"$set": {
            "code": code,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        }},
        upsert=True
    )
    
    logger.info(f"2FA code for {credentials.email}: {code}")
    
    # For MVP: return code in response (remove in production!)
    return {
        "message": "Код подтверждения отправлен", 
        "requires_2fa": True, 
        "email": credentials.email,
        "dev_code": code  # MVP only - remove in production!
    }

@api_router.post("/auth/verify-2fa", response_model=TokenResponse)
async def verify_2fa(data: Verify2FA):
    code_doc = await db.two_fa_codes.find_one({"email": data.email}, {"_id": 0})
    if not code_doc:
        raise HTTPException(status_code=400, detail="Код не найден")
    
    if code_doc["code"] != data.code:
        raise HTTPException(status_code=400, detail="Неверный код")
    
    if datetime.fromisoformat(code_doc["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Код истёк")
    
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    token = create_token(user["id"], user["email"], user["role"])
    
    await db.two_fa_codes.delete_one({"email": data.email})
    await db.login_log.insert_one({
        "user_id": user["id"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ip": "unknown"
    })
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            created_at=user["created_at"],
            is_active=user.get("is_active", True)
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        created_at=user["created_at"],
        is_active=user.get("is_active", True)
    )

# ==================== USERS ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def list_users(user: dict = Depends(require_roles(UserRole.ADMIN))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: dict, admin: dict = Depends(require_roles(UserRole.ADMIN))):
    allowed = {"name", "role", "is_active"}
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Нет данных для обновления")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"message": "Обновлено"}

# ==================== INVITE CODES ROUTES ====================

@api_router.post("/invites", response_model=InviteCodeResponse)
async def create_invite(data: InviteCodeCreate, user: dict = Depends(require_roles(UserRole.ADMIN))):
    """Create a new invite code (admin only)"""
    invite_id = str(uuid.uuid4())
    code = generate_invite_code()
    
    invite_doc = {
        "id": invite_id,
        "code": code,
        "role": data.role,
        "max_uses": data.max_uses,
        "used_count": 0,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=data.expires_days)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
        "is_active": True
    }
    await db.invite_codes.insert_one(invite_doc)
    
    return InviteCodeResponse(**invite_doc)

@api_router.get("/invites", response_model=List[InviteCodeResponse])
async def list_invites(user: dict = Depends(require_roles(UserRole.ADMIN))):
    """List all invite codes"""
    invites = await db.invite_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [InviteCodeResponse(**inv) for inv in invites]

@api_router.delete("/invites/{invite_id}")
async def deactivate_invite(invite_id: str, user: dict = Depends(require_roles(UserRole.ADMIN))):
    """Deactivate an invite code"""
    result = await db.invite_codes.update_one(
        {"id": invite_id},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Инвайт не найден")
    return {"message": "Инвайт деактивирован"}

# ==================== OBJECTS ROUTES ====================

@api_router.post("/objects", response_model=ObjectResponse)
async def create_object(obj: ObjectCreate, user: dict = Depends(get_current_user)):
    object_id = str(uuid.uuid4())
    qr_code = f"INV-{object_id[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    
    obj_doc = {
        "id": object_id,
        "name": obj.name,
        "qr_code": qr_code,
        "category": obj.category,
        "description": obj.description,
        "characteristics": obj.characteristics,
        "serial_number": obj.serial_number,
        "inventory_number": obj.inventory_number,
        "year": obj.year,
        "condition": obj.condition,
        "floor": obj.floor,
        "room": obj.room,
        "department": obj.department,
        "mol": obj.mol,
        "quantity": obj.quantity or "1",
        "complexity": obj.complexity,
        "status": ObjectStatus.NEW,
        "photos": [],
        "created_at": now,
        "updated_at": now,
        "created_by": user["id"],
        "assigned_to": user["id"],
        "external_id": obj.external_id,
        "notes": obj.notes
    }
    
    await db.objects.insert_one(obj_doc)
    await log_audit(object_id, "create", {"new": obj_doc}, user["id"])
    
    return ObjectResponse(**obj_doc)

@api_router.get("/objects", response_model=List[ObjectResponse])
async def list_objects(
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    floor: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if category_id:
        query["category_id"] = category_id
    if floor:
        query["floor"] = floor
    if department:
        query["department"] = department
    if assigned_to:
        query["assigned_to"] = assigned_to
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"qr_code": {"$regex": search, "$options": "i"}},
            {"characteristics": {"$regex": search, "$options": "i"}},
            {"external_id": {"$regex": search, "$options": "i"}}
        ]
    
    objects = await db.objects.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return [ObjectResponse(**o) for o in objects]

@api_router.get("/objects/count")
async def count_objects(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    count = await db.objects.count_documents(query)
    return {"count": count}

@api_router.get("/objects/by-qr/{qr_code}", response_model=ObjectResponse)
async def get_object_by_qr(qr_code: str, user: dict = Depends(get_current_user)):
    obj = await db.objects.find_one({"qr_code": qr_code}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Объект не найден")
    return ObjectResponse(**obj)

@api_router.get("/objects/{object_id}", response_model=ObjectResponse)
async def get_object(object_id: str, user: dict = Depends(get_current_user)):
    obj = await db.objects.find_one({"id": object_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Объект не найден")
    return ObjectResponse(**obj)

@api_router.put("/objects/{object_id}", response_model=ObjectResponse)
async def update_object(object_id: str, data: ObjectUpdate, user: dict = Depends(get_current_user)):
    obj = await db.objects.find_one({"id": object_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Объект не найден")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Update category name if category changed
    if "category_id" in update_data and update_data["category_id"]:
        cat = await db.categories.find_one({"id": update_data["category_id"]}, {"_id": 0})
        if cat:
            update_data["category_name"] = cat.get("name")
    
    # Update MOL name if MOL changed
    if "mol_id" in update_data and update_data["mol_id"]:
        mol = await db.references.find_one({"id": update_data["mol_id"], "type": "mol"}, {"_id": 0})
        if mol:
            update_data["mol_name"] = mol.get("name")
    
    await db.objects.update_one({"id": object_id}, {"$set": update_data})
    await log_audit(object_id, "update", {"old": obj, "new": update_data}, user["id"])
    
    updated = await db.objects.find_one({"id": object_id}, {"_id": 0})
    return ObjectResponse(**updated)

@api_router.post("/objects/{object_id}/verify")
async def verify_object(object_id: str, user: dict = Depends(get_current_user)):
    obj = await db.objects.find_one({"id": object_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Объект не найден")
    
    await db.objects.update_one(
        {"id": object_id},
        {"$set": {"status": ObjectStatus.PENDING, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await log_audit(object_id, "verify", {"status": ObjectStatus.PENDING}, user["id"])
    
    return {"message": "Отправлено на проверку"}

@api_router.post("/objects/{object_id}/photo")
async def upload_photo(object_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    obj = await db.objects.find_one({"id": object_id}, {"_id": 0})
    if not obj:
        raise HTTPException(status_code=404, detail="Объект не найден")
    
    file_data = await file.read()
    compressed = await compress_image(file_data)
    
    photo_id = str(uuid.uuid4())
    photo_path = PHOTOS_DIR / f"{photo_id}.jpg"
    
    async with aiofiles.open(photo_path, "wb") as f:
        await f.write(compressed)
    
    photo_url = f"/api/photos/{photo_id}.jpg"
    photos = obj.get("photos", [])
    photos.append(photo_url)
    
    await db.objects.update_one(
        {"id": object_id},
        {"$set": {"photos": photos, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await log_audit(object_id, "photo_upload", {"photo": photo_url}, user["id"])
    
    return {"photo_url": photo_url}

@api_router.get("/photos/{filename}")
async def get_photo(filename: str):
    photo_path = PHOTOS_DIR / filename
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Фото не найдено")
    return FileResponse(photo_path, media_type="image/jpeg")

# ==================== CATEGORIES ROUTES ====================

@api_router.post("/categories")
async def create_category(cat: CategoryCreate, user: dict = Depends(require_roles(UserRole.ADMIN))):
    cat_id = str(uuid.uuid4())
    cat_doc = {
        "id": cat_id,
        "name": cat.name,
        "complexity_default": cat.complexity_default,
        "required_fields": cat.required_fields,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(cat_doc)
    return {"id": cat_id, **cat.model_dump()}

@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    cats = await db.categories.find({}, {"_id": 0}).to_list(1000)
    return cats

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(require_roles(UserRole.ADMIN))):
    result = await db.categories.delete_one({"id": cat_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return {"message": "Удалено"}

# ==================== REFERENCES ROUTES ====================

@api_router.post("/references")
async def create_reference(ref: ReferenceCreate, user: dict = Depends(require_roles(UserRole.ADMIN))):
    ref_id = str(uuid.uuid4())
    ref_doc = {
        "id": ref_id,
        "name": ref.name,
        "type": ref.type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.references.insert_one(ref_doc)
    return {"id": ref_id, **ref.model_dump()}

@api_router.get("/references")
async def list_references(type: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if type:
        query["type"] = type
    refs = await db.references.find(query, {"_id": 0}).to_list(1000)
    return refs

@api_router.delete("/references/{ref_id}")
async def delete_reference(ref_id: str, user: dict = Depends(require_roles(UserRole.ADMIN))):
    result = await db.references.delete_one({"id": ref_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Справочник не найден")
    return {"message": "Удалено"}

# ==================== RATES ROUTES ====================

@api_router.post("/rates")
async def create_rate(rate: RateCreate, user: dict = Depends(require_roles(UserRole.ADMIN))):
    rate_id = str(uuid.uuid4())
    rate_doc = {
        "id": rate_id,
        "complexity": rate.complexity,
        "rate": rate.rate,
        "time_norm_minutes": rate.time_norm_minutes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rates.insert_one(rate_doc)
    return {"id": rate_id, **rate.model_dump()}

@api_router.get("/rates")
async def list_rates(user: dict = Depends(get_current_user)):
    rates = await db.rates.find({}, {"_id": 0}).to_list(100)
    return rates

@api_router.put("/rates/{rate_id}")
async def update_rate(rate_id: str, data: RateCreate, user: dict = Depends(require_roles(UserRole.ADMIN))):
    result = await db.rates.update_one(
        {"id": rate_id},
        {"$set": {"complexity": data.complexity, "rate": data.rate, "time_norm_minutes": data.time_norm_minutes}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    return {"message": "Обновлено"}

# ==================== QR BATCH ROUTES ====================

@api_router.post("/qr-batches")
async def create_qr_batch(batch: QRBatchCreate, user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))):
    batch_id = str(uuid.uuid4())
    codes = []
    
    for i in range(batch.count):
        code_id = str(uuid.uuid4())
        qr_code = f"{batch.prefix}INV-{code_id[:8].upper()}"
        codes.append({
            "id": code_id,
            "qr_code": qr_code,
            "batch_id": batch_id,
            "status": "available",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.qr_codes.insert_many(codes)
    
    batch_doc = {
        "id": batch_id,
        "name": batch.name,
        "count": batch.count,
        "prefix": batch.prefix,
        "status": "created",
        "printed": 0,
        "spoiled": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.qr_batches.insert_one(batch_doc)
    
    return QRBatchResponse(**batch_doc)

@api_router.get("/qr-batches")
async def list_qr_batches(user: dict = Depends(get_current_user)):
    batches = await db.qr_batches.find({}, {"_id": 0}).to_list(1000)
    return [QRBatchResponse(**b) for b in batches]

@api_router.get("/qr-batches/{batch_id}/pdf")
async def get_batch_pdf(batch_id: str, user: dict = Depends(get_current_user)):
    batch = await db.qr_batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Партия не найдена")
    
    codes = await db.qr_codes.find({"batch_id": batch_id}, {"_id": 0}).to_list(10000)
    
    # Generate PDF
    pdf_path = PDF_DIR / f"batch_{batch_id}.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    width, height = A4
    
    # Labels layout: 3 columns x 8 rows per page
    cols, rows = 3, 8
    label_width = 65 * mm
    label_height = 35 * mm
    margin_x = 10 * mm
    margin_y = 10 * mm
    
    for idx, code in enumerate(codes):
        page_idx = idx // (cols * rows)
        pos_on_page = idx % (cols * rows)
        col = pos_on_page % cols
        row = pos_on_page // cols
        
        if pos_on_page == 0 and idx > 0:
            c.showPage()
        
        x = margin_x + col * label_width
        y = height - margin_y - (row + 1) * label_height
        
        # QR code
        qr_buffer = generate_qr_image(code["qr_code"], size=100)
        qr_img = Image.open(qr_buffer)
        qr_path = QR_DIR / f"temp_{code['id']}.png"
        qr_img.save(str(qr_path))
        c.drawImage(str(qr_path), x + 2*mm, y + 2*mm, width=25*mm, height=25*mm)
        
        # Code text
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 30*mm, y + 20*mm, code["qr_code"])
        c.setFont("Helvetica", 6)
        c.drawString(x + 30*mm, y + 12*mm, f"ID: {code['id'][:8]}")
    
    c.save()
    
    # Update batch status
    await db.qr_batches.update_one({"id": batch_id}, {"$set": {"status": "printed", "printed": len(codes)}})
    
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"qr_batch_{batch['name']}.pdf")

@api_router.post("/qr-batches/{batch_id}/spoil")
async def mark_spoiled(batch_id: str, count: int = 1, user: dict = Depends(get_current_user)):
    result = await db.qr_batches.update_one(
        {"id": batch_id},
        {"$inc": {"spoiled": count}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Партия не найдена")
    return {"message": f"Помечено испорченных: {count}"}

# ==================== IMPORT ROUTES ====================

@api_router.post("/import/preview")
async def preview_import(file: UploadFile = File(...), user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))):
    import pandas as pd
    
    content = await file.read()
    
    if file.filename.endswith('.csv'):
        df = pd.read_csv(BytesIO(content))
    else:
        df = pd.read_excel(BytesIO(content))
    
    columns = df.columns.tolist()
    preview = df.head(5).to_dict('records')
    total_rows = len(df)
    
    return {
        "columns": columns,
        "preview": preview,
        "total_rows": total_rows,
        "filename": file.filename
    }

@api_router.post("/import/execute")
async def execute_import(
    file: UploadFile = File(...),
    mapping: str = Query(...),  # JSON string of column mapping
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
):
    import pandas as pd
    
    content = await file.read()
    column_mapping = json.loads(mapping)
    
    if file.filename.endswith('.csv'):
        df = pd.read_csv(BytesIO(content))
    else:
        df = pd.read_excel(BytesIO(content))
    
    created = 0
    updated = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    
    for idx, row in df.iterrows():
        try:
            obj_data = {}
            for target, source in column_mapping.items():
                if source and source in row:
                    val = row[source]
                    if pd.notna(val):
                        obj_data[target] = str(val)
            
            if not obj_data.get("name"):
                errors.append(f"Строка {idx + 2}: отсутствует название")
                continue
            
            # Check if exists by external_id
            existing = None
            if obj_data.get("external_id"):
                existing = await db.objects.find_one({"external_id": obj_data["external_id"]}, {"_id": 0})
            
            if existing:
                await db.objects.update_one(
                    {"id": existing["id"]},
                    {"$set": {**obj_data, "updated_at": now}}
                )
                updated += 1
            else:
                object_id = str(uuid.uuid4())
                qr_code = f"INV-{object_id[:8].upper()}"
                
                obj_doc = {
                    "id": object_id,
                    "qr_code": qr_code,
                    "status": ObjectStatus.NEW,
                    "photos": [],
                    "created_at": now,
                    "updated_at": now,
                    "created_by": user["id"],
                    "complexity": obj_data.get("complexity", ComplexityLevel.SIMPLE),
                    **obj_data
                }
                await db.objects.insert_one(obj_doc)
                created += 1
                
        except Exception as e:
            errors.append(f"Строка {idx + 2}: {str(e)}")
    
    return {
        "created": created,
        "updated": updated,
        "errors": errors[:50]  # Limit errors
    }

# ==================== EXPORT ROUTES ====================

@api_router.get("/export/objects")
async def export_objects(
    format: str = "xlsx",
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    import pandas as pd
    
    query = {}
    if status:
        query["status"] = status
    
    objects = await db.objects.find(query, {"_id": 0}).to_list(100000)
    
    df = pd.DataFrame(objects)
    
    buffer = BytesIO()
    if format == "csv":
        df.to_csv(buffer, index=False, encoding='utf-8-sig')
        media_type = "text/csv"
        filename = "inventory_export.csv"
    else:
        df.to_excel(buffer, index=False, engine='xlsxwriter')
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "inventory_export.xlsx"
    
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== STATS & DASHBOARD ====================

@api_router.get("/stats/overview")
async def get_overview_stats(user: dict = Depends(get_current_user)):
    total = await db.objects.count_documents({})
    by_status = {}
    for status in [ObjectStatus.NEW, ObjectStatus.PENDING, ObjectStatus.VERIFIED, ObjectStatus.REJECTED]:
        by_status[status] = await db.objects.count_documents({"status": status})
    
    by_complexity = {}
    for comp in [ComplexityLevel.SIMPLE, ComplexityLevel.MEDIUM, ComplexityLevel.COMPLEX]:
        by_complexity[comp] = await db.objects.count_documents({"complexity": comp})
    
    return {
        "total": total,
        "by_status": by_status,
        "by_complexity": by_complexity
    }

@api_router.get("/stats/progress")
async def get_progress_stats(user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if user_id:
        query["assigned_to"] = user_id
    elif user["role"] == UserRole.FIELD_WORKER:
        query["assigned_to"] = user["id"]
    
    total = await db.objects.count_documents(query)
    verified = await db.objects.count_documents({**query, "status": ObjectStatus.VERIFIED})
    pending = await db.objects.count_documents({**query, "status": ObjectStatus.PENDING})
    
    # Calculate earnings
    rates = {r["complexity"]: r["rate"] for r in await db.rates.find({}, {"_id": 0}).to_list(100)}
    
    pipeline = [
        {"$match": {**query, "status": {"$in": [ObjectStatus.VERIFIED, ObjectStatus.PENDING]}}},
        {"$group": {"_id": "$complexity", "count": {"$sum": 1}}}
    ]
    
    complexity_counts = await db.objects.aggregate(pipeline).to_list(10)
    
    pending_earnings = 0
    confirmed_earnings = 0
    
    for item in complexity_counts:
        rate = rates.get(item["_id"], 0)
        pending_earnings += item["count"] * rate
    
    # Only verified count as confirmed
    verified_pipeline = [
        {"$match": {**query, "status": ObjectStatus.VERIFIED}},
        {"$group": {"_id": "$complexity", "count": {"$sum": 1}}}
    ]
    verified_counts = await db.objects.aggregate(verified_pipeline).to_list(10)
    
    for item in verified_counts:
        rate = rates.get(item["_id"], 0)
        confirmed_earnings += item["count"] * rate
    
    return {
        "total": total,
        "verified": verified,
        "pending": pending,
        "pending_earnings": pending_earnings,
        "confirmed_earnings": confirmed_earnings
    }

@api_router.get("/stats/by-user")
async def get_stats_by_user(user: dict = Depends(require_roles(UserRole.ADMIN))):
    pipeline = [
        {"$group": {
            "_id": "$assigned_to",
            "total": {"$sum": 1},
            "verified": {"$sum": {"$cond": [{"$eq": ["$status", ObjectStatus.VERIFIED]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", ObjectStatus.PENDING]}, 1, 0]}}
        }}
    ]
    
    stats = await db.objects.aggregate(pipeline).to_list(100)
    
    # Enrich with user names
    result = []
    for s in stats:
        if s["_id"]:
            u = await db.users.find_one({"id": s["_id"]}, {"_id": 0})
            result.append({
                "user_id": s["_id"],
                "user_name": u["name"] if u else "Неизвестно",
                **{k: v for k, v in s.items() if k != "_id"}
            })
    
    return result

# ==================== AUDIT LOG ====================

@api_router.get("/audit-log")
async def get_audit_log(
    object_id: Optional[str] = None,
    user_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if object_id:
        query["object_id"] = object_id
    if user_id:
        query["user_id"] = user_id
    
    logs = await db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with user names
    for log in logs:
        u = await db.users.find_one({"id": log["user_id"]}, {"_id": 0})
        log["user_name"] = u["name"] if u else "Неизвестно"
    
    return logs

# ==================== SYNC (OFFLINE) ====================

@api_router.post("/sync")
async def sync_actions(batch: SyncBatch, user: dict = Depends(get_current_user)):
    results = []
    
    for action in batch.actions:
        try:
            if action.action_type == "create":
                # Check for duplicate by local_id
                existing = await db.objects.find_one({"local_id": action.local_id}, {"_id": 0})
                if existing:
                    results.append({"local_id": action.local_id, "status": "duplicate", "server_id": existing["id"]})
                    continue
                
                object_id = str(uuid.uuid4())
                qr_code = f"INV-{object_id[:8].upper()}"
                now = datetime.now(timezone.utc).isoformat()
                
                obj_doc = {
                    "id": object_id,
                    "qr_code": qr_code,
                    "local_id": action.local_id,
                    "status": ObjectStatus.NEW,
                    "photos": [],
                    "created_at": now,
                    "updated_at": now,
                    "created_by": user["id"],
                    "assigned_to": user["id"],
                    **action.data
                }
                await db.objects.insert_one(obj_doc)
                results.append({"local_id": action.local_id, "status": "created", "server_id": object_id, "qr_code": qr_code})
                
            elif action.action_type == "update":
                if action.object_id:
                    await db.objects.update_one(
                        {"id": action.object_id},
                        {"$set": {**action.data, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    results.append({"local_id": action.local_id, "status": "updated", "server_id": action.object_id})
                    
            elif action.action_type == "scan":
                if action.object_id:
                    await db.objects.update_one(
                        {"id": action.object_id},
                        {"$set": {"status": ObjectStatus.PENDING, "updated_at": datetime.now(timezone.utc).isoformat()}}
                    )
                    results.append({"local_id": action.local_id, "status": "scanned", "server_id": action.object_id})
                    
        except Exception as e:
            results.append({"local_id": action.local_id, "status": "error", "error": str(e)})
    
    return {"results": results, "synced_at": datetime.now(timezone.utc).isoformat()}

# ==================== AUTOCOMPLETE ====================

@api_router.get("/autocomplete/{field}")
async def autocomplete(field: str, q: str = "", user: dict = Depends(get_current_user)):
    if field not in ["name", "characteristics", "floor", "department"]:
        raise HTTPException(status_code=400, detail="Неверное поле")
    
    # Get distinct values matching query
    pipeline = [
        {"$match": {field: {"$regex": q, "$options": "i"}}},
        {"$group": {"_id": f"${field}"}},
        {"$limit": 20}
    ]
    
    results = await db.objects.aggregate(pipeline).to_list(20)
    return [r["_id"] for r in results if r["_id"]]

@api_router.get("/autocomplete/recent/{field}")
async def recent_values(field: str, user: dict = Depends(get_current_user)):
    if field not in ["name", "characteristics", "floor", "department", "category_id"]:
        raise HTTPException(status_code=400, detail="Неверное поле")
    
    pipeline = [
        {"$match": {"created_by": user["id"], field: {"$ne": None}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": f"${field}"}},
        {"$limit": 10}
    ]
    
    results = await db.objects.aggregate(pipeline).to_list(10)
    return [r["_id"] for r in results if r["_id"]]

# ==================== QA QUEUE ====================

@api_router.get("/qa/queue")
async def qa_queue(
    filter_type: str = "pending",  # pending, rejected, no_photo, duplicates
    skip: int = 0,
    limit: int = 50,
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR))
):
    if filter_type == "pending":
        query = {"status": ObjectStatus.PENDING}
    elif filter_type == "rejected":
        query = {"status": ObjectStatus.REJECTED}
    elif filter_type == "no_photo":
        query = {"photos": {"$size": 0}}
    else:
        query = {"status": ObjectStatus.PENDING}
    
    objects = await db.objects.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.objects.count_documents(query)
    
    return {"items": [ObjectResponse(**o) for o in objects], "total": total}

@api_router.post("/qa/{object_id}/approve")
async def qa_approve(object_id: str, user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR))):
    result = await db.objects.update_one(
        {"id": object_id},
        {"$set": {"status": ObjectStatus.VERIFIED, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Объект не найден")
    
    await log_audit(object_id, "qa_approve", {"status": ObjectStatus.VERIFIED}, user["id"])
    return {"message": "Принято"}

@api_router.post("/qa/{object_id}/reject")
async def qa_reject(object_id: str, reason: str = "", user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.AUDITOR))):
    result = await db.objects.update_one(
        {"id": object_id},
        {"$set": {
            "status": ObjectStatus.REJECTED,
            "reject_reason": reason,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Объект не найден")
    
    await log_audit(object_id, "qa_reject", {"status": ObjectStatus.REJECTED, "reason": reason}, user["id"])
    return {"message": "Отклонено"}

# ==================== HEALTH CHECK ====================

@api_router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
