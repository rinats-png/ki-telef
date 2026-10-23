import type { Employee, OutlookArtifact } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { microsoftCredentials, useGraphMock } from './integrations';
import { db } from './db';
import { HttpError } from './http';
import type { Mode } from './smart/validation';
export const MOCK_MODE = useGraphMock('live');
export function graphIsMock(mode: Mode) { return useGraphMock(mode); }
const base = 'https://graph.microsoft.com/v1.0';
const propertyId = 'String {79cf9843-8f41-4aab-94ae-02521fa7ac40} Name StormOperationId';
let cachedToken: { token: string; expires: number; client: string } | undefined;
let pendingToken: Promise<string> | undefined;
async function accessToken() {
  const { tenant, client, secret } = microsoftCredentials();
  if (!tenant || !client || !secret) throw new HttpError(503, 'Microsoft-365-Zugangsdaten fehlen. Mock-Modus aktivieren oder Entra konfigurieren.');
  const key = `${tenant}:${client}`;
  if (cachedToken?.client === key && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client, client_secret: secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new HttpError(502, 'Microsoft-365-Anmeldung fehlgeschlagen. Entra-Konfiguration prüfen.');
    const data = await response.json();
    if (typeof data.access_token !== 'string') throw new HttpError(502, 'Keine gültige Microsoft-Sitzung erhalten.');
    cachedToken = { token: data.access_token, client: key, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
    return cachedToken.token;
  })();
  try { return await pendingToken; } finally { pendingToken = undefined; }
}
export async function graphRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('https://') ? new URL(path) : new URL(base + path);
  if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) throw new HttpError(502, 'Ungültige Microsoft-Folgeadresse.');
  const token = await accessToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"', ...init.headers }, signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!init.method && [429, 503].includes(response.status) && attempt < 2) {
      const delay = Math.min(3, Math.max(1, Number(response.headers.get('retry-after')) || 1));
      await new Promise(resolve => setTimeout(resolve, delay * 1000)); continue;
    }
    if (!response.ok) {
      if (response.status === 401) cachedToken = undefined;
      throw new HttpError(502, `Microsoft Graph meldet HTTP ${response.status}. Die Aktion wurde nicht bestätigt.`);
    }
    if (response.status === 202 || response.status === 204) return undefined as T;
    return await response.json() as T;
  }
  throw new HttpError(502, 'Microsoft Graph ist vorübergehend nicht verfügbar.');
}
export type Slot = { start: string; end: string };
export function candidateSlots(now = new Date(), days = 7): Slot[] {
  const slots: Slot[] = [];
  let instant = Math.ceil((now.getTime() + 15 * 60000) / 1800000) * 1800000;
  const until = now.getTime() + days * 86400000;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (; instant < until; instant += 1800000) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const hour = Number(parts.hour), minute = Number(parts.minute);
    if (!['Sat', 'Sun'].includes(parts.weekday) && hour >= 8 && (hour < 16 || hour === 16 && minute === 0)) slots.push({ start: new Date(instant).toISOString(), end: new Date(instant + 1800000).toISOString() });
  }
  return slots;
}
export function overlaps(slot: Slot, busy: { start: string | Date; end: string | Date }[]) {
  return busy.some(b => new Date(b.start).getTime() < new Date(slot.end).getTime() && new Date(b.end).getTime() > new Date(slot.start).getTime());
}
function graphDate(value: string) { return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + 'Z'; }
export async function calendarBusy(employee: Employee, mode: Mode, from: string, to: string) {
  const local = await db.outlookArtifact.findMany({ where: { employeeId: employee.id, kind: 'EVENT', state: { in: ['PENDING', 'CREATED', 'SIMULATED'] }, start: { lt: new Date(to) }, end: { gt: new Date(from) } } });
  const busy = local.filter(a => a.start && a.end).map(a => ({ start: a.start!.toISOString(), end: a.end!.toISOString() }));
  if (graphIsMock(mode)) return busy;
  type GraphEvent = { start: { dateTime: string }; end: { dateTime: string }; isCancelled?: boolean; showAs?: string };
  let path: string | undefined = `/users/${encodeURIComponent(employee.upn)}/calendarView?${new URLSearchParams({ startDateTime: from, endDateTime: to, '$select': 'start,end,isCancelled,showAs', '$top': '100' })}`;
  for (let page = 0; path && page < 20; page++) {
    const result: { value: GraphEvent[]; '@odata.nextLink'?: string } = await graphRequest(path);
    if (!Array.isArray(result.value)) throw new HttpError(502, 'Ungültige Kalenderantwort.');
    for (const event of result.value) if (!event.isCancelled && event.showAs !== 'free') {
      const start = graphDate(event.start?.dateTime ?? ''), end = graphDate(event.end?.dateTime ?? '');
      if (!Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) throw new HttpError(502, 'Kalender enthält ungültige Zeitangaben. Bitte manuell prüfen.');
      busy.push({ start, end });
    }
    path = result['@odata.nextLink'];
    if (page === 19 && path) throw new HttpError(502, 'Kalenderabfrage unvollständig. Bitte manuell prüfen.');
  }
  return busy;
}
export async function availableSlots(employee: Employee, mode: Mode, now = new Date()) {
  const candidates = candidateSlots(now);
  if (!candidates.length) return [];
  const busy = await calendarBusy(employee, mode, candidates[0].start, candidates.at(-1)!.end);
  return candidates.filter(s => !overlaps(s, busy)).slice(0, 3);
}
function safeHtml(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)).replace(/\n/g, '<br>'); }
export async function syncArtifact(artifact: OutlookArtifact, employee: Employee) {
  if (['CREATED', 'SIMULATED', 'ACCEPTED'].includes(artifact.state)) return artifact;
  if (artifact.isMock) return db.outlookArtifact.update({ where: { id: artifact.id }, data: { remoteId: `mock-${artifact.kind.toLowerCase()}-${artifact.id}`, state: 'SIMULATED' } });
  const root = `/users/${encodeURIComponent(employee.upn)}`;
  if (artifact.kind === 'EVENT') {
    const result = await createOutlookCalendarEvent(employee.upn, { subject: artifact.subject, bodyText: artifact.bodyText, start: artifact.start!.toISOString(), end: artifact.end!.toISOString(), transactionId: artifact.id }, { mode: 'live', requireLive: true });
    if (!result?.id) throw new HttpError(502, 'Kalenderbuchung nicht bestätigt.');
    return db.outlookArtifact.update({ where: { id: artifact.id }, data: { remoteId: result.id, state: 'CREATED' } });
  }
  let remoteId = artifact.remoteId;
  if (!remoteId) {
    await db.outlookArtifact.update({ where: { id: artifact.id }, data: { state: 'CREATING' } });
    try {
      const draft = await createOutlookDraftMessage(employee.upn, { subject: artifact.subject, bodyText: artifact.bodyText, to: artifact.recipient, operationId: artifact.id }, { mode: 'live', requireLive: true, recoverOnly: ['CREATING', 'CREATE_UNKNOWN'].includes(artifact.state) });
      remoteId = draft.id;
    } catch (error) { await db.outlookArtifact.update({ where: { id: artifact.id }, data: { state: 'CREATE_UNKNOWN' } }); throw error; }
    if (!remoteId) throw new HttpError(502, 'E-Mail-Entwurf nicht bestätigt.');
    await db.outlookArtifact.update({ where: { id: artifact.id }, data: { remoteId } });
  }
  if (artifact.kind === 'DRAFT') return db.outlookArtifact.update({ where: { id: artifact.id }, data: { remoteId, state: 'CREATED' } });
  // Reconcile an interrupted send rather than automatically duplicating customer mail.
  if (['SENDING', 'UNKNOWN'].includes(artifact.state)) {
    const message = await graphRequest<{ isDraft: boolean }>(`${root}/messages/${encodeURIComponent(remoteId)}?$select=isDraft`);
    if (!message.isDraft) return db.outlookArtifact.update({ where: { id: artifact.id }, data: { state: 'ACCEPTED' } });
    throw new HttpError(409, 'E-Mail-Versandstatus unklar. Vor erneutem Versand im Outlook prüfen.');
  }
  await db.outlookArtifact.update({ where: { id: artifact.id }, data: { remoteId, state: 'SENDING' } });
  try {
    await sendOutlookEmail(employee.upn, { draftId: remoteId, subject: artifact.subject, bodyText: artifact.bodyText, to: artifact.recipient, operationId: artifact.id }, { mode: 'live', requireLive: true });
    return db.outlookArtifact.update({ where: { id: artifact.id }, data: { state: 'ACCEPTED' } });
  } catch (error) {
    await db.outlookArtifact.update({ where: { id: artifact.id }, data: { state: 'UNKNOWN' } }); throw error;
  }
}
export function operationId() { return randomUUID(); }

export async function getEmployeeCalendarSlots(upn: string, options: { mode?: Mode; now?: Date } = {}) {
  const mode = options.mode ?? 'live';
  const employee = await db.employee.findFirst({ where: { upn, mode, active: true } });
  if (!employee) throw new HttpError(404, 'Kein aktiver Mitarbeiter für dieses Postfach konfiguriert.');
  return availableSlots(employee, mode, options.now);
}
export type OutlookEventDetails = { subject: string; bodyText: string; start: string; end: string; transactionId: string };
export type OutlookMessageDetails = { subject: string; bodyText: string; to: string; operationId: string; draftId?: string };
export async function createOutlookCalendarEvent(upn: string, details: OutlookEventDetails, options: { mode?: Mode; requireLive?: boolean; recoverOnly?: boolean } = {}) {
  if (!(new Date(details.start) < new Date(details.end))) throw new HttpError(400, 'Ungültiger Terminzeitraum.');
  if (!options.requireLive && graphIsMock(options.mode ?? 'live')) return { id: `mock-event-${details.transactionId}`, mock: true };
  const result = await graphRequest<{ id: string }>(`/users/${encodeURIComponent(upn)}/events`, { method: 'POST', body: JSON.stringify({ subject: details.subject, body: { contentType: 'HTML', content: safeHtml(details.bodyText) }, start: { dateTime: details.start, timeZone: 'UTC' }, end: { dateTime: details.end, timeZone: 'UTC' }, transactionId: details.transactionId, showAs: 'busy' }) });
  if (!result?.id) throw new HttpError(502, 'Microsoft hat keinen Kalendertermin bestätigt.');
  return { id: result.id, mock: false };
}
export async function createOutlookDraftMessage(upn: string, details: OutlookMessageDetails, options: { mode?: Mode; requireLive?: boolean; recoverOnly?: boolean } = {}) {
  if (!options.requireLive && graphIsMock(options.mode ?? 'live')) return { id: `mock-draft-${details.operationId}`, mock: true };
  const root = `/users/${encodeURIComponent(upn)}`;
  const value = details.operationId.replace(/'/g, "''");
  const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${propertyId}' and ep/value eq '${value}')`;
  const existing = await graphRequest<{ value: { id: string }[] }>(`${root}/messages?${new URLSearchParams({ '$filter': filter, '$select': 'id', '$top': '1' })}`);
  if (!Array.isArray(existing.value)) throw new HttpError(502, 'Ungültige Entwurfsantwort.');
  if (existing.value[0]?.id) return { id: existing.value[0].id, mock: false };
  if (options.recoverOnly) throw new HttpError(409, 'Vorherige Entwurfsanlage ist unklar. Vor erneutem Anlegen das Postfach manuell prüfen.');
  const result = await graphRequest<{ id: string }>(root + '/messages', { method: 'POST', body: JSON.stringify({ subject: details.subject, body: { contentType: 'HTML', content: safeHtml(details.bodyText) }, toRecipients: [{ emailAddress: { address: details.to } }], singleValueExtendedProperties: [{ id: propertyId, value: details.operationId }] }) });
  if (!result?.id) throw new HttpError(502, 'Microsoft hat keinen Entwurf bestätigt.');
  return { id: result.id, mock: false };
}
export async function sendOutlookEmail(upn: string, details: OutlookMessageDetails, options: { mode?: Mode; requireLive?: boolean; recoverOnly?: boolean } = {}) {
  if (!options.requireLive && graphIsMock(options.mode ?? 'live')) return { id: `mock-mail-${details.operationId}`, state: 'SIMULATED' };
  const id = details.draftId ?? (await createOutlookDraftMessage(upn, details, options)).id;
  const path = `/users/${encodeURIComponent(upn)}/messages/${encodeURIComponent(id)}`;
  const message = await graphRequest<{ isDraft: boolean }>(path + '?$select=isDraft');
  if (typeof message.isDraft !== 'boolean') throw new HttpError(502, 'Microsoft-Nachrichtenstatus fehlt.');
  if (message.isDraft) await graphRequest(path + '/send', { method: 'POST' });
  return { id, state: 'ACCEPTED' };
}
