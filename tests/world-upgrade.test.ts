import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyDatabase } from '@tower/db';
import { WORLD_VERSION, DEFAULT_COSTUME_DETAILS } from '@tower/shared';
import { createBody, generateChunk, stepBody } from '@tower/game-core';
import { DT, neutralInput } from '@tower/shared';
import { Store } from '../apps/game-server/src/store';

it.each([1, 6, 7, 8, 9, WORLD_VERSION])('upgrades terrain version %i while preserving the seed, profiles, records and safe camp coordinates', async version => {
  const dir = await mkdtemp(join(tmpdir(), 'tower-version-')), file = join(dir, 'world.json');
  const state = emptyDatabase(); state.world = { seed: 42, version, frontier: 420 };
  state.profiles.push({ id: 'returning', userId: null, guestIdentity: 'guest', displayName: 'Mousse', color: '#c6ed80', personalBest: 427, lastCamp: 20, createdAt: new Date().toISOString(), settings: {}, camps: [0, 5, 10, 15, 20] });
  const collector = { ...state.profiles[0]!, id: 'collector', mask: 'verdant', hat: 'phoenix', shoes: 'flippers', shoeColor: '#55a3e6', hatColor: '#d676ca', unlockedCosmetics: ['mask:verdant', 'hat:phoenix'], openedRelicBands: [0, 4, 20] };
  state.profiles.push(collector);
  await writeFile(file, JSON.stringify(state));
  try {
    const store = await Store.open(file);
    try {
      expect(store.state.world).toEqual({ ...state.world, version: WORLD_VERSION });
      expect(store.state.profiles).toEqual([{ ...state.profiles[0]!, ...DEFAULT_COSTUME_DETAILS, mask: 'ivory', hat: 'top-hat', unlockedCosmetics: [], openedRelicBands: [] }, collector]);
      const body = createBody('returning', store.profile('returning')!.lastCamp);
      stepBody(body, neutralInput(), generateChunk(42, 20).platforms, DT);
      expect(body.grounded).toBe(true); expect(body.y).toBe(20 * 216);
    } finally { await store.close(); }
    expect(JSON.parse(await readFile(file, 'utf8')).world.version).toBe(WORLD_VERSION);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
