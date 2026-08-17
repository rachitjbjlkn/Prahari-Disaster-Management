import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Rail from './components/Rail';
import Topbar from './components/Topbar';
import MobileNav from './components/MobileNav';
import Overview from './pages/Overview';
import HazardMap from './pages/HazardMap';
import CitizenReports from './pages/CitizenReports';
import Resources from './pages/Resources';
import Comms from './pages/Comms';
import Login from './pages/Login';

function Shell() {
  const { user, authReady } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!authReady) {
    return <div className="login-wrap"><div className="skeleton" style={{ width: 280, height: 340, borderRadius: 14 }} /></div>;
  }

  if (!user) return <Login />;

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Rail />
        <MobileNav open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <Topbar onMenuOpen={() => setDrawerOpen(true)} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/hazard" element={<HazardMap />} />
            <Route path="/reports" element={<CitizenReports />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/comms" element={<Comms />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
