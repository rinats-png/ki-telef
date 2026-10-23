import { failure, parseJSON, readBody } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { authenticateProvider } from '@/lib/voice/security';
import { storeProviderCallEvent, storeTwilioStatus } from '@/lib/voice/call-events';
import { twilioForm } from '@/lib/telephony/twilio';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) return Response.json(await storeTwilioStatus(await twilioForm(request)));
    const provider = providerSchema.parse(new URL(request.url).searchParams.get('provider'));
    const raw = await readBody(request); await authenticateProvider(request, raw, provider);
    return Response.json(await storeProviderCallEvent(provider, parseJSON(raw)));
  } catch (error) { return failure(error); }
}
