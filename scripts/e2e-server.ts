// Isolated local QA fixture. Never runs against the normal development database.
import { execFileSync, spawn } from 'node:child_process';
import { rmSync, closeSync, openSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';
const file = `/tmp/storm-e2e-${process.pid}.db`;
closeSync(openSync(file, 'a', 0o600));
process.env.DATABASE_URL = `file:${file}`;
process.env.APP_URL = 'http://localhost:3100';
process.env.NEXT_DIST_DIR = '.next-e2e';
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'inherit' });
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], { env: process.env, stdio: 'inherit' });
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed-smart.ts'], { env: process.env, stdio: 'inherit' });
const db = new PrismaClient();
await db.admin.create({ data: { username: 'test-disponent', passwordHash: hashPassword('local-qa-only-passphrase') } });
await db.$disconnect();
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100'], { env: process.env, stdio: 'inherit' });
function cleanup() { server.kill('SIGTERM'); rmSync(file, { force: true }); }
process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup);
server.on('exit', code => { rmSync(file, { force: true }); process.exit(code ?? 0); });
