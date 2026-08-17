import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Radio, ShieldCheck, LogIn, Loader2 } from 'lucide-react';

const DEMO_ACCOUNTS = [
  ['admin', 'admin123', 'command', 'Full admin'],
  ['command', 'command123', 'command', 'Operator'],
  ['fire', 'fire123', 'fire', 'Fire dept'],
  ['police', 'police123', 'police', 'Police dept'],
  ['health', 'health123', 'health', 'Health dept'],
  ['ndrf', 'ndrf123', 'ndrf', 'NDRF rescue'],
  ['municipal', 'municipal123', 'municipal', 'Municipal'],
];

export default function Login() {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed — is the backend running?');
    }
    setBusy(false);
  };

  const quick = async (u, p) => {
    setUsername(u);
    setPassword(p);
    setBusy(true);
    setError('');
    try { await login(u, p); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="rail-mark" style={{ marginBottom: 0 }}>
            <Radio size={20} strokeWidth={2.4} color="#fff" />
          </span>
          <div>
            <h1 className="login-title">PRAHARI</h1>
            <p className="login-sub">Predictive Resource &amp; Hazard Alert Response Intelligence</p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field-label" style={{ margin: 0 }} htmlFor="login-user">Username</label>
          <input id="login-user" type="text" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} placeholder="e.g. fire" />
          <label className="field-label" style={{ margin: 0 }} htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

          {error && (
            <div className="login-error" role="alert">
              <ShieldCheck size={14} aria-hidden="true" /> {error}
            </div>
          )}

          <button className="btn btn-block" type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <LogIn size={15} aria-hidden="true" />}
            {busy ? 'Signing in…' : 'Sign in to Control Room'}
          </button>
        </form>

        <div style={{ marginTop: 22 }}>
          <div className="login-divider">DEMO ACCOUNTS</div>
          <div className="login-grid">
            {DEMO_ACCOUNTS.map(([u, p, dept, label]) => (
              <button key={u} className="login-chip" onClick={() => quick(u, p)} disabled={busy}>
                <span className={`chip chip-${dept}`}>{dept}</span>
                <span className="mono">{u}</span>
                <span className="mono login-chip-pass">{p}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
              </button>
            ))}
          </div>
          <p className="login-note">
            Role-based access: Admin sees everything. Department operators see only their
            categories, resources, and comms. Fire can&apos;t dispatch police units.
          </p>
        </div>
      </div>
    </div>
  );
}
