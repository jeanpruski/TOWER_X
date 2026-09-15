import { CAMP_INTERVAL, CHUNK_HEIGHT, TICK_RATE, WORLD_WIDTH, difficultyAtChunk, type Chunk, type Hazard, type Platform, type PlatformMechanism, type Pickup, type PowerUpKind } from '@tower/shared';
import { biomeAtChunk, RARE_COSMETICS, RELIC_INTERVAL_CHUNKS, type Relic, type CoopGap } from '@tower/shared';

type Step = readonly [x: number, y: number, width: number, style?: Platform['style']];
export interface ChunkTemplate { id: string; name: string; route: readonly Step[]; sides: readonly Step[]; tags: readonly string[]; soloValidated: true; }
// Authored spaces with base rises of 28–64 px, adjusted by the altitude band below.
// The normal held jump reaches 78 px. Every chunk joins at the central 160/216 anchor.
export const TEMPLATES: readonly ChunkTemplate[] = [
  { id: 'first-light', name: 'Les premiers bonds', route: [[160,0,64],[108,42,74,'balcony'],[178,98,38,'pillar'],[242,152,60,'hanging'],[192,184,32]], sides: [[44,78,40,'balcony'],[130,154,26,'rune']], tags: ['balconies','branch'], soloValidated: true },
  { id: 'broken-stair', name: 'Le pont brisé', route: [[160,0,64],[228,48,58,'beam'],[154,104,30,'pillar'],[80,162,64,'beam']], sides: [[46,50,44,'balcony'],[240,110,28,'rune'],[159,176,24,'rune']], tags: ['broken-bridge','branch'], soloValidated: true },
  { id: 'ivy-arcade', name: 'Les arches de lierre', route: [[160,0,64],[92,38,66,'balcony'],[58,100,38,'pillar'],[132,156,92,'beam']], sides: [[212,72,30,'rune'],[218,144,28,'rune']], tags: ['arches','west'], soloValidated: true },
  { id: 'bell-keeper', name: 'Le puits du sonneur', route: [[160,0,64],[96,54,34,'hanging'],[158,112,28,'hanging'],[228,166,42,'hanging']], sides: [[36,70,32,'balcony'],[282,116,36,'balcony']], tags: ['hanging','shaft'], soloValidated: true },
  { id: 'old-aqueduct', name: 'L’aqueduc effondré', route: [[160,0,64],[92,46,76,'beam'],[44,102,32,'balcony'],[106,164,58,'beam']], sides: [[192,70,24,'rune'],[178,142,24,'rune']], tags: ['wall-route','west'], soloValidated: true },
  { id: 'moon-window', name: 'Les balcons lunaires', route: [[160,0,64],[226,42,70,'balcony'],[276,98,32,'balcony'],[212,158,46,'hanging']], sides: [[116,72,26,'rune'],[132,144,26,'rune']], tags: ['wall-route','east'], soloValidated: true },
  { id: 'split-crown', name: 'Les deux couronnes', route: [[160,0,64],[102,56,32,'pillar'],[172,100,86,'beam'],[236,160,30,'pillar']], sides: [[226,60,28,'rune'],[112,144,32,'rune']], tags: ['pillars','fork'], soloValidated: true },
  { id: 'dusty-library', name: 'La bibliothèque suspendue', route: [[160,0,64],[220,32,94,'beam'],[152,94,34,'hanging'],[82,152,66,'beam'],[128,188,28,'hanging']], sides: [[278,100,36,'balcony'],[42,94,36,'balcony']], tags: ['shelves','hanging'], soloValidated: true },
  { id: 'moss-gallery', name: 'La galerie des piliers', route: [[160,0,64],[104,58,30,'pillar'],[52,116,28,'pillar'],[122,168,32,'pillar']], sides: [[216,66,52,'beam'],[184,138,24,'rune']], tags: ['pillars','precision'], soloValidated: true },
  { id: 'sleeping-guard', name: 'Le chemin de ronde', route: [[160,0,64],[224,40,86,'balcony'],[276,92,32,'balcony'],[214,150,70,'beam'],[168,182,28,'pillar']], sides: [[110,70,26,'rune'],[122,142,26,'rune']], tags: ['battlements','east'], soloValidated: true },
  { id: 'fallen-chapel', name: 'La chapelle fendue', route: [[160,0,64],[88,50,60,'beam'],[150,110,28,'pillar'],[222,166,64,'beam']], sides: [[42,118,44,'balcony'],[272,64,48,'balcony']], tags: ['broken-bridge','arches'], soloValidated: true },
  { id: 'watchers-path', name: 'Les sauts du guetteur', route: [[160,0,64],[236,44,36,'hanging'],[164,108,28,'hanging'],[90,164,36,'hanging']], sides: [[54,62,68,'balcony'],[262,134,36,'balcony']], tags: ['long-jumps','hanging'], soloValidated: true },
  { id: 'fern-stair', name: 'La corniche aux fougères', route: [[160,0,64],[98,40,54,'balcony'],[42,96,36,'balcony'],[98,152,44,'balcony'],[154,184,30,'pillar']], sides: [[206,68,26,'rune'],[192,138,26,'rune']], tags: ['wall-route','west'], soloValidated: true },
  { id: 'sunken-belfry', name: 'Le beffroi ajouré', route: [[160,0,64],[216,60,28,'pillar'],[270,114,36,'balcony'],[204,172,30,'pillar']], sides: [[112,70,26,'rune'],[120,142,26,'rune']], tags: ['pillars','east'], soloValidated: true },
  { id: 'lantern-walk', name: 'La traverse des lanternes', route: [[160,0,64],[92,38,60,'hanging'],[158,94,30,'hanging'],[234,152,52,'hanging'],[190,184,28,'pillar']], sides: [[42,106,44,'balcony'],[278,78,36,'balcony']], tags: ['hanging','long-jumps'], soloValidated: true },
  { id: 'forgotten-hall', name: 'La salle aux détours', route: [[160,0,64],[230,54,72,'beam'],[170,112,28,'pillar'],[96,166,84,'beam']], sides: [[98,54,30,'rune'],[236,128,26,'rune']], tags: ['fork','galleries'], soloValidated: true },
  { id: 'root-vault', name: 'Les racines du donjon', route: [[160,0,64],[104,32,82,'beam'],[50,92,30,'pillar'],[116,154,60,'balcony'],[176,184,30,'pillar']], sides: [[222,70,26,'rune'],[192,140,26,'rune']], tags: ['arches','west'], soloValidated: true },
  { id: 'starlit-arch', name: 'L’arche étoilée', route: [[160,0,64],[226,54,32,'pillar'],[166,108,90,'beam'],[96,164,32,'pillar']], sides: [[46,78,44,'balcony'],[274,130,40,'balcony']], tags: ['arches','pillars'], soloValidated: true },
  { id: 'pilgrims-rest', name: 'Les terrasses du pèlerin', route: [[160,0,64],[108,44,92,'balcony'],[172,100,46,'hanging'],[230,146,88,'beam'],[186,182,38,'pillar']], sides: [[44,112,48,'balcony'],[112,164,26,'rune']], tags: ['terraces','gentle'], soloValidated: true },
  { id: 'emerald-spire', name: 'L’aiguille émeraude', route: [[160,0,64],[100,62,28,'pillar'],[162,118,26,'pillar'],[222,174,30,'pillar']], sides: [[228,62,28,'rune'],[94,138,30,'rune']], tags: ['precision','fork'], soloValidated: true },
];

export function hash(seed: number, index: number): number {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
}

export function templateIndex(seed: number, index: number): number {
  // A seeded offset plus a coprime stride gives all 20 templates per cycle, without repetition.
  const stride = [3, 7, 9, 11, 13, 17][hash(seed, 0) % 6]!;
  const ordinaryIndex = index - Math.floor((index + 1) / 5);
  return (hash(seed, 1) % TEMPLATES.length + ordinaryIndex * stride) % TEMPLATES.length;
}

export function relicForChunk(seed: number, index: number) {
  const band = Math.floor(index / RELIC_INTERVAL_CHUNKS);
  // Keep 420–780 m between coffers, away from the two-person gaps. Draw from
  // the full pool independently for each band, with replacement. No reroll on reconnect.
  const offsets = [20, 21, 22, 24, 25, 26, 27, 29];
  const offset = offsets[hash(seed ^ 0x51ed270b, band) % offsets.length]!;
  if (index % RELIC_INTERVAL_CHUNKS !== offset) return undefined;
  return RARE_COSMETICS[hash(seed ^ 0x72617265, band) % RARE_COSMETICS.length];
}

export function generateChunk(seed: number, index: number): Chunk {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid chunk index');
  const template = TEMPLATES[templateIndex(seed, index)]!;
  const variation = hash(seed, index);
  const mirror = variation % 2 === 0;
  const base = index * CHUNK_HEIGHT;
  const camp = index % CAMP_INTERVAL === 0;
  const challenge = difficultyAtChunk(index), difficulty = challenge.level;
  // A marked two-person gap before each camp, separate from relic-bearing chunks.
  if (index % 5 === 3) {
    const flip = (x: number) => mirror ? WORLD_WIDTH - x : x;
    const platform = (step: number, x: number, y: number, w: number, style: Platform['style']): Platform => ({ id: `${index}:${step}`, x: flip(x) - w / 2, y: base + y, w, h: 8, kind: 'stone', style });
    const precision = (difficulty - 1) * 4;
    const platforms = [platform(0, 160, 0, 64, 'beam'), platform(1, 112, 56, 104, 'balcony'), platform(2, 184, 144, 64 - precision, 'hanging'), platform(3, 210, 180, 52, 'beam')];
    const cooperation: CoopGap = { id: `${index}:coop`, x: flip(144), y: base + 56, landingId: `${index}:2`, bridge: { ...platform(4, 160, 100, 52, 'rune'), id: `${index}:coop-bridge` } };
    return { index, id: 'together-gap', name: 'La brèche des compagnons', biome: biomeAtChunk(index).id, seed: variation, width: WORLD_WIDTH, height: CHUNK_HEIGHT, difficulty, entry: { x: 160, y: base }, exit: { x: 160, y: base + CHUNK_HEIGHT }, platforms, hazards: [], mechanisms: [], pickups: [{ id: `${index}:pickup:0`, kind: 'bubble', x: flip(210), y: base + 189 }], relics: [], tags: ['cooperative', 'shoulder-boost'], soloValidated: false, camp: false, cooperation };
  }
  const platforms: Platform[] = template.route.map(([center, y, width, style], step) => {
    const isCamp = camp && step === 0;
    const x = step === 0 ? 160 : (mirror ? WORLD_WIDTH - center : center) + ((variation >>> (step * 3)) % 5 - 2);
    const w = index === 0 && step === 0 ? 280 : isCamp ? 108 : step === 0 ? 64 : Math.max(challenge.minWidth, width + challenge.widthBonus);
    const riseShift = step === 0 ? 0 : (step % 2 ? 1 : -1) * challenge.riseShift;
    return { id: `${index}:${step}`, x: Math.max(20, Math.min(300 - w, x - w / 2)), y: base + y + riseShift, w, h: isCamp ? 12 : style === 'beam' ? 6 : style === 'pillar' ? 10 : 8, kind: isCamp ? 'camp' : step % 3 === 1 ? 'moss' : 'stone', style };
  });
  if (difficulty === 1) {
    // Split tall introductory jumps with fixed resting ledges, including the join to the next chunk.
    const route = [...platforms, { x: 128, y: base + CHUNK_HEIGHT, w: 64 }];
    for (let step = 1; step < route.length; step++) {
      const below = route[step - 1]!, above = route[step]!;
      if (above.y - below.y <= 48) continue;
      const center = (below.x + below.w / 2 + above.x + above.w / 2) / 2;
      platforms.push({ id: `${index}:rest:${step}`, x: Math.max(20, Math.min(236, center - 32)), y: (below.y + above.y) / 2, w: 64, h: 8, kind: 'moss', style: 'balcony' });
    }
  }
  // Optional routes can skip a detour or catch a fall. Gold runes mark the narrow shortcuts.
  for (const [slot, [center, y, w, style]] of template.sides.entries()) {
    const x = mirror ? WORLD_WIDTH - center : center;
    platforms.push({ id: `${index}:${slot}:side`, x: x - w / 2, y: base + y, w, h: style === 'rune' ? 5 : 8, kind: 'stone', style });
  }
  // Telegraph trapped wall shelves from the 40 m section onward. Keep generous
  // clearance from every existing route/bonus ledge; never trap a camp or coop gap.
  const hazards: Hazard[] = [];
  if (index % 5 === 2 || index % 5 === 4) {
    const levels = [54, 94, 134, 174];
    const first = index < 5 ? 0 : variation % levels.length;
    const sides = variation % 2 ? [22, 270] : [270, 22];
    for (let offset = 0; offset < levels.length && !hazards.length; offset++) for (const x of sides) {
      const y = base + levels[(first + offset) % levels.length]!;
      if (!platforms.every(p => Math.abs(p.y - y) > 42 || p.x >= x + 40 || p.x + p.w <= x - 12)) continue;
      hazards.push({ x, y, w: 28, h: 9 });
      platforms.push({ id: `${index}:hazard:side`, x: x - 2, y, w: 32, h: 8, kind: 'stone', style: 'balcony' });
      break;
    }
  }
  const kinds: PowerUpKind[] = ['feather', 'boots', 'bubble'];
  const pickupSteps = index === 0 ? [1, 2, template.route.length - 1] : [camp ? 1 : 2];
  const pickups: Pickup[] = pickupSteps.map((step, slot) => {
    const platform = platforms[step]!;
    return { id: `${index}:pickup:${slot}`, kind: kinds[index === 0 ? slot : index % 3]!, x: platform.x + platform.w / 2, y: platform.y + 9 };
  });
  const rare = relicForChunk(seed, index);
  const relics: Relic[] = [];
  if (rare) {
    const ledge = platforms.find(p => p.style === 'rune') ?? platforms.find(p => p.id.endsWith(':side') && !p.id.includes('hazard'))!;
    relics.push({ id: `${index}:relic`, cosmeticId: rare.id, x: ledge.x + ledge.w / 2, y: ledge.y + 10 });
  }
  const mechanisms: PlatformMechanism[] = [];
  const firstStep = platforms[1]!;
  if (index % 5 === 1) {
    mechanisms.push({ platformId: firstStep.id, kind: 'moving', amplitude: Math.max(0, Math.min(challenge.movingAmplitude, firstStep.w / 2 + 6, firstStep.x - 22, 298 - firstStep.x - firstStep.w)), period: challenge.movingPeriod * TICK_RATE, phase: variation % 180 });
  } else if (index % 5 === 2) mechanisms.push({ platformId: firstStep.id, kind: 'crumble' });
  else if (index % 5 === 4) {
    // Springs are optional shortcuts, never placed under a coffer or on a camp.
    const spring = platforms.find(p => p.id.endsWith(':side') && !p.id.includes('hazard') && !relics.some(r => Math.abs(r.y - p.y - 10) < 1));
    if (spring) mechanisms.push({ platformId: spring.id, kind: 'spring' });
  }
  // Later rooms combine familiar hazards. Camp floors and collectible ledges stay stable.
  if (difficulty >= 4) mechanisms.push({ platformId: platforms[2]!.id, kind: 'crumble' });
  if (difficulty === 5 && !mechanisms.some(m => m.platformId === firstStep.id)) {
    mechanisms.push({ platformId: firstStep.id, kind: 'moving', amplitude: Math.max(0, Math.min(challenge.movingAmplitude, firstStep.w / 2 + 6, firstStep.x - 22, 298 - firstStep.x - firstStep.w)), period: challenge.movingPeriod * TICK_RATE, phase: variation % 180 });
  }
  return {
    index, id: template.id, name: template.name, biome: biomeAtChunk(index).id, seed: variation, width: WORLD_WIDTH, height: CHUNK_HEIGHT,
    difficulty, entry: { x: 160, y: base }, exit: { x: 160, y: base + CHUNK_HEIGHT },
    platforms, hazards, mechanisms, pickups, relics, tags: [...template.tags, 'central-join', ...mechanisms.map(m => m.kind), ...(hazards.length ? ['spikes'] : [])], soloValidated: true, camp,
  };
}

export function nearbyChunks(seed: number, y: number, radius = 2): Chunk[] {
  const center = Math.max(0, Math.floor(y / CHUNK_HEIGHT));
  const chunks: Chunk[] = [];
  for (let i = Math.max(0, center - radius); i <= center + radius; i++) chunks.push(generateChunk(seed, i));
  return chunks;
}
