"""
Offline-first fallback channel (README gap #1): inbound SMS/WhatsApp citizen
reports via a carrier webhook, plus an outbound broadcast API.

Inbound wire formats accepted (real carrier webhooks):
  Twilio  : POST From=<phone>&Body=<text>
  MSG91   : POST sender=<phone>&text=<message>
  WhatsApp: Meta Graph API nested JSON (entry[].changes[].value.messages[])

Any carrier can be dropped in front of /webhook by translating to these keys.
Outbound delivery goes through `app/sms_gateway.py`: real Twilio/MSG91 calls
when credentials are configured, simulated logging otherwise.
"""
import os
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..routers.reports import ingest_report
from ..websocket_manager import manager
from ..sms_gateway import deliver

router = APIRouter(prefix="/api/sms", tags=["offline-fallback"])

DEFAULT_LAT, DEFAULT_LNG = 26.1450, 91.7600  # Guwahati metro centroid fallback

CATEGORY_KEYWORDS = {
    "Blocked road": ["road", "blocked", "roadblock", "route"],
    "Trapped people": ["trapped", "stuck", "stranded", "marooned", "help us", "sos"],
    "Breached embankment": ["embankment", "breach", "bund", "river bank"],
    "Structural damage": ["collapse", "collapsed", "damage", "crack", "wall", "roof", "house fell"],
    "Flooding": ["water", "flood", "flooded", "rising", "inundat", "waist deep"],
}


def _pick_category(text: str) -> str:
    lower = text.lower()
    for category, keys in CATEGORY_KEYWORDS.items():
        if any(k in lower for k in keys):
            return category
    return "Flooding"


def _strip_command(text: str) -> str:
    """Drop leading helper keywords (REPORT/ALERT/HELP) so the description stays clean."""
    return re.sub(r"^\s*(report|alert|help|sms|flood)\s*[:\-\s]+", "", text, flags=re.IGNORECASE).strip()


def _geo_from_text(text: str, wards: list) -> tuple[float, float, Optional[int]]:
    """Best-effort location from free text: match a ward name, else city centroid."""
    lower = text.lower()
    for w in wards:
        if w.name.lower() in lower:
            return w.lat, w.lng, w.id
    return DEFAULT_LAT, DEFAULT_LNG, None


def _extract_whatsapp(body: dict) -> Optional[dict]:
    """Parse Meta Graph API webhook shape -> {From, Body, channel} if present."""
    try:
        entries = body.get("entry", [])
        for entry in entries:
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []):
                    text = (msg.get("text") or {}).get("body", "") or msg.get("body", "")
                    return {"From": msg.get("from", ""), "Body": text, "channel": "whatsapp"}
    except Exception:
        pass
    return None


@router.get("/webhook")
def webhook_verify(
    hub_mode: str = "",
    hub_challenge: str = "",
    hub_verify_token: str = "",
):
    """Meta WhatsApp webhook subscription verification (GET challenge)."""
    expected = os.getenv("WHATSAPP_VERIFY_TOKEN", "prahari-verify")
    if hub_mode == "subscribe" and hub_verify_token == expected:
        return int(hub_challenge) if hub_challenge.isdigit() else hub_challenge
    return {"ok": False, "error": "verification token mismatch"}


@router.post("/webhook")
async def sms_webhook(request: Request, db: Session = Depends(get_db)):
    """Inbound SMS or WhatsApp report -> same verification pipeline as the app."""
    try:
        data = await request.json()
    except Exception:
        form = await request.form()
        data = dict(form)

    wa = _extract_whatsapp(data)
    if wa:
        data = wa

    sender = str(data.get("From") or data.get("from") or data.get("mobile") or data.get("phone") or "")
    text = str(data.get("Body") or data.get("body") or data.get("message") or data.get("text") or data.get("msg") or "").strip()
    channel = str(data.get("channel") or "sms").lower()
    if not text:
        return {"ok": False, "error": "empty message body"}

    wards = db.query(models.Ward).all()
    category = _pick_category(text)
    description = _strip_command(text)
    lat, lng, _ = _geo_from_text(description, wards)

    report = await ingest_report(db, {
        "category": category,
        "description": description,
        "lat": lat,
        "lng": lng,
        "channel": channel,
        "phone": sender,
    })
    return {"ok": True, "report_id": report.id, "category": report.category, "status": report.status}


@router.post("/send", response_model=list[schemas.AlertOut])
async def send_alert(
    payload: schemas.SmsSendIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """
    Broadcast an outbound alert. With `phone` set it targets one number;
    otherwise it fans out to the selected wards (default: all high/medium).
    Simulated gateway: records status="sent" and pushes to dashboards live.
    Department operators are restricted to SMS only; admin/command can use any channel.
    """
    is_full = user.role == "admin" or user.department.value == "command"
    if not is_full and payload.channel != "sms":
        raise HTTPException(status_code=403, detail="Department operators can only broadcast via SMS")

    wards = db.query(models.Ward).all()
    if payload.ward_ids:
        targets = [w for w in wards if w.id in payload.ward_ids]
    else:
        targets = [w for w in wards if w.risk_tier in (models.RiskTier.high, models.RiskTier.medium)]
    if not targets:
        return []

    alerts = []
    for ward in targets:
        try:
            message = payload.message.format(ward=ward.name)
        except (KeyError, IndexError):
            message = payload.message
        if payload.phone:
            recipients = [payload.phone]
        elif payload.channel == "telegram":
            from ..sms_gateway import telegram_chat_ids
            recipients = await telegram_chat_ids() or ["BROADCAST"]
        else:
            recipients = ["BROADCAST"]
        for phone in recipients:
            # Real delivery when a gateway is configured and a number is given;
            # otherwise simulate (status="simulated"/"sent").
            status = "sent"
            if phone != "BROADCAST":
                status = await deliver(phone, message, channel=payload.channel)
            alert = models.OutboundAlert(
                channel=payload.channel,
                phone=phone,
                ward_id=ward.id,
                message=message,
                status=status,
            )
            db.add(alert)
            alerts.append(alert)

    db.commit()
    for a in alerts:
        db.refresh(a)

    await manager.broadcast("alert_sent", {
        "channel": payload.channel,
        "count": len(alerts),
        "message": payload.message,
    })
    return alerts


@router.get("/status")
def gateway_status():
    """Which outbound gateway is configured (for the Comms UI)."""
    from ..sms_gateway import last_error, telegram_token
    if telegram_token():
        return {"gateway": "telegram", "simulated": False, "error": last_error}
    if os.getenv("TWILIO_ACCOUNT_SID"):
        return {"gateway": "twilio", "simulated": False, "error": last_error}
    if os.getenv("MSG91_AUTH_KEY"):
        return {"gateway": "msg91", "simulated": False, "error": last_error}
    return {"gateway": None, "simulated": True, "error": last_error}


@router.get("/telegram/latest")
async def telegram_latest():
    """One-click setup: return the chat_id of whoever last messaged the bot."""
    from ..sms_gateway import latest_telegram_chat_id
    return await latest_telegram_chat_id()


@router.get("/alerts", response_model=list[schemas.AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    alerts = db.query(models.OutboundAlert).order_by(models.OutboundAlert.created_at.desc()).limit(50).all()
    if user.role == "admin" or user.department.value == "command":
        return alerts
    return alerts
