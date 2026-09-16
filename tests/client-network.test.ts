import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBody, generateChunk } from '@tower/game-core';
import { neutralInput, type NetworkPlayer, type Snapshot, type Welcome } from '@tower/shared';
import { GameClient } from '../apps/web/src/game/client';
import { DEFAULT_SETTINGS } from '../apps/web/src/game/input';

const network = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => void>(),
  sent: [] as { event: string; data: any }[],
  jump: false,
}));
vi.mock('socket.io-client', () => ({ io: () => ({
  connected: true, io: { engine: { transport: { name: 'polling' } } },
  on(event: string, handler: (...args: any[]) => void) { network.handlers.set(event, handler); return this; },
  emit(event: string, data: unknown) { network.sent.push({ event, data }); return this; },
  timeout() { return this; }, connect() {}, disconnect() {}, removeAllListeners() {},
}) }));
vi.mock('../apps/web/src/game/input', async importOriginal => ({
  ...await importOriginal<typeof import('../apps/web/src/game/input')>(),
  InputController: class {
    settings = DEFAULT_SETTINGS; gamepadConnected = false;
    sample(seq: number) { return { ...neutralInput(seq), jump: network.jump }; }
    clear() { network.jump = false; } destroy() {}
  },
}));
vi.mock('../apps/web/src/game/audio', () => ({ GameAudio: class {
  jump() {} land() {} destroy() {}
} }));

let client: GameClient, player: NetworkPlayer;
beforeEach(() => {
  vi.useFakeTimers(); network.handlers.clear(); network.sent = []; network.jump = false;
  client = new GameClient(DEFAULT_SETTINGS, () => {}, () => {}, () => {});
  player = { ...createBody('test-mage'), displayName: 'Mage', color: '#c6ed80', mask: 'ivory', hat: 'bare-head', personalBest: 0, lastCamp: 0, ack: -1, isBot: false };
  const welcome: Welcome = { v: 1, tick: 1200, playerId: player.id, worldSeed: 42, worldVersion: 10, tickRate: 30, player,
    profile: { ...player, isGuest: true, createdAt: '', unlockedCosmetics: [], shoes: 'classic', shoeColor: '#c6ed80', hatColor: null } };
  network.handlers.get('welcome')!(welcome);
});
afterEach(() => { client.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); });
const chunks = () => network.handlers.get('chunks')!({ v: 1, chunks: [generateChunk(42, 0), generateChunk(42, 1)] });
const snapshot = (tick: number, own = player, others: NetworkPlayer[] = []) => network.handlers.get('snapshot')!({
  v: 1, tick, serverTime: Date.now(), players: [own, ...others], playerCount: 1 + others.length, botCount: 0,
  pickups: [], relics: [], bridges: [], crumbling: [], frontier: 0, frontRunnerId: own.id, tickMs: 1, activeChunks: 2,
  standings: { above: [], below: [], self: { id: own.id, displayName: 'Mage', color: '#c6ed80', rank: 1, height: 0, delta: 0 } },
} satisfies Snapshot);

it('waits for collision geometry instead of falling during a delayed arrival', () => {
  for (let frame = 0; frame < 30; frame++) client.update(1000 / 60);
  expect(client.local!.y).toBe(0); expect(network.sent.filter(p => p.event === 'input')).toHaveLength(0);
  expect(client.renderTick).toBeGreaterThan(1190);
  chunks(); network.jump = true;
  client.update(1000 / 30);
  expect(client.local!.y).toBeGreaterThan(0); // Immediate local jump, before the server answers.
  expect(network.sent.filter(p => p.event === 'input')).toHaveLength(1);
});

it('does not replay pre-respawn jumps or accept an older position snapshot', () => {
  chunks(); network.jump = true;
  for (let frame = 0; frame < 8; frame++) client.update(1000 / 30);
  expect(client.networkStats.pending).toBe(8);
  network.handlers.get('notice')!({ v: 1, reason: 'respawn', message: 'Retour au camp.' });
  snapshot(1210, { ...player, ack: 7 });
  expect(client.local!.y).toBe(0); expect(client.networkStats.pending).toBe(0);
  expect(client.renderPlayers().find(p => p.id === player.id)!.y).toBe(0);
  snapshot(1208, { ...player, y: 70, ack: 5 });
  expect(client.local!.y).toBe(0);
});

it('keeps the visible mage and camera continuous across a small position correction', () => {
  chunks(); snapshot(1202, { ...player, y: 70 }); client.update(1000 / 60);
  const before = client.renderPlayers().find(p => p.id === player.id)!;
  const camera = client.cameraY;
  snapshot(1204, { ...player, y: 50 });
  const after = client.renderPlayers().find(p => p.id === player.id)!;
  expect(after.y).toBeCloseTo(before.y);
  expect(client.cameraY).toBe(camera);
});

it('does not display a ping timeout as a successful 2500 ms measurement', () => {
  vi.advanceTimersByTime(2500);
  const ping = network.sent.find(p => p.event === 'ping')!;
  vi.advanceTimersByTime(2500); ping.data(new Error('timeout'));
  expect(client.state.ping).toBe(0);
});

it('keeps a steadily moving remote player smooth when HTTP delivers a snapshot every 200 ms', () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const positions: number[] = [];
  for (let frame = 0; frame <= 360; frame++) {
    now = frame * 1000 / 60;
    if (frame % 12 === 0) snapshot(1200 + frame / 2, player, [{ ...player, id: 'partner', x: 40 + now * 0.02, vx: 20 }]);
    const partner = client.renderPlayers().find(p => p.id === 'partner')!;
    if (frame >= 120) positions.push(partner.x);
  }
  const steps = positions.slice(1).map((x, i) => x - positions[i]!);
  const frozen = steps.filter(dx => dx < 0.001).length;
  const maxStep = Math.max(...steps);
  console.log('Remote HTTP replay:', JSON.stringify({ frames: steps.length, frozen, maxStep }));
  expect(frozen).toBeLessThan(steps.length * 0.05);
  expect(maxStep).toBeLessThan(0.5); // 20 px/s at 60 FPS, allowing gentle clock adjustments.
  expect(positions.at(-1)! - positions[0]!).toBeGreaterThan(75);
});

it('does not draw a remote teleport as a slide through the tower', () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  snapshot(1200, player, [{ ...player, id: 'partner', x: 30, y: 0 }]);
  client.renderPlayers(); now = 200;
  snapshot(1206, player, [{ ...player, id: 'partner', x: 250, y: 0 }]);
  expect(client.renderPlayers().find(p => p.id === 'partner')!.x).toBe(250);
  now = 400;
  snapshot(1212, player, [{ ...player, id: 'partner', x: 250, y: 500 }]);
  now = 600;
  expect(client.renderPlayers().find(p => p.id === 'partner')!.y).toBe(500);
});
