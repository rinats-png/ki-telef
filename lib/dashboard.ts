import { db } from './db';
export async function dashboardData(mode: 'demo' | 'live') {
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [leads, technicians, calls, b2b, escalations] = await Promise.all([
    db.lead.findMany({ where: { call: { mode } }, include: { call: { include: { escalations: true } }, technician: true }, orderBy: [{ createdAt: 'desc' }], take: 200 }),
    db.technician.findMany({ where: { mode }, orderBy: { name: 'asc' } }),
    db.call.count({ where: { mode, createdAt: { gte: month } } }),
    db.lead.count({ where: { call: { mode }, createdAt: { gte: month }, customerType: { not: 'PRIVATE' } } }),
    db.escalation.findMany({ where: { call: { mode, OR: [{ lead: null }, { lead: { status: { not: 'DONE' } } }] } }, include: { call: { select: { lead: { select: { id: true, name: true } } } } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const monthlyLeads = await db.lead.count({ where: { call: { mode }, createdAt: { gte: month } } });
  const configured = Number(process.env.ESTIMATED_LEAD_VALUE_EUR || 250);
  const estimatedValue = Number.isFinite(configured) && configured >= 0 ? configured : 250;
  const openEmergencies = await db.call.count({ where: { mode, OR: [
    { lead: { urgency: 'EMERGENCY', status: { not: 'DONE' } } },
    { escalations: { some: {} }, OR: [{ lead: null }, { lead: { status: { not: 'DONE' } } }] },
  ] } });
  return { leads, technicians, escalations, stats: { calls, estimatedRevenue: monthlyLeads * estimatedValue, estimatedValue, monthlyLeads, openEmergencies, b2b }, mode };
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
// JSON serialization converts Prisma's Date fields to strings for the browser.
export type Serialized<T> = T extends Date ? string : T extends Array<infer U> ? Serialized<U>[] : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export type DashboardPayload = Serialized<DashboardData>;
