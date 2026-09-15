import { test, expect, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choisissez votre départ.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commencer la partie', exact: true })).toBeEnabled();
  return (await (await page.request.get('/api/auth/me')).json()).profile as { id: string };
}
async function begin(page: Page) {
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player?.id)).toBeTruthy();
}
async function moveTo(page: Page, index: number) {
  await page.evaluate(index => window.towerDebug!.teleportToChunk(index), index);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player?.y)).toBe(index * 216);
}

test('waits for a start decision, updates the roster, and joins the selected player at their latest height', async ({ page, browser }) => {
  const first = await browser.newContext(), second = await browser.newContext();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    const self = await prepare(page);
    await expect(page.getByText('Aucun autre joueur connecté pour le moment.', { exact: false })).toBeVisible();
    expect((await (await page.request.get('/api/world')).json()).online).toBe(0);
    await expect(page.locator('.game-frame')).toHaveCount(0);
    const a = await first.newPage(), b = await second.newPage();
    const chosen = await prepare(a); await begin(a); await moveTo(a, 5);
    await prepare(b); await begin(b); await moveTo(b, 20);
    const card = page.locator(`[data-entry-player-id="${chosen.id}"]`);
    await expect(page.locator('[data-entry-player-id]')).toHaveCount(2);
    await expect(page.locator(`[data-entry-player-id="${self.id}"]`)).toHaveCount(0);
    await expect(card).toContainText('100 m'); await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    expect((await (await page.request.get('/api/world')).json()).online).toBe(2);
    await moveTo(a, 10); await expect(card).toContainText('200 m');
    await page.screenshot({ path: 'test-results/start-choice-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/start-choice-mobile.png' });
    await begin(page);
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player?.y)).toBe(10 * 216);
    await expect.poll(() => page.evaluate(id => window.towerDebug!.inspect().players.some(p => p.id === id), chosen.id)).toBe(true);
    expect((await (await page.request.get('/api/auth/me')).json()).profile.lastCamp).toBe(10);
    expect(errors).toEqual([]);
  } finally { await first.close(); await second.close(); }
});

test('keeps a fresh player at the base and resumes the saved camp only after explicit confirmation', async ({ page, browser }) => {
  const other = await browser.newContext();
  try {
    const front = await other.newPage(); await prepare(front); await begin(front); await moveTo(front, 20);
    await prepare(page);
    await expect(page.getByRole('button', { name: /Commencer au pied de la tour/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    expect((await (await page.request.get('/api/world')).json()).online).toBe(1);
    await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await begin(page);
    await expect(page.locator('.big-height')).toHaveText('0m');
    await moveTo(page, 5);
    await expect(page.locator('.stat-row').filter({ hasText: 'Dernier camp' }).locator('strong')).toHaveText('100 m');
    await page.getByRole('button', { name: 'Quitter la tour', exact: true }).click();
    await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click();
    await expect(page.getByRole('button', { name: /Reprendre à mon camp/ })).toContainText('100 m');
    await expect(page.locator('.game-frame')).toHaveCount(0);
    await begin(page); await expect(page.locator('.big-height')).toHaveText('100m');
  } finally { await other.close(); }
});

test('requires another choice after a departure and lets the controller start without an accidental jump', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const buttons = Array(16).fill(false); Object.assign(window, { startPad: buttons });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, axes: [0, 0], buttons: buttons.map(pressed => ({ pressed, value: Number(pressed) })) }] });
  });
  const other = await browser.newContext();
  try {
    const front = await other.newPage(); const profile = await prepare(front); await begin(front);
    await prepare(page);
    await page.locator(`[data-entry-player-id="${profile.id}"]`).click();
    await other.close();
    await expect(page.getByText('Le joueur sélectionné est parti.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commencer la partie', exact: true })).toBeDisabled();
    const own = page.getByRole('button', { name: /Commencer au pied de la tour/ }); await own.focus();
    const button = async (index: number, pressed: boolean) => page.evaluate(({index,pressed}) => (window as unknown as { startPad: boolean[] }).startPad[index] = pressed, {index,pressed});
    await button(0, true); await expect(own).toHaveAttribute('aria-pressed', 'true'); await button(0, false); await page.waitForTimeout(80);
    await button(13, true); await expect(page.getByRole('button', { name: 'Commencer la partie', exact: true })).toBeFocused(); await button(13, false); await page.waitForTimeout(80);
    await button(0, true);
    await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    await expect(page.locator('.game-topline')).toContainText('MANETTE');
    await page.waitForTimeout(350);
    await expect(page.locator('.big-height')).toHaveText('0m');
    await button(0, false); await page.waitForTimeout(100); await button(0, true);
    await expect(page.locator('.big-height')).not.toHaveText('0m'); await button(0, false);
  } finally { await other.close(); }
});

test('returns to the choice screen when a selected player leaves after the last roster refresh', async ({ page, browser }) => {
  const other = await browser.newContext();
  try {
    const front = await other.newPage(); const target = await prepare(front); await begin(front);
    await prepare(page);
    const roster = await (await page.request.get('/api/world/players')).json();
    await page.route('**/api/world/players', route => route.fulfill({ json: roster }));
    await page.locator(`[data-entry-player-id="${target.id}"]`).click();
    await other.close();
    await expect.poll(async () => (await (await page.request.get('/api/world')).json()).online).toBe(0);
    await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(page.getByText('Ce joueur n’est plus disponible.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choisissez votre départ.' })).toBeVisible();
    await expect(page.locator('.game-frame')).toHaveCount(0);
    await page.unroute('**/api/world/players');
    await page.getByRole('button', { name: /Commencer au pied de la tour/ }).click();
    await begin(page); await expect(page.locator('.big-height')).toHaveText('0m');
  } finally { await other.close(); }
});
