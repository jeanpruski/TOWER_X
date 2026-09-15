import { test, expect } from '@playwright/test';
import { CoopPilot, RoutePilot } from '@tower/game-core';

test('a bot climbs independently, offers its shoulder, and follows the human over the temporary bridge', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5184'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().players.some(p => p.isBot && p.y > 220)), { timeout: 12000 }).toBe(true);
  expect(await page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(0);
  // Locate the scenario, then use only real keyboard actions to cross it.
  await page.evaluate(() => window.towerDebug!.teleportToChunk(13));
  await expect(page.locator('.coop-hint')).toContainText('Passage à deux');
  await expect.poll(() => page.evaluate(() => {
    const state = window.towerDebug!.inspect(), gap = state.chunks.find(c => c.index === 13)?.cooperation;
    return Boolean(gap && state.players.some(p => p.isBot && p.helping && p.grounded && Math.abs(p.y - gap.y) < 1 && Math.abs(p.x - gap.x) < 5));
  }), { timeout: 12000 }).toBe(true);
  await page.screenshot({ path: 'test-results/cooperation-waiting.png', fullPage: true });
  const coop = new CoopPilot(), route = new RoutePilot(), pressed = new Set<string>();
  let shoulder = false, opened = false, crossed = false;
  await page.locator('.game-canvas').focus();
  try {
    for (let tick = 0; tick < 520; tick++) {
      const state = await page.evaluate(() => window.towerDebug!.inspect());
      const body = state.player!, chunk = state.chunks.find(c => c.index === 13)!, gap = chunk.cooperation!;
      const bot = state.players.find(p => p.isBot)!;
      const platforms = [...state.chunks.flatMap(c => c.platforms), ...state.bridges];
      if (body.grounded && Math.abs(body.y - gap.y - 15) < 1) {
        if (!shoulder) await page.screenshot({ path: 'test-results/cooperation-shoulders.png', fullPage: true });
        shoulder = true;
      }
      if (state.bridges.some(p => p.id === gap.bridge.id)) {
        if (!opened) await page.screenshot({ path: 'test-results/cooperation-bridge.png', fullPage: true });
        opened = true;
      }
      if (body.y >= chunk.exit.y && bot.y >= chunk.exit.y) { crossed = true; break; }
      const input = coop.input(body, platforms, state.players, gap, bot.id, tick) ?? route.input(body, platforms, tick);
      for (const [code, down] of [['ArrowLeft', input.moveX < 0], ['ArrowRight', input.moveX > 0], ['Space', input.jump]] as const) {
        if (pressed.has(code) === down) continue;
        if (down) { pressed.add(code); await page.keyboard.down(code); } else { pressed.delete(code); await page.keyboard.up(code); }
      }
      await page.waitForTimeout(34);
    }
  } finally { for (const code of pressed) await page.keyboard.up(code); }
  expect(shoulder).toBe(true); expect(opened).toBe(true); expect(crossed).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/cooperation-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
