import { mkdirSync, closeSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:')) throw new Error('DATABASE_URL muss auf eine lokale SQLite-Datei zeigen.');
// Prisma 6 can fail without a useful error when the SQLite file does not yet exist.
// Open in append mode: creates an empty database without truncating existing data.
const path = resolve('prisma', url.slice(5).split('?')[0]);
mkdirSync(dirname(path), { recursive: true }); closeSync(openSync(path, 'a', 0o600));
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
