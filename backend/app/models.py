"""
ORM models. In production, `lat`/`lng` pairs become a single PostGIS
`Geometry('POINT', srid=4326)` column (via GeoAlchemy2) so the DB can do
real spatial queries (ST_DWithin etc.) instead of the haversine math this
demo does in Python — see verification.py for where that swap plugs in.
"""
import enum
import time
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean, Text, LargeBinary
from sqlalchemy.orm import relationship
from .database import Base


class Department(str, enum.Enum):
    command = "command"
    fire = "fire"
    police = "police"
    health = "health"
    ndrf = "ndrf"
    municipal = "municipal"


class RiskTier(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class ReportStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    flagged = "flagged"
    resolved = "resolved"


class Ward(Base):
    __tablename__ = "wards"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    rainfall_mm = Column(Float, default=0)
    river_level_pct = Column(Float, default=0)
    elevation_m = Column(Float, default=0)
    soil_saturation_pct = Column(Float, default=0)
    risk_score = Column(Float, default=0)
    risk_tier = Column(Enum(RiskTier), default=RiskTier.low)
    updated_at = Column(Float, default=time.time)

    reports = relationship("CitizenReport", back_populates="ward")


class CitizenReport(Base):
    __tablename__ = "citizen_reports"
    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=True)
    category = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    channel = Column(String, default="app")  # app | sms | whatsapp
    phone = Column(String, default="")       # sender phone when channel is sms/whatsapp
    image_url = Column(String, default="")   # /uploads/... photo evidence served to the web app
    image_data = Column(LargeBinary, nullable=True)  # same bytes, BLOB so it's viewable in the DB
    status = Column(Enum(ReportStatus), default=ReportStatus.pending)
    corroboration_count = Column(Integer, default=0)
    ai_note = Column(String, default="")
    created_at = Column(Float, default=time.time)

    ward = relationship("Ward", back_populates="reports")


class Resource(Base):
    __tablename__ = "resources"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    department = Column(Enum(Department), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    capacity_total = Column(Integer, default=100)
    capacity_used = Column(Integer, default=0)
    status = Column(String, default="available")  # available | dispatched | full


class Allocation(Base):
    __tablename__ = "allocations"
    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"))
    resource_id = Column(Integer, ForeignKey("resources.id"))
    distance_km = Column(Float)
    reason = Column(String)
    created_at = Column(Float, default=time.time)
    accepted = Column(Boolean, default=False)


class User(Base):
    """Authenticated dashboard operator (README gap: per-department login)."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, default="")
    password_hash = Column(String, nullable=False)
    department = Column(Enum(Department), nullable=False)
    role = Column(String, default="operator")  # operator | admin
    created_at = Column(Float, default=time.time)


class OutboundAlert(Base):
    """Outbound SMS/WhatsApp broadcast log (offline-first fallback channel)."""
    __tablename__ = "outbound_alerts"
    id = Column(Integer, primary_key=True, index=True)
    channel = Column(String, default="sms")  # sms | whatsapp
    phone = Column(String, default="")
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String, default="queued")  # queued | sent | failed
    created_at = Column(Float, default=time.time)


# ── Role-Based Access Control ──────────────────────────────────────────────

# Which departments can see / act on which report categories.
CATEGORY_DEPARTMENTS: dict[str, list[str]] = {
    "Blocked road":       ["police", "municipal"],
    "Breached embankment": ["fire", "ndrf", "municipal"],
    "Trapped people":     ["police", "health", "ndrf"],
    "Flooding":           ["fire", "health", "ndrf", "municipal"],
    "Structural damage":  ["fire", "municipal"],
}


def category_allowed_for(category: str, dept: str) -> bool:
    """Return True if *dept* is authorised to handle reports of *category*."""
    allowed = CATEGORY_DEPARTMENTS.get(category)
    if allowed is None:
        return False
    return dept in allowed


def user_can_access_report(user: "User", report: "CitizenReport") -> bool:
    """Admin / command operators see everything; dept operators see only
    categories mapped to their department."""
    if user.role == "admin" or user.department.value == "command":
        return True
    return category_allowed_for(report.category, user.department.value)


def user_can_dispatch_resource(user: "User", resource: Resource) -> bool:
    """Operators may only dispatch resources belonging to their own dept."""
    if user.role == "admin" or user.department.value == "command":
        return True
    res_dept = resource.department.value if hasattr(resource.department, "value") else resource.department
    return res_dept == user.department.value
