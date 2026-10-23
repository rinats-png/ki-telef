import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
export const runtime = 'nodejs';
const dummyHash = hashPassword('invalid-account-timing-padding');
export async function POST(request: Request) {
  try {
    originGuard(request);
    const { username, password } = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(256) }).parse(parseJSON(await readBody(request)));
    // One local account: a global, persisted limit cannot be evaded by changing usernames or proxy headers.
    const key = 'local-admin'; const now = new Date();
    await db.loginAttempt.upsert({ where: { key }, create: { key }, update: {} });
    await db.loginAttempt.updateMany({ where: { key, windowStart: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { failures: 0, windowStart: now } });
    const slot = await db.loginAttempt.updateMany({ where: { key, failures: { lt: 5 } }, data: { failures: { increment: 1 } } });
    if (!slot.count) throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
    const admin = await db.admin.findUnique({ where: { username } });
    const valid = verifyPassword(password, admin?.passwordHash || dummyHash);
    if (!admin || !valid) throw new HttpError(401, 'Benutzername oder Passwort ist falsch.');
    await db.loginAttempt.update({ where: { key }, data: { failures: 0 } });
    await createSession(admin.id);
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
