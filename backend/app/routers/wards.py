from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user, require_department
from ..ml.risk_model import predict_risk, risk_tier
import time

router = APIRouter(prefix="/api/wards", tags=["hazard-prediction"])


@router.get("", response_model=list[schemas.WardOut])
def list_wards(db: Session = Depends(get_db)):
    return db.query(models.Ward).order_by(models.Ward.risk_score.desc()).all()


@router.get("/{ward_id}", response_model=schemas.WardOut)
def get_ward(ward_id: int, db: Session = Depends(get_db)):
    return db.query(models.Ward).filter(models.Ward.id == ward_id).first()


@router.post("/{ward_id}/refresh", response_model=schemas.WardOut)
def refresh_ward_risk(
    ward_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_department("command")),
):
    """Re-runs the RandomForest model on the ward's current sensor inputs. Admin/Command only."""
    ward = db.query(models.Ward).filter(models.Ward.id == ward_id).first()
    if not ward:
        return None
    score = predict_risk(ward.rainfall_mm, ward.river_level_pct, ward.elevation_m, ward.soil_saturation_pct)
    ward.risk_score = score
    ward.risk_tier = risk_tier(score)
    ward.updated_at = time.time()
    db.commit()
    db.refresh(ward)
    return ward
