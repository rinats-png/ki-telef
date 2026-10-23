import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    originGuard(request); await requireAdmin(); const { id } = await context.params;
    const body = z.object({ mode: z.enum(['demo', 'live']), status: z.enum(['CLOSED', 'COMPLETED']) }).parse(parseJSON(await readBody(request)));
    const ticket = await db.callTicket.findFirst({ where: { id, mode: body.mode } });
    if (!ticket) throw new HttpError(404, 'Ticket nicht gefunden.');
    if (!['COMPLETED', 'CLOSED'].includes(ticket.status)) throw new HttpError(409, 'Unvollständige Outlook-Aktionen zuerst prüfen; kein Abschluss per Statusänderung.');
    await db.callTicket.update({ where: { id }, data: { status: body.status } }); return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    originGuard(request); await requireAdmin(); const { id } = await context.params;
    const body = z.object({ mode: z.enum(['demo', 'live']), action: z.literal('retry_outlook') }).parse(parseJSON(await readBody(request)));
    const { retryOutlookTicket } = await import('@/lib/smart/service');
    return Response.json(await retryOutlookTicket(id, body.mode));
  } catch (error) { return failure(error); }
}
