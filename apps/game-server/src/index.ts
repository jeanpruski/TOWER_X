import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app';

const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || !process.env.PUBLIC_ORIGIN?.startsWith('https://'))) {
  throw new Error('Production requires DATABASE_URL, SESSION_SECRET (32+ characters), and PUBLIC_ORIGIN (https://).');
}
const dataDir = resolve(import.meta.dirname, '../../../.data');
let secret = process.env.SESSION_SECRET;
if (!secret) {
  await mkdir(dataDir, { recursive: true });
  try { secret = await readFile(resolve(dataDir, 'session.key'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    secret = randomBytes(48).toString('base64url'); await writeFile(resolve(dataDir, 'session.key'), secret, { mode: 0o600 });
  }
}
const server = await createApp({ dataFile: resolve(dataDir, 'world.json'), secret, production, databaseUrl: process.env.DATABASE_URL, origin: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173', devTools: process.env.DEV_TOOLS === '1', bots: Number(process.env.BOT_COUNT ?? 1) });
const port = Number(process.env.PORT ?? 3001);
server.http.listen(port, process.env.HOST ?? '127.0.0.1', () => server.log.info({ port, storage: process.env.DATABASE_URL ? 'postgresql' : 'file', worldSeed: server.store.state.world.seed }, 'TOWER X world is running'));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (closing) return; closing = true;
  void server.close().then(() => process.exit(0), error => { server.log.error(error); process.exit(1); });
});
