import { z } from 'zod';
export const providerSchema = z.enum(['vapi', 'retell']);
export type Provider = z.infer<typeof providerSchema>;
export const postalSchema = z.string().regex(/^\d{5}$/, 'Bitte fünfstellige PLZ angeben.');
export const phoneSchema = z.string().trim().min(6).max(35).regex(/^\+?[\d ()/.-]+$/);
export const leadSchema = z.object({
  name: z.string().trim().min(2).max(120), phone: phoneSchema,
  street: z.string().trim().min(2).max(200), postal_code: postalSchema,
  city: z.string().trim().min(2).max(120),
  customer_type: z.enum(['PRIVATE', 'BUSINESS_HACCP', 'PROPERTY_MANAGEMENT']),
  company: z.string().trim().max(160).default(''),
  pest_type: z.enum(['WASPS', 'RODENTS', 'BEDBUGS', 'COCKROACHES', 'PIGEONS', 'BEES', 'HORNETS', 'UNKNOWN']),
  urgency: z.enum(['EMERGENCY', 'ACUTE', 'STANDARD']),
  summary: z.string().trim().min(10).max(4000),
  duration: z.string().max(200).default(''), location: z.string().max(200).default(''),
  children_or_pets: z.string().max(300).default(''),
});
export const toolSchemas = {
  check_service_area: z.object({ postal_code: postalSchema }),
  create_lead_ticket: leadSchema,
  trigger_emergency_escalation: z.object({ reason: z.string().trim().min(5).max(1000), phone: phoneSchema }),
};
export type ToolName = keyof typeof toolSchemas;
export type LeadInput = z.infer<typeof leadSchema>;
export const toolNameSchema = z.enum(['check_service_area', 'create_lead_ticket', 'trigger_emergency_escalation']);
