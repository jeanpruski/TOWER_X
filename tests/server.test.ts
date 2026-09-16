import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { generateChunk, touchesHazard } from '@tower/game-core';
import { createApp } from '../apps/game-server/src/app';
import { RateLimiter } from '../apps/game-server/src/auth';
import { Store } from '../apps/game-server/src/store';
import { BOT_COLOR, RELIC_INTERVAL_CHUNKS, joinSchema, type EntryChoice, neutralInput, type Chunk, type Welcome, type Snapshot, type PublicProfile, type GameEffect } from '@tower/shared';

let server: Awaited<ReturnType<typeof createApp>>, directory: string, base: string;
const sockets: Socket[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function request(path: string, data?: unknown, cookie?: string, origin?: string, method = 'POST') {
  return fetch(`${base}/api${path}`, { method: data === undefined ? 'GET' : method, headers: { ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
}
async function guest() {
  const response = await request('/auth/guest', {}); expect(response.ok).toBe(true);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, data: await response.json() as { profile: PublicProfile } };
}
async function connect(cookie: string, entry?: EntryChoice) {
  const socket = io(base, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true }); sockets.push(socket);
  const chunks = new Promise<{ chunks: Chunk[] }>(resolve => socket.once('chunks', resolve));
  const welcome = await new Promise<Welcome>((resolve, reject) => {
    socket.on('connect', () => socket.emit('join', { v: 1, ...(entry ? { entry } : {}) })); socket.once('welcome', resolve); socket.once('connect_error', reject);
  });
  return { socket, welcome, chunks: (await chunks).chunks };
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tower-test-'));
  server = await createApp({ dataFile: join(directory, 'world.json'), secret: 'test-secret-with-at-least-32-characters', origin: 'http://localhost:5173', silent: true, bots: 0 });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
});
afterEach(async () => { for (const socket of sockets.splice(0)) socket.disconnect(); await server.close(); await rm(directory, { recursive: true, force: true }); });

describe('authentication and persistence', () => {
  it('signs HTTP-only sessions, preserves guest identity and rejects forged cookies', async () => {
    const first = await guest(); const second = await request('/auth/guest', {}, first.cookie);
    expect((await second.json()).profile.id).toBe(first.data.profile.id);
    const forged = await request('/auth/me', undefined, `${first.cookie}broken`); expect((await forged.json()).profile).toBeNull();
    const raw = await request('/auth/guest', {}); expect(raw.headers.get('set-cookie')).toContain('HttpOnly'); expect(raw.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(JSON.stringify(first.data)).not.toContain('guestIdentity');
  });
  it('converts a guest account, hashes passwords and logs in with the same progression', async () => {
    const g = await guest(); const p = server.store.profile(g.data.profile.id)!; p.personalBest = 123; p.lastCamp = 5; p.camps.push(5);
    const registered = await request('/auth/register', { email: 'mage@example.test', password: 'a-strong-password-123', displayName: 'Mousse' }, g.cookie);
    expect(registered.status).toBe(201); const data = await registered.json(); expect(data.profile.personalBest).toBe(123); expect(data.profile.isGuest).toBe(false);
    expect(server.store.state.users[0]?.passwordHash).toMatch(/^\$argon2id\$/);
    const failed = await request('/auth/login', { email: 'mage@example.test', password: 'not-the-password' }); expect(failed.status).toBe(401);
    const logged = await request('/auth/login', { email: 'mage@example.test', password: 'a-strong-password-123' }); expect(logged.status).toBe(200);
    expect((await logged.json()).profile.id).toBe(p.id);
    const restored = await Store.open(join(directory, 'world.json'));
    expect(restored.profile(p.id)?.personalBest).toBe(123); expect(restored.state.world.seed).toBe(server.store.state.world.seed); await restored.close();
  });
  it('rejects duplicate registration races, invalid names and untrusted origins', async () => {
    const data = { email: 'race@example.test', password: 'a-strong-password-123', displayName: 'Mage' };
    const responses = await Promise.all([request('/auth/register', data), request('/auth/register', data)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const g = await guest(); expect((await request('/auth/profile', { displayName: '<script>alert(1)</script>', color: '#c6ed80' }, g.cookie, undefined, 'PATCH')).status).toBe(400);
    expect((await request('/auth/guest', {}, undefined, 'https://evil.example')).status).toBe(403);
  });
  it('persists settings and profile changes without trusting PB from the client', async () => {
    const g = await guest();
    const registered = await request('/auth/register', { email: 'settings@example.test', password: 'a-strong-password-123', displayName: 'Sauge' }, g.cookie);
    g.cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    expect((await request('/auth/profile', { displayName: 'Sauge', color: '#bc9bea' }, g.cookie, undefined, 'PATCH')).status).toBe(200);
    expect((await request('/auth/profile', { displayName: 'Sauge', color: '#bc9bea', personalBest: 10000 }, g.cookie, undefined, 'PATCH')).status).toBe(400);
    const settings = { sound: 30, music: 0, reducedMotion: true, crt: false, bindings: { left: 'KeyA', right: 'KeyD', jump: 'KeyJ', push: 'KeyE' } };
    expect((await request('/auth/settings', settings, g.cookie, undefined, 'PATCH')).status).toBe(200);
    const me = await request('/auth/me', undefined, g.cookie); expect((await me.json()).settings).toEqual(settings);
  });
  it('limits abusive requests and resets the time window', () => {
    const limit = new RateLimiter(2, 1000); expect(limit.allow('a', 0)).toBe(true); expect(limit.allow('a', 1)).toBe(true); expect(limit.allow('a', 2)).toBe(false); expect(limit.allow('a', 1001)).toBe(true);
  });
  it('restricts guest customization, saves account costumes, rejects locked and forged decorations', async () => {
    const g = await guest(), original = g.data.profile;
    const rename = { displayName: 'Invité Renommé', color: original.color, mask: original.mask, hat: original.hat };
    expect((await request('/auth/profile', rename, g.cookie, undefined, 'PATCH')).status).toBe(200);
    expect((await request('/auth/profile', { ...rename, mask: original.mask === 'raven' ? 'owl' : 'raven' }, g.cookie, undefined, 'PATCH')).status).toBe(403);
    const credentials = { email: 'costume@example.test', password: 'a-strong-password-123' };
    const chosen = { displayName: 'Costumier', color: '#ef665f', mask: 'raven', hat: 'tricorn', shoes: 'sneakers', shoeColor: '#55a3e6', hatColor: '#d676ca' };
    expect((await request('/auth/register', { ...credentials, ...chosen, hat: 'phoenix' }, g.cookie)).status).toBe(403);
    expect((await request('/auth/register', { ...credentials, ...chosen, unlockedCosmetics: ['hat:phoenix'] }, g.cookie)).status).toBe(400);
    const registered = await request('/auth/register', { ...credentials, ...chosen }, g.cookie);
    expect(registered.status).toBe(201); expect((await registered.json()).profile).toMatchObject({ ...chosen, id: original.id, isGuest: false });
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const connected = await connect(cookie);
    for (const patch of [{ mask: 'astral' }, { hat: 'ice-crown' }, { mask: 'storm' }, { hat: 'jellyfish' }]) expect((await request('/auth/profile', { ...chosen, ...patch }, cookie, undefined, 'PATCH')).status).toBe(403);
    for (const patch of [{ mask: 'invented' }, { color: BOT_COLOR }, { unlockedCosmetics: ['mask:astral'] }]) expect((await request('/auth/profile', { ...chosen, ...patch }, cookie, undefined, 'PATCH')).status).toBe(400);
    const changed = { ...chosen, mask: 'robot', hat: 'headphones', color: '#49b9d6', shoes: 'flippers', shoeColor: '#f4d457', hatColor: null };
    const update = new Promise<{ profile: PublicProfile }>(resolve => connected.socket.once('profileUpdate', resolve));
    expect((await request('/auth/profile', changed, cookie, undefined, 'PATCH')).status).toBe(200);
    expect((await update).profile).toMatchObject(changed);
    const snapshot = await new Promise<Snapshot>(resolve => connected.socket.once('snapshot', resolve));
    expect(snapshot.players.find(p => p.id === original.id)).toMatchObject(changed);
    expect(snapshot.standings.self).toMatchObject(changed);
    await request('/auth/logout', {}, cookie);
    expect((await (await request('/auth/login', credentials)).json()).profile).toMatchObject(changed);
    const restored = await Store.open(join(directory, 'world.json'));
    try { expect(restored.profile(original.id)).toMatchObject(changed); } finally { await restored.close(); }
  });
  it('keeps guest shoes and independent colors immutable until account creation', async () => {
    const g = await guest(), p = g.data.profile;
    const original = { displayName: p.displayName, color: p.color, shoes: p.shoes, shoeColor: p.shoeColor, hatColor: p.hatColor };
    expect((await request('/auth/profile', original, g.cookie, undefined, 'PATCH')).status).toBe(200);
    for (const patch of [{ shoes: p.shoes === 'classic' ? 'sneakers' : 'classic' }, { shoeColor: p.shoeColor === '#ef665f' ? '#55a3e6' : '#ef665f' }, { hatColor: '#d676ca' }]) expect((await request('/auth/profile', { ...original, ...patch }, g.cookie, undefined, 'PATCH')).status).toBe(403);
    expect((await (await request('/auth/me', undefined, g.cookie)).json()).profile).toMatchObject(original);
  });
  it('requires real unlocks for rare faces and shoes on signup and profile changes, then persists the equipped pieces', async () => {
    server.store.state.world.seed = 42;
    const g = await guest(), a = await connect(g.cookie), p = server.world.players.get(a.welcome.playerId)!;
    const credentials = { email: 'new-rares@example.test', password: 'a-strong-password-123', displayName: 'Comète' };
    for (const look of [{ mask: 'fire-spirit' }, { shoes: 'comet-boots' }]) {
      expect((await request('/auth/register', { ...credentials, ...look }, g.cookie)).status).toBe(403);
    }
    server.world.stop();
    const ids = ['mask:fire-spirit', 'shoes:comet-boots'];
    const chunks = Array.from({ length: 4000 }, (_, index) => generateChunk(42, index));
    for (const id of ids) {
      const relic = chunks.flatMap(c => c.relics).find(r => r.cosmeticId === id)!;
      Object.assign(p.body, { x: relic.x, y: relic.y - 10, vy: 0, vx: 0, protection: 10 });
      server.world.step();
      expect(p.profile.unlockedCosmetics).toContain(id);
    }
    const look = { mask: 'fire-spirit', hat: 'bare-head', shoes: 'comet-boots', color: '#bc9bea' };
    const registered = await request('/auth/register', { ...credentials, ...look }, g.cookie);
    expect(registered.status).toBe(201);
    expect((await registered.json()).profile).toMatchObject({ ...look, unlockedCosmetics: ids });
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    for (const patch of [{ mask: 'ice-spirit' }, { shoes: 'frost-skates' }]) {
      expect((await request('/auth/profile', { displayName: 'Comète', ...look, ...patch }, cookie, undefined, 'PATCH')).status).toBe(403);
    }
    expect((await request('/auth/profile', { displayName: 'Comète', ...look }, cookie, undefined, 'PATCH')).status).toBe(200);
    const restored = await Store.open(join(directory, 'world.json'));
    try { expect(restored.profile(p.profile.id)).toMatchObject({ ...look, unlockedCosmetics: ids }); } finally { await restored.close(); }
    expect((await (await request('/auth/login', { email: credentials.email, password: credentials.password })).json()).profile).toMatchObject({ ...look, unlockedCosmetics: ids });
  });
  it('unlocks personal relics on contact, keeps them through respawn and guest registration, and saves them', async () => {
    server.store.state.world.seed = 42;
    const g = await guest(), other = await guest(), a = await connect(g.cookie), b = await connect(other.cookie);
    server.world.stop();
    const p = server.world.players.get(a.welcome.playerId)!, q = server.world.players.get(b.welcome.playerId)!;
    const relic = Array.from({ length: 4000 }, (_, index) => generateChunk(42, index)).flatMap(c => c.relics).find(r => r.cosmeticId === 'mask:verdant')!;
    Object.assign(q.body, { x: relic.x + 40, y: relic.y - 10 });
    Object.assign(p.body, { x: relic.x + 40, y: relic.y - 10 }); server.world.step();
    expect(p.profile.unlockedCosmetics).toEqual([]);
    Object.assign(p.body, { x: relic.x, y: relic.y - 10, vy: 0 });
    const effect = new Promise<GameEffect>(resolve => a.socket.once('effect', resolve)); server.world.step();
    expect(await effect).toMatchObject({ kind: 'unlock', actorId: p.body.id, cosmeticId: relic.cosmeticId });
    expect(p.profile.unlockedCosmetics).toEqual([relic.cosmeticId]); expect(q.profile.unlockedCosmetics).toEqual([]);
    // Drain reliable chunk/profile messages while awaiting a real personalized snapshot.
    const ticker = setInterval(() => server.world.step(), 8);
    try {
      const [sa, sb] = await Promise.all([new Promise<Snapshot>(resolve => a.socket.once('snapshot', resolve)), new Promise<Snapshot>(resolve => b.socket.once('snapshot', resolve))]);
      expect(sa.relics.some(r => r.id === relic.id)).toBe(false);
      expect(sb.relics.some(r => r.id === relic.id)).toBe(true);
    } finally { clearInterval(ticker); }
    Object.assign(q.body, { x: relic.x, y: relic.y - 10, vy: 0 }); server.world.step();
    expect(q.profile.unlockedCosmetics).toEqual([relic.cosmeticId]);
    a.socket.emit('respawn', { v: 1 }); await delay(40);
    expect(p.profile.unlockedCosmetics).toEqual([relic.cosmeticId]);
    Object.assign(p.body, { x: relic.x, y: relic.y - 10, vy: 0 }); server.world.step();
    expect(p.profile.unlockedCosmetics).toHaveLength(1);
    const registered = await request('/auth/register', { email: 'collector@example.test', password: 'a-strong-password-123', displayName: 'Collectionneur', mask: 'verdant', hat: 'tricorn', color: '#bc9bea' }, g.cookie);
    expect(registered.status).toBe(201);
    expect((await registered.json()).profile).toMatchObject({ id: p.profile.id, mask: 'verdant', unlockedCosmetics: ['mask:verdant'], personalBest: p.profile.personalBest, lastCamp: p.profile.lastCamp });
    const restored = await Store.open(join(directory, 'world.json'));
    try { expect(restored.profile(p.profile.id)).toMatchObject({ mask: 'verdant', unlockedCosmetics: ['mask:verdant'] }); } finally { await restored.close(); }
  });
  it('opens duplicates once per location, persists them after signup and reconnect, and leaves other players their own roll', async () => {
    server.store.state.world.seed = 42;
    const g = await guest(), other = await guest(), a = await connect(g.cookie), b = await connect(other.cookie);
    server.world.stop();
    const p = server.world.players.get(a.welcome.playerId)!, q = server.world.players.get(b.welcome.playerId)!;
    const coffers = Array.from({ length: 4000 }, (_, index) => generateChunk(42, index)).filter(c => c.relics.length);
    const first = coffers[0]!, second = coffers.slice(1).find(c => c.relics[0]!.cosmeticId === first.relics[0]!.cosmeticId)!;
    const cosmeticId = first.relics[0]!.cosmeticId;
    const seen: GameEffect[] = []; a.socket.on('effect', effect => seen.push(effect));
    const at = (chunk: Chunk, offset = 0) => ({ x: chunk.relics[0]!.x + offset, y: chunk.relics[0]!.y - 10, vy: 0, vx: 0, grounded: false, protection: 10 });
    const snapshot = async (socket = a.socket) => {
      // Reliable effect/chunk packets must drain before a volatile snapshot can arrive.
      const ticker = setInterval(() => server.world.step(), 8);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise<Snapshot>((resolve, reject) => {
          socket.once('snapshot', resolve);
          timeout = setTimeout(() => reject(new Error('Snapshot not received')), 1500);
        });
      } finally { clearInterval(ticker); clearTimeout(timeout); }
    };
    Object.assign(p.body, at(first)); Object.assign(q.body, at(first, 40));
    await snapshot();
    expect(seen.filter(e => e.kind === 'unlock')).toMatchObject([{ cosmeticId, duplicate: false }]);
    expect(p.profile.unlockedCosmetics).toEqual([cosmeticId]);
    Object.assign(p.body, at(second, 40)); Object.assign(q.body, at(second, 65));
    // Owning the item does not hide a different, unopened coffer.
    expect((await snapshot()).relics.some(r => r.id === second.relics[0]!.id)).toBe(true);
    Object.assign(p.body, at(second));
    expect((await snapshot()).relics.some(r => r.id === second.relics[0]!.id)).toBe(false);
    expect(seen.filter(e => e.kind === 'unlock')).toMatchObject([{ cosmeticId, duplicate: false }, { cosmeticId, duplicate: true }]);
    expect(p.profile.unlockedCosmetics).toEqual([cosmeticId]);
    const opened = [first, second].map(c => Math.floor(c.index / RELIC_INTERVAL_CHUNKS));
    expect(p.profile.openedRelicBands).toEqual(opened);
    Object.assign(p.body, at(second)); await snapshot();
    expect(seen.filter(e => e.kind === 'unlock')).toHaveLength(2);
    Object.assign(p.body, at(second, 40)); Object.assign(q.body, at(second)); await snapshot();
    expect(q.profile.unlockedCosmetics).toEqual([cosmeticId]);
    expect(q.profile.openedRelicBands).toEqual([opened[1]]);
    expect((await request('/auth/profile', { displayName: p.profile.displayName, color: p.profile.color, openedRelicBands: [] }, g.cookie, undefined, 'PATCH')).status).toBe(400);
    const credentials = { email: 'duplicates@example.test', password: 'a-strong-password-123' };
    const registered = await request('/auth/register', { ...credentials, displayName: 'Chasseur Rare' }, g.cookie);
    expect(registered.status).toBe(201);
    const profile = (await registered.json()).profile;
    expect(profile.unlockedCosmetics).toEqual([cosmeticId]); expect(profile).not.toHaveProperty('openedRelicBands');
    const restored = await Store.open(join(directory, 'world.json'));
    try { expect(restored.profile(p.profile.id)?.openedRelicBands).toEqual(opened); } finally { await restored.close(); }
    const login = await request('/auth/login', credentials);
    const ticker = setInterval(() => server.world.step(), 8);
    let returning: Awaited<ReturnType<typeof connect>>;
    try { returning = await connect(login.headers.get('set-cookie')!.split(';')[0]!); } finally { clearInterval(ticker); }
    Object.assign(server.world.players.get(returning.welcome.playerId)!.body, at(second));
    expect((await snapshot(returning.socket)).relics.some(r => r.id === second.relics[0]!.id)).toBe(false);
    expect(p.profile.unlockedCosmetics).toEqual([cosmeticId]);
  });
  it('rejects oversized JSON and keeps missing API routes distinct from the web fallback', async () => {
    expect((await request('/auth/guest', { payload: 'x'.repeat(10000) })).status).toBe(413);
    expect((await request('/does-not-exist')).status).toBe(404);
  });
});

describe('authoritative multiplayer world', () => {
  it('lists live destinations without joining, exposing private profiles or including disconnected players', async () => {
    expect((await request('/world/players')).status).toBe(401);
    const g = await guest(), a = await connect((await guest()).cookie), b = await connect((await guest()).cookie);
    server.world.stop();
    server.world.players.get(a.welcome.playerId)!.body.y = 10 * 216;
    const response = await request('/world/players', undefined, g.cookie);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(server.world.online).toBe(2); expect(data.players).toHaveLength(2);
    expect(data.players.find((p: { id: string }) => p.id === a.welcome.playerId)).toMatchObject({ height: 200, displayName: a.welcome.profile.displayName });
    expect(Object.keys(data.players[0]).sort()).toEqual(['id', 'displayName', 'color', 'mask', 'hat', 'shoes', 'shoeColor', 'hatColor', 'height'].sort());
    b.socket.disconnect(); await delay(30);
    expect((await (await request('/world/players', undefined, g.cookie)).json()).players).toHaveLength(1);
    expect(server.world.joinablePlayers(a.welcome.playerId)).toEqual([]);
  });
  it('joins the selected human at their current location and honors an explicit saved start on re-entry', async () => {
    const a = await connect((await guest()).cookie), b = await connect((await guest()).cookie), g = await guest();
    server.world.stop();
    const target = server.world.players.get(a.welcome.playerId)!;
    Object.assign(target.body, { x: 160, y: 15 * 216 });
    server.world.players.get(b.welcome.playerId)!.body.y = 30 * 216;
    Object.assign(server.store.profile(g.data.profile.id)!, { personalBest: 500, lastCamp: 5, unlockedCosmetics: ['mask:verdant'], openedRelicBands: [2] });
    const joined = await connect(g.cookie, { mode: 'player', playerId: a.welcome.playerId });
    expect(joined.welcome.player).toMatchObject({ y: 15 * 216, vx: 0, vy: 0, protection: 2 });
    expect(joined.welcome.profile).toMatchObject({ lastCamp: 15, personalBest: 500, unlockedCosmetics: ['mask:verdant'] });
    const p = server.world.players.get(joined.welcome.playerId)!;
    joined.socket.emit('join', { v: 1, entry: { mode: 'player', playerId: b.welcome.playerId } });
    await delay(30); expect(p.body.y).toBe(15 * 216); // A second join cannot teleport an active player.
    p.body.y += 80;
    joined.socket.disconnect(); await delay(30);
    const reconnected = await connect(g.cookie);
    expect(reconnected.welcome.player.y).toBe(15 * 216 + 80);
    reconnected.socket.disconnect(); await delay(30);
    const saved = await connect(g.cookie, { mode: 'saved' });
    expect(saved.welcome.player.y).toBe(15 * 216);
    expect(p.profile.openedRelicBands).toEqual([2]);
    await server.store.flush();
    const stored = await Store.open(join(directory, 'world.json'));
    try { expect(stored.profile(g.data.profile.id)).toMatchObject({ lastCamp: 15, personalBest: 500, openedRelicBands: [2] }); } finally { await stored.close(); }
  });
  it('rejects stale or self destinations without creating a player, then accepts a saved start on the same connection', async () => {
    const g = await guest();
    const socket = io(base, { transports: ['websocket'], extraHeaders: { cookie: g.cookie }, forceNew: true }); sockets.push(socket);
    await new Promise<void>(resolve => socket.once('connect', resolve));
    for (const playerId of [g.data.profile.id, '00000000-0000-4000-8000-000000000000']) {
      const rejected = new Promise<{ message: string }>(resolve => socket.once('joinRejected', resolve));
      socket.emit('join', { v: 1, entry: { mode: 'player', playerId } });
      expect((await rejected).message).toContain('plus disponible');
      expect(server.world.online).toBe(0); expect(server.world.players.has(g.data.profile.id)).toBe(false);
    }
    const welcome = new Promise<Welcome>(resolve => socket.once('welcome', resolve));
    socket.emit('join', { v: 1, entry: { mode: 'saved' } });
    expect((await welcome).player.y).toBe(0);
    for (const entry of [{ mode: 'player', playerId: 'bot-0' }, { mode: 'saved', y: 9000 }, { mode: 'player', playerId: g.data.profile.id, x: 20 }, { mode: 'player' }]) {
      expect(joinSchema.safeParse({ v: 1, entry }).success).toBe(false);
    }
    expect(joinSchema.safeParse({ v: 1, community: true, entry: { mode: 'saved' } }).success).toBe(false);
  });
  it('places an arrival on a stable ledge when the selected player is in the air above spikes', async () => {
    server.store.state.world.seed = 42;
    const target = await connect((await guest()).cookie), g = await guest(); server.world.stop();
    const hazard = server.world.getChunk(7).hazards[0]!;
    Object.assign(server.world.players.get(target.welcome.playerId)!.body, { x: hazard.x + hazard.w / 2, y: hazard.y + 35, vy: -100 });
    const arrival = await connect(g.cookie, { mode: 'player', playerId: target.welcome.playerId });
    expect(touchesHazard(arrival.welcome.player, server.world.chunksAt(arrival.welcome.player.y))).toBe(false);
    const floor = server.world.platformsAt(arrival.welcome.player.y).find(p => p.y === arrival.welcome.player.y && arrival.welcome.player.x >= p.x && arrival.welcome.player.x <= p.x + p.w)!;
    expect(floor).toBeDefined(); expect(floor.mechanism).toBeUndefined(); expect(floor.id.endsWith(':side')).toBe(false);
    server.world.step(); expect(server.world.players.get(arrival.welcome.playerId)!.body.grounded).toBe(true);
  });
  it('returns to the base only on a valid explicit action and saves the new camp without losing the collection or record', async () => {
    const g = await guest(), a = await connect(g.cookie), p = server.world.players.get(a.welcome.playerId)!;
    server.world.stop();
    Object.assign(p.profile, { lastCamp: 10, personalBest: 400, camps: [0, 5, 10], unlockedCosmetics: ['mask:verdant'], openedRelicBands: [0, 1], mask: 'verdant' });
    Object.assign(p.body, { y: 10 * 216, feather: 8, boots: true, bubble: true });
    a.socket.emit('returnToBase', { v: 1, personalBest: 0 });
    await delay(35); expect(p.body.y).toBe(10 * 216);
    const returned = new Promise<{ message: string }>(resolve => a.socket.once('notice', resolve));
    a.socket.emit('returnToBase', { v: 1 });
    expect((await returned).message).toContain('pied de la tour');
    expect(p.body).toMatchObject({ x: 160, y: 0, feather: 0, boots: false, bubble: false, protection: 2 });
    expect(p.profile).toMatchObject({ lastCamp: 0, personalBest: 400, camps: [0, 5, 10], unlockedCosmetics: ['mask:verdant'], openedRelicBands: [0, 1], mask: 'verdant' });
    await server.store.flush();
    const restored = await Store.open(join(directory, 'world.json'));
    try { expect(restored.profile(p.profile.id)).toMatchObject({ lastCamp: 0, personalBest: 400, openedRelicBands: [0, 1], mask: 'verdant' }); } finally { await restored.close(); }
    a.socket.disconnect(); await delay(40);
    p.disconnectedAt = Date.now() - 11000;
    const b = await connect(g.cookie);
    expect(b.welcome.player).toMatchObject({ y: 0, lastCamp: 0, personalBest: 400, mask: 'verdant' });
  });
  it('shows the same seed, chunks and player positions to two clients', async () => {
    const a = await connect((await guest()).cookie), b = await connect((await guest()).cookie);
    expect(a.welcome.worldSeed).toBe(b.welcome.worldSeed);
    const [sa, sb] = await Promise.all([new Promise<Snapshot>(resolve => a.socket.once('snapshot', resolve)), new Promise<Snapshot>(resolve => b.socket.once('snapshot', resolve))]);
    expect(sa.playerCount).toBe(2); expect(sa.players).toEqual(sb.players);
    expect(a.chunks).toEqual(b.chunks); expect(a.chunks.length).toBeGreaterThan(1);
  });
  it('ignores forged coordinates and bounds input flood movement by server ticks', async () => {
    const a = await connect((await guest()).cookie);
    a.socket.emit('input', { ...neutralInput(), y: 100000, personalBest: 10000 });
    for (let i = 1; i < 400; i++) a.socket.emit('input', { ...neutralInput(i), moveX: 1 });
    await delay(220); const p = server.world.players.get(a.welcome.playerId)!;
    expect(p.body.y).toBe(0); expect(p.profile.personalBest).toBe(0); expect(p.body.x - a.welcome.player.x).toBeLessThan(35); expect(server.world.rejectedInputs).toBeGreaterThan(0);
  });
  it('uses fresh movement after a burst, keeps short jumps and recovers across sequence gaps', async () => {
    const a = await connect((await guest()).cookie);
    server.world.stop();
    const p = server.world.players.get(a.welcome.playerId)!, x = p.body.x;
    for (let seq = 0; seq < 18; seq++) a.socket.emit('input', { ...neutralInput(seq), moveX: 1 });
    a.socket.emit('input', { ...neutralInput(18), moveX: 1, jump: true, push: true });
    for (let seq = 19; seq < 29; seq++) a.socket.emit('input', neutralInput(seq));
    await delay(40);
    server.world.step(); // Fresh held movement, not 18 stale frames.
    expect(p.body.x - x).toBeLessThanOrEqual(108 / 30);
    server.world.step(); // The one-frame press survives coalescing.
    expect(p.body.y).toBeGreaterThan(0); expect(p.body.jumpHeld).toBe(true);
    server.world.step();
    expect(p.ack).toBe(28); expect(p.body.jumpHeld).toBe(false);
    // An expired/flooded stream used to lock permanently once this gap exceeded 200.
    a.socket.emit('input', neutralInput(1000)); await delay(25); server.world.step();
    expect(p.ack).toBe(1000);
    a.socket.emit('input', { ...neutralInput(999), moveX: -1 }); await delay(25); server.world.step();
    expect(p.ack).toBe(1000); expect(server.world.rejectedInputs).toBe(1);
  });
  it('acknowledges queued controls discarded on respawn', async () => {
    const a = await connect((await guest()).cookie);
    server.world.stop();
    const p = server.world.players.get(a.welcome.playerId)!;
    a.socket.emit('input', { ...neutralInput(0), jump: true });
    a.socket.emit('input', neutralInput(1));
    const returned = new Promise(resolve => a.socket.once('notice', resolve));
    a.socket.emit('respawn', { v: 1 }); await returned;
    expect(p.ack).toBe(1); expect(p.queue).toHaveLength(0);
    server.world.step(); expect(p.body.y).toBe(0);
  });
  it('activates camps only after a real landing, respawns there and preserves PB on reconnect', async () => {
    const g = await guest(), a = await connect(g.cookie), p = server.world.players.get(a.welcome.playerId)!;
    p.body.x = 160; p.body.y = 1082; p.body.vy = -100; p.body.grounded = false; p.body.protection = 0;
    await delay(100); expect(p.profile.lastCamp).toBe(5); expect(p.profile.personalBest).toBeGreaterThanOrEqual(100);
    p.body.y = 1500; p.profile.personalBest = 200;
    a.socket.emit('respawn', { v: 1 }); await delay(100); expect(p.body.y).toBe(1080); expect(p.profile.personalBest).toBe(200);
    a.socket.disconnect(); await delay(70);
    const b = await connect(g.cookie); expect(b.welcome.player.y).toBe(1080); expect(b.welcome.profile.personalBest).toBe(200);
    p.body.y = 2; p.body.vy = -100; p.body.grounded = false;
    await delay(100); expect(p.profile.lastCamp).toBe(0); expect(p.profile.personalBest).toBe(200);
  });
  it('rejects an unauthenticated socket and revokes an active socket on logout', async () => {
    const unauth = io(base, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(unauth);
    const rejected = await new Promise<Error>(resolve => unauth.once('connect_error', resolve)); expect(rejected.message).toContain('Session');
    const g = await guest(), a = await connect(g.cookie);
    const disconnected = new Promise<string>(resolve => a.socket.once('disconnect', resolve));
    expect((await request('/auth/logout', {}, g.cookie)).status).toBe(200); expect(await disconnected).toBe('io server disconnect');
    expect((await (await request('/auth/me', undefined, g.cookie)).json()).profile).toBeNull();
  });
  it('starts newcomers at the base despite other climbers and preserves returning camps', async () => {
    const front = await connect((await guest()).cookie);
    const runner = server.world.players.get(front.welcome.playerId)!;
    runner.body.y = 18 * 216; runner.profile.personalBest = 360;
    const newcomer = await connect((await guest()).cookie);
    expect(newcomer.welcome.profile.lastCamp).toBe(0); expect(newcomer.welcome.player.y).toBe(0);
    const g = await guest(); const returning = server.store.profile(g.data.profile.id)!;
    returning.personalBest = 250; returning.lastCamp = 5; returning.camps.push(5);
    const old = await connect(g.cookie); expect(old.welcome.player.y).toBe(5 * 216);
    old.socket.disconnect(); await delay(50);
    server.world.players.get(returning.id)!.disconnectedAt = Date.now() - 11000;
    const rejoined = await connect(g.cookie); expect(rejoined.welcome.player.y).toBe(5 * 216); expect(rejoined.welcome.profile.personalBest).toBe(250);
  });
  it('starts at the base when a mature tower is temporarily empty', async () => {
    server.store.state.world.frontier = 500;
    const newcomer = await connect((await guest()).cookie);
    expect(newcomer.welcome.profile.lastCamp).toBe(0); expect(newcomer.welcome.player.y).toBe(0);
  });
  it('keeps only nearby chunks active and handles 20 simultaneous players', async () => {
    for (let i = 0; i < 20; i++) await connect((await guest()).cookie);
    expect(server.world.online).toBe(20);
    await delay(400);
    expect(server.world.chunks.size).toBeLessThanOrEqual(5); expect(server.world.maxTickMs).toBeLessThan(100);
    const health = await (await fetch(`${base}/health`)).json(); expect(health.players).toBe(20);
  });
  it('sends global neighboring ranks beyond the render area and updates them after movement and disconnection', async () => {
    server.world.stop();
    const clients: Awaited<ReturnType<typeof connect>>[] = [];
    for (let i = 0; i < 13; i++) clients.push(await connect((await guest()).cookie));
    for (const [i, client] of clients.entries()) {
      const player = server.world.players.get(client.welcome.playerId)!;
      player.body.x = 160; player.body.y = i * 2 * 216;
    }
    const mine = clients[6]!;
    const nextSnapshot = async () => {
      // Volatile snapshots can be skipped while the preceding reliable packets drain.
      const ticker = setInterval(() => server.world.step(), 8);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise<Snapshot>((resolve, reject) => {
          mine.socket.once('snapshot', resolve);
          timeout = setTimeout(() => reject(new Error('Snapshot not received')), 1500);
        });
      } finally { clearInterval(ticker); clearTimeout(timeout); }
    };
    const snapshot = await nextSnapshot();
    expect(snapshot.playerCount).toBe(13);
    expect(snapshot.players).toHaveLength(3);
    expect(snapshot.standings.self).toMatchObject({ id: mine.welcome.playerId, rank: 7, height: 240, delta: 0 });
    expect(snapshot.standings.above.map(p => p.id)).toEqual([11, 10, 9, 8, 7].map(i => clients[i]!.welcome.playerId));
    expect(snapshot.standings.below.map(p => p.id)).toEqual([5, 4, 3, 2, 1].map(i => clients[i]!.welcome.playerId));
    expect(snapshot.standings.above.map(p => p.delta)).toEqual([200, 160, 120, 80, 40]);
    expect(snapshot.standings.below[0]!.delta).toBe(-40);
    clients[8]!.socket.disconnect();
    await expect.poll(() => server.world.online).toBe(12);
    const disconnected = await nextSnapshot();
    expect(disconnected.playerCount).toBe(12);
    expect(disconnected.standings.above.map(p => p.id)).toEqual([12, 11, 10, 9, 7].map(i => clients[i]!.welcome.playerId));
    const overtaker = server.world.players.get(clients[1]!.welcome.playerId)!;
    overtaker.body.y = 13 * 216;
    const moved = await nextSnapshot();
    expect(moved.standings.above.at(-1)).toMatchObject({ id: overtaker.body.id, delta: 20 });
    expect(moved.standings.self.rank).toBe(7);
  });
});
