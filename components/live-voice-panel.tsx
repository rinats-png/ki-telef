'use client';
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, PhoneOff, Radio, ShieldCheck } from 'lucide-react';
import type { WebCallSession } from 'retell-client-js-sdk';
export default function LiveVoicePanel({ configured }: { configured: boolean }) {
  const [state, setState] = useState('idle'); const [error, setError] = useState(''); const [talking, setTalking] = useState(false);
  const callRef = useRef<WebCallSession | null>(null);
  useEffect(() => () => { const call = callRef.current; if (call) { void call.end().catch(() => call.disconnect()); } }, []);
  async function start() {
    setError(''); setState('connecting');
    try {
      if (!window.isSecureContext) throw new Error('Der Sprachtest benötigt HTTPS oder localhost.');
      const { RetellClient } = await import('retell-client-js-sdk');
      const client = new RetellClient({ key: 'server-session', baseURL: location.origin, fetch: async (input, init) => {
        const path = new URL(String(input), location.origin).pathname;
        let body: { action: string; callId?: string };
        if (path.endsWith('/create-web-call')) body = { action: 'create' };
        else if (path.includes('/stop-call/')) body = { action: 'stop', callId: decodeURIComponent(path.split('/').at(-1)!) };
        else return Response.json({ error: 'SDK-Aktion nicht freigegeben.' }, { status: 404 });
        return fetch('/api/voice/web-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
      } });
      const call = client.createWebCall({ agent_id: 'server-configured', transcript: false, hooks: {
        onStatus: status => { setState(status); if (status === 'ended') setTalking(false); },
        onAgentStartTalking: () => setTalking(true), onAgentStopTalking: () => setTalking(false),
        onError: e => { setError(e.message || 'Sprachverbindung fehlgeschlagen.'); setState('idle'); },
        onEnd: () => { setState('ended'); callRef.current = null; },
      } });
      callRef.current = call; await call.ready;
    } catch (e) { const call = callRef.current; callRef.current = null; if (call) { void call.end().catch(() => call.disconnect()); } setError(e instanceof Error ? e.message : 'Sprachtest fehlgeschlagen.'); setState('idle'); }
  }
  async function stop() { const call = callRef.current; if (!call) return; try { await call.end(); setState('ended'); callRef.current = null; } catch (e) { call.disconnect(); callRef.current = null; setState('ended'); setError('Audio getrennt. Anbieter-Ende konnte nicht bestätigt werden; Retell-Konsole prüfen.'); } }
  const active = ['connecting', 'live'].includes(state);
  return <section className="live-voice-panel"><div className={`voice-orb ${talking ? 'speaking' : ''}`}><AudioLines size={28} /></div><div className="live-voice-copy"><span className="eyebrow">RETELL · ECHTER SPRACHTEST</span><h2>Mit der Telefonassistenz sprechen.</h2><p>Direkt über Mikrofon und Lautsprecher. Der Voice-Anbieter arbeitet live; Outlook-Aktionen bleiben in diesem Test simuliert.</p><div className="voice-panel-status"><span className={active ? 'live-dot' : 'offline-dot'} />{state === 'connecting' ? 'Verbindung wird aufgebaut …' : state === 'live' ? talking ? 'KI spricht …' : 'Ich höre zu …' : state === 'ended' ? 'Test beendet' : configured ? 'Agent konfiguriert · bereit zum Testen' : 'Retell-Zugangsdaten noch nicht hinterlegt'}</div></div><button className={`button ${active ? 'danger' : 'primary'}`} disabled={!configured} onClick={() => void (active ? stop() : start())}>{active ? <><PhoneOff size={16} />Gespräch beenden</> : <><Mic size={16} />Live-Sprachtest starten</>}</button><div className="voice-test-footnote"><ShieldCheck size={13} />Startet nur nach Klick und Mikrofonfreigabe. Anbietergebühren können anfallen. Kein PSTN-Anruf.</div>{error && <div className="error-banner" role="alert">{error}</div>}</section>;
}
