# PRAHARI — Full-Stack Reference Implementation

This is a real, running implementation of the architecture in your project document — not a single-file mockup. It's split into two services exactly as your tech-stack table specifies:

```
prahari-full/
├── backend/     FastAPI + SQLAlchemy + scikit-learn (Section 5's "Coordination Backend" + "Hazard Prediction")
└── frontend/    React + react-leaflet + recharts (Section 5's "Dashboard (Control Room)")
```

## What's real here (not simulated)

- **A trained ML model.** `backend/app/ml/risk_model.py` trains a genuine `RandomForestRegressor` (scikit-learn, per your tech stack) on synthetic-but-physically-reasonable hazard data and serves real predictions through `/api/wards`. Not a hardcoded formula.
- **A real database.** SQLAlchemy models for wards, citizen reports, resources, and allocations, running on SQLite for zero-setup local dev — written so the swap to PostgreSQL+PostGIS is a one-line `DATABASE_URL` change (see `.env.example`).
- **A real verification pipeline.** `backend/app/verification.py` does geo/text clustering (haversine distance + keyword overlap) on every submitted report, and optionally calls Groq's free LLM API server-side for a plausibility check — the key never touches the browser, unlike a client-side demo.
- **Real-time sync.** A WebSocket endpoint (`/ws`) pushes new reports, dispatch decisions, and outbound alerts to every connected dashboard instantly, matching the "REST + WebSockets" line in your tech stack.
- **Real per-department auth.** Every dashboard user signs in (PBKDF2-hashed passwords + signed expiring tokens, stdlib only). Department accounts are access-controlled, and the department switcher locks to your role after login.
- **Offline-first SMS/WhatsApp fallback.** A carrier webhook (`POST /api/sms/webhook`) ingests SMS/WhatsApp citizen reports in Twilio, MSG91, and Meta Graph API formats through the *same* AI verification pipeline as the app — plus an outbound broadcast API that fans alerts out to at-risk wards and logs them.
- **A distinct, professional UI.** Multi-page React app (Command Center / Hazard Map / Citizen Reports / Resources / Comms) with its own design system — not a generic AI-template look. Department call-sign chips (Fire/Police/Health/NDRF/Municipal) run through the whole UI as the visual language for "shared cross-department visibility," which is the actual thesis of your project.

## Run it

**Backend:**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python3 seed.py          # creates the DB, trains the model, loads sample wards/resources
uvicorn app.main:app --reload --port 8000
```
Backend now live at `http://localhost:8000`. Interactive API docs at `http://localhost:8000/docs` (FastAPI gives you this for free — useful to show judges the live schema).

**Frontend** (separate terminal):
```bash
cd frontend
npm install
npm run dev
```
Frontend live at `http://localhost:5173`, already wired to talk to the backend on port 8000.

**Demo logins** (seeded automatically on first backend boot — see `backend/app/routers/auth.py`):

| Username | Password | Department |
|---|---|---|
| `admin` | `admin123` | Command Center (full access) |
| `command` | `command123` | Command Center |
| `fire` | `fire123` | Fire |
| `police` | `police123` | Police |
| `health` | `health123` | Health |
| `ndrf` | `ndrf123` | NDRF/SDRF |
| `municipal` | `municipal123` | Municipal |

**Try the offline fallback** — on the Comms page use *Inbound Webhook Simulator* (SMS/WhatsApp), then *Broadcast Alert* to fan a warning out to at-risk wards and watch it land in the Outbound Log and live ticker.

Both were built and smoke-tested end-to-end while preparing this: seeded database → live model predictions → report submission with verification → CORS-checked fetch from the frontend origin → clean production build (`npm run build`, zero errors).

## Optional: turn on real LLM verification
1. Free key at `console.groq.com` → API Keys.
2. `cp backend/.env.example backend/.env` and paste the key into `GROQ_API_KEY`.
3. Restart the backend. New reports now get an LLM plausibility pass in addition to the geo/text clustering, which runs regardless of whether a key is set.

(Correction from earlier in this conversation: **Groq** — the free fast-inference API — not **Grok**, xAI's paid chatbot. Easy mix-up, but Groq is what's wired in and what hackathon teams typically mean.)

## Mapping to your project document

| Doc section | Where it lives |
|---|---|
| Predictive hazard intelligence (LSTM/RF, scikit-learn) | `backend/app/ml/risk_model.py` — real RandomForest; LSTM upgrade path noted in the file's docstring once you have real IMD/CWC time-series data |
| AI-verified citizen reporting | `backend/app/verification.py` + `frontend/src/pages/CitizenReports.jsx` |
| Unified resource coordination | `backend/app/routers/resources.py` (allocation matching + confirmed dispatch) + `frontend/src/pages/Resources.jsx` |
| Coordination Backend (FastAPI, REST + WebSockets) | `backend/app/main.py`, `backend/app/websocket_manager.py` |
| Database (PostgreSQL + PostGIS) | `backend/app/models.py` + `database.py` — SQLite now, PostGIS swap documented inline |
| Dashboard (Control Room) | `frontend/` — full React app |
| Offline-first / SMS fallback | `backend/app/routers/sms.py` + `frontend/src/pages/Comms.jsx` — Twilio/MSG91/Meta webhooks in, broadcast out, same verification pipeline |
| Secure login (per-department auth) | `backend/app/routers/auth.py` + `backend/app/security.py` + `frontend/src/pages/Login.jsx` |

## Honest gaps (say these out loud to judges — it reads as more credible than pretending it's finished)

1. **Auth is demo-grade.** Login works with real hashed passwords and signed, expiring tokens, but it's seeded demo accounts (see `backend/app/routers/auth.py`). Production needs OAuth2/OIDC with your org's identity provider and per-department authorization policies.
2. **SMS delivery needs gateway credentials.** Inbound webhooks are real carrier formats (Twilio/MSG91/Meta), and outbound delivery is wired to real Twilio/MSG91 APIs via `backend/app/sms_gateway.py` — but it falls back to *simulated* logging until you drop credentials into `backend/.env`. WhatsApp outbound additionally requires a WhatsApp Business API account.
3. **The risk model trains on synthetic data.** It's a genuine trained model with real non-linear structure, but it hasn't seen real IMD/CWC data. That's expected for a hackathon MVP — say so plainly rather than implying it's production-calibrated.
4. **Deployment hardening** — CORS is `*`, no rate limiting on the webhook, no DB migration tool (a tiny `ALTER TABLE` auto-migration handles schema drift for the demo). All fine for a demo, non-negotiable before production.

## Tested versions
Python 3.12, Node 22, FastAPI 0.115, scikit-learn 1.5, React 18, Vite 5.
