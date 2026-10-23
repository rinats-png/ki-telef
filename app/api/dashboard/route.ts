import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { dashboardData } from '@/lib/dashboard';
import { failure } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const mode = z.enum(['demo', 'live']).parse(new URL(request.url).searchParams.get('mode') ?? 'demo');
    return Response.json(await dashboardData(mode), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
