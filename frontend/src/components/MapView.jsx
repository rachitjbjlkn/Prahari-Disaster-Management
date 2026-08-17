import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context/AppContext';
import { Navigation } from 'lucide-react';

const riskColor = (tier) => ({
  high: 'var(--risk-critical)', critical: 'var(--risk-critical)',
  medium: 'var(--risk-elevated)', elevated: 'var(--risk-elevated)',
  low: 'var(--risk-stable)', stable: 'var(--risk-stable)',
}[tier] || 'var(--risk-stable)');

function resolveVar(name) {
  if (typeof window === 'undefined') return name;
  return getComputedStyle(document.documentElement).getPropertyValue(name.replace('var(', '').replace(')', '')).trim() || name;
}

const deptIcon = { fire: '🚒', police: '🚓', health: '🚑', ndrf: '🛟', municipal: '🏠' };

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 14, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function MapView({ wards = [], resources = [], reports = [], focus, onWardClick, height = '100%', center = [26.145, 91.76], zoom = 12.3, pinMode, onPin }) {
  const { flyTo, myLocation, requestLocation, locationLoading, searchCenter, nearbyDisasters } = useApp();
  const [flyTarget, setFlyTarget] = useState(null);

  useEffect(() => { if (flyTo) setFlyTarget(flyTo); }, [flyTo]);
  useEffect(() => { if (focus) setFlyTarget(focus); }, [focus]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: '100%', background: '#E7EBF1' }}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={18}
      />
      <FlyTo target={flyTarget} />
      {pinMode && <MapClickCatcher onPin={onPin} />}

      {/* User live location marker */}
      {myLocation && (
        <CircleMarker
          center={[myLocation.lat, myLocation.lng]}
          radius={8}
          pathOptions={{
            color: '#2563EB',
            fillColor: '#3B82F6',
            fillOpacity: 0.9,
            weight: 3,
          }}
        >
          <Popup><b>You are here</b><br />Lat: {myLocation.lat.toFixed(5)}, Lng: {myLocation.lng.toFixed(5)}</Popup>
        </CircleMarker>
      )}
      {myLocation && (
        <Circle
          center={[myLocation.lat, myLocation.lng]}
          radius={myLocation.accuracy || 50}
          pathOptions={{
            color: '#2563EB',
            fillColor: '#3B82F6',
            fillOpacity: 0.08,
            weight: 1,
            dashArray: '6 4',
          }}
        />
      )}

      {/* Search center marker + radius */}
      {searchCenter && (
        <>
          <CircleMarker
            center={[searchCenter.lat, searchCenter.lng]}
            radius={10}
            pathOptions={{
              color: '#7C3AED',
              fillColor: '#7C3AED',
              fillOpacity: 0.8,
              weight: 3,
            }}
          >
            <Popup><b>Search location</b></Popup>
          </CircleMarker>
          <Circle
            center={[searchCenter.lat, searchCenter.lng]}
            radius={10000}
            pathOptions={{
              color: '#7C3AED',
              fillColor: '#7C3AED',
              fillOpacity: 0.04,
              weight: 1.5,
              dashArray: '8 5',
            }}
          />
        </>
      )}

      {/* Nearby disaster zones around search */}
      {nearbyDisasters && nearbyDisasters.map((d) => (
        <CircleMarker
          key={`disaster-${d.id}`}
          center={[d.lat, d.lng]}
          radius={Math.max(10, d.risk_score / 5)}
          pathOptions={{
            color: d.risk_tier === 'high' ? '#DC2626' : d.risk_tier === 'medium' ? '#D97706' : '#059669',
            fillColor: d.risk_tier === 'high' ? '#DC2626' : d.risk_tier === 'medium' ? '#D97706' : '#059669',
            fillOpacity: 0.2,
            weight: 2,
            dashArray: '4 3',
          }}
        >
          <Popup>
            <b>{d.name}</b><br />
            Risk: {d.risk_score}/100 ({d.risk_tier})<br />
            {d.distance_km} km from search point
          </Popup>
        </CircleMarker>
      ))}

      {wards.map(w => (
        <CircleMarker
          key={`ward-${w.id}`}
          center={[w.lat, w.lng]}
          radius={12 + w.risk_score / 10}
          pathOptions={{
            color: resolveVar(riskColor(w.risk_tier)),
            fillColor: resolveVar(riskColor(w.risk_tier)),
            fillOpacity: 0.32,
            weight: 2,
          }}
          eventHandlers={{ click: () => onWardClick && onWardClick(w) }}
        >
          <Popup>
            <b>{w.name}</b><br />
            Risk score: {w.risk_score}/100 ({w.risk_tier})<br />
            Rainfall: {w.rainfall_mm}mm · River: {w.river_level_pct}%
          </Popup>
        </CircleMarker>
      ))}

      {resources.map(r => (
        <Marker
          key={`res-${r.id}`}
          position={[r.lat, r.lng]}
          icon={L.divIcon({
            html: `<div style="background:#fff;border:1px solid #DDE3EC;border-radius:10px;padding:4px 8px;font-size:14px;line-height:1;box-shadow:0 3px 10px rgba(16,24,40,0.18);">${deptIcon[r.department] || '📍'}</div>`,
            className: '', iconSize: [30, 30],
          })}
        >
          <Popup>
            <b>{r.name}</b><br />
            {r.department.toUpperCase()} · {r.capacity_used}/{r.capacity_total} in use
          </Popup>
        </Marker>
      ))}

      {reports.map(r => (
        <CircleMarker
          key={`rep-${r.id}`}
          center={[r.lat, r.lng]}
          radius={6}
          pathOptions={{
            color: resolveVar(r.status === 'verified' ? 'var(--verified)' : r.status === 'flagged' ? 'var(--flagged)' : 'var(--pending)'),
            fillColor: resolveVar(r.status === 'verified' ? 'var(--verified)' : r.status === 'flagged' ? 'var(--flagged)' : 'var(--pending)'),
            fillOpacity: 0.75,
            weight: 2,
          }}
        >
          <Popup><b>{r.category}</b><br />{r.status}<br />{r.description}</Popup>
        </CircleMarker>
      ))}

      {/* Locate Me button */}
      <LocateButton onClick={requestLocation} loading={locationLoading} />
    </MapContainer>
  );
}

function MapClickCatcher({ onPin }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e) => onPin(e.latlng);
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [map, onPin]);
  return null;
}

function LocateButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className="locate-btn"
      title="Track my live location"
      aria-label="Track my live location"
      disabled={loading}
    >
      <Navigation size={16} className={loading ? 'spin' : ''} aria-hidden="true" />
    </button>
  );
}
