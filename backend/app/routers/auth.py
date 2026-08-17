"""
Per-department authentication (README gap #2). Demo users are seeded on
first run so the dashboard is genuinely access-controlled instead of a
decorative department switcher.
"""
from fastapi import APIRouter, Depends, HTTPException, status as http_status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import hash_password, verify_password, create_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

# Default demo accounts — reset/replace in production (see README).
DEFAULT_USERS = [
    ("admin", "Prahari Administrator", "command", "admin", "admin123"),
    ("command", "Command Center Officer", "command", "operator", "command123"),
    ("fire", "Fire Control Operator", "fire", "operator", "fire123"),
    ("police", "Police Control Operator", "police", "operator", "police123"),
    ("health", "Health Control Operator", "health", "operator", "health123"),
    ("ndrf", "NDRF/SDRF Operator", "ndrf", "operator", "ndrf123"),
    ("municipal", "Municipal Operator", "municipal", "operator", "municipal123"),
]


def ensure_default_users(db: Session):
    """Seed demo accounts when the users table is empty (called on startup)."""
    if db.query(models.User).count() > 0:
        return
    for username, full_name, dept, role, password in DEFAULT_USERS:
        db.add(models.User(
            username=username,
            full_name=full_name,
            department=models.Department(dept),
            role=role,
            password_hash=hash_password(password),
        ))
    db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def require_department(*allowed: str):
    """Dependency factory: reject callers from other departments (403)."""
    def dep(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role != "admin" and user.department.value not in allowed:
            raise HTTPException(
                http_status.HTTP_403_FORBIDDEN,
                f"Access restricted to department(s): {', '.join(allowed)}",
            )
        return user
    return dep


@router.post("/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username.strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    token = create_token({
        "sub": user.id,
        "username": user.username,
        "department": user.department.value,
        "role": user.role,
    })
    return schemas.TokenOut(access_token=token, user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_department("command"))):
    return db.query(models.User).order_by(models.User.department, models.User.username).all()
