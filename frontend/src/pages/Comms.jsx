import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { Smartphone, MessageCircle, Radio, Send, Terminal, Clock, Info, Bot, Lock } from 'lucide-react';

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts * 1000) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const STATUS_CLASS = {
  sent: 'badge-stable', queued: 'badge-elevated', simulated: 'badge-soft', failed: 'badge-critical',
};

const TEMPLATES = [
  'FLOOD ALERT {ward}: water rising, move to higher ground & nearest shelter now. — PRAHARI',
  'CURFEW NOTICE {ward}: stay indoors, rescue teams deployed. — PRAHARI',
  'RELIEF UPDATE {ward}: drinking water + ration at Govt School shelter. — PRAHARI',
];

export default function Comms() {
  const { liveEvents, perms } = useApp();
  const [wards, setWards] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [channel, setChannel] = useState('sms');
  const [message, setMessage] = useState(TEMPLATES[0]);
  const [selected, setSelected] = useState([]);
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [gateway, setGateway] = useState(null);

  // webhook simulator state
  const [simChannel, setSimChannel] = useState('sms');
  const [simFrom, setSimFrom] = useState('+919876543210');
  const [simBody, setSimBody] = useState('HELP water rising in Ward 4 riverside, trapped');
  const [simResult, setSimResult] = useState(null);

  const load = () => {
    api.wards().then(setWards).catch(() => {});
    api.smsAlerts().then(setAlerts).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (liveEvents.length) load(); }, [liveEvents.length]); // eslint-disable-line

  // Show whether a real SMS gateway is configured (Twilio/MSG91) or simulated.
  useEffect(() => {
    api.smsStatus().then(setGateway).catch(() => setGateway({ simulated: true }));
  }, []);

  const toggleWard = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const send = async () => {
    setSending(true);
    try {
      const sent = await api.smsSend({
        channel,
        message,
        ward_ids: selected.length ? selected : [],
        phone: phone.trim(),
      });
      setSelected([]);
      setResult(sent.length ? `Sent to ${sent.length} recipient(s) — status: ${sent[0].status}` : 'No ward targeted (none at risk?)');
      load();
    } catch (e) {
      setResult('Broadcast failed — ' + e.message);
    }
    setSending(false);
  };

  const simulate = async () => {
    setSimResult(null);
    try {
      const res = await api.smsWebhook({
        From: simFrom || '+919876543210',
        Body: simBody || 'water rising',
        channel: simChannel,
      });
      setSimResult(res);
      load();
    } catch (e) {
      setSimResult({ ok: false, error: e.message });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Offline-First Comms</h2>
          <p className="page-sub">
            SMS and WhatsApp keep reporting alive when the app or internet is down. Carriers post to a webhook;
            outbound alerts broadcast to affected wards and appear on every dashboard live.
          </p>
        </div>
        <span className="badge badge-soft" style={{ fontSize: 11, padding: '7px 12px' }}>
          <Radio size={12} aria-hidden="true" /> Webhook: <span className="mono">POST /api/sms/webhook</span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="panel panel-hover panel-pad">
          <div className="panel-head">
            <h3 className="panel-title"><Send size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" /> Broadcast Alert</h3>
          </div>

          <label className="field-label" style={{ marginTop: 0 }}>Channel</label>
          <div role="group" aria-label="Broadcast channel" style={{ display: 'flex', gap: 6 }}>
            <button className={`dept-btn${channel === 'sms' ? ' dept-btn-active' : ''}`} onClick={() => setChannel('sms')} aria-pressed={channel === 'sms'}>
              <Smartphone size={13} aria-hidden="true" /> SMS
            </button>
            {perms.canBroadcastAll && (
              <>
                <button className={`dept-btn${channel === 'whatsapp' ? ' dept-btn-active' : ''}`} onClick={() => setChannel('whatsapp')} aria-pressed={channel === 'whatsapp'}>
                  <MessageCircle size={13} aria-hidden="true" /> WhatsApp
                </button>
                <button className={`dept-btn${channel === 'telegram' ? ' dept-btn-active' : ''}`} onClick={() => setChannel('telegram')} aria-pressed={channel === 'telegram'}>
                  <Bot size={13} aria-hidden="true" /> Telegram
                </button>
              </>
            )}
            {!perms.canBroadcastAll && (
              <span className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                <Lock size={11} aria-hidden="true" /> SMS only for department operators
              </span>
            )}
          </div>

          <div className="field-hint" style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10, lineHeight: 1.5 }}>
            <Info size={13} style={{ color: gateway?.simulated ? 'var(--text-dim)' : 'var(--primary)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            {gateway?.simulated
              ? 'Simulated mode — add a TELEGRAM_BOT_TOKEN (free) or Twilio/MSG91 keys in backend/.env to deliver real alerts.'
              : `Live delivery via ${gateway?.gateway}.`}
            {gateway?.error && (
              <span style={{ color: 'var(--risk-elevated)' }}>
                Last attempt failed: <span className="mono">{gateway.error}</span>
              </span>
            )}
          </div>

          <label className="field-label">Message template <span className="mono" style={{ textTransform: 'none' }}>{'{ward}'}</span> is replaced per ward</label>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {TEMPLATES.map((t, i) => (
              <button key={i} className="btn btn-secondary btn-sm" onClick={() => setMessage(t)}>{`Template ${i + 1}`}</button>
            ))}
          </div>

          <label className="field-label">Target wards {selected.length > 0 && <span className="badge badge-soft">{selected.length}</span>}</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 150, overflowY: 'auto', padding: 4 }}>
            {wards.map((w) => (
              <button
                key={w.id}
                onClick={() => toggleWard(w.id)}
                aria-pressed={selected.includes(w.id)}
                className={`dept-btn${selected.includes(w.id) ? ' dept-btn-active' : ''}`}
                style={{ fontSize: 11 }}
              >
                {w.name}
              </button>
            ))}
            {wards.length === 0 && <div className="field-hint">No wards loaded — is the backend running?</div>}
          </div>
          <p className="field-hint">No wards selected → defaults to all high/medium-risk wards.</p>

          <label className="field-label">Optional single recipient {channel === 'telegram' ? '(Telegram chat ID)' : '(phone)'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={channel === 'telegram' ? 'e.g. 123456789' : '+91… (empty = broadcast)'} />
            {channel === 'telegram' && perms.canBroadcastAll && (
              <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={async () => {
                try {
                  const res = await api.telegramLatest();
                  if (res.chat_id != null) { setPhone(String(res.chat_id)); setResult(`Chat ID ${res.chat_id}${res.name ? ` (${res.name})` : ''} filled — send now.`); }
                  else setResult(res.error || 'No chat found — open your bot in Telegram and message it first.');
                } catch (e) { setResult('Fetch failed — ' + e.message); }
              }}>
                <Bot size={13} aria-hidden="true" /> Fetch my chat ID
              </button>
            )}
          </div>
          {channel === 'telegram' && perms.canBroadcastAll && (
            <p className="field-hint">Setup: create a bot in Telegram with @BotFather, paste its token into <span className="mono">TELEGRAM_BOT_TOKEN</span> in backend/.env, restart, message your bot once, then press “Fetch my chat ID”.</p>
          )}

          <button className="btn btn-block" style={{ marginTop: 14 }} disabled={sending || !message.trim()} onClick={send}>
            <Send size={14} aria-hidden="true" />
            {sending ? 'Broadcasting…' : `Broadcast via ${channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`}
          </button>
          {result && <div className="login-error sim-ok" style={{ marginTop: 10 }}>{result}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {perms.canSimulateWebhook && (
          <div className="panel panel-hover panel-pad">
            <div className="panel-head">
              <h3 className="panel-title"><Terminal size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" /> Inbound Webhook Simulator</h3>
            </div>
            <p className="panel-sub" style={{ marginBottom: 12 }}>
              Send a test message exactly as a carrier would. Channel SMS, WhatsApp, or Twilio-style — all
              verified by the same AI pipeline as the app.
            </p>
            <label className="field-label" style={{ marginTop: 0 }}>Channel</label>
            <div role="group" aria-label="Simulator channel" style={{ display: 'flex', gap: 6 }}>
              <button className={`dept-btn${simChannel === 'sms' ? ' dept-btn-active' : ''}`} onClick={() => setSimChannel('sms')} aria-pressed={simChannel === 'sms'}>SMS</button>
              <button className={`dept-btn${simChannel === 'whatsapp' ? ' dept-btn-active' : ''}`} onClick={() => setSimChannel('whatsapp')} aria-pressed={simChannel === 'whatsapp'}>WhatsApp</button>
            </div>
            <label className="field-label">From / sender phone</label>
            <input type="text" value={simFrom} onChange={(e) => setSimFrom(e.target.value)} />
            <label className="field-label">Message text</label>
            <textarea rows={3} value={simBody} onChange={(e) => setSimBody(e.target.value)} placeholder="HELP water rising in Ward 4 riverside, trapped" />
            <button className="btn btn-block" style={{ marginTop: 12 }} onClick={simulate}>
              <Send size={14} aria-hidden="true" /> Simulate inbound report
            </button>
            {simResult && (
              <div className={`login-error ${simResult.ok ? 'sim-ok' : ''}`} style={{ marginTop: 10 }}>
                {simResult.ok
                  ? `Report #${simResult.report_id} ingested · ${simResult.category} · ${simResult.status}`
                  : `Failed: ${simResult.error}`}
              </div>
            )}
          </div>
          )}

          <div className="panel panel-hover panel-pad">
            <div className="panel-head">
              <h3 className="panel-title"><Clock size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" /> Outbound Log</h3>
              <span className="badge badge-soft">{alerts.length}</span>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {alerts.length === 0 && <div className="empty-state">No outbound alerts yet.</div>}
              {alerts.map((a) => (
                <div key={a.id} className="feed-item" style={{ marginBottom: 7 }}>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span className={`chip ${a.channel === 'whatsapp' ? 'chip-health' : 'chip-police'}`}>{a.channel}</span>
                    <span>{a.phone}{a.ward_id ? ` · ward ${a.ward_id}` : ''}</span>
                    <span className={`badge ${STATUS_CLASS[a.status] || 'badge-soft'}`}>{a.status}</span>
                    <span>{ago(a.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5 }}>{a.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
