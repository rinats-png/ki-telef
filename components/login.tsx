'use client';
import { useState } from 'react';
import { ArrowRight, ShieldCheck, PhoneCall, Headphones } from 'lucide-react';
export default function Login() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      window.location.assign('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.'); setBusy(false); }
  }
  return <main className="login-layout"><section className="login-story"><a className="brand" href="/">STORM<span>Schädlingsbekämpfung</span></a><div className="login-message"><div className="eyebrow"><span className="live-dot" /> TELEFONASSISTENZ</div><h1>Ein gutes Gefühl.<br />Schon beim<br /><em>ersten Anruf.</em></h1><p>Alle Anliegen im Blick. Mehr Zeit für das,<br />was zählt: Ihren Kunden helfen.</p><div className="login-chips"><span><PhoneCall size={16} /> Anfragen erfassen</span><span><Headphones size={16} /> Einsätze koordinieren</span></div></div><small>STORM Schädlingsbekämpfung GmbH · Karben</small></section><section className="login-panel"><div className="login-form"><div className="icon-square"><ShieldCheck /></div><div className="eyebrow muted">IHR DISPOSITIONSCENTER</div><h2>Willkommen zurück.</h2><p className="muted">Melden Sie sich an, um Ihre Anfragen zu verwalten.</p><form onSubmit={submit}><label htmlFor="username">Benutzername</label><input id="username" name="username" autoComplete="username" required maxLength={100} placeholder="Ihr Benutzername" /><label htmlFor="password">Passwort</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} placeholder="Ihr Passwort" />{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary login-submit" disabled={busy}>{busy ? 'Anmeldung läuft …' : 'Sicher anmelden'}<ArrowRight size={17} /></button></form><p className="login-help"><ShieldCheck size={14} /> Geschützter Bereich · Nur für berechtigte Mitarbeitende</p></div></section></main>;
}
