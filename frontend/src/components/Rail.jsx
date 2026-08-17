import { NavLink } from 'react-router-dom';
import { LayoutGrid, MapPinned, MessageSquareWarning, Boxes, Smartphone } from 'lucide-react';
import { useApp } from '../context/AppContext';

const allItems = [
  { to: '/', icon: LayoutGrid, label: 'Overview', end: true, minRole: 'any' },
  { to: '/hazard', icon: MapPinned, label: 'Hazard', minRole: 'any' },
  { to: '/reports', icon: MessageSquareWarning, label: 'Reports', minRole: 'any' },
  { to: '/resources', icon: Boxes, label: 'Resources', minRole: 'any' },
  { to: '/comms', icon: Smartphone, label: 'Comms', minRole: 'any' },
];

export default function Rail() {
  const { perms } = useApp();
  const items = allItems.filter((it) => {
    if (it.minRole === 'command') return perms.isCommand;
    return true;
  });

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-mark" title="PRAHARI">
        <Smartphone size={18} strokeWidth={2.4} color="#fff" />
      </div>
      <div className="rail-items">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `rail-item${isActive ? ' rail-item-active' : ''}`}
          >
            <Icon size={19} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
