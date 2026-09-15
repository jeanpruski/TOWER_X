export const ROBE_COLORS = [
  '#c6ed80', '#bc9bea', '#f1b879', '#87c8df', '#ea97ae', '#eee6ce',
  '#76d8ba', '#e88977', '#aebff7', '#e6cf72', '#ce94d7', '#9eb6cb',
  '#b6c97d', '#cf8b65', '#7bafba', '#e6a6cc', '#c2d9e5', '#afa1cd',
  '#ef665f', '#f48c5f', '#ffae52', '#f4d457', '#eae982', '#d5f3b1',
  '#92c958', '#56af73', '#48b69a', '#5ed6ce', '#49b9d6', '#55a3e6',
  '#7289e3', '#9275dc', '#ab70d0', '#d676ca', '#eb76a9', '#f5a4a1',
  '#ffd3af', '#f5e8ab', '#d4e8b5', '#b1e4d0', '#c1e8ef', '#cfddff',
  '#dfc8f3', '#f2d0e8', '#f8f3e8', '#b5bec9', '#b99b83', '#8f7389',
] as const;
export const DEFAULT_SHOE_COLOR = '#203136';
export const ACCESSORY_COLORS = [...ROBE_COLORS, DEFAULT_SHOE_COLOR] as const;
export const COMMON_SHOES = ['classic', 'sneakers', 'high-boots', 'elf-shoes', 'clogs', 'sandals', 'slippers', 'armored', 'striped', 'lace-up', 'flippers', 'cat-paws'] as const;
export const RARE_SHOES = ['comet-boots', 'frost-skates', 'lava-hooves', 'cloud-slippers', 'root-boots', 'void-greaves', 'crystal-heels', 'winged-sandals'] as const;
export const SHOE_IDS = [...COMMON_SHOES, ...RARE_SHOES] as const;
export type ShoeId = typeof SHOE_IDS[number];
export type AccessoryColor = typeof ACCESSORY_COLORS[number];
export interface CostumeDetails { shoes: ShoeId; shoeColor: AccessoryColor; hatColor: AccessoryColor | null; }
export const DEFAULT_COSTUME_DETAILS: CostumeDetails = { shoes: 'classic', shoeColor: DEFAULT_SHOE_COLOR, hatColor: null };
export const SHOE_NAMES: Record<ShoeId, string> = {
  classic: 'Bottines', sneakers: 'Baskets', 'high-boots': 'Bottes hautes', 'elf-shoes': 'Souliers de lutin',
  clogs: 'Sabots', sandals: 'Sandales', slippers: 'Pantoufles', armored: 'Solerets', striped: 'Chaussettes rayées',
  'lace-up': 'Bottes à lacets', flippers: 'Palmes', 'cat-paws': 'Pattes de chat',
  'comet-boots': 'Foulées de comète', 'frost-skates': 'Patins de givre', 'lava-hooves': 'Sabots de lave', 'cloud-slippers': 'Chaussons nuage',
  'root-boots': 'Racines vivantes', 'void-greaves': 'Grèves du néant', 'crystal-heels': 'Bottines de cristal', 'winged-sandals': 'Sandales ailées',
};

/** The persisted `mask` slot accepts uncovered faces and disguises as well as plague masks. */
export const COMMON_FACE_STYLES = [
  'face-peach', 'face-amber', 'face-umber', 'round-glasses', 'sunglasses', 'goggles',
  'eye-patch', 'moustache', 'beard', 'ninja', 'robot', 'skeleton', 'pumpkin', 'slime',
  'cyclops', 'goblin', 'cat-face', 'fox-face',
] as const;
export const RARE_FACES = ['fire-spirit', 'ice-spirit', 'void-eye', 'jade-dragon', 'moon-fox', 'golden-idol', 'prismatic-slime', 'porcelain-doll'] as const;
export const FACE_STYLES = [...COMMON_FACE_STYLES, ...RARE_FACES] as const;
export type FaceStyleId = typeof FACE_STYLES[number];
export function isFaceStyle(item: string): item is FaceStyleId { return (FACE_STYLES as readonly string[]).includes(item); }
export const COMMON_PLAGUE_MASKS = [
  'ivory', 'raven', 'owl', 'fox', 'bone', 'brass', 'harlequin', 'moth', 'cat', 'porcelain',
  'stork', 'ibis', 'pelican', 'vulture', 'heron', 'woodpecker', 'kingfisher', 'parrot', 'bat', 'ram',
  'stag', 'hare', 'badger', 'panda', 'clockwork', 'patchwork', 'diver', 'bandage', 'samurai', 'domino',
] as const;
export const COMMON_MASKS = [...COMMON_PLAGUE_MASKS, ...COMMON_FACE_STYLES] as const;
export const HEAD_STYLES = ['bare-head', 'curls', 'braid', 'mohawk', 'headphones', 'headband', 'bunny-ears', 'sprout'] as const;
export function isHeadStyle(item: string): boolean { return (HEAD_STYLES as readonly string[]).includes(item); }
export const COMMON_HATS = [
  ...HEAD_STYLES,
  'top-hat', 'witch', 'hood', 'tricorn', 'bowler', 'beret', 'feather-cap', 'helmet', 'turban', 'crownlet',
  'fez', 'boater', 'sombrero', 'ushanka', 'nightcap', 'chef', 'pirate', 'aviator', 'straw', 'flower-pot',
  'mushroom', 'jester', 'viking', 'plumber', 'sailor', 'graduation', 'bucket', 'detective', 'bonnet', 'paper-boat',
] as const;
export const MASK_IDS = [...COMMON_MASKS, ...RARE_FACES, 'verdant', 'crystal', 'astral', 'solar', 'abyss', 'storm', 'obsidian', 'scarab'] as const;
export const HAT_IDS = [...COMMON_HATS, 'antlers', 'ice-crown', 'phoenix', 'eclipse', 'jellyfish', 'dragon', 'comet-crown', 'mycelium'] as const;
export type MaskId = typeof MASK_IDS[number];
export type PlagueMaskId = Exclude<MaskId, FaceStyleId>;
export type HatId = typeof HAT_IDS[number];
export const RARE_COSMETICS = [
  { id: 'mask:verdant', slot: 'mask', item: 'verdant', name: 'Masque du lierre', tint: '#b5ef91', signature: 'Collerette de feuilles et lucioles vertes' },
  { id: 'hat:antlers', slot: 'hat', item: 'antlers', name: 'Couronne sylvestre', tint: '#f0c58c', signature: 'Grands bois ramifiés et feuilles flottantes' },
  { id: 'mask:crystal', slot: 'mask', item: 'crystal', name: 'Masque de cristal', tint: '#bba5ff', signature: 'Éventail de cristaux et éclats prismatiques' },
  { id: 'hat:ice-crown', slot: 'hat', item: 'ice-crown', name: 'Couronne de givre', tint: '#b5eaff', signature: 'Hautes aiguilles de glace et flocons' },
  { id: 'mask:astral', slot: 'mask', item: 'astral', name: 'Masque astral', tint: '#f1caff', signature: 'Visage étoilé et anneau orbital violet' },
  { id: 'hat:phoenix', slot: 'hat', item: 'phoenix', name: 'Panache du phénix', tint: '#ffb47e', signature: 'Ailes de feu et braises dorées' },
  { id: 'mask:solar', slot: 'mask', item: 'solar', name: 'Visage du soleil', tint: '#ffe58a', signature: 'Rayons solaires et halo d’or' },
  { id: 'hat:eclipse', slot: 'hat', item: 'eclipse', name: 'Diadème de l’éclipse', tint: '#dab7ff', signature: 'Lune suspendue et couronne orbitale' },
  { id: 'mask:abyss', slot: 'mask', item: 'abyss', name: 'Oracle des abysses', tint: '#6ef4df', signature: 'Tentacules et perles bioluminescentes' },
  { id: 'hat:jellyfish', slot: 'hat', item: 'jellyfish', name: 'Méduse céleste', tint: '#fface0', signature: 'Dôme translucide et longs filaments roses' },
  { id: 'mask:storm', slot: 'mask', item: 'storm', name: 'Masque de l’orage', tint: '#97d7ff', signature: 'Ailettes électriques et arcs bleus' },
  { id: 'hat:dragon', slot: 'hat', item: 'dragon', name: 'Heaume du dragon', tint: '#ffa68b', signature: 'Cornes géantes et ailes écarlates' },
  { id: 'mask:fire-spirit', slot: 'mask', item: 'fire-spirit', name: 'Esprit de braise', tint: '#ffb36a', signature: 'Visage de feu, flammes latérales et braises' },
  { id: 'mask:ice-spirit', slot: 'mask', item: 'ice-spirit', name: 'Esprit du givre', tint: '#b1edff', signature: 'Joues de glace, pointes givrées et flocons' },
  { id: 'mask:void-eye', slot: 'mask', item: 'void-eye', name: 'Œil du néant', tint: '#d6b1ff', signature: 'Grand œil violet dans une tête d’ombre' },
  { id: 'mask:jade-dragon', slot: 'mask', item: 'jade-dragon', name: 'Dragon de jade', tint: '#9ff0b8', signature: 'Cornes dorées, moustaches et écailles de jade' },
  { id: 'mask:moon-fox', slot: 'mask', item: 'moon-fox', name: 'Renard lunaire', tint: '#d1d9ff', signature: 'Grandes oreilles blanches et marques lunaires' },
  { id: 'mask:golden-idol', slot: 'mask', item: 'golden-idol', name: 'Idole d’or', tint: '#ffe091', signature: 'Visage d’or, yeux turquoise et pendants solaires' },
  { id: 'mask:prismatic-slime', slot: 'mask', item: 'prismatic-slime', name: 'Slime prismatique', tint: '#f2b8ff', signature: 'Gelée arc-en-ciel et bulles irisées' },
  { id: 'mask:porcelain-doll', slot: 'mask', item: 'porcelain-doll', name: 'Poupée de porcelaine', tint: '#ffc9df', signature: 'Joues roses, larmes d’or et collerette de dentelle' },
  { id: 'mask:obsidian', slot: 'mask', item: 'obsidian', name: 'Masque d’obsidienne', tint: '#ff9b72', signature: 'Bec volcanique, fissures de lave et éclats noirs' },
  { id: 'mask:scarab', slot: 'mask', item: 'scarab', name: 'Scarabée royal', tint: '#72f1cf', signature: 'Élytres turquoise et antennes d’or' },
  { id: 'hat:comet-crown', slot: 'hat', item: 'comet-crown', name: 'Couronne comète', tint: '#ffdb92', signature: 'Étoile suspendue et longue queue de comète' },
  { id: 'hat:mycelium', slot: 'hat', item: 'mycelium', name: 'Mycélium enchanté', tint: '#9cf6e7', signature: 'Grand champignon turquoise et spores lumineuses' },
  { id: 'shoes:comet-boots', slot: 'shoes', item: 'comet-boots', name: 'Foulées de comète', tint: '#ffce83', signature: 'Bottes dorées et traînée d’étoiles aux pieds' },
  { id: 'shoes:frost-skates', slot: 'shoes', item: 'frost-skates', name: 'Patins de givre', tint: '#b7edff', signature: 'Lames de glace et éclats bleus' },
  { id: 'shoes:lava-hooves', slot: 'shoes', item: 'lava-hooves', name: 'Sabots de lave', tint: '#ff936a', signature: 'Sabots fendus et braises rouges' },
  { id: 'shoes:cloud-slippers', slot: 'shoes', item: 'cloud-slippers', name: 'Chaussons nuage', tint: '#eef5ff', signature: 'Nuages moelleux et petites volutes' },
  { id: 'shoes:root-boots', slot: 'shoes', item: 'root-boots', name: 'Racines vivantes', tint: '#c6f48a', signature: 'Racines noueuses, feuilles et pollen vert' },
  { id: 'shoes:void-greaves', slot: 'shoes', item: 'void-greaves', name: 'Grèves du néant', tint: '#cfb2ff', signature: 'Armure violette et anneau d’ombre aux pieds' },
  { id: 'shoes:crystal-heels', slot: 'shoes', item: 'crystal-heels', name: 'Bottines de cristal', tint: '#f4b5ec', signature: 'Pointes prismatiques roses et éclats blancs' },
  { id: 'shoes:winged-sandals', slot: 'shoes', item: 'winged-sandals', name: 'Sandales ailées', tint: '#ffecc1', signature: 'Grandes ailes ivoire et attaches d’or' },
] as const;
export type CosmeticId = typeof RARE_COSMETICS[number]['id'];
/** One coffer per 600 m band; the actual ledge varies with the world seed. */
export const RELIC_INTERVAL_CHUNKS = 30;
export const MASK_NAMES: Record<MaskId, string> = {
  'face-peach': 'Visage pêche', 'face-amber': 'Visage ambré', 'face-umber': 'Visage ébène',
  'round-glasses': 'Lunettes rondes', sunglasses: 'Lunettes de soleil', goggles: 'Lunettes mécano',
  'eye-patch': 'Cache-œil', moustache: 'Moustache', beard: 'Barbe de sage', ninja: 'Ninja', robot: 'Robot',
  skeleton: 'Squelette', pumpkin: 'Citrouille', slime: 'Slime', cyclops: 'Cyclope', goblin: 'Gobelin',
  'cat-face': 'Chat', 'fox-face': 'Renard roux',
  'fire-spirit': 'Esprit de braise', 'ice-spirit': 'Esprit du givre', 'void-eye': 'Œil du néant', 'jade-dragon': 'Dragon de jade',
  'moon-fox': 'Renard lunaire', 'golden-idol': 'Idole d’or', 'prismatic-slime': 'Slime prismatique', 'porcelain-doll': 'Poupée de porcelaine',
  ivory: 'Ivoire', raven: 'Corbeau', owl: 'Chouette', fox: 'Renard', bone: 'Os ancien', brass: 'Laiton', harlequin: 'Arlequin', moth: 'Papillon', cat: 'Félin', porcelain: 'Porcelaine',
  stork: 'Cigogne', ibis: 'Ibis', pelican: 'Pélican', vulture: 'Vautour', heron: 'Héron', woodpecker: 'Pic épeiche', kingfisher: 'Martin-pêcheur', parrot: 'Perroquet', bat: 'Chauve-souris', ram: 'Bélier',
  stag: 'Cerf', hare: 'Lièvre', badger: 'Blaireau', panda: 'Panda', clockwork: 'Horloger', patchwork: 'Rapiécé', diver: 'Scaphandrier', bandage: 'Momie', samurai: 'Samouraï', domino: 'Domino',
  verdant: 'Masque du lierre', crystal: 'Masque de cristal', astral: 'Masque astral', solar: 'Visage du soleil', abyss: 'Oracle des abysses', storm: 'Masque de l’orage',
  obsidian: 'Masque d’obsidienne', scarab: 'Scarabée royal',
};
export const HAT_NAMES: Record<HatId, string> = {
  'bare-head': 'Tête nue', curls: 'Boucles', braid: 'Tresse', mohawk: 'Crête punk', headphones: 'Casque audio',
  headband: 'Bandeau sportif', 'bunny-ears': 'Oreilles de lapin', sprout: 'Petite pousse',
  'top-hat': 'Haut-de-forme', witch: 'Sorcier', hood: 'Capuche', tricorn: 'Tricorne', bowler: 'Melon', beret: 'Béret', 'feather-cap': 'Chapeau à plume', helmet: 'Heaume', turban: 'Turban', crownlet: 'Diadème',
  fez: 'Fez', boater: 'Canotier', sombrero: 'Sombrero', ushanka: 'Chapka', nightcap: 'Bonnet de nuit', chef: 'Toque', pirate: 'Capitaine pirate', aviator: 'Aviateur', straw: 'Chapeau de paille', 'flower-pot': 'Pot fleuri',
  mushroom: 'Champignon', jester: 'Bouffon', viking: 'Viking', plumber: 'Casquette', sailor: 'Marin', graduation: 'Diplômé', bucket: 'Bob', detective: 'Détective', bonnet: 'Béguin', 'paper-boat': 'Bateau en papier',
  antlers: 'Couronne sylvestre', 'ice-crown': 'Couronne de givre', phoenix: 'Panache du phénix', eclipse: 'Diadème de l’éclipse', jellyfish: 'Méduse céleste', dragon: 'Heaume du dragon',
  'comet-crown': 'Couronne comète', mycelium: 'Mycélium enchanté',
};

export function equippedRares(mask: MaskId = 'ivory', hat: HatId = 'top-hat', shoes: ShoeId = 'classic') {
  return RARE_COSMETICS.filter(c => c.item === (c.slot === 'mask' ? mask : c.slot === 'hat' ? hat : shoes));
}

export function canEquip(slot: 'mask' | 'hat' | 'shoes', item: string, unlocked: readonly string[]): boolean {
  const common: readonly string[] = slot === 'mask' ? COMMON_MASKS : slot === 'hat' ? COMMON_HATS : COMMON_SHOES;
  return common.includes(item) || RARE_COSMETICS.some(c => c.slot === slot && c.item === item && unlocked.includes(c.id));
}

export function normalizeCosmetics(profile: { mask?: string; hat?: string; shoes?: string; shoeColor?: string; hatColor?: string | null; unlockedCosmetics?: string[] }): { mask: MaskId; hat: HatId; unlockedCosmetics: CosmeticId[] } & CostumeDetails {
  const unlockedCosmetics = RARE_COSMETICS.filter(c => profile.unlockedCosmetics?.includes(c.id)).map(c => c.id);
  const mask = profile.mask && canEquip('mask', profile.mask, unlockedCosmetics) ? profile.mask as MaskId : 'ivory';
  const hat = profile.hat && canEquip('hat', profile.hat, unlockedCosmetics) ? profile.hat as HatId : 'top-hat';
  const shoes = profile.shoes && canEquip('shoes', profile.shoes, unlockedCosmetics) ? profile.shoes as ShoeId : 'classic';
  const shoeColor = ACCESSORY_COLORS.find(color => color === profile.shoeColor) ?? DEFAULT_SHOE_COLOR;
  const hatColor = ACCESSORY_COLORS.find(color => color === profile.hatColor) ?? null;
  return { mask, hat, shoes, shoeColor, hatColor, unlockedCosmetics };
}
