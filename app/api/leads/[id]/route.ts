import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
const schema = z.object({ mode: z.enum(['demo', 'live']), status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(), technicianId: z.string().max(100).nullable().optional() }).strict().refine(v => v.status !== undefined || v.technicianId !== undefined);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    originGuard(request); await requireAdmin();
    const { id } = await context.params;
    const { mode, ...changes } = schema.parse(parseJSON(await readBody(request)));
    const lead = await db.lead.findFirst({ where: { id, call: { mode } } });
    if (!lead) throw new HttpError(404, 'Ticket nicht gefunden.');
    if (changes.technicianId && !await db.technician.findFirst({ where: { id: changes.technicianId, mode } })) throw new HttpError(400, 'Techniker nicht gefunden.');
    await db.lead.update({ where: { id }, data: { ...changes, ...(changes.technicianId && lead.status === 'OPEN' && !changes.status ? { status: 'IN_PROGRESS' } : {}) } });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
