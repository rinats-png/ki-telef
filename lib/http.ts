export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function originGuard(request: Request) {
  const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (request.headers.get('origin') !== expected) throw new HttpError(403, 'Ungültiger Anfrageursprung.');
}
export async function readBody(request: Request): Promise<string> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'JSON erforderlich.');
  const max = 256 * 1024;
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'Anfrage zu groß.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Leere Anfrage.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HttpError(413, 'Anfrage zu groß.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function parseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Ungültiges JSON.'); }
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError')
    return Response.json({ error: 'Bitte Eingabedaten prüfen.' }, { status: 400 });
  console.error(JSON.stringify({ event: 'request_failed', type: error instanceof Error ? error.name : 'Unknown' }));
  return Response.json({ error: 'Die Anfrage konnte nicht verarbeitet werden. Bitte erneut versuchen.' }, { status: 500 });
}
