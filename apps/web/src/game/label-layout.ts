export const SCREEN_CURVATURE = 0.06;
export interface Point { x: number; y: number; }
export interface LabelRect extends Point { w: number; h: number; }
export interface WorldLabel extends Point {
  id: string;
  kind: 'player' | 'bot' | 'rare' | 'pickup' | 'warning' | 'coop' | 'effect' | 'debug';
  text: string;
  color: string;
  priority: number;
}
export interface MeasuredLabel extends WorldLabel { w: number; h: number; }
export interface PlacedLabel extends MeasuredLabel { left: number; top: number; }
export interface WorldAnnotations { labels: WorldLabel[]; obstacles: LabelRect[]; }

// The shader samples the source at p * (1 + curvature * p.yx²).
// Invert that mapping for an anchor; the letters themselves remain undistorted.
export function projectScreenPoint(point: Point, curved: boolean): Point {
  if (!curved) return point;
  const sx = point.x / 160 - 1, sy = point.y / 100 - 1;
  let x = sx, y = sy;
  for (let i = 0; i < 8; i++) {
    x = sx / (1 + SCREEN_CURVATURE * y * y);
    y = sy / (1 + SCREEN_CURVATURE * x * x);
  }
  return { x: (x + 1) * 160, y: (y + 1) * 100 };
}

export function overlaps(a: LabelRect, b: LabelRect, gap = 3) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

// All sizes here are CSS pixels, including on phones. Reserve the top HUD,
// stagger crowded names, and omit overflow instead of shrinking the font.
export function placeLabels(labels: MeasuredLabel[], width: number, height: number, obstacles: LabelRect[] = []): PlacedLabel[] {
  const placed: PlacedLabel[] = [], occupied = [...obstacles];
  const top = width < 520 ? 34 : 46, margin = 8;
  for (const label of [...labels].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    if (label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue;
    const candidates = [
      [0, 0], [0, -label.h - 4], [0, -2 * (label.h + 4)],
      [-label.w / 2 - 12, 0], [label.w / 2 + 12, 0],
      [0, -3 * (label.h + 4)],
      // Wider beginner ledges can block every centered position. Try above
      // either shoulder too, keeping names clear of the character and floors.
      [-label.w / 2 - 12, -label.h - 4], [label.w / 2 + 12, -label.h - 4],
      [-label.w / 2 - 12, -2 * (label.h + 4)], [label.w / 2 + 12, -2 * (label.h + 4)],
      [-label.w / 2 - 12, -3 * (label.h + 4)], [label.w / 2 + 12, -3 * (label.h + 4)],
    ];
    // An empty ledge can have solid floors immediately above it. Let its warning
    // use the space below or beside the hole without covering those floors.
    if (label.kind === 'warning') candidates.push(
      [0, label.h + 8], [-label.w / 2 - 12, label.h + 8], [label.w / 2 + 12, label.h + 8],
    );
    for (const [dx, dy] of candidates) {
      const rect = {
        x: Math.round(Math.max(margin, Math.min(width - margin - label.w, label.x - label.w / 2 + dx!))),
        y: Math.round(Math.max(top, label.y - label.h) + dy!), w: label.w, h: label.h,
      };
      if (rect.y < top || rect.y + rect.h > height - margin || occupied.some(other => overlaps(rect, other))) continue;
      placed.push({ ...label, left: rect.x, top: rect.y }); occupied.push(rect);
      break;
    }
    if (placed.length >= (width < 520 ? 12 : 24)) break;
  }
  return placed;
}
