import { z } from 'zod';
import { HttpError } from '../http';
export function normalizePhone(input: string) {
  let value = input.trim().replace(/\(0\)/g, '').replace(/[\s()/.-]/g, '');
  if (value.startsWith('00')) value = '+' + value.slice(2);
  else if (value.startsWith('0')) value = '+49' + value.slice(1);
  if (!/^\+[1-9]\d{6,14}$/.test(value)) throw new HttpError(400, 'Telefonnummer mit Landesvorwahl erforderlich.');
  return value;
}
export const customerType = z.enum(['PRIVATE', 'BUSINESS_HACCP', 'PROPERTY_MANAGEMENT']);
export const urgency = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const issueType = z.enum(['NEW_INQUIRY', 'NEW_INFESTATION', 'FOLLOW_UP', 'RESCHEDULE', 'INVOICE', 'DOCUMENTATION', 'MAINTENANCE']);
export const pestType = z.enum(['WASPS', 'RODENTS', 'BEDBUGS', 'COCKROACHES', 'WOOD_PROTECTION', 'PIGEONS', 'BEES', 'HORNETS', 'UNKNOWN']);
export const routingInput = z.object({ customer_type: customerType, pest_type: pestType, urgency, issue_type: issueType, postal_code: z.string().regex(/^\d{5}$/) });
export const contactInput = z.object({ name: z.string().trim().min(2).max(120), company: z.string().max(160).default(''), phone: z.string().min(6).max(40), email: z.email().max(254), street: z.string().trim().min(2).max(200), postal_code: z.string().regex(/^\d{5}$/), city: z.string().trim().min(2).max(100), existing_customer: z.boolean(), identity_confirmed: z.literal(true) });
export const finalizeInput = z.object({ contact: contactInput, slot_id: z.string().min(1).max(200), summary: z.string().min(10).max(4000), transcript: z.string().max(100000).default(''), appointment_type: z.enum(['CALLBACK', 'INSPECTION']).default('CALLBACK'), email_confirmed: z.literal(true) });
export const smartTools = { transfer_to_employee: z.object({ reason: z.string().min(5).max(1000), caller_confirmed: z.literal(true) }), lookup_customer_by_phone: z.object({ phone: z.string().min(6).max(40) }), determine_and_check_employee: routingInput, finalize_call_action: finalizeInput };
export type RoutingInput = z.infer<typeof routingInput>;
export type FinalizeInput = z.infer<typeof finalizeInput>;
export type Mode = 'demo' | 'live';
