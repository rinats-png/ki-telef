import { timingSafeEqual } from 'node:crypto';
import Retell from 'retell-sdk';
import { requireAdmin } from '@/lib/auth';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { dispatchSmart } from '@/lib/smart/webhook';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const url = new URL(request.url); const provider = providerSchema.parse(url.searchParams.get('provider'));
    const raw = await readBody(request);
    const mode = url.searchParams.get('mode');
    if (mode && !['demo', 'live'].includes(mode)) throw new HttpError(400, 'Ungültiger Modus.');
    if (mode === 'demo') {
      originGuard(request); await requireAdmin();
    } else if (provider === 'vapi') {
      const expected = process.env.VAPI_WEBHOOK_SECRET;
      if (!expected || expected.length < 32) throw new HttpError(503, 'Vapi-Webhook noch nicht eingerichtet.');
      const received = request.headers.get('x-storm-webhook-secret') ?? '';
      const a = Buffer.from(expected), b = Buffer.from(received);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Webhook nicht autorisiert.');
    } else {
      const key = process.env.RETELL_API_KEY;
      if (!key) throw new HttpError(503, 'Retell-Webhook noch nicht eingerichtet.');
      const signature = request.headers.get('x-retell-signature') ?? '';
      if (!signature || !(await Retell.verify(raw, key, signature))) throw new HttpError(401, 'Ungültige Webhook-Signatur.');
    }
    return Response.json(await dispatchSmart(provider, parseJSON(raw), mode === 'demo' ? 'demo' : 'live'));
  } catch (error) { return failure(error); }
}
