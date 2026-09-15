import { expect, it } from 'vitest';
import { difficultyAtChunk, DIFFICULTY_LEVELS, CHUNK_HEIGHT, WORLD_WIDTH } from '@tower/shared';
import { generateChunk, isRoutePlatform, TEMPLATES, validateCooperativeRoute, validateRoute } from '@tower/game-core';

it('makes equivalent architecture less forgiving as altitude increases, including rooms far above the final band', () => {
  const seeds = [...Array.from({ length: 20 }, (_, i) => i + 1), 42, 2026, 123456, 0xffffffff];
  const bands = DIFFICULTY_LEVELS.map(level => seeds.flatMap(seed => Array.from({ length: level.level === 1 ? 5 : 25 }, (_, i) => generateChunk(seed, level.fromChunk + i)).filter(c => !c.cooperation && c.difficulty === level.level)));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const widths = bands.map(chunks => mean(chunks.flatMap(c => c.platforms.filter(p => isRoutePlatform(p) && p.y > c.entry.y).map(p => p.w))));
  for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!);
  for (const c of bands[0]!) {
    const levels = [...c.platforms.filter(isRoutePlatform).map(p => p.y), c.exit.y].sort((a, b) => a - b);
    expect(Math.max(...levels.slice(1).map((y, i) => y - levels[i]!))).toBeLessThanOrEqual(48);
    expect(c.platforms.filter(p => isRoutePlatform(p) && p.y > c.entry.y).every(p => p.w >= 56)).toBe(true);
  }
  for (const level of DIFFICULTY_LEVELS) {
    expect(difficultyAtChunk(level.fromChunk)).toBe(level);
    if (level.fromChunk > 0) expect(difficultyAtChunk(level.fromChunk - 1).level).toBe(level.level - 1);
  }
  // Every template at each later band, with the same architectural coordinates and safe joins.
  for (const template of TEMPLATES) {
    const rooms = bands.slice(1).map(chunks => chunks.find(c => c.id === template.id)!);
    expect(rooms.every(Boolean)).toBe(true);
    const firstWidths = rooms.map(c => c.platforms[1]!.w);
    for (let i = 1; i < firstWidths.length; i++) expect(firstWidths[i]!).toBeLessThanOrEqual(firstWidths[i - 1]!);
  }
  for (const seed of seeds) for (const index of [249, 250, 251, 252, 253, 9998, 9999, 10000]) {
    const chunk = generateChunk(seed, index);
    expect(chunk.difficulty).toBe(5);
    expect(chunk.entry).toEqual({ x: WORLD_WIDTH / 2, y: index * CHUNK_HEIGHT });
    expect(chunk.cooperation ? validateCooperativeRoute(chunk) : validateRoute(chunk)).toMatchObject({ valid: true });
  }
});

it('introduces combined mechanisms only at later bands and keeps actual camp floors stable', () => {
  for (const seed of [1, 42, 2026]) for (let index = 0; index < 100; index++) {
    const c = generateChunk(seed, index);
    if (c.cooperation) { expect(c.mechanisms).toEqual([]); continue; }
    if (c.difficulty < 4) expect(c.mechanisms.length).toBeLessThanOrEqual(1);
    if (c.difficulty >= 4) expect(c.mechanisms).toContainEqual({ platformId: `${index}:2`, kind: 'crumble' });
    if (c.difficulty === 5) expect(c.mechanisms.length).toBeGreaterThanOrEqual(2);
    for (const m of c.mechanisms) expect(c.platforms.find(p => p.id === m.platformId)?.kind).not.toBe('camp');
  }
});
