import { expect, it } from 'vitest';
import { createBody, generateChunk, stepBody, touchesHazard } from '@tower/game-core';
import { DT, neutralInput, PLAYER_HEIGHT, PLAYER_WIDTH } from '@tower/shared';

it('introduces trapped cornices in the first 40 m section and keeps camps, coop gaps and rewards safe', () => {
  for (const seed of [1, 42, 2026, 123456, 0xffffffff]) {
    const chunks = Array.from({ length: 200 }, (_, i) => generateChunk(seed, i));
    expect(chunks.find(c => c.hazards.length)!.index).toBe(2);
    expect(chunks.filter(c => c.hazards.length)).toHaveLength(80);
    for (const chunk of chunks) {
      if (chunk.camp || chunk.cooperation || chunk.index < 2) expect(chunk.hazards).toEqual([]);
      for (const item of [...chunk.pickups, ...chunk.relics]) {
        const collector = Object.assign(createBody('collector'), { x: item.x, y: item.y - 9 });
        expect(touchesHazard(collector, [chunk])).toBe(false);
      }
      if (!chunk.hazards.length) continue;
      expect(chunk.hazards).toHaveLength(1);
      const h = chunk.hazards[0]!, ledge = chunk.platforms.find(p => p.id.includes(':hazard:'))!;
      expect(h.y).toBe(ledge.y); expect(h.x).toBeGreaterThan(ledge.x);
      expect(h.x + h.w).toBeLessThan(ledge.x + ledge.w);
      expect(chunk.mechanisms.some(m => m.platformId === ledge.id)).toBe(false);
    }
  }
});

it('detects a falling landing on the teeth and allows a jump above their tips on either wall', () => {
  const original = generateChunk(42, 2);
  for (const x of [22, 270]) {
    const h = { ...original.hazards[0]!, x };
    const chunk = { ...original, hazards: [h], platforms: [{ id: 'spikes:side', x: x - 2, y: h.y, w: 32, h: 8, kind: 'stone' as const }] };
    const body = Object.assign(createBody('falling'), { x: x + h.w / 2, y: h.y + h.h + 2, vy: -340, grounded: false, protection: 0 });
    stepBody(body, neutralInput(), chunk.platforms, DT);
    expect(touchesHazard(body, [chunk])).toBe(true);
    stepBody(body, neutralInput(), chunk.platforms, DT);
    expect(body.grounded).toBe(true); expect(touchesHazard(body, [chunk])).toBe(true);
    body.y = h.y + h.h; expect(touchesHazard(body, [chunk])).toBe(false);
    body.y = h.y - PLAYER_HEIGHT; expect(touchesHazard(body, [chunk])).toBe(false);
    body.y = h.y; body.x = h.x - PLAYER_WIDTH / 2; expect(touchesHazard(body, [chunk])).toBe(false);
    body.x = h.x + h.w + PLAYER_WIDTH / 2; expect(touchesHazard(body, [chunk])).toBe(false);
  }
});
