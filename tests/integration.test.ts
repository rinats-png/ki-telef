import { beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));
import { db } from '../lib/db';
import { dispatch } from '../lib/voice/service';
import { demoCases, toolPayload, reportPayload } from '../lib/demo';
import { POST as webhook } from '../app/api/voice-webhook/route';
import { POST as login } from '../app/api/auth/login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { GET as dashboard } from '../app/api/dashboard/route';
import { PATCH as updateLead } from '../app/api/leads/[id]/route';
import { hashPassword } from '../lib/password';
import { getAdmin } from '../lib/auth';
import { dashboardData } from '../lib/dashboard';
import { generateAgentConfig } from '../config/storm-agent-prompt';
import type { Provider } from '../lib/validation';
function request(path: string, body: unknown, headers: Record<string, string> = {}) { return new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...headers }, body: JSON.stringify(body) }); }
async function signIn() {
  await db.admin.create({ data: { username: 'admin', passwordHash: hashPassword('a-strong-test-password') } });
  const response = await login(request('/api/auth/login', { username: 'admin', password: 'a-strong-test-password' }));
  expect(response.status).toBe(200);
}
beforeEach(async () => {
  jar.clear();
  await db.receipt.deleteMany(); await db.escalation.deleteMany(); await db.lead.deleteMany(); await db.call.deleteMany();
  await db.technician.deleteMany(); await db.session.deleteMany(); await db.admin.deleteMany(); await db.loginAttempt.deleteMany();
});
afterAll(async () => { await db.$disconnect(); });
for (const provider of ['vapi', 'retell'] as Provider[]) describe(`${provider}: native contracts`, () => {
  it('creates one persistent ticket across retries and different tool IDs, supplements transcript', async () => {
    const payload = toolPayload(provider, 'call-1', 'create_lead_ticket', demoCases.restaurant.lead);
    const first = await dispatch(provider, payload, 'demo');
    const second = await dispatch(provider, payload, 'demo');
    expect(second).toEqual(first);
    if (provider === 'vapi') {
      const changed = structuredClone(payload) as { message: { toolCallList: { id: string }[] } };
      changed.message.toolCallList[0].id = 'second-tool-id'; await dispatch(provider, changed, 'demo');
      expect(first).toHaveProperty('results.0.toolCallId', 'call-1-create_lead_ticket');
    } else expect(first).toHaveProperty('ticket_id');
    expect(await db.lead.count()).toBe(1);
    await dispatch(provider, reportPayload(provider, 'call-1', 'Anrufer: Ratten im Lager. KI: Daten bestätigt.'), 'demo');
    const data = await dashboardData('demo');
    expect(data.leads[0].call.transcript).toContain('Ratten'); expect(data.stats.calls).toBe(1);
    expect(data.stats.b2b).toBe(1); expect(data.stats.estimatedRevenue).toBe(250);
  });
  it('keeps PLZ with leading zero and always requires manual review', async () => {
    const result = await dispatch(provider, toolPayload(provider, 'call-1', 'check_service_area', { postal_code: '01067' }), 'demo');
    expect(JSON.stringify(result)).toContain('manual_review'); expect(JSON.stringify(result)).toContain('01067');
    await expect(dispatch(provider, toolPayload(provider, 'bad', 'check_service_area', { postal_code: '123' }), 'demo')).rejects.toThrow();
    expect(await db.call.count()).toBe(1);
  });
  it('records escalation even before a full lead and never claims delivery', async () => {
    const payload = toolPayload(provider, 'alarm-1', 'trigger_emergency_escalation', { reason: 'Ratten in Krankenhausküche', phone: '+49 000 000001' });
    const result = await dispatch(provider, payload, 'demo'); await dispatch(provider, payload, 'demo');
    expect(JSON.stringify(result)).toContain('not_configured'); expect(await db.escalation.count()).toBe(1);
    const data = await dashboardData('demo'); expect(data.stats.openEmergencies).toBe(1); expect(data.escalations).toHaveLength(1);
  });
  it('isolates live and demo even for an identical provider call ID', async () => {
    await dispatch(provider, toolPayload(provider, 'shared', 'create_lead_ticket', demoCases.family.lead), 'demo');
    expect((await dashboardData('live')).leads).toHaveLength(0);
    await dispatch(provider, toolPayload(provider, 'shared', 'create_lead_ticket', demoCases.restaurant.lead), 'live');
    expect((await dashboardData('live')).leads[0].name).toBe('Markus Weber');
    expect((await dashboardData('demo')).leads[0].name).toBe('Julia Schneider');
  });
  it('rejects malformed data without partial writes', async () => {
    await expect(dispatch(provider, toolPayload(provider, 'bad', 'create_lead_ticket', { ...demoCases.restaurant.lead, phone: '', urgency: 'SUPER' }), 'demo')).rejects.toThrow();
    expect(await db.call.count()).toBe(0);
    const response = await webhook(request(`/api/voice-webhook?provider=${provider}&mode=demo`, {}));
    expect(response.status).toBe(401);
  });
});
describe('HTTP security and ticket actions', () => {
  it('fails closed when provider is not configured and rejects invalid credentials', async () => {
    const old = process.env.VAPI_WEBHOOK_SECRET; delete process.env.VAPI_WEBHOOK_SECRET;
    expect((await webhook(request('/api/voice-webhook?provider=vapi', {}))).status).toBe(503);
    process.env.VAPI_WEBHOOK_SECRET = old;
    expect((await webhook(request('/api/voice-webhook?provider=vapi', {}))).status).toBe(401);
    expect((await webhook(request('/api/voice-webhook?provider=retell', {}, { 'x-retell-signature': 'invalid' }))).status).toBe(401);
  });
  it('accepts authenticated Vapi webhook with native response', async () => {
    const response = await webhook(request('/api/voice-webhook?provider=vapi', toolPayload('vapi', 'live-1', 'create_lead_ticket', demoCases.restaurant.lead), { 'x-storm-webhook-secret': process.env.VAPI_WEBHOOK_SECRET! }));
    expect(response.status).toBe(200); expect(await response.json()).toHaveProperty('results.0.toolCallId');
    expect((await dashboardData('live')).leads).toHaveLength(1);
  });
  it('accepts a signed Retell payload and rejects stale or altered signatures', async () => {
    const payload = toolPayload('retell', 'retell-live', 'create_lead_ticket', demoCases.family.lead);
    const raw = JSON.stringify(payload); const stamp = Date.now();
    const signature = `v=${stamp},d=${createHmac('sha256', process.env.RETELL_API_KEY!).update(raw + stamp).digest('hex')}`;
    expect((await webhook(request('/api/voice-webhook?provider=retell', payload, { 'x-retell-signature': signature }))).status).toBe(200);
    expect((await webhook(request('/api/voice-webhook?provider=retell', { ...payload, name: 'check_service_area' }, { 'x-retell-signature': signature }))).status).toBe(401);
    const old = stamp - 600000;
    const stale = `v=${old},d=${createHmac('sha256', process.env.RETELL_API_KEY!).update(raw + old).digest('hex')}`;
    expect((await webhook(request('/api/voice-webhook?provider=retell', payload, { 'x-retell-signature': stale }))).status).toBe(401);
  });
  it('requires authentication for dashboard, session expiry and logout invalidate access', async () => {
    const req = new Request('http://localhost:3000/api/dashboard?mode=demo');
    expect((await dashboard(req)).status).toBe(401);
    await signIn(); expect((await dashboard(req)).status).toBe(200);
    await db.session.updateMany({ data: { expiresAt: new Date(0) } }); expect(await getAdmin()).toBeNull();
    await login(request('/api/auth/login', { username: 'admin', password: 'a-strong-test-password' }));
    await logout(request('/api/auth/logout', {})); expect(await getAdmin()).toBeNull(); expect(await db.session.count()).toBe(0);
  });
  it('protects mutations against cross-origin requests and limits login attempts', async () => {
    expect((await login(request('/api/auth/login', {}, { Origin: 'https://attacker.example' }))).status).toBe(403);
    for (let i = 0; i < 5; i++) expect((await login(request('/api/auth/login', { username: `guess-${i}`, password: 'wrong' }))).status).toBe(401);
    expect((await login(request('/api/auth/login', { username: 'other', password: 'wrong' }))).status).toBe(429);
  });
  it('runs a demo webhook under a session and persists assignment/completion with mode enforcement', async () => {
    await signIn();
    const response = await webhook(request('/api/voice-webhook?provider=retell&mode=demo', toolPayload('retell', 'demo-http', 'create_lead_ticket', demoCases.restaurant.lead)));
    expect(response.status).toBe(200);
    const lead = await db.lead.findFirstOrThrow();
    const context = { params: Promise.resolve({ id: lead.id }) };
    expect((await updateLead(request('/x', { mode: 'live', status: 'DONE' }), context)).status).toBe(404);
    await db.technician.create({ data: { id: 'tech', mode: 'demo', name: 'Test Techniker', specialty: 'Nager' } });
    expect((await updateLead(request('/x', { mode: 'demo', technicianId: 'tech' }), context)).status).toBe(200);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('IN_PROGRESS');
    await updateLead(request('/x', { mode: 'demo', status: 'DONE' }), context);
    expect((await dashboardData('demo')).stats.openEmergencies).toBe(0);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('DONE');
    expect((await updateLead(request('/x', { mode: 'demo', status: 'OPEN' }, { Origin: 'https://evil.example' }), context)).status).toBe(403);
  });
  it('rejects oversized requests and invalid JSON', async () => {
    const response = await webhook(request('/api/voice-webhook?provider=vapi', 'a'.repeat(270000)));
    expect(response.status).toBe(413);
    const bad = new Request('http://localhost:3000/api/voice-webhook?provider=vapi', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-storm-webhook-secret': process.env.VAPI_WEBHOOK_SECRET! }, body: '{' });
    expect((await webhook(bad)).status).toBe(400);
  });
  it('exports both provider configurations without runtime secrets', () => {
    for (const provider of ['vapi', 'retell'] as Provider[]) {
      const value = JSON.stringify(generateAgentConfig(provider, 'https://storm.example'));
      expect(value).toContain(`/api/voice-webhook?provider=${provider}`); expect(value).toContain('create_lead_ticket');
      expect(value).not.toContain(process.env.VAPI_WEBHOOK_SECRET); expect(value).not.toContain(process.env.RETELL_API_KEY);
    }
  });
});
