import { integrationStatus } from '../integrations';
import { db } from '../db';
import { graphIsMock } from '../microsoft-graph';
import type { Mode } from './validation';
export async function smartData(mode: Mode) {
  const [tickets, employees, customers] = await Promise.all([
    db.callTicket.findMany({ where: { mode }, include: { customer: true, assignedEmployee: true, artifacts: true, activities: { orderBy: { createdAt: 'asc' }, take: 40 }, telephony: { include: { transfer: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.employee.findMany({ where: { mode }, orderBy: { name: 'asc' } }),
    db.customer.findMany({ where: { mode }, orderBy: { name: 'asc' }, take: 100 }),
  ]);
  const [calls, completed, existing, artifacts] = await Promise.all([
    db.callTicket.count({ where: { mode } }), db.callTicket.count({ where: { mode, status: 'COMPLETED' } }), db.callTicket.count({ where: { mode, customerKind: 'EXISTING' } }), db.outlookArtifact.count({ where: { ticket: { mode }, state: { in: ['CREATED', 'SIMULATED', 'ACCEPTED'] } } }),
  ]);
  const openEmergencies = await db.callTicket.count({ where: { mode, urgency: { in: ['HIGH', 'CRITICAL'] }, status: { not: 'CLOSED' } } });
  const activeCalls = await db.telephonyCall.count({ where: { ticket: { mode }, endedAt: null, state: { notIn: ['ENDED', 'FAILED'] } } });
  return { mode, mockMode: graphIsMock(mode), tickets, employees, customers, stats: { calls, completed, existing, artifacts, openEmergencies, activeCalls }, promptVersion: 'Storm Voice Hub · v3', transferConnected: integrationStatus().transferConfigured, integrations: integrationStatus() };
}
export type SmartData = Awaited<ReturnType<typeof smartData>>;
export type JsonValue<T> = T extends Date ? string : T extends Array<infer U> ? JsonValue<U>[] : T extends object ? { [K in keyof T]: JsonValue<T[K]> } : T;
export type SmartPayload = JsonValue<SmartData>;
