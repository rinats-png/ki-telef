import type { ProgressReporter } from './progress';
import { z } from 'zod';
import { db } from '../db';
import { parseJSON } from '../http';
import type { Provider } from '../validation';
import { encodeResults } from '../voice/adapters';
import { ensureTicket, lookupCustomer, routeTicket, finalizeTicket } from './service';
import { resolveVoiceTicket, requestTransfer } from '../telephony/service';
import { storeProviderCallEvent } from '../voice/call-events';
import { smartTools, type Mode } from './validation';
const callId = z.string().min(1).max(200);
export async function dispatchSmart(provider: Provider, input: unknown, mode: Mode, report?: ProgressReporter) {
  let externalId: string, phone: string | undefined, transcript: string | undefined;
  let tools: { id: string; name: keyof typeof smartTools; args: unknown }[] = [];
  let kind: string;
  const toolName = z.enum(['transfer_to_employee', 'lookup_customer_by_phone', 'determine_and_check_employee', 'finalize_call_action']);
  if (provider === 'vapi') {
    const { message } = z.object({ message: z.object({ type: z.string(), call: z.object({ id: callId, customer: z.object({ number: z.string() }).optional() }), customer: z.object({ number: z.string() }).optional(), artifact: z.object({ transcript: z.string().max(100000).optional() }).optional(), toolCallList: z.array(z.object({ id: callId, function: z.object({ name: toolName, arguments: z.unknown() }) })).max(10).optional() }) }).parse(input);
    externalId = message.call.id; phone = message.call.customer?.number ?? message.customer?.number; transcript = message.artifact?.transcript; kind = message.type;
    if (kind === 'tool-calls') tools = (message.toolCallList ?? []).map(t => ({ id: t.id, name: t.function.name, args: typeof t.function.arguments === 'string' ? parseJSON(t.function.arguments) : t.function.arguments }));
    if (!['tool-calls', 'status-update', 'end-of-call-report'].includes(kind)) return { received: true, ignored: true };
  } else {
    const body = z.object({ name: toolName.optional(), args: z.unknown().optional(), event: z.string().optional(), call: z.object({ call_id: callId, from_number: z.string().optional(), transcript: z.string().max(100000).optional() }) }).parse(input);
    externalId = body.call.call_id; phone = body.call.from_number; transcript = body.call.transcript; kind = body.name ? 'tool-calls' : body.event ?? '';
    if (body.name) tools = [{ id: body.name, name: body.name, args: typeof body.args === 'string' ? parseJSON(body.args) : body.args }];
    if (!['tool-calls', 'call_started', 'call_ended', 'call_analyzed'].includes(kind)) return { received: true, ignored: true };
  }
  for (const tool of tools) smartTools[tool.name].parse(tool.args);
  let ticket = await resolveVoiceTicket(provider, externalId) ?? await ensureTicket(mode, provider, externalId);
  if (['call_ended', 'call_analyzed', 'end-of-call-report'].includes(kind)) await storeProviderCallEvent(provider, input, ticket.mode as Mode);
  if (kind === 'call_started') {
    await db.callTicket.update({ where: { id: ticket.id }, data: { callStatus: 'IN_PROGRESS', startedAt: ticket.startedAt ?? new Date() } });
    await db.telephonyCall.updateMany({ where: { ticketId: ticket.id, state: 'AI_CONNECTING' }, data: { state: 'AI_CONNECTED' } });
  }
  if (phone && ['IDENTIFYING', 'IDENTIFIED'].includes(ticket.status)) {
    try { await lookupCustomer(ticket, phone); } catch { /* Withheld or invalid caller-ID: ask caller for a confirmed callback number. */ }
    ticket = await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  }
  // Ranked end-of-call reports are persisted by storeProviderCallEvent; late events cannot downgrade them.
  const results = [];
  for (const tool of tools) {
    ticket = await db.callTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    let result: unknown;
    if (tool.name === 'transfer_to_employee') { const args = smartTools.transfer_to_employee.parse(tool.args); result = await requestTransfer(ticket.id, args.reason); }
    else if (tool.name === 'lookup_customer_by_phone') result = await lookupCustomer(ticket, smartTools.lookup_customer_by_phone.parse(tool.args).phone);
    else if (tool.name === 'determine_and_check_employee') result = await routeTicket(ticket, smartTools.determine_and_check_employee.parse(tool.args));
    else result = await finalizeTicket(ticket, smartTools.finalize_call_action.parse(tool.args), report);
    results.push({ id: tool.id, name: tool.name, result });
  }
  return encodeResults(provider, results);
}
