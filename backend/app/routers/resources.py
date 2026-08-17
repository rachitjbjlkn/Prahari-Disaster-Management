from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..routers.auth import get_current_user
from ..verification import haversine_km
from ..websocket_manager import manager

router = APIRouter(prefix="/api/resources", tags=["resource-coordination"])


@router.get("", response_model=list[schemas.ResourceOut])
def list_resources(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    all_resources = db.query(models.Resource).all()
    if user.role == "admin" or user.department.value == "command":
        return all_resources
    return [r for r in all_resources if models.user_can_dispatch_resource(user, r)]


@router.post("/{resource_id}/dispatch", response_model=schemas.ResourceOut)
async def dispatch_resource(
    resource_id: int,
    payload: schemas.DispatchIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """
    Unified Resource Coordination loop: promote a *suggested* allocation to a
    confirmed dispatch — marks the unit dispatched, records the allocation as
    accepted, and pushes the decision to every dashboard via WebSocket.
    """
    resource = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    ward = db.query(models.Ward).filter(models.Ward.id == payload.ward_id).first()
    if not resource or not ward:
        return None
    if not models.user_can_dispatch_resource(user, resource):
        raise HTTPException(status_code=403, detail="You cannot dispatch resources outside your department")

    d = haversine_km(ward.lat, ward.lng, resource.lat, resource.lng)
    allocation = models.Allocation(
        ward_id=ward.id,
        resource_id=resource.id,
        distance_km=round(d, 2),
        reason=payload.note or f"Dispatched to {ward.name} by control room",
        accepted=True,
    )
    db.add(allocation)
    resource.status = "dispatched"
    resource.capacity_used = min(resource.capacity_total, resource.capacity_used + 10)
    db.commit()
    db.refresh(resource)

    await manager.broadcast("resource_dispatch", {
        "resource_id": resource.id,
        "resource": resource.name,
        "ward": ward.name,
        "distance_km": round(d, 2),
    })
    return resource


@router.get("/allocations/suggested", response_model=list[schemas.AllocationOut])
def suggested_allocations(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """
    Unified Resource Coordination (Section 2/6): match each high-risk ward
    to its nearest non-full, non-shelter resource. Shelters are matched
    separately since citizens move to them rather than the reverse.
    """
    high_risk_wards = (
        db.query(models.Ward)
        .filter(models.Ward.risk_tier == models.RiskTier.high)
        .order_by(models.Ward.risk_score.desc())
        .all()
    )
    dispatchable = (
        db.query(models.Resource)
        .filter(models.Resource.department != models.Department.municipal)
        .all()
    )
    if user.role != "admin" and user.department.value != "command":
        dispatchable = [r for r in dispatchable if models.user_can_dispatch_resource(user, r)]

    out = []
    for ward in high_risk_wards:
        candidates = [r for r in dispatchable if r.capacity_used / max(r.capacity_total, 1) < 0.9]
        if not candidates:
            continue
        best = min(candidates, key=lambda r: haversine_km(ward.lat, ward.lng, r.lat, r.lng))
        d = haversine_km(ward.lat, ward.lng, best.lat, best.lng)
        dept_label = best.department.value if hasattr(best.department, "value") else best.department
        out.append(schemas.AllocationOut(
            ward_id=ward.id,
            resource_id=best.id,
            ward_name=ward.name,
            resource_name=best.name,
            department=dept_label,
            distance_km=round(d, 2),
            reason=f"Nearest available {dept_label} unit to highest-risk ward (score {ward.risk_score})",
        ))
    return out
