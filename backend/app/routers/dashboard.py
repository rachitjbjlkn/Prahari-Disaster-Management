from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..routers.auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _filter_by_department(items, user):
    """Filter items to those relevant to the user's department."""
    if user.role == "admin" or user.department.value == "command":
        return items
    dept = user.department.value
    return [i for i in items if models.category_allowed_for(
        getattr(i, "category", ""), dept
    ) or (
        hasattr(i, "department") and (
            (i.department.value if hasattr(i.department, "value") else i.department) == dept
        )
    )]


@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    wards = db.query(models.Ward).all()
    reports = db.query(models.CitizenReport).all()
    resources = db.query(models.Resource).all()

    is_full = user.role == "admin" or user.department.value == "command"

    if is_full:
        vis_reports = reports
        vis_resources = resources
    else:
        dept = user.department.value
        vis_reports = [r for r in reports if models.category_allowed_for(r.category, dept)]
        vis_resources = [r for r in resources if models.user_can_dispatch_resource(user, r)]

    return {
        "wards_total": len(wards),
        "wards_high_risk": len([w for w in wards if w.risk_tier == models.RiskTier.high]),
        "wards_medium_risk": len([w for w in wards if w.risk_tier == models.RiskTier.medium]),
        "reports_total": len(vis_reports),
        "reports_verified": len([r for r in vis_reports if r.status == models.ReportStatus.verified]),
        "reports_pending": len([r for r in vis_reports if r.status == models.ReportStatus.pending]),
        "reports_flagged": len([r for r in vis_reports if r.status == models.ReportStatus.flagged]),
        "resources_total": len(vis_resources),
        "avg_capacity_used_pct": round(
            sum(r.capacity_used / max(r.capacity_total, 1) for r in vis_resources) / max(len(vis_resources), 1) * 100, 1
        ) if vis_resources else 0,
    }
