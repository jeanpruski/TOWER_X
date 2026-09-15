import { TICK_RATE, PLAYER_WIDTH, type Body, type Chunk, type CrumbleState, type Platform } from '@tower/shared';

export const CRUMBLE_WARNING_TICKS = Math.round(1.2 * TICK_RATE);
export const CRUMBLE_RESET_TICKS = 5 * TICK_RATE;
export const SPRING_SPEED = 440;

/** Project authoritative mechanism definitions at a simulation tick, including hidden slabs. */
export function mechanismPlatforms(chunks: readonly Chunk[], tick: number, crumbling: readonly CrumbleState[] = []): Platform[] {
  const timers = new Map(crumbling.map(state => [state.platformId, state]));
  return chunks.flatMap(chunk => {
    const mechanisms = new Map(chunk.mechanisms.map(m => [m.platformId, m]));
    return chunk.platforms.map(platform => {
      const mechanism = mechanisms.get(platform.id);
      if (!mechanism) return platform;
      if (mechanism.kind === 'moving') {
        const position = (at: number) => mechanism.amplitude * Math.sin((at + mechanism.phase) * Math.PI * 2 / mechanism.period);
        const offset = position(tick);
        return { ...platform, mechanism: mechanism.kind, x: platform.x + offset, dx: offset - position(tick - 1) };
      }
      const state = timers.get(platform.id);
      return { ...platform, mechanism: mechanism.kind, ...(state && tick < state.restoreTick ? { breakTick: state.breakTick, restoreTick: state.restoreTick, disabled: tick >= state.breakTick } : {}) };
    });
  });
}

/** Touches start a shared countdown once; leaving or joining cannot reset it. */
export class TowerMechanisms {
  private crumbling = new Map<string, CrumbleState>();
  states(): CrumbleState[] { return [...this.crumbling.values()]; }
  update(chunks: readonly Chunk[], bodies: readonly Body[], tick: number) {
    const fragile = mechanismPlatforms(chunks, tick, this.states()).filter(p => p.mechanism === 'crumble');
    const loaded = new Set(fragile.map(p => p.id));
    for (const [id, state] of this.crumbling) if (!loaded.has(id) || tick >= state.restoreTick) this.crumbling.delete(id);
    for (const platform of fragile) {
      if (this.crumbling.has(platform.id)) continue;
      if (bodies.some(body => body.grounded && Math.abs(body.y - platform.y) < 0.1 && body.x + PLAYER_WIDTH / 2 > platform.x && body.x - PLAYER_WIDTH / 2 < platform.x + platform.w)) {
        const breakTick = tick + CRUMBLE_WARNING_TICKS;
        this.crumbling.set(platform.id, { platformId: platform.id, breakTick, restoreTick: breakTick + CRUMBLE_RESET_TICKS });
      }
    }
  }
}
