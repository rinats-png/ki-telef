export function microsoftCredentials() {
  return { tenant: process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID, client: process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET };
}
export function microsoftReady() { const c = microsoftCredentials(); return !!(c.tenant && c.client && c.secret); }
export function useGraphMock(mode: 'demo' | 'live') {
  if (mode === 'demo') return true;
  const setting = (process.env.MOCK_MODE ?? process.env.MICROSOFT_GRAPH_MOCK_MODE ?? 'auto').toLowerCase();
  if (setting === 'true') return true;
  if (setting === 'false') return false; // Explicit live mode fails closed on incomplete credentials.
  return !microsoftReady();
}
export function integrationStatus() {
  const provider = process.env.VOICE_PROVIDER === 'vapi' ? 'vapi' : 'retell';
  const twilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
  const voice = provider === 'retell' ? !!(process.env.RETELL_API_KEY && process.env.RETELL_AGENT_ID) : !!process.env.VAPI_SIP_URI;
  return { graph: useGraphMock('live') ? 'MOCK' : microsoftReady() ? 'LIVE_CONFIGURED' : 'INCOMPLETE', microsoftConfigured: microsoftReady(), voiceProvider: provider, twilioConfigured: twilio, voiceConfigured: voice, transferConfigured: twilio && voice, webTestConfigured: { retell: !!(process.env.RETELL_API_KEY && process.env.RETELL_AGENT_ID), vapi: false }, recordingEnabled: process.env.STORE_CALL_RECORDINGS === 'true' };
}
