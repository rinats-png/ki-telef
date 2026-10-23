import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { generateAgentConfig } from '../config/storm-agent-prompt';
import { providerSchema } from '../lib/validation';
loadEnvConfig(process.cwd());
const provider = providerSchema.parse(process.argv[2] ?? 'vapi');
console.log(JSON.stringify(generateAgentConfig(provider, process.env.APP_URL || 'http://localhost:3000'), null, 2));
