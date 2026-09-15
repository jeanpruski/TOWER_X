import { expect, test } from '@playwright/test';
import { RoutePilot } from '@tower/game-core';
import { CHUNK_HEIGHT, DIFFICULTY_LEVELS } from '@tower/shared';

test('altitude selects the course difficulty and every band can be climbed with real inputs', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5185'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  for (const level of DIFFICULTY_LEVELS) {
    await page.evaluate(index => window.towerDebug!.teleportToChunk(index), level.fromChunk);
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(level.fromChunk * CHUNK_HEIGHT);
    const indicator = page.getByLabel(`Difficulté ${level.level} sur 5 : ${level.name}`, { exact: true });
    await expect(indicator).toBeVisible();
    await expect(indicator.locator('.filled')).toHaveCount(level.level);
    await expect.poll(() => page.evaluate(index => window.towerDebug!.inspect().chunks.find(c => c.index === index)?.difficulty, level.fromChunk)).toBe(level.level);
    await page.locator('.game-layout').screenshot({ path: `test-results/difficulty-${level.level}.png` });
    const pilot = new RoutePilot(), pressed = new Set<string>();
    try {
      await page.locator('.game-canvas').focus();
      let climbed = false;
      for (let tick = 0; tick < 240; tick++) {
        const state = await page.evaluate(() => window.towerDebug!.inspect());
        if (state.player!.y >= (level.fromChunk + 1) * CHUNK_HEIGHT) { climbed = true; break; }
        const input = pilot.input(state.player!, state.platforms, tick);
        for (const [key, down] of [['ArrowLeft', input.moveX < 0], ['ArrowRight', input.moveX > 0], ['Space', input.jump]] as const) {
          if (pressed.has(key) === down) continue;
          if (down) { pressed.add(key); await page.keyboard.down(key); } else { pressed.delete(key); await page.keyboard.up(key); }
        }
        await page.waitForTimeout(34);
      }
      expect(climbed, level.name).toBe(true);
    } finally { for (const key of pressed) await page.keyboard.up(key); }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.difficulty-meter').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/difficulty-mobile.png' });
  // Falling or returning down the tower restores the easier course's label; the record is irrelevant.
  await page.evaluate(() => window.towerDebug!.teleportToChunk(0));
  await expect(page.getByLabel('Difficulté 1 sur 5 : Découverte', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
