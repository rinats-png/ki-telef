import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { demoCases, reportPayload, toolPayload } from '../lib/demo';
import { dispatch } from '../lib/voice/service';
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  for (const technician of [
    { id: 'tech-martin', name: 'Martin Fischer', specialty: 'Nager & Gewerbe' },
    { id: 'tech-lena', name: 'Lena Hoffmann', specialty: 'Insekten & Artenschutz' },
    { id: 'tech-thomas', name: 'Thomas Becker', specialty: 'Monitoring & HACCP' },
  ]) await db.technician.upsert({ where: { id: technician.id }, create: { ...technician, mode: 'demo' }, update: {} });
  const samples = [
    { scenario: 'restaurant' as const, name: 'Markus Weber', company: 'Restaurant Mainblick · Demo', pest: 'RODENTS', urgency: 'EMERGENCY', type: 'BUSINESS_HACCP', age: 12, status: 'OPEN', tech: null },
    { scenario: 'family' as const, name: 'Julia Schneider', company: '', pest: 'WASPS', urgency: 'ACUTE', type: 'PRIVATE', age: 35, status: 'OPEN', tech: null },
    { scenario: 'restaurant' as const, name: 'Sandra König', company: 'Hausverwaltung König · Demo', pest: 'PIGEONS', urgency: 'STANDARD', type: 'PROPERTY_MANAGEMENT', age: 74, status: 'IN_PROGRESS', tech: 'tech-thomas' },
    { scenario: 'family' as const, name: 'Michael Braun', company: '', pest: 'BEDBUGS', urgency: 'ACUTE', type: 'PRIVATE', age: 112, status: 'IN_PROGRESS', tech: 'tech-lena' },
    { scenario: 'restaurant' as const, name: 'Daniel Roth', company: 'Bäckerei Roth · Demo', pest: 'COCKROACHES', urgency: 'EMERGENCY', type: 'BUSINESS_HACCP', age: 165, status: 'OPEN', tech: 'tech-martin' },
    { scenario: 'family' as const, name: 'Petra Wagner', company: '', pest: 'UNKNOWN', urgency: 'STANDARD', type: 'PRIVATE', age: 230, status: 'DONE', tech: 'tech-lena' },
    { scenario: 'restaurant' as const, name: 'Nina Hartmann', company: 'Hotel Stadtgarten · Demo', pest: 'RODENTS', urgency: 'STANDARD', type: 'BUSINESS_HACCP', age: 290, status: 'DONE', tech: 'tech-martin' },
  ];
  const summaries = [demoCases.restaurant.lead.summary, demoCases.family.lead.summary, 'Tauben auf mehreren Balkonen einer Wohnanlage. Hausverwaltung wünscht Beratung zu dauerhafter Abwehr und einem Besichtigungstermin.', 'Verdacht auf Bettwanzen im Schlafzimmer nach einer Reise. Diskrete fachliche Bestimmung und Beratung gewünscht. Keine gesicherte Diagnose.', 'Schaben in der Backstube gesichtet. Lebensmittelbereich betroffen, Betrieb läuft. Dringender Rückruf und fachliche Prüfung erforderlich.', 'Unbekanntes Insekt im Keller. Präventive Beratung und Schädlingsbestimmung gewünscht. Kein akuter Befall bestätigt.', 'Regelmäßiges Nager-Monitoring für Hotelanlage angefragt. Beratung zu Prävention und HACCP-Dokumentation gewünscht.'];
  for (const [i, sample] of samples.entries()) {
    const provider = i % 2 ? 'retell' : 'vapi'; const callId = `seed-storm-${i}`;
    const existing = await db.call.findUnique({ where: { provider_externalId_mode: { provider, externalId: callId, mode: 'demo' } } });
    if (existing) continue;
    const base = demoCases[sample.scenario];
    const lead = { ...base.lead, name: sample.name, company: sample.company, pest_type: sample.pest, urgency: sample.urgency, customer_type: sample.type, summary: summaries[i], phone: `+49 000 00000${i + 1}`, duration: i < 2 ? base.lead.duration : 'Beim Erstgespräch aufgenommen', location: i === 2 ? 'Balkone der Wohnanlage' : i === 3 ? 'Schlafzimmer' : i === 4 ? 'Backstube' : i === 5 ? 'Keller' : i === 6 ? 'Hotelanlage' : base.lead.location, children_or_pets: i === 1 ? 'Zwei Kinder, ein Hund' : 'Keine Angabe' };
    await dispatch(provider, toolPayload(provider, callId, 'create_lead_ticket', lead), 'demo', db);
    if (sample.urgency === 'EMERGENCY') await dispatch(provider, toolPayload(provider, callId, 'trigger_emergency_escalation', { reason: summaries[i], phone: lead.phone }), 'demo', db);
    const transcript = i < 2 ? base.transcript : `KI: Guten Tag bei Storm. Ich bin der KI-Telefonassistent. Wie kann ich Ihnen helfen?\nAnrufer: Mein Name ist ${sample.name}. ${summaries[i]}\nKI: Danke. Ich nehme das diskret auf und bestätige Ihre Kontaktdaten.\nAnrufer: Ja, die Angaben stimmen.\nKI: Ihr Anliegen ist erfasst. Das Fachteam meldet sich schnellstmöglich. Gebiet und Termin werden im Rückruf geprüft.`;
    await dispatch(provider, reportPayload(provider, callId, transcript), 'demo', db);
    const when = new Date(Date.now() - sample.age * 60_000);
    await db.call.update({ where: { provider_externalId_mode: { provider, externalId: callId, mode: 'demo' } }, data: { createdAt: when, endedAt: when, lead: { update: { createdAt: when, status: sample.status, technicianId: sample.tech } } } });
  }
  console.log('7 fiktive Demo-Anrufe und 3 Demo-Techniker vorbereitet. Echtdaten und bestehende Tickets bleiben unverändert.');
}
main().catch(() => { console.error('Demo-Daten konnten nicht angelegt werden. Datenbankmigration prüfen.'); process.exitCode = 1; }).finally(() => db.$disconnect());
