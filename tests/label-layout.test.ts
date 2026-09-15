import { describe, expect, it } from 'vitest';
import { overlaps, placeLabels, projectScreenPoint, type MeasuredLabel } from '../apps/web/src/game/label-layout';

describe('crisp world text', () => {
  it('pins labels to the source pixel actually sampled by the barrel shader, including corners', () => {
    for (const x of [0, 20, 80, 160, 240, 300, 320]) for (const y of [0, 10, 50, 100, 180, 200]) {
      const projected = projectScreenPoint({ x, y }, true);
      const px = projected.x / 160 - 1, py = projected.y / 100 - 1;
      expect((px * (1 + 0.06 * py * py) + 1) * 160).toBeCloseTo(x, 6);
      expect((py * (1 + 0.06 * px * px) + 1) * 100).toBeCloseTo(y, 6);
      expect(projectScreenPoint({ x, y }, false)).toEqual({ x, y });
    }
  });

  it('keeps crowded mobile labels apart, inside the frame and clear of characters', () => {
    const labels: MeasuredLabel[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), text: `Aventurier ${i}`, kind: 'player', color: '#ffffff', priority: i,
      x: 170 + i * 2, y: 155, w: 126, h: 24,
    }));
    const character = { x: 155, y: 165, w: 32, h: 38 };
    const placed = placeLabels(labels, 360, 225, [character]);
    expect(placed.length).toBeGreaterThanOrEqual(3);
    expect(placed[0]!.id).toBe('0');
    for (const [i, label] of placed.entries()) {
      const rect = { x: label.left, y: label.top, w: label.w, h: label.h };
      expect(rect.x).toBeGreaterThanOrEqual(8); expect(rect.x + rect.w).toBeLessThanOrEqual(352);
      expect(rect.y).toBeGreaterThanOrEqual(34); expect(rect.y + rect.h).toBeLessThanOrEqual(217);
      expect(overlaps(rect, character)).toBe(false);
      expect(label.h).toBe(24);
      for (const other of placed.slice(i + 1)) expect(overlaps(rect, { x: other.left, y: other.top, w: other.w, h: other.h })).toBe(false);
    }
  });

  it('prioritizes an imminent hazard over names and discards offscreen anchors', () => {
    const base: MeasuredLabel = { id: 'name', text: 'Mage', kind: 'player', color: '#fff', priority: 10, x: 300, y: 110, w: 140, h: 26 };
    const result = placeLabels([base, { ...base, id: 'warning', kind: 'warning', text: 'Ça craque !', priority: 0 }, { ...base, id: 'offscreen', y: -20 }], 600, 375);
    expect(result[0]!.id).toBe('warning');
    expect(result.some(label => label.id === 'name')).toBe(true);
    expect(result.some(label => label.id === 'offscreen')).toBe(false);
  });

  it('keeps the missing-floor countdown visible on mobile when ledges block the space above it', () => {
    const warning: MeasuredLabel = { id: 'hole', text: 'Dalle absente · 5 s', kind: 'warning', color: '#ffd497', priority: 3, x: 110, y: 126, w: 133, h: 24 };
    const obstacles = [{ x: 0, y: 34, w: 360, h: 89 }, { x: 164, y: 140, w: 28, h: 40 }, { x: 145, y: 180, w: 70, h: 8 }];
    const [placed] = placeLabels([warning], 360, 225, obstacles);
    expect(placed).toBeDefined(); expect(placed!.top).toBeGreaterThan(warning.y);
    for (const obstacle of obstacles) expect(overlaps({ x: placed!.left, y: placed!.top, w: placed!.w, h: placed!.h }, obstacle)).toBe(false);
  });
});
