import { writeFileSync } from 'node:fs';
import { db } from '../lib/db';
import { dashboardData } from '../lib/dashboard';
import { generateAgentConfig, STORM_AGENT_PROMPT } from '../config/storm-agent-prompt';
const data = await dashboardData('demo');
writeFileSync('/workspace/sites/storm-klickdemo/fixtures.json', JSON.stringify({ data, agents: { vapi: { prompt: STORM_AGENT_PROMPT, config: generateAgentConfig('vapi', 'https://IHRE-DOMAIN.example') }, retell: { prompt: STORM_AGENT_PROMPT, config: generateAgentConfig('retell', 'https://IHRE-DOMAIN.example') } } }));
await db.$disconnect();
