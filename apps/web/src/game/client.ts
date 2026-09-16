import { io, type Socket } from 'socket.io-client';
import { mechanismPlatforms, shoulderPlatforms, stepBody } from '@tower/game-core';
import { DT, nearbyStandingsSchema, type EntryChoice, type Chunk, type CrumbleState, type Platform, type ClientToServerEvents, type FeedEntry, type NetworkPlayer, type PlayerInput, type PublicProfile, type ServerToClientEvents, type Snapshot, type NearbyStandings } from '@tower/shared';
import { InputController, type Settings } from './input';
import { GameAudio } from './audio';
import { CHUNK_HEIGHT, POWER_UPS, RARE_COSMETICS, type Relic, type Pickup, type GameEffect } from '@tower/shared';
import type { VisualEffect, MotionStamp } from './presentation';
import { RemoteTimeline } from './remote-timeline';

export interface GameState { unlockedCount: number; connected: boolean; reconnecting: boolean; player: NetworkPlayer | null; online: number; botCount: number; feedback: string; routeName: string; coopHint: string; standings: NearbyStandings | null; frontier: number; ping: number; tick: number; tickMs: number; activeChunks: number; worldSeed: number; feed: FeedEntry[]; gamepad: boolean; notice: string; }
export const initialGameState: GameState = { unlockedCount: 0, connected: false, reconnecting: false, player: null, online: 0, botCount: 0, feedback: '', routeName: '', coopHint: '', standings: null, frontier: 0, ping: 0, tick: 0, tickMs: 0, activeChunks: 0, worldSeed: 0, feed: [], gamepad: false, notice: '' };

export class GameClient {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  input: InputController; audio: GameAudio; chunks = new Map<number, Chunk>();
  local: NetworkPlayer | null = null; playerId = ''; frontRunnerId: string | null = null;
  state = { ...initialGameState }; debug = false; cameraY = 0; cameraReady = false;
  bridges: Platform[] = [];
  crumbling: CrumbleState[] = [];
  private predictionTick = 0;
  relics: Relic[] = []; pickups: Pickup[] = []; effects: VisualEffect[] = []; motion = new Map<string, MotionStamp>();
  private previousLocal: { x: number; y: number } | null = null;
  private resetPosition = false;
  private correction = { x: 0, y: 0 }; private feedbackUntil = 0;
  private snapshots: { at: number; data: Snapshot }[] = [];
  private remoteTimeline = new RemoteTimeline();
  private pending: PlayerInput[] = []; private sequence = 0; private accumulator = 0; private uiClock = 0;
  private correctionCount = 0; private maxCorrection = 0; private hardCorrections = 0;
  get networkStats() { return { transport: this.socket.io.engine?.transport.name ?? 'disconnected', pending: this.pending.length, correctionCount: this.correctionCount, maxCorrection: this.maxCorrection, hardCorrections: this.hardCorrections, snapshotAge: this.snapshots.length ? performance.now() - this.snapshots.at(-1)!.at : 0, interpolationDelay: this.remoteTimeline.delay }; }
  private pingTimer: ReturnType<typeof setInterval>; private onChange: (state: GameState) => void;
  constructor(settings: Settings, onChange: (state: GameState) => void, onMenu: () => void, onProfile: (profile: PublicProfile) => void, entry: EntryChoice = { mode: 'saved' }, onEntryRejected: (message: string) => void = () => {}) {
    this.onChange = onChange; this.input = new InputController(settings, onMenu); this.audio = new GameAudio(settings);
    // Start over HTTP; only probe WebSocket when the server advertises it.
    // N0C disables upgrades, including on every reconnection.
    this.socket = io({ autoConnect: false, withCredentials: true, reconnectionDelay: 500, reconnectionDelayMax: 3000, transports: ['polling', 'websocket'] });
    let joined = false;
    this.socket.on('connect', () => this.socket.emit('join', { v: 1, ...(joined ? {} : { entry }) }));
    this.socket.on('joinRejected', data => { if (data.v === 1) onEntryRejected(data.message); });
    this.socket.on('welcome', data => {
      if (data.v !== 1) return;
      joined = true;
      this.playerId = data.playerId; this.local = { ...data.player }; this.sequence = 0; this.pending = []; this.snapshots = [];
      this.remoteTimeline.reset();
      this.accumulator = 0; this.cameraReady = false;
      this.predictionTick = data.tick ?? 0; this.crumbling = []; this.chunks.clear();
      this.correctionCount = 0; this.maxCorrection = 0; this.hardCorrections = 0;
      this.resetPosition = false;
      this.previousLocal = null; this.correction = { x: 0, y: 0 }; this.effects = []; this.motion.clear(); this.pickups = []; this.relics = []; this.bridges = [];
      this.state = { ...this.state, connected: true, reconnecting: false, notice: '', player: data.player, worldSeed: data.worldSeed, standings: null, unlockedCount: data.profile.unlockedCosmetics.length };
      onProfile(data.profile); this.publish();
    });
    this.socket.on('chunks', data => {
      if (data.v !== 1) return;
      const keep = new Set(data.chunks.map(c => c.index));
      for (const index of this.chunks.keys()) if (!keep.has(index)) this.chunks.delete(index);
      for (const chunk of data.chunks) this.chunks.set(chunk.index, chunk);
    });
    this.socket.on('snapshot', data => this.reconcile(data));
    this.socket.on('effect', data => this.receiveEffect(data));
    this.socket.on('profileUpdate', data => { if (data.v === 1) { this.state.unlockedCount = data.profile.unlockedCosmetics.length; onProfile(data.profile); this.publish(); } });
    this.socket.on('feed', data => { if (data.v === 1) this.state.feed = [data.entry, ...this.state.feed].slice(0, 4); });
    this.socket.on('notice', data => {
      if (data.v !== 1) return;
      this.state.notice = data.message;
      if (data.reason === 'respawn') {
        this.resetPosition = true;
        this.pending = []; this.input.clear(); this.previousLocal = null; this.correction = { x: 0, y: 0 }; this.cameraReady = false;
        this.state.feedback = data.message; this.feedbackUntil = performance.now() + 4500;
      }
      this.publish();
    });
    this.socket.on('disconnect', reason => { this.state.connected = false; this.state.reconnecting = reason !== 'io server disconnect'; this.state.standings = null; this.state.online = 0; this.state.botCount = 0; this.state.feedback = ''; this.pickups = []; this.relics = []; this.bridges = []; this.effects = []; this.input.clear(); this.publish(); });
    this.socket.on('connect_error', error => { this.state.connected = false; this.state.notice = error.message === 'websocket error' ? 'Le monde est injoignable. Nouvelle tentative…' : error.message; this.publish(); });
    this.pingTimer = setInterval(() => {
      if (!this.socket.connected) return;
      const start = performance.now(); this.socket.timeout(2500).emit('ping', (error: Error | null) => {
        this.state.ping = error ? 0 : Math.round(performance.now() - start);
      });
    }, 2500);
    this.socket.connect();
  }
  setSettings(settings: Settings) { this.input.settings = settings; this.audio.settings = settings; }
  private receiveEffect(data: GameEffect) {
    if (data.v !== 1) return;
    const own = data.actorId === this.playerId;
    this.effects.push({ data, at: performance.now() + (own ? 0 : this.remoteTimeline.delay) });
    this.effects = this.effects.slice(-64);
    if (data.kind === 'pickup') {
      if (own) { this.state.feedback = `${POWER_UPS[data.powerUp].name} ${data.powerUp === 'boots' ? 'récupérées' : 'récupérée'} !`; this.feedbackUntil = performance.now() + 2400; this.audio.pickup(); }
    } else if (data.kind === 'unlock') {
      if (own) {
        const name = RARE_COSMETICS.find(rare => rare.id === data.cosmeticId)?.name ?? 'Ornement rare';
        this.state.feedback = data.duplicate ? `Doublon : ${name} — déjà dans votre collection. Retentez votre chance dans un autre coffre !` : `${name} débloqué ! Retrouvez-le dans la garde-robe.`;
        this.feedbackUntil = performance.now() + 6500; this.audio.pickup();
      }
    } else {
      const hit = data.hits.find(h => h.id === this.playerId);
      if (own) {
        this.audio.push();
        this.state.feedback = data.hits.some(h => !h.blocked) ? 'Poussée réussie !' : data.hits.length ? 'La bulle a absorbé la poussée' : 'Personne à portée';
      } else if (hit) this.state.feedback = hit.blocked ? 'Votre bulle a absorbé la poussée !' : 'Vous avez été poussé !';
      if ((own && data.hits.length) || hit) this.audio.impact(Boolean(hit?.blocked || data.hits[0]?.blocked));
      if (own || hit) this.feedbackUntil = performance.now() + 1800;
    }
  }
  private reconcile(snapshot: Snapshot) {
    if (snapshot.v !== 1 || snapshot.tick <= (this.snapshots.at(-1)?.data.tick ?? -1)) return;
    const at = performance.now();
    this.remoteTimeline.receive(snapshot.tick, at);
    this.snapshots.push({ at, data: snapshot }); if (this.snapshots.length > 12) this.snapshots.shift();
    this.bridges = snapshot.bridges ?? [];
    this.crumbling = snapshot.crumbling ?? [];
    this.predictionTick = snapshot.tick;
    const own = snapshot.players.find(p => p.id === this.playerId);
    if (own) {
      const reset = this.resetPosition; this.resetPosition = false;
      this.pending = reset ? [] : this.pending.filter(input => input.seq > own.ack);
      const corrected = { ...own };
      for (const input of this.pending) { this.predictionTick++; stepBody(corrected, input, this.platforms(corrected, snapshot.players), DT); }
      if (this.local) {
        const dx = this.local.x - corrected.x, dy = this.local.y - corrected.y;
        if (!reset) {
          this.correctionCount++; this.maxCorrection = Math.max(this.maxCorrection, Math.hypot(dx, dy));
          if (Math.abs(dy) > 80 || Math.abs(dx) > 60) this.hardCorrections++;
        }
        if (reset || Math.abs(dy) > 80 || Math.abs(dx) > 60) { this.cameraReady = false; this.previousLocal = null; this.correction = { x: 0, y: 0 }; }
        else {
          this.correction.x = Math.max(-48, Math.min(48, this.correction.x + dx)); this.correction.y = Math.max(-48, Math.min(48, this.correction.y + dy));
          if (this.previousLocal) { this.previousLocal.x -= dx; this.previousLocal.y -= dy; }
        }
      }
      this.local = corrected;
    }
    this.frontRunnerId = snapshot.frontRunnerId;
    const standings = nearbyStandingsSchema.safeParse(snapshot.standings);
    this.pickups = snapshot.pickups ?? []; this.relics = snapshot.relics ?? [];
    this.state = { ...this.state, player: own ?? null, online: snapshot.playerCount, botCount: snapshot.botCount ?? 0, standings: standings.success ? standings.data : null, frontier: snapshot.frontier, tick: snapshot.tick, tickMs: snapshot.tickMs, activeChunks: snapshot.activeChunks };
  }
  update(milliseconds: number) {
    const dt = Math.min(milliseconds, 100) / 1000;
    this.uiClock += dt; this.accumulator += dt;
    this.correction.x *= Math.exp(-dt * 12); this.correction.y *= Math.exp(-dt * 12);
    this.effects = this.effects.filter(effect => performance.now() - effect.at < 650);
    if (performance.now() > this.feedbackUntil) this.state.feedback = '';
    if (this.local && this.state.connected && this.chunks.has(Math.max(0, Math.floor(this.local.y / CHUNK_HEIGHT)))) {
      while (this.accumulator >= DT) {
        this.accumulator -= DT;
        // Bound prediction if acknowledgements stop. Never replay an unbounded backlog.
        if (this.pending.length >= 90) continue;
        const input = this.input.sample(this.sequence++); const previous = { ...this.local };
        this.previousLocal = { x: this.local.x, y: this.local.y };
        this.pending.push(input); this.socket.emit('input', input);
        this.predictionTick++;
        stepBody(this.local, input, this.platforms(this.local), DT);
        if (this.local.vy > 200 && previous.vy <= 0) this.audio.jump();
        if (this.local.grounded && !previous.grounded) this.audio.land();
        this.local.pushHeld = input.push;
      }
      // Follow the same smoothed position as the visible mage, so corrections do
      // not move the entire tower while the character is still easing into place.
      const target = Math.max(0, this.renderLocal()!.y + Math.max(0, this.local.vy) * 0.08);
      this.cameraY = this.cameraReady ? this.cameraY + (target - this.cameraY) * Math.min(1, dt * 7) : target; this.cameraReady = true;
    } else this.accumulator = 0;
    if (this.uiClock > 0.1) {
      this.uiClock = 0; this.state.gamepad = this.input.gamepadConnected;
      this.state.routeName = [...this.chunks.values()].find(chunk => this.local && this.local.y >= chunk.entry.y && this.local.y < chunk.exit.y)?.name ?? '';
      const gap = [...this.chunks.values()].find(c => c.cooperation && this.local && this.local.y >= c.entry.y && this.local.y < c.exit.y)?.cooperation;
      this.state.coopHint = gap ? this.bridges.some(p => p.id === gap.bridge.id) ? 'Passerelle déployée ! Faites passer votre partenaire avant qu’elle se replie.' : 'Passage à deux : montez sur un partenaire, puis sautez. Le premier en haut déploie une passerelle pendant 8 s.' : '';
      this.publish();
    }
  }
  private platforms(body: NetworkPlayer, others = this.snapshots.at(-1)?.data.players ?? []): Platform[] {
    return [...mechanismPlatforms([...this.chunks.values()], this.predictionTick, this.crumbling), ...this.bridges, ...shoulderPlatforms(body, others)];
  }
  renderPlatforms(): Platform[] { return [...mechanismPlatforms([...this.chunks.values()], this.renderTick, this.crumbling), ...this.bridges]; }
  get renderTick() { return Math.max(0, this.predictionTick - 1) + Math.min(1, this.accumulator / DT); }
  private renderLocal(): NetworkPlayer | null {
    if (!this.local) return null;
    const previous = this.previousLocal ?? this.local, alpha = Math.min(1, this.accumulator / DT);
    return { ...this.local, x: previous.x + (this.local.x - previous.x) * alpha + this.correction.x, y: previous.y + (this.local.y - previous.y) * alpha + this.correction.y };
  }
  renderPlayers(): NetworkPlayer[] {
    const now = performance.now(), target = this.remoteTimeline.sample(now);
    const before = [...this.snapshots].reverse().find(s => s.data.tick <= target) ?? this.snapshots[0];
    const after = this.snapshots.find(s => s.data.tick >= target) ?? this.snapshots.at(-1);
    const others: NetworkPlayer[] = [];
    if (before && after) {
      const alpha = before === after ? 0 : Math.max(0, Math.min(1, (target - before.data.tick) / (after.data.tick - before.data.tick)));
      for (const p of after.data.players) {
        if (p.id === this.playerId) continue;
        const previous = before.data.players.find(b => b.id === p.id) ?? p;
        const teleport = Math.abs(p.y - previous.y) > 100 || Math.abs(p.x - previous.x) > 100;
        others.push({ ...p, grounded: !teleport && alpha < 1 ? previous.grounded : p.grounded, x: teleport ? p.x : previous.x + (p.x - previous.x) * alpha, y: teleport ? p.y : previous.y + (p.y - previous.y) * alpha });
      }
    }
    const local = this.renderLocal(); if (local) others.push(local);
    const visible = new Set(others.map(p => p.id));
    for (const id of this.motion.keys()) if (!visible.has(id)) this.motion.delete(id);
    for (const p of others) {
      const previous = this.motion.get(p.id);
      const landing = p.grounded && previous && !previous.grounded;
      if (landing) this.effects.push({ at: now, data: { kind: 'land', id: `${p.id}:${now}`, actorId: p.id, x: p.x, y: p.y } });
      this.motion.set(p.id, { grounded: p.grounded, landedAt: landing ? now : previous?.landedAt ?? -1000 });
    }
    return others;
  }
  respawn() { this.pending = []; this.socket.emit('respawn', { v: 1 }); }
  returnToBase() { this.pending = []; this.input.clear(); this.socket.emit('returnToBase', { v: 1 }); }
  private publish() { this.onChange({ ...this.state, feed: [...this.state.feed] }); }
  destroy() { clearInterval(this.pingTimer); this.socket.removeAllListeners(); this.socket.disconnect(); this.input.destroy(); this.audio.destroy(); }
}
