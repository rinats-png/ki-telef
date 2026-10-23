import Retell from 'retell-sdk';
import type { TelephonyCall } from '@prisma/client';
import { db } from '../db';
import { HttpError } from '../http';
import { normalizePhone } from '../smart/validation';
import { ensureTicket, lookupCustomer } from '../smart/service';
import { publicUrl, sidPattern, speak, twilioClient, voiceResponse } from './twilio';
export async function activity(ticketId: string, kind: string, message: string, dedupeKey?: string) {
  if (dedupeKey) return db.callActivity.upsert({ where: { dedupeKey }, create: { ticketId, kind, message, dedupeKey }, update: {} });
  return db.callActivity.create({ data: { ticketId, kind, message } });
}
const configuredProvider = () => process.env.VOICE_PROVIDER === 'vapi' ? 'vapi' : 'retell';
export async function resolveVoiceTicket(provider: string, externalId: string) {
  const leg = await db.voiceLeg.findUnique({ where: { provider_providerCallId: { provider, providerCallId: externalId } }, include: { telephony: { include: { ticket: true } } } });
  return leg?.telephony.ticket;
}
function sipUri(value: string, host?: string) {
  if (!/^sips?:[^\s<>"'&]+$/.test(value)) throw new HttpError(503, 'Ungültige konfigurierte SIP-Adresse.');
  if (host && !value.split('@')[1]?.split(/[;?]/)[0].endsWith(host)) throw new HttpError(503, 'SIP-Ziel gehört nicht zum konfigurierten Anbieter.');
  return value;
}
async function registerBridge(call: TelephonyCall, resume = false) {
  if (configuredProvider() === 'retell') {
    if (!process.env.RETELL_API_KEY || !process.env.RETELL_AGENT_ID) throw new HttpError(503, 'Retell-Agent und API-Schlüssel fehlen.');
    const registered = await new Retell({ apiKey: process.env.RETELL_API_KEY, timeout: 10000, maxRetries: 0 }).call.registerPhoneCall({ agent_id: process.env.RETELL_AGENT_ID, direction: 'inbound', ...(call.fromNumber ? { from_number: call.fromNumber } : {}), to_number: call.toNumber, metadata: { storm_ticket_id: call.ticketId, twilio_call_sid: call.carrierCallId, resumed_after_transfer: resume }, retell_llm_dynamic_variables: { customer_phone: call.fromNumber, storm_ticket_id: call.ticketId, transfer_failed: String(resume) } });
    if (!/^[\w-]{1,200}$/.test(registered.call_id)) throw new HttpError(502, 'Ungültige Retell-Anrufkennung.');
    await db.voiceLeg.upsert({ where: { provider_providerCallId: { provider: 'retell', providerCallId: registered.call_id } }, create: { telephonyId: call.id, provider: 'retell', providerCallId: registered.call_id }, update: {} });
    return `sip:${registered.call_id}@sip.retellai.com`;
  }
  if (!process.env.VAPI_SIP_URI) throw new HttpError(503, 'Vapi SIP-Telefonnummer fehlt.');
  const uri = sipUri(process.env.VAPI_SIP_URI);
  // These headers are carrier context, not authorization; only signed provider callbacks may bind them.
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}X-Storm-Call-Sid=${encodeURIComponent(call.carrierCallId)}&X-Customer-Phone=${encodeURIComponent(call.fromNumber)}`;
}
export async function inbound(fields: Record<string, string>, resumeId?: string | null) {
  if (!sidPattern.test(fields.CallSid || '')) throw new HttpError(400, 'Twilio CallSid fehlt.');
  if (!process.env.TWILIO_PHONE_NUMBER) throw new HttpError(503, 'Twilio-Rufnummer fehlt.');
  const to = normalizePhone(fields.To || '');
  if (to !== normalizePhone(process.env.TWILIO_PHONE_NUMBER)) throw new HttpError(403, 'Nicht konfigurierte Zielrufnummer.');
  let phone = ''; try { phone = normalizePhone(fields.From || ''); } catch { /* Withheld caller ID: agent asks for a callback number. */ }
  let call = await db.telephonyCall.findUnique({ where: { carrierCallId: fields.CallSid } });
  if (!call) {
    const ticket = await ensureTicket('live', configuredProvider(), `twilio:${fields.CallSid}`);
    await lookupCustomer(ticket, phone).catch(() => undefined);
    call = await db.telephonyCall.upsert({ where: { carrierCallId: fields.CallSid }, create: { carrierCallId: fields.CallSid, ticketId: ticket.id, fromNumber: phone, toNumber: to }, update: {} });
    await db.callTicket.update({ where: { id: ticket.id }, data: { startedAt: new Date(), callStatus: 'RINGING' } });
    await activity(ticket.id, 'INBOUND', 'Eingehender Twilio-Anruf erfasst; Caller-ID geprüft.', `inbound:${fields.CallSid}`);
  }
  if (resumeId && resumeId !== call.id) throw new HttpError(403, 'Anrufkontext stimmt nicht überein.');
  if (call.endedAt) { const response = speak('Dieses Gespräch ist bereits beendet.'); response.hangup(); return response; }
  const resuming = !!resumeId && call.state === 'RESUMING';
  if (!call.bridgeUri || resuming) {
    const claimed = await db.telephonyCall.updateMany({ where: { id: call.id, OR: [{ registeringUntil: null }, { registeringUntil: { lt: new Date() } }] }, data: { registeringUntil: new Date(Date.now() + 30000) } });
    if (!claimed.count) {
      const response = voiceResponse(); response.pause({ length: 2 }); response.redirect({ method: 'POST' }, publicUrl(`/api/voice/telephony-incoming${resumeId ? `?resume=${call.id}` : ''}`)); return response;
    }
    try {
      const uri = await registerBridge(call, resuming);
      call = await db.telephonyCall.update({ where: { id: call.id }, data: { bridgeUri: uri, state: 'AI_CONNECTING', registeringUntil: null } });
    } catch (error) {
      await db.telephonyCall.update({ where: { id: call.id }, data: { state: 'FAILED', registeringUntil: null } });
      await db.callTicket.update({ where: { id: call.ticketId }, data: { callStatus: 'FAILED', lastError: 'Voice-Agent konnte nicht verbunden werden.', status: 'MANUAL_REVIEW' } });
      await activity(call.ticketId, 'ERROR', 'KI-Verbindung fehlgeschlagen; manuelle Bearbeitung erforderlich.');
      const response = speak('Die automatische Vermittlung ist gerade nicht verfügbar. Ihr Anruf wurde für die Disposition erfasst. Bitte versuchen Sie es später erneut.'); response.hangup(); return response;
    }
  }
  const response = voiceResponse();
  const dial = response.dial({ answerOnBridge: true, ...(phone ? { callerId: phone } : {}), timeout: 30, action: publicUrl(`/api/voice/telephony-incoming?stage=dial-status&call=${call.id}`), method: 'POST' });
  dial.sip(call.bridgeUri!);
  return response;
}
export async function dialStatus(fields: Record<string, string>, id: string | null) {
  const call = id ? await db.telephonyCall.findUnique({ where: { id }, include: { transfer: true } }) : null;
  if (!call || call.carrierCallId !== fields.CallSid) throw new HttpError(403, 'Unbekannter Anruf.');
  const response = voiceResponse();
  // A transfer replaces the parent's Dial; its action must not hang up a conference.
  if (call.transfer && !['FAILED', 'DECLINED'].includes(call.transfer.state)) return response;
  if (['busy', 'failed', 'no-answer'].includes(fields.DialCallStatus)) {
    await db.callTicket.update({ where: { id: call.ticketId }, data: { status: 'MANUAL_REVIEW', callStatus: 'FAILED', lastError: 'SIP-Verbindung nicht zustande gekommen.' } });
    response.say({ language: 'de-DE' }, 'Die Verbindung zur Telefonassistenz konnte nicht aufgebaut werden. Bitte versuchen Sie es später erneut.');
  }
  response.hangup(); return response;
}
function conferenceXml(jobId: string, caller: boolean) {
  const response = voiceResponse();
  if (caller) response.say({ language: 'de-DE' }, 'Ich versuche, Sie mit dem zuständigen Mitarbeiter zu verbinden. Bitte bleiben Sie kurz in der Leitung.');
  response.dial().conference({ startConferenceOnEnter: !caller, endConferenceOnExit: true, beep: 'false', waitUrl: publicUrl(`/api/voice/transfer?stage=hold&job=${jobId}`), waitMethod: 'POST', statusCallback: publicUrl(`/api/voice/transfer?stage=conference&job=${jobId}`), statusCallbackMethod: 'POST', statusCallbackEvent: ['join', 'leave', 'end'] }, `storm-${jobId}`);
  return response;
}
export async function requestTransfer(ticketId: string, reason: string) {
  const ticket = await db.callTicket.findUniqueOrThrow({ where: { id: ticketId }, include: { assignedEmployee: true, telephony: true } });
  if (!['HIGH', 'CRITICAL'].includes(ticket.urgency)) throw new HttpError(409, 'Live-Transfer ist für dringende Fälle vorgesehen.');
  const employee = ticket.assignedEmployee;
  if (!employee || employee.mode !== ticket.mode || employee.availability !== 'AVAILABLE') return { status: 'unavailable', transfer_executed: false, message: 'Kein zugeordneter Mitarbeiter als verfügbar markiert. Bitte Rückruftermin vereinbaren.' };
  if (ticket.mode === 'demo') { await activity(ticket.id, 'TRANSFER_SIMULATED', 'Mitarbeiter-Übernahme nur simuliert; keine Rufnummer gewählt.'); return { status: 'simulated', transfer_executed: false, message: 'Demo: kein echter Mitarbeiteranruf.' }; }
  const call = ticket.telephony;
  if (!call || call.endedAt || ['ENDED', 'FAILED'].includes(call.state)) throw new HttpError(409, 'Kein aktiver, verifizierter Twilio-Anruf für den Transfer.');
  let destination = employee.directPhone || process.env.EMERGENCY_TECHNICIAN_PHONE;
  if (!destination) throw new HttpError(503, 'Keine Mitarbeiter-Direktwahl konfiguriert.');
  destination = normalizePhone(destination);
  if (destination === call.fromNumber || destination === call.toNumber) throw new HttpError(409, 'Transferziel darf weder Anrufer noch Eingangsnummer sein.');
  const prior = await db.transferJob.findUnique({ where: { telephonyId: call.id } });
  if (prior) return { status: prior.state.toLowerCase(), transfer_id: prior.id, transfer_executed: prior.state === 'CONNECTED', message: 'Transfer wurde bereits angefordert. Kein zweiter Mitarbeiteranruf.' };
  const parent = await twilioClient().calls(call.carrierCallId).fetch();
  if (parent.status !== 'in-progress') throw new HttpError(409, 'Der Kundenanruf ist nicht mehr aktiv.');
  let job;
  try { job = await db.transferJob.create({ data: { telephonyId: call.id, technicianPhone: destination, reason } }); }
  catch (error) { const concurrent = await db.transferJob.findUnique({ where: { telephonyId: call.id } }); if (concurrent) return { status: concurrent.state.toLowerCase(), transfer_executed: false }; throw error; }
  try {
    await twilioClient().calls(call.carrierCallId).update({ twiml: conferenceXml(job.id, true).toString() });
    await db.telephonyCall.update({ where: { id: call.id }, data: { state: 'HOLDING' } });
    const technician = await twilioClient().calls.create({ to: destination, from: process.env.TWILIO_PHONE_NUMBER!, url: publicUrl(`/api/voice/transfer?stage=whisper&job=${job.id}`), method: 'POST', timeout: 25, statusCallback: publicUrl(`/api/voice/transfer?stage=status&job=${job.id}`), statusCallbackMethod: 'POST', statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'] });
    await db.transferJob.updateMany({ where: { id: job.id, technicianCallSid: null }, data: { technicianCallSid: technician.sid } });
    await db.transferJob.updateMany({ where: { id: job.id, state: 'PREPARING' }, data: { state: 'DIALING' } });
    await activity(ticket.id, 'TRANSFER_DIALING', 'Kunde wartet; Mitarbeiter wird angerufen und muss mit Taste 1 übernehmen.', `transfer:${job.id}`);
    const current = await db.transferJob.findUniqueOrThrow({ where: { id: job.id } });
    return { status: current.state.toLowerCase(), transfer_id: job.id, transfer_executed: current.state === 'CONNECTED', message: current.state === 'CONNECTED' ? 'Mitarbeiter hat angenommen und ist beigetreten.' : 'Mitarbeiter wird angerufen. Verbindung erst nach Annahme und Konferenzbeitritt bestätigt.' };
  } catch (error) {
    await transferFailed(job.id, 'Mitarbeiteranruf nicht bestätigt.');
    throw new HttpError(502, 'Transfer konnte nicht bestätigt werden. Der Rückfallpfad wurde angefordert.');
  }
}
export async function transferFailed(jobId: string, message: string) {
  const job = await db.transferJob.findUniqueOrThrow({ where: { id: jobId }, include: { telephony: true } });
  const changed = await db.transferJob.updateMany({ where: { id: jobId, state: { notIn: ['CONNECTED', 'COMPLETED', 'FAILED', 'DECLINED', 'CANCELLED'] } }, data: { state: 'FAILED', error: message } });
  if (!changed.count) return;
  await activity(job.telephony.ticketId, 'TRANSFER_FAILED', message, `transfer-failed:${job.id}`);
  await db.telephonyCall.update({ where: { id: job.telephonyId }, data: { state: 'RESUMING', bridgeUri: null } });
  await db.callTicket.update({ where: { id: job.telephony.ticketId }, data: { routeAction: 'CALLBACK', lastError: message } });
  try { await twilioClient().calls(job.telephony.carrierCallId).update({ url: publicUrl(`/api/voice/telephony-incoming?resume=${job.telephonyId}`), method: 'POST' }); }
  catch { await db.callTicket.update({ where: { id: job.telephony.ticketId }, data: { status: 'MANUAL_REVIEW', lastError: 'Transfer fehlgeschlagen; automatische Rückkehr zur KI nicht bestätigt. Disposition muss nachfassen.' } }); }
}
export async function transferCallback(stage: string, jobId: string | null, fields: Record<string, string>) {
  const job = jobId ? await db.transferJob.findUnique({ where: { id: jobId }, include: { telephony: true } }) : null;
  if (!job) throw new HttpError(404, 'Transfer nicht gefunden.');
  const response = voiceResponse();
  if (stage === 'hold') { if (fields.CallSid !== job.telephony.carrierCallId) throw new HttpError(403, 'Unbekannter Anrufer.'); response.say({ language: 'de-DE' }, 'Wir versuchen, Ihren Ansprechpartner zu erreichen.'); response.pause({ length: 10 }); response.redirect({ method: 'POST' }, publicUrl(`/api/voice/transfer?stage=hold&job=${job.id}`)); return response; }
  if (!job.technicianCallSid && ['whisper', 'accept', 'status'].includes(stage) && sidPattern.test(fields.CallSid || '')) {
    const candidate = await twilioClient().calls(fields.CallSid).fetch();
    if (candidate.to === job.technicianPhone && candidate.from === process.env.TWILIO_PHONE_NUMBER && candidate.direction === 'outbound-api') {
      await db.transferJob.updateMany({ where: { id: job.id, technicianCallSid: null }, data: { technicianCallSid: candidate.sid } });
      job.technicianCallSid = (await db.transferJob.findUniqueOrThrow({ where: { id: job.id } })).technicianCallSid;
    }
  }
  const technician = fields.CallSid === job.technicianCallSid;
  // CallSid is persisted before the answer URL is normally requested; reject unknown legs.
  if (['whisper', 'accept', 'status'].includes(stage) && !technician) throw new HttpError(403, 'Unbekanntes Mitarbeitergespräch.');
  if (stage === 'whisper') {
    if (['FAILED', 'CANCELLED', 'COMPLETED'].includes(job.state)) { response.hangup(); return response; }
    response.gather({ numDigits: 1, timeout: 8, action: publicUrl(`/api/voice/transfer?stage=accept&job=${job.id}`), method: 'POST', actionOnEmptyResult: true }).say({ language: 'de-DE' }, `Storm Telefonassistenz. Dringendes Kundenanliegen: ${job.reason.slice(0, 350)}. Drücken Sie 1, um den wartenden Kunden zu übernehmen. Jede andere Taste lehnt ab.`);
    return response;
  }
  if (stage === 'accept') {
    if (fields.Digits !== '1') { await transferFailed(job.id, 'Mitarbeiter hat nicht übernommen.'); response.hangup(); return response; }
    if (['FAILED', 'COMPLETED', 'CANCELLED'].includes(job.state)) { response.hangup(); return response; }
    await db.transferJob.update({ where: { id: job.id }, data: { state: 'ACCEPTED' } });
    return conferenceXml(job.id, false);
  }
  if (stage === 'status') {
    if (['busy', 'no-answer', 'failed', 'canceled', 'completed'].includes(fields.CallStatus) && !['CONNECTED', 'COMPLETED'].includes(job.state)) await transferFailed(job.id, `Mitarbeiter nicht verbunden (${fields.CallStatus}).`);
    return response;
  }
  if (stage === 'conference') {
    const event = fields.StatusCallbackEvent;
    if (fields.FriendlyName && fields.FriendlyName !== `storm-${job.id}`) throw new HttpError(403, 'Falsche Konferenz.');
    if (event === 'participant-join' && technician) {
      const changed = await db.transferJob.updateMany({ where: { id: job.id, state: 'ACCEPTED' }, data: { state: 'CONNECTED', conferenceSid: fields.ConferenceSid } });
      if (changed.count) { await db.telephonyCall.update({ where: { id: job.telephonyId }, data: { state: 'TRANSFERRED' } }); await db.callTicket.update({ where: { id: job.telephony.ticketId }, data: { routeAction: 'TRANSFERRED', callStatus: 'HUMAN_CONNECTED' } }); await activity(job.telephony.ticketId, 'TRANSFER_CONNECTED', 'Mitarbeiter hat angenommen und ist der Kundenkonferenz beigetreten.', `connected:${job.id}`); }
    }
    if (event === 'conference-end') await db.transferJob.updateMany({ where: { id: job.id, state: 'CONNECTED' }, data: { state: 'COMPLETED' } });
    return response;
  }
  throw new HttpError(400, 'Unbekannte Transferphase.');
}

export async function reconcileTransfers() {
  const stale = await db.transferJob.findMany({ where: { state: { in: ['PREPARING', 'DIALING', 'ACCEPTED'] }, updatedAt: { lt: new Date(Date.now() - 90000) } } });
  for (const job of stale) await transferFailed(job.id, 'Transfer-Zeitlimit überschritten; Mitarbeiterverbindung nicht bestätigt.');
  return { checked: stale.length };
}
