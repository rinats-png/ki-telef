import type { LeadInput, Provider } from './validation';
export type Scenario = 'restaurant' | 'family';
export const demoCases: Record<Scenario, { label: string; lead: LeadInput; transcript: string }> = {
  restaurant: {
    label: 'Ratten im Restaurant',
    lead: { name: 'Markus Weber', phone: '+49 000 000001', street: 'Beispielgasse 12', postal_code: '60311', city: 'Frankfurt am Main', customer_type: 'BUSINESS_HACCP', company: 'Restaurant Mainblick · Demo', pest_type: 'RODENTS', urgency: 'EMERGENCY', summary: 'Restaurant meldet frische Nagerspuren und zwei Ratten im Lebensmittellager. Laufender Betrieb, Hygiene-Risiko. Dringender Rückruf durch Fachtechniker erforderlich.', duration: 'Seit heute Morgen', location: 'Lebensmittellager im Erdgeschoss', children_or_pets: 'Keine; laufender Gastronomiebetrieb' },
    transcript: 'KI: Guten Tag bei Storm. Ich bin der KI-Telefonassistent. Wie kann ich Ihnen helfen?\nAnrufer: Weber vom Restaurant Mainblick. Wir haben zwei Ratten im Lager gesehen. Heute ist das Restaurant voll!\nKI: Ich verstehe Ihre Sorge. Wir nehmen das diskret und mit hoher Priorität auf. Wo genau wurden die Tiere gesehen?\nAnrufer: Im Lebensmittellager, heute Morgen zum ersten Mal.\nKI: Danke. Wie lautet Ihre Rückrufnummer und die Adresse?\nAnrufer: Die Demo-Nummer +49 000 000001. Beispielgasse 12, 60311 Frankfurt.\nKI: Ich fasse zusammen: Markus Weber, Restaurant Mainblick, Nagerspuren und zwei Ratten im Lebensmittellager. Ihre Daten und die Rückrufnummer stimmen so?\nAnrufer: Ja.\nKI: Ihr Anliegen ist erfasst und intern als Notfall gekennzeichnet. Unser Fachteam meldet sich schnellstmöglich. Gebiet und Einsatztermin klären wir im Rückruf.',
  },
  family: {
    label: 'Wespennest bei Familie',
    lead: { name: 'Julia Schneider', phone: '+49 000 000002', street: 'Musterweg 7', postal_code: '61184', city: 'Karben', customer_type: 'PRIVATE', company: '', pest_type: 'WASPS', urgency: 'ACUTE', summary: 'Wespennest am Rollladenkasten des Kinderzimmers. Zwei Kinder und ein Hund im Haushalt. Keine Stiche oder unmittelbare medizinische Notlage. Fachliche Prüfung und zeitnaher Rückruf gewünscht.', duration: 'Seit drei Tagen', location: 'Rollladenkasten im Obergeschoss', children_or_pets: 'Zwei Kinder, ein Hund' },
    transcript: 'KI: Guten Tag bei Storm. Ich bin der KI-Telefonassistent. Wie kann ich Ihnen helfen?\nAnruferin: Wir haben ein Wespennest direkt am Kinderzimmer. Ich mache mir Sorgen.\nKI: Das verstehe ich. Halten Sie bitte Abstand und stören Sie das Nest nicht. Seit wann beobachten Sie das?\nAnruferin: Seit drei Tagen. Wir haben zwei Kinder und einen Hund.\nKI: Wurde jemand gestochen oder besteht eine unmittelbare Gefahr?\nAnruferin: Nein.\nKI: Wie sind Ihr Name, die Rückrufnummer und die Adresse?\nAnruferin: Julia Schneider. Demo-Nummer +49 000 000002, Musterweg 7, 61184 Karben.\nKI: Ich habe ein vermutetes Wespennest am Rollladenkasten, zwei Kinder und einen Hund notiert. Stimmen die Daten?\nAnruferin: Ja, genau.\nKI: Vielen Dank, Ihr Anliegen ist erfasst. Unser Fachteam meldet sich schnellstmöglich und prüft Gebiet, Tierart und den nächsten Schritt mit Ihnen.',
  },
};
export function toolPayload(provider: Provider, callId: string, name: string, args: unknown) {
  return provider === 'vapi' ? { message: { type: 'tool-calls', call: { id: callId }, toolCallList: [{ id: `${callId}-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } } : { name, args, call: { call_id: callId } };
}
export function reportPayload(provider: Provider, callId: string, transcript: string) {
  return provider === 'vapi' ? { message: { type: 'end-of-call-report', call: { id: callId }, artifact: { transcript } } } : { event: 'call_analyzed', call: { call_id: callId, transcript } };
}
