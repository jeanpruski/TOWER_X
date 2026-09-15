import { performance } from 'node:perf_hooks';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../apps/game-server/src/app';
import { type Chunk, type CrumbleState, type Platform, type NetworkPlayer, type Snapshot, type Welcome } from '@tower/shared';
import { CoopPilot, mechanismPlatforms, RoutePilot } from '@tower/game-core';

const count = Number(process.env.PLAYERS ?? 20), duration = Number(process.env.DURATION ?? 30);
if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isFinite(duration) || duration < 5 || duration > 300) throw new Error('Use PLAYERS=1..20 and DURATION=5..300 seconds.');
const directory = await mkdtemp(join(tmpdir(), 'tower-load-'));
const server = await createApp({ dataFile: join(directory, 'world.json'), secret: 'isolated-load-test-secret-32-characters', silent: true });
await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
const bots: { socket: Socket; timer: ReturnType<typeof setInterval> }[] = [];
const tickDurations: number[] = [], rtts: number[] = [];
try {
  for (let index = 0; index < count; index++) {
    const response = await fetch(`${url}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error(`Guest failed: ${response.status}`);
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const socket = io(url, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true });
    let player: NetworkPlayer | undefined, chunks: Chunk[] = [], seq = 0;
    const pilot = new RoutePilot(), coop = new CoopPilot();
    let players: NetworkPlayer[] = [], bridges: Platform[] = [];
    let crumbling: CrumbleState[] = [], worldTick = 0;
    socket.on('chunks', (data: { chunks: Chunk[] }) => { chunks = data.chunks; });
    const welcome = await new Promise<Welcome>((resolve, reject) => {
      socket.once('connect', () => socket.emit('join', { v: 1 })); socket.once('welcome', resolve); socket.once('connect_error', reject);
    });
    player = welcome.player;
    socket.on('snapshot', (snapshot: Snapshot) => { players = snapshot.players; bridges = snapshot.bridges; crumbling = snapshot.crumbling; worldTick = snapshot.tick; player = snapshot.players.find(p => p.id === welcome.playerId); if (index === 0) tickDurations.push(snapshot.tickMs); });
    const timer = setInterval(() => {
      if (!player) return;
      const platforms = [...mechanismPlatforms(chunks, worldTick, crumbling), ...bridges];
      const gap = chunks.find(c => c.cooperation && player!.y >= c.entry.y && player!.y < c.exit.y)?.cooperation;
      const helper = players.find(p => p.helping);
      const input = (gap ? coop.input(player, platforms, players, gap, helper?.id, seq) : null) ?? pilot.input(player, platforms, seq);
      socket.emit('input', { ...input, seq: seq++, clientTime: performance.now(), push: !gap && index % 4 === 0 && seq % 45 === 0 });
      if (seq % 75 === 0) { const started = performance.now(); socket.timeout(2500).emit('ping', (err: unknown) => { if (!err) rtts.push(performance.now() - started); }); }
    }, 1000 / 30);
    bots.push({ socket, timer });
  }
  console.log(`${count} bots connected, running for ${duration}s…`);
  const startedTick = server.world.tick;
  await new Promise(resolve => setTimeout(resolve, duration * 1000));
  tickDurations.sort((a, b) => a - b); rtts.sort((a, b) => a - b);
  const summary = {
    players: server.world.online, companions: server.world.botCount, seconds: duration, effectiveHz: (server.world.tick - startedTick) / duration,
    tickP95Ms: tickDurations[Math.floor(tickDurations.length * 0.95)] ?? 0, tickMaxMs: server.world.maxTickMs,
    rttP95Ms: rtts[Math.floor(rtts.length * 0.95)] ?? 0, activeChunks: server.world.chunks.size,
    frontier: server.world.frontier, rejectedInputs: server.world.rejectedInputs, samples: tickDurations.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.players !== count || summary.effectiveHz < 27 || summary.tickP95Ms > 33.3) throw new Error('Load test failed its 30 Hz simulation budget.');
} finally {
  for (const bot of bots) { clearInterval(bot.timer); bot.socket.disconnect(); }
  await server.close(); await rm(directory, { recursive: true, force: true });
}
