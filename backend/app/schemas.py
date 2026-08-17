from pydantic import BaseModel, Field
from typing import Optional


class WardOut(BaseModel):
    id: int
    name: str
    lat: float
    lng: float
    rainfall_mm: float
    river_level_pct: float
    elevation_m: float
    soil_saturation_pct: float
    risk_score: float
    risk_tier: str
    updated_at: float

    class Config:
        from_attributes = True


class ReportIn(BaseModel):
    category: str
    description: str = Field(min_length=3, max_length=800)
    lat: float
    lng: float
    channel: str = "app"          # app | sms | whatsapp
    phone: str = ""               # sender phone for sms/whatsapp
    image_url: str = ""           # /uploads/... photo evidence, from POST /api/reports/upload


class ReportOut(BaseModel):
    id: int
    ward_id: Optional[int]
    category: str
    description: str
    lat: float
    lng: float
    channel: str
    phone: str = ""
    image_url: str = ""
    status: str
    corroboration_count: int
    ai_note: str
    created_at: float

    class Config:
        from_attributes = True


class ResourceOut(BaseModel):
    id: int
    name: str
    department: str
    lat: float
    lng: float
    capacity_total: int
    capacity_used: int
    status: str

    class Config:
        from_attributes = True


class AllocationOut(BaseModel):
    ward_id: int
    resource_id: int
    ward_name: str
    resource_name: str
    department: str
    distance_km: float
    reason: str


class DispatchIn(BaseModel):
    ward_id: int
    note: str = ""


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    department: str
    role: str

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SmsSendIn(BaseModel):
    channel: str = "sms"              # sms | whatsapp
    message: str = Field(min_length=3, max_length=600)
    ward_ids: list[int] = []
    phone: str = ""                   # optional single recipient; else broadcast to wards


class AlertOut(BaseModel):
    id: int
    channel: str
    phone: str
    ward_id: Optional[int]
    message: str
    status: str
    created_at: float

    class Config:
        from_attributes = True
