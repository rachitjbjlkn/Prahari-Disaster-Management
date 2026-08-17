import { useEffect, useState } from 'react';
import { api } from '../api/client';
import MapView from '../components/MapView';
import { useApp } from '../context/AppContext';
import { Boxes, GitBranch, Send } from 'lucide-react';

const deptIcon = { fire: '🚒', police: '🚓', health: '🚑', ndrf: '🛟', municipal: '🏠' };

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [dispatched, setDispatched] = useState({});
  const [filter, setFilter] = useState('all');
  const { perms, user } = useApp();

  const load = () => {
    api.resources().then(setResources).catch(() => {});
    api.suggestedAllocations().then(setSuggestions).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const depts = perms.isCommand
    ? ['all', 'fire', 'police', 'health', 'ndrf', 'municipal']
    : ['all'];
  const visible = filter === 'all' ? resources : resources.filter((r) => r.department === filter);

  const dispatch = async (s) => {
    if (dispatched[s.resource_id]) return;
    if (!perms.canDispatchDept(s.department)) return;
    try {
      await api.dispatch(s.resource_id, s.ward_id, `Auto-dispatch for ${s.ward_name}`);
      setDispatched((d) => ({ ...d, [s.resource_id]: true }));
      load();
    } catch (e) {
      alert('Dispatch failed — ' + e.message);
    }
  };

  return (
    <div className="pane-grid">
      <div className="pane-main">
        <MapView resources={visible} height="100%" />
        <div className="map-badge">RESOURCE DEPLOYMENT MAP</div>
      </div>

      <div className="pane-side">
        <div>
          <h2 className="page-title" style={{ fontSize: 19 }}>Unified Resource Coordination</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            {perms.isCommand
              ? 'Shared live view across departments — no more shelters overwhelmed while others sit empty. Suggested matches become confirmed dispatches with one click.'
              : `Live view of ${user?.department} department resources — dispatch your units to high-risk wards.`}
          </p>
        </div>

        <div role="group" aria-label="Filter by department" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {depts.map((d) => (
            <button
              key={d}
              onClick={() => setFilter(d)}
              aria-pressed={filter === d}
              className={`dept-btn${filter === d ? ' dept-btn-active' : ''}`}
            >
              {d === 'all' ? 'All' : d}
            </button>
          ))}
        </div>

        <div className="panel panel-hover panel-pad">
          <div className="panel-head">
            <h3 className="panel-title">
              <GitBranch size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" /> Auto-Suggested Allocation
            </h3>
          </div>
          {suggestions.length === 0 && (
            <div className="empty-state">
              <Boxes size={26} aria-hidden="true" />
              <div>No high-risk wards requiring dispatch right now.</div>
            </div>
          )}
          {suggestions.map((s, i) => (
            <div key={`${s.ward_id}-${s.resource_id}`} className="suggestion-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <b>{s.ward_name}</b>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <span className={`chip chip-${s.department}`}>{s.department}</span>
                <b>{s.resource_name}</b>
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>{s.reason}</div>
              <button
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                disabled={!!dispatched[s.resource_id] || !perms.canDispatchDept(s.department)}
                onClick={() => dispatch(s)}
              >
                <Send size={12} aria-hidden="true" />
                {dispatched[s.resource_id] ? 'Dispatched' : `Dispatch ${s.distance_km} km`}
              </button>
            </div>
          ))}
        </div>

        <div className="panel panel-hover panel-pad" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <h3 className="panel-title">Live Capacity</h3>
            <span className="badge badge-soft">{visible.length}</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.map((r) => {
              const pct = Math.round((r.capacity_used / r.capacity_total) * 100);
              const color = pct > 85 ? 'var(--risk-critical)' : pct > 60 ? 'var(--risk-elevated)' : 'var(--risk-stable)';
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px', borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>
                    {deptIcon[r.department]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      <span className={`chip chip-${r.department}`}>{r.department}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>
                      {r.capacity_used}/{r.capacity_total} in use ({pct}%){r.status === 'dispatched' ? ' · dispatched' : ''}
                    </div>
                    <div className="risk-bar" style={{ marginTop: 6 }}>
                      <div className="risk-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="empty-state">No resources in this department.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
