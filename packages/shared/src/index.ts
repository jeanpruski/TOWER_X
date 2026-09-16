import { z } from 'zod';
import { MASK_IDS, HAT_IDS, ROBE_COLORS, SHOE_IDS, ACCESSORY_COLORS, type CostumeDetails, type MaskId, type HatId, type CosmeticId } from './cosmetics';
import type { BiomeId } from './biomes';
export * from './cosmetics';
export * from './biomes';
export * from './difficulty';

export const PROTOCOL_VERSION = 1 as const;
export const WORLD_VERSION = 10;
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const WORLD_WIDTH = 320;
export const CHUNK_HEIGHT = 216;
export const METERS_PER_CHUNK = 20;
export const PIXELS_PER_METER = CHUNK_HEIGHT / METERS_PER_CHUNK;
export const CAMP_INTERVAL = 5;
export const PLAYER_WIDTH = 10;
export const PLAYER_HEIGHT = 15;
// Reserved for companions; never included in the human wardrobe or guest draw.
export const BOT_COLOR = '#292b33' as const;
export const NEIGHBOR_COUNT = 5;
export const POWER_UPS = {
  feather: { name: 'Plume légère', description: 'Saut plus haut · gravité réduite', color: '#b9efcf' },
  boots: { name: 'Bottes chargées', description: 'Un super-saut au prochain saut', color: '#f2c879' },
  bubble: { name: 'Bulle protectrice', description: 'Absorbe la prochaine poussée', color: '#a5d9f5' },
} as const;
export type PowerUpKind = keyof typeof POWER_UPS;
export interface Pickup { id: string; kind: PowerUpKind; x: number; y: number; }
export interface Relic { id: string; cosmeticId: CosmeticId; x: number; y: number; }
export interface PushHit { id: string; x: number; y: number; blocked: boolean; }
export type GameEffect =
  | { v: 1; id: string; kind: 'push'; actorId: string; x: number; y: number; facing: -1 | 1; hits: PushHit[] }
  | { v: 1; id: string; kind: 'pickup'; actorId: string; x: number; y: number; powerUp: PowerUpKind }
  | { v: 1; id: string; kind: 'unlock'; actorId: string; x: number; y: number; cosmeticId: CosmeticId; duplicate?: boolean };

export const displayNameSchema = z.string().trim().min(2, 'Deux caractères minimum.').max(18, '18 caractères maximum.')
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Utilisez des lettres, chiffres, espaces, tirets ou underscores.');
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide.').max(254),
  password: z.string().min(10, 'Le mot de passe doit contenir au moins 10 caractères.').max(128),
}).strict();
const costumeFields = { color: z.enum(ROBE_COLORS), mask: z.enum(MASK_IDS), hat: z.enum(HAT_IDS), shoes: z.enum(SHOE_IDS), shoeColor: z.enum(ACCESSORY_COLORS), hatColor: z.enum(ACCESSORY_COLORS).nullable() };
export const registerSchema = credentialsSchema.extend({ displayName: displayNameSchema, color: costumeFields.color.optional(), mask: costumeFields.mask.optional(), hat: costumeFields.hat.optional(), shoes: costumeFields.shoes.optional(), shoeColor: costumeFields.shoeColor.optional(), hatColor: costumeFields.hatColor.optional() });
export const appearanceSchema = z.object({ displayName: displayNameSchema, color: costumeFields.color, mask: costumeFields.mask.optional(), hat: costumeFields.hat.optional(), shoes: costumeFields.shoes.optional(), shoeColor: costumeFields.shoeColor.optional(), hatColor: costumeFields.hatColor.optional() }).strict();
export const inputSchema = z.object({
  v: z.literal(PROTOCOL_VERSION), seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  moveX: z.number().finite().min(-1).max(1), jump: z.boolean(), push: z.boolean(),
  grab: z.boolean(), clientTime: z.number().finite().nonnegative(),
}).strict();
export type PlayerInput = z.infer<typeof inputSchema>;
export const neutralInput = (seq = 0): PlayerInput => ({ v: 1, seq, moveX: 0, jump: false, push: false, grab: false, clientTime: 0 });
export const entryChoiceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('saved') }).strict(),
  z.object({ mode: z.literal('player'), playerId: z.string().uuid() }).strict(),
]);
export type EntryChoice = z.infer<typeof entryChoiceSchema>;
export const joinSchema = z.object({ v: z.literal(1), community: z.boolean().optional(), entry: entryChoiceSchema.optional() }).strict()
  .refine(data => !(data.community && data.entry), 'Choisissez une seule destination.');
export const respawnSchema = z.object({ v: z.literal(1) }).strict();
export const teleportSchema = z.object({ v: z.literal(1), chunkIndex: z.number().int().min(0).max(10000) }).strict();

export type PlatformMechanism =
  | { platformId: string; kind: 'moving'; amplitude: number; period: number; phase: number }
  | { platformId: string; kind: 'crumble' | 'spring' };
export interface CrumbleState { platformId: string; breakTick: number; restoreTick: number; }
export interface Platform {
  id: string; x: number; y: number; w: number; h: number; kind: 'stone' | 'moss' | 'camp'; style?: 'pillar' | 'hanging' | 'beam' | 'balcony' | 'rune';
  mechanism?: PlatformMechanism['kind']; dx?: number; disabled?: boolean; breakTick?: number; restoreTick?: number;
}
export interface CoopGap { id: string; x: number; y: number; landingId: string; bridge: Platform; }
export const COOP_BRIDGE_SECONDS = 8;
export interface Hazard { x: number; y: number; w: number; h: number; }
export interface Chunk {
  index: number; id: string; biome: BiomeId; seed: number; width: number; height: number;
  difficulty: number; entry: { x: number; y: number }; exit: { x: number; y: number };
  platforms: Platform[]; hazards: Hazard[]; mechanisms: PlatformMechanism[]; pickups: Pickup[];
  tags: string[]; soloValidated: boolean; camp: boolean;
  name?: string;
  relics: Relic[];
  cooperation?: CoopGap;
}
export interface Body {
  id: string; x: number; y: number; vx: number; vy: number; grounded: boolean;
  facing: -1 | 1; coyote: number; jumpBuffer: number; jumpHeld: boolean;
  pushHeld: boolean; pushCooldown: number; protection: number; stun: number; blocked: number;
  feather: number; boots: boolean; bubble: boolean; spring: number;
}
export interface PublicProfile extends CostumeDetails {
  id: string; displayName: string; color: string; personalBest: number; lastCamp: number;
  isGuest: boolean; createdAt: string;
  mask: MaskId; hat: HatId; unlockedCosmetics: CosmeticId[];
}
export interface NetworkPlayer extends Body, Partial<CostumeDetails> {
  displayName: string; color: string; personalBest: number; lastCamp: number; ack: number;
  isBot: boolean;
  helping?: boolean;
  mask: MaskId; hat: HatId;
}
export const standingSchema = z.object({
  id: z.string().max(64), displayName: displayNameSchema, color: z.enum([...ROBE_COLORS, BOT_COLOR]),
  rank: z.number().int().positive(), height: z.number().int().nonnegative(), delta: z.number().finite(), isBot: z.boolean().optional(),
  mask: z.enum(MASK_IDS).optional(), hat: z.enum(HAT_IDS).optional(), shoes: z.enum(SHOE_IDS).optional(), shoeColor: z.enum(ACCESSORY_COLORS).optional(), hatColor: z.enum(ACCESSORY_COLORS).nullable().optional(),
}).strict();
export const nearbyStandingsSchema = z.object({
  above: z.array(standingSchema).max(NEIGHBOR_COUNT),
  self: standingSchema,
  below: z.array(standingSchema).max(NEIGHBOR_COUNT),
}).strict();
export type Standing = z.infer<typeof standingSchema>;
export type NearbyStandings = z.infer<typeof nearbyStandingsSchema>;
export interface Snapshot {
  v: 1; tick: number; serverTime: number; players: NetworkPlayer[]; playerCount: number;
  standings: NearbyStandings;
  botCount: number; pickups: Pickup[];
  relics: Relic[];
  bridges: Platform[];
  crumbling: CrumbleState[];
  frontier: number; frontRunnerId: string | null; tickMs: number; activeChunks: number;
}
export interface Welcome { v: 1; tick?: number; playerId: string; worldSeed: number; worldVersion: number; tickRate: number; profile: PublicProfile; player: NetworkPlayer; }
export interface FeedEntry { id: string; text: string; kind: 'join' | 'camp' | 'record'; time: number; }
export interface WorldStatus { online: number; frontier: number; worldSeed: number; uptime: number; }
export type JoinablePlayer = Pick<PublicProfile, 'id' | 'displayName' | 'color' | 'mask' | 'hat' | 'shoes' | 'shoeColor' | 'hatColor'> & { height: number };
export interface ClientToServerEvents {
  join: (data: z.infer<typeof joinSchema>) => void;
  input: (data: PlayerInput) => void;
  respawn: (data: { v: 1 }) => void;
  returnToBase: (data: { v: 1 }) => void;
  ping: (ack: () => void) => void;
  devTeleport: (data: z.infer<typeof teleportSchema>) => void;
}
export interface ServerToClientEvents {
  joinRejected: (data: { v: 1; message: string }) => void;
  effect: (data: GameEffect) => void;
  welcome: (data: Welcome) => void;
  snapshot: (data: Snapshot) => void;
  chunks: (data: { v: 1; chunks: Chunk[] }) => void;
  profileUpdate: (data: { v: 1; profile: PublicProfile }) => void;
  feed: (data: { v: 1; entry: FeedEntry }) => void;
  notice: (data: { v: 1; message: string; reason?: 'respawn' }) => void;
}
// Multiply before dividing so exact chunk boundaries cannot lose a metre to 10.8's binary rounding.
export const heightInMeters = (y: number): number => Math.max(0, Math.floor(y * METERS_PER_CHUNK / CHUNK_HEIGHT));
