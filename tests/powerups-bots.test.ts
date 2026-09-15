import { describe, expect, it } from 'vitest';
import { applyPush, collectPickup, createBody, generateChunk, mechanismPlatforms, nearbyChunks, stepBody, TowerMechanisms, touchesHazard, touchesPickup } from '@tower/game-core';
import { DT, neutralInput, type Pickup } from '@tower/shared';
import { BotBrain } from '../apps/game-server/src/bots';

const pickup = (kind: Pickup['kind']): Pickup => ({ id: 'test', kind, x: 160, y: 9 });
describe('temporary power-ups', () => {
  it('puts visible, reachable bonuses on the mandatory route and all three in the opening chunk', () => {
    for (const seed of [1, 42, 2026]) for (let index = 0; index < 100; index++) {
      const chunk = generateChunk(seed, index);
      expect(chunk.pickups.length).toBe(index === 0 ? 3 : 1);
      for (const item of chunk.pickups) {
        const floor = chunk.platforms.find(p => p.y === item.y - 9 && item.x >= p.x && item.x <= p.x + p.w);
        expect(floor).toBeDefined();
        const body = createBody('collector'); body.x = item.x; body.y = floor!.y;
        expect(touchesPickup(body, item)).toBe(true); expect(touchesHazard(body, [chunk])).toBe(false);
      }
    }
  });
  it('raises the feather jump, expires after 12 seconds and consumes boots only on an actual jump', () => {
    const floor = generateChunk(42, 0).platforms[0]!;
    const normal = createBody('normal'), feather = createBody('feather'), boots = createBody('boots');
    collectPickup(feather, pickup('feather')); collectPickup(boots, pickup('boots'));
    stepBody(boots, neutralInput(), [floor], DT); expect(boots.boots).toBe(true);
    const max = [0, 0, 0];
    for (let i = 0; i < 360; i++) for (const [slot, body] of [normal, feather, boots].entries()) {
      stepBody(body, { ...neutralInput(i), jump: true }, [floor], DT); max[slot] = Math.max(max[slot]!, body.y);
    }
    expect(max[1]).toBeGreaterThan(max[0]! * 1.5); expect(max[2]).toBeGreaterThan(max[0]! * 2);
    expect(feather.feather).toBeLessThan(0.001); expect(boots.boots).toBe(false);
    expect(createBody('reset')).toMatchObject({ boots: false, bubble: false, feather: 0 });
  });
  it('a bubble absorbs exactly one push and briefly prevents simultaneous attackers bypassing it', () => {
    const a = createBody('a'), b = createBody('b'); a.y = b.y = 60; b.x = 176; a.protection = b.protection = 0;
    collectPickup(b, pickup('bubble'));
    const hits: boolean[] = [];
    expect(applyPush(a, { ...neutralInput(), push: true }, [a, b], (_, blocked) => hits.push(blocked))).toBe(0);
    expect(hits).toEqual([true]); expect(b.vx).toBe(0); expect(b.bubble).toBe(false); expect(b.protection).toBeGreaterThan(0);
    a.pushHeld = false; a.pushCooldown = 0;
    expect(applyPush(a, { ...neutralInput(), push: true }, [a, b])).toBe(0);
    a.pushHeld = false; a.pushCooldown = 0; b.protection = 0;
    expect(applyPush(a, { ...neutralInput(), push: true }, [a, b])).toBe(1); expect(b.stun).toBeGreaterThan(0);
  });
});

describe('companion navigation', () => {
  it('knocks approaching bots off a ledge in both directions and lets them recover afterwards', () => {
    for (const facing of [-1, 1] as const) {
      const actor = Object.assign(createBody('actor'), { x: 160, y: 100, protection: 0, facing });
      const bot = Object.assign(createBody('bot'), { x: 160 + facing * 28, y: 100, vx: -facing * 108, protection: 0, jumpHeld: true, boots: true });
      const brain = new BotBrain(0), startX = bot.x;
      const ledge = { id: 'ledge', x: 120, y: 100, w: 80, h: 8, kind: 'stone' as const };
      expect(applyPush(actor, { ...neutralInput(), push: true }, [actor, bot])).toBe(1);
      for (let tick = 1; tick <= 11; tick++) {
        const input = brain.input(bot, [ledge], [actor], tick);
        expect(input).toMatchObject({ moveX: 0, jump: false, push: false });
        // Even forged countersteering/jump input cannot cancel the authoritative recoil.
        stepBody(bot, { ...input, moveX: -facing, jump: tick % 2 === 0, push: true }, [ledge], DT);
        expect(bot.vy).toBeLessThan(110); expect(bot.boots).toBe(true);
        expect(applyPush(bot, { ...input, push: true }, [bot, actor])).toBe(0);
      }
      expect((bot.x - startX) * facing).toBeGreaterThan(60);
      expect(bot.y).toBeLessThan(100); expect(bot.grounded).toBe(false);
      const platforms = [ledge, { ...ledge, id: 'catch-floor', x: 20, y: 40, w: 280 }];
      for (let tick = 12; tick <= 28; tick++) stepBody(bot, brain.input(bot, platforms, [actor], tick), platforms, DT);
      expect(bot.stun).toBe(0);
      expect(bot.vx * facing).toBeLessThan(0);
    }
  });
  it('turns toward nearby humans and lands occasional pushes, including between the old periodic ticks', () => {
    for (const side of [-1, 1]) for (let slot = 0; slot < 3; slot++) {
      const bot = createBody('bot'), human = createBody('human'), brain = new BotBrain(slot);
      bot.y = human.y = 60; bot.protection = human.protection = 0;
      const floor = { id: 'test-floor', x: 100, y: 60, w: 120, h: 8, kind: 'stone' as const };
      const hits: number[] = [];
      for (let tick = 237; tick < 1137; tick++) {
        // Keep presenting a fresh nearby encounter after each knockback.
        Object.assign(human, { x: bot.x + side * 18, y: 60, vx: 0, vy: 0, stun: 0 });
        bot.facing = side < 0 ? 1 : -1;
        const input = brain.input(bot, [floor], [human], tick);
        stepBody(bot, input, [floor], DT);
        if (applyPush(bot, input, [bot, human])) {
          hits.push(tick); expect(human.vx * side).toBe(220); expect(input.jump).toBe(false);
        }
      }
      expect(hits.length).toBeGreaterThanOrEqual(3); expect(hits.length).toBeLessThanOrEqual(6);
      for (let i = 1; i < hits.length; i++) expect(hits[i]! - hits[i - 1]!).toBeGreaterThanOrEqual(150);
    }
  });
  it('waits through camp, arrival, stun and out-of-range situations without losing the next opportunity', () => {
    for (const scenario of ['camp', 'arrival', 'actor-protected', 'stunned', 'cooldown', 'far', 'above', 'target-stunned'] as const) {
      const bot = createBody('bot'), human = createBody('human'), brain = new BotBrain(0);
      Object.assign(bot, { y: 60, protection: 0 }); Object.assign(human, { x: 178, y: 60, protection: 0 });
      if (scenario === 'camp') bot.y = human.y = 0;
      if (scenario === 'arrival') human.protection = 2;
      if (scenario === 'actor-protected') bot.protection = 2;
      if (scenario === 'stunned') bot.stun = 1;
      if (scenario === 'cooldown') bot.pushCooldown = 0.5;
      if (scenario === 'far') human.x = 220;
      if (scenario === 'above') human.y = 100;
      if (scenario === 'target-stunned') human.stun = 1;
      for (let tick = 321; tick < 551; tick++) expect(brain.input(bot, [], [human], tick).push, scenario).toBe(false);
      Object.assign(bot, { y: 60, protection: 0, stun: 0, pushCooldown: 0 });
      Object.assign(human, { x: 178, y: 60, protection: 0, stun: 0 });
      expect(brain.input(bot, [], [human], 551).push, scenario).toBe(true);
    }
  });
  it('climbs real generated platforms on several seeds without teleporting or changing physics', () => {
    for (const seed of [1, 42, 2026, 123456]) for (let slot = 0; slot < 3; slot++) {
      const bot = createBody(`bot-${slot}`), human = createBody('human'), brain = new BotBrain(slot);
      human.y = 600; bot.x += (slot - 1) * 14;
      let highest = 0;
      const mechanisms = new TowerMechanisms();
      for (let tick = 1; tick <= 900; tick++) {
        const chunks = nearbyChunks(seed, bot.y); mechanisms.update(chunks, [bot], tick);
        const platforms = mechanismPlatforms(chunks, tick, mechanisms.states());
        const before = { x: bot.x, y: bot.y };
        stepBody(bot, brain.input(bot, platforms, [human], tick), platforms, DT);
        highest = Math.max(highest, bot.y);
        expect(Math.abs(bot.x - before.x)).toBeLessThan(6); expect(Math.abs(bot.y - before.y)).toBeLessThan(12);
      }
      expect(highest, `seed ${seed}, bot ${slot}`).toBeGreaterThan(450);
    }
  });
  it('continues climbing while the human remains idle, up to the first cooperative gap', () => {
    const bot = createBody('bot'), human = createBody('human'), brain = new BotBrain(0);
    const mechanisms = new TowerMechanisms();
    for (let tick = 1; tick <= 1200; tick++) {
      const chunks = nearbyChunks(42, bot.y); mechanisms.update(chunks, [bot], tick);
      const platforms = mechanismPlatforms(chunks, tick, mechanisms.states());
      stepBody(bot, brain.input(bot, platforms, [human], tick), platforms, DT);
    }
    expect(bot.y).toBeGreaterThan(600); expect(bot.grounded).toBe(true);
  });
});
