import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';

export interface StoredProfile {
  id: string; userId: string | null; guestIdentity: string | null; displayName: string;
  color: string; personalBest: number; lastCamp: number; createdAt: string;
  settings: Record<string, unknown>; camps: number[];
  // Optional on old saves; Store normalizes legacy appearances on opening.
  mask?: string; hat?: string; shoes?: string; shoeColor?: string; hatColor?: string | null; unlockedCosmetics?: string[];
  // Private collection history: one personal opening per 600 m band, including duplicates.
  openedRelicBands?: number[];
}
export interface StoredUser { id: string; email: string; passwordHash: string; createdAt: string; }
export interface StoredSession { tokenHash: string; profileId: string; expiresAt: string; }
export interface DatabaseState {
  world: { seed: number; version: number; frontier: number };
  profiles: StoredProfile[]; users: StoredUser[]; sessions: StoredSession[];
}
export const emptyDatabase = (): DatabaseState => ({ world: { seed: randomInt(1, 2147483647), version: 1, frontier: 0 }, profiles: [], users: [], sessions: [] });
export interface Repository { read(): Promise<DatabaseState>; write(state: DatabaseState): Promise<void>; close(): Promise<void>; }

export class FileRepository implements Repository {
  private pending: Promise<void> = Promise.resolve();
  constructor(readonly path: string) {}
  async read(): Promise<DatabaseState> {
    try { return JSON.parse(await readFile(this.path, 'utf8')) as DatabaseState; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDatabase(); throw error; }
  }
  write(state: DatabaseState): Promise<void> {
    const content = JSON.stringify(state, null, 2);
    const task = this.pending.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, content, { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
    });
    this.pending = task; return task;
  }
  async close() { await this.pending; }
}

export class PostgresRepository implements Repository {
  private client = new PrismaClient();
  private pending: Promise<void> = Promise.resolve();
  async read(): Promise<DatabaseState> {
    const [world, profiles, users, sessions] = await Promise.all([
      this.client.world.findUnique({ where: { id: 'main' } }),
      this.client.playerProfile.findMany({ include: { camps: true } }),
      this.client.user.findMany(), this.client.session.findMany(),
    ]);
    return {
      world: world ? { seed: world.worldSeed, version: world.worldVersion, frontier: Number((world.frontierMetadata as Record<string, unknown>).height ?? 0) } : emptyDatabase().world,
      profiles: profiles.map(p => {
        const look = p.cosmeticConfig as Record<string, unknown>;
        return { id: p.id, userId: p.userId, guestIdentity: p.guestIdentity, displayName: p.displayName, color: String(look.color), mask: typeof look.mask === 'string' ? look.mask : undefined, hat: typeof look.hat === 'string' ? look.hat : undefined, shoes: typeof look.shoes === 'string' ? look.shoes : undefined, shoeColor: typeof look.shoeColor === 'string' ? look.shoeColor : undefined, hatColor: typeof look.hatColor === 'string' ? look.hatColor : null, openedRelicBands: Array.isArray(look.openedRelicBands) ? look.openedRelicBands.filter((band): band is number => Number.isSafeInteger(band) && band >= 0) : [], unlockedCosmetics: Array.isArray(look.unlockedCosmetics) ? look.unlockedCosmetics.filter((id): id is string => typeof id === 'string') : [], personalBest: p.personalBest, lastCamp: p.lastCampId, createdAt: p.createdAt.toISOString(), settings: p.settings as Record<string, unknown>, camps: p.camps.map(c => c.campId) };
      }),
      users: users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })),
      sessions: sessions.map(s => ({ ...s, expiresAt: s.expiresAt.toISOString() })),
    };
  }
  write(input: DatabaseState): Promise<void> {
    const state = structuredClone(input);
    const task = this.pending.catch(() => {}).then(async () => {
      await this.client.$transaction(async tx => {
        await tx.world.upsert({ where: { id: 'main' }, create: { id: 'main', worldSeed: state.world.seed, worldVersion: state.world.version, frontierMetadata: { height: state.world.frontier } }, update: { worldVersion: state.world.version, frontierMetadata: { height: state.world.frontier } } });
        for (const user of state.users) await tx.user.upsert({ where: { id: user.id }, create: user, update: user });
        for (const p of state.profiles) {
          const data = { id: p.id, userId: p.userId, guestIdentity: p.guestIdentity, displayName: p.displayName, cosmeticConfig: { color: p.color, mask: p.mask ?? 'ivory', hat: p.hat ?? 'top-hat', shoes: p.shoes ?? 'classic', shoeColor: p.shoeColor ?? '#203136', hatColor: p.hatColor ?? null, unlockedCosmetics: p.unlockedCosmetics ?? [], openedRelicBands: p.openedRelicBands ?? [] }, settings: p.settings as Prisma.InputJsonObject, personalBest: p.personalBest, lastCampId: p.lastCamp, createdAt: p.createdAt };
          await tx.playerProfile.upsert({ where: { id: p.id }, create: data, update: data });
          for (const campId of p.camps) await tx.campProgress.upsert({ where: { profileId_campId: { profileId: p.id, campId } }, create: { profileId: p.id, campId }, update: {} });
        }
        await tx.session.deleteMany({ where: { tokenHash: { notIn: state.sessions.map(s => s.tokenHash) } } });
        for (const s of state.sessions) await tx.session.upsert({ where: { tokenHash: s.tokenHash }, create: s, update: s });
      }, { timeout: 15000 });
    });
    this.pending = task; return task;
  }
  async close() { await this.pending; await this.client.$disconnect(); }
}
