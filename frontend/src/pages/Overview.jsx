import { useEffect, useState } from 'react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import MapView from '../components/MapView';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useApp } from '../context/AppContext';
import { AlertTriangle, ShieldCheck, MapPinned, Flag, Gauge, Send, Flame, Shield, Heart, LifeBuoy, HardHat } from 'lucide-react';

const riskColor = (t) => t === 'high' ? 'var(--risk-critical)' : t === 'medium' ? 'var(--risk-elevated)' : 'var(--risk-stable)';

const DEPT_ICONS = {
  fire: Flame, police: Shield, health: Heart, ndrf: LifeBuoy, municipal: HardHat, command: ShieldCheck,
};

const DEPT_COLORS = {
  fire: 'var(--risk-critical)', police: 'var(--chip-police)', health: 'var(--chip-health)',
  ndrf: 'var(--chip-ndrf)', municipal: 'var(--chip-municipal)', command: 'var(--primary)',
};

function DeptHighlight({ reports, deptHighlight, userDept }) {
  if (!deptHighlight || !deptHighlight.categories.length) return null;
  const deptReports = reports.filter((r) => deptHighlight.categories.includes(r.category));
  const byCat = {};
  deptReports.forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + 1; });
  const Icon = DEPT_ICONS[userDept] || AlertTriangle;
  const color = DEPT_COLORS[userDept] || 'var(--primary)';
  return (
    <div className="panel panel-hover panel-pad" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="panel-head">
        <h3 className="panel-title" style={{ color, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={16} aria-hidden="true" /> {deptHighlight.label}
        </h3>
        <span className="badge badge-soft">{deptReports.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
        {Object.entries(byCat).map(([cat, count]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span className="mono" style={{ fontWeight: 700, color }}>{count}</span>
            <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
          </div>
        ))}
        {deptReports.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No active reports for your department.</div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="stat-grid" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="stat-card">
          <div className="skeleton" style={{ height: 10, width: '55%' }} />
          <div className="skeleton" style={{ height: 28, width: '40%', marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const [summary, setSummary] = useState(null);
  const [wards, setWards] = useState([]);
  const [resources, setResources] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [reports, setReports] = useState([]);
  const { liveEvents, user, perms } = useApp();

  const load = () => {
    api.dashboardSummary().then(setSummary).catch(() => {});
    api.wards().then(setWards).catch(() => {});
    api.resources().then(setResources).catch(() => {});
    api.suggestedAllocations().then(setSuggestions).catch(() => {});
    api.reports().then(setReports).catch(() => {});
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (liveEvents.length) load(); }, [liveEvents.length]); // eslint-disable-line

  const highRiskCount = summary?.wards_high_risk || 0;
  const deptLabel = user?.department === 'command' ? 'Command Center' : user?.department?.charAt(0).toUpperCase() + user?.department?.slice(1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">{perms.isCommand ? 'Command Center' : `${deptLabel} Dashboard`}</h2>
          <p className="page-sub">
            {perms.isCommand
              ? 'Shared real-time view across Fire, Police, Health, NDRF/SDRF, and Municipal bodies.'
              : `Operational view scoped to ${deptLabel} department — reports, resources, and dispatches relevant to you.`}
          </p>
        </div>
        <span className="badge badge-soft" style={{ fontSize: 11, padding: '7px 12px' }}>
          <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--risk-stable)', display: 'inline-block' }} />
          {perms.isCommand ? 'Operational overview' : `${deptLabel} overview`} · {wards.length} wards
        </span>
      </div>

      {!perms.isCommand && perms.deptHighlight && (
        <DeptHighlight reports={reports} deptHighlight={perms.deptHighlight} userDept={user?.department} />
      )}

      {summary ? (
        <div className="stat-grid">
          <StatCard index={0} label="Wards Monitored" value={summary.wards_total} icon={MapPinned} />
          <StatCard index={1} label="High Risk Wards" value={summary.wards_high_risk} tone="critical" icon={AlertTriangle}
            sub={highRiskCount > 0 ? 'Dispatch recommended' : 'None active'} />
          <StatCard index={2} label="Verified Reports" value={summary.reports_verified} tone="stable" icon={ShieldCheck}
            sub={`${summary.reports_pending} pending review`} />
          <StatCard index={3} label="Flagged Reports" value={summary.reports_flagged} tone="elevated" icon={Flag} />
          <StatCard index={4} label="Avg. Resource Load" value={`${summary.avg_capacity_used_pct}%`} tone="accent" icon={Gauge}
            sub={`${summary.resources_total} units tracked`} />
        </div>
      ) : (
        <Skeleton />
      )}

      <div className="overview-grid">
        <div className="panel panel-hover" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          <span className="map-badge">HAZARD + RESOURCE LAYER</span>
          <MapView wards={wards} resources={resources} height="100%" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <div className="panel panel-hover panel-pad">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Ward Risk Ranking</h3>
                <p className="panel-sub">Predicted risk score per ward</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={wards} layout="vertical" margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fill: 'var(--text-muted)', fontSize: 10.5 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{}} className="chart-tip" cursor={{ fill: 'rgba(15,118,110,0.06)' }} />
                <Bar dataKey="risk_score" radius={[0, 5, 5, 0]} animationDuration={700}>
                  {wards.map((w, i) => <Cell key={i} fill={riskColor(w.risk_tier)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel panel-hover panel-pad" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head">
              <h3 className="panel-title" style={{ color: 'var(--risk-elevated)' }}>
                <AlertTriangle size={16} aria-hidden="true" /> Auto-Suggested Dispatch
              </h3>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {suggestions.length === 0 && (
                <div className="empty-state">
                  <Send size={26} aria-hidden="true" />
                  <div>No high-risk wards requiring dispatch right now.</div>
                </div>
              )}
              {suggestions.map((s, i) => (
                <div key={i} className="suggestion-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <b>{s.ward_name}</b>
                    <span style={{ color: 'var(--text-dim)' }}>→</span>
                    <span className={`chip chip-${s.department}`}>{s.department}</span>
                    <b>{s.resource_name}</b>
                  </div>
                  <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>{s.distance_km} km away</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
