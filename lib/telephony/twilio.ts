import twilio from 'twilio';
import { HttpError } from '../http';
export const sidPattern = /^CA[0-9a-fA-F]{32}$/;
export function publicUrl(path: string) {
  const base = new URL(process.env.APP_URL || 'http://localhost:3000');
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new HttpError(503, 'Telefonie benötigt eine öffentliche HTTPS-APP_URL.');
  return new URL(path, base).toString();
}
export function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new HttpError(503, 'Twilio-Zugangsdaten fehlen.');
  return twilio(sid, token, { timeout: 10000, autoRetry: false });
}
export async function twilioForm(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN, account = process.env.TWILIO_ACCOUNT_SID;
  if (!token || !account) throw new HttpError(503, 'Twilio ist nicht eingerichtet.');
  if (!request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) throw new HttpError(415, 'Twilio-Formulardaten erforderlich.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'Leere Anfrage.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 32768) { await reader.cancel(); throw new HttpError(413, 'Twilio-Anfrage zu groß.'); } chunks.push(value); }
  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new HttpError(400, 'Doppelte Formularfelder.');
  const fields = Object.fromEntries(params);
  const url = new URL(request.url);
  const canonical = publicUrl(url.pathname + url.search);
  if (!twilio.validateRequest(token, request.headers.get('x-twilio-signature') || '', canonical, fields) || fields.AccountSid !== account) throw new HttpError(401, 'Ungültige Twilio-Signatur.');
  return fields;
}
export function xml(response: twilio.twiml.VoiceResponse) { return new Response(response.toString(), { headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } }); }
export function voiceResponse() { return new twilio.twiml.VoiceResponse(); }
export function speak(message: string) { const response = voiceResponse(); response.say({ language: 'de-DE' }, message); return response; }
