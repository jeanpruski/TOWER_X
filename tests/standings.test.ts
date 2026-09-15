import { describe, expect, it } from 'vitest';
import { nearbyStandingsSchema, PIXELS_PER_METER, ROBE_COLORS, CHUNK_HEIGHT, heightInMeters } from '@tower/shared';
import { rankPlayers, standingsAround, type StandingSource } from '../apps/game-server/src/standings';

const player = (id: string, meters: number): StandingSource => ({ id, displayName: `Mage ${id}`, color: ROBE_COLORS[0], y: meters * PIXELS_PER_METER });

describe('live altitude standings', () => {
  it('reports exact heights at chunk boundaries without rounding 240 m down to 239 m', () => {
    for (let chunk = 0; chunk <= 1000; chunk++) expect(heightInMeters(chunk * CHUNK_HEIGHT)).toBe(chunk * 20);
    expect(heightInMeters(12 * CHUNK_HEIGHT - 0.01)).toBe(239);
    expect(heightInMeters(-20)).toBe(0);
  });
  it('keeps only the five preceding and five following ranks, with current heights and signed distances', () => {
    const input = Array.from({ length: 15 }, (_, i) => player(String(i), i * 20));
    const ranked = rankPlayers(input);
    const around = standingsAround(ranked, 7);
    expect(input[0]!.id).toBe('0');
    expect(around.self).toMatchObject({ id: '7', height: 140, rank: 8, delta: 0 });
    expect(around.above.map(p => p.id)).toEqual(['12', '11', '10', '9', '8']);
    expect(around.above.map(p => p.delta)).toEqual([100, 80, 60, 40, 20]);
    expect(around.below.map(p => p.id)).toEqual(['6', '5', '4', '3', '2']);
    expect(around.below.map(p => p.delta)).toEqual([-20, -40, -60, -80, -100]);
    expect(nearbyStandingsSchema.safeParse(around).success).toBe(true);
    expect(nearbyStandingsSchema.safeParse({ ...around, above: [...around.above, around.self] }).success).toBe(false);
  });
  it('keeps each side capped at five at the top and bottom, without filling from the other side', () => {
    const ranked = rankPlayers(Array.from({ length: 15 }, (_, i) => player(String(i), i * 20)));
    expect(standingsAround(ranked, 0)).toMatchObject({ above: [], self: { rank: 1 } });
    expect(standingsAround(ranked, 0).below).toHaveLength(5);
    expect(standingsAround(ranked, 14).above).toHaveLength(5);
    expect(standingsAround(ranked, 14).below).toEqual([]);
    expect(standingsAround([player('solo', 200)], 0)).toMatchObject({ above: [], below: [], self: { rank: 1, delta: 0 } });
  });
  it('orders actual fractional altitudes and gives exact ties a stable order', () => {
    const same = rankPlayers([player('c', 10), player('a', 10), player('b', 10)]);
    expect(same.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(standingsAround(same, 1).above[0]!.delta).toBe(0);
    expect(standingsAround(same, 1).below[0]!.delta).toBe(0);
    const fractional = rankPlayers([player('lower', 10.1), player('upper', 10.9)]);
    expect(standingsAround(fractional, 1).above[0]).toMatchObject({ id: 'upper', height: 10, delta: 0.8 });
  });
  it('reorders on a fall instead of keeping a personal-best ranking', () => {
    const a = player('a', 100), b = player('b', 60), c = player('c', 20);
    expect(rankPlayers([a, b, c])[0]!.id).toBe('a');
    a.y = 0;
    const falling = rankPlayers([a, b, c]);
    expect(falling.map(p => p.id)).toEqual(['b', 'c', 'a']);
    expect(standingsAround(falling, 1).below[0]).toMatchObject({ id: 'a', delta: -20, rank: 3 });
  });
});
