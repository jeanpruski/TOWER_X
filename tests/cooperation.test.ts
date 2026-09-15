import { expect, it } from 'vitest';
import { Cooperation, createBody, generateChunk, resolvePlayers, stepBody, validateCooperativeRoute, validateRoute } from '@tower/game-core';
import { COOP_BRIDGE_SECONDS, DT, PLAYER_HEIGHT, TICK_RATE, neutralInput } from '@tower/shared';

it('marks a gap beyond the normal solo jump, and both partners physically get through it', () => {
  for (const seed of [1, 42, 2026]) for (const index of [3, 8, 13, 98]) {
    const chunk = generateChunk(seed, index);
    expect(chunk.soloValidated).toBe(false); expect(chunk.cooperation).toBeDefined();
    expect(validateRoute(chunk).valid).toBe(false);
    expect(validateCooperativeRoute(chunk)).toMatchObject({ valid: true, crossed: 2 });
  }
});

it('deploys the shared bridge on a real upper landing, then retracts eight seconds after departure', () => {
  const chunk = generateChunk(42, 3), gap = chunk.cooperation!, landing = chunk.platforms.find(p => p.id === gap.landingId)!;
  const body = Object.assign(createBody('climber'), { x: landing.x + landing.w / 2, y: landing.y, grounded: false });
  const mechanics = new Cooperation(), actors = [{ body, isBot: false }];
  mechanics.update([chunk], actors, 10); expect(mechanics.bridges([chunk], 10)).toEqual([]);
  body.grounded = true; mechanics.update([chunk], actors, 11);
  expect(mechanics.bridges([chunk], 11)).toEqual([gap.bridge]);
  body.y += 100;
  mechanics.update([chunk], actors, 11 + COOP_BRIDGE_SECONDS * TICK_RATE - 1);
  expect(mechanics.bridges([chunk], 250)).toEqual([gap.bridge]);
  mechanics.update([chunk], actors, 11 + COOP_BRIDGE_SECONDS * TICK_RATE);
  expect(mechanics.bridges([chunk], 251)).toEqual([]);
});

it('keeps a shoulder stack stable longer than the crowd ghosting timer, then allows a jump', () => {
  const floor = { id: 'floor', x: 100, y: 60, w: 120, h: 8, kind: 'stone' as const };
  const lower = Object.assign(createBody('lower'), { y: floor.y, protection: 0 });
  const upper = Object.assign(createBody('upper'), { y: floor.y + PLAYER_HEIGHT, protection: 0 });
  for (let frame = 0; frame < 180; frame++) {
    const previous = new Map([[lower.id, lower.y], [upper.id, upper.y]]);
    for (const body of [lower, upper]) stepBody(body, neutralInput(frame), [floor], DT);
    resolvePlayers([lower, upper], previous, DT);
    expect(upper.y).toBe(floor.y + PLAYER_HEIGHT); expect(upper.grounded).toBe(true);
  }
  stepBody(upper, { ...neutralInput(), jump: true }, [floor], DT);
  expect(upper.vy).toBeGreaterThan(300);
});
