import { afterEach, expect, it, vi } from 'vitest';
import { randomInt } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROBE_COLORS, COMMON_MASKS, COMMON_HATS, COMMON_SHOES } from '@tower/shared';
import { Store } from '../apps/game-server/src/store';

vi.mock('node:crypto', async importOriginal => {
  const crypto = await importOriginal<typeof import('node:crypto')>();
  return { ...crypto, randomInt: vi.fn((min: number, max?: number) => max === undefined ? crypto.randomInt(min) : crypto.randomInt(min, max)) };
});
afterEach(() => vi.clearAllMocks());

it('draws each new costume from server randomness and preserves it when reopening the profile', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tower-appearance-'));
  const file = join(directory, 'world.json');
  const store = await Store.open(file);
  try {
    vi.mocked(randomInt).mockClear();
    vi.mocked(randomInt).mockImplementationOnce(() => 9).mockImplementationOnce(() => COMMON_MASKS.indexOf('slime')).mockImplementationOnce(() => COMMON_HATS.indexOf('sprout')).mockImplementationOnce(() => COMMON_SHOES.indexOf('flippers')).mockImplementationOnce(() => 29);
    const first = store.createGuest();
    vi.mocked(randomInt).mockImplementationOnce(() => 2).mockImplementationOnce(() => 7).mockImplementationOnce(() => 9).mockImplementationOnce(() => 1).mockImplementationOnce(() => 34);
    const second = store.createGuest();
    expect(first.color).toBe(ROBE_COLORS[9]); expect(second.color).toBe(ROBE_COLORS[2]);
    expect(first).toMatchObject({ mask: 'slime', hat: 'sprout', shoes: 'flippers', shoeColor: ROBE_COLORS[29], hatColor: null, unlockedCosmetics: [] });
    expect(second).toMatchObject({ mask: COMMON_MASKS[7], hat: COMMON_HATS[9], shoes: 'sneakers', shoeColor: ROBE_COLORS[34] });
    expect(randomInt).toHaveBeenNthCalledWith(1, ROBE_COLORS.length);
    expect(randomInt).toHaveBeenNthCalledWith(2, COMMON_MASKS.length);
    expect(randomInt).toHaveBeenNthCalledWith(3, COMMON_HATS.length);
    expect(randomInt).toHaveBeenNthCalledWith(4, COMMON_SHOES.length);
    expect(randomInt).toHaveBeenNthCalledWith(5, ROBE_COLORS.length);
    await store.flush();
    const restored = await Store.open(file);
    try { expect(restored.profile(first.id)).toEqual(first); expect(restored.profile(second.id)).toEqual(second); }
    finally { await restored.close(); }
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});
