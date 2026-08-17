const TONES = {
  default: { color: 'var(--text)', bar: 'var(--primary-soft)', bg: 'var(--primary-bg)' },
  critical: { color: 'var(--risk-critical)', bar: 'var(--risk-critical)', bg: 'var(--risk-critical-bg)' },
  elevated: { color: 'var(--risk-elevated)', bar: 'var(--risk-elevated)', bg: 'var(--risk-elevated-bg)' },
  stable: { color: 'var(--risk-stable)', bar: 'var(--risk-stable)', bg: 'var(--risk-stable-bg)' },
  accent: { color: 'var(--primary-strong)', bar: 'var(--accent-soft)', bg: 'var(--primary-bg)' },
};

export default function StatCard({ label, value, sub, tone = 'default', icon: Icon, index = 0 }) {
  const t = TONES[tone] || TONES.default;

  return (
    <div
      className="stat-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="stat-accent-bar" style={{ background: t.bar }} />
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className="stat-icon" style={{ background: t.bg }}>
            <Icon size={16} style={{ color: t.color }} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="stat-value" style={{ color: t.color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
