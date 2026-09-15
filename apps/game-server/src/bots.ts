import { neutralInput, TICK_RATE, type Body, type CoopGap, type Platform, type PlayerInput } from '@tower/shared';
import { canPushTarget, CoopPilot, inSafeCamp, RoutePilot } from '@tower/game-core';

export const BOT_NAMES = ['Mousse', 'Sureau', 'Brume'];
export const BOT_HATS = ['top-hat', 'witch', 'hood'] as const;
export class BotBrain {
  private pilot = new RoutePilot();
  private coopPilot = new CoopPilot();
  private resting = 0;
  private wasGrounded = false;
  private nextPushAt?: number;
  private pushCount = 0;
  constructor(readonly slot: number) {}
  input(body: Body, platforms: Platform[], humans: Body[], tick: number, cooperation?: { gap: CoopGap; helperId?: string; allies: Body[] }): PlayerInput {
    this.nextPushAt ??= tick + 75 + this.slot * 23;
    if (body.stun > 0) { this.wasGrounded = false; return neutralInput(tick); }
    if (cooperation) {
      const action = this.coopPilot.input(body, platforms, cooperation.allies, cooperation.gap, cooperation.helperId, tick);
      if (action) return action;
    }
    // Keep a ready opportunity until someone comes close, including during a rest.
    // Turn using a normal movement input so the authoritative push faces the target.
    if (!cooperation && tick >= this.nextPushAt && body.grounded && body.protection <= 0 && body.stun <= 0 && body.pushCooldown <= 0 && !body.pushHeld && !inSafeCamp(body)) {
      const target = humans.filter(h => canPushTarget({ ...body, facing: h.x < body.x ? -1 : 1 }, h))
        .sort((a, b) => Math.abs(a.x - body.x) - Math.abs(b.x - body.x))[0];
      if (target) {
        this.nextPushAt = tick + TICK_RATE * 5 + (++this.pushCount * 47 + this.slot * 31) % (TICK_RATE * 4 + 1);
        this.resting = 12; this.wasGrounded = true;
        return { ...neutralInput(tick), moveX: target.x < body.x ? -1 : 1, push: true };
      }
    }
    if (body.grounded) {
      if (!this.wasGrounded) this.resting = 2 + this.slot * 2;
      this.wasGrounded = true;
      if (this.resting-- > 0) return neutralInput(tick);
    } else this.wasGrounded = false;
    return this.pilot.input(body, platforms, tick);
  }
}
