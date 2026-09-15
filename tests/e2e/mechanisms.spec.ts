import { expect, test, type Page } from '@playwright/test';
import { RoutePilot } from '@tower/game-core';
import { neutralInput, type NetworkPlayer, type Platform } from '@tower/shared';
test.use({ baseURL: 'http://localhost:5185' });

async function join(page: Page) {
  await page.goto('http://localhost:5185'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
}
async function locate(page: Page, index: number) {
  await page.evaluate(index => window.towerDebug!.teleportToChunk(index), index);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(index * 216);
}
async function steer(page: Page, reached: (body: NetworkPlayer) => boolean, choose?: (body: NetworkPlayer, platforms: Platform[], tick: number) => ReturnType<typeof neutralInput>) {
  const pilot = new RoutePilot(), keys = new Set<string>();
  await page.locator('.game-canvas').focus();
  try {
    for (let tick = 0; tick < 320; tick++) {
      const state = await page.evaluate(() => window.towerDebug!.inspect());
      if (reached(state.player!)) return;
      const input = choose ? choose(state.player!, state.platforms, tick) : pilot.input(state.player!, state.platforms, tick);
      for (const [key, down] of [['ArrowLeft', input.moveX < 0], ['ArrowRight', input.moveX > 0], ['Space', input.jump]] as const) {
        if (keys.has(key) === down) continue;
        if (down) { keys.add(key); await page.keyboard.down(key); } else { keys.delete(key); await page.keyboard.up(key); }
      }
      await page.waitForTimeout(34);
    }
    throw new Error('Keyboard route did not reach its target');
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

// The beginner's extra footholds can be skipped with a full jump. Release early to
// intentionally land on the mechanism being tested, instead of continuing the ascent.
async function landOn(page: Page, id: string) {
  const target = await page.evaluate(id => window.towerDebug!.inspect().platforms.find(p => p.id === id)!, id);
  const pilot = new RoutePilot();
  await steer(page, body => body.grounded && Math.abs(body.y - target.y) < .1, (body, platforms, tick) => {
    const input = pilot.input(body, platforms, tick);
    if (!body.grounded && body.vy > 0 && body.y >= target.y + 5) input.jump = false;
    return input;
  });
}

test('moving platforms carry a rider and a fragile floor collapses consistently for two browsers', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await join(page); await locate(page, 1);
  await expect(page.locator('.game-frame')).toHaveClass(/crt/); await expect(page.locator('.game-frame')).toHaveClass(/curved/);
  await landOn(page, '1:1');
  await page.waitForTimeout(200);
  const positions: number[] = [], offsets: number[] = [];
  for (let i = 0; i < 12; i++) {
    const state = await page.evaluate(() => window.towerDebug!.inspect());
    const platform = state.platforms.find(p => p.id === '1:1')!;
    expect(state.player!.grounded).toBe(true); expect(state.player!.y).toBe(258);
    positions.push(state.player!.x); offsets.push(state.player!.x - platform.x);
    await page.waitForTimeout(140);
  }
  expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(4);
  expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(3);
  await page.screenshot({ path: 'test-results/moving-platform-retro.png', fullPage: true });
  const observer = await browser.newContext();
  try {
    const remote = await observer.newPage(); remote.on('pageerror', error => errors.push(error.message));
    await join(remote); await locate(remote, 2); await locate(page, 2);
    await landOn(page, '2:1');
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().crumbling.some(s => s.platformId === '2:1'))).toBe(true);
    const breakTick = await page.evaluate(() => window.towerDebug!.inspect().crumbling.find(s => s.platformId === '2:1')!.breakTick);
    await expect.poll(() => remote.evaluate(() => window.towerDebug!.inspect().crumbling.find(s => s.platformId === '2:1')?.breakTick)).toBe(breakTick);
    await expect(page.locator('.world-label[data-kind="warning"]').filter({ hasText: 'Ça craque !' })).toBeVisible();
    await page.screenshot({ path: 'test-results/crumbling-warning.png', fullPage: true });
    await expect.poll(() => remote.evaluate(() => window.towerDebug!.inspect().platforms.find(p => p.id === '2:1')?.disabled)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBeLessThan(467);
    await expect(remote.locator('.world-label[data-kind="warning"]').filter({ hasText: 'Dalle absente' })).toBeVisible();
    await remote.screenshot({ path: 'test-results/crumbling-gap.png', fullPage: true });
    const absentLabel = remote.locator('.world-label[data-kind="warning"]').filter({ hasText: 'Dalle absente' });
    await expect(absentLabel).toHaveText(/Dalle absente · [1-5] s/);
    await expect.poll(() => absentLabel.evaluate(label => label.scrollWidth <= label.clientWidth)).toBe(true);
    await remote.setViewportSize({ width: 390, height: 844 });
    await expect(absentLabel).toBeVisible();
    await expect.poll(() => absentLabel.evaluate(label => label.scrollWidth <= label.clientWidth)).toBe(true);
    await remote.screenshot({ path: 'test-results/crumbling-gap-mobile.png' });
    await expect.poll(() => remote.evaluate(() => window.towerDebug!.inspect().platforms.find(p => p.id === '2:1')?.disabled === true), { timeout: 8000 }).toBe(false);
    await remote.setViewportSize({ width: 390, height: 844 });
    expect(await remote.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await remote.screenshot({ path: 'test-results/mechanisms-mobile.png', fullPage: true });
  } finally { await observer.close(); }
  expect(errors).toEqual([]);
});

test('an optional spring bounces the player above a normal jump using only movement', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await join(page); await locate(page, 4);
  await landOn(page, '4:1');
  await steer(page, body => body.spring > 0, (body, _, tick) => ({ ...neutralInput(tick), moveX: body.x > 37 ? -1 : 0, jump: body.grounded ? !body.jumpHeld : body.jumpHeld }));
  await page.screenshot({ path: 'test-results/spring-bounce.png', fullPage: true });
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y), { intervals: [34] }).toBeGreaterThan(934 + 115);
  expect(await page.evaluate(() => window.towerDebug!.inspect().player!.boots)).toBe(false);
  expect(errors).toEqual([]);
});

test('retro and fish-eye migrate old defaults once and preserve later opt-outs on the account', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('legacy-settings-fixture')) {
      localStorage.setItem('tower.settings', JSON.stringify({ sound: 22, crt: false, curvedScreen: false }));
      localStorage.setItem('legacy-settings-fixture', 'yes');
    }
  });
  await join(page);
  await expect(page.locator('.game-frame')).toHaveClass(/crt/); await expect(page.locator('.game-frame')).toHaveClass(/curved/);
  await page.getByRole('button', { name: 'Menu du jeu' }).click(); await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await expect(page.getByLabel('Volume des effets')).toHaveValue('22');
  await page.getByLabel('Filtre écran rétro', { exact: false }).uncheck(); await page.getByLabel('Écran bombé', { exact: false }).uncheck();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.locator('.game-frame')).not.toHaveClass(/crt/); await expect(page.locator('.game-frame')).not.toHaveClass(/curved/);
  const saved = await (await page.request.get('/api/auth/me')).json();
  expect(saved.settings).toMatchObject({ crt: false, curvedScreen: false, screenDefaultsVersion: 1, sound: 22 });
  await page.reload(); await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect(page.locator('.game-frame')).not.toHaveClass(/crt/); await expect(page.locator('.game-frame')).not.toHaveClass(/curved/);
});

test('visible spikes send a real jump back to camp and preserve the record', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await join(page); await locate(page, 0);
  await expect(page.locator('.stat-row').filter({ hasText: 'Dernier camp' }).locator('strong')).toHaveText('0 m');
  await locate(page, 12);
  const warning = page.locator('.world-label[data-id="spikes:12:0"]');
  await expect(warning).toContainText('Pics !');
  await expect(page.locator('.game-frame')).toHaveClass(/crt/); await expect(page.locator('.game-frame')).toHaveClass(/curved/);
  await page.screenshot({ path: 'test-results/spikes-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(warning).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/spikes-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.protection)).toBe(0);
  await landOn(page, '12:1');
  const before = Number.parseInt(await page.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong').innerText());
  // A short jump from the right pillar reaches this optional trapped cornice.
  await steer(page, body => body.y < 100, (body, _, tick) => ({ ...neutralInput(tick), moveX: body.x < 284 ? 1 : 0, jump: tick === 1 || tick === 2 }));
  await expect(page.locator('.action-feedback')).toContainText('Aïe, les pics !');
  await expect(page.locator('.big-height')).toHaveText('0m');
  expect(Number.parseInt(await page.locator('.stat-row').filter({ hasText: 'Record personnel' }).locator('strong').innerText())).toBeGreaterThanOrEqual(before);
  await page.screenshot({ path: 'test-results/spikes-return-to-camp.png', fullPage: true });
  expect(errors).toEqual([]);
});
