import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../apps/game-server/src/app';
import { BOT_COLOR, CHUNK_HEIGHT, nearbyStandingsSchema, neutralInput, type GameEffect, type Snapshot, type Welcome } from '@tower/shared';
import { createBody, PICKUP_RESPAWN_SECONDS } from '@tower/game-core';
import { BotBrain } from '../apps/game-server/src/bots';

let server: Awaited<ReturnType<typeof createApp>>, directory: string, url: string;
const sockets: Socket[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  const response = await fetch(`${url}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const socket = io(url, { transports: ['websocket'], extraHeaders: { cookie: response.headers.get('set-cookie')!.split(';')[0]! }, forceNew: true }); sockets.push(socket);
  const welcome = await new Promise<Welcome>((resolve, reject) => { socket.once('connect', () => socket.emit('join', { v: 1 })); socket.once('welcome', resolve); socket.once('connect_error', reject); });
  return { socket, player: server.world.players.get(welcome.playerId)! };
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tower-companions-'));
  server = await createApp({ dataFile: join(directory, 'world.json'), secret: 'isolated-companions-test-secret-32-characters', silent: true });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
});
afterEach(async () => { for (const socket of sockets.splice(0)) socket.disconnect(); await server.close(); await rm(directory, { recursive: true, force: true }); });

describe('populated authoritative world', () => {
  it('broadcasts a human hit on an active bot and keeps the recoil despite the bot navigation', async () => {
    const a = await connect(); server.world.stop(); server.world.step();
    const bot = [...server.world.players.values()].find(p => p.bot?.slot === 0)!;
    const floor = server.world.getChunk(2).platforms[0]!;
    Object.assign(a.player.body, createBody(a.player.body.id), { x: 160, y: floor.y, protection: 0 });
    Object.assign(bot.body, createBody(bot.body.id), { x: 187, y: floor.y, protection: 0, vx: -108 });
    const startX = bot.body.x;
    a.player.input = { ...neutralInput(), push: true };
    const effect = new Promise<GameEffect>(resolve => a.socket.once('effect', resolve));
    server.world.step();
    expect(await effect).toMatchObject({ kind: 'push', actorId: a.player.body.id, hits: [{ id: bot.body.id, blocked: false }] });
    for (let i = 0; i < 10; i++) server.world.step();
    expect(bot.body.x - startX).toBeGreaterThan(50); expect(bot.body.stun).toBeGreaterThan(0);
  });
  it('respawns a spike hit at the last camp, respects arrival protection and keeps the record and rare collection', async () => {
    const a = await connect(); server.world.stop();
    const trap = server.world.getChunk(7).hazards[0]!;
    Object.assign(a.player.profile, { personalBest: 400, lastCamp: 5, camps: [0, 5], unlockedCosmetics: ['mask:verdant'], mask: 'verdant' });
    Object.assign(a.player.body, createBody(a.player.body.id), { x: trap.x + trap.w / 2, y: trap.y, protection: 1, bubble: true });
    server.world.step();
    expect(a.player.body.y).toBe(trap.y);
    a.player.body.protection = 0; a.player.body.feather = 8; a.player.body.boots = true;
    const notice = new Promise<{ message: string; reason?: string }>(resolve => a.socket.once('notice', resolve));
    server.world.step();
    expect(await notice).toMatchObject({ reason: 'respawn', message: 'Aïe, les pics ! Retour au camp. Votre record est conservé.' });
    expect(a.player.body).toMatchObject({ x: 160, y: 5 * CHUNK_HEIGHT, protection: 2, feather: 0, boots: false, bubble: false });
    expect(a.player.profile).toMatchObject({ lastCamp: 5, personalBest: 400, mask: 'verdant', unlockedCosmetics: ['mask:verdant'] });
  });
  it('adds three identifiable bots, keeps human counts and persistent records separate, and keeps helpers available as humans join', async () => {
    expect(server.world.botCount).toBe(0);
    const a = await connect();
    const snapshot = await new Promise<Snapshot>(resolve => a.socket.once('snapshot', resolve));
    expect(snapshot.playerCount).toBe(1); expect(snapshot.botCount).toBe(3); expect(snapshot.players.filter(p => p.isBot)).toHaveLength(3);
    expect(server.world.joinablePlayers(a.player.body.id)).toEqual([]);
    expect([...snapshot.standings.above, ...snapshot.standings.below].filter(p => p.isBot)).toHaveLength(3);
    for (const bot of snapshot.players.filter(p => p.isBot)) expect(bot).toMatchObject({ color: BOT_COLOR, mask: 'ivory' });
    for (const bot of [...snapshot.standings.above, ...snapshot.standings.below].filter(p => p.isBot)) expect(bot.color).toBe(BOT_COLOR);
    expect(nearbyStandingsSchema.safeParse(snapshot.standings).success).toBe(true);
    expect(snapshot.players.find(p => !p.isBot)!.color).not.toBe(BOT_COLOR);
    expect(snapshot.frontRunnerId).toBe(a.player.body.id); expect(server.store.state.profiles).toHaveLength(1);
    for (let n = 2; n <= 4; n++) { await connect(); await delay(45); expect(server.world.online).toBe(n); expect(server.world.botCount).toBe(3); }
    for (const socket of sockets) socket.disconnect(); await delay(60);
    expect(server.world.online).toBe(0); expect(server.world.botCount).toBe(0);
    expect(server.store.state.profiles.some(p => p.id.startsWith('bot-'))).toBe(false);
  });
  it('a companion brain sends a confirmed push to the human and the same action respects a bubble', async () => {
    const a = await connect(); server.world.stop(); server.world.step();
    const bot = [...server.world.players.values()].find(p => p.bot?.slot === 0)!;
    const floor = server.world.getChunk(2).platforms[0]!;
    for (const bubble of [false, true]) {
      Object.assign(a.player.body, createBody(a.player.body.id), { x: 151, y: floor.y, protection: 0, bubble });
      Object.assign(bot.body, createBody(bot.body.id), { x: 169, y: floor.y, protection: 0, facing: 1 });
      bot.bot = new BotBrain(0);
      bot.bot.input(bot.body, [floor], [a.player.body], server.world.tick);
      // Advance the intention timer; the ensuing hit still requires the real world step.
      server.world.tick += 100;
      const effect = new Promise<GameEffect>(resolve => a.socket.once('effect', resolve));
      server.world.step();
      expect(await effect).toMatchObject({ kind: 'push', actorId: bot.body.id, facing: -1, hits: [{ id: a.player.body.id, blocked: bubble }] });
      expect(a.player.body.vx).toBe(bubble ? 0 : -220);
      expect(a.player.body.bubble).toBe(false);
    }
  });
  it('authoritatively awards a shared pickup once, respawns it after 30s and clears bonuses on return to camp', async () => {
    const a = await connect(), b = await connect(); server.world.stop();
    const pickup = server.world.getChunk(0).pickups[0]!;
    for (const p of [a.player, b.player]) { p.body.x = pickup.x; p.body.y = pickup.y - 9; p.body.vy = 0; }
    const effect = new Promise<GameEffect>(resolve => a.socket.once('effect', resolve));
    server.world.step();
    expect(await effect).toMatchObject({ kind: 'pickup', actorId: a.player.body.id, powerUp: 'feather' });
    expect(a.player.body.feather).toBe(12); expect(b.player.body.feather).toBe(0);
    expect(server.world.pickupCooldowns.get(pickup.id)).toBe(server.world.tick + PICKUP_RESPAWN_SECONDS * 30);
    Object.assign(a.player.body, { x: 160, y: 0 }); Object.assign(b.player.body, { x: 160, y: 0 });
    server.world.tick += PICKUP_RESPAWN_SECONDS * 30;
    Object.assign(b.player.body, { x: pickup.x, y: pickup.y - 9 }); server.world.step();
    expect(b.player.body.feather).toBe(12);
    a.player.body.boots = true; a.player.body.bubble = true;
    a.socket.emit('respawn', { v: 1 }); await delay(40);
    expect(a.player.body).toMatchObject({ feather: 0, boots: false, bubble: false });
  });
  it('emits reliable push hit/miss effects and tells clients when a bubble absorbs the blow', async () => {
    const a = await connect(), b = await connect(); server.world.stop();
    const place = () => {
      Object.assign(a.player.body, createBody(a.player.body.id), { x: 160, y: CHUNK_HEIGHT * 2 + 72, protection: 0 });
      Object.assign(b.player.body, createBody(b.player.body.id), { x: 177, y: CHUNK_HEIGHT * 2 + 72, protection: 0 });
      a.player.input = { ...neutralInput(), push: true };
    };
    for (const mode of ['hit', 'bubble', 'miss'] as const) {
      place(); b.player.body.bubble = mode === 'bubble'; if (mode === 'miss') b.player.body.x = 250;
      const effect = new Promise<GameEffect>(resolve => a.socket.once('effect', resolve)); server.world.step();
      const data = await effect; expect(data.kind).toBe('push');
      if (data.kind !== 'push') throw new Error('Expected a push');
      expect(data.hits).toHaveLength(mode === 'miss' ? 0 : 1);
      if (mode !== 'miss') expect(data.hits[0]).toMatchObject({ id: b.player.body.id, blocked: mode === 'bubble' });
      expect(b.player.body.vx).toBe(mode === 'hit' ? 220 : 0);
    }
  });
});
