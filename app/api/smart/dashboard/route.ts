import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { failure } from '@/lib/http';
import { smartData } from '@/lib/smart/data';
export async function GET(request: Request) {
  try { await requireAdmin(); const mode = z.enum(['demo', 'live']).parse(new URL(request.url).searchParams.get('mode') ?? 'demo'); return Response.json(await smartData(mode), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
