import nextEnv from '@next/env';
import { db } from '../lib/db';
import { simulateSmart } from '../lib/smart/simulate';
import { smartScenarios } from '../lib/smart/demo';
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  const staff = [
    { id: 'smart-max', name: 'Max Mustermann', role: 'B2B_SPECIALIST', upn: 'max.mustermann@storm-demo.invalid', availability: 'AVAILABLE', pestTypes: [], postalCodes: [] },
    { id: 'smart-sabine', name: 'Sabine Müller', role: 'BACKOFFICE', upn: 'sabine.mueller@storm-demo.invalid', availability: 'AVAILABLE', pestTypes: [], postalCodes: [] },
    { id: 'smart-tom', name: 'Tom Weber', role: 'EMERGENCY_TECH', upn: 'tom.weber@storm-demo.invalid', availability: 'AVAILABLE', pestTypes: ['WASPS', 'RODENTS', 'COCKROACHES', 'BEES', 'HORNETS', 'BEDBUGS', 'UNKNOWN'], postalCodes: [] },
    { id: 'smart-lena', name: 'Lena Hoffmann', role: 'PEST_EXPERT', upn: 'lena.hoffmann@storm-demo.invalid', availability: 'BUSY', pestTypes: [], postalCodes: [] },
  ];
  for (const [i, employee] of staff.entries()) await db.employee.upsert({ where: { id: employee.id }, create: { ...employee, mode: 'demo', directPhone: `+49000000020${i + 1}` }, update: {} });
  const c = smartScenarios.existing.contact;
  await db.customer.upsert({ where: { mode_phone: { mode: 'demo', phone: c.phone } }, create: { id: 'smart-customer-koenig', mode: 'demo', name: c.name, company: c.company, phone: c.phone, email: c.email, street: c.street, postalCode: c.postal_code, city: c.city, status: 'EXISTING', contractType: 'HACCP_B2B' }, update: {} });
  for (const scenario of ['wasps', 'restaurant', 'existing'] as const) {
    const externalId = `smart-seed-${scenario}`;
    if (!await db.callTicket.findUnique({ where: { mode_provider_externalId: { mode: 'demo', provider: 'vapi', externalId } } })) await simulateSmart(scenario, 'vapi', externalId);
  }
  const artifacts = await db.outlookArtifact.findMany({ where: { isMock: true, ticket: { mode: 'demo' } } });
  for (const artifact of artifacts) await db.callActivity.upsert({ where: { dedupeKey: `artifact:${artifact.id}` }, create: { ticketId: artifact.ticketId, kind: artifact.kind, message: `${artifact.kind === 'EVENT' ? 'Kalendertermin' : artifact.kind === 'DRAFT' ? 'Antwortentwurf' : 'Eingangsbestätigung'} lokal simuliert.`, dedupeKey: `artifact:${artifact.id}`, createdAt: artifact.createdAt }, update: {} });
  console.log('Smart-Routing-Demo: 4 fiktive Mitarbeiter, Beispiel-Bestandskunde, 3 abgeschlossene Workflows und 9 simulierte Outlook-Aktionen.');
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Smart-Seed fehlgeschlagen.'); process.exitCode = 1; }).finally(() => db.$disconnect());
