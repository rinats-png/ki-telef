import type { Employee } from '@prisma/client';
import type { RoutingInput } from './validation';
export const roleNames: Record<string, string> = { B2B_SPECIALIST: 'B2B & HACCP', EMERGENCY_TECH: 'Akut-Disposition', BACKOFFICE: 'Innendienst & Service', PEST_EXPERT: 'Schädlingsberatung' };
export const issueNames: Record<string, string> = { NEW_INQUIRY: 'Neuanfrage', NEW_INFESTATION: 'Neuer Befall', FOLLOW_UP: 'Nachkontrolle', RESCHEDULE: 'Terminänderung', INVOICE: 'Rechnungsfrage', DOCUMENTATION: 'Dokumentation', MAINTENANCE: 'Wartung' };
export const smartPestNames: Record<string, string> = { WASPS: 'Wespen', RODENTS: 'Nager', BEDBUGS: 'Bettwanzen', COCKROACHES: 'Schaben', WOOD_PROTECTION: 'Holzschutz', PIGEONS: 'Tauben', BEES: 'Bienen', HORNETS: 'Hornissen', UNKNOWN: 'Allgemeines Anliegen' };
export function routeRole(input: RoutingInput) {
  if (input.urgency === 'CRITICAL') return { role: 'EMERGENCY_TECH', reason: 'Kritischer Fall: Akut-Disposition hat Vorrang vor Kundentyp und Servicekategorie.' };
  if (['INVOICE', 'RESCHEDULE', 'DOCUMENTATION', 'MAINTENANCE', 'FOLLOW_UP'].includes(input.issue_type)) return { role: 'BACKOFFICE', reason: 'Bestehender Auftrag, Rechnung, Dokumentation oder Wartung: Innendienst koordiniert den Vorgang.' };
  if (input.customer_type !== 'PRIVATE') return { role: 'B2B_SPECIALIST', reason: 'Gewerbe/HACCP oder Hausverwaltung: Betreuung durch B2B-Ansprechpartner.' };
  if (input.urgency === 'HIGH') return { role: 'EMERGENCY_TECH', reason: 'Akute Privatanfrage: fachliche Koordination durch Akut-Disposition.' };
  return { role: 'PEST_EXPERT', reason: 'Fachliche Privatkundenberatung: Zuordnung nach Schädlingsart und Einsatzgebiet.' };
}
export function selectEmployee(employees: Employee[], input: RoutingInput) {
  const rule = routeRole(input);
  const eligible = employees.filter(e => {
    const codes = e.postalCodes as string[], pests = e.pestTypes as string[];
    return e.active && (!codes.length || codes.includes(input.postal_code)) && (!pests.length || pests.includes(input.pest_type) || ['BACKOFFICE', 'B2B_SPECIALIST'].includes(e.role));
  });
  // No silent substitution of an unrelated role or unserved region.
  const employee = eligible.filter(e => e.role === rule.role).sort((a, b) => (a.availability === 'AVAILABLE' ? 0 : 1) - (b.availability === 'AVAILABLE' ? 0 : 1) || a.name.localeCompare(b.name))[0];
  return { employee, reason: rule.reason, requiredRole: rule.role };
}
