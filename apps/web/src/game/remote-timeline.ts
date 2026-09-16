import { TICK_RATE } from '@tower/shared';

const TICK_MS = 1000 / TICK_RATE;

/** A bounded playback clock for remote characters, never used for collisions. */
export class RemoteTimeline {
  private latest?: { tick: number; at: number };
  private intervals: number[] = [];
  private cursor = 0;
  private lastFrame?: number;
  delay = 100;

  reset() {
    this.latest = undefined; this.intervals = []; this.cursor = 0;
    this.lastFrame = undefined; this.delay = 100;
  }

  receive(tick: number, at: number) {
    if (this.latest && tick <= this.latest.tick) return;
    // A long outage starts a fresh view instead of replaying old movement.
    if (this.latest && at - this.latest.at > 1000) this.reset();
    if (this.latest) {
      // HTTP may deliver fewer snapshots, or deliver them in bursts. Account
      // for both the arrival cadence and the amount of server time covered.
      this.intervals.push(Math.max(at - this.latest.at, (tick - this.latest.tick) * TICK_MS));
      if (this.intervals.length > 8) this.intervals.shift();
      this.delay = Math.max(100, Math.min(250, Math.max(...this.intervals) + TICK_MS));
    } else this.cursor = tick;
    this.latest = { tick, at };
  }

  sample(now: number) {
    if (!this.latest) return 0;
    const desired = this.latest.tick + (now - this.latest.at - this.delay) / TICK_MS;
    const elapsed = this.lastFrame === undefined ? 0 : Math.max(0, now - this.lastFrame);
    if (this.lastFrame === undefined || elapsed > 1000) this.cursor = Math.max(this.cursor, desired);
    else {
      // Absorb jitter and buffer changes by gently changing playback speed.
      // Never rewind a character when a packet arrives or the delay increases.
      const speed = Math.max(0.85, Math.min(1.15, 1 + (desired - this.cursor) * 0.04));
      this.cursor += elapsed / TICK_MS * speed;
    }
    this.lastFrame = now;
    // Do not extrapolate movement through an unseen collision or past a landing.
    this.cursor = Math.min(this.cursor, this.latest.tick);
    return this.cursor;
  }
}
