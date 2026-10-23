import { failure } from '@/lib/http';
import { transferCallback } from '@/lib/telephony/service';
import { twilioForm, xml } from '@/lib/telephony/twilio';
import { POST as voiceWebhook } from '../webhook/route';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('content-type')?.includes('application/json')) return voiceWebhook(request);
  try { const fields = await twilioForm(request); const url = new URL(request.url); return xml(await transferCallback(url.searchParams.get('stage') || '', url.searchParams.get('job'), fields)); }
  catch (error) { return failure(error); }
}
