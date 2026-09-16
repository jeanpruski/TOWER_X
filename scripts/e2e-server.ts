import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../apps/game-server/src/app';
const directory = await mkdtemp(join(tmpdir(), 'tower-browser-'));
const world = await createApp({ dataFile: join(directory, 'world.json'), secret: 'browser-test-isolated-secret-32-characters', origin: 'http://localhost:5181', silent: true, devTools: true, bots: 0 });
world.store.state.world.seed = 42;
await new Promise<void>(resolve => world.http.listen(3101, '127.0.0.1', resolve));
const web = await createServer({ configFile: false, root: resolve(import.meta.dirname, '../apps/web'), plugins: [react()], server: {
  host: '127.0.0.1', port: 5181, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3101', '/socket.io': { target: 'http://127.0.0.1:3101', ws: true } },
} });
await web.listen();
// Separate populated world for companion/bonus scenarios; legacy tests keep their own empty world.
const populated = await createApp({ dataFile: join(directory, 'companions.json'), secret: 'populated-browser-test-secret-32-characters', origin: 'http://localhost:5182', silent: true, devTools: true, bots: 3 });
populated.store.state.world.seed = 42;
await new Promise<void>(resolve => populated.http.listen(3102, '127.0.0.1', resolve));
const populatedWeb = await createServer({ configFile: false, root: resolve(import.meta.dirname, '../apps/web'), plugins: [react()], server: {
  host: '127.0.0.1', port: 5182, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3102', '/socket.io': { target: 'http://127.0.0.1:3102', ws: true } },
} });
await populatedWeb.listen();
// A single companion makes the human shoulder jump observable without a second bot opening the bridge first.
const cooperative = await createApp({ dataFile: join(directory, 'cooperative.json'), secret: 'cooperative-browser-test-secret-32-characters', origin: 'http://localhost:5184', silent: true, devTools: true, bots: 1 });
cooperative.store.state.world.seed = 42;
await new Promise<void>(resolve => cooperative.http.listen(3104, '127.0.0.1', resolve));
const cooperativeWeb = await createServer({ configFile: false, root: resolve(import.meta.dirname, '../apps/web'), plugins: [react()], server: {
  host: '127.0.0.1', port: 5184, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3104', '/socket.io': { target: 'http://127.0.0.1:3104', ws: true } },
} });
await cooperativeWeb.listen();
// Independent authentication budget and no bots for timed-platform observations.
const mechanisms = await createApp({ dataFile: join(directory, 'mechanisms.json'), secret: 'mechanisms-browser-test-secret-32-characters', origin: 'http://localhost:5185', silent: true, devTools: true, bots: 0 });
mechanisms.store.state.world.seed = 42;
await new Promise<void>(resolve => mechanisms.http.listen(3105, '127.0.0.1', resolve));
const mechanismsWeb = await createServer({ configFile: false, root: resolve(import.meta.dirname, '../apps/web'), plugins: [react()], server: {
  host: '127.0.0.1', port: 5185, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3105', '/socket.io': { target: 'http://127.0.0.1:3105', ws: true } },
} });
await mechanismsWeb.listen();
// Delayed transport tests have their own authentication budget and temporary world.
const network = await createApp({ dataFile: join(directory, 'network.json'), secret: 'network-browser-test-secret-32-characters', origin: 'http://localhost:5186', silent: true, devTools: true, bots: 0 });
network.store.state.world.seed = 42;
await new Promise<void>(resolve => network.http.listen(3106, '127.0.0.1', resolve));
const networkWeb = await createServer({ configFile: false, root: resolve(import.meta.dirname, '../apps/web'), plugins: [react()], server: {
  host: '127.0.0.1', port: 5186, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3106', '/socket.io': { target: 'http://127.0.0.1:3106', ws: true } },
} });
await networkWeb.listen();
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (closing) return; closing = true;
  void (async () => { await web.close(); await populatedWeb.close(); await cooperativeWeb.close(); await mechanismsWeb.close(); await networkWeb.close(); await world.close(); await populated.close(); await cooperative.close(); await mechanisms.close(); await network.close(); await rm(directory, { recursive: true, force: true }); process.exit(0); })();
});
