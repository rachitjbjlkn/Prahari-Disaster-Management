"""
AI Verification Layer (Section 5/6 of the project doc): deduplicate citizen
reports, flag likely-false ones, cluster by location.

Two stages, both real:
1. Geo + text clustering (always runs, needs no API key) — this is what
   makes verification survive network loss, consistent with the doc's
   offline-first principle. In production this becomes a PostGIS
   ST_DWithin query instead of the haversine loop below.
2. Optional LLM plausibility pass via Groq's free tier, called *server-side*
   here (unlike a browser demo) so the API key never reaches the client —
   this is the architecture the doc's tech-stack table implies by putting
   "LLM-based text classification" behind the FastAPI coordination backend.
"""
import os
import math
import re
import httpx
from dotenv import load_dotenv

load_dotenv()

CLUSTER_RADIUS_KM = 0.6
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def groq_api_key():
    """Read lazily so an API key added to .env works without code changes."""
    return os.getenv("GROQ_API_KEY", "").strip()


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _keywords(text):
    return set(w for w in re.split(r"\W+", text.lower()) if len(w) > 3)


def keyword_overlap(a, b):
    wa, wb = _keywords(a), _keywords(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / min(len(wa), len(wb))


def local_cluster_check(new_report, existing_reports):
    """Returns corroboration count from nearby same-category reports."""
    corroboration = 0
    for r in existing_reports:
        if r.category != new_report["category"]:
            continue
        d = haversine_km(r.lat, r.lng, new_report["lat"], new_report["lng"])
        sim = keyword_overlap(r.description, new_report["description"])
        if d <= CLUSTER_RADIUS_KM and (sim > 0.15 or d < 0.25):
            corroboration += 1
    return corroboration


async def llm_plausibility_check(category: str, description: str):
    """Optional Groq call. Returns dict or None if no key configured."""
    api_key = groq_api_key()
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": (
                            "You are a disaster-report triage assistant. Given a short citizen "
                            "ground report, respond ONLY with compact JSON: "
                            '{"plausible": true|false, "reason": "<=12 words"}. '
                            "Judge internal plausibility/coherence for a flood or emergency "
                            "context, not facts you cannot verify."
                        )},
                        {"role": "user", "content": f"Category: {category}\nReport: {description}"},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 60,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"].strip()
            text = text.replace("```json", "").replace("```", "")
            import json
            return json.loads(text)
    except Exception as e:
        return {"error": True, "reason": f"LLM check skipped: {e}"}


async def verify_report(new_report: dict, existing_reports: list):
    corroboration = local_cluster_check(new_report, existing_reports)
    ai_result = await llm_plausibility_check(new_report["category"], new_report["description"])

    status = "pending"
    ai_note = "local clustering only (no GROQ_API_KEY set)"

    if ai_result and not ai_result.get("error"):
        plausible = ai_result.get("plausible", True)
        ai_note = f"AI: {'plausible' if plausible else 'flagged'} — {ai_result.get('reason', '')}"
        if not plausible and corroboration == 0:
            status = "flagged"
    elif ai_result and ai_result.get("error"):
        ai_note = ai_result["reason"]

    if status != "flagged":
        status = "verified" if corroboration >= 1 else "pending"

    return {"status": status, "corroboration_count": corroboration, "ai_note": ai_note}
