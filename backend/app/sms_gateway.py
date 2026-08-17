"""
Outbound SMS/WhatsApp/Telegram delivery layer.

Tries, in order, whichever gateway has credentials configured in .env:
  1. Twilio  (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM) — REST API, no SDK needed.
  2. MSG91   (MSG91_AUTH_KEY + MSG91_SENDER_ID) — v2 sendhttp endpoint (India-friendly).
  3. Telegram (TELEGRAM_BOT_TOKEN) — free, no carrier/DLT rules; recipient is a chat ID.
  4. Simulate — logs status="sent" without hitting a carrier (demo default).

WhatsApp delivery via a carrier still needs a WhatsApp Business API account
(Twilio/Meta), so this layer marks WhatsApp messages as "queued" unless a
gateway is wired; SMS/Telegram are the primary offline channels.
"""
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

last_error = None  # latest delivery error, surfaced by GET /api/sms/status

TG_API = "https://api.telegram.org/bot{token}/"


def telegram_token():
    return os.getenv("TELEGRAM_BOT_TOKEN", "").strip()


def _normalize_phone(phone: str) -> str:
    p = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not p:
        return ""
    return p if p.startswith("+") else "+" + p


async def _send_twilio(phone: str, message: str) -> str:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    sender = os.getenv("TWILIO_FROM", "")
    if not (sid and token and sender):
        raise RuntimeError("Twilio credentials incomplete (SID/token/from)")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            auth=(sid, token),
            data={"From": sender, "To": _normalize_phone(phone), "Body": message},
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Twilio returned {resp.status_code}: {resp.text[:200]}")
        return resp.json().get("status", "queued")


async def _send_msg91(phone: str, message: str) -> str:
    authkey = os.getenv("MSG91_AUTH_KEY", "")
    sender = os.getenv("MSG91_SENDER_ID", "")
    if not (authkey and sender):
        raise RuntimeError("MSG91 credentials incomplete (auth key / sender id)")
    phone = _normalize_phone(phone).lstrip("+")
    params = {
        "authkey": authkey,
        "mobiles": phone,
        "message": message,
        "sender": sender,
        "route": "4",  # transactional route
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get("https://api.msg91.com/api/sendhttp.php", params=params)
        body = resp.text
        # MSG91 replies with "message" (type=success) or "error" / numeric codes
        if resp.status_code != 200 or body.strip().lower().startswith("error"):
            raise RuntimeError(f"MSG91 returned {resp.status_code}: {body[:200]}")
        return "sent"


async def _send_telegram(chat_id: str, message: str) -> str:
    token = telegram_token()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not configured")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{TG_API.format(token=token)}sendMessage",
            json={"chat_id": chat_id.strip(), "text": message, "disable_web_page_preview": True},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Telegram returned {resp.status_code}: {resp.text[:200]}")
        return resp.json().get("result", {}).get("message_id", "sent") if resp.json().get("ok") else "failed"


async def latest_telegram_chat_id() -> dict:
    """Return the chat_id of the most recent message sent to the bot (for one-click setup)."""
    token = telegram_token()
    if not token:
        return {"error": "TELEGRAM_BOT_TOKEN not configured"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{TG_API.format(token=token)}getUpdates", params={"limit": 1})
        if resp.status_code != 200:
            return {"error": f"Telegram returned {resp.status_code}: {resp.text[:200]}"}
        data = resp.json().get("result", [])
        if not data:
            return {"error": "No messages yet — open your bot in Telegram and send it a message first"}
        last = data[-1]
        chat = last.get("message", {}).get("chat", {})
        return {"chat_id": chat.get("id"), "name": chat.get("first_name") or chat.get("username") or ""}


async def telegram_chat_ids() -> list:
    """Subscribed chat IDs for Telegram broadcast: TELEGRAM_CHAT_IDS env
    (comma-separated) or the most recent person who messaged the bot."""
    ids = [i.strip() for i in os.getenv("TELEGRAM_CHAT_IDS", "").split(",") if i.strip()]
    if ids:
        return ids
    latest = await latest_telegram_chat_id()
    cid = latest.get("chat_id")
    return [str(cid)] if cid is not None else []


async def deliver(phone: str, message: str, channel: str = "sms") -> str:
    """
    Send a real message if a gateway is configured; otherwise simulate.
    Returns one of: queued | sent | simulated | failed.
    """
    global last_error
    if channel == "whatsapp":
        return "queued"  # WhatsApp needs a Business API account to send
    if channel == "telegram":
        if not phone.strip():
            last_error = "empty telegram chat id"
            return "failed"
        try:
            return await _send_telegram(phone, message)
        except Exception as e:
            last_error = str(e)
            print(f"[sms_gateway] telegram delivery failed: {e}")
            return "failed"
    if not _normalize_phone(phone):
        last_error = "empty recipient phone"
        return "failed"
    try:
        if os.getenv("TWILIO_ACCOUNT_SID"):
            return await _send_twilio(phone, message)
        if os.getenv("MSG91_AUTH_KEY"):
            return await _send_msg91(phone, message)
        return "simulated"
    except Exception as e:
        last_error = str(e)
        print(f"[sms_gateway] delivery failed: {e}")
        return "failed"
