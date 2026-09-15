import { expect, it } from 'vitest';
import { CRUMBLE_RESET_TICKS, CRUMBLE_WARNING_TICKS, createBody, generateChunk, mechanismPlatforms, stepBody, TowerMechanisms, validateRoute } from '@tower/game-core';
import { DT, neutralInput } from '@tower/shared';

it('carries two stationary riders through a full moving-platform cycle and lets them jump off', () => {
  const chunk = generateChunk(42, 1);
  const start = mechanismPlatforms([chunk], 0).find(p => p.mechanism === 'moving')!;
  const riders = [-10, 10].map(offset => Object.assign(createBody(`rider-${offset}`), { x: start.x + start.w / 2 + offset, y: start.y, protection: 0 }));
  let min = start.x, max = start.x;
  for (let tick = 1; tick <= 180; tick++) {
    const platforms = mechanismPlatforms([chunk], tick), moving = platforms.find(p => p.id === start.id)!;
    min = Math.min(min, moving.x); max = Math.max(max, moving.x);
    for (const [i, rider] of riders.entries()) {
      stepBody(rider, neutralInput(tick), platforms, DT);
      expect(rider.grounded).toBe(true); expect(rider.x - moving.x - moving.w / 2).toBeCloseTo(i ? 10 : -10, 8);
    }
  }
  expect(max - min).toBeGreaterThan(19);
  stepBody(riders[0]!, { ...neutralInput(), jump: true, moveX: 1 }, mechanismPlatforms([chunk], 181), DT);
  expect(riders[0]!.grounded).toBe(false); expect(riders[0]!.vy).toBeGreaterThan(300);
});

it('lands against the moving edge at contact time instead of its final position', () => {
  // The ledge moves from x=100 to x=102 while these feet cross its top.
  const ledge = { id: 'moving-edge', x: 102, y: 80, w: 40, h: 8, dx: 2, kind: 'stone' as const, mechanism: 'moving' as const };
  const caught = Object.assign(createBody('caught'), { x: 96, y: 81, vy: -340, grounded: false, coyote: 0 });
  stepBody(caught, neutralInput(), [ledge], DT);
  expect(caught.y).toBe(80); expect(caught.grounded).toBe(true);
  const offset = caught.x - ledge.x;
  stepBody(caught, neutralInput(), [{ ...ledge, x: 104 }], DT);
  expect(caught.grounded).toBe(true); expect(caught.x - 104).toBeCloseTo(offset, 8);
  const missed = Object.assign(createBody('missed'), { x: 146, y: 81, vy: -340, grounded: false, coyote: 0 });
  stepBody(missed, neutralInput(), [ledge], DT);
  expect(missed.y).toBeLessThan(80); expect(missed.grounded).toBe(false);
});

it('warns once, collapses under a waiting rider, and restores the shared floor after five seconds', () => {
  const chunk = generateChunk(42, 2), mechanisms = new TowerMechanisms();
  const slab = mechanismPlatforms([chunk], 0).find(p => p.mechanism === 'crumble')!;
  const rider = Object.assign(createBody('waiting'), { x: slab.x + slab.w / 2, y: slab.y, protection: 0 });
  mechanisms.update([chunk], [rider], 0);
  const initial = mechanisms.states()[0]!;
  expect(initial.breakTick).toBe(CRUMBLE_WARNING_TICKS);
  for (let tick = 1; tick <= CRUMBLE_WARNING_TICKS + 4; tick++) {
    mechanisms.update([chunk], [rider], tick);
    expect(mechanisms.states()[0]).toEqual(initial);
    stepBody(rider, neutralInput(tick), mechanismPlatforms([chunk], tick, mechanisms.states()), DT);
  }
  expect(rider.y).toBeLessThan(slab.y - 2);
  expect(mechanismPlatforms([chunk], initial.breakTick, mechanisms.states()).find(p => p.id === slab.id)?.disabled).toBe(true);
  expect(initial.restoreTick - initial.breakTick).toBe(CRUMBLE_RESET_TICKS);
  mechanisms.update([chunk], [], initial.restoreTick);
  expect(mechanisms.states()).toEqual([]);
  expect(mechanismPlatforms([chunk], initial.restoreTick, mechanisms.states()).find(p => p.id === slab.id)?.disabled).not.toBe(true);
  mechanisms.update([chunk], [Object.assign(rider, { y: slab.y, grounded: true })], initial.restoreTick + 1);
  expect(mechanisms.states()).toHaveLength(1);
  mechanisms.update([], [], initial.restoreTick + 2); expect(mechanisms.states()).toEqual([]);
});

it('automatically bounces from a spring without consuming boots or requiring the jump key', () => {
  const spring = { id: 'spring', x: 100, y: 80, w: 70, h: 8, kind: 'stone' as const, mechanism: 'spring' as const };
  const body = Object.assign(createBody('bounce'), { x: 135, y: 82, vy: -130, grounded: false, boots: true, jumpHeld: true, coyote: 0 });
  stepBody(body, neutralInput(), [spring], DT);
  expect(body.vy).toBe(440); expect(body.grounded).toBe(false); expect(body.boots).toBe(true);
  let highest = body.y;
  for (let tick = 1; tick <= 30; tick++) { stepBody(body, neutralInput(tick), [spring], DT); highest = Math.max(highest, body.y); }
  expect(highest - spring.y).toBeGreaterThan(130); expect(highest - spring.y).toBeLessThan(140);
  expect(body.boots).toBe(true); expect(createBody('reset').spring).toBe(0);
});

it('keeps routes reachable at several motion phases and separates mechanisms from camps, coffers and cooperative gaps', () => {
  const kinds = new Set<string>();
  for (const seed of [1, 42, 2026, 123456, 0xffffffff]) for (let index = 0; index < 200; index++) {
    const chunk = generateChunk(seed, index);
    for (const mechanism of chunk.mechanisms) {
      kinds.add(mechanism.kind);
      const platform = chunk.platforms.find(p => p.id === mechanism.platformId)!;
      expect(platform.kind).not.toBe('camp'); expect(chunk.cooperation).toBeUndefined();
      expect(chunk.relics.some(r => Math.abs(r.y - platform.y - 10) < 1 && r.x >= platform.x && r.x <= platform.x + platform.w)).toBe(false);
      if (mechanism.kind === 'moving') for (let phase = 0; phase < mechanism.period; phase += 15) expect(validateRoute(chunk, phase), `seed=${seed}, chunk=${index}, phase=${phase}`).toMatchObject({ valid: true });
    }
  }
  expect(kinds).toEqual(new Set(['moving', 'crumble', 'spring']));
});
