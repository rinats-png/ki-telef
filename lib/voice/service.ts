import { Prisma, type PrismaClient } from '@prisma/client';
import { db } from '../db';
import { toolSchemas, type Provider, type ToolName } from '../validation';
import { normalize, encodeResults } from './adapters';

async function execute(tx: Prisma.TransactionClient, callId: string, name: ToolName, input: unknown) {
  if (name === 'check_service_area') {
    const args = toolSchemas.check_service_area.parse(input);
    return { status: 'manual_review', postal_code: args.postal_code, message: 'Unser Team prüft, ob wir Ihre Adresse bedienen können. Keine Gebietszusage.' };
  }
  if (name === 'create_lead_ticket') {
    const args = toolSchemas.create_lead_ticket.parse(input);
    const existing = await tx.lead.findUnique({ where: { callId } });
    const lead = existing ?? await tx.lead.create({ data: {
      callId, name: args.name, phone: args.phone, street: args.street, postalCode: args.postal_code, city: args.city,
      customerType: args.customer_type, company: args.company, pestType: args.pest_type, urgency: args.urgency,
      summary: args.summary, duration: args.duration, location: args.location, childrenOrPets: args.children_or_pets,
    } });
    return { status: 'created', ticket_id: lead.id, service_area_status: 'manual_review', message: 'Anliegen erfasst. Das Fachteam meldet sich schnellstmöglich; Gebiet und Termin sind noch zu bestätigen.' };
  }
  const args = toolSchemas.trigger_emergency_escalation.parse(input);
  const alarm = await tx.escalation.upsert({ where: { callId }, create: { callId, reason: args.reason, phone: args.phone }, update: {} });
  return { status: 'recorded', escalation_id: alarm.id, delivery_status: 'not_configured', message: 'Intern erfasst. Externe Alarmierung und Rufweiterleitung sind noch nicht aktiviert.' };
}
export async function dispatch(provider: Provider, input: unknown, mode: 'demo' | 'live', client: PrismaClient = db) {
  const event = normalize(provider, input);
  if (!event.accepted) return { received: true, ignored: true };
  const results: { id: string; name: string; result: unknown }[] = [];
  // Validate all tools before committing any side effect in a batch.
  for (const tool of event.tools) toolSchemas[tool.name].parse(tool.args);
  await client.$transaction(async tx => {
    const call = await tx.call.upsert({
      where: { provider_externalId_mode: { provider, externalId: event.callId, mode } },
      create: { provider, externalId: event.callId, mode }, update: {},
    });
    for (const tool of event.tools) {
      // PLZ checks are read-only and can be repeated with corrected data.
      const key = tool.name === 'check_service_area' ? `tool:${tool.id}:${JSON.stringify(tool.args)}` : `tool:${tool.id}`;
      const cached = await tx.receipt.findUnique({ where: { callId_eventKey: { callId: call.id, eventKey: key } } });
      const result: unknown = cached ? JSON.parse(cached.result) : await execute(tx, call.id, tool.name, tool.args);
      if (!cached) await tx.receipt.create({ data: { callId: call.id, eventKey: key, result: JSON.stringify(result) } });
      results.push({ id: tool.id, name: tool.name, result });
    }
    if (event.eventKey) {
      const cached = await tx.receipt.findUnique({ where: { callId_eventKey: { callId: call.id, eventKey: event.eventKey } } });
      if (!cached) {
        await tx.call.update({ where: { id: call.id }, data: {
          ...(event.ended ? { status: 'COMPLETED', endedAt: call.endedAt ?? new Date() } : {}),
          ...(event.transcript?.trim() ? { transcript: event.transcript } : {}),
        } });
        await tx.receipt.create({ data: { callId: call.id, eventKey: event.eventKey, result: '{}' } });
      }
    }
  }, { maxWait: 5000, timeout: 10000 });
  return encodeResults(provider, results);
}
