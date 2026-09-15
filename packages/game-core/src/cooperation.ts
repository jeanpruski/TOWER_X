import { inSafeCamp } from './physics';
import { COOP_BRIDGE_SECONDS, PLAYER_HEIGHT, TICK_RATE, neutralInput, type Body, type Chunk, type CoopGap, type Platform, type PlayerInput } from '@tower/shared';

export interface CoopActor { body: Body; isBot: boolean; }

/** Server-owned bridge timers and stable helper assignments, shared with validators. */
export class Cooperation {
  readonly openUntil = new Map<string, number>();
  readonly helpers = new Map<string, string>();
  update(chunks: readonly Chunk[], actors: readonly CoopActor[], tick: number) {
    const gaps = chunks.filter(c => c.cooperation).map(c => ({ gap: c.cooperation!, landing: c.platforms.find(p => p.id === c.cooperation!.landingId)! }));
    const present = new Set(gaps.map(({ gap }) => gap.id));
    for (const id of this.openUntil.keys()) if (!present.has(id) || this.openUntil.get(id)! <= tick) this.openUntil.delete(id);
    for (const id of this.helpers.keys()) if (!present.has(id)) this.helpers.delete(id);
    // Prioritize stranded humans when the three helpers are spread over several gaps.
    const waiting = (gap: CoopGap, actor: CoopActor) => actor.body.y >= gap.y - 80 && actor.body.y < gap.y + 85;
    gaps.sort((a, b) => Number(actors.some(p => !p.isBot && waiting(b.gap, p))) - Number(actors.some(p => !p.isBot && waiting(a.gap, p))) || a.gap.y - b.gap.y);
    const assigned = new Set<string>();
    for (const { gap, landing } of gaps) {
      if (actors.some(({ body }) => body.grounded && Math.abs(body.y - landing.y) < 0.1 && body.x >= landing.x - 4 && body.x <= landing.x + landing.w + 4)) this.openUntil.set(gap.id, tick + COOP_BRIDGE_SECONDS * TICK_RATE);
      if (this.isOpen(gap.id, tick) || !actors.some(p => waiting(gap, p))) { this.helpers.delete(gap.id); continue; }
      const previous = this.helpers.get(gap.id);
      const available = actors.filter(p => p.isBot && !assigned.has(p.body.id) && p.body.y >= gap.y - 180 && p.body.y <= gap.y + 320);
      available.sort((a, b) => Number(b.body.id === previous) - Number(a.body.id === previous) || Math.abs(a.body.y - gap.y) - Math.abs(b.body.y - gap.y) || a.body.id.localeCompare(b.body.id));
      const helper = available[0];
      if (helper) { this.helpers.set(gap.id, helper.body.id); assigned.add(helper.body.id); }
      else this.helpers.delete(gap.id);
    }
  }
  isOpen(id: string, tick: number) { return (this.openUntil.get(id) ?? 0) > tick; }
  bridges(chunks: readonly Chunk[], tick: number): Platform[] { return chunks.flatMap(c => c.cooperation && this.isOpen(c.cooperation.id, tick) ? [c.cooperation.bridge] : []); }
}

/** Normal inputs for offering a shoulder, using one, or returning to a stranded partner. */
export class CoopPilot {
  private launching = false;
  input(body: Body, platforms: readonly Platform[], allies: readonly Body[], gap: CoopGap, helperId: string | undefined, seq: number): PlayerInput | null {
    const landing = platforms.find(p => p.id === gap.landingId);
    if (!landing || platforms.some(p => p.id === gap.bridge.id)) { this.launching = false; return null; }
    const input = neutralInput(seq);
    const steer = (x: number) => { input.moveX = Math.abs(x - body.x) < 1.5 ? 0 : Math.sign(x - body.x); };
    const supporting = helperId === body.id;
    if (body.y < gap.y - 1) { this.launching = false; return null; }
    if (supporting) {
      if (body.grounded && body.y > gap.y + 1) {
        const floor = platforms.find(p => Math.abs(body.y - p.y) < 1 && body.x + 5 > p.x && body.x - 5 < p.x + p.w);
        steer(floor ? gap.x < floor.x + floor.w / 2 ? floor.x - 8 : floor.x + floor.w + 8 : gap.x);
      } else steer(gap.x);
      return input;
    }
    if (body.y >= landing.y - 1 && body.grounded) { this.launching = false; return null; }
    const helper = allies.find(p => p.id === helperId) ?? allies.find(p => p.id !== body.id && p.grounded && Math.abs(p.y - gap.y) < 1 && Math.abs(p.x - gap.x) < 5);
    const ready = helper && helper.protection <= 0 && Math.abs(helper.y - gap.y) < 1 && Math.abs(helper.x - gap.x) < 5;
    if (body.grounded && body.y <= gap.y + 2) {
      this.launching = false;
      if (!ready || body.protection > 0) { steer(gap.x + (landing.x + landing.w / 2 > gap.x ? -18 : 18)); return input; }
      steer(helper.x); input.jump = !body.jumpHeld;
    } else if (body.grounded && body.y >= gap.y + PLAYER_HEIGHT - 1) {
      this.launching = true; steer(landing.x + landing.w / 2); input.jump = !body.jumpHeld;
    } else {
      steer(this.launching ? landing.x + landing.w / 2 : helper?.x ?? gap.x);
      input.jump = body.jumpHeld;
    }
    return input;
  }
}

/** Use only grounded, unprotected shoulders for client-side landing prediction. */
export function shoulderPlatforms(body: Body, others: readonly Body[]): Platform[] {
  if (body.protection > 0 || inSafeCamp(body)) return [];
  return others.filter(p => p.id !== body.id && p.grounded && p.protection <= 0 && !inSafeCamp(p) && body.y >= p.y + PLAYER_HEIGHT - 1)
    .map(p => ({ id: `shoulder:${p.id}`, x: p.x - 5, y: p.y + PLAYER_HEIGHT, w: 10, h: 1, kind: 'stone' as const }));
}
