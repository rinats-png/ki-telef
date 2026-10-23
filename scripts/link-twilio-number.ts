import nextEnv from '@next/env';
import { publicUrl, twilioClient } from '../lib/telephony/twilio';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.TWILIO_PHONE_NUMBER) throw new Error('TWILIO_PHONE_NUMBER fehlt.');
const client = twilioClient();
const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: process.env.TWILIO_PHONE_NUMBER, limit: 2 });
if (numbers.length !== 1) throw new Error('Die konfigurierte Rufnummer wurde im Twilio-Konto nicht eindeutig gefunden.');
await client.incomingPhoneNumbers(numbers[0].sid).update({ voiceUrl: publicUrl('/api/voice/telephony-incoming'), voiceMethod: 'POST', statusCallback: publicUrl('/api/voice/call-ended'), statusCallbackMethod: 'POST' });
console.log('Twilio-Voice-URL und Status-Callback wurden auf die konfigurierte APP_URL gesetzt.');
