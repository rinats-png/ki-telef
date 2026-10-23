import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { HttpError } from './http';
export const SESSION_COOKIE = 'storm_session';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function getAdmin() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const session = await db.session.findUnique({ where: { tokenHash: digest(value) }, include: { admin: true } });
  return session && session.expiresAt > new Date() ? { id: session.admin.id, username: session.admin.username } : null;
}
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new HttpError(401, 'Bitte zuerst anmelden.');
  return admin;
}
export async function createSession(adminId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 8 * 3600_000);
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.create({ data: { tokenHash: digest(token), adminId, expiresAt: expires } });
  const url = new URL(process.env.APP_URL || 'http://localhost:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new HttpError(503, 'Für diesen Betrieb ist HTTPS erforderlich.');
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'strict', expires, path: '/' });
}
