import { strict as assert } from 'node:assert';
import { PostgresRepository } from '@tower/db';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../apps/game-server/src/app';
import { WORLD_VERSION } from '@tower/shared';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point to an isolated test database.');
const repository = new PostgresRepository(); const state = await repository.read();
const id = randomUUID(), userId = randomUUID(), tokenHash = randomUUID();
state.users.push({ id: userId, email: `${userId}@example.test`, passwordHash: 'test-fixture-not-a-real-password', createdAt: new Date().toISOString() });
state.profiles.push({ id, userId, guestIdentity: null, displayName: 'PG validation', color: '#c6ed80', mask: 'fire-spirit', hat: 'tricorn', shoes: 'comet-boots', shoeColor: '#55a3e6', hatColor: '#d676ca', unlockedCosmetics: ['mask:verdant', 'mask:fire-spirit', 'shoes:comet-boots'], openedRelicBands: [0, 1, 20], personalBest: 123, lastCamp: 5, createdAt: new Date().toISOString(), settings: { sound: 12 }, camps: [0, 5] });
state.sessions.push({ tokenHash, profileId: id, expiresAt: new Date(Date.now() + 60000).toISOString() });
await repository.write(state); await repository.close();
const reopened = new PostgresRepository(); const restored = await reopened.read();
assert.equal(restored.world.seed, state.world.seed); assert.equal(restored.profiles.find(p => p.id === id)?.personalBest, 123);
assert.deepEqual(restored.profiles.find(p => p.id === id)?.camps, [0, 5]);
assert.equal(restored.profiles.find(p => p.id === id)?.mask, 'fire-spirit');
assert.equal(restored.profiles.find(p => p.id === id)?.hat, 'tricorn');
assert.equal(restored.profiles.find(p => p.id === id)?.shoes, 'comet-boots');
assert.equal(restored.profiles.find(p => p.id === id)?.shoeColor, '#55a3e6');
assert.equal(restored.profiles.find(p => p.id === id)?.hatColor, '#d676ca');
assert.deepEqual(restored.profiles.find(p => p.id === id)?.openedRelicBands, [0, 1, 20]);
assert.deepEqual(restored.profiles.find(p => p.id === id)?.unlockedCosmetics, ['mask:verdant', 'mask:fire-spirit', 'shoes:comet-boots']);
assert.equal(restored.sessions.find(s => s.tokenHash === tokenHash)?.profileId, id);
restored.sessions = restored.sessions.filter(s => s.tokenHash !== tokenHash);
restored.world.version = 1; // Exercise an existing v1 world upgraded by Store.open below.
await reopened.write(restored);
assert.equal((await reopened.read()).sessions.some(s => s.tokenHash === tokenHash), false);
await reopened.close(); console.log('PostgreSQL: world, account, profile, settings, camps, session and revocation persisted successfully.');

const production = await createApp({ dataFile: '/unused-in-postgres-mode', databaseUrl: process.env.DATABASE_URL, secret: 'isolated-production-validation-secret-32-characters', origin: 'https://tower.example.test', production: true, silent: true });
try {
  assert.equal(production.store.state.world.version, WORLD_VERSION);
  assert.equal(production.store.profile(id)?.mask, 'fire-spirit');
  assert.equal(production.store.profile(id)?.shoes, 'comet-boots');
  assert.equal(production.store.profile(id)?.shoeColor, '#55a3e6');
  assert.equal(production.store.profile(id)?.hatColor, '#d676ca');
  assert.deepEqual(production.store.profile(id)?.openedRelicBands, [0, 1, 20]);
  assert.deepEqual(production.store.profile(id)?.unlockedCosmetics, ['mask:verdant', 'mask:fire-spirit', 'shoes:comet-boots']);
  const upgraded = new PostgresRepository();
  try {
    const state = await upgraded.read(); assert.equal(state.world.version, WORLD_VERSION);
    assert.equal(state.profiles.find(p => p.id === id)?.personalBest, 123); assert.equal(state.profiles.find(p => p.id === id)?.lastCamp, 5);
  } finally { await upgraded.close(); }
  console.log('PostgreSQL: world version upgraded, records and camp positions preserved.');
  await new Promise<void>(resolve => production.http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(production.http.address() as AddressInfo).port}`;
  const landing = await fetch(base); assert.equal(landing.status, 200);
  assert.match(landing.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  const html = await landing.text(); assert.match(html, /TOWER X/);
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]; assert.ok(asset, 'Production bundle must be built before this test');
  assert.equal((await fetch(`${base}${asset}`)).status, 200);
  const guest = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://tower.example.test' }, body: '{}' });
  assert.equal(guest.status, 200); assert.match(guest.headers.get('set-cookie') ?? '', /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await (await fetch(`${base}/health`)).json()).storage, 'postgresql');
  console.log('Production HTTP: compiled assets, CSP, secure cookie and PostgreSQL health verified.');
} finally { await production.close(); }
