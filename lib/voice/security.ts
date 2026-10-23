import { timingSafeEqual } from 'node:crypto';
import Retell from 'retell-sdk';
import { HttpError } from '../http';
import type { Provider } from '../validation';
export async function authenticateProvider(request: Request, raw: string, provider: Provider) {
  if (provider === 'retell') {
    const key = process.env.RETELL_API_KEY;
    if (!key) throw new HttpError(503, 'Retell ist noch nicht eingerichtet.');
    const signature = request.headers.get('x-retell-signature');
    if (!signature || !await Retell.verify(raw, key, signature)) throw new HttpError(401, 'Ungültige Retell-Signatur.');
  } else {
    const secret = process.env.VAPI_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) throw new HttpError(503, 'Vapi-Webhook noch nicht eingerichtet.');
    const expected = Buffer.from(secret), supplied = Buffer.from(request.headers.get('x-storm-webhook-secret') || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new HttpError(401, 'Webhook nicht autorisiert.');
  }
}
