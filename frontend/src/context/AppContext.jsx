import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { connectSocket, api, setToken } from '../api/client';

const AppCtx = createContext(null);

const DEPARTMENTS = [
  { id: 'command', label: 'Command Center', chip: null },
  { id: 'fire', label: 'Fire', chip: 'fire' },
  { id: 'police', label: 'Police', chip: 'police' },
  { id: 'health', label: 'Health', chip: 'health' },
  { id: 'ndrf', label: 'NDRF/SDRF', chip: 'ndrf' },
  { id: 'municipal', label: 'Municipal', chip: 'municipal' },
];

const CATEGORY_DEPT_MAP = {
  'Blocked road':       ['police', 'municipal'],
  'Breached embankment': ['fire', 'ndrf', 'municipal'],
  'Trapped people':     ['police', 'health', 'ndrf'],
  'Flooding':           ['fire', 'health', 'ndrf', 'municipal'],
  'Structural damage':  ['fire', 'municipal'],
};

const DEPT_HIGHLIGHTS = {
  fire:      { label: 'Structures at Risk', categories: ['Structural damage', 'Flooding', 'Breached embankment'] },
  police:    { label: 'Security Incidents', categories: ['Blocked road', 'Trapped people'] },
  health:    { label: 'Medical Reports',    categories: ['Trapped people', 'Flooding'] },
  ndrf:      { label: 'Rescue Priority',    categories: ['Trapped people', 'Breached embankment', 'Flooding'] },
  municipal: { label: 'Infrastructure Issues', categories: ['Blocked road', 'Structural damage', 'Flooding'] },
  command:   { label: 'Command Overview',    categories: [] },
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [department, setDepartment] = useState('command');
  const [connected, setConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [flyTo, setFlyTo] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchCenter, setSearchCenter] = useState(null);
  const [nearbyDisasters, setNearbyDisasters] = useState([]);
  const watchRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setUser(me);
        setDepartment(me.department);
      } catch {
        setToken('');
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    setToken(res.access_token);
    setUser(res.user);
    setDepartment(res.user.department);
    return res.user;
  };

  const logout = () => {
    setToken('');
    setUser(null);
    setDepartment('command');
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by this browser');
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    const pos = (p) => {
      setMyLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      setLocationLoading(false);
    };
    const err = (e) => {
      setLocationError(e.message || 'Location access denied');
      setLocationLoading(false);
    };
    navigator.geolocation.getCurrentPosition(pos, err, { enableHighAccuracy: true, timeout: 10000 });
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(pos, err, { enableHighAccuracy: true, maximumAge: 5000 });
  };

  useEffect(() => {
    if (user) requestLocation();
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, [user]);

  useEffect(() => {
    const ws = connectSocket((msg) => {
      setLiveEvents((prev) => [{ ...msg, ts: Date.now() }, ...prev].slice(0, 20));
    });
    wsRef.current = ws;
    if (ws) {
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
    }
    return () => ws && ws.close();
  }, []);

  const perms = useMemo(() => {
    if (!user) return { isAdmin: false, isCommand: false, canSwitch: false, canRefreshModel: false, canSimulateWebhook: false, canBroadcastAll: false, canAccessCategory: () => false, canDispatchDept: () => false, deptHighlight: null };
    const isAdmin = user.role === 'admin';
    const isCommand = isAdmin || user.department === 'command';
    return {
      isAdmin,
      isCommand,
      canSwitch: isAdmin || user.department === 'command',
      canRefreshModel: isAdmin || user.department === 'command',
      canSimulateWebhook: isAdmin || user.department === 'command',
      canBroadcastAll: isAdmin || user.department === 'command',
      canAccessCategory: (cat) => {
        if (isCommand) return true;
        const allowed = CATEGORY_DEPT_MAP[cat];
        return allowed ? allowed.includes(user.department) : false;
      },
      canDispatchDept: (resDept) => {
        if (isCommand) return true;
        return resDept === user.department;
      },
      deptHighlight: DEPT_HIGHLIGHTS[user.department] || null,
    };
  }, [user]);

  return (
    <AppCtx.Provider value={{
      user, authReady, login, logout,
      department, setDepartment, DEPARTMENTS,
      connected, liveEvents, flyTo, setFlyTo,
      perms, CATEGORY_DEPT_MAP,
      myLocation, locationError, locationLoading, requestLocation,
      haversine,
      searchCenter, setSearchCenter, nearbyDisasters, setNearbyDisasters,
    }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
