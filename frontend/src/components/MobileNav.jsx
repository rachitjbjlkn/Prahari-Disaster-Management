import { useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, MapPinned, MessageSquareWarning, Boxes, Smartphone, Lock, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';

const navItems = [
  { to: '/', icon: LayoutGrid, label: 'Overview', end: true },
  { to: '/hazard', icon: MapPinned, label: 'Hazard Map' },
  { to: '/reports', icon: MessageSquareWarning, label: 'Reports' },
  { to: '/resources', icon: Boxes, label: 'Resources' },
  { to: '/comms', icon: Smartphone, label: 'Comms' },
];

export default function MobileNav({ open, onClose }) {
  const { user, logout, department, setDepartment, DEPARTMENTS } = useApp();
  const location = useLocation();
  const canSwitch = user?.role === 'admin' || user?.department === 'command';

  useEffect(() => {
    if (open) onClose();
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = useCallback(() => {
    onClose();
    logout();
  }, [onClose, logout]);

  return (
    <>
      <div className={`mobile-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <nav className={`mobile-drawer${open ? ' open' : ''}`} aria-label="Mobile navigation">
        <div className="mobile-drawer-header">
          <span className="mobile-drawer-brand">PRAHARI</span>
          {user && (
            <span className="mobile-drawer-user">
              <span className={`chip chip-${user.department}`}>{user.department}</span>
              {user.full_name || user.username}
            </span>
          )}
        </div>

        <div className="mobile-drawer-nav">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="mobile-drawer-depts">
          <div className="mobile-drawer-section-title">Department</div>
          <div className="mobile-dept-grid">
            {DEPARTMENTS.map(d => {
              const active = department === d.id;
              const locked = !canSwitch && !active;
              return (
                <button
                  key={d.id}
                  onClick={() => { if (!locked) { setDepartment(d.id); onClose(); } }}
                  className={`mobile-dept-btn${active ? ' active' : ''}${locked ? ' locked' : ''}`}
                  disabled={locked}
                >
                  {d.chip && <span className={`chip chip-${d.chip}`}>{d.chip}</span>}
                  {d.label}
                  {locked && <Lock size={10} style={{ opacity: 0.4 }} />}
                </button>
              );
            })}
          </div>
        </div>

        <button className="mobile-drawer-logout" onClick={handleLogout}>
          <LogOut size={16} />
          Sign Out
        </button>
      </nav>
    </>
  );
}
