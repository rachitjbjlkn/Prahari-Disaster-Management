import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Wifi, WifiOff, LogOut, Lock, Menu } from 'lucide-react';
import LocationSearch from './LocationSearch';

export default function Topbar({ onMenuOpen }) {
  const { user, logout, department, setDepartment, DEPARTMENTS, connected, liveEvents } = useApp();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString('en-IN', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const canSwitch = user?.role === 'admin' || user?.department === 'command';

  const tickerText = liveEvents.length
    ? liveEvents.slice(0, 6).map(e =>
        e.event === 'new_report' ? `NEW REPORT · ${e.payload.category.toUpperCase()} · ${e.payload.status.toUpperCase()}`
        : e.event === 'alert_sent' ? `ALERT · ${e.payload.channel.toUpperCase()} × ${e.payload.count}`
        : e.event === 'resource_dispatch' ? `DISPATCH · ${e.payload.resource.toUpperCase()} → ${e.payload.ward.toUpperCase()}`
        : e.event
      ).join('     •     ')
    : 'PRAHARI coordination link established — awaiting field activity';

  return (
    <header className="topbar">
      <button className="topbar-hamburger" onClick={onMenuOpen} aria-label="Open menu">
        <Menu size={20} />
      </button>

      <div className="topbar-depts" role="group" aria-label="Department context">
        {DEPARTMENTS.map(d => {
          const active = department === d.id;
          const locked = !canSwitch && !active;
          return (
            <button
              key={d.id}
              onClick={() => !locked && setDepartment(d.id)}
              className={`dept-btn${active ? ' dept-btn-active' : ''}${locked ? ' dept-btn-locked' : ''}`}
              aria-pressed={active}
              title={locked ? `Locked — signed in as ${user?.department}` : d.label}
              disabled={locked}
            >
              {d.chip && <span className={`chip chip-${d.chip}`} aria-hidden="true">{d.chip}</span>}
              {d.label}
              {locked && <Lock size={10} aria-hidden="true" style={{ opacity: 0.5 }} />}
            </button>
          );
        })}
      </div>

      <div className="topbar-ticker" aria-hidden="true">
        <span className="mono ticker-text">{tickerText}</span>
      </div>

      <LocationSearch />

      <div className="topbar-status">
        {user && (
          <span className="conn-pill conn-on topbar-user-pill" title={`${user.full_name} · ${user.role}`}>
            <span className={`chip chip-${user.department}`} aria-hidden="true">{user.department}</span>
            {user.username}
          </span>
        )}
        <span className="mono topbar-clock">{clock} IST</span>
        <span className={`conn-pill ${connected ? 'conn-on' : 'conn-off'}`}>
          {connected ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
          {connected ? 'LIVE SYNC' : 'RECONNECTING'}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out" aria-label="Sign out">
          <LogOut size={14} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
