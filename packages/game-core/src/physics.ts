import { CHUNK_HEIGHT, CAMP_INTERVAL, PLAYER_HEIGHT as H, PLAYER_WIDTH as W, type Body, type PlayerInput, type Platform, type Chunk } from '@tower/shared';
import { SPRING_SPEED } from './mechanisms';

export const PHYSICS = { speed: 108, groundAccel: 1600, airAccel: 1050, friction: 1500, gravity: 690, jumpSpeed: 340, maxFall: 340, wallSlide: 66, wallJump: 160, coyote: 0.1, buffer: 0.12, pushCooldown: 0.7, pushForce: 220, pushRange: 30, pushHeight: 21, pushStun: 0.42 } as const;
const approach = (value: number, target: number, delta: number) => value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
const overlap = (a: Body, b: Body) => Math.abs(a.x - b.x) < W && a.y < b.y + H && a.y + H > b.y;
export const inSafeCamp = (body: Pick<Body, 'y'>) => {
  const offset = ((body.y % (CHUNK_HEIGHT * CAMP_INTERVAL)) + CHUNK_HEIGHT * CAMP_INTERVAL) % (CHUNK_HEIGHT * CAMP_INTERVAL);
  return offset < 26;
};
export function createBody(id: string, camp = 0): Body {
  return { id, x: 160, y: camp * CHUNK_HEIGHT, vx: 0, vy: 0, grounded: true, facing: 1, coyote: PHYSICS.coyote, jumpBuffer: 0, jumpHeld: false, pushHeld: false, pushCooldown: 0, protection: 2, stun: 0, blocked: 0, feather: 0, boots: false, bubble: false, spring: 0 };
}

export function stepBody(body: Body, input: PlayerInput, platforms: readonly Platform[], dt: number): void {
  const oldX = body.x;
  body.spring = Math.max(0, body.spring - dt);
  // A horizontal carriage transports a standing rider before their own movement.
  const support = body.grounded ? platforms.find(p => !p.disabled && Math.abs(p.y - body.y) < 0.1 && body.x + W / 2 > p.x - (p.dx ?? 0) && body.x - W / 2 < p.x + p.w - (p.dx ?? 0)) : undefined;
  if (support?.dx) body.x += support.dx;
  body.protection = Math.max(0, body.protection - dt);
  body.feather = Math.max(0, body.feather - dt);
  body.stun = Math.max(0, body.stun - dt);
  const stunned = body.stun > 0;
  body.pushCooldown = Math.max(0, body.pushCooldown - dt);
  body.coyote = body.grounded ? PHYSICS.coyote : Math.max(0, body.coyote - dt);
  body.jumpBuffer = stunned ? 0 : input.jump && !body.jumpHeld ? PHYSICS.buffer : Math.max(0, body.jumpBuffer - dt);
  const wall = body.x <= 25.01 ? -1 : body.x >= 294.99 ? 1 : 0;
  if (body.jumpBuffer > 0 && (body.coyote > 0 || wall !== 0)) {
    body.vy = PHYSICS.jumpSpeed * (body.boots ? 1.48 : body.feather > 0 ? 1.12 : 1);
    body.boots = false;
    if (!body.grounded && wall) { body.vx = -wall * PHYSICS.wallJump; body.facing = wall === -1 ? 1 : -1; }
    body.grounded = false;
    body.coyote = 0;
    body.jumpBuffer = 0;
  }
  if (!stunned && !input.jump && body.jumpHeld && body.vy > 0 && body.spring <= 0) body.vy *= 0.48;
  body.jumpHeld = input.jump;
  const acceleration = body.grounded ? PHYSICS.groundAccel : PHYSICS.airAccel;
  // A hit carries its full recoil for a short window, even against an approaching bot.
  body.vx = stunned ? approach(body.vx, 0, 160 * dt) : approach(body.vx, input.moveX * PHYSICS.speed, (input.moveX === 0 && body.grounded ? PHYSICS.friction : acceleration) * dt);
  if (!stunned && Math.abs(input.moveX) > 0.15) body.facing = input.moveX > 0 ? 1 : -1;
  body.x += body.vx * dt;
  if (body.x < 25) { body.x = 25; body.vx = Math.max(0, body.vx); }
  if (body.x > 295) { body.x = 295; body.vx = Math.min(0, body.vx); }
  body.vy = Math.max(-PHYSICS.maxFall, body.vy - PHYSICS.gravity * (body.feather > 0 ? 0.65 : 1) * dt);
  if (!stunned && wall && body.vy < -PHYSICS.wallSlide && input.moveX * wall > 0) body.vy = -PHYSICS.wallSlide;
  const oldY = body.y;
  body.y += body.vy * dt;
  body.grounded = false;
  if (body.vy <= 0) {
    let landing: Platform | undefined;
    let landingTime = 0;
    for (const platform of platforms) {
      if (platform.disabled || oldY < platform.y - 0.01 || body.y > platform.y) continue;
      // Test the feet where they cross the top, not at the end of a diagonal fall.
      // A moving ledge must be sampled at the same instant as the player.
      const fall = oldY - body.y;
      const crossing = fall > 0 ? Math.max(0, Math.min(1, (oldY - platform.y) / fall)) : 0;
      const x = oldX + (body.x - oldX) * crossing;
      const platformX = platform.x - (platform.dx ?? 0) * (1 - crossing);
      if (x + W / 2 > platformX && x - W / 2 < platformX + platform.w && (!landing || platform.y > landing.y)) { landing = platform; landingTime = crossing; }
    }
    if (landing) {
      if (landing.dx && support?.id !== landing.id) body.x = Math.max(25, Math.min(295, body.x + landing.dx * (1 - landingTime)));
      body.y = landing.y; body.vy = 0; body.grounded = true;
      if (landing.mechanism === 'spring') { body.vy = SPRING_SPEED; body.grounded = false; body.coyote = 0; body.jumpBuffer = 0; body.spring = 0.6; }
    }
  }
}

export function resolvePlayers(bodies: Body[], previousY: Map<string, number>, dt: number): void {
  const blockedThisTick = new Set<string>();
  // Sort bottom to top to make stacks deterministic, independent of join order.
  const sorted = [...bodies].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i++) {
    const lower = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const upper = sorted[j]!;
      if (!overlap(lower, upper) || lower.protection > 0 || upper.protection > 0 || inSafeCamp(lower) || inSafeCamp(upper)) continue;
      blockedThisTick.add(lower.id); blockedThisTick.add(upper.id);
      const oldUpper = previousY.get(upper.id) ?? upper.y;
      const oldLower = previousY.get(lower.id) ?? lower.y;
      if (upper.vy <= lower.vy && oldUpper >= oldLower + H - 5) {
        const impact = Math.max(0, -upper.vy - 160);
        upper.y = lower.y + H; upper.vy = Math.max(0, lower.vy); upper.grounded = true;
        if (impact > 0 && lower.stun <= 0) { lower.vx += upper.facing * Math.min(70, impact * 0.3); lower.stun = 0.2; }
      } else {
        // Only lateral congestion needs ghosting. A stable shoulder stack is useful.
        if (lower.blocked > 1.5 || upper.blocked > 1.5) continue;
        const direction = lower.x <= upper.x ? 1 : -1;
        const penetration = (W - Math.abs(lower.x - upper.x)) / 2;
        lower.x = Math.max(25, Math.min(295, lower.x - penetration * direction));
        upper.x = Math.max(25, Math.min(295, upper.x + penetration * direction));
      }
    }
  }
  for (const body of bodies) body.blocked = blockedThisTick.has(body.id) ? Math.min(3, body.blocked + dt) : Math.max(0, body.blocked - dt * 2);
}

export function canPushTarget(actor: Body, target: Body): boolean {
  const dx = target.x - actor.x;
  return actor.id !== target.id && target.protection <= 0 && target.stun <= 0 && !inSafeCamp(target) && dx * actor.facing >= -3 && Math.abs(dx) <= PHYSICS.pushRange && Math.abs(target.y - actor.y) <= PHYSICS.pushHeight;
}

export function applyPush(actor: Body, input: PlayerInput, bodies: Body[], onHit?: (target: Body, blocked: boolean) => void): number {
  const pressed = input.push && !actor.pushHeld;
  actor.pushHeld = input.push;
  if (!pressed || actor.pushCooldown > 0 || actor.protection > 0 || actor.stun > 0 || inSafeCamp(actor)) return 0;
  actor.pushCooldown = PHYSICS.pushCooldown;
  let hits = 0;
  for (const target of bodies) {
    if (!canPushTarget(actor, target)) continue;
    if (target.bubble) { target.bubble = false; target.protection = 0.5; onHit?.(target, true); continue; }
    target.vx = actor.facing * PHYSICS.pushForce;
    target.vy = Math.min(160, Math.max(target.vy, 110)); target.grounded = false; target.stun = PHYSICS.pushStun;
    target.coyote = 0; target.jumpBuffer = 0; hits++;
    onHit?.(target, false);
  }
  return hits;
}

export function touchesHazard(body: Body, chunks: readonly Chunk[]): boolean {
  return chunks.some(chunk => chunk.hazards.some(h => body.x + W / 2 > h.x && body.x - W / 2 < h.x + h.w && body.y < h.y + h.h && body.y + H > h.y));
}
