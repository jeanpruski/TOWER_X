import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import { neutralInput, type Snapshot, type Welcome } from '@tower/shared';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const mode of ['polling', 'websocket', 'n0c']) test(`${mode} with 150–230 ms round trips keeps jumps and position updates responsive`, async ({ page }) => {
  const transport = mode === 'websocket' ? 'websocket' : 'polling';
  const webSockets: string[] = [];
  page.on('websocket', socket => { if (new URL(socket.url()).pathname.startsWith('/socket.io/')) webSockets.push(socket.url()); });
  if (mode === 'polling') await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(url, location.href);
        if (target.pathname.startsWith('/socket.io/')) target.port = '1';
        super(target.toString(), protocols);
      }
    };
  });
  let requests = 0;
  if (transport === 'polling') await page.route('**/socket.io/**', async route => {
    const jitter = requests++ % 5 === 0 ? 40 : 0;
    await new Promise(resolve => setTimeout(resolve, 75 + jitter));
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 75 + jitter));
    await route.fulfill({ response });
  });
  else await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const delayed = (send: (data: string | Buffer) => void) => {
      let deadline = 0, count = 0;
      return (data: string | Buffer) => {
        // Jitter must preserve WebSocket's in-order delivery in each direction.
        deadline = Math.max(Date.now() + 75 + (count++ % 5 === 0 ? 40 : 0), deadline + 1);
        const timer = setTimeout(() => { timers.delete(timer); send(data); }, deadline - Date.now());
        timers.add(timer);
      };
    };
    socket.onMessage(delayed(data => server.send(data)));
    server.onMessage(delayed(data => socket.send(data)));
    socket.onClose(() => { for (const timer of timers) clearTimeout(timer); server.close(); });
    server.onClose(() => { for (const timer of timers) clearTimeout(timer); socket.close(); });
  });
  await page.goto(mode === 'n0c' ? 'http://localhost:5187/' : 'http://localhost:5186/');
  await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click();
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().network.transport)).toBe(transport);
  await page.locator('.game-canvas').click();
  const samples = page.evaluate(async () => {
    const readings = [];
    for (let i = 0; i < 180; i++) {
      const { player, network } = window.towerDebug!.inspect();
      readings.push({ ...network, y: player!.y });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return readings;
  });
  for (let jump = 0; jump < 5; jump++) {
    await page.keyboard.down('Space'); await page.waitForTimeout(500); await page.keyboard.up('Space');
    await page.waitForTimeout(1000);
  }
  const readings = await samples;
  const metrics = {
    maxPending: Math.max(...readings.map(r => r.pending)),
    maxSnapshotAge: Math.round(Math.max(...readings.map(r => r.snapshotAge))),
    maxCorrection: readings.at(-1)!.maxCorrection,
    hardCorrections: readings.at(-1)!.hardCorrections,
    maxHeight: Math.max(...readings.map(r => r.y)),
  };
  console.log(`Delayed ${mode}:`, JSON.stringify(metrics));
  await test.info().attach('network-metrics', { body: JSON.stringify({ metrics, readings }, null, 2), contentType: 'application/json' });
  expect(metrics.maxHeight).toBeGreaterThan(40);
  expect(metrics.maxPending).toBeLessThan(24);
  expect(metrics.maxSnapshotAge).toBeLessThan(400);
  expect(metrics.maxCorrection).toBeLessThan(40);
  expect(metrics.hardCorrections).toBe(0);
  if (mode === 'n0c') expect(webSockets).toEqual([]);
  await page.getByRole('button', { name: 'Quitter la tour', exact: true }).click();
});

test('remote walking stays smooth with delayed N0C polling', async ({ page }) => {
  let requests = 0;
  await page.route('**/socket.io/**', async route => {
    const jitter = requests++ % 5 === 0 ? 40 : 0;
    await new Promise(resolve => setTimeout(resolve, 75 + jitter));
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 75 + jitter));
    await route.fulfill({ response });
  });
  await page.goto('http://localhost:5187/');
  await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click();
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  const response = await page.request.post('http://127.0.0.1:3107/api/auth/guest', { data: {} });
  expect(response.ok()).toBe(true);
  const socket = io('http://127.0.0.1:3107', { transports: ['polling'], extraHeaders: { cookie: response.headers()['set-cookie']!.split(';')[0]! }, forceNew: true, reconnection: false });
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const welcome = await new Promise<Welcome>((resolve, reject) => {
      socket.once('connect', () => socket.emit('join', { v: 1 }));
      socket.once('welcome', resolve); socket.once('connect_error', reject);
    });
    let direction = 1, sequence = 0;
    socket.on('snapshot', (snapshot: Snapshot) => {
      const player = snapshot.players.find(p => p.id === welcome.playerId);
      if (player && player.x > 250) direction = -1;
      if (player && player.x < 70) direction = 1;
    });
    timer = setInterval(() => socket.emit('input', { ...neutralInput(sequence++), moveX: direction }), 1000 / 30);
    await expect.poll(() => page.evaluate(id => window.towerDebug!.inspect().players.some(p => p.id === id), welcome.playerId)).toBe(true);
    await page.waitForTimeout(2500);
    const readings = await page.evaluate(id => new Promise<{ at: number; x: number; vx: number; delay: number }[]>(resolve => {
      const samples: { at: number; x: number; vx: number; delay: number }[] = [];
      const start = performance.now();
      const sample = () => {
        const { players, network } = window.towerDebug!.inspect();
        const player = players.find(p => p.id === id)!;
        samples.push({ at: performance.now(), x: player.x, vx: player.vx, delay: network.interpolationDelay });
        if (performance.now() - start >= 8000) resolve(samples);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }), welcome.playerId);
    const steps = readings.slice(1).map((p, i) => ({ dx: p.x - readings[i]!.x, dt: p.at - readings[i]!.at, p, previous: readings[i]! }));
    // Ignore actual turns and long browser scheduling gaps when measuring movement.
    const moving = steps.filter(s => s.p.x > 90 && s.p.x < 230 && Math.abs(s.p.vx) > 90 && s.p.vx === s.previous.vx && s.dt >= 8 && s.dt < 40);
    const metrics = {
      movingFrames: moving.length,
      frozenFrames: moving.filter(s => Math.abs(s.dx) < 0.01).length,
      maxSpeed: Math.max(...moving.map(s => Math.abs(s.dx) / s.dt * 1000)),
      maxFrameGap: Math.max(...steps.map(s => s.dt)),
      interpolationDelay: readings.at(-1)!.delay,
    };
    console.log('Remote delayed N0C:', JSON.stringify(metrics));
    await test.info().attach('remote-network-metrics', { body: JSON.stringify({ metrics, readings }, null, 2), contentType: 'application/json' });
    expect(metrics.movingFrames).toBeGreaterThan(100);
    expect(metrics.frozenFrames / metrics.movingFrames).toBeLessThan(0.1);
    expect(metrics.maxSpeed).toBeLessThan(180); // Walking is 108 px/s; no packet-sized leaps.
    await page.getByRole('button', { name: 'Quitter la tour', exact: true }).click();
  } finally {
    clearInterval(timer); socket.disconnect();
  }
});
