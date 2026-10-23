import { requireAdmin } from '@/lib/auth';
import { failure } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { generateSmartConfig, STORM_VOICE_PROMPT } from '@/config/storm-voice-prompt';
export async function GET(request: Request) {
  try { await requireAdmin(); const provider = providerSchema.parse(new URL(request.url).searchParams.get('provider') ?? 'vapi'); return Response.json({ prompt: STORM_VOICE_PROMPT, config: generateSmartConfig(provider, process.env.APP_URL || 'http://localhost:3000') }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
