import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    originGuard(request); await requireAdmin();
    const { id } = await context.params;
    const body = z.object({ mode: z.enum(['demo', 'live']), availability: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']) }).strict().parse(parseJSON(await readBody(request)));
    const result = await db.employee.updateMany({ where: { id, mode: body.mode }, data: { availability: body.availability } });
    if (!result.count) throw new HttpError(404, 'Mitarbeiter nicht gefunden.');
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
