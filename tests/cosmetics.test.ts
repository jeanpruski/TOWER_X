import { expect, it } from 'vitest';
import { BIOMES, DEFAULT_COSTUME_DETAILS, COMMON_SHOES, RARE_SHOES, RARE_FACES, equippedRares, ROBE_COLORS, appearanceSchema, COMMON_HATS, COMMON_MASKS, COMMON_FACE_STYLES, FACE_STYLES, HEAD_STYLES, isFaceStyle, RARE_COSMETICS, RELIC_INTERVAL_CHUNKS, biomeAtChunk, canEquip, normalizeCosmetics, DT, neutralInput } from '@tower/shared';
import { createBody, generateChunk, mechanismPlatforms, stepBody, TowerMechanisms, touchesHazard, touchesPickup } from '@tower/game-core';

it('offers eight rare pieces in each category and requires their individual unlocks in every slot', () => {
  expect(RARE_COSMETICS).toHaveLength(32);
  expect(new Set(RARE_COSMETICS.map(r => r.id)).size).toBe(32);
  expect(RARE_FACES).toHaveLength(8); expect(FACE_STYLES).toHaveLength(26);
  expect(RARE_SHOES).toHaveLength(8);
  expect(RARE_COSMETICS.filter(r => r.slot === 'hat')).toHaveLength(8);
  expect(RARE_COSMETICS.filter(r => r.slot === 'mask' && !isFaceStyle(r.item))).toHaveLength(8);
  for (const rare of RARE_COSMETICS) {
    const locked = normalizeCosmetics({ [rare.slot]: rare.item, unlockedCosmetics: ['invented'] });
    expect(locked[rare.slot]).not.toBe(rare.item);
    const owned = normalizeCosmetics({ [rare.slot]: rare.item, unlockedCosmetics: [rare.id, rare.id] });
    expect(owned[rare.slot]).toBe(rare.item); expect(owned.unlockedCosmetics).toEqual([rare.id]);
    expect(equippedRares(owned.mask, owned.hat, owned.shoes)).toEqual([rare]);
  }
});

it('keeps all five biomes and offers the expanded common wardrobe without rare unlocks', () => {
  expect(COMMON_MASKS).toHaveLength(48); expect(COMMON_HATS).toHaveLength(38);
  expect(COMMON_FACE_STYLES).toHaveLength(18); expect(HEAD_STYLES).toHaveLength(8);
  expect(new Set(COMMON_MASKS).size).toBe(COMMON_MASKS.length); expect(new Set(COMMON_HATS).size).toBe(COMMON_HATS.length);
  for (const mask of COMMON_FACE_STYLES) {
    expect(isFaceStyle(mask)).toBe(true);
    for (const hat of HEAD_STYLES) expect(normalizeCosmetics({ mask, hat })).toEqual({ ...DEFAULT_COSTUME_DETAILS, mask, hat, unlockedCosmetics: [] });
  }
  for (const item of COMMON_MASKS) expect(canEquip('mask', item, [])).toBe(true);
  for (const item of COMMON_HATS) expect(canEquip('hat', item, [])).toBe(true);
  for (const item of RARE_COSMETICS) { expect(canEquip(item.slot, item.item, [])).toBe(false); expect(canEquip(item.slot, item.item, [item.id])).toBe(true); }
  for (let index = 0; index < 100; index++) {
    const chunk = generateChunk(42, index);
    expect(chunk.biome).toBe(BIOMES[Math.floor(index / 5) % 5]!.id);
    expect(chunk.biome).toBe(biomeAtChunk(index).id);
  }
});

it('keeps scarce coffers stable but draws their contents with replacement', () => {
  const layouts = new Set<string>();
  for (const seed of [1, 42, 2026, 123456, 0xffffffff]) {
    const discoveries: { index: number; id: string }[] = [];
    for (let index = 0; index < RELIC_INTERVAL_CHUNKS * RARE_COSMETICS.length * 2; index++) {
      const chunk = generateChunk(seed, index);
      if (!chunk.relics.length) continue;
      expect(chunk.cooperation).toBeUndefined(); expect(chunk.relics).toHaveLength(1);
      expect(chunk.relics).toEqual(generateChunk(seed, index).relics);
      discoveries.push({ index, id: chunk.relics[0]!.cosmeticId });
    }
    expect(discoveries).toHaveLength(RARE_COSMETICS.length * 2);
    expect(discoveries[0]!.index).toBeGreaterThanOrEqual(20);
    const gaps = discoveries.slice(1).map((d, i) => d.index - discoveries[i]!.index);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(21); expect(Math.max(...gaps)).toBeLessThanOrEqual(39);
    expect(new Set(gaps).size).toBeGreaterThan(1);
    expect(new Set(discoveries.slice(0, RARE_COSMETICS.length).map(d => d.id)).size).toBeLessThan(RARE_COSMETICS.length);
    layouts.add(discoveries.map(d => `${d.index}:${d.id}`).join(','));
  }
  expect(layouts.size).toBe(5);
});

it('normalizes legacy and corrupt accessories without granting rare items', () => {
  expect(normalizeCosmetics({ shoes: 'invented', shoeColor: 'red', hatColor: '#000000' })).toEqual({ ...DEFAULT_COSTUME_DETAILS, mask: 'ivory', hat: 'top-hat', unlockedCosmetics: [] });
  expect(normalizeCosmetics({})).toEqual({ ...DEFAULT_COSTUME_DETAILS, mask: 'ivory', hat: 'top-hat', unlockedCosmetics: [] });
  expect(normalizeCosmetics({ mask: 'astral', hat: 'invented', unlockedCosmetics: ['unknown', 'mask:verdant', 'mask:verdant'] })).toEqual({ ...DEFAULT_COSTUME_DETAILS, mask: 'ivory', hat: 'top-hat', unlockedCosmetics: ['mask:verdant'] });
  expect(normalizeCosmetics({ mask: 'verdant', hat: 'phoenix', unlockedCosmetics: ['mask:verdant', 'hat:phoenix'] })).toEqual({ ...DEFAULT_COSTUME_DETAILS, mask: 'verdant', hat: 'phoenix', unlockedCosmetics: ['mask:verdant', 'hat:phoenix'] });
});

it('lets a solo player reach every rare coffer from the mandatory route without a power-up or hazard contact', () => {
  for (const seed of [1, 42, 2026, 123456, 0xffffffff]) for (let index = 0; index < RELIC_INTERVAL_CHUNKS * RARE_COSMETICS.length; index++) {
    const chunk = generateChunk(seed, index);
    for (const relic of chunk.relics) {
      const reached = chunk.platforms.filter(p => !p.id.endsWith(':side')).some(floor => {
        for (const startX of [floor.x + floor.w / 2, floor.x + 4, floor.x + floor.w - 4]) for (const jumpTicks of [90, 0, 2, 6, 10, 15]) {
          const body = createBody('collector'), mechanisms = new TowerMechanisms();
          const actualFloor = mechanismPlatforms([chunk], 0).find(p => p.id === floor.id)!;
          Object.assign(body, { x: startX + actualFloor.x - floor.x, y: floor.y, protection: 0 });
          for (let tick = 0; tick < 90; tick++) {
            const dx = relic.x - body.x;
            mechanisms.update([chunk], [body], tick);
            stepBody(body, { ...neutralInput(tick), moveX: Math.abs(dx) < 2 ? 0 : Math.sign(dx), jump: tick < jumpTicks }, mechanismPlatforms([chunk], tick, mechanisms.states()), DT);
            if (touchesHazard(body, [chunk]) || body.y < chunk.entry.y - 10) break;
            if (touchesPickup(body, relic)) return true;
          }
        }
        return false;
      });
      expect(reached, `seed ${seed}, chunk ${index}, ${chunk.id}`).toBe(true);
    }
  }
});

it('accepts independent palette colors and shoe styles while rejecting arbitrary appearance data', () => {
  expect(ROBE_COLORS).toHaveLength(48); expect(new Set(ROBE_COLORS).size).toBe(48);
  for (const shoes of COMMON_SHOES) expect(canEquip('shoes', shoes, [])).toBe(true);
  const look = { displayName: 'Coloriste', color: '#ef665f', shoes: 'flippers', shoeColor: '#55a3e6', hatColor: '#d676ca' };
  expect(appearanceSchema.parse(look)).toEqual(look);
  expect(appearanceSchema.parse({ ...look, hatColor: null }).hatColor).toBeNull();
  for (const patch of [{ shoes: 'flying' }, { shoeColor: '#000000' }, { hatColor: 'red' }, { speed: 900 }]) expect(appearanceSchema.safeParse({ ...look, ...patch }).success).toBe(false);
});
