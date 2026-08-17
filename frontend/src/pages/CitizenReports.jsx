import { useEffect, useState } from 'react';
import { api, API_BASE } from '../api/client';
import MapView from '../components/MapView';
import { useApp } from '../context/AppContext';
import { MapPin, Send, Inbox, Smartphone, MessageCircle, Globe, RotateCw, ImagePlus, X, Lock } from 'lucide-react';

const CATEGORIES = ['Blocked road', 'Breached embankment', 'Trapped people', 'Flooding', 'Structural damage'];
const STATUS_CLASS = { verified: 'badge-verified', pending: 'badge-pending', flagged: 'badge-flagged', resolved: 'badge-soft' };
const CHANNELS = [
  { id: 'app', label: 'App', icon: Globe },
  { id: 'sms', label: 'SMS', icon: Smartphone },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts * 1000) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CitizenReports() {
  const [reports, setReports] = useState([]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('app');
  const [phone, setPhone] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { liveEvents, perms } = useApp();

  const load = () => api.reports().then(setReports).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (liveEvents.length) load(); }, [liveEvents.length]); // eslint-disable-line

  const submit = async () => {
    if (!description.trim() || !pin) return;
    setSubmitting(true);
    try {
      let imageUrl = '';
      if (image) imageUrl = (await api.uploadImage(image)).url;
      await api.submitReport({ category, description, lat: pin.lat, lng: pin.lng, channel, phone: phone.trim(), image_url: imageUrl });
      setDescription('');
      setPin(null);
      setPhone('');
      setImage(null);
      setPreview('');
      load();
    } catch (e) {
      alert('Could not submit report — is the backend running? ' + e.message);
    }
    setSubmitting(false);
  };

  const setStatus = async (id, status) => {
    setBusyId(id);
    try {
      await api.reportStatus(id, status);
      load();
    } catch (e) {
      alert('Could not update status — ' + e.message);
    }
    setBusyId(null);
  };

  return (
    <div className="pane-grid">
      <div className="pane-main">
        <MapView reports={reports} pinMode={pinMode} onPin={(latlng) => { setPin(latlng); setPinMode(false); }} height="100%" />
        {pin && (
          <div className="map-legend mono" style={{ top: 'auto', bottom: 14, left: 14 }}>
            <MapPin size={12} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </div>
        )}
      </div>

      <div className="pane-side">
        <div>
          <h2 className="page-title" style={{ fontSize: 19 }}>Citizen Reporting</h2>
          <p className="page-sub" style={{ marginTop: 4 }}>
            Reports from the app, SMS, and WhatsApp all run through the same AI verification —
            geography, category, and text clustering plus an optional LLM plausibility pass.
          </p>
        </div>

        <div className="panel panel-hover panel-pad">
          <h3 className="panel-title" style={{ marginBottom: 4 }}>Submit Ground Report</h3>
          <label className="field-label" htmlFor="rep-channel" style={{ marginTop: 10 }}>Channel</label>
          <div role="group" aria-label="Report channel" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  onClick={() => setChannel(c.id)}
                  aria-pressed={channel === c.id}
                  className={`dept-btn${channel === c.id ? ' dept-btn-active' : ''}`}
                  style={{ fontSize: 12 }}
                >
                  <Icon size={13} aria-hidden="true" /> {c.label}
                </button>
              );
            })}
          </div>
          {channel !== 'app' && (
            <>
              <label className="field-label" htmlFor="rep-phone">Sender phone</label>
              <input id="rep-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
            </>
          )}
          <label className="field-label" htmlFor="rep-cat">Category</label>
          <select id="rep-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="field-label" htmlFor="rep-desc">Description</label>
          <textarea id="rep-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you seeing on the ground?" />
          <label className="field-label" htmlFor="rep-image">Photo evidence</label>
          <div className="upload-row">
            <label className="btn btn-secondary btn-sm upload-btn" style={{ marginBottom: 0 }}>
              <ImagePlus size={13} aria-hidden="true" />
              {image ? 'Change photo' : 'Attach photo'}
              <input id="rep-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  if (!f) return;
                  setImage(f);
                  setPreview(URL.createObjectURL(f));
                }} />
            </label>
            {image && (
              <button className="btn btn-sm" style={{ padding: '6px 8px', color: 'var(--risk-critical)' }} onClick={() => { setImage(null); setPreview(''); }} aria-label="Remove photo">
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
          {preview && <img className="report-preview" src={preview} alt="Report photo preview" />}
          <label className="field-label">Location</label>
          <button className="btn btn-secondary btn-block btn-sm" onClick={() => setPinMode(true)} aria-pressed={pinMode}>
            <MapPin size={13} aria-hidden="true" />
            {pinMode ? 'Click the map now…' : pin ? 'Location set — click to change' : 'Click map to set location'}
          </button>
          {pin && <div className="field-hint mono">{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</div>}
          <button className="btn btn-block" style={{ marginTop: 14 }} disabled={submitting || !pin || !description.trim()} onClick={submit}>
            <Send size={14} aria-hidden="true" />
            {submitting ? 'Verifying…' : 'Submit Report'}
          </button>
        </div>

        <div className="panel panel-hover panel-pad" style={{ flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <h3 className="panel-title">
              Verified Feed <span className="badge badge-soft">{reports.length}</span>
            </h3>
            {!perms.isCommand && (
              <span className="badge badge-soft" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={10} aria-hidden="true" /> Dept-scoped
              </span>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {reports.length === 0 && (
              <div className="empty-state">
                <Inbox size={26} aria-hidden="true" />
                <div>No reports yet — submit the first ground report.</div>
              </div>
            )}
            {reports.map((r) => (
              <div key={r.id} className="feed-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.category}
                    <span className={`chip ${r.channel === 'whatsapp' ? 'chip-health' : r.channel === 'sms' ? 'chip-police' : 'chip-ndrf'}`}>{r.channel}</span>
                  </span>
                  <span className={`badge ${STATUS_CLASS[r.status] || 'badge-soft'}`}>
                    {r.status}{r.corroboration_count > 0 ? ` · ${r.corroboration_count + 1} reports` : ''}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.description}</p>
                {r.image_url && (
                  <a href={API_BASE + r.image_url} target="_blank" rel="noreferrer" title="Open photo" style={{ marginTop: 8 }}>
                    <img className="report-thumb" src={API_BASE + r.image_url} alt={`Evidence for ${r.category}`} loading="lazy" />
                  </a>
                )}
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 7, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{r.lat.toFixed(3)}, {r.lng.toFixed(3)}{r.phone ? ` · ${r.phone}` : ''}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{r.ai_note}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{ago(r.created_at)}</span>
                </div>
                {r.status !== 'resolved' && perms.canAccessCategory(r.category) && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                    <button className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => setStatus(r.id, 'verified')}>
                      <RotateCw size={12} aria-hidden="true" /> Verify
                    </button>
                    <button className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => setStatus(r.id, 'resolved')}>
                      Resolve
                    </button>
                    {r.status !== 'flagged' && (
                      <button className="btn btn-secondary btn-sm" style={{ color: 'var(--risk-critical)' }} disabled={busyId === r.id} onClick={() => setStatus(r.id, 'flagged')}>
                        Flag
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
