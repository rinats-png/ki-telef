import { failure } from '@/lib/http';
import { dialStatus, inbound } from '@/lib/telephony/service';
import { twilioForm, xml } from '@/lib/telephony/twilio';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { const fields = await twilioForm(request); const url = new URL(request.url); return xml(url.searchParams.get('stage') === 'dial-status' ? await dialStatus(fields, url.searchParams.get('call')) : await inbound(fields, url.searchParams.get('resume'))); }
  catch (error) { return failure(error); }
}
