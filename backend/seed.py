"""Populate the database with sample wards + resources and score initial risk
with the real trained RandomForest model. Run once: `python seed.py`
"""
import time
from app.database import Base, engine, SessionLocal
from app import models
from app.ml.risk_model import predict_risk, risk_tier, train_and_save

Base.metadata.create_all(bind=engine)
train_and_save()

db = SessionLocal()

if db.query(models.Ward).count() == 0:
    ward_seed = [
        dict(name="Ward 4 — Riverside", lat=26.1445, lng=91.7362, rainfall_mm=260, river_level_pct=95, elevation_m=6, soil_saturation_pct=95),
        dict(name="Ward 7 — Lowtown", lat=26.1620, lng=91.7690, rainfall_mm=165, river_level_pct=74, elevation_m=14, soil_saturation_pct=78),
        dict(name="Ward 12 — Hillfoot", lat=26.1180, lng=91.7050, rainfall_mm=60, river_level_pct=35, elevation_m=95, soil_saturation_pct=40),
        dict(name="Ward 2 — Old Bridge", lat=26.1780, lng=91.7480, rainfall_mm=230, river_level_pct=90, elevation_m=8, soil_saturation_pct=92),
        dict(name="Ward 9 — Market Road", lat=26.1300, lng=91.7850, rainfall_mm=95, river_level_pct=50, elevation_m=45, soil_saturation_pct=55),
        dict(name="Ward 15 — Highground", lat=26.1050, lng=91.7600, rainfall_mm=40, river_level_pct=22, elevation_m=130, soil_saturation_pct=30),
    ]
    for w in ward_seed:
        score = predict_risk(w["rainfall_mm"], w["river_level_pct"], w["elevation_m"], w["soil_saturation_pct"])
        ward = models.Ward(**w, risk_score=score, risk_tier=risk_tier(score), updated_at=time.time())
        db.add(ward)

if db.query(models.Resource).count() == 0:
    res_seed = [
        dict(name="Fire Unit — Station 3", department="fire", lat=26.1500, lng=91.7400, capacity_total=100, capacity_used=40, status="available"),
        dict(name="NDRF Team Alpha", department="ndrf", lat=26.1700, lng=91.7550, capacity_total=100, capacity_used=20, status="available"),
        dict(name="Ambulance Fleet — Central", department="health", lat=26.1400, lng=91.7700, capacity_total=100, capacity_used=65, status="available"),
        dict(name="Relief Shelter — Govt School", department="municipal", lat=26.1550, lng=91.7900, capacity_total=300, capacity_used=110, status="available"),
        dict(name="Relief Shelter — Community Hall", department="municipal", lat=26.1200, lng=91.7300, capacity_total=150, capacity_used=140, status="available"),
        dict(name="NDRF Team Bravo", department="ndrf", lat=26.1050, lng=91.7650, capacity_total=100, capacity_used=5, status="available"),
        dict(name="Police Response Unit 2", department="police", lat=26.1620, lng=91.7300, capacity_total=100, capacity_used=30, status="available"),
    ]
    for r in res_seed:
        db.add(models.Resource(**r))

db.commit()
print("Seed complete:", db.query(models.Ward).count(), "wards,", db.query(models.Resource).count(), "resources.")
db.close()
