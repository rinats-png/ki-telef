import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { failure, HttpError, originGuard, parseJSON, readBody } from '@/lib/http';
import { simulateSmart } from '@/lib/smart/simulate';
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    originGuard(request); await requireAdmin();
    const body = z.object({ scenario: z.enum(['wasps', 'restaurant', 'existing']), provider: z.enum(['vapi', 'retell']).default('retell') }).parse(parseJSON(await readBody(request)));
    if (new URL(request.url).searchParams.get('stream') !== '1') return Response.json(await simulateSmart(body.scenario, body.provider));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async start(controller) {
      let connected = true;
      const send = (value: unknown) => { if (connected) try { controller.enqueue(encoder.encode(JSON.stringify(value) + '\n')); } catch { connected = false; } };
      try { const result = await simulateSmart(body.scenario, body.provider, undefined, progress => { send({ type: 'progress', ...progress }); }); send({ type: 'result', result }); }
      catch (error) { send({ type: 'error', error: error instanceof HttpError ? error.message : 'Workflow konnte nicht vollständig abgeschlossen werden. Bitte den Monitor prüfen.' }); }
      finally { try { controller.close(); } catch { /* Client disconnected; committed workflow remains visible. */ } }
    } });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  } catch (error) { return failure(error); }
}
