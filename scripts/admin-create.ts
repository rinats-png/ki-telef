import { PrismaClient } from '@prisma/client';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { hashPassword } from '../lib/password';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  if (!process.stdin.isTTY) throw new Error('Bitte interaktiv in einem Terminal ausführen.');
  const existing = await db.admin.count();
  if (existing) throw new Error('Ein Admin-Konto existiert bereits. Kein automatisches Überschreiben.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const username = await new Promise<string>(resolve => rl.question('Benutzername: ', resolve)); rl.close();
  if (!/^[\w.-]{3,100}$/.test(username.trim())) throw new Error('Benutzername: 3–100 Buchstaben, Zahlen, Punkt oder Bindestrich.');
  async function hidden(prompt: string) {
    process.stdout.write(prompt); emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
    return new Promise<string>((resolve, reject) => {
      let value = '';
      function onKey(str: string, key: { name?: string; ctrl?: boolean }) {
        if (key.ctrl && key.name === 'c') { cleanup(); reject(new Error('Abgebrochen.')); }
        else if (key.name === 'return') { cleanup(); resolve(value); }
        else if (key.name === 'backspace') value = value.slice(0, -1);
        else if (str && !key.ctrl && !['escape', 'tab', 'up', 'down', 'left', 'right'].includes(key.name ?? '')) value += str;
      }
      function cleanup() { process.stdin.off('keypress', onKey); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
      process.stdin.on('keypress', onKey);
    });
  }
  const password = await hidden('Passwort (mind. 12 Zeichen, Eingabe unsichtbar): ');
  if (password.length < 12 || password.length > 256) throw new Error('Passwort muss 12–256 Zeichen enthalten.');
  const repeat = await hidden('Passwort wiederholen: ');
  if (password !== repeat) throw new Error('Passwörter stimmen nicht überein.');
  await db.admin.create({ data: { username: username.trim(), passwordHash: hashPassword(password) } });
  console.log('Admin-Konto angelegt. Jetzt unter http://localhost:3000/login anmelden.');
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Einrichtung fehlgeschlagen.'); process.exitCode = 1; }).finally(() => db.$disconnect());
