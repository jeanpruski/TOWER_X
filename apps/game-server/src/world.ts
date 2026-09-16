import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Logger } from 'pino';
import { applyPush, collectPickup, Cooperation, createBody, generateChunk, mechanismPlatforms, TowerMechanisms, PICKUP_RESPAWN_SECONDS, resolvePlayers, stepBody, touchesHazard, touchesPickup } from '@tower/game-core';
import { CAMP_INTERVAL, CHUNK_HEIGHT, DT, TICK_RATE, PIXELS_PER_METER, PLAYER_WIDTH, heightInMeters, inputSchema, joinSchema, neutralInput, respawnSchema, teleportSchema, type JoinablePlayer, type Body, type Chunk, type ClientToServerEvents, type NetworkPlayer, type PlayerInput, type ServerToClientEvents, type Snapshot, type Standing } from '@tower/shared';
import type { StoredProfile } from '@tower/db';
import { Auth, RateLimiter } from './auth';
import { Store, publicProfile } from './store';
import { rankPlayers, standingsAround } from './standings';
import { BOT_COLOR, RELIC_INTERVAL_CHUNKS, normalizeCosmetics, type GameEffect, type PushHit } from '@tower/shared';
import { BotBrain, BOT_NAMES, BOT_HATS } from './bots';
import { bufferInput } from './input-buffer';
import { latestSnapshots } from './snapshots';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameIO = Server<ClientToServerEvents, ServerToClientEvents>;
interface Player {
  body: Body; profile: StoredProfile; socket: GameSocket | null; queue: PlayerInput[];
  input: PlayerInput; ack: number; receivedSeq: number; lastInputAt: number;
  disconnectedAt: number | null; sentChunk: number; sessionHash: string;
  bot?: BotBrain;
}

export class World {
  readonly players = new Map<string, Player>();
  readonly chunks = new Map<number, Chunk>();
  readonly pickupCooldowns = new Map<string, number>();
  readonly cooperation = new Cooperation();
  readonly mechanisms = new TowerMechanisms();
  private readonly dirtyProfiles = new Set<string>();
  private readonly snapshotSenders = new Map<GameSocket, ReturnType<typeof latestSnapshots>>();
  tick = 0; tickMs = 0; maxTickMs = 0; rejectedInputs = 0; private elapsed = 0;
  private lastTime = performance.now(); private timer?: ReturnType<typeof setInterval>;
  constructor(readonly io: GameIO, readonly store: Store, readonly auth: Auth, readonly log: Logger, private devTools = false, private maxBots = 3) {}
  get online() { return [...this.players.values()].filter(p => p.socket).length; }
  get botCount() { return [...this.players.values()].filter(p => p.bot).length; }
  get frontier() { return Math.max(0, ...[...this.players.values()].filter(p => p.socket).map(p => heightInMeters(p.body.y))); }
  joinablePlayers(excludeId: string): JoinablePlayer[] {
    return [...this.players.values()].filter(p => p.socket?.connected && !p.bot && p.profile.id !== excludeId).map(p => {
      const { id, displayName, color, mask, hat, shoes, shoeColor, hatColor } = publicProfile(p.profile);
      return { id, displayName, color, mask, hat, shoes, shoeColor, hatColor, height: heightInMeters(p.body.y) };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr') || a.id.localeCompare(b.id));
  }
  getChunk(index: number) {
    let chunk = this.chunks.get(index);
    if (!chunk) { chunk = generateChunk(this.store.state.world.seed, index); this.chunks.set(index, chunk); }
    return chunk;
  }
  chunksAt(y: number, radius = 2): Chunk[] {
    const center = Math.max(0, Math.floor(y / CHUNK_HEIGHT)); const result: Chunk[] = [];
    for (let i = Math.max(0, center - radius); i <= center + radius; i++) result.push(this.getChunk(i));
    return result;
  }
  platformsAt(y: number) {
    const chunks = this.chunksAt(y);
    return [...mechanismPlatforms(chunks, this.tick, this.mechanisms.states()), ...this.cooperation.bridges(chunks, this.tick)];
  }
  start() {
    this.io.on('connection', socket => this.connect(socket));
    this.timer = setInterval(() => {
      const now = performance.now(); this.elapsed += Math.min(100, now - this.lastTime); this.lastTime = now;
      let steps = 0;
      while (this.elapsed >= 1000 / TICK_RATE && steps++ < 3) { this.step(); this.elapsed -= 1000 / TICK_RATE; }
    }, 8);
  }
  stop() { if (this.timer) clearInterval(this.timer); }
  revoke(hash: string) {
    for (const player of this.players.values()) if (player.sessionHash === hash) player.socket?.disconnect(true);
  }
  updateProfile(id: string) {
    this.dirtyProfiles.delete(id);
    const player = this.players.get(id);
    if (player) player.socket?.emit('profileUpdate', { v: 1, profile: publicProfile(player.profile) });
  }
  private connect(socket: GameSocket) {
    this.snapshotSenders.set(socket, latestSnapshots(socket));
    const inputLimit = new RateLimiter(90, 1000);
    const actionLimit = new RateLimiter(5, 5000);
    const joinedDeadline = setTimeout(() => { if (![...this.players.values()].some(p => p.socket === socket)) socket.disconnect(true); }, 10000);
    socket.on('join', raw => {
      const data = joinSchema.safeParse(raw);
      const profile = this.auth.authenticate(socket.handshake.headers.cookie);
      if (!data.success || !profile) { socket.disconnect(true); return; }
      if ([...this.players.values()].some(p => p.socket === socket)) return;
      const entry = data.data.entry;
      const target = entry?.mode === 'player' ? this.players.get(entry.playerId) : undefined;
      if (entry?.mode === 'player' && (!target?.socket?.connected || target.bot || target.profile.id === profile.id)) {
        socket.emit('joinRejected', { v: 1, message: 'Ce joueur n’est plus disponible. Choisissez votre départ à nouveau.' }); return;
      }
      const destination = target ? this.entryBeside(target) : undefined;
      clearTimeout(joinedDeadline);
      let player = this.players.get(profile.id);
      if (player?.socket && player.socket.id !== socket.id) {
        player.socket.emit('notice', { v: 1, message: 'Votre session a été ouverte dans un autre onglet.' }); player.socket.disconnect(true);
      }
      if (!player || entry || data.data.community || (player.disconnectedAt && Date.now() - player.disconnectedAt > 10000)) {
        const activeHeights = [...this.players.values()].filter(p => p.socket).map(p => p.body.y);
        const activeTop = activeHeights.length ? Math.max(0, ...activeHeights) : this.store.state.world.frontier * PIXELS_PER_METER;
        const communityCamp = Math.max(0, Math.floor((activeTop / CHUNK_HEIGHT - 2) / CAMP_INTERVAL) * CAMP_INTERVAL);
        const camp = destination ? Math.floor(destination.y / CHUNK_HEIGHT / CAMP_INTERVAL) * CAMP_INTERVAL : data.data.community ? communityCamp : profile.lastCamp;
        if (!profile.camps.includes(camp)) profile.camps.push(camp);
        profile.lastCamp = camp;
        player = { body: createBody(profile.id, camp), profile, socket, queue: [], input: neutralInput(), ack: -1, receivedSeq: -1, lastInputAt: Date.now(), disconnectedAt: null, sentChunk: -1, sessionHash: this.auth.tokenHash(socket.handshake.headers.cookie)! };
        if (destination) Object.assign(player.body, destination);
        else player.body.x += ((this.online % 5) - 2) * 12;
        this.players.set(profile.id, player);
      } else {
        player.socket = socket; player.disconnectedAt = null; player.body.protection = 2; player.queue = [];
        player.ack = -1; player.receivedSeq = -1; player.input = neutralInput(); player.sentChunk = -1;
        player.sessionHash = this.auth.tokenHash(socket.handshake.headers.cookie)!;
      }
      socket.data.playerId = profile.id;
      socket.emit('welcome', { v: 1, tick: this.tick, playerId: profile.id, worldSeed: this.store.state.world.seed, worldVersion: this.store.state.world.version, tickRate: TICK_RATE, profile: publicProfile(profile), player: this.serialize(player) });
      this.sendChunks(player);
      this.feed(`${profile.displayName} rejoint l’ascension.`, 'join');
      this.persist();
    });
    socket.on('input', raw => {
      const player = this.players.get(socket.data.playerId as string);
      if (!player || player.socket !== socket) return;
      if (!inputLimit.allow(socket.id)) { this.rejectedInputs++; return; }
      const data = inputSchema.safeParse(raw);
      if (!data.success || data.data.seq <= player.receivedSeq) { this.rejectedInputs++; return; }
      // Sequence numbers order controls; they never decide how much time to simulate.
      // Allow gaps after a network stall instead of permanently rejecting that client.
      player.receivedSeq = data.data.seq; bufferInput(player.queue, data.data); player.lastInputAt = Date.now();
    });
    socket.on('respawn', raw => {
      const p = this.players.get(socket.data.playerId as string);
      if (p?.socket === socket && respawnSchema.safeParse(raw).success && actionLimit.allow(socket.id)) this.respawn(p);
    });
    socket.on('returnToBase', raw => {
      const p = this.players.get(socket.data.playerId as string);
      if (p?.socket === socket && respawnSchema.safeParse(raw).success && actionLimit.allow(socket.id)) this.respawn(p, 'base');
    });
    socket.on('devTeleport', raw => {
      if (!this.devTools || !actionLimit.allow(socket.id)) return;
      const parsed = teleportSchema.safeParse(raw); const p = this.players.get(socket.data.playerId as string);
      if (!parsed.success || p?.socket !== socket) return;
      Object.assign(p.body, createBody(p.body.id)); p.body.y = parsed.data.chunkIndex * CHUNK_HEIGHT; p.sentChunk = -1;
      this.snapshotSenders.get(socket)?.clear();
    });
    socket.on('ping', ack => { if (typeof ack === 'function' && actionLimit.allow(`ping:${socket.id}`)) ack(); });
    socket.on('disconnect', () => {
      this.snapshotSenders.delete(socket);
      clearTimeout(joinedDeadline);
      const player = this.players.get(socket.data.playerId as string);
      if (player?.socket === socket) { player.socket = null; player.disconnectedAt = Date.now(); player.queue = []; player.input = neutralInput(); this.persist(); }
    });
  }
  private persist() { void this.store.flush().catch(error => this.log.error({ err: error }, 'Persistence failed')); }
  private entryBeside(target: Player) {
    // Arrive on a stable, ordinary ledge near the current server position, even if the target is jumping.
    const floor = this.platformsAt(target.body.y).filter(p => !p.disabled && !p.mechanism && !p.id.endsWith(':side') && !p.id.endsWith(':coop-bridge') && p.y <= target.body.y && p.w >= PLAYER_WIDTH + 4)
      .sort((a, b) => (target.body.y - a.y + Math.abs(target.body.x - (a.x + a.w / 2)) * .35) - (target.body.y - b.y + Math.abs(target.body.x - (b.x + b.w / 2)) * .35))[0];
    if (!floor) return { x: 160, y: Math.max(0, Math.floor(target.body.y / CHUNK_HEIGHT / CAMP_INTERVAL)) * CAMP_INTERVAL * CHUNK_HEIGHT };
    return { x: Math.max(floor.x + PLAYER_WIDTH / 2 + 1, Math.min(floor.x + floor.w - PLAYER_WIDTH / 2 - 1, target.body.x + 16)), y: floor.y };
  }
  private feed(text: string, kind: 'join' | 'camp' | 'record') { this.io.emit('feed', { v: 1, entry: { id: randomUUID(), text, kind, time: Date.now() } }); }
  private serialize(p: Player): NetworkPlayer {
    const { unlockedCosmetics: _unlocked, ...appearance } = normalizeCosmetics(p.profile);
    return { ...p.body, displayName: p.profile.displayName, color: p.profile.color, ...appearance, personalBest: p.profile.personalBest, lastCamp: p.profile.lastCamp, ack: p.ack, isBot: Boolean(p.bot), helping: Boolean(p.bot && [...this.cooperation.helpers.values()].includes(p.body.id)) };
  }
  private effect(effect: GameEffect) {
    for (const p of this.players.values()) if (p.socket && Math.abs(p.body.y - effect.y) <= CHUNK_HEIGHT * 3) p.socket.emit('effect', effect);
  }
  private maintainBots() {
    const humans = [...this.players.values()].filter(p => p.socket);
    const desired = humans.length ? this.maxBots : 0;
    for (const [id, p] of this.players) if (p.bot && p.bot.slot >= desired) this.players.delete(id);
    for (let slot = 0; slot < desired; slot++) {
      const id = `bot-${slot}`;
      if (this.players.has(id)) continue;
      const host = humans[slot % humans.length]!;
      const profile: StoredProfile = { id, userId: null, guestIdentity: null, displayName: BOT_NAMES[slot]!, color: BOT_COLOR, mask: 'ivory', hat: BOT_HATS[slot]!, unlockedCosmetics: [], personalBest: 0, lastCamp: host.profile.lastCamp, createdAt: new Date().toISOString(), settings: {}, camps: [] };
      const p: Player = { body: createBody(id, profile.lastCamp), profile, socket: null, queue: [], input: neutralInput(), ack: -1, receivedSeq: -1, lastInputAt: Date.now(), disconnectedAt: null, sentChunk: -1, sessionHash: '', bot: new BotBrain(slot) };
      this.placeBot(p, host.body.y); this.players.set(id, p);
    }
    // Companions regroup only outside every human's view; visible movement always uses physics.
    for (const p of this.players.values()) if (p.bot && humans.length && humans.every(h => Math.abs(h.body.y - p.body.y) > CHUNK_HEIGHT * 3)) {
      const stranded = humans.filter(h => this.chunksAt(h.body.y).some(c => c.cooperation && !this.cooperation.isOpen(c.cooperation.id, this.tick) && Math.abs(h.body.y - c.cooperation.y) < 50));
      const hosts = stranded.length ? stranded : humans;
      const host = hosts[p.bot.slot % hosts.length]!;
      p.profile.lastCamp = host.profile.lastCamp; this.placeBot(p, host.body.y);
    }
  }
  private placeBot(p: Player, height: number) {
    const floor = this.platformsAt(height).filter(p => !p.disabled && !p.mechanism && !p.id.endsWith(':side') && p.y <= height).sort((a, b) => b.y - a.y)[0];
    Object.assign(p.body, createBody(p.body.id, p.profile.lastCamp));
    if (floor) { p.body.x = floor.x + floor.w / 2 + ((p.bot?.slot ?? 0) - 1) * 14; p.body.y = floor.y; }
  }
  private respawn(player: Player, reason: 'camp' | 'spikes' | 'base' = 'camp') {
    if (reason === 'base') { player.profile.lastCamp = 0; this.updateProfile(player.profile.id); this.persist(); }
    Object.assign(player.body, createBody(player.profile.id, player.profile.lastCamp));
    player.ack = player.receivedSeq;
    player.queue = []; player.input = neutralInput(player.ack); player.sentChunk = -1;
    if (player.socket) this.snapshotSenders.get(player.socket)?.clear();
    player.socket?.emit('notice', { v: 1, reason: 'respawn', message: reason === 'base' ? 'De retour au pied de la tour. Votre record et votre collection sont conservés.' : reason === 'spikes' ? 'Aïe, les pics ! Retour au camp. Votre record est conservé.' : 'De retour au camp. Votre record est conservé.' });
  }
  private sendChunks(p: Player) {
    const index = Math.max(0, Math.floor(p.body.y / CHUNK_HEIGHT));
    if (index === p.sentChunk) return;
    p.socket?.emit('chunks', { v: 1, chunks: this.chunksAt(p.body.y) }); p.sentChunk = index;
  }
  step() {
    const started = performance.now(); this.tick++;
    this.maintainBots();
    const previousY = new Map<string, number>();
    const active = [...this.players.values()].filter(p => p.socket || p.bot);
    const humans = active.filter(p => p.socket).map(p => p.body);
    const actors = active.map(p => ({ body: p.body, isBot: Boolean(p.bot) }));
    const activeChunks = [...new Map(active.flatMap(p => this.chunksAt(p.body.y)).map(c => [c.index, c])).values()];
    this.mechanisms.update(activeChunks, active.map(p => p.body), this.tick);
    this.cooperation.update(activeChunks, actors, this.tick);
    const gaps = activeChunks.flatMap(c => c.cooperation ? [c.cooperation] : []);
    for (const p of active) {
      previousY.set(p.body.id, p.body.y);
      const gap = gaps.find(g => this.cooperation.helpers.get(g.id) === p.body.id) ?? gaps.find(g => p.body.y >= g.y - 80 && p.body.y < g.y + 90);
      const platforms = this.platformsAt(p.body.y);
      const next = p.bot?.input(p.body, platforms, humans, this.tick, gap ? { gap, helperId: this.cooperation.helpers.get(gap.id), allies: active.map(p => p.body) } : undefined) ?? p.queue.shift();
      if (next) { p.input = next; p.ack = next.seq; }
      else if (Date.now() - p.lastInputAt > 500) p.input = neutralInput(p.ack);
      stepBody(p.body, p.input, platforms, DT);
    }
    const bodies = active.map(p => p.body);
    resolvePlayers(bodies, previousY, DT);
    for (const p of active) {
      const cooldown = p.body.pushCooldown;
      const hits: PushHit[] = [];
      applyPush(p.body, p.input, bodies, (target, blocked) => hits.push({ id: target.id, x: target.x, y: target.y, blocked }));
      if (p.body.pushCooldown > cooldown) this.effect({ v: 1, id: `${this.tick}:${p.body.id}:push`, kind: 'push', actorId: p.body.id, x: p.body.x, y: p.body.y, facing: p.body.facing, hits });
      if (p.body.y < -CHUNK_HEIGHT) this.respawn(p);
      else if (p.body.protection <= 0 && touchesHazard(p.body, this.chunksAt(p.body.y))) this.respawn(p, 'spikes');
      // Bots leave the bonuses for people. A shared pickup can have only one claimant.
      if (!p.bot) for (const pickup of this.chunksAt(p.body.y).flatMap(c => c.pickups)) {
        if ((this.pickupCooldowns.get(pickup.id) ?? 0) > this.tick || !touchesPickup(p.body, pickup)) continue;
        collectPickup(p.body, pickup); this.pickupCooldowns.set(pickup.id, this.tick + PICKUP_RESPAWN_SECONDS * TICK_RATE);
        this.effect({ v: 1, id: `${this.tick}:${pickup.id}`, kind: 'pickup', actorId: p.body.id, x: pickup.x, y: pickup.y, powerUp: pickup.kind });
      }
      // Each location is opened once per profile, even when its roll is already owned.
      if (!p.bot) for (const chunk of this.chunksAt(p.body.y)) for (const relic of chunk.relics) {
        const collection = p.profile.unlockedCosmetics ??= [];
        const opened = p.profile.openedRelicBands ??= [], band = Math.floor(chunk.index / RELIC_INTERVAL_CHUNKS);
        if (opened.includes(band) || !touchesPickup(p.body, relic)) continue;
        const duplicate = collection.includes(relic.cosmeticId);
        opened.push(band);
        if (!duplicate) { collection.push(relic.cosmeticId); this.updateProfile(p.profile.id); }
        this.persist();
        this.effect({ v: 1, id: `${this.tick}:${p.body.id}:${relic.id}`, kind: 'unlock', actorId: p.body.id, x: relic.x, y: relic.y, cosmeticId: relic.cosmeticId, duplicate });
      }
      const best = heightInMeters(p.body.y);
      if (best > p.profile.personalBest) { p.profile.personalBest = best; if (!p.bot) this.dirtyProfiles.add(p.profile.id); }
      const index = Math.max(0, Math.round(p.body.y / CHUNK_HEIGHT));
      if (p.body.grounded && index % CAMP_INTERVAL === 0 && Math.abs(p.body.y - index * CHUNK_HEIGHT) < 0.1 && p.profile.lastCamp !== index) {
        p.profile.lastCamp = index;
        if (!p.profile.camps.includes(index)) {
          p.profile.camps.push(index); if (!p.bot) this.feed(`${p.profile.displayName} a allumé le camp à ${heightInMeters(p.body.y)} m.`, 'camp');
        }
        this.updateProfile(p.profile.id); this.persist();
      }
      this.sendChunks(p);
    }
    this.cooperation.update(activeChunks, actors, this.tick);
    this.store.state.world.frontier = Math.max(this.store.state.world.frontier, this.frontier);
    this.mechanisms.update(activeChunks, bodies, this.tick);
    if (this.tick % 2 === 0) this.broadcast(active);
    // Records remain authoritative every tick and visible in snapshots. Coalesce the
    // heavier reliable profile packets so a rising player cannot starve HTTP snapshots.
    if (this.tick % 15 === 0) for (const id of this.dirtyProfiles) this.updateProfile(id);
    if (this.tick % 150 === 0) {
      for (const [id, ready] of this.pickupCooldowns) if (ready <= this.tick) this.pickupCooldowns.delete(id);
      const used = new Set<number>();
      for (const p of active) for (const chunk of this.chunksAt(p.body.y)) used.add(chunk.index);
      for (const index of this.chunks.keys()) if (!used.has(index)) this.chunks.delete(index);
      for (const [id, p] of this.players) if (p.disconnectedAt && Date.now() - p.disconnectedAt > 10000) this.players.delete(id);
      for (const p of active) if (p.socket && !this.auth.authenticate(p.socket.handshake.headers.cookie)) p.socket.disconnect(true);
      this.store.state.sessions = this.store.state.sessions.filter(s => Date.parse(s.expiresAt) > Date.now());
      this.persist();
    }
    this.tickMs = performance.now() - started; this.maxTickMs = Math.max(this.maxTickMs, this.tickMs);
  }
  private broadcast(active: Player[]) {
    const ranked = rankPlayers(active.map(p => { const { unlockedCosmetics: _unlocked, ...appearance } = normalizeCosmetics(p.profile); return { id: p.body.id, displayName: p.profile.displayName, color: p.profile.color as Standing['color'], ...appearance, y: p.body.y, isBot: Boolean(p.bot) }; }));
    for (const [index, entry] of ranked.entries()) {
      const p = this.players.get(entry.id)!;
      if (!p.socket) continue;
      const snapshot: Snapshot = {
        v: 1, tick: this.tick, serverTime: Date.now(),
        players: active.filter(other => Math.abs(other.body.y - p.body.y) <= CHUNK_HEIGHT * 3).map(other => this.serialize(other)),
        standings: standingsAround(ranked, index),
        playerCount: this.online, botCount: this.botCount,
        pickups: this.chunksAt(p.body.y).flatMap(c => c.pickups).filter(pickup => (this.pickupCooldowns.get(pickup.id) ?? 0) <= this.tick),
        relics: this.chunksAt(p.body.y).flatMap(c => p.profile.openedRelicBands?.includes(Math.floor(c.index / RELIC_INTERVAL_CHUNKS)) ? [] : c.relics),
        bridges: this.cooperation.bridges(this.chunksAt(p.body.y), this.tick),
        crumbling: this.mechanisms.states().filter(state => this.chunksAt(p.body.y).some(c => c.mechanisms.some(m => m.platformId === state.platformId))),
        frontier: this.frontier, frontRunnerId: ranked.find(entry => !entry.isBot)?.id ?? null,
        tickMs: this.tickMs, activeChunks: this.chunks.size,
      };
      this.snapshotSenders.get(p.socket)?.send(snapshot);
    }
  }
}
