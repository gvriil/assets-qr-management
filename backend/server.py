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
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import aiofiles
import json
import re

# Register Cyrillic-capable fonts
try:
    pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVu-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
    CYRILLIC_FONT = 'DejaVu'
    CYRILLIC_FONT_BOLD = 'DejaVu-Bold'
except Exception as e:
    logging.warning(f"Could not load DejaVu fonts: {e}, falling back to Helvetica")
    CYRILLIC_FONT = 'Helvetica'
    CYRILLIC_FONT_BOLD = 'Helvetica-Bold'

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable is required")
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
    oiv: Optional[str] = None  # ОИВ
    floor: Optional[str] = None  # ЭТАЖ
    management: Optional[str] = None  # УПРАВЛЕНИЕ
    department: Optional[str] = None  # ОТДЕЛ
    room: Optional[str] = None  # МЕСТО/помещение
    mol: Optional[str] = None  # ФИО (МОЛ)
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
    oiv: Optional[str] = None
    floor: Optional[str] = None
    management: Optional[str] = None
    department: Optional[str] = None
    room: Optional[str] = None
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
    oiv: Optional[str] = None
    floor: Optional[str] = None
    management: Optional[str] = None
    department: Optional[str] = None
    room: Optional[str] = None
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
    name: Optional[str] = None
    complexity: str
    rate: float
    time_norm_minutes: int

# QR Batch Models
class QRLabelData(BaseModel):
    oiv: Optional[str] = None
    floor: Optional[str] = None
    department: Optional[str] = None
    section: Optional[str] = None
    location: Optional[str] = None
    mol: Optional[str] = None

class QRBatchCreate(BaseModel):
    name: str
    count: int
    prefix: str = ""
    label_data: Optional[QRLabelData] = None

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
    # Remove _id from changes to avoid serialization issues
    clean_changes = {}
    for key, val in changes.items():
        if isinstance(val, dict):
            clean_changes[key] = {k: v for k, v in val.items() if k != "_id"}
        else:
            clean_changes[key] = val
    
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "object_id": object_id,
        "action": action,
        "changes": clean_changes,
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

@api_router.on_event("startup")
async def create_default_data():
    """Create default data on startup if not exists"""
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
    
    # Create token directly without 2FA
    token = create_token(user["id"], user["email"], user["role"])
    
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
    category: Optional[str] = None,
    category_id: Optional[str] = None,
    floor: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    sort: Optional[str] = "created_desc",
    skip: int = 0,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if category_id:
        # Get category name by ID
        cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
        if cat:
            query["category"] = cat.get("name")
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
            {"serial_number": {"$regex": search, "$options": "i"}},
            {"inventory_number": {"$regex": search, "$options": "i"}},
            {"mol": {"$regex": search, "$options": "i"}},
            {"external_id": {"$regex": search, "$options": "i"}}
        ]
    
    # Sort options
    sort_map = {
        "name_asc": [("name", 1)],
        "name_desc": [("name", -1)],
        "created_desc": [("created_at", -1)],
        "created_asc": [("created_at", 1)],
        "floor_asc": [("floor", 1), ("room", 1)],
        "category_asc": [("category", 1), ("name", 1)],
        "status_asc": [("status", 1), ("name", 1)]
    }
    sort_spec = sort_map.get(sort, [("created_at", -1)])
    
    objects = await db.objects.find(query, {"_id": 0}).sort(sort_spec).skip(skip).limit(limit).to_list(limit)
    return [ObjectResponse(**o) for o in objects]

@api_router.get("/objects/count")
async def count_objects(
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query["status"] = status
    if category_id:
        cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
        if cat:
            query["category"] = cat.get("name")
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
        "name": rate.name,
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
        {"$set": {"name": data.name, "complexity": data.complexity, "rate": data.rate, "time_norm_minutes": data.time_norm_minutes}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    return {"message": "Обновлено"}

# ==================== QR BATCH ROUTES ====================

@api_router.post("/qr-batches")
async def create_qr_batch(batch: QRBatchCreate, user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))):
    batch_id = str(uuid.uuid4())
    codes = []
    
    # Build label text from label_data
    label_parts = []
    if batch.label_data:
        if batch.label_data.oiv:
            label_parts.append(batch.label_data.oiv)
        if batch.label_data.floor:
            label_parts.append(f"Эт.{batch.label_data.floor}")
        if batch.label_data.department:
            label_parts.append(batch.label_data.department)
        if batch.label_data.section:
            label_parts.append(batch.label_data.section)
        if batch.label_data.location:
            label_parts.append(batch.label_data.location)
        if batch.label_data.mol:
            label_parts.append(batch.label_data.mol)
    label_text = " - ".join(label_parts) if label_parts else None
    
    for i in range(batch.count):
        code_id = str(uuid.uuid4())
        qr_code = f"{batch.prefix}INV-{code_id[:8].upper()}"
        codes.append({
            "id": code_id,
            "qr_code": qr_code,
            "batch_id": batch_id,
            "status": "available",
            "label_text": label_text,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.qr_codes.insert_many(codes)
    
    batch_doc = {
        "id": batch_id,
        "name": batch.name,
        "count": batch.count,
        "prefix": batch.prefix,
        "label_data": batch.label_data.model_dump() if batch.label_data else None,
        "label_text": label_text,
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
    
    # Get label text from batch
    label_text = batch.get("label_text", "")
    
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
        c.setFont(CYRILLIC_FONT_BOLD, 8)
        c.drawString(x + 30*mm, y + 22*mm, code["qr_code"])
        c.setFont(CYRILLIC_FONT, 5)
        c.drawString(x + 30*mm, y + 16*mm, f"ID: {code['id'][:8]}")
        
        # Label text (ОИВ - ЭТАЖ - УПРАВЛЕНИЕ - ОТДЕЛ - МЕСТО - ФИО)
        code_label = code.get("label_text") or label_text
        if code_label:
            c.setFont(CYRILLIC_FONT, 5)
            # Split long label into multiple lines if needed
            max_chars = 35
            if len(code_label) > max_chars:
                line1 = code_label[:max_chars]
                line2 = code_label[max_chars:max_chars*2]
                c.drawString(x + 30*mm, y + 10*mm, line1)
                c.drawString(x + 30*mm, y + 6*mm, line2)
            else:
                c.drawString(x + 30*mm, y + 10*mm, code_label)
    
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
async def preview_import(
    file: UploadFile = File(...), 
    preview_rows: int = Query(default=50, le=100),
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
):
    import pandas as pd
    
    content = await file.read()
    
    try:
        if file.filename.endswith('.csv'):
            # Try to detect header row - read first 10 rows as raw
            df_raw = pd.read_csv(BytesIO(content), header=None, encoding='utf-8', nrows=10)
            
            # Find header row (first row with multiple non-null values)
            header_row = 0
            for idx in range(len(df_raw)):
                non_null_count = df_raw.iloc[idx].notna().sum()
                # Check if row looks like headers (multiple non-null values, not just numbers)
                if non_null_count >= 2:
                    row_values = [str(v) for v in df_raw.iloc[idx].dropna().values]
                    # Skip rows that look like data (have numbers or specific patterns)
                    if any('Приложение' in v or 'Перечень' in v for v in row_values):
                        continue
                    # Check if it looks like headers
                    if any(v in ['№', 'Описание', 'Наименование', 'Количество', 'Кол-во', 'Категория'] or 
                           'описан' in v.lower() or 'наимен' in v.lower() or 'характер' in v.lower() 
                           for v in row_values):
                        header_row = idx
                        break
            
            # Re-read with correct header
            df = pd.read_csv(BytesIO(content), header=header_row, encoding='utf-8')
            
            # Clean column names - remove leading/trailing spaces
            df.columns = [str(c).strip() if pd.notna(c) else f'col_{i}' for i, c in enumerate(df.columns)]
            
        else:
            df = pd.read_excel(BytesIO(content))
        
        # Drop completely empty rows
        df = df.dropna(how='all')
        
        # Replace NaN with None for JSON serialization
        df = df.where(pd.notnull(df), None)
        
        columns = df.columns.tolist()
        # Convert preview to serializable format
        preview = []
        for _, row in df.head(preview_rows).iterrows():
            preview.append({col: (str(val).strip() if val is not None else "") for col, val in row.items()})
        
        total_rows = len(df)
        
        return {
            "columns": columns,
            "preview": preview,
            "total_rows": total_rows,
            "filename": file.filename,
            "preview_count": len(preview)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка чтения файла: {str(e)}")

@api_router.post("/import/execute")
async def execute_import(
    file: UploadFile = File(...),
    mapping: str = Query(...),  # JSON string of column mapping
    user: dict = Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
):
    import pandas as pd
    
    content = await file.read()
    mapping_data = json.loads(mapping)
    
    # Extract options if present
    options = mapping_data.pop('_options', {})
    column_mapping = mapping_data
    fill_down_category = options.get('fillDownCategory', False)
    skip_empty_rows = options.get('skipEmptyRows', True)
    parse_commas = options.get('parseCommas', True)  # Parse comma-separated descriptions
    
    if file.filename.endswith('.csv'):
        # Try to detect header row
        df_raw = pd.read_csv(BytesIO(content), header=None, nrows=10)
        header_row = 0
        for idx in range(len(df_raw)):
            non_null_count = df_raw.iloc[idx].notna().sum()
            if non_null_count >= 2:
                row_values = [str(v) for v in df_raw.iloc[idx].dropna().values]
                if any('Приложение' in v or 'Перечень' in v for v in row_values):
                    continue
                if any(v in ['№', 'Описание', 'Наименование', 'Количество', 'Кол-во', 'Категория'] or 
                       'описан' in v.lower() or 'наимен' in v.lower() 
                       for v in row_values):
                    header_row = idx
                    break
        df = pd.read_csv(BytesIO(content), header=header_row)
        df.columns = [str(c).strip() if pd.notna(c) else f'col_{i}' for i, c in enumerate(df.columns)]
    else:
        df = pd.read_excel(BytesIO(content))
    
    # Drop completely empty rows
    df = df.dropna(how='all')
    
    created = 0
    updated = 0
    errors = []
    now = datetime.now(timezone.utc).isoformat()
    
    last_category = ''
    
    for idx, row in df.iterrows():
        try:
            obj_data = {}
            description_value = ''
            
            for target, source in column_mapping.items():
                if source and source in row.index:
                    val = row[source]
                    if pd.notna(val):
                        val_str = str(val).strip()
                        if val_str and val_str.lower() != 'nan':
                            obj_data[target] = val_str
                            if target in ['description', 'characteristics']:
                                description_value = val_str
            
            # Parse comma-separated description into fields
            if parse_commas and description_value and ',' in description_value:
                parts = [p.strip() for p in description_value.split(',') if p.strip()]
                
                if parts:
                    # First part is the main name
                    if not obj_data.get('name'):
                        obj_data['name'] = parts[0]
                    
                    # Try to extract structured data from remaining parts
                    remaining = []
                    for part in parts[1:]:
                        part_lower = part.lower()
                        
                        # Try to identify what this part is
                        if ('этаж' in part_lower or part_lower.startswith('эт')) and not obj_data.get('floor'):
                            obj_data['floor'] = part.replace('этаж', '').replace('эт.', '').replace('эт', '').strip()
                        elif ('каб' in part_lower or 'комн' in part_lower or 'помещ' in part_lower) and not obj_data.get('room'):
                            obj_data['room'] = part
                        elif part.isdigit() and len(part) == 4 and not obj_data.get('year'):
                            obj_data['year'] = part
                        elif part.replace('-', '').replace('/', '').isalnum() and len(part) > 3 and not obj_data.get('serial_number'):
                            # Looks like serial number
                            obj_data['serial_number'] = part
                        else:
                            remaining.append(part)
                    
                    # Put remaining parts into characteristics and notes
                    if remaining:
                        if not obj_data.get('characteristics'):
                            obj_data['characteristics'] = ', '.join(remaining[:3])
                        if len(remaining) > 3:
                            existing_notes = obj_data.get('notes', '')
                            new_notes = ', '.join(remaining[3:])
                            obj_data['notes'] = f"{existing_notes}; {new_notes}".strip('; ') if existing_notes else new_notes
            
            # Fill down category from previous row if enabled
            if fill_down_category:
                if obj_data.get('category'):
                    last_category = obj_data['category']
                elif last_category:
                    obj_data['category'] = last_category
            
            # Use description as name fallback
            if not obj_data.get("name") and obj_data.get("description"):
                obj_data["name"] = obj_data["description"]
            
            # Skip empty rows if enabled
            if skip_empty_rows and not obj_data.get("name"):
                continue
            
            if not obj_data.get("name"):
                errors.append(f"Строка {idx + 2}: отсутствует наименование или описание")
                continue
            
            # Skip rows that look like subtotals
            name_lower = obj_data.get("name", "").lower()
            if name_lower.startswith('итого') or name_lower.startswith('всего') or 'перечень' in name_lower:
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
        "errors": errors[:100],  # Limit errors to 100
        "total_errors": len(errors)
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
    
    objects = await db.objects.find(query, {"_id": 0}).to_list(10000)
    
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

@api_router.get("/export/catalog")
async def export_catalog(
    format: str = "pdf",  # pdf or xlsx
    page_size: str = "A4",  # A4 or A3
    include_photos: bool = True,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Generate printable catalog with photos"""
    import pandas as pd
    from reportlab.lib.pagesizes import A4, A3, landscape
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import xlsxwriter
    
    query = {}
    if status:
        query["status"] = status
    
    objects = await db.objects.find(query, {"_id": 0}).sort("name", 1).to_list(10000)
    
    if not objects:
        raise HTTPException(status_code=404, detail="Нет объектов для экспорта")
    
    buffer = BytesIO()
    
    if format == "pdf":
        # PDF Catalog Generation
        page = A3 if page_size == "A3" else A4
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=page,
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=15*mm,
            bottomMargin=15*mm
        )
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=14,
            spaceAfter=6
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=9,
            leading=11
        )
        small_style = ParagraphStyle(
            'CustomSmall',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey
        )
        
        elements = []
        
        # Title
        elements.append(Paragraph("КАТАЛОГ ИНВЕНТАРИЗАЦИИ", styles['Title']))
        elements.append(Paragraph(f"Дата формирования: {datetime.now().strftime('%d.%m.%Y %H:%M')}", small_style))
        elements.append(Paragraph(f"Всего объектов: {len(objects)}", small_style))
        elements.append(Spacer(1, 10*mm))
        
        for idx, obj in enumerate(objects):
            # Object card
            card_data = []
            
            # Header with QR and name
            card_data.append([
                Paragraph(f"<b>{obj.get('qr_code', 'N/A')}</b>", normal_style),
                Paragraph(f"<b>{obj.get('name', 'Без названия')[:50]}</b>", title_style)
            ])
            
            # Details
            details = []
            if obj.get('category'):
                details.append(f"Категория: {obj['category']}")
            if obj.get('characteristics'):
                chars = obj['characteristics'][:100] + ('...' if len(obj.get('characteristics', '')) > 100 else '')
                details.append(f"Характеристики: {chars}")
            if obj.get('inventory_number'):
                details.append(f"Инв. №: {obj['inventory_number']}")
            if obj.get('serial_number'):
                details.append(f"Серийный №: {obj['serial_number']}")
            
            location = []
            if obj.get('floor'):
                location.append(f"Этаж {obj['floor']}")
            if obj.get('room'):
                location.append(f"Каб. {obj['room']}")
            if obj.get('department'):
                location.append(obj['department'])
            if location:
                details.append(f"Расположение: {', '.join(location)}")
            
            if obj.get('mol'):
                details.append(f"МОЛ: {obj['mol']}")
            if obj.get('condition'):
                details.append(f"Состояние: {obj['condition']}")
            if obj.get('quantity') and obj['quantity'] != '1':
                details.append(f"Кол-во: {obj['quantity']}")
            
            card_data.append([Paragraph('<br/>'.join(details), normal_style)])
            
            # Photo
            if include_photos and obj.get('photos') and len(obj['photos']) > 0:
                photo_path = PHOTOS_DIR / obj['photos'][0].split('/')[-1]
                if photo_path.exists():
                    try:
                        img = RLImage(str(photo_path), width=40*mm, height=40*mm)
                        card_data.append([img])
                    except Exception:
                        card_data.append([Paragraph("[Фото недоступно]", small_style)])
                else:
                    card_data.append([Paragraph("[Фото не найдено]", small_style)])
            
            # Build card table
            card_table = Table(card_data, colWidths=[80*mm] if page_size == "A4" else [100*mm])
            card_table.setStyle(TableStyle([
                ('BOX', (0, 0), (-1, -1), 1, colors.lightgrey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.95, 0.95, 0.95)),
                ('PADDING', (0, 0), (-1, -1), 5),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            
            elements.append(card_table)
            elements.append(Spacer(1, 5*mm))
            
            # Page break every N items
            items_per_page = 6 if include_photos else 10
            if page_size == "A3":
                items_per_page = 9 if include_photos else 15
            
            if (idx + 1) % items_per_page == 0 and idx < len(objects) - 1:
                from reportlab.platypus import PageBreak
                elements.append(PageBreak())
        
        doc.build(elements)
        media_type = "application/pdf"
        filename = f"catalog_{page_size}.pdf"
        
    else:
        # Excel with embedded photos
        workbook = xlsxwriter.Workbook(buffer, {'in_memory': True})
        worksheet = workbook.add_worksheet('Каталог')
        
        # Formats
        header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#1e3a5f',
            'font_color': 'white',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        cell_format = workbook.add_format({
            'border': 1,
            'align': 'left',
            'valign': 'top',
            'text_wrap': True
        })
        
        # Headers
        headers = ['№', 'QR-код', 'Наименование', 'Категория', 'Характеристики', 
                   'Инв. номер', 'Серийный номер', 'Этаж', 'Кабинет', 'Отдел', 
                   'МОЛ', 'Состояние', 'Кол-во', 'Статус']
        if include_photos:
            headers.append('Фото')
        
        for col, header in enumerate(headers):
            worksheet.write(0, col, header, header_format)
        
        # Column widths
        worksheet.set_column('A:A', 5)
        worksheet.set_column('B:B', 15)
        worksheet.set_column('C:C', 30)
        worksheet.set_column('D:E', 20)
        worksheet.set_column('F:G', 15)
        worksheet.set_column('H:I', 8)
        worksheet.set_column('J:K', 15)
        worksheet.set_column('L:L', 12)
        worksheet.set_column('M:N', 8)
        if include_photos:
            worksheet.set_column('O:O', 20)
        
        # Data rows
        row_height = 80 if include_photos else 20
        
        for row_idx, obj in enumerate(objects, start=1):
            worksheet.set_row(row_idx, row_height)
            
            worksheet.write(row_idx, 0, row_idx, cell_format)
            worksheet.write(row_idx, 1, obj.get('qr_code', ''), cell_format)
            worksheet.write(row_idx, 2, obj.get('name', ''), cell_format)
            worksheet.write(row_idx, 3, obj.get('category', ''), cell_format)
            worksheet.write(row_idx, 4, obj.get('characteristics', ''), cell_format)
            worksheet.write(row_idx, 5, obj.get('inventory_number', ''), cell_format)
            worksheet.write(row_idx, 6, obj.get('serial_number', ''), cell_format)
            worksheet.write(row_idx, 7, obj.get('floor', ''), cell_format)
            worksheet.write(row_idx, 8, obj.get('room', ''), cell_format)
            worksheet.write(row_idx, 9, obj.get('department', ''), cell_format)
            worksheet.write(row_idx, 10, obj.get('mol', ''), cell_format)
            worksheet.write(row_idx, 11, obj.get('condition', ''), cell_format)
            worksheet.write(row_idx, 12, obj.get('quantity', '1'), cell_format)
            worksheet.write(row_idx, 13, obj.get('status', ''), cell_format)
            
            # Insert photo
            if include_photos:
                if obj.get('photos') and len(obj['photos']) > 0:
                    photo_path = PHOTOS_DIR / obj['photos'][0].split('/')[-1]
                    if photo_path.exists():
                        try:
                            worksheet.insert_image(
                                row_idx, 14,
                                str(photo_path),
                                {'x_scale': 0.3, 'y_scale': 0.3, 'x_offset': 5, 'y_offset': 5}
                            )
                        except Exception:
                            worksheet.write(row_idx, 14, '[Ошибка фото]', cell_format)
                    else:
                        worksheet.write(row_idx, 14, '[Нет файла]', cell_format)
                else:
                    worksheet.write(row_idx, 14, '', cell_format)
        
        workbook.close()
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"catalog_{page_size}.xlsx"
    
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== OFFICIAL DOCUMENT EXPORT ====================

@api_router.get("/export/document")
async def export_official_document(
    doc_type: str = "catalog",  # photo_archive, catalog, inventory_list, specification_report
    format: str = "pdf",  # pdf or xlsx
    status: Optional[str] = None,
    room: Optional[str] = None,
    commission: Optional[str] = None,  # JSON string with commission data
    user: dict = Depends(get_current_user)
):
    """Generate official documents according to technical specification"""
    import pandas as pd
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm, cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    import xlsxwriter
    import json
    
    # Parse commission data
    commission_data = {"members": [], "executor": {"position": "", "name": ""}}
    if commission:
        try:
            commission_data = json.loads(commission)
        except (json.JSONDecodeError, TypeError):
            pass
    
    # Build query
    query = {}
    if status and status != "all":
        query["status"] = status
    if room:
        query["room"] = {"$regex": room, "$options": "i"}
    
    objects = await db.objects.find(query, {"_id": 0}).sort("name", 1).to_list(10000)
    
    if not objects:
        raise HTTPException(status_code=404, detail="Нет объектов для экспорта")
    
    buffer = BytesIO()
    
    # Document titles and headers
    DOC_CONFIGS = {
        "photo_archive": {
            "title": "Общий фотоархив имущества",
            "appendix": "Приложение № 2\nк Техническому заданию",
            "headers": ["№ п/п", "Инвентаризационный номер АО «ЦУГИ»", "ФОТО"],
            "col_widths": [15*mm, 60*mm, 100*mm]
        },
        "catalog": {
            "title": "Каталог имущества, находящегося на объекте.",
            "appendix": "Приложение № 3\nк Техническому заданию",
            "headers": ["№ п/п", "Наименование объекта", "Характеристика/Описание", "Серийный номер",
                       "Инв. номер АО «ЦУГИ»", "Визуализация (фото)", "Кол-во", "Примечание", "План кабинета"],
            "col_widths": [12*mm, 35*mm, 35*mm, 25*mm, 25*mm, 25*mm, 15*mm, 25*mm, 25*mm]
        },
        "inventory_list": {
            "title": "Инвентаризационная ведомость.",
            "appendix": "Приложение № 4\nк Техническому заданию",
            "headers": ["№ п/п", "Инв. номер АО «ЦУГИ»", "Порядковый номер по спецификации",
                       "Предыдущий инв. номер", "Наименование инв. единицы", "Артикул",
                       "Год выпуска", "Паспорт, сертификат", "Тех. состояние", "Местонахождение"],
            "col_widths": [10*mm, 22*mm, 20*mm, 20*mm, 30*mm, 18*mm, 15*mm, 22*mm, 22*mm, 25*mm]
        },
        "specification_report": {
            "title": "Отчет по спецификации",
            "appendix": "Приложение № 5\nк Техническому заданию",
            "headers": ["№ п/п по спецификации", "Наименование инвентаризационной единицы",
                       "Инв. номер АО «ЦУГИ»", "Наличие инвентаризационной единицы"],
            "col_widths": [30*mm, 70*mm, 40*mm, 40*mm]
        }
    }
    
    config = DOC_CONFIGS.get(doc_type, DOC_CONFIGS["catalog"])
    
    if format == "pdf":
        # PDF Generation
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=15*mm,
            bottomMargin=20*mm
        )
        
        styles = getSampleStyleSheet()
        
        # Custom styles with Cyrillic font
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=14,
            alignment=1,  # Center
            spaceAfter=10*mm,
            fontName=CYRILLIC_FONT_BOLD
        )
        appendix_style = ParagraphStyle(
            'Appendix',
            parent=styles['Normal'],
            fontSize=10,
            alignment=2,  # Right
            spaceAfter=5*mm,
            fontName=CYRILLIC_FONT
        )
        header_style = ParagraphStyle(
            'TableHeader',
            parent=styles['Normal'],
            fontSize=8,
            alignment=1,
            fontName=CYRILLIC_FONT_BOLD
        )
        cell_style = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontSize=7,
            alignment=0,
            leading=9,
            fontName=CYRILLIC_FONT
        )
        signature_style = ParagraphStyle(
            'Signature',
            parent=styles['Normal'],
            fontSize=9,
            spaceBefore=5*mm,
            fontName=CYRILLIC_FONT
        )
        
        elements = []
        
        # Appendix header
        elements.append(Paragraph(config["appendix"].replace("\n", "<br/>"), appendix_style))
        elements.append(Spacer(1, 5*mm))
        
        # Title
        elements.append(Paragraph(config["title"], title_style))
        
        # Room info if filtered
        if room:
            elements.append(Paragraph(f"Кабинет № {room}", styles['Normal']))
            elements.append(Spacer(1, 5*mm))
        
        # Build table data
        table_data = [[Paragraph(h, header_style) for h in config["headers"]]]
        
        for idx, obj in enumerate(objects, 1):
            row = []
            
            if doc_type == "photo_archive":
                row = [
                    str(idx),
                    obj.get('inventory_number', obj.get('qr_code', '')),
                    ''  # Photo placeholder
                ]
            elif doc_type == "catalog":
                row = [
                    str(idx),
                    Paragraph(obj.get('name', '')[:50], cell_style),
                    Paragraph(obj.get('characteristics', obj.get('description', ''))[:80] if obj.get('characteristics') or obj.get('description') else '', cell_style),
                    obj.get('serial_number', ''),
                    obj.get('inventory_number', obj.get('qr_code', '')),
                    '',  # Photo
                    obj.get('quantity', '1'),
                    Paragraph(obj.get('notes', '')[:40] if obj.get('notes') else '', cell_style),
                    ''  # Plan
                ]
            elif doc_type == "inventory_list":
                row = [
                    str(idx),
                    obj.get('inventory_number', obj.get('qr_code', '')),
                    obj.get('external_id', ''),
                    '',  # Previous inv number
                    Paragraph(obj.get('name', '')[:40], cell_style),
                    '',  # Article
                    obj.get('year', ''),
                    '',  # Certificate
                    obj.get('condition', ''),
                    f"{obj.get('floor', '')}/{obj.get('room', '')}"
                ]
            elif doc_type == "specification_report":
                row = [
                    obj.get('external_id', str(idx)),
                    Paragraph(obj.get('name', ''), cell_style),
                    obj.get('inventory_number', obj.get('qr_code', '')),
                    'Да' if obj.get('status') == 'verified' else 'На проверке'
                ]
            
            # Add photo for photo_archive and catalog
            if doc_type in ["photo_archive", "catalog"] and obj.get('photos'):
                photo_col = 2 if doc_type == "photo_archive" else 5
                photo_path = PHOTOS_DIR / obj['photos'][0].split('/')[-1]
                if photo_path.exists():
                    try:
                        img = RLImage(str(photo_path), width=20*mm, height=20*mm)
                        row[photo_col] = img
                    except Exception:
                        row[photo_col] = '[Ошибка]'
            
            table_data.append(row)
        
        # Create table
        table = Table(table_data, colWidths=config["col_widths"], repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.Color(0.9, 0.9, 0.9)),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        elements.append(table)
        elements.append(Spacer(1, 15*mm))
        
        # Commission section
        commission_text = """
        <b>Рабочая инвентаризационная комиссия в составе:</b><br/>
        """
        for member in commission_data.get("members", []):
            if member.get("name") or member.get("position"):
                commission_text += f"{member.get('name', '_____________')}, {member.get('position', '_____________')}<br/>"
        
        if not commission_data.get("members"):
            commission_text += "ФИО, должность_______________________<br/>"
            commission_text += "ФИО, должность_______________________<br/>"
            commission_text += "ФИО, должность_______________________<br/>"
        
        elements.append(Paragraph(commission_text, signature_style))
        elements.append(Spacer(1, 10*mm))
        
        # Signatures section
        signature_section = """
        <b>Члены комиссии</b><br/><br/>
        ____________________           _________________  ______________________<br/>
        <font size="7">(должность)                              (подпись)                    (ФИО)</font><br/><br/>
        ____________________           _________________  ______________________<br/>
        <font size="7">(должность)                              (подпись)                    (ФИО)</font><br/><br/>
        ………<br/><br/>
        <b>Исполнитель:</b><br/><br/>
        """
        
        executor = commission_data.get("executor", {})
        if executor.get("name") or executor.get("position"):
            signature_section += f"{executor.get('position', '_______________')}                _________________       {executor.get('name', '_____________________')}<br/>"
        else:
            signature_section += "_______________                __________________       _____________________<br/>"
        
        signature_section += """
        <font size="7">(должность)                              (подпись)                    (ФИО)</font><br/><br/>
        МП.
        """
        
        elements.append(Paragraph(signature_section, signature_style))
        
        doc.build(elements)
        media_type = "application/pdf"
        filename = f"{doc_type}.pdf"
        
    else:
        # Excel Generation
        workbook = xlsxwriter.Workbook(buffer, {'in_memory': True})
        worksheet = workbook.add_worksheet('Документ')
        
        # Formats
        title_format = workbook.add_format({
            'bold': True,
            'font_size': 14,
            'align': 'center',
            'valign': 'vcenter'
        })
        header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#d9d9d9',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter',
            'text_wrap': True
        })
        cell_format = workbook.add_format({
            'border': 1,
            'align': 'left',
            'valign': 'top',
            'text_wrap': True
        })
        
        # Title
        worksheet.merge_range(0, 0, 0, len(config["headers"]) - 1, config["appendix"].replace("\n", " "), title_format)
        worksheet.merge_range(1, 0, 1, len(config["headers"]) - 1, config["title"], title_format)
        
        # Headers
        for col, header in enumerate(config["headers"]):
            worksheet.write(3, col, header, header_format)
        
        # Data
        for row_idx, obj in enumerate(objects, start=4):
            if doc_type == "photo_archive":
                worksheet.write(row_idx, 0, row_idx - 3, cell_format)
                worksheet.write(row_idx, 1, obj.get('inventory_number', obj.get('qr_code', '')), cell_format)
                worksheet.write(row_idx, 2, '[ФОТО]', cell_format)
            elif doc_type == "catalog":
                worksheet.write(row_idx, 0, row_idx - 3, cell_format)
                worksheet.write(row_idx, 1, obj.get('name', ''), cell_format)
                worksheet.write(row_idx, 2, obj.get('characteristics', obj.get('description', '')), cell_format)
                worksheet.write(row_idx, 3, obj.get('serial_number', ''), cell_format)
                worksheet.write(row_idx, 4, obj.get('inventory_number', obj.get('qr_code', '')), cell_format)
                worksheet.write(row_idx, 5, '[ФОТО]', cell_format)
                worksheet.write(row_idx, 6, obj.get('quantity', '1'), cell_format)
                worksheet.write(row_idx, 7, obj.get('notes', ''), cell_format)
                worksheet.write(row_idx, 8, '', cell_format)
            elif doc_type == "inventory_list":
                worksheet.write(row_idx, 0, row_idx - 3, cell_format)
                worksheet.write(row_idx, 1, obj.get('inventory_number', obj.get('qr_code', '')), cell_format)
                worksheet.write(row_idx, 2, obj.get('external_id', ''), cell_format)
                worksheet.write(row_idx, 3, '', cell_format)
                worksheet.write(row_idx, 4, obj.get('name', ''), cell_format)
                worksheet.write(row_idx, 5, '', cell_format)
                worksheet.write(row_idx, 6, obj.get('year', ''), cell_format)
                worksheet.write(row_idx, 7, '', cell_format)
                worksheet.write(row_idx, 8, obj.get('condition', ''), cell_format)
                worksheet.write(row_idx, 9, f"{obj.get('floor', '')}/{obj.get('room', '')}", cell_format)
            elif doc_type == "specification_report":
                worksheet.write(row_idx, 0, obj.get('external_id', str(row_idx - 3)), cell_format)
                worksheet.write(row_idx, 1, obj.get('name', ''), cell_format)
                worksheet.write(row_idx, 2, obj.get('inventory_number', obj.get('qr_code', '')), cell_format)
                worksheet.write(row_idx, 3, 'Да' if obj.get('status') == 'verified' else 'На проверке', cell_format)
        
        # Signature rows at the end
        sig_row = len(objects) + 6
        worksheet.write(sig_row, 0, "Члены комиссии:", cell_format)
        worksheet.write(sig_row + 2, 0, "Исполнитель:", cell_format)
        worksheet.write(sig_row + 4, 0, "МП.", cell_format)
        
        workbook.close()
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{doc_type}.xlsx"
    
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
    
    # Batch fetch all users to avoid N+1 query pattern
    user_ids = [s["_id"] for s in stats if s["_id"]]
    users_cursor = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1})
    users_list = await users_cursor.to_list(100)
    users_dict = {u["id"]: u["name"] for u in users_list}
    
    # Enrich with user names
    result = []
    for s in stats:
        if s["_id"]:
            result.append({
                "user_id": s["_id"],
                "user_name": users_dict.get(s["_id"], "Неизвестно"),
                **{k: v for k, v in s.items() if k != "_id"}
            })
    
    return result

# ==================== AUDIT LOG ====================

def clean_mongo_ids(obj):
    """Recursively remove _id fields from nested dicts"""
    if isinstance(obj, dict):
        return {k: clean_mongo_ids(v) for k, v in obj.items() if k != "_id"}
    elif isinstance(obj, list):
        return [clean_mongo_ids(item) for item in obj]
    else:
        return obj

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
    
    cursor = db.audit_log.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    logs_list = await cursor.to_list(limit)
    
    # Batch fetch all users to avoid N+1 query
    user_ids = list(set(log.get("user_id") for log in logs_list if log.get("user_id")))
    users_cursor = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1})
    users_list = await users_cursor.to_list(len(user_ids) if user_ids else 1)
    users_dict = {u["id"]: u["name"] for u in users_list}
    
    logs = []
    for log in logs_list:
        log_dict = clean_mongo_ids(log)
        log_dict["user_name"] = users_dict.get(log_dict.get("user_id"), "Неизвестно")
        logs.append(log_dict)
    
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
    sort: str = "date_desc",  # date_desc, date_asc, name_asc, floor_asc, user_asc
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
    
    # Sort options
    sort_options = {
        "date_desc": [("updated_at", -1)],
        "date_asc": [("updated_at", 1)],
        "name_asc": [("name", 1)],
        "floor_asc": [("floor", 1), ("room", 1)],
        "user_asc": [("assigned_to", 1), ("updated_at", -1)]
    }
    sort_spec = sort_options.get(sort, [("updated_at", -1)])
    
    objects = await db.objects.find(query, {"_id": 0}).sort(sort_spec).skip(skip).limit(limit).to_list(limit)
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
