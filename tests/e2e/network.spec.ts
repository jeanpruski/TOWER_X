import { test, expect } from '@playwright/test';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const transport of ['polling', 'websocket']) test(`${transport} with 150–230 ms round trips keeps jumps and position updates responsive`, async ({ page }) => {
  if (transport === 'polling') await page.addInitScript(() => {
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
  await page.goto('http://localhost:5186/');
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
  console.log(`Delayed ${transport}:`, JSON.stringify(metrics));
  await test.info().attach('network-metrics', { body: JSON.stringify({ metrics, readings }, null, 2), contentType: 'application/json' });
  expect(metrics.maxHeight).toBeGreaterThan(40);
  expect(metrics.maxPending).toBeLessThan(24);
  expect(metrics.maxSnapshotAge).toBeLessThan(400);
  expect(metrics.maxCorrection).toBeLessThan(40);
  expect(metrics.hardCorrections).toBe(0);
});
