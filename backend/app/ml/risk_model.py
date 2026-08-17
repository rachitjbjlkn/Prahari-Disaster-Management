"""
Predictive Hazard Intelligence — model layer.

Section 5 of the project doc specifies LSTM / Random Forest (PyTorch,
scikit-learn) on IMD / CWC / satellite data. This module trains a real
RandomForestRegressor (scikit-learn) on synthetic-but-physically-reasonable
historical data, so the risk score coming out of the API is an actual model
prediction, not a hardcoded formula.

Why Random Forest for the working demo instead of the LSTM: an LSTM needs a
real historical time series per ward to be meaningful (sequence length,
lookback window, etc.) — with synthetic single-snapshot data a tree ensemble
is the honest choice and trains in under a second. The LSTM path is scoped
in `lstm_upgrade_notes.md` for when real IMD/CWC time-series data is wired in.

Features: rainfall_mm, river_level_pct, elevation_m, soil_saturation_pct
Target: risk_score (0-100)
"""
import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestRegressor

MODEL_PATH = os.path.join(os.path.dirname(__file__), "risk_model.joblib")


def _generate_synthetic_training_data(n=4000, seed=42):
    rng = np.random.default_rng(seed)
    rainfall = rng.uniform(0, 300, n)          # mm in last 48h
    river_level = rng.uniform(0, 100, n)       # % of danger mark
    elevation = rng.uniform(0, 200, n)         # metres above sea level (proxy)
    soil_sat = rng.uniform(0, 100, n)          # % soil saturation

    # Physically-motivated synthetic risk function + noise, so the forest
    # has real non-linear structure to learn rather than a flat lookup.
    risk = (
        0.32 * river_level
        + 0.22 * rainfall / 3
        + 0.18 * soil_sat
        - 0.20 * (elevation / 2)
        + 0.10 * (river_level / 100) * (rainfall / 3)     # interaction term
    )
    risk += rng.normal(0, 4, n)  # sensor/measurement noise
    risk = np.clip(risk, 0, 100)

    X = np.column_stack([rainfall, river_level, elevation, soil_sat])
    y = risk
    return X, y


def train_and_save():
    X, y = _generate_synthetic_training_data()
    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=10,
        min_samples_leaf=4,
        random_state=42,
    )
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model


def load_model():
    if not os.path.exists(MODEL_PATH):
        return train_and_save()
    return joblib.load(MODEL_PATH)


_model = None


def predict_risk(rainfall_mm: float, river_level_pct: float, elevation_m: float, soil_saturation_pct: float) -> float:
    global _model
    if _model is None:
        _model = load_model()
    X = np.array([[rainfall_mm, river_level_pct, elevation_m, soil_saturation_pct]])
    score = float(_model.predict(X)[0])
    return round(max(0, min(100, score)), 1)


def risk_tier(score: float) -> str:
    if score >= 68:
        return "high"
    if score >= 38:
        return "medium"
    return "low"


if __name__ == "__main__":
    m = train_and_save()
    print("Model trained and saved to", MODEL_PATH)
    print("Sample prediction:", predict_risk(210, 88, 12, 91))
