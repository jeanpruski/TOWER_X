import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

test('landing, settings and responsive layout', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Toujours plus haut.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await page.getByLabel('Réduire les animations').check(); await page.getByLabel('Filtre écran rétro').check();
  await page.getByRole('button', { name: 'Sauter Espace' }).click(); await page.keyboard.press('KeyJ');
  await expect(page.getByRole('button', { name: 'Sauter J', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: 'Réglages', exact: true }).click(); await expect(page.getByLabel('Réduire les animations')).toBeChecked(); await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/landing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const mode of ['auto', 'blocked', 'n0c']) test(`two browsers join, jump, keep their record and reconnect (${mode})`, async ({ browser }) => {
  const base = mode === 'n0c' ? 'http://localhost:5187' : 'http://localhost:5181';
  const first = await browser.newContext(), second = await browser.newContext();
  if (mode === 'blocked') for (const context of [first, second]) await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    // Fail the real WebSocket connection while leaving HTTP polling available.
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(url, location.href);
        if (target.pathname.startsWith('/socket.io/')) target.port = '1';
        super(target.toString(), protocols);
      }
    };
  });
  const a = await first.newPage(), b = await second.newPage(); const errors: string[] = [];
  const webSockets: string[] = [];
  for (const page of [a, b]) page.on('websocket', socket => { if (new URL(socket.url()).pathname.startsWith('/socket.io/')) webSockets.push(socket.url()); });
  a.on('pageerror', error => errors.push(error.message)); b.on('pageerror', error => errors.push(error.message));
  for (const page of [a, b]) {
    await page.goto(`${base}/`); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click(); await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible(); await expect(page.locator('.game-canvas canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().network.transport)).toBe(mode === 'auto' ? 'websocket' : 'polling');
  }
  await expect(a.getByText('2 MAGES EN LIGNE')).toBeVisible(); await expect(b.getByText('2 MAGES EN LIGNE')).toBeVisible();
  await a.locator('.game-canvas').click(); await a.keyboard.down('Space'); await a.waitForTimeout(420); await a.keyboard.up('Space');
  await expect(a.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong')).not.toHaveText('0 m');
  await a.getByRole('button', { name: 'Retour au camp', exact: true }).click(); await expect(a.locator('.big-height')).toHaveText('0m');
  const record = await a.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong').innerText();
  await a.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
  await a.reload(); await a.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await a.getByRole('button', { name: 'Commencer la partie', exact: true }).click(); await expect(a.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect(a.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong')).toHaveText(record);
  if (mode === 'n0c') {
    const playerId = await a.evaluate(() => window.towerDebug!.inspect().player!.id);
    await first.setOffline(true);
    await expect(a.getByText('VOUS ÊTES DANS LA TOUR')).not.toBeVisible();
    await first.setOffline(false);
    await expect(a.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    await expect.poll(() => a.evaluate(() => window.towerDebug!.inspect().network.transport)).toBe('polling');
    await expect.poll(() => a.evaluate(() => window.towerDebug!.inspect().player!.id)).toBe(playerId);
    await expect(a.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong')).toHaveText(record);
    await expect(b.getByText('2 MAGES EN LIGNE')).toBeVisible();
    expect(webSockets).toEqual([]);
  }
  await a.setViewportSize({ width: 390, height: 844 }); await a.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(errors).toEqual([]);
  // Close the Socket.IO session explicitly; abandoning a polling tab otherwise
  // leaves its player online until heartbeat expiry, contaminating the next test.
  await a.getByRole('button', { name: 'Quitter la tour', exact: true }).click();
  await expect(b.getByText('1 MAGE EN LIGNE')).toBeVisible();
  await b.getByRole('button', { name: 'Quitter la tour', exact: true }).click();
  await expect.poll(async () => (await (await b.request.get(`${base}/api/world`)).json()).online).toBe(0);
  await first.close(); await second.close();
});

test('register, change appearance, logout and sign back in', async ({ page }) => {
  const email = `mage-${Date.now()}@example.test`;
  await page.goto('/'); await page.getByRole('button', { name: 'Créer un compte', exact: false }).click();
  await page.getByLabel('Nom d’aventurier').fill('Sauge Test'); await page.getByLabel('Adresse email').fill(email); await page.getByLabel('Mot de passe').fill('a-strong-password-123');
  await page.getByRole('tab', { name: 'Masques' }).click();
  await page.getByRole('button', { name: 'Masque : Corbeau', exact: true }).click();
  await page.getByRole('tab', { name: 'Coiffes' }).click(); await page.getByRole('button', { name: 'Chapeau : Tricorne', exact: true }).click();
  await page.getByRole('button', { name: 'Créer mon compte et jouer' }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click(); await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player)).toMatchObject({ mask: 'raven', hat: 'tricorn' });
  await page.getByRole('button', { name: 'Garde-robe' }).click();
  await page.getByRole('tab', { name: 'Masques' }).click();
  await expect(page.getByRole('button', { name: 'Masque : Masque astral, verrouillé' })).toBeDisabled();
  await page.getByRole('button', { name: 'Masque : Renard', exact: true }).click();
  await page.screenshot({ path: 'test-results/wardrobe-masks-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: 'Coiffes' }).click(); await page.getByRole('button', { name: 'Chapeau : Béret', exact: true }).click();
  await page.screenshot({ path: 'test-results/wardrobe-hats-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Coiffes' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/wardrobe-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Nom d’aventurier').fill('Sauge Nouvelle'); await page.getByRole('button', { name: 'Robe #bc9bea' }).click(); await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(page.getByRole('button', { name: 'Profil enregistré' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.getByLabel('Adresse email').fill(email); await page.getByLabel('Mot de passe').fill('a-strong-password-123'); await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.locator('.player-label strong')).toHaveText('Sauge Nouvelle');
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player)).toMatchObject({ mask: 'fox', hat: 'beret', color: '#bc9bea' });
});

test('gamepad hot-plug, jump, menu and keyboard focus after respawn', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { connected: false, jump: false, menu: false };
    Object.assign(window, { testPad: state });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => state.connected ? [{ connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === 0 ? state.jump : index === 9 ? state.menu : false, value: 0 })) }] : [] });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await page.evaluate(() => Object.assign((window as unknown as { testPad: object }).testPad, { connected: true }));
  await expect(page.locator('.game-topline')).toContainText('MANETTE');
  await page.evaluate(() => Object.assign((window as unknown as { testPad: object }).testPad, { jump: true }));
  await expect.poll(async () => Number.parseInt(await page.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong').innerText())).toBeGreaterThanOrEqual(7);
  await page.evaluate(() => Object.assign((window as unknown as { testPad: object }).testPad, { jump: false, menu: true }));
  await expect(page.getByRole('heading', { name: 'Une petite pause ?' })).toBeVisible();
  await page.evaluate(() => Object.assign((window as unknown as { testPad: object }).testPad, { menu: false, connected: false }));
  await page.getByRole('button', { name: 'Reprendre l’ascension' }).click();
  await page.getByRole('button', { name: 'Retour au camp', exact: true }).click(); await expect(page.locator('.big-height')).toHaveText('0m');
  await page.keyboard.down('Space'); await expect(page.locator('.big-height')).not.toHaveText('0m'); await page.keyboard.up('Space');
  await expect(page.locator('.game-topline')).toContainText('CLAVIER');
});

test('live sidebar shows five players above and below, offscreen heights and online departures', async ({ page }) => {
  const bots: Socket[] = [];
  try {
    await page.goto('/'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    await page.evaluate(() => window.towerDebug!.teleportToChunk(10));
    await expect(page.locator('.big-height')).toHaveText('200m');
    for (const chunkIndex of [0, 2, 4, 6, 8, 12, 14, 16, 18, 20]) {
      const response = await fetch('http://127.0.0.1:3101/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(response.status).toBe(200);
      const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
      const socket = io('http://127.0.0.1:3101', { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true }); bots.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => socket.emit('join', { v: 1 }));
        socket.once('welcome', () => { socket.emit('devTeleport', { v: 1, chunkIndex }); resolve(); });
        socket.once('connect_error', reject);
      });
    }
    const panel = page.getByRole('region', { name: 'Autour de vous' });
    await expect(panel.getByText('11 MAGES EN LIGNE')).toBeVisible();
    await expect(panel.locator('[data-relation="above"]')).toHaveCount(5);
    await expect(panel.locator('[data-relation="below"]')).toHaveCount(5);
    await expect(panel.locator('[data-relation="self"]')).toHaveCount(1);
    await expect(panel.locator('.nearby-heading')).toContainText('#6 / 11');
    await expect(panel.locator('[data-relation="above"] .nearby-height')).toHaveText(['400 m', '360 m', '320 m', '280 m', '240 m']);
    await expect(panel.locator('[data-relation="above"] .nearby-gap')).toHaveText(['+200 m', '+160 m', '+120 m', '+80 m', '+40 m']);
    await expect(panel.locator('[data-relation="below"] .nearby-gap')).toHaveText(['−40 m', '−80 m', '−120 m', '−160 m', '−200 m']);
    await page.screenshot({ path: 'test-results/plague-masks-standings-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/plague-masks-standings-mobile.png', fullPage: true });
    bots.at(-1)!.disconnect();
    await expect(panel.getByText('10 MAGES EN LIGNE')).toBeVisible();
    await expect(panel.locator('[data-relation="above"]')).toHaveCount(4);
    await expect(panel.locator('.nearby-heading')).toContainText('#5 / 10');
  } finally { for (const bot of bots) bot.disconnect(); }
});
