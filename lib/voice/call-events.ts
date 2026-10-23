import { z } from 'zod';
import { db } from '../db';
import { HttpError } from '../http';
import { ensureTicket } from '../smart/service';
import type { Mode } from '../smart/validation';
import type { Provider } from '../validation';
import { twilioClient } from '../telephony/twilio';
import { activity, resolveVoiceTicket } from '../telephony/service';
const httpsUrl = z.string().max(6000).refine(v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } });
export async function storeProviderCallEvent(provider: Provider, input: unknown, mode: Mode = 'live') {
  let id: string, transcript = '', recording: string | undefined, duration: number | undefined, endedAt: Date | undefined, event: string, rank = 1, state = 'ENDED';
  if (provider === 'retell') {
    const body = z.object({ event: z.string(), call: z.object({ call_id: z.string().min(1).max(200), transcript: z.string().max(200000).optional(), recording_url: httpsUrl.optional().nullable(), duration_ms: z.number().nonnegative().optional(), start_timestamp: z.number().optional(), end_timestamp: z.number().optional(), call_status: z.string().optional() }) }).parse(input);
    if (!['call_ended', 'call_analyzed'].includes(body.event)) return { received: true, ignored: true };
    id = body.call.call_id; event = body.event; rank = event === 'call_analyzed' ? 2 : 1; transcript = body.call.transcript || ''; recording = body.call.recording_url || undefined;
    duration = body.call.duration_ms === undefined ? body.call.start_timestamp !== undefined && body.call.end_timestamp !== undefined ? (body.call.end_timestamp - body.call.start_timestamp) / 1000 : undefined : body.call.duration_ms / 1000;
    endedAt = body.call.end_timestamp ? new Date(body.call.end_timestamp) : undefined; state = body.call.call_status === 'error' ? 'FAILED' : 'ENDED';
  } else {
    const body = z.object({ message: z.object({ type: z.string(), call: z.object({ id: z.string().min(1).max(200) }), transcript: z.string().max(200000).optional(), recordingUrl: httpsUrl.optional(), artifact: z.object({ transcript: z.string().max(200000).optional(), recordingUrl: httpsUrl.optional() }).optional(), durationSeconds: z.number().nonnegative().optional(), endedAt: z.iso.datetime().optional() }) }).parse(input);
    if (body.message.type !== 'end-of-call-report') return { received: true, ignored: true };
    id = body.message.call.id; event = body.message.type; rank = 2; transcript = body.message.artifact?.transcript ?? body.message.transcript ?? ''; recording = body.message.artifact?.recordingUrl ?? body.message.recordingUrl; duration = body.message.durationSeconds; endedAt = body.message.endedAt ? new Date(body.message.endedAt) : undefined;
  }
  if (duration !== undefined && (!Number.isFinite(duration) || duration < 0 || duration > 7 * 86400)) throw new HttpError(400, 'Ungültige Gesprächsdauer.');
  if (endedAt && !Number.isFinite(endedAt.getTime())) throw new HttpError(400, 'Ungültiges Gesprächsende.');
  const resolved = await resolveVoiceTicket(provider, id);
  const ticket = resolved ?? await ensureTicket(mode, provider, id);
  const parent = await db.telephonyCall.findUnique({ where: { ticketId: ticket.id } });
  const effectiveEnd = !parent || parent.carrier === 'browser';
  if (parent) {
    await db.voiceLeg.updateMany({ where: { provider, providerCallId: id, transcriptRank: { lte: rank } }, data: {
      ...(transcript.trim() ? { transcript, transcriptRank: rank } : {}),
      ...(recording && process.env.STORE_CALL_RECORDINGS !== 'false' ? { recordingUrl: recording } : {}),
      endedAt: endedAt ?? new Date(), finalStatus: state,
    } });
    const legs = await db.voiceLeg.findMany({ where: { telephonyId: parent.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const sections = legs.filter(leg => leg.transcript.trim());
    const fullTranscript = sections.length > 1 ? sections.map((leg, i) => `[KI-Gesprächsabschnitt ${i + 1}]\n${leg.transcript}`).join('\n\n') : sections[0]?.transcript;
    const latestRecording = [...legs].reverse().find(leg => leg.recordingUrl)?.recordingUrl;
    await db.callTicket.update({ where: { id: ticket.id }, data: {
      ...(fullTranscript ? { transcript: fullTranscript, transcriptRank: Math.max(...legs.map(leg => leg.transcriptRank)) } : {}),
      ...(latestRecording ? { recordingUrl: latestRecording } : {}),
      ...(duration !== undefined && effectiveEnd ? { durationSeconds: Math.round(duration) } : {}),
      ...(effectiveEnd ? { endedAt: endedAt ?? new Date(), callStatus: state } : {}),
    } });
  } else await db.callTicket.updateMany({ where: { id: ticket.id, transcriptRank: { lte: rank } }, data: {
    ...(transcript.trim() ? { transcript, transcriptRank: rank } : {}),
    ...(recording && process.env.STORE_CALL_RECORDINGS !== 'false' ? { recordingUrl: recording } : {}),
    ...(duration !== undefined ? { durationSeconds: Math.round(duration) } : {}),
    endedAt: endedAt ?? new Date(), callStatus: state,
  } });
  if (parent?.carrier === 'browser') await db.telephonyCall.update({ where: { id: parent.id }, data: { state: 'ENDED', endedAt: endedAt ?? new Date(), ...(duration === undefined ? {} : { durationSeconds: Math.round(duration) }) } });
  await activity(ticket.id, 'CALL_REPORT', `${provider === 'retell' ? 'Retell' : 'Vapi'}-Gesprächsbericht gespeichert${recording && process.env.STORE_CALL_RECORDINGS !== 'false' ? ' · Aufnahme-Referenz vorhanden' : ''}.`, `report:${provider}:${id}:${event}`);
  return { received: true, ticket_id: ticket.id };
}
export async function storeTwilioStatus(fields: Record<string, string>) {
  const call = await db.telephonyCall.findUnique({ where: { carrierCallId: fields.CallSid } });
  if (!call) throw new HttpError(404, 'Anruf nicht gefunden.');
  if (!['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(fields.CallStatus)) return { received: true };
  const seconds = fields.CallDuration ? Number(fields.CallDuration) : undefined;
  if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 604800)) throw new HttpError(400, 'Ungültige Gesprächsdauer.');
  const endedAt = call.endedAt ?? new Date();
  await db.telephonyCall.update({ where: { id: call.id }, data: { state: 'ENDED', endedAt, durationSeconds: seconds } });
  await db.callTicket.update({ where: { id: call.ticketId }, data: { endedAt, durationSeconds: seconds, callStatus: fields.CallStatus === 'completed' ? 'ENDED' : 'FAILED' } });
  const transfer = await db.transferJob.findUnique({ where: { telephonyId: call.id } });
  if (transfer && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(transfer.state)) {
    await db.transferJob.update({ where: { id: transfer.id }, data: { state: transfer.state === 'CONNECTED' ? 'COMPLETED' : 'CANCELLED' } });
    if (transfer.technicianCallSid && transfer.state !== 'CONNECTED') { try { await twilioClient().calls(transfer.technicianCallSid).update({ status: 'completed' }); } catch { /* A terminating employee leg may already be closed. */ } }
  }
  await activity(call.ticketId, 'CALL_ENDED', `Telefonat beendet (${fields.CallStatus}).`, `carrier-end:${call.id}`);
  return { received: true };
}
