import { describe, expect, it } from 'vitest';
import { applyPush, Cooperation, CoopPilot, createBody, generateChunk, mechanismPlatforms, PHYSICS, resolvePlayers, RoutePilot, stepBody, TEMPLATES, TowerMechanisms, touchesHazard, validateCooperativeRoute, validateRoute } from '@tower/game-core';
import { CHUNK_HEIGHT, DT, inputSchema, neutralInput, type Platform } from '@tower/shared';

const ground: Platform = { id: 'ground', x: 20, y: 0, w: 280, h: 8, kind: 'camp' };
describe('deterministic tower', () => {
  it('reproduces chunks with identical seed/index and varies with the seed', () => {
    expect(generateChunk(42, 7)).toEqual(generateChunk(42, 7));
    expect(generateChunk(42, 7)).not.toEqual(generateChunk(43, 7));
  });
  it('uses all authored templates, never repeats adjacent chunks and joins at compatible anchors', () => {
    const chunks = Array.from({ length: 100 }, (_, index) => generateChunk(2026, index));
    const variations = [1, 42, 2026, 123456, 0xffffffff].flatMap(seed => Array.from({ length: 100 }, (_, index) => generateChunk(seed, index)));
    expect(new Set(variations.map(c => c.id)).size).toBe(TEMPLATES.length + 1);
    for (let index = 1; index < chunks.length; index++) {
      expect(chunks[index]!.id).not.toBe(chunks[index - 1]!.id);
      expect(chunks[index]!.entry).toEqual(chunks[index - 1]!.exit);
    }
  });
  it('physically traverses every mandatory rise across 1000 chunks', () => {
    for (const seed of [1, 42, 2026, 123456, 0xffffffff]) for (let index = 0; index < 200; index++) { const chunk = generateChunk(seed, index); expect(chunk.cooperation ? validateCooperativeRoute(chunk) : validateRoute(chunk), `seed ${seed}, chunk ${index}`).toMatchObject({ valid: true }); }
  });
  it('keeps safe camp spawns clear of all hazards', () => {
    for (let index = 0; index < 100; index += 5) {
      const chunk = generateChunk(42, index), body = createBody('spawn', index);
      expect(chunk.camp).toBe(true); expect(touchesHazard(body, [chunk])).toBe(false);
      stepBody(body, neutralInput(), chunk.platforms, DT); expect(body.grounded).toBe(true);
    }
  });
  it('varies heights, widths and architectural forms, with optional shortcuts and wall-side routes', () => {
    const chunks = Array.from({ length: 100 }, (_, index) => generateChunk(42, index));
    const rises = new Set<number>(), widths = new Set<number>(), styles = new Set<string>();
    for (const chunk of chunks.filter(c => !c.cooperation)) {
      const main = chunk.platforms.filter(p => !p.id.endsWith(':side')).sort((a, b) => a.y - b.y);
      const levels = [...main.map(p => p.y), chunk.exit.y];
      for (let i = 1; i < levels.length; i++) { const rise = levels[i]! - levels[i - 1]!; expect(rise).toBeGreaterThanOrEqual(22); expect(rise).toBeLessThanOrEqual(chunk.difficulty === 1 ? 48 : 70); rises.add(rise); }
      expect(chunk.platforms.filter(p => p.id.endsWith(':side')).length).toBeGreaterThanOrEqual(2);
      for (const p of chunk.platforms) { widths.add(p.w); if (p.style) styles.add(p.style); expect(p.x).toBeGreaterThanOrEqual(20); expect(p.x + p.w).toBeLessThanOrEqual(300); }
    }
    expect(rises.size).toBeGreaterThan(10); expect(widths.size).toBeGreaterThan(15);
    expect(styles).toEqual(new Set(['pillar', 'beam', 'balcony', 'hanging', 'rune']));
    expect(chunks.some(c => c.platforms.some(p => p.x <= 25 && !p.id.endsWith(':side')))).toBe(true);
  });
  it.each([0, 25, 45])('climbs ten consecutive chunks as a pair from chunk %i, including difficulty transitions, without bonuses or position resets', startChunk => {
    for (const seed of [1, 42, 2026]) {
      const chunks = Array.from({ length: 13 }, (_, index) => generateChunk(seed, startChunk + index)), mechanics = new Cooperation(), moving = new TowerMechanisms();
      const gaps = chunks.flatMap(c => c.cooperation ? [c.cooperation] : []);
      const actors = [0, 1].map(i => ({ body: Object.assign(createBody(`pair-${i}`, startChunk), { x: 145 + i * 25, protection: 0 }), isBot: true, pilot: new RoutePilot(), coop: new CoopPilot() }));
      for (let frame = 0; frame < 2600 && actors.some(p => p.body.y < CHUNK_HEIGHT * (startChunk + 10)); frame++) {
        mechanics.update(chunks, actors, frame);
        moving.update(chunks, actors.map(p => p.body), frame);
        const platforms = [...mechanismPlatforms(chunks, frame, moving.states()), ...mechanics.bridges(chunks, frame)];
        const previous = new Map(actors.map(p => [p.body.id, p.body.y]));
        for (const p of actors) {
          const gap = gaps.find(g => mechanics.helpers.get(g.id) === p.body.id) ?? gaps.find(g => p.body.y >= g.y - 80 && p.body.y < g.y + 90);
          const input = (gap ? p.coop.input(p.body, platforms, actors.map(a => a.body), gap, mechanics.helpers.get(gap.id), frame) : null) ?? p.pilot.input(p.body, platforms, frame);
          stepBody(p.body, input, platforms, DT);
          expect(touchesHazard(p.body, chunks), `seed ${seed}, frame ${frame}`).toBe(false);
        }
        resolvePlayers(actors.map(p => p.body), previous, DT);
      }
      for (const { body } of actors) { expect(body.y, `seed ${seed}`).toBeGreaterThanOrEqual(CHUNK_HEIGHT * (startChunk + 10)); expect(body).toMatchObject({ feather: 0, boots: false, bubble: false }); }
    }
  });
});
describe('platformer movement', () => {
  it('accelerates quickly and stays inside the walls', () => {
    const body = createBody('mage');
    for (let i = 0; i < 90; i++) stepBody(body, { ...neutralInput(), moveX: 1 }, [ground], DT);
    expect(body.x).toBe(295); expect(body.vx).toBeLessThanOrEqual(PHYSICS.speed);
  });
  it('supports variable-height jumps and does not auto-jump when held', () => {
    const held = createBody('held'), tapped = createBody('tapped'); let heldMax = 0, tapMax = 0;
    for (let i = 0; i < 60; i++) {
      stepBody(held, { ...neutralInput(), jump: true }, [ground], DT);
      stepBody(tapped, { ...neutralInput(), jump: i < 2 }, [ground], DT);
      heldMax = Math.max(heldMax, held.y); tapMax = Math.max(tapMax, tapped.y);
    }
    expect(heldMax).toBeGreaterThan(77); expect(heldMax).toBeLessThan(80);
    expect(tapMax).toBeLessThan(heldMax - 30); expect(held.y).toBe(0);
  });
  it('allows coyote jumps just after leaving a ledge', () => {
    const body = createBody('mage'); stepBody(body, neutralInput(), [], DT);
    stepBody(body, { ...neutralInput(), jump: true }, [], DT); expect(body.vy).toBeGreaterThan(200);
  });
  it('buffers a jump immediately before landing', () => {
    const body = createBody('mage'); body.y = 4; body.vy = -130; body.grounded = false; body.coyote = 0;
    stepBody(body, { ...neutralInput(), jump: true }, [ground], DT); expect(body.grounded).toBe(true);
    stepBody(body, { ...neutralInput(), jump: true }, [ground], DT); expect(body.vy).toBeGreaterThan(200);
  });
  it('wall-slides and wall-jumps away from both walls', () => {
    for (const side of [-1, 1]) {
      const body = createBody('wall'); body.x = side < 0 ? 25 : 295; body.y = 100; body.vy = -200; body.grounded = false; body.coyote = 0;
      stepBody(body, { ...neutralInput(), moveX: side }, [], DT); expect(body.vy).toBe(-PHYSICS.wallSlide);
      stepBody(body, { ...neutralInput(), moveX: side, jump: true }, [], DT); expect(body.vy).toBeGreaterThan(200); expect(body.vx * side).toBeLessThan(0);
    }
  });
  it('lands on the highest crossed platform and falls through real lower chunks', () => {
    const body = createBody('fall'); body.y = 45; body.vy = -300; body.grounded = false;
    const ledge = { ...ground, id: 'ledge', y: 36 };
    stepBody(body, neutralInput(), [ground, ledge], DT); expect(body.y).toBe(36);
    body.x = 280; body.y = 250; body.vy = -200; body.grounded = false;
    for (let i = 0; i < 40; i++) stepBody(body, neutralInput(), [ground], DT);
    expect(body.y).toBe(0); expect(body.grounded).toBe(true);
  });
  it('catches diagonal falls at either edge at the instant the feet cross the top', () => {
    const ledge = { ...ground, x: 100, y: 80, w: 40 };
    for (const direction of [-1, 1]) {
      const body = Object.assign(createBody('edge'), { x: direction > 0 ? 143 : 97, y: 84, vx: direction * 108, vy: -340, grounded: false, coyote: 0 });
      stepBody(body, { ...neutralInput(), moveX: direction }, [ledge], DT);
      expect(body.y).toBe(80); expect(body.vy).toBe(0);
      // The horizontal motion still takes the player off the edge; this is no invisible extension.
      stepBody(body, { ...neutralInput(), moveX: direction }, [ledge], DT);
      expect(body.grounded).toBe(false); expect(body.y).toBeLessThan(80);
    }
  });
  it('does not catch feet that reach the side only after passing below its top, or jump from underneath', () => {
    const ledge = { ...ground, x: 100, y: 80, w: 40 };
    for (const direction of [-1, 1]) {
      const late = Object.assign(createBody('late'), { x: direction > 0 ? 93 : 147, y: 81, vx: direction * 108, vy: -340, grounded: false, coyote: 0 });
      stepBody(late, { ...neutralInput(), moveX: direction }, [ledge], DT);
      expect(late.y).toBeLessThan(80); expect(late.grounded).toBe(false);
    }
    const rising = Object.assign(createBody('rising'), { x: 120, y: 77, vy: 250, grounded: false, coyote: 0 });
    stepBody(rising, { ...neutralInput(), jump: true }, [ledge], DT);
    expect(rising.y).toBeGreaterThan(80); expect(rising.grounded).toBe(false);
    const absent = Object.assign(createBody('absent'), { x: 120, y: 84, vy: -340, grounded: false });
    stepBody(absent, neutralInput(), [{ ...ledge, disabled: true }], DT);
    expect(absent.y).toBeLessThan(80); expect(absent.grounded).toBe(false);
  });
});
describe('social physics', () => {
  it('allows players to land and stand on another player', () => {
    const lower = createBody('a'), upper = createBody('b');
    lower.y = 50; upper.y = 62; upper.vy = -100; lower.protection = 0; upper.protection = 0;
    resolvePlayers([lower, upper], new Map([['a', 50], ['b', 68]]), DT);
    expect(upper.y).toBe(65); expect(upper.grounded).toBe(true);
  });
  it('caps pushes, enforces cooldowns and protects camp players', () => {
    const actor = createBody('actor'), target = createBody('target'); actor.y = 50; target.y = 50; target.x = 174; actor.protection = 0; target.protection = 0;
    const push = { ...neutralInput(), push: true };
    expect(applyPush(actor, push, [actor, target])).toBe(1); expect(target.vx).toBeLessThanOrEqual(220);
    expect(applyPush(actor, push, [actor, target])).toBe(0);
    actor.pushHeld = false; actor.pushCooldown = 0; actor.y = target.y = 0; target.stun = 0;
    expect(applyPush(actor, push, [actor, target])).toBe(0);
  });
  it('enables ghosting after sustained crowd blockage', () => {
    const a = createBody('a'), b = createBody('b'); a.protection = b.protection = 0; a.y = b.y = 50;
    for (let i = 0; i < 50; i++) { a.x = b.x = 160; resolvePlayers([a, b], new Map([['a', 50], ['b', 50]]), DT); }
    expect(a.blocked).toBeGreaterThan(1.5); expect(a.x).toBe(b.x);
  });
});
describe('input protocol', () => {
  it('rejects client positions, altitude, invalid actions and non-finite values', () => {
    for (const extra of [{ x: 123 }, { y: 99999 }, { personalBest: 9000 }, { moveX: Infinity }, { moveX: 2 }, { seq: -1 }, { v: 2 }, { jump: 1 }]) expect(inputSchema.safeParse({ ...neutralInput(), ...extra }).success).toBe(false);
    expect(inputSchema.safeParse(neutralInput()).success).toBe(true);
  });
});
