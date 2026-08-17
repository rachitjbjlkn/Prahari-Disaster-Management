import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { Search, X, AlertTriangle } from 'lucide-react';

const tierClass = (t) => (t === 'high' ? 'badge-critical' : t === 'medium' ? 'badge-elevated' : 'badge-stable');

function Portal({ children }) {
  return createPortal(children, document.body);
}

function usePosition(ref) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });
  useEffect(() => {
    if (!ref.current) return;
    const update = () => {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  });
  return pos;
}

export default function LocationSearch() {
  const { setFlyTo, haversine, setSearchCenter, setNearbyDisasters, nearbyDisasters } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [allWards, setAllWards] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const [showNearby, setShowNearby] = useState(false);
  const boxRef = useRef(null);
  const pos = usePosition(boxRef);

  useEffect(() => {
    (async () => {
      try {
        const [wards, resources] = await Promise.all([api.wards(), api.resources()]);
        setAllWards(wards);
        setItems([
          ...wards.map((w) => ({
            type: 'ward', id: `w${w.id}`, label: w.name,
            sub: `Risk score ${w.risk_score} · ${w.risk_tier}`,
            lat: w.lat, lng: w.lng, tier: w.risk_tier, risk_score: w.risk_score,
          })),
          ...resources.map((r) => ({
            type: 'resource', id: `r${r.id}`, label: r.name,
            sub: `${r.department} · ${r.capacity_used}/${r.capacity_total} in use`,
            lat: r.lat, lng: r.lng, department: r.department,
          })),
        ]);
      } catch { /* backend offline */ }
    })();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : [];
  const active = highlight >= results.length ? 0 : highlight;

  const select = (item) => {
    setFlyTo({ lat: item.lat, lng: item.lng });
    const nearby = allWards
      .map((w) => ({ ...w, distance_km: Math.round(haversine(item.lat, item.lng, w.lat, w.lng) * 10) / 10 }))
      .filter((w) => w.distance_km <= 10 && w.id !== item.id)
      .sort((a, b) => a.distance_km - b.distance_km);
    setSearchCenter({ lat: item.lat, lng: item.lng });
    setNearbyDisasters(nearby);
    setShowNearby(true);
    setQuery('');
    setOpen(false);
    setHighlight(0);
  };

  const closeNearby = () => {
    setShowNearby(false);
    setNearbyDisasters(null);
    setSearchCenter(null);
  };

  const onSearchInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlight(0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { if (results[active]) select(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} className="search-box" role="search">
      <div className="search-row">
        <Search size={14} color="var(--text-dim)" aria-hidden="true" style={{ flexShrink: 0 }} />
        <input
          type="search"
          value={query}
          placeholder="Search ward or resource…"
          aria-label="Search location"
          onChange={onSearchInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="search-input"
        />
        {query && (
          <button onClick={() => { setQuery(''); setHighlight(0); }} className="search-clear" aria-label="Clear search">
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && q && (
        <Portal>
          <div
            className="search-drop"
            role="listbox"
            aria-label="Location results"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          >
            {results.length === 0 && <div className="search-empty">No locations match "{query.trim()}"</div>}
            {results.map((r, i) => (
              <div
                key={r.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); select(r); }}
                className={`search-item${i === active ? ' search-item-active' : ''}`}
              >
                <span className={`chip ${r.type === 'ward' ? 'chip-ndrf' : `chip-${r.department}`}`} style={{ flexShrink: 0 }}>
                  {r.type === 'ward' ? 'WARD' : r.department.toUpperCase()}
                </span>
                <div className="search-item-body">
                  <div className="search-item-label">{r.label}</div>
                  <div className="mono search-item-sub">{r.sub}</div>
                </div>
                {r.type === 'ward' && <span className={`badge ${tierClass(r.tier)}`} style={{ flexShrink: 0 }}>{r.tier}</span>}
              </div>
            ))}
          </div>
        </Portal>
      )}

      {showNearby && nearbyDisasters && nearbyDisasters.length > 0 && (
        <Portal>
          <div className="nearby-panel" style={{ position: 'fixed', top: pos.top, right: 12 }}>
            <div className="nearby-header">
              <AlertTriangle size={13} color="var(--text-muted)" aria-hidden="true" />
              Nearby ({nearbyDisasters.length} within 10 km)
              <button className="nearby-close" onClick={closeNearby} aria-label="Close nearby panel">
                <X size={13} />
              </button>
            </div>
            {nearbyDisasters.slice(0, 6).map((d) => (
              <div key={d.id} className="nearby-item">
                <span className="nearby-name">{d.name}</span>
                <span className="nearby-dist">
                  {d.distance_km} km · {d.risk_tier} ({d.risk_score}/100)
                </span>
              </div>
            ))}
            {nearbyDisasters.length > 6 && (
              <div className="search-empty">+{nearbyDisasters.length - 6} more within range</div>
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}
