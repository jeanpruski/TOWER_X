import { expect, test } from '@playwright/test';
import { BIOMES } from '@tower/shared';
import { generateChunk, mechanismPlatforms } from '@tower/game-core';

test('usable ledges stay opaque in front of pillars in every biome and absent slabs show a hole', async ({ page }) => {
  await page.goto('/');
  const chunk = generateChunk(42, 22), fragileChunk = generateChunk(42, 2), tick = 40;
  const platforms = mechanismPlatforms([chunk], 0);
  const brokenPlatforms = mechanismPlatforms([fragileChunk], tick, [{ platformId: '2:1', breakTick: 36, restoreTick: 186 }]);
  const results = await page.evaluate(async ({ biomes, chunk, platforms, fragileChunk, brokenPlatforms, tick }) => {
    const artPath = '/src/game/art.ts'; const { drawGame } = await import(artPath);
    const canvas = document.createElement('canvas'); canvas.id = 'platform-visibility'; canvas.width = 320; canvas.height = 200;
    canvas.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;image-rendering:pixelated;z-index:99999'; document.body.append(canvas);
    const c = canvas.getContext('2d')!;
    const floor = chunk.platforms.find((p: { id: string }) => p.id === '22:3')!;
    const pillar = chunk.platforms.find((p: { id: string }) => p.id === '22:4')!;
    const center = Math.round(pillar.x + pillar.w / 2);
    const x = Math.max(Math.ceil(floor.x), center - 6);
    const sampleWidth = Math.min(Math.floor(floor.x + floor.w), center + 7) - x;
    const checks = biomes.map(biome => {
      const themed = { ...chunk, biome: biome.id };
      drawGame(c, [{ ...themed, platforms: [floor], mechanisms: [], hazards: [] }], [], '', floor.y, 0, false, null, [], [], new Map(), true);
      const reference = Array.from(c.getImageData(x, 158, sampleWidth, floor.h).data);
      const annotations = drawGame(c, [themed], [], '', floor.y, 0, false, null, [], [], new Map(), true, [], [], platforms);
      const withPillar = Array.from(c.getImageData(x, 158, sampleWidth, floor.h).data);
      return { biome: biome.id, opaque: reference.every((value, i) => value === withPillar[i]), reservedForFloor: annotations.obstacles.some((p: { x: number; y: number; w: number }) => p.x === floor.x && p.y === 158 && p.w === floor.w) };
    });
    const absent = brokenPlatforms.find((p: { id: string }) => p.id === '2:1')!;
    const annotations = drawGame(c, [fragileChunk], [], '', absent.y, 0, false, null, [], [], new Map(), true, [], [], brokenPlatforms, tick);
    const warning = annotations.labels.find((label: { id: string }) => label.id === 'platform:2:1')?.text;
    const missingHasNoFloor = !annotations.obstacles.some((p: { x: number; y: number; w: number }) => p.x === absent.x && p.y === 158 && p.w === absent.w);
    // Leave the real overlapping architecture on the contact sheet for visual inspection.
    drawGame(c, [chunk], [], '', floor.y, 0, false, null, [], [], new Map(), true, [], [], platforms);
    return { checks, warning, missingHasNoFloor };
  }, { biomes: BIOMES, chunk, platforms, fragileChunk, brokenPlatforms, tick });
  for (const check of results.checks) expect(check, check.biome).toMatchObject({ opaque: true, reservedForFloor: true });
  expect(results.warning).toContain('Dalle absente'); expect(results.missingHasNoFloor).toBe(true);
  await page.locator('#platform-visibility').screenshot({ path: 'test-results/platform-surfaces-visible.png' });
});
