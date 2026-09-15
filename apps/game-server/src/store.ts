import { randomInt, randomUUID } from 'node:crypto';
import { FileRepository, PostgresRepository, type DatabaseState, type Repository, type StoredProfile } from '@tower/db';
import { ROBE_COLORS, WORLD_VERSION, COMMON_MASKS, COMMON_HATS, COMMON_SHOES, normalizeCosmetics, type PublicProfile } from '@tower/shared';

export class Store {
  private constructor(public state: DatabaseState, private repository: Repository) {}
  static async open(file: string, databaseUrl?: string) {
    const repository = databaseUrl ? new PostgresRepository() : new FileRepository(file);
    const store = new Store(await repository.read(), repository);
    if (store.state.world.version > WORLD_VERSION) { await repository.close(); throw new Error('This world requires a newer game server.'); }
    // Terrain and wardrobe upgrades keep the seed, 216 px chunk joins and every camp at the same coordinates.
    // Reconnecting bodies spawn on those safe anchors; legacy profiles receive default accessories.
    store.state.world.version = WORLD_VERSION;
    for (const profile of store.state.profiles) {
      Object.assign(profile, normalizeCosmetics(profile));
      // Older saves did not record opened locations; keep the collection and start the history once.
      profile.openedRelicBands = [...new Set((Array.isArray(profile.openedRelicBands) ? profile.openedRelicBands : []).filter(band => Number.isSafeInteger(band) && band >= 0))].sort((a, b) => a - b);
    }
    store.state.sessions = store.state.sessions.filter(s => Date.parse(s.expiresAt) > Date.now());
    await store.flush(); return store;
  }
  createGuest(): StoredProfile {
    const names = ['Mousse', 'Luciole', 'Brindille', 'Nimbus', 'Pixel', 'Galet', 'Sauge', 'Plume'];
    const profile: StoredProfile = {
      id: randomUUID(), userId: null, guestIdentity: randomUUID(),
      displayName: `${names[this.state.profiles.length % names.length]} ${Math.floor(100 + Math.random() * 900)}`,
      color: ROBE_COLORS[randomInt(ROBE_COLORS.length)]!, personalBest: 0, lastCamp: 0,
      mask: COMMON_MASKS[randomInt(COMMON_MASKS.length)]!, hat: COMMON_HATS[randomInt(COMMON_HATS.length)]!, shoes: COMMON_SHOES[randomInt(COMMON_SHOES.length)]!, shoeColor: ROBE_COLORS[randomInt(ROBE_COLORS.length)]!, hatColor: null, unlockedCosmetics: [],
      createdAt: new Date().toISOString(), settings: {}, camps: [0], openedRelicBands: [],
    };
    this.state.profiles.push(profile); return profile;
  }
  profile(id: string) { return this.state.profiles.find(p => p.id === id); }
  flush() { return this.repository.write(this.state); }
  async close() { await this.flush(); await this.repository.close(); }
}
export const publicProfile = (p: StoredProfile): PublicProfile => ({ id: p.id, displayName: p.displayName, color: p.color, personalBest: p.personalBest, lastCamp: p.lastCamp, isGuest: !p.userId, createdAt: p.createdAt, ...normalizeCosmetics(p) });
