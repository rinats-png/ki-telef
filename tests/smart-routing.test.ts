import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as graphService from '../lib/microsoft-graph';
import { HttpError } from '../lib/http';
import { retryOutlookTicket } from '../lib/smart/service';
import { db } from '../lib/db';
import { normalizePhone } from '../lib/smart/validation';
import { selectEmployee, routeRole } from '../lib/smart/routing';
import { smartScenarios, smartToolPayload } from '../lib/smart/demo';
import { ensureTicket, finalizeTicket, lookupCustomer, routeTicket } from '../lib/smart/service';
import { simulateSmart } from '../lib/smart/simulate';
import { availableSlots, candidateSlots, graphIsMock, syncArtifact } from '../lib/microsoft-graph';
import { dispatchSmart } from '../lib/smart/webhook';
import { POST as smartWebhook } from '../app/api/voice/webhook/route';
import type { Provider } from '../lib/validation';
const nativeFetch = globalThis.fetch;
const staff = [
  { id: 'max', name: 'Max Mustermann', role: 'B2B_SPECIALIST', upn: 'max@demo.invalid', availability: 'AVAILABLE' },
  { id: 'sabine', name: 'Sabine Müller', role: 'BACKOFFICE', upn: 'sabine@demo.invalid', availability: 'AVAILABLE' },
  { id: 'tom', name: 'Tom Weber', role: 'EMERGENCY_TECH', upn: 'tom@demo.invalid', availability: 'AVAILABLE' },
  { id: 'lena', name: 'Lena Hoffmann', role: 'PEST_EXPERT', upn: 'lena@demo.invalid', availability: 'BUSY' },
];
beforeEach(async () => {
  globalThis.fetch = nativeFetch; delete process.env.MOCK_MODE; delete process.env.MICROSOFT_TENANT_ID; delete process.env.MICROSOFT_CLIENT_ID; delete process.env.MICROSOFT_CLIENT_SECRET; process.env.MICROSOFT_GRAPH_MOCK_MODE = 'true';
  await db.outlookArtifact.deleteMany(); await db.slotOffer.deleteMany(); await db.callTicket.deleteMany(); await db.customer.deleteMany(); await db.employee.deleteMany();
  for (const e of staff) await db.employee.create({ data: { ...e, mode: 'demo', pestTypes: [], postalCodes: [] } });
  const c = smartScenarios.existing.contact;
  await db.customer.create({ data: { mode: 'demo', name: c.name, company: c.company, phone: c.phone, email: c.email, street: c.street, postalCode: c.postal_code, city: c.city, status: 'EXISTING', contractType: 'HACCP_B2B' } });
});
afterAll(async () => { globalThis.fetch = nativeFetch; await db.$disconnect(); });
it('normalizes German, international and trunk-prefix phone formats', () => {
  expect(normalizePhone('06039 / 933 882')).toBe('+496039933882');
  expect(normalizePhone('0049 6039 933882')).toBe('+496039933882');
  expect(normalizePhone('+49 (0) 6039 933882')).toBe('+496039933882');
  expect(() => normalizePhone('anonymous')).toThrow();
});
it('prioritizes critical emergencies over B2B and service categories; keeps role eligibility', async () => {
  const input = { ...smartScenarios.restaurant.routing, issue_type: 'INVOICE' as const, urgency: 'CRITICAL' as const };
  expect(routeRole(input).role).toBe('EMERGENCY_TECH');
  expect(routeRole({ ...input, urgency: 'LOW' }).role).toBe('BACKOFFICE');
  const employees = await db.employee.findMany();
  expect(selectEmployee(employees, smartScenarios.restaurant.routing).employee?.id).toBe('max');
  expect(selectEmployee(employees.map(e => ({ ...e, postalCodes: ['99999'] })), smartScenarios.restaurant.routing).employee).toBeUndefined();
});
it('looks up existing customer only within the current data mode', async () => {
  const demo = await ensureTicket('demo', 'vapi', 'lookup');
  const found = await lookupCustomer(demo, smartScenarios.existing.contact.phone);
  expect(found.existing_customer).toBe(true); expect(found.name).toBe('Sandra König');
  const live = await ensureTicket('live', 'vapi', 'lookup'); expect((await lookupCustomer(live, smartScenarios.existing.contact.phone)).found).toBe(false);
});
for (const provider of ['vapi', 'retell'] as Provider[]) it(`${provider}: all three scenarios create correctly routed events, drafts and simulated confirmations`, async () => {
  for (const scenario of ['wasps', 'restaurant', 'existing'] as const) {
    const result = await simulateSmart(scenario, provider);
    expect(result.status).toBe('completed');
  }
  const tickets = await db.callTicket.findMany({ include: { assignedEmployee: true, artifacts: true } });
  expect(tickets).toHaveLength(3);
  expect(tickets.find(t => t.customerKind === 'EXISTING')?.assignedEmployee?.role).toBe('BACKOFFICE');
  expect(tickets.find(t => t.pestType === 'RODENTS')?.assignedEmployee?.role).toBe('B2B_SPECIALIST');
  expect(tickets.find(t => t.pestType === 'WASPS')?.assignedEmployee?.role).toBe('PEST_EXPERT');
  expect(tickets.every(t => t.artifacts.length === 3 && t.artifacts.every(a => a.isMock && a.state === 'SIMULATED'))).toBe(true);
  expect(await db.callTicket.count({ where: { mode: 'live' } })).toBe(0);
});
it('books only an offered slot and makes duplicate finalization idempotent', async () => {
  const ticket = await ensureTicket('demo', 'vapi', 'dedup');
  const sample = smartScenarios.wasps;
  const route = await routeTicket(ticket, sample.routing);
  const input = { contact: sample.contact, slot_id: route.slots[0].id, summary: sample.summary, transcript: sample.transcript, appointment_type: 'CALLBACK' as const, email_confirmed: true as const };
  const routed = await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  const first = await finalizeTicket(routed, input); const second = await finalizeTicket(routed, input);
  expect(first).toEqual(second); expect(await db.outlookArtifact.count()).toBe(3);
  await expect(finalizeTicket(routed, { ...input, summary: 'Changed after finalization should be rejected.' })).rejects.toThrow();
});
it('rejects a stale or conflicting offer and exposes a transfer candidate without claiming a real transfer', async () => {
  const sample = smartScenarios.restaurant;
  const t1 = await ensureTicket('demo', 'vapi', 'one'), t2 = await ensureTicket('demo', 'vapi', 'two');
  const r1 = await routeTicket(t1, sample.routing), r2 = await routeTicket(t2, sample.routing);
  const make = (slot: string) => ({ contact: sample.contact, slot_id: slot, summary: sample.summary, transcript: '', appointment_type: 'CALLBACK' as const, email_confirmed: true as const });
  await finalizeTicket(await db.callTicket.findUniqueOrThrow({ where: { id: t1.id } }), make(r1.slots[0].id));
  await expect(finalizeTicket(await db.callTicket.findUniqueOrThrow({ where: { id: t2.id } }), make(r2.slots[0].id))).rejects.toThrow(/belegt|vergeben/);
  expect(await db.outlookArtifact.count()).toBe(3);
  const critical = await routeTicket(await ensureTicket('demo', 'retell', 'critical'), { ...sample.routing, urgency: 'CRITICAL' });
  expect(critical.transfer_candidate).toBe(true); expect(critical.transfer_executed).toBe(false); expect(critical.employee?.id).toBe('tom');
  await db.slotOffer.update({ where: { id: critical.slots[0].id }, data: { expiresAt: new Date(0) } });
  const criticalTicket = await db.callTicket.findUniqueOrThrow({ where: { mode_provider_externalId: { mode: 'demo', provider: 'retell', externalId: 'critical' } } });
  await expect(finalizeTicket(criticalTicket, make(critical.slots[0].id))).rejects.toThrow(/abgelaufen/);
});
it('generates Berlin business-hour slots across DST and excludes weekends', () => {
  const slots = candidateSlots(new Date('2026-10-23T15:00:00Z'));
  expect(slots[0].start).toBe('2026-10-26T07:00:00.000Z');
  expect(slots.every(s => !['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(new Date(s.start))))).toBe(true);
});
it('authenticates the new native webhook and performs call-start identification', async () => {
  expect((await smartWebhook(new Request('http://localhost:3000/api/voice/webhook?provider=vapi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))).status).toBe(401);
  await dispatchSmart('retell', { event: 'call_started', call: { call_id: 'from-caller-id', from_number: smartScenarios.existing.contact.phone } }, 'demo');
  const ticket = await db.callTicket.findUniqueOrThrow({ where: { mode_provider_externalId: { mode: 'demo', provider: 'retell', externalId: 'from-caller-id' } } });
  expect(ticket.customerKind).toBe('EXISTING');
  const response = await dispatchSmart('vapi', smartToolPayload('vapi', 'tools', 'lookup_customer_by_phone', { phone: smartScenarios.existing.contact.phone }), 'demo');
  expect(response).toHaveProperty('results.0.toolCallId');
});
it('uses real app-only token + calendarView contract without making real network calls', async () => {
  process.env.MICROSOFT_GRAPH_MOCK_MODE = 'false';
  process.env.AZURE_TENANT_ID = 'test-tenant'; process.env.AZURE_CLIENT_ID = 'test-client-calendar'; process.env.AZURE_CLIENT_SECRET = 'test-secret';
  const requests: { url: string; method: string }[] = [];
  globalThis.fetch = vi.fn(async (input, init) => { const url = String(input); requests.push({ url, method: init?.method || 'GET' }); return Response.json(url.includes('oauth2') ? { access_token: 'test-token', expires_in: 3600 } : { value: [] }); }) as typeof fetch;
  const employee = await db.employee.findUniqueOrThrow({ where: { id: 'max' } });
  expect(graphIsMock('demo')).toBe(true); expect(graphIsMock('live')).toBe(false);
  expect(await availableSlots(employee, 'live')).toHaveLength(3);
  expect(requests[0].url).toContain('/oauth2/v2.0/token'); expect(requests[1].url).toContain('/calendarView?');
});
it('reconciles an uncertain confirmation without blindly sending a second mail', async () => {
  const result = await simulateSmart('wasps', 'vapi');
  const confirmation = await db.outlookArtifact.findFirstOrThrow({ where: { ticketId: result.ticket_id as string, kind: 'CONFIRMATION' } });
  const pending = await db.outlookArtifact.update({ where: { id: confirmation.id }, data: { isMock: false, remoteId: 'immutable-message', state: 'UNKNOWN' } });
  process.env.AZURE_TENANT_ID = 'test-tenant'; process.env.AZURE_CLIENT_ID = 'test-client-reconcile'; process.env.AZURE_CLIENT_SECRET = 'test-secret';
  const methods: string[] = [];
  globalThis.fetch = vi.fn(async (input, init) => { methods.push(init?.method || 'GET'); return Response.json(String(input).includes('oauth2') ? { access_token: 'test-token', expires_in: 3600 } : { isDraft: false }); }) as typeof fetch;
  const employee = await db.employee.findUniqueOrThrow({ where: { id: pending.employeeId } });
  expect((await syncArtifact(pending, employee)).state).toBe('ACCEPTED');
  expect(methods).toEqual(['POST', 'GET']);
});

it('resumes only the missing Outlook actions after a partial workflow without duplicating artifacts', async () => {
  const sample = smartScenarios.wasps;
  const ticket = await ensureTicket('demo', 'retell', 'partial-resume');
  const routed = await routeTicket(ticket, sample.routing);
  const input = { contact: sample.contact, slot_id: routed.slots[0].id, summary: sample.summary, transcript: '', appointment_type: 'CALLBACK' as const, email_confirmed: true as const };
  const original = graphService.syncArtifact;
  const spy = vi.spyOn(graphService, 'syncArtifact').mockImplementationOnce(original).mockRejectedValueOnce(new HttpError(502, 'Temporärer Entwurfsfehler'));
  try { await expect(finalizeTicket(await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } }), input)).rejects.toThrow(); }
  finally { spy.mockRestore(); }
  expect((await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('PARTIAL');
  expect((await retryOutlookTicket(ticket.id, 'demo')).status).toBe('completed');
  expect(await db.outlookArtifact.count({ where: { ticketId: ticket.id } })).toBe(3);
  await expect(retryOutlookTicket(ticket.id, 'live')).rejects.toThrow();
});
