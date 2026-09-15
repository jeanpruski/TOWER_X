import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { CoopPilot, createBody, RoutePilot } from '@tower/game-core';
import { neutralInput, type Snapshot, type Welcome } from '@tower/shared';
import { createApp } from '../apps/game-server/src/app';

let server: Awaited<ReturnType<typeof createApp>>, directory: string, socket: Socket;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tower-coop-world-'));
  server = await createApp({ dataFile: join(directory, 'world.json'), secret: 'isolated-cooperation-test-secret-32-characters', silent: true, bots: 1 });
  server.store.state.world.seed = 42;
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const guest = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  socket = io(base, { transports: ['websocket'], extraHeaders: { cookie: guest.headers.get('set-cookie')!.split(';')[0]! }, forceNew: true });
  await new Promise<Welcome>(resolve => { socket.once('connect', () => socket.emit('join', { v: 1 })); socket.once('welcome', resolve); });
  server.world.stop(); server.world.step();
});
afterEach(async () => { socket?.disconnect(); await server.close(); await rm(directory, { recursive: true, force: true }); });

it('returns a visible bot from above to help a stranded human and lets both cross using normal inputs', async () => {
  const human = [...server.world.players.values()].find(p => p.socket)!, bot = [...server.world.players.values()].find(p => p.bot)!;
  const chunk = server.world.getChunk(3), gap = chunk.cooperation!;
  Object.assign(human.body, createBody(human.body.id), { x: gap.x + 18, y: gap.y, protection: 0 });
  Object.assign(bot.body, createBody(bot.body.id), { x: 160, y: chunk.exit.y, protection: 0 });
  const pilot = new CoopPilot(), route = new RoutePilot();
  let supported = false, opened = false, previousBotY = bot.body.y;
  for (let tick = 0; tick < 1000 && (human.body.y < chunk.exit.y || bot.body.y < chunk.exit.y); tick++) {
    const platforms = server.world.platformsAt(human.body.y);
    const action = supported ? pilot.input(human.body, platforms, [bot.body], gap, bot.body.id, tick) ?? route.input(human.body, platforms, tick) : neutralInput(tick);
    human.queue.push(action);
    server.world.step();
    expect(Math.abs(bot.body.y - previousBotY)).toBeLessThan(32); previousBotY = bot.body.y;
    if (bot.body.grounded && Math.abs(bot.body.y - gap.y) < 1 && Math.abs(bot.body.x - gap.x) < 5) supported = true;
    if (server.world.cooperation.isOpen(gap.id, server.world.tick)) opened = true;
  }
  expect(supported).toBe(true); expect(opened).toBe(true);
  expect(human.body.y).toBeGreaterThanOrEqual(chunk.exit.y); expect(bot.body.y).toBeGreaterThanOrEqual(chunk.exit.y);
  expect(human.body.boots).toBe(false); expect(human.body.feather).toBe(0);
  // The bridge is sent as physical geometry in the human's actual snapshot.
  const finishedTick = server.world.tick;
  const ticker = setInterval(() => server.world.step(), 8);
  try {
    const snapshot = await new Promise<Snapshot>(resolve => {
      const receive = (snapshot: Snapshot) => { if (snapshot.tick >= finishedTick) { socket.off('snapshot', receive); resolve(snapshot); } };
      socket.on('snapshot', receive);
    });
    expect(snapshot.bridges.some(p => p.id === gap.bridge.id)).toBe(true);
  } finally { clearInterval(ticker); }
});

it('keeps an autonomous companion moving when the human sends no movement at all', () => {
  const human = [...server.world.players.values()].find(p => p.socket)!, bot = [...server.world.players.values()].find(p => p.bot)!;
  let highest = 0, changed = 0, lastY = bot.body.y;
  for (let tick = 0; tick < 400; tick++) {
    server.world.step(); highest = Math.max(highest, bot.body.y);
    if (Math.abs(bot.body.y - lastY) > 0.1) changed++;
    lastY = bot.body.y;
  }
  expect(human.body.y).toBe(0); expect(highest).toBeGreaterThan(400); expect(changed).toBeGreaterThan(200);
});
