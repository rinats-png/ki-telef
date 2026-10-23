import { writeFileSync } from 'node:fs';
import { db } from '../lib/db';
import { smartData } from '../lib/smart/data';
import { generateSmartConfig, STORM_VOICE_PROMPT } from '../config/storm-voice-prompt';
const data = await smartData('demo');
writeFileSync('/workspace/sites/storm-klickdemo/src/smart-fixtures.json', JSON.stringify({ data, agents: { vapi: { prompt: STORM_VOICE_PROMPT, config: generateSmartConfig('vapi', 'https://IHRE-DOMAIN.example') }, retell: { prompt: STORM_VOICE_PROMPT, config: generateSmartConfig('retell', 'https://IHRE-DOMAIN.example') } } }));
await db.$disconnect();
