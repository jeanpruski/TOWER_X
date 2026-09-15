import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ZodError } from 'zod';
import pino from 'pino';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { ClientToServerEvents, ServerToClientEvents } from '@tower/shared';
import { Store } from './store';
import { Auth, RateLimiter, authRouter } from './auth';
import { World } from './world';

export interface AppOptions { dataFile: string; secret: string; production?: boolean; origin?: string; databaseUrl?: string; devTools?: boolean; silent?: boolean; bots?: number; }
export async function createApp(options: AppOptions) {
  const log = pino({ level: options.silent ? 'silent' : 'info' });
  const store = await Store.open(options.dataFile, options.databaseUrl);
  const auth = new Auth(store, options.secret, options.production ?? false);
  const app = express(); const http = createServer(app);
  const allowedOrigins = new Set([options.origin]);
  if (!options.production && options.origin) {
    const localOrigin = new URL(options.origin);
    if (['localhost', '127.0.0.1'].includes(localOrigin.hostname)) {
      localOrigin.hostname = localOrigin.hostname === 'localhost' ? '127.0.0.1' : 'localhost'; allowedOrigins.add(localOrigin.origin);
    }
  }
  app.disable('x-powered-by');
  if (options.production) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: options.production ? { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", 'wss:'], fontSrc: ["'self'"],
  } } : false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '8kb' }));
  const httpLimit = new RateLimiter(180, 60000);
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!httpLimit.allow(req.ip ?? 'unknown')) { res.status(429).json({ error: 'Trop de requêtes.' }); return; }
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) { res.status(403).json({ error: 'Origine non autorisée.' }); return; }
      if (!req.is('application/json')) { res.status(415).json({ error: 'JSON requis.' }); return; }
    }
    next();
  });
  const connectionLimit = new RateLimiter(60, 60000);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    maxHttpBufferSize: 8192, pingInterval: 10000, pingTimeout: 10000,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, (!origin || allowedOrigins.has(origin)) && connectionLimit.allow(req.socket.remoteAddress ?? 'unknown'));
    },
  });
  io.use((socket, next) => auth.authenticate(socket.handshake.headers.cookie) ? next() : next(new Error('Session expirée. Rejoignez à nouveau la tour.')));
  const maxBots = options.bots ?? 3;
  if (!Number.isInteger(maxBots) || maxBots < 0 || maxBots > 3) throw new Error('bots must be an integer from 0 to 3');
  const world = new World(io, store, auth, log, options.devTools && !options.production, maxBots);
  app.use('/api/auth', authRouter(auth, hash => world.revoke(hash), id => world.updateProfile(id)));
  app.get('/api/world', (_req, res) => res.json({ online: world.online, frontier: world.frontier, worldSeed: store.state.world.seed, uptime: Math.floor(process.uptime()) }));
  app.get('/api/world/players', (req, res) => {
    const profile = auth.authenticate(req.headers.cookie);
    if (!profile) { res.status(401).json({ error: 'Identifiez-vous pour choisir votre départ.' }); return; }
    res.json({ players: world.joinablePlayers(profile.id) });
  });
  app.get('/api/leaderboard', (_req, res) => res.json({ players: [...store.state.profiles].filter(p => p.personalBest > 0).sort((a, b) => b.personalBest - a.personalBest).slice(0, 10).map(p => ({ id: p.id, displayName: p.displayName, color: p.color, mask: p.mask, hat: p.hat, shoes: p.shoes, shoeColor: p.shoeColor, hatColor: p.hatColor, personalBest: p.personalBest })) }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Cette route n’existe pas.' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.1.0', tick: world.tick, players: world.online, storage: options.databaseUrl ? 'postgresql' : 'file' }));
  app.get('/metrics', (_req, res) => res.type('text/plain').send([
    `tower_players ${world.online}`, `tower_bots ${world.botCount}`, `tower_tick_duration_ms ${world.tickMs.toFixed(3)}`,
    `tower_tick_max_ms ${world.maxTickMs.toFixed(3)}`, `tower_active_chunks ${world.chunks.size}`,
    `tower_rejected_inputs_total ${world.rejectedInputs}`, `tower_memory_bytes ${process.memoryUsage().rss}`,
    `tower_tick_total ${world.tick}`, '',
  ].join('\n')));
  const webRoot = resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(webRoot)) { app.use(express.static(webRoot)); app.get('/{*path}', (_req, res) => res.sendFile(resolve(webRoot, 'index.html'))); }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) { res.status(400).json({ error: error.issues[0]?.message ?? 'Données invalides.' }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'JSON invalide.' }); return; }
    if ((error as { status?: number })?.status === 413) { res.status(413).json({ error: 'Requête trop volumineuse.' }); return; }
    log.error({ err: error }, 'Request failed'); res.status(500).json({ error: 'Une erreur est survenue. Réessayez.' });
  });
  world.start();
  return { app, http, io, world, store, auth, log, close: async () => {
    world.stop(); await new Promise<void>(resolve => io.close(() => resolve())); await store.close();
  } };
}
