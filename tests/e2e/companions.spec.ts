import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { BOT_COLOR, type Welcome } from '@tower/shared';

test('a solo visitor sees three climbing companions and collects a visible feather using movement inputs', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5182'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Autour de vous' });
  await expect(panel.getByText('1 MAGE EN LIGNE')).toBeVisible();
  await expect(panel.getByText('+ 3 BOTS COMPAGNONS')).toBeVisible();
  await expect(panel.locator('.bot-badge')).toHaveCount(3);
  await expect.poll(() => page.evaluate(color => { const bots = window.towerDebug!.inspect().players.filter(p => p.isBot); return bots.length === 3 && bots.every(p => p.color === color && p.mask === 'ivory'); }, BOT_COLOR)).toBe(true);
  await expect(page.locator('.push-status')).toContainText('protégée');
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().players.some(p => p.isBot && p.y > 36))).toBe(true);
  await page.screenshot({ path: 'test-results/companions-bonuses-desktop.png', fullPage: true });
  // Real input actions drive the predicted client and authoritative server; no bonus is granted by a fixture.
  const collected = await page.evaluate(async () => {
    const pressed = new Set<string>();
    const key = (code: string, down: boolean) => {
      if (pressed.has(code) === down) return;
      down ? pressed.add(code) : pressed.delete(code);
      document.body.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
    };
    try {
      for (let tick = 0; tick < 350; tick++) {
        const state = window.towerDebug!.inspect(), body = state.player!;
        if (body.feather > 0) return true;
        const feather = state.pickups.find(p => p.kind === 'feather');
        if (!feather) return false;
        const targetX = feather.x;
        key('ArrowLeft', targetX < body.x - 3); key('ArrowRight', targetX > body.x + 3);
        // Line up below the first bonus and release early so the new rest ledge
        // above it does not catch a full-height jump before the feather platform.
        key('Space', body.grounded ? Math.abs(targetX - body.x) < 3 && !body.jumpHeld : body.jumpHeld && body.y < feather.y - 3);
        await new Promise(resolve => setTimeout(resolve, 34));
      }
      return false;
    } finally { for (const code of [...pressed]) key(code, false); }
  });
  expect(collected).toBe(true);
  await expect(page.locator('[data-bonus="feather"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('.game-frame [data-bonus="feather"] small')).toContainText('s');
  await expect(page.locator('.game-frame .push-meter')).toBeVisible();
  await expect(page.locator('.action-feedback')).toContainText('Plume légère');
  await page.screenshot({ path: 'test-results/feather-active-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-bonus="feather"]').click();
  await expect(page.locator('.game-frame .hud-bonus-detail')).toContainText('gravité réduite');
  expect(await page.locator('.game-frame').evaluate(frame => {
    const outer = frame.getBoundingClientRect(), hud = frame.querySelector('.action-hud')!.getBoundingClientRect(), viewport = frame.querySelector('.game-canvas')!.getBoundingClientRect();
    return hud.left >= outer.left && hud.right <= outer.right && hud.top >= outer.top && hud.bottom <= viewport.top + 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/companions-bonuses-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Retour au camp', exact: true }).click();
  await expect(page.locator('[data-bonus="feather"]')).toHaveAttribute('data-active', 'false');
  expect(errors).toEqual([]);
});

test('push gesture produces a confirmed hit, cooldown and a distinct miss message', async ({ page }) => {
  let companion: Socket | undefined;
  try {
    await page.goto('http://localhost:5182'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    const response = await fetch('http://127.0.0.1:3102/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    companion = io('http://127.0.0.1:3102', { transports: ['websocket'], extraHeaders: { cookie: response.headers.get('set-cookie')!.split(';')[0]! }, forceNew: true });
    const socket = companion;
    const welcome = await new Promise<Welcome>((resolve, reject) => { socket.once('connect', () => socket.emit('join', { v: 1 })); socket.once('welcome', resolve); socket.once('connect_error', reject); });
    await page.evaluate(() => window.towerDebug!.teleportToChunk(2));
    socket.emit('devTeleport', { v: 1, chunkIndex: 2 });
    // Both arrivals are protected independently. Wait for the remote interpolation too,
    // and for the initial overlapping bodies to separate before choosing the direction.
    await expect.poll(() => page.evaluate(id => {
      const { player, players } = window.towerDebug!.inspect(); const target = players.find(p => p.id === id);
      return Boolean(player && target && player.protection === 0 && target.protection === 0 && player.grounded && target.grounded && Math.abs(player.y - target.y) < 1 && Math.abs(player.x - target.x) >= 8 && Math.abs(player.x - target.x) <= 22);
    }, welcome.playerId)).toBe(true);
    const direction = await page.evaluate(id => {
      const { player, players } = window.towerDebug!.inspect();
      return players.find(p => p.id === id)!.x >= player!.x ? 'ArrowRight' : 'ArrowLeft';
    }, welcome.playerId);
    await page.keyboard.down(direction); await page.waitForTimeout(55); await page.keyboard.up(direction);
    await expect(page.locator('.push-status')).toContainText('Poussée prête');
    await page.keyboard.press('KeyE');
    await expect(page.locator('.action-feedback')).toHaveText('Poussée réussie !');
    await expect(page.locator('.push-status')).toContainText('Recharge');
    await page.screenshot({ path: 'test-results/push-impact.png', fullPage: true });
    socket.disconnect();
    await expect(page.locator('.push-status')).toContainText('Poussée prête');
    await page.keyboard.press('KeyE');
    await expect(page.locator('.action-feedback')).toHaveText('Personne à portée');
  } finally { companion?.disconnect(); }
});
