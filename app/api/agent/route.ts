import { requireAdmin } from '@/lib/auth';
import { failure } from '@/lib/http';
import { providerSchema } from '@/lib/validation';
import { generateAgentConfig, STORM_AGENT_PROMPT } from '@/config/storm-agent-prompt';
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const provider = providerSchema.parse(new URL(request.url).searchParams.get('provider') ?? 'vapi');
    return Response.json({ prompt: STORM_AGENT_PROMPT, config: generateAgentConfig(provider, process.env.APP_URL || 'http://localhost:3000') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
