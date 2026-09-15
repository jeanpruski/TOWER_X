import { test, expect, type Page, type Locator } from '@playwright/test';

async function padButton(page: Page, index: number, held = 90) {
  await page.evaluate(index => (window as unknown as { menuPad: { buttons: boolean[] } }).menuPad.buttons[index] = true, index);
  await page.waitForTimeout(held);
  await page.evaluate(index => (window as unknown as { menuPad: { buttons: boolean[] } }).menuPad.buttons[index] = false, index);
  await page.waitForTimeout(80);
}
async function focusWithPad(page: Page, target: Locator) {
  for (let i = 0; i < 22; i++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await padButton(page, 13);
  }
  await expect(target).toBeFocused();
}
async function connectPad(page: Page) {
  await page.addInitScript(() => {
    const pad = { buttons: Array(16).fill(false), axes: [0, 0] };
    Object.assign(window, { menuPad: pad });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, axes: pad.axes, buttons: pad.buttons.map(pressed => ({ pressed, value: Number(pressed) })) }] });
  });
}
test('controller navigates settings, changes volume and toggles, cancels remapping and returns without stray actions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await connectPad(page);
  await page.goto('/'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect(page.locator('.game-topline')).toContainText('MANETTE');
  await padButton(page, 9);
  await expect(page.getByRole('dialog')).toBeVisible();
  await focusWithPad(page, page.getByRole('button', { name: 'Réglages', exact: true })); await padButton(page, 0);
  const slider = page.getByRole('slider', { name: 'Volume des effets' });
  await focusWithPad(page, slider); await padButton(page, 14);
  await expect(slider).toHaveValue('40');
  await expect(page.locator('.slider-row small')).toHaveText('40 %');
  // The analogue stick supports the same adjustment as the directional pad.
  await page.evaluate(() => (window as unknown as { menuPad: { axes: number[] } }).menuPad.axes[0] = 0.8);
  await expect(slider).toHaveValue('45');
  await page.evaluate(() => (window as unknown as { menuPad: { axes: number[] } }).menuPad.axes[0] = 0);
  const curve = page.getByRole('checkbox', { name: 'Écran bombé', exact: false });
  await focusWithPad(page, curve); await padButton(page, 0); await expect(curve).not.toBeChecked();
  const crt = page.getByRole('checkbox', { name: 'Filtre écran rétro', exact: false });
  await focusWithPad(page, crt); await padButton(page, 0); await expect(crt).not.toBeChecked();
  await focusWithPad(page, page.locator('.remap').filter({ hasText: 'Gauche' })); await padButton(page, 0);
  await expect(page.locator('.remap.listening')).toHaveCount(1);
  await padButton(page, 1); await expect(page.locator('.remap.listening')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/controller-settings.png' });
  await padButton(page, 9, 350);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.game-frame')).not.toHaveClass(/curved/);
  await expect(page.locator('.game-frame')).not.toHaveClass(/crt/);
  expect((await (await page.request.get('/api/auth/me')).json()).settings).toMatchObject({ sound: 45, curvedScreen: false, crt: false });
  await padButton(page, 0); await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('return to the foot requires confirmation, preserves records and resumes at zero after reload', async ({ page }) => {
  await connectPad(page);
  await page.goto('/'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await page.evaluate(() => window.towerDebug!.teleportToChunk(5));
  await expect(page.locator('.big-height')).toHaveText('100m');
  await expect(page.locator('.stat-row').filter({ hasText: 'Dernier camp' })).toContainText('100 m');
  const before = (await (await page.request.get('/api/auth/me')).json()).profile;
  await page.getByRole('button', { name: 'Retour au pied de la tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repartir tout en bas ?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuer l’ascension', exact: true })).toBeFocused();
  await padButton(page, 1);
  await expect(page.locator('.big-height')).toHaveText('100m');
  await page.getByRole('button', { name: 'Menu du jeu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retour au pied de la tour', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/return-base-confirmation-mobile.png' });
  await focusWithPad(page, page.getByRole('button', { name: 'Confirmer le retour à 0 m', exact: true }));
  await padButton(page, 0, 400);
  await expect(page.locator('.big-height')).toHaveText('0m');
  await expect(page.locator('.game-frame .action-feedback')).toContainText('pied de la tour');
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).profile.lastCamp).toBe(0);
  await page.reload(); await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.locator('.big-height')).toHaveText('0m');
  expect((await (await page.request.get('/api/auth/me')).json()).profile).toMatchObject({ id: before.id, personalBest: before.personalBest, unlockedCosmetics: before.unlockedCosmetics, lastCamp: 0 });
  await page.keyboard.down('Space'); await expect(page.locator('.big-height')).not.toHaveText('0m'); await page.keyboard.up('Space');
});
