import { randomUUID } from 'node:crypto';
import Retell from 'retell-sdk';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
import { ensureTicket } from '@/lib/smart/service';
export async function POST(request: Request) {
  try {
    originGuard(request); const admin = await requireAdmin();
    const input = z.discriminatedUnion('action', [z.object({ action: z.literal('create') }), z.object({ action: z.literal('stop'), callId: z.string().min(1).max(200) })]).parse(parseJSON(await readBody(request)));
    if (!process.env.RETELL_API_KEY || !process.env.RETELL_AGENT_ID) throw new HttpError(503, 'Für den Sprachtest müssen RETELL_API_KEY und RETELL_AGENT_ID konfiguriert sein.');
    const client = new Retell({ apiKey: process.env.RETELL_API_KEY, timeout: 10000, maxRetries: 0 });
    if (input.action === 'stop') {
      const leg = await db.voiceLeg.findUnique({ where: { provider_providerCallId: { provider: 'retell', providerCallId: input.callId } }, include: { telephony: true } });
      if (!leg || leg.telephony.carrier !== 'browser') throw new HttpError(404, 'Kein Browser-Testanruf gefunden.');
      await client.call.stop(input.callId); return Response.json({ ok: true });
    }
    const key = `web-test:${admin.id}`;
    await db.loginAttempt.upsert({ where: { key }, create: { key }, update: {} });
    await db.loginAttempt.updateMany({ where: { key, windowStart: { lt: new Date(Date.now() - 15 * 60000) } }, data: { failures: 0, windowStart: new Date() } });
    const allowance = await db.loginAttempt.updateMany({ where: { key, failures: { lt: 10 } }, data: { failures: { increment: 1 } } });
    if (!allowance.count) throw new HttpError(429, 'Maximal zehn Sprachtests je 15 Minuten.');
    const localId = `browser-${randomUUID()}`;
    const ticket = await ensureTicket('demo', 'retell', localId);
    const session = await db.telephonyCall.create({ data: { carrier: 'browser', carrierCallId: localId, ticketId: ticket.id, fromNumber: '', toNumber: '', state: 'AI_CONNECTING' } });
    try {
      const call = await client.call.createWebCall({ agent_id: process.env.RETELL_AGENT_ID, metadata: { storm_ticket_id: ticket.id, storm_browser_test: true }, retell_llm_dynamic_variables: { storm_test_mode: 'true', customer_phone: '' } });
      await db.voiceLeg.create({ data: { provider: 'retell', providerCallId: call.call_id, telephonyId: session.id } });
      await db.callTicket.update({ where: { id: ticket.id }, data: { startedAt: new Date(), callStatus: 'CONNECTING' } });
      return Response.json({ ...call, transport: 'livekit' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { await db.telephonyCall.update({ where: { id: session.id }, data: { state: 'FAILED' } }); await db.callTicket.update({ where: { id: ticket.id }, data: { callStatus: 'FAILED', status: 'MANUAL_REVIEW' } }); throw error; }
  } catch (error) { return failure(error); }
}
