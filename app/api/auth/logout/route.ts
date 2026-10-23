import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { digest, SESSION_COOKIE } from '@/lib/auth';
import { failure, originGuard } from '@/lib/http';
export async function POST(request: Request) {
  try {
    originGuard(request);
    const jar = await cookies(); const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await db.session.deleteMany({ where: { tokenHash: digest(token) } });
    jar.delete(SESSION_COOKIE);
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
