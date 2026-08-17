import { useEffect, useState } from 'react';
import { api } from '../api/client';
import MapView from '../components/MapView';
import { useApp } from '../context/AppContext';
import { RefreshCw, Activity } from 'lucide-react';

const tierClass = (t) => (t === 'high' ? 'badge-critical' : t === 'medium' ? 'badge-elevated' : 'badge-stable');

export default function HazardMap() {
  const [wards, setWards] = useState([]);
  const [focus, setFocus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const { perms } = useApp();

  const load = () => api.wards().then((w) => { setWards(w); if (!selected && w.length) setSelected(w[0]); });
  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleRefresh = async (w) => {
    setRefreshing(true);
    const updated = await api.refreshWard(w.id);
    setWards((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    setSelected(updated);
    setRefreshing(false);
  };

  const sensor = (label, value, pct) => (
    <div style={{ marginBottom: 10 }}>
      <div className="spec-row" style={{ borderBottom: 'none', padding: 0, marginBottom: 4 }}>
        <span className="spec-key">{label}</span>
        <span className="spec-val">{value}</span>
      </div>
      {pct != null && (
        <div className="risk-bar">
          <div
            className="risk-bar-fill"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: pct > 80 ? 'var(--risk-critical)' : pct > 55 ? 'var(--risk-elevated)' : 'var(--risk-stable)',
            }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="pane-grid">
      <div className="pane-main">
        <MapView wards={wards} focus={focus} onWardClick={setSelected} height="100%" />
        <div className="map-legend">
          <span className="badge badge-stable">Low</span>
          <span className="badge badge-elevated">Medium</span>
          <span className="badge badge-critical">High</span>
        </div>
      </div>

      <div className="pane-side">
        <div>
          <h2 className="page-title" style={{ fontSize: 19 }}>Predictive Hazard Intelligence</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            RandomForestRegressor (scikit-learn) trained on rainfall, river level, elevation and soil saturation — ward-level, not district-level.
          </p>
        </div>

        <div className="panel panel-hover" style={{ padding: 10 }}>
          <div className="panel-head" style={{ padding: '4px 8px 8px', marginBottom: 4 }}>
            <h3 className="panel-title">All Wards</h3>
            <span className="badge badge-soft">{wards.length}</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {wards.map((w) => (
              <div
                key={w.id}
                onClick={() => { setSelected(w); setFocus(w); }}
                className={`ward-row${selected?.id === w.id ? ' ward-row-active' : ''}`}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="ward-name">{w.name}</div>
                  <div className="mono ward-meta">rain {w.rainfall_mm}mm · river {w.river_level_pct}%</div>
                </div>
                <span className={`badge ${tierClass(w.risk_tier)}`}>{w.risk_score}</span>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="panel panel-hover panel-pad" style={{ animation: 'fade-up 0.25s var(--ease)' }}>
            <div className="panel-head">
              <h3 className="panel-title">
                <Activity size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" /> {selected.name}
              </h3>
              <span className={`badge ${tierClass(selected.risk_tier)}`}>{selected.risk_score}</span>
            </div>
            <p className="panel-sub" style={{ marginBottom: 12 }}>Sensor inputs feeding the model</p>
            {sensor('Rainfall (48h)', `${selected.rainfall_mm} mm`, (selected.rainfall_mm / 400) * 100)}
            {sensor('River level', `${selected.river_level_pct}% of danger mark`, selected.river_level_pct)}
            {sensor('Elevation', `${selected.elevation_m} m`, null)}
            {sensor('Soil saturation', `${selected.soil_saturation_pct}%`, selected.soil_saturation_pct)}
            {perms.canRefreshModel && (
              <button className="btn btn-secondary btn-block btn-sm" style={{ marginTop: 6 }} disabled={refreshing} onClick={() => handleRefresh(selected)}>
                <RefreshCw size={13} className={refreshing ? 'spin' : ''} aria-hidden="true" />
                {refreshing ? 'Re-running model…' : 'Re-run model on this ward'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
