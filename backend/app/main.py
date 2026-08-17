from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .database import Base, engine, SessionLocal
from .routers import wards, reports, resources, dashboard, auth, sms
from .websocket_manager import manager

Base.metadata.create_all(bind=engine)


def _ensure_columns():
    """Lightweight migration: add columns added after the DB was first created.
    SQLite's ALTER TABLE cannot be wrapped in IF NOT EXISTS, so check PRAGMA first."""
    from sqlalchemy import text

    needed = {
        "citizen_reports": {
            "phone": "VARCHAR DEFAULT ''",
            "image_url": "VARCHAR DEFAULT ''",
            "image_data": "BLOB",
        },
        "users": {
            "role": "VARCHAR DEFAULT 'operator'",
        },
    }
    with engine.begin() as conn:
        for table, cols in needed.items():
            existing = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
            for col, ddl in cols.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))


_ensure_columns()

# Seed per-department login accounts on first boot.
auth.ensure_default_users(SessionLocal())

app = FastAPI(
    title="PRAHARI Coordination API",
    description="Predictive Public Resource & Hazard Alert Response Intelligence — backend service",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(wards.router)
app.include_router(reports.router)
app.include_router(resources.router)
app.include_router(dashboard.router)
app.include_router(auth.router)
app.include_router(sms.router)

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve built React frontend (production)
_cwd = os.getcwd()
_backend_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/app

# Try all possible locations for the built frontend
STATIC_DIR = None
for candidate in [
    os.path.join(_backend_dir, "..", "static"),
    os.path.join(_backend_dir, "..", "..", "frontend", "dist"),
    os.path.join(_cwd, "static"),
    os.path.join(_cwd, "..", "frontend", "dist"),
    "/opt/render/project/src/backend/static",
    "/opt/render/project/src/frontend/dist",
]:
    candidate = os.path.normpath(candidate)
    if os.path.isdir(candidate):
        STATIC_DIR = candidate
        break

# If still not found, try to copy from frontend/dist to backend/static
if not STATIC_DIR:
    import shutil
    src = os.path.normpath(os.path.join(_backend_dir, "..", "..", "frontend", "dist"))
    dst = os.path.normpath(os.path.join(_backend_dir, "..", "static"))
    if os.path.isdir(src):
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        STATIC_DIR = dst

if STATIC_DIR:
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
