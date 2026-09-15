export const BIOMES = [
  { id: 'ruins', name: 'Les ruines verdoyantes', shortName: 'Ruines', icon: '✦' },
  { id: 'forest', name: 'La forêt suspendue', shortName: 'Forêt', icon: '❧' },
  { id: 'caves', name: 'Les cavernes de cristal', shortName: 'Cristal', icon: '◇' },
  { id: 'frost', name: 'Les remparts de givre', shortName: 'Givre', icon: '❄' },
  { id: 'astral', name: 'Le sanctuaire astral', shortName: 'Astral', icon: '✧' },
] as const;
export type BiomeId = typeof BIOMES[number]['id'];
export const biomeAtChunk = (index: number) => BIOMES[Math.floor(Math.max(0, index) / 5) % BIOMES.length]!;
