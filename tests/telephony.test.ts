import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const fakes = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), fetch: vi.fn(), register: vi.fn() }));
vi.mock('twilio', async importOriginal => {
  const actual = await importOriginal<{ default: typeof import('twilio') }>();
  const client = Object.assign((sid: string) => ({ fetch: () => fakes.fetch(sid), update: (value: unknown) => fakes.update(sid, value) }), { create: (value: unknown) => fakes.create(value) });
  return { default: Object.assign(() => ({ calls: client }), actual.default) };
});
vi.mock('retell-sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('retell-sdk')>();
  class FakeRetell { call = { registerPhoneCall: fakes.register }; static verify = actual.default.verify; }
  return { default: FakeRetell };
});
import twilio from 'twilio';
import { db } from '../lib/db';
import { ensureTicket } from '../lib/smart/service';
import { requestTransfer, transferCallback, transferFailed } from '../lib/telephony/service';
import { POST as incoming } from '../app/api/voice/telephony-incoming/route';
import { POST as callEnded } from '../app/api/voice/call-ended/route';
import { storeProviderCallEvent } from '../lib/voice/call-events';
import { dispatchSmart } from '../lib/smart/webhook';
import { useGraphMock } from '../lib/integrations';
const caller = 'CA' + '1'.repeat(32), technician = 'CA' + '2'.repeat(32), account = 'AC' + '3'.repeat(32);
function signed(path: string, extra: Record<string, string> = {}) {
  const fields = { AccountSid: account, CallSid: caller, From: '+496039111111', To: '+496039222222', ...extra };
  const url = `http://localhost:3000${path}`;
  const signature = twilio.getExpectedTwilioSignature('test-token', url, fields);
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body: new URLSearchParams(fields) });
}
beforeEach(async () => {
  vi.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID = account; process.env.TWILIO_AUTH_TOKEN = 'test-token'; process.env.TWILIO_PHONE_NUMBER = '+496039222222'; process.env.RETELL_API_KEY = 'test-key'; process.env.RETELL_AGENT_ID = 'test-agent'; process.env.VOICE_PROVIDER = 'retell'; process.env.STORE_CALL_RECORDINGS = 'true';
  await db.telephonyCall.deleteMany(); await db.callActivity.deleteMany(); await db.outlookArtifact.deleteMany(); await db.slotOffer.deleteMany(); await db.callTicket.deleteMany(); await db.customer.deleteMany(); await db.employee.deleteMany();
  fakes.register.mockResolvedValue({ call_id: 'retell-inbound-1' }); fakes.update.mockResolvedValue({}); fakes.create.mockResolvedValue({ sid: technician }); fakes.fetch.mockResolvedValue({ status: 'in-progress' });
});
afterAll(() => db.$disconnect());
it('validates the canonical Twilio URL and rejects tampered or cross-account webhooks', async () => {
  const req = signed('/api/voice/telephony-incoming');
  const body = await req.text();
  const modified = new Request(req.url, { method: 'POST', headers: req.headers, body: body.replace('111111', '999999') });
  expect((await incoming(modified)).status).toBe(401);
  const wrongPath = signed('/api/voice/telephony-incoming?changed=1');
  const bad = new Request('http://localhost:3000/api/voice/telephony-incoming', { method: 'POST', headers: wrongPath.headers, body: await wrongPath.text() });
  expect((await incoming(bad)).status).toBe(401);
  expect(fakes.register).not.toHaveBeenCalled();
});
it('registers a Retell SIP bridge once, preserves caller metadata and logs customer recognition', async () => {
  await db.customer.create({ data: { mode: 'live', phone: '+496039111111', name: 'Bestandskunde', status: 'EXISTING' } });
  const first = await incoming(signed('/api/voice/telephony-incoming'));
  expect(first.status).toBe(200); expect(await first.text()).toContain('sip:retell-inbound-1@sip.retellai.com');
  const second = await incoming(signed('/api/voice/telephony-incoming')); expect(second.status).toBe(200); expect(fakes.register).toHaveBeenCalledTimes(1);
  expect(fakes.register.mock.calls[0][0]).toMatchObject({ from_number: '+496039111111', direction: 'inbound', metadata: { twilio_call_sid: caller } });
  expect((await db.callTicket.findFirstOrThrow()).customerKind).toBe('EXISTING');
  await dispatchSmart('retell', { event: 'call_started', call: { call_id: 'retell-inbound-1', from_number: '+496039111111' } }, 'live');
  expect(await db.callTicket.count()).toBe(1); expect((await db.telephonyCall.findFirstOrThrow()).state).toBe('AI_CONNECTED');
});
async function setupTransfer() {
  await incoming(signed('/api/voice/telephony-incoming'));
  const ticket = await db.callTicket.findFirstOrThrow();
  await db.employee.create({ data: { id: 'tech', mode: 'live', name: 'Techniker', role: 'EMERGENCY_TECH', upn: 'tech@example.com', availability: 'AVAILABLE', directPhone: '+491701234567' } });
  await db.callTicket.update({ where: { id: ticket.id }, data: { assignedEmployeeId: 'tech', urgency: 'CRITICAL' } }); return ticket;
}
it('dials an allowlisted employee once and requires DTMF acceptance plus conference join', async () => {
  const ticket = await setupTransfer();
  const first = await requestTransfer(ticket.id, 'Akuter Rattenbefall im Wohnraum');
  expect(first.status).toBe('dialing'); expect(first.transfer_executed).toBe(false);
  await requestTransfer(ticket.id, 'Retry'); expect(fakes.create).toHaveBeenCalledTimes(1);
  const job = await db.transferJob.findFirstOrThrow();
  const whisper = await transferCallback('whisper', job.id, { CallSid: technician }); expect(whisper.toString()).toContain('Drücken Sie 1');
  await transferCallback('accept', job.id, { CallSid: technician, Digits: '1' });
  expect((await db.transferJob.findFirstOrThrow()).state).toBe('ACCEPTED');
  await transferCallback('conference', job.id, { CallSid: technician, FriendlyName: `storm-${job.id}`, StatusCallbackEvent: 'participant-join', ConferenceSid: 'CF-test' });
  expect((await db.transferJob.findFirstOrThrow()).state).toBe('CONNECTED');
  expect((await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } })).callStatus).toBe('HUMAN_CONNECTED');
});
it('falls back to the original caller once after failed transfer and never dials caller-supplied numbers', async () => {
  const ticket = await setupTransfer(); await requestTransfer(ticket.id, 'Akuter Wespennotfall');
  const job = await db.transferJob.findFirstOrThrow();
  await transferFailed(job.id, 'Nicht erreichbar'); await transferFailed(job.id, 'Doppelter Callback');
  expect(fakes.create.mock.calls[0][0].to).toBe('+491701234567');
  expect(fakes.update.mock.calls.filter(([, value]) => 'url' in (value as object))).toHaveLength(1);
  expect((await db.telephonyCall.findFirstOrThrow()).state).toBe('RESUMING');
});
it('rejects transfer without an active bound carrier call or for unavailable employees', async () => {
  const ticket = await setupTransfer(); await db.employee.update({ where: { id: 'tech' }, data: { availability: 'BUSY' } });
  expect((await requestTransfer(ticket.id, 'Akuter Notfall')).status).toBe('unavailable'); expect(fakes.create).not.toHaveBeenCalled();
  await db.employee.update({ where: { id: 'tech' }, data: { availability: 'AVAILABLE' } }); await db.telephonyCall.deleteMany();
  await expect(requestTransfer(ticket.id, 'Akuter Notfall')).rejects.toThrow(/verifizierter/);
});
it('stores ranked transcripts and recording URL without overwriting a final report with late events', async () => {
  await incoming(signed('/api/voice/telephony-incoming'));
  await storeProviderCallEvent('retell', { event: 'call_analyzed', call: { call_id: 'retell-inbound-1', transcript: 'Vollständiges Transkript', recording_url: 'https://recordings.example.com/call.wav', duration_ms: 95000 } });
  await storeProviderCallEvent('retell', { event: 'call_ended', call: { call_id: 'retell-inbound-1', transcript: 'Kürzeres Transkript' } });
  const ticket = await db.callTicket.findFirstOrThrow(); expect(ticket.transcript).toBe('Vollständiges Transkript'); expect(ticket.recordingUrl).toContain('recordings.example');
  expect(ticket.endedAt).toBeNull(); // The AI leg ending does not terminate the carrier conference.
  const ended = await callEnded(signed('/api/voice/call-ended', { CallStatus: 'completed', CallDuration: '101' })); expect(ended.status).toBe(200);
  expect((await db.callTicket.findFirstOrThrow()).durationSeconds).toBe(101);
  expect(await db.callTicket.count()).toBe(1);
});
it('uses automatic Microsoft mode only when credentials are complete and keeps demos mocked', () => {
  delete process.env.MOCK_MODE; delete process.env.MICROSOFT_GRAPH_MOCK_MODE;
  delete process.env.MICROSOFT_TENANT_ID; delete process.env.MICROSOFT_CLIENT_ID; delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.AZURE_TENANT_ID; delete process.env.AZURE_CLIENT_ID; delete process.env.AZURE_CLIENT_SECRET;
  expect(useGraphMock('live')).toBe(true);
  process.env.MICROSOFT_TENANT_ID = 'tenant'; process.env.MICROSOFT_CLIENT_ID = 'client'; process.env.MICROSOFT_CLIENT_SECRET = 'secret';
  expect(useGraphMock('live')).toBe(false); expect(useGraphMock('demo')).toBe(true);
  process.env.MOCK_MODE = 'true'; expect(useGraphMock('live')).toBe(true);
});

it('preserves both KI legs after a transfer fallback and cancels a pending employee leg when caller hangs up', async () => {
  const ticket = await setupTransfer(); await requestTransfer(ticket.id, 'Kritischer Testfall');
  const parent = await db.telephonyCall.findFirstOrThrow();
  await db.voiceLeg.create({ data: { provider: 'retell', providerCallId: 'retell-resumed', telephonyId: parent.id } });
  await storeProviderCallEvent('retell', { event: 'call_analyzed', call: { call_id: 'retell-inbound-1', transcript: 'Erster Gesprächsabschnitt' } });
  await storeProviderCallEvent('retell', { event: 'call_analyzed', call: { call_id: 'retell-resumed', transcript: 'Zweiter Gesprächsabschnitt' } });
  const combined = (await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } })).transcript;
  expect(combined).toContain('Erster Gesprächsabschnitt'); expect(combined).toContain('Zweiter Gesprächsabschnitt');
  await callEnded(signed('/api/voice/call-ended', { CallStatus: 'completed', CallDuration: '42' }));
  expect((await db.transferJob.findFirstOrThrow()).state).toBe('CANCELLED');
  const job = await db.transferJob.findFirstOrThrow();
  await transferCallback('status', job.id, { CallSid: technician, CallStatus: 'completed' });
  expect((await db.telephonyCall.findFirstOrThrow()).state).toBe('ENDED');
});
