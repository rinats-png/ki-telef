import type { ProgressReporter } from './progress';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Provider } from '../validation';
import { dispatchSmart } from './webhook';
import { smartScenarios, smartToolPayload, type SmartScenario } from './demo';
export async function simulateSmart(scenario: SmartScenario, provider: Provider, externalId = `smart-demo-${randomUUID()}`, report?: ProgressReporter): Promise<Record<string, unknown>> {
  const sample = smartScenarios[scenario];
  async function invoke(name: string, args: unknown): Promise<Record<string, unknown>> {
    const response = await dispatchSmart(provider, smartToolPayload(provider, externalId, name, args), 'demo', report);
    if (provider === 'vapi') {
      const envelope = z.object({ results: z.array(z.object({ result: z.string() })).min(1) }).parse(response);
      return z.record(z.string(), z.unknown()).parse(JSON.parse(envelope.results[0].result));
    }
    return z.record(z.string(), z.unknown()).parse(response);
  }
  await report?.({ step: 'LOOKUP', state: 'running', message: 'Anrufer wird identifiziert …' });
  const lookup = await invoke('lookup_customer_by_phone', { phone: sample.contact.phone });
  await report?.({ step: 'LOOKUP', state: 'done', message: lookup.existing_customer ? 'Bestandskunde erkannt.' : 'Neukundenanfrage erkannt.' });
  await report?.({ step: 'ROUTING', state: 'running', message: 'Zuständigkeit und freie Slots werden geprüft …' });
  const routing = await invoke('determine_and_check_employee', sample.routing);
  await report?.({ step: 'ROUTING', state: 'done', message: String(routing.reason || 'Manuelle Disposition erforderlich.') });
  const slots = routing.slots as { id: string }[];
  if (!slots?.length) return { status: 'manual_review', lookup, routing, externalId };
  const final = await invoke('finalize_call_action', { contact: sample.contact, slot_id: slots[0].id, summary: sample.summary, transcript: sample.transcript, appointment_type: 'CALLBACK', email_confirmed: true });
  return { ...final, lookup, routing, externalId };
}
