import { expect, test, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Welcome } from '@tower/shared';

async function checkLayout(page: Page, minimumFont: number) {
  // ResizeObserver and Phaser apply the new dimensions on the next frame.
  // A passing bot may temporarily leave only one label on a narrow screen.
  await expect.poll(() => page.locator('.world-labels').evaluate((root, minimumFont) => {
    const bounds = root.getBoundingClientRect();
    const labels = [...root.querySelectorAll<HTMLElement>('.world-label')];
    const boxes = labels.map(label => label.getBoundingClientRect());
    return {
      populated: labels.length > 0,
      readable: labels.every(label => Number.parseFloat(getComputedStyle(label).fontSize) >= minimumFont && label.scrollWidth <= label.clientWidth),
      inside: boxes.every(b => b.left >= bounds.left && b.right <= bounds.right && b.top >= bounds.top && b.bottom <= bounds.bottom),
      separated: boxes.every((b, i) => boxes.slice(i + 1).every(other => b.right <= other.left || b.left >= other.right || b.bottom <= other.top || b.top >= other.bottom)),
      aboveFilter: Number(getComputedStyle(root).zIndex) > Number(getComputedStyle(root.closest('.game-frame')!, '::after').zIndex),
    };
  }, minimumFont)).toMatchObject({ populated: true, readable: true, inside: true, separated: true, aboveFilter: true });
}

test('world labels stay crisp above fish-eye and scanlines, resize, and survive a crowd and rejoining', async ({ page }) => {
  const sockets: Socket[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const connect = async (named = false) => {
    const response = await fetch(`http://127.0.0.1:3104/api/auth/${named ? 'register' : 'guest'}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(named ? { displayName: 'Alexandre des Bois', email: `labels-${Date.now()}@example.test`, password: 'a-strong-password-123', mask: 'ivory', hat: 'top-hat' } : {}),
    });
    expect(response.ok).toBe(true);
    const socket = io('http://127.0.0.1:3104', { transports: ['websocket'], extraHeaders: { cookie: response.headers.get('set-cookie')!.split(';')[0]! }, forceNew: true });
    sockets.push(socket);
    return new Promise<Welcome>((resolve, reject) => {
      socket.once('connect', () => socket.emit('join', { v: 1 }));
      socket.once('welcome', welcome => { socket.emit('devTeleport', { v: 1, chunkIndex: 0 }); resolve(welcome); });
      socket.once('connect_error', reject);
    });
  };
  try {
    await page.goto('http://localhost:5184'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    // The cooperation scenario has already advanced this temporary world's frontier.
    // Bring everyone to the same entry ledge, independently of the current spawn camp.
    await page.evaluate(() => window.towerDebug!.teleportToChunk(0));
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(0);
    const named = await connect(true);
    await expect(page.getByText('2 MAGES EN LIGNE', { exact: true })).toBeVisible();
    const name = page.locator(`.world-label[data-id="player:${named.playerId}"]`);
    await expect(name).toHaveText('Alexandre des Bois');
    await expect(page.locator('.world-label[data-kind="pickup"]').first()).toBeVisible();
    await expect(page.locator('.world-labels')).toHaveAttribute('data-curved', 'true');
    await expect(page.locator('.game-frame')).toHaveClass(/crt/);
    await checkLayout(page, 14);
    await page.screenshot({ path: 'test-results/readable-labels-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(name).toBeVisible();
    await checkLayout(page, 12);
    await page.screenshot({ path: 'test-results/readable-labels-mobile.png', fullPage: true });

    await page.getByRole('button', { name: 'Menu du jeu' }).click(); await page.getByRole('button', { name: 'Réglages', exact: true }).click();
    await page.getByLabel('Écran bombé', { exact: false }).uncheck();
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(page.locator('.world-labels')).toHaveAttribute('data-curved', 'false');
    await expect(name).toBeVisible(); await checkLayout(page, 12);
    await page.getByRole('button', { name: 'Menu du jeu' }).click(); await page.getByRole('button', { name: 'Réglages', exact: true }).click();
    await page.getByLabel('Écran bombé', { exact: false }).check();
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });

    for (let i = 0; i < 7; i++) await connect();
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().players.length)).toBeGreaterThan(8);
    await expect.poll(() => page.locator('.world-label[data-kind="player"]').count()).toBeGreaterThanOrEqual(3);
    await checkLayout(page, 14);
    await page.screenshot({ path: 'test-results/readable-labels-crowd.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await checkLayout(page, 12);
    await page.screenshot({ path: 'test-results/readable-labels-crowd-mobile.png', fullPage: true });

    await page.getByRole('button', { name: 'Quitter la tour', exact: false }).click();
    await expect(page.locator('.world-labels')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    await page.evaluate(() => window.towerDebug!.teleportToChunk(0));
    await expect(page.locator('.world-labels')).toHaveCount(1);
    await expect(page.locator('.world-label').first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally { for (const socket of sockets) socket.disconnect(); }
});
