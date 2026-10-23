import nextEnv from '@next/env';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { db } from '../lib/db';
import { normalizePhone } from '../lib/smart/validation';
nextEnv.loadEnvConfig(process.cwd());
const filename = process.argv[2];
if (!filename) throw new Error('Aufruf: npm run employees:import -- /pfad/mitarbeiter.json');
const schema = z.array(z.object({ name: z.string().min(2).max(120), role: z.enum(['B2B_SPECIALIST', 'EMERGENCY_TECH', 'BACKOFFICE', 'PEST_EXPERT']), upn: z.email(), directPhone: z.string().min(6).max(35), postalCodes: z.array(z.string().regex(/^\d{5}$/)).default([]), pestTypes: z.array(z.enum(['WASPS', 'RODENTS', 'BEDBUGS', 'COCKROACHES', 'WOOD_PROTECTION', 'PIGEONS', 'BEES', 'HORNETS', 'UNKNOWN'])).default([]), availability: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE']).default('OFFLINE') })).min(1).max(100);
try {
  const employees = schema.parse(JSON.parse(readFileSync(filename, 'utf8')));
  for (const employee of employees) {
    if (/(\.invalid|\.example|@example\.com)$/i.test(employee.upn)) throw new Error('Bitte echte Mitarbeiter-Postfächer statt Beispieldaten eintragen.');
    normalizePhone(employee.directPhone);
  }
  await db.$transaction(async tx => {
    for (const employee of employees) {
      const found = await tx.employee.findFirst({ where: { mode: 'live', upn: employee.upn.toLowerCase() } });
      const data = { ...employee, mode: 'live', upn: employee.upn.toLowerCase(), directPhone: normalizePhone(employee.directPhone) };
      if (found) await tx.employee.update({ where: { id: found.id }, data }); else await tx.employee.create({ data });
    }
  });
  console.log(`${employees.length} Live-Mitarbeiter gespeichert. Es wurden keine Anrufe oder Microsoft-Aktionen gestartet.`);
} finally { await db.$disconnect(); }
