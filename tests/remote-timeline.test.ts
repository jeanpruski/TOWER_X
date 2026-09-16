import { expect, it } from 'vitest';
import { RemoteTimeline } from '../apps/web/src/game/remote-timeline';

it('absorbs uneven and bunched snapshots without rewinding or running past the server', () => {
  const timeline = new RemoteTimeline();
  const packets = [
    { at: 0, tick: 1200 }, { at: 180, tick: 1206 }, { at: 410, tick: 1212 },
    { at: 600, tick: 1218 }, { at: 620, tick: 1220 }, { at: 850, tick: 1226 },
    { at: 1050, tick: 1232 }, { at: 1250, tick: 1238 },
  ];
  let next = 0, latest = 1200, previous = 1200;
  for (let now = 0; now <= 1500; now += 10) {
    while (packets[next] && packets[next]!.at <= now) {
      const packet = packets[next++]!; timeline.receive(packet.tick, packet.at); latest = packet.tick;
    }
    const tick = timeline.sample(now);
    expect(tick).toBeGreaterThanOrEqual(previous);
    expect(tick).toBeLessThanOrEqual(latest);
    expect(tick - previous).toBeLessThanOrEqual(0.346); // 30 Hz, at most 15% faster.
    previous = tick;
    expect(timeline.delay).toBeGreaterThanOrEqual(100); expect(timeline.delay).toBeLessThanOrEqual(250);
  }
  // If packets stop, hold the last confirmed state rather than inventing motion.
  expect(timeline.sample(2500)).toBe(latest);
  expect(timeline.sample(5000)).toBe(latest);
});

it('returns to a small buffer on a fast connection and resets after a long outage', () => {
  const timeline = new RemoteTimeline();
  timeline.receive(0, 0); timeline.receive(6, 200);
  expect(timeline.delay).toBeGreaterThan(200);
  for (let i = 1; i <= 8; i++) timeline.receive(6 + i * 2, 200 + i * 1000 / 15);
  expect(timeline.delay).toBeCloseTo(100);
  timeline.sample(750);
  timeline.receive(100, 3400);
  expect(timeline.sample(3400)).toBe(100);
  timeline.receive(90, 3410); // Stale packet cannot reset the view.
  expect(timeline.sample(3410)).toBe(100);
  timeline.reset(); timeline.receive(2, 3500);
  expect(timeline.sample(3500)).toBe(2);
  expect(timeline.delay).toBe(100);
});

it('starts near the current buffered state if rendering loads after the connection', () => {
  const timeline = new RemoteTimeline();
  for (let i = 0; i <= 3; i++) timeline.receive(1200 + i * 6, i * 200);
  const tick = timeline.sample(600);
  expect(tick).toBeGreaterThan(1209); expect(tick).toBeLessThan(1218);
});
