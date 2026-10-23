import nextEnv from '@next/env';
import { reconcileTransfers } from '../lib/telephony/service';
import { db } from '../lib/db';
nextEnv.loadEnvConfig(process.cwd());
reconcileTransfers().then(result => console.log(JSON.stringify(result))).catch(() => { console.error('Transfer-Abgleich fehlgeschlagen.'); process.exitCode = 1; }).finally(() => db.$disconnect());
