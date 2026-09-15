import { neutralInput, type Body, type Platform, type PlayerInput } from '@tower/shared';
import { PHYSICS } from './physics';
import { SPRING_SPEED } from './mechanisms';

export const isRoutePlatform = (platform: Platform): boolean => !platform.id.endsWith(':side');

/** A conservative solo route follower: only normal movement, no buffs or position changes. */
export class RoutePilot {
  private target?: Platform;
  private bouncing = false;
  input(body: Body, platforms: readonly Platform[], seq: number): PlayerInput {
    const input = neutralInput(seq);
    if (this.target) this.target = platforms.find(p => p.id === this.target!.id && !p.disabled);
    if (body.spring > 0 && !this.bouncing) {
      const reach = SPRING_SPEED ** 2 / (2 * PHYSICS.gravity) - 15;
      this.target = platforms.filter(p => !p.disabled && isRoutePlatform(p) && p.y > body.y + 2 && p.y <= body.y + reach).sort((a, b) => b.y - a.y)[0];
    }
    this.bouncing = body.spring > 0;
    if (body.grounded) {
      const reach = PHYSICS.jumpSpeed ** 2 / (2 * PHYSICS.gravity) - 8;
      this.target = platforms.filter(p => !p.disabled && isRoutePlatform(p) && p.y > body.y + 2 && p.y - body.y <= reach).sort((a, b) => a.y - b.y)[0];
      const floor = platforms.find(p => !p.disabled && Math.abs(p.y - body.y) < 1 && body.x >= p.x - 5 && body.x <= p.x + p.w + 5);
      if (floor && Math.abs(floor.x + floor.w / 2 - body.x) > 4) {
        input.moveX = Math.sign(floor.x + floor.w / 2 - body.x); return input;
      }
      input.jump = Boolean(this.target) && !body.jumpHeld;
    } else input.jump = body.jumpHeld;
    if (this.target) {
      const dx = this.target.x + this.target.w / 2 - body.x;
      input.moveX = Math.abs(dx) > 3 ? Math.sign(dx) : 0;
    }
    return input;
  }
}
