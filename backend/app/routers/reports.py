import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..verification import verify_report, haversine_km
from ..websocket_manager import manager

router = APIRouter(prefix="/api/reports", tags=["citizen-reporting"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB


def _upload_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")


def _image_blob(image_url: str) -> bytes:
    """Read the uploaded file's bytes back out of disk so they can be stored as
    a BLOB in the row (image_data), keeping the DB self-contained."""
    if not image_url or not image_url.startswith("/uploads/"):
        return None
    path = os.path.join(_upload_dir(), os.path.basename(image_url))
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """Store a report photo and return its /uploads/... URL (attached to a report later)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported type '{file.content_type}' — use jpeg/png/webp/gif")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large — max 8 MB")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}[file.content_type]
    filename = f"{uuid.uuid4().hex}.{ext}"
    upload_dir = _upload_dir()
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, filename), "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{filename}", "size": len(data)}


@router.get("", response_model=list[schemas.ReportOut])
def list_reports(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    reports = db.query(models.CitizenReport).order_by(models.CitizenReport.created_at.desc()).all()
    if user.role == "admin" or user.department.value == "command":
        return reports
    return [r for r in reports if models.user_can_access_report(user, r)]


async def ingest_report(db: Session, payload: dict) -> models.CitizenReport:
    """
    Shared ingestion pipeline: AI verification -> nearest-ward attach -> save.
    Used by the in-app submit endpoint and the SMS/WhatsApp webhooks so every
    channel goes through the exact same verification (Section 5 consistency).
    """
    existing = db.query(models.CitizenReport).all()
    result = await verify_report(payload, existing)

    nearest_ward, nearest_d = None, 999
    for w in db.query(models.Ward).all():
        d = haversine_km(w.lat, w.lng, payload["lat"], payload["lng"])
        if d < nearest_d:
            nearest_ward, nearest_d = w, d
    ward_id = nearest_ward.id if nearest_ward and nearest_d <= 3 else None

    report = models.CitizenReport(
        ward_id=ward_id,
        category=payload["category"],
        description=payload["description"],
        lat=payload["lat"],
        lng=payload["lng"],
        channel=payload.get("channel", "app"),
        phone=payload.get("phone", ""),
        image_url=payload.get("image_url", ""),
        image_data=_image_blob(payload.get("image_url", "")),
        status=result["status"],
        corroboration_count=result["corroboration_count"],
        ai_note=result["ai_note"],
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    await manager.broadcast("new_report", {
        "id": report.id, "category": report.category, "status": report.status,
        "lat": report.lat, "lng": report.lng, "description": report.description,
        "channel": report.channel, "image_url": report.image_url,
    })
    return report


@router.post("", response_model=schemas.ReportOut)
async def submit_report(payload: schemas.ReportIn, db: Session = Depends(get_db)):
    return await ingest_report(db, payload.model_dump())


@router.patch("/{report_id}/status", response_model=schemas.ReportOut)
async def set_report_status(
    report_id: int,
    status: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Control-room workflow: move a report through pending -> verified/flagged -> resolved."""
    if status not in {s.value for s in models.ReportStatus}:
        raise ValueError(f"Invalid status '{status}' — expected one of {[s.value for s in models.ReportStatus]}")
    report = db.query(models.CitizenReport).filter(models.CitizenReport.id == report_id).first()
    if not report:
        return None
    if not models.user_can_access_report(user, report):
        raise HTTPException(status_code=403, detail="You cannot modify reports outside your department")
    report.status = models.ReportStatus(status)
    db.commit()
    db.refresh(report)
    await manager.broadcast("report_status", {
        "id": report.id, "status": report.status.value if hasattr(report.status, "value") else report.status,
    })
    return report
