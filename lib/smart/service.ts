import type { ProgressReporter } from './progress';
import { integrationStatus } from '../integrations';
import { createHash } from 'node:crypto';
import type { CallTicket } from '@prisma/client';
import { db } from '../db';
import { HttpError } from '../http';
import { availableSlots, calendarBusy, graphIsMock, operationId, overlaps, syncArtifact } from '../microsoft-graph';
import { issueNames, roleNames, selectEmployee, smartPestNames } from './routing';
import { normalizePhone, type FinalizeInput, type Mode, type RoutingInput } from './validation';
export async function ensureTicket(mode: Mode, provider: string, externalId: string) {
  return db.callTicket.upsert({ where: { mode_provider_externalId: { mode, provider, externalId } }, create: { mode, provider, externalId }, update: {} });
}
export async function lookupCustomer(ticket: CallTicket, input: string) {
  const phone = normalizePhone(input);
  const customer = await db.customer.findUnique({ where: { mode_phone: { mode: ticket.mode, phone } }, include: { tickets: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 3, select: { category: true, createdAt: true } } } });
  if (ticket.status === 'IDENTIFYING') await db.callTicket.update({ where: { id: ticket.id }, data: { callerPhone: phone, customerId: customer?.id, customerKind: customer?.status === 'EXISTING' ? 'EXISTING' : 'NEW', status: 'IDENTIFIED' } });
  return { found: !!customer, existing_customer: customer?.status === 'EXISTING', customer_id: customer?.id ?? null, name: customer?.name ?? null, company: customer?.company ?? null, contract_type: customer?.contractType ?? null, history: customer?.tickets.map(t => ({ category: issueNames[t.category] ?? t.category, date: t.createdAt.toISOString() })) ?? [], identity_notice: 'Caller-ID ist kein Identitätsnachweis. Name und Objekt/PLZ bestätigen lassen, bevor Auftragsdetails besprochen oder Daten geändert werden.' };
}
export async function routeTicket(ticket: CallTicket, input: RoutingInput) {
  if (['PROCESSING', 'PARTIAL', 'COMPLETED'].includes(ticket.status)) throw new HttpError(409, 'Der Abschluss läuft bereits oder ist abgeschlossen.');
  const { employee, reason, requiredRole } = selectEmployee(await db.employee.findMany({ where: { mode: ticket.mode, active: true } }), input);
  if (!employee) {
    await db.callTicket.update({ where: { id: ticket.id }, data: { status: 'MANUAL_REVIEW', routingReason: 'Keine passende aktive Zuständigkeit für Rolle und Gebiet gefunden.', category: input.issue_type, pestType: input.pest_type, urgency: input.urgency } });
    return { status: 'manual_review', required_role: requiredRole, slots: [], message: 'Kein passender Mitarbeiter verfügbar. Keine Termin- oder Gebietszusage; Disposition muss manuell zuordnen.' };
  }
  const mode = ticket.mode as Mode;
  const slots = await availableSlots(employee, mode);
  const warm = input.urgency === 'CRITICAL' && employee.availability === 'AVAILABLE';
  // Availability is explicitly maintained by dispatch; it is not Microsoft presence.
  await db.callTicket.update({ where: { id: ticket.id }, data: { assignedEmployeeId: employee.id, category: input.issue_type, pestType: input.pest_type, urgency: input.urgency, routingReason: reason, routeAction: warm ? 'TRANSFER_CANDIDATE' : 'CALLBACK', status: slots.length ? 'ROUTED' : 'MANUAL_REVIEW' } });
  const offers = await db.$transaction(async tx => {
    await tx.slotOffer.deleteMany({ where: { ticketId: ticket.id, claimed: false } });
    const offers = [];
    for (const slot of slots) offers.push(await tx.slotOffer.create({ data: { ticketId: ticket.id, employeeId: employee.id, start: new Date(slot.start), end: new Date(slot.end), expiresAt: new Date(Date.now() + 10 * 60000) } }));
    return offers;
  });
  return { status: slots.length ? 'routed' : 'manual_review', employee: { id: employee.id, name: employee.name, role: employee.role, availability: employee.availability }, reason, transfer_candidate: warm, transfer_executed: false, transfer_status: ticket.mode === 'live' && integrationStatus().transferConfigured ? 'ready' : 'not_connected', message: warm ? 'Mitarbeiter ist als verfügbar markiert. Wenn transfer_status ready ist, nach Zustimmung transfer_to_employee aufrufen. Sonst Rückruftermin vereinbaren.' : 'Rückruftermin aus den angebotenen Slots vereinbaren.', mock_mode: graphIsMock(mode), slots: offers.map(s => ({ id: s.id, start: s.start.toISOString(), end: s.end.toISOString(), expires_at: s.expiresAt.toISOString() })) };
}
function formatDate(date: Date) { return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' }).format(date); }
async function result(ticketId: string) {
  const ticket = await db.callTicket.findUniqueOrThrow({ where: { id: ticketId }, include: { assignedEmployee: true, artifacts: true } });
  const event = ticket.artifacts.find(a => a.kind === 'EVENT'), draft = ticket.artifacts.find(a => a.kind === 'DRAFT'), confirmation = ticket.artifacts.find(a => a.kind === 'CONFIRMATION');
  return { status: ticket.status.toLowerCase(), ticket_id: ticket.id, employee: ticket.assignedEmployee?.name, appointment: event ? { start: event.start?.toISOString(), end: event.end?.toISOString(), status: event.state, mock: event.isMock } : null, outlook_event_id: ticket.outlookEventId, outlook_draft_id: ticket.outlookDraftId, draft_status: draft?.state, confirmation_status: confirmation?.state, message: event?.isMock ? 'Demo abgeschlossen: Termin, Entwurf und Bestätigung wurden ausschließlich lokal simuliert. Keine echte Buchung oder E-Mail.' : ticket.status === 'COMPLETED' ? 'Termin und Entwurf wurden in Outlook angelegt; die Bestätigung wurde von Microsoft zur Verarbeitung angenommen. Zustellung ist nicht nachgewiesen.' : 'Abschluss noch nicht vollständig bestätigt. Disposition muss den Vorgang prüfen.' };
}
export async function finalizeTicket(original: CallTicket, input: FinalizeInput, report?: ProgressReporter) {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const fresh = await db.callTicket.findUniqueOrThrow({ where: { id: original.id } });
  if (fresh.finalizationHash && fresh.finalizationHash !== fingerprint) throw new HttpError(409, 'Abschlussdaten wurden bereits festgelegt. Änderungen bitte durch die Disposition vornehmen.');
  if (['COMPLETED', 'CLOSED'].includes(fresh.status)) return result(fresh.id);
  const locked = await db.callTicket.updateMany({ where: { id: fresh.id, OR: [{ processingUntil: null }, { processingUntil: { lt: new Date() } }] }, data: { processingUntil: new Date(Date.now() + 300000), status: 'PROCESSING' } });
  if (!locked.count) throw new HttpError(409, 'Dieser Anruf wird bereits verarbeitet. Bitte Ergebnis abwarten.');
  try {
    const employee = fresh.assignedEmployeeId ? await db.employee.findFirst({ where: { id: fresh.assignedEmployeeId, mode: fresh.mode, active: true } }) : null;
    const offer = await db.slotOffer.findFirst({ where: { id: input.slot_id, ticketId: fresh.id, employeeId: employee?.id } });
    if (!employee || !offer) throw new HttpError(409, 'Bitte zuerst zuständigen Mitarbeiter und gültige Terminvorschläge ermitteln.');
    const eventAlready = await db.outlookArtifact.findUnique({ where: { ticketId_kind: { ticketId: fresh.id, kind: 'EVENT' } } });
    const mode = fresh.mode as Mode; const mock = graphIsMock(mode);
    const covered = employee.postalCodes as string[];
    if (covered.length && !covered.includes(input.contact.postal_code)) throw new HttpError(409, 'Geänderte Adresse liegt außerhalb der Mitarbeiter-Zuordnung. Bitte neu routen.');
    if (!mock && (employee.upn.endsWith('.invalid') || input.contact.email.endsWith('.invalid'))) throw new HttpError(503, 'Demo-E-Mail-Adressen dürfen nicht für echte Microsoft-Aktionen verwendet werden.');
    const phone = normalizePhone(input.contact.phone);
    const existing = await db.customer.findUnique({ where: { mode_phone: { mode, phone } } });
    if (fresh.customerId && existing?.id !== fresh.customerId) throw new HttpError(409, 'Rückrufnummer passt nicht zum identifizierten Kunden. Identifikation erneut durchführen.');
    if (!eventAlready) {
      if (offer.expiresAt < new Date() || offer.start < new Date()) throw new HttpError(409, 'Terminvorschlag abgelaufen. Bitte neue freie Slots anfordern.');
      const busy = await calendarBusy(employee, mode, offer.start.toISOString(), offer.end.toISOString());
      if (overlaps({ start: offer.start.toISOString(), end: offer.end.toISOString() }, busy)) throw new HttpError(409, 'Termin ist inzwischen belegt. Bitte neue Slots anfordern.');
      await db.$transaction(async tx => {
        // Serialize reservations per employee, also when migrating to PostgreSQL.
        await tx.employee.update({ where: { id: employee.id }, data: { availability: employee.availability } });
        const conflict = await tx.outlookArtifact.findFirst({ where: { employeeId: employee.id, kind: 'EVENT', state: { in: ['PENDING', 'CREATED', 'SIMULATED'] }, start: { lt: offer.end }, end: { gt: offer.start } } });
        if (conflict) throw new HttpError(409, 'Termin wurde gerade vergeben. Bitte neue Slots anfordern.');
        const contact = input.contact;
        const customer = await tx.customer.upsert({ where: { mode_phone: { mode, phone } }, create: { mode, phone, name: contact.name, email: contact.email, street: contact.street, postalCode: contact.postal_code, city: contact.city, company: contact.company, status: contact.existing_customer ? 'EXISTING' : 'NEW', contractType: 'NONE' }, update: { name: contact.name, email: contact.email, street: contact.street, postalCode: contact.postal_code, city: contact.city, company: contact.company } });
        const ticket = await tx.callTicket.update({ where: { id: fresh.id }, data: { customerId: customer.id, customerKind: contact.existing_customer ? 'EXISTING' : 'NEW', summary: input.summary, ...(input.transcript && fresh.transcriptRank === 0 ? { transcript: input.transcript } : {}), finalizationHash: fingerprint } });
        const note = `${input.appointment_type === 'INSPECTION' ? 'Besichtigung' : 'Rückruf'} · ${formatDate(offer.start)} (Europe/Berlin)\n\nKontakt: ${contact.name}${contact.company ? ' · ' + contact.company : ''}\nTelefon: ${phone}\nE-Mail: ${contact.email}\nAdresse: ${contact.street}, ${contact.postal_code} ${contact.city}\nAnliegen: ${issueNames[ticket.category]} · ${smartPestNames[ticket.pestType]}\nPriorität: ${ticket.urgency}\nRouting: ${ticket.routingReason}\n\n${input.summary}\n\nGesprächsnotizen:\n${input.transcript || ticket.transcript || 'Keine weiteren Gesprächsnotizen.'}`;
        const personalReply = ticket.category === 'INVOICE' ? 'Ich prüfe Ihre Rückfrage zur Rechnung und melde mich mit den passenden Unterlagen.' : ticket.category === 'FOLLOW_UP' ? 'Ich schaue mir Ihren laufenden Auftrag an und stimme die nächsten Schritte mit Ihnen ab.' : 'Wir prüfen Ihren geschilderten Befall fachlich und besprechen die passende Vorgehensweise mit Ihnen. Ein konkretes Angebot erhalten Sie nach Prüfung von Umfang und Einsatzbedingungen; dieser Entwurf enthält keine Preiszusage.';
        const artifacts = [
          { kind: 'EVENT', subject: `Storm · ${input.appointment_type === 'INSPECTION' ? 'Besichtigung' : 'Rückruf'} · ${contact.company || contact.name}`, bodyText: note, recipient: employee.upn, start: offer.start, end: offer.end },
          { kind: 'DRAFT', subject: `Ihr Anliegen bei Storm · ${issueNames[ticket.category]}`, bodyText: `Guten Tag ${contact.name},\n\nvielen Dank für Ihr Gespräch mit unserer Telefonassistenz. ${personalReply}\n\nZusammenfassung: ${input.summary}\n\nUnser vereinbarter ${input.appointment_type === 'INSPECTION' ? 'Besichtigungstermin' : 'Rückruftermin'}: ${formatDate(offer.start)}.\n\nMit freundlichen Grüßen\n${employee.name}\nStorm Schädlingsbekämpfung GmbH\n\n— Interne Prüfung vor Versand: Angaben und fachliche Aussagen kontrollieren. —`, recipient: contact.email },
          { kind: 'CONFIRMATION', subject: 'Ihr Anliegen bei der Storm GmbH ist in Bearbeitung', bodyText: `Guten Tag ${contact.name},\n\nvielen Dank für Ihren Anruf. Ihr Anliegen wurde aufgenommen.\n\nZuständiger Ansprechpartner: ${employee.name} (${roleNames[employee.role]}).\nVereinbarter Termin: ${formatDate(offer.start)} (Europe/Berlin).\nTerminart: ${input.appointment_type === 'INSPECTION' ? 'Besichtigung' : 'Rückruf'}.\n\nIhr Anliegen: ${input.summary}\n\nMit freundlichen Grüßen\nIhr Team der Storm Schädlingsbekämpfung GmbH`, recipient: contact.email },
        ];
        for (const artifact of artifacts) await tx.outlookArtifact.create({ data: { ...artifact, id: operationId(), ticketId: ticket.id, employeeId: employee.id, isMock: mock } });
        await tx.slotOffer.update({ where: { id: offer.id }, data: { claimed: true } });
      });
    }
    await synchronizeArtifacts(fresh.id, employee, report);
    return result(fresh.id);
  } catch (error) {
    const artifacts = await db.outlookArtifact.count({ where: { ticketId: fresh.id } });
    await db.callTicket.update({ where: { id: fresh.id }, data: { status: artifacts ? 'PARTIAL' : 'ROUTED', processingUntil: null, lastError: error instanceof HttpError ? error.message : 'Aktion nicht vollständig bestätigt. Bitte Disposition prüfen lassen.' } });
    throw error;
  }
}

async function synchronizeArtifacts(ticketId: string, employee: import('@prisma/client').Employee, report?: ProgressReporter) {
  const artifacts = await db.outlookArtifact.findMany({ where: { ticketId: ticketId } });
  for (const kind of ['EVENT', 'DRAFT', 'CONFIRMATION']) {
      const artifact = artifacts.find(a => a.kind === kind);
      if (!artifact) throw new HttpError(409, 'Unvollständige Outlook-Aktionen: manuelle Prüfung erforderlich.');
      await report?.({ step: kind, state: 'running', message: kind === 'EVENT' ? 'Outlook-Termin wird angelegt …' : kind === 'DRAFT' ? 'Antwortentwurf wird vorbereitet …' : 'Bestätigung wird vorbereitet …', ticketId: ticketId });
      const synced = await syncArtifact(artifact, employee);
      const message = `${kind === 'EVENT' ? 'Kalendertermin' : kind === 'DRAFT' ? 'Antwortentwurf' : 'Eingangsbestätigung'} ${synced.isMock ? 'lokal simuliert' : 'von Microsoft bestätigt'}.`;
      await db.callActivity.upsert({ where: { dedupeKey: `artifact:${artifact.id}` }, create: { ticketId: ticketId, kind, message, dedupeKey: `artifact:${artifact.id}` }, update: {} });
      await report?.({ step: kind, state: 'done', message, ticketId: ticketId });
      if (kind === 'EVENT' || kind === 'DRAFT') await db.callTicket.update({ where: { id: ticketId }, data: kind === 'EVENT' ? { outlookEventId: synced.remoteId } : { outlookDraftId: synced.remoteId } });
    }
    await db.callTicket.update({ where: { id: ticketId }, data: { status: 'COMPLETED', processingUntil: null, lastError: null } });
}
export async function retryOutlookTicket(ticketId: string, mode: Mode) {
  const ticket = await db.callTicket.findFirst({ where: { id: ticketId, mode }, include: { assignedEmployee: true } });
  if (!ticket || !ticket.assignedEmployee) throw new HttpError(404, 'Vorgang nicht gefunden.');
  if (ticket.status !== 'PARTIAL') throw new HttpError(409, 'Nur unvollständige Outlook-Vorgänge können erneut abgeglichen werden.');
  const locked = await db.callTicket.updateMany({ where: { id: ticketId, OR: [{ processingUntil: null }, { processingUntil: { lt: new Date() } }] }, data: { processingUntil: new Date(Date.now() + 300000), status: 'PROCESSING' } });
  if (!locked.count) throw new HttpError(409, 'Der Vorgang wird bereits abgeglichen.');
  try { await synchronizeArtifacts(ticketId, ticket.assignedEmployee); return result(ticketId); }
  catch (error) { await db.callTicket.update({ where: { id: ticketId }, data: { status: 'PARTIAL', processingUntil: null, lastError: error instanceof HttpError ? error.message : 'Outlook-Abgleich nicht bestätigt.' } }); throw error; }
}
