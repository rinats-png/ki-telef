import { createHash } from 'node:crypto';
import { z } from 'zod';
import { toolNameSchema, type Provider, type ToolName } from '../validation';
import { HttpError, parseJSON } from '../http';
const id = z.string().min(1).max(200);
const transcript = z.string().max(200_000);
export type ToolInvocation = { id: string; name: ToolName; args: unknown };
export type VoiceEvent = { callId: string; tools: ToolInvocation[]; eventKey?: string; ended?: boolean; transcript?: string; accepted: boolean };
function decodeArguments(value: unknown) { return typeof value === 'string' ? parseJSON(value) : value; }
export function normalize(provider: Provider, input: unknown): VoiceEvent {
  if (provider === 'vapi') {
    const { message } = z.object({ message: z.object({
      type: z.string(), call: z.object({ id }),
      status: z.string().optional(), transcript: transcript.optional(),
      artifact: z.object({ transcript: transcript.optional() }).optional(),
      toolCallList: z.array(z.object({ id, type: z.string().optional(), function: z.object({ name: z.string(), arguments: z.unknown() }) })).max(10).optional(),
    }) }).parse(input);
    if (message.type === 'tool-calls') {
      if (!message.toolCallList?.length) throw new HttpError(400, 'Keine Tool-Aufrufe vorhanden.');
      return { callId: message.call.id, accepted: true, tools: message.toolCallList.map(t => ({ id: t.id, name: toolNameSchema.parse(t.function.name), args: decodeArguments(t.function.arguments) })) };
    }
    const ended = message.type === 'end-of-call-report' || (message.type === 'status-update' && message.status === 'ended');
    return { callId: message.call.id, accepted: ['status-update', 'end-of-call-report'].includes(message.type), tools: [], ended, transcript: message.artifact?.transcript ?? message.transcript, eventKey: `${message.type}:${createHash('sha256').update(JSON.stringify(message)).digest('hex')}` };
  }
  const body = z.object({
    name: z.string().optional(), args: z.unknown().optional(),
    event: z.string().optional(), call: z.object({ call_id: id, transcript: transcript.optional() }),
  }).parse(input);
  if (body.name) {
    const name = toolNameSchema.parse(body.name);
    // Retell custom functions have no guaranteed tool-call ID: one operation per name per call.
    return { callId: body.call.call_id, accepted: true, tools: [{ id: name, name, args: decodeArguments(body.args) }] };
  }
  if (!body.event) throw new HttpError(400, 'Anrufereignis fehlt.');
  return { callId: body.call.call_id, tools: [], accepted: ['call_started', 'call_ended', 'call_analyzed'].includes(body.event), ended: ['call_ended', 'call_analyzed'].includes(body.event), transcript: body.call.transcript, eventKey: `${body.event}:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}` };
}
export function encodeResults(provider: Provider, results: { id: string; name: string; result: unknown }[]) {
  return provider === 'vapi' ? { results: results.map(r => ({ toolCallId: r.id, name: r.name, result: JSON.stringify(r.result) })) } : results[0]?.result ?? { received: true };
}
