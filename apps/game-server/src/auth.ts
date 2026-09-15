import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { parse, serialize } from 'cookie';
import argon2 from 'argon2';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { appearanceSchema, canEquip, normalizeCosmetics, credentialsSchema, registerSchema } from '@tower/shared';
import type { StoredProfile } from '@tower/db';
import { Store, publicProfile } from './store';

export class RateLimiter {
  private buckets = new Map<string, { count: number; until: number }>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    if (this.buckets.size > 10000) for (const [id, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(id);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) { this.buckets.set(key, { count: 1, until: now + this.windowMs }); return true; }
    return ++bucket.count <= this.max;
  }
}
export class Auth {
  constructor(readonly store: Store, private secret: string, private secure: boolean) {}
  private sign(token: string) { return createHmac('sha256', this.secret).update(token).digest('base64url'); }
  tokenHash(cookie?: string): string | undefined {
    const value = parse(cookie ?? '').tower_session;
    if (!value || value.length > 180) return undefined;
    const [token, signature, extra] = value.split('.');
    if (!token || !signature || extra) return undefined;
    const expected = this.sign(token);
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
    return createHash('sha256').update(token).digest('hex');
  }
  authenticate(cookie?: string): StoredProfile | undefined {
    const hash = this.tokenHash(cookie);
    const session = this.store.state.sessions.find(s => s.tokenHash === hash && Date.parse(s.expiresAt) > Date.now());
    return session ? this.store.profile(session.profileId) : undefined;
  }
  issue(res: Response, profile: StoredProfile, oldCookie?: string) {
    this.revoke(oldCookie);
    const token = randomBytes(32).toString('base64url');
    this.store.state.sessions.push({ tokenHash: createHash('sha256').update(token).digest('hex'), profileId: profile.id, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    res.setHeader('Set-Cookie', serialize('tower_session', `${token}.${this.sign(token)}`, { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 }));
  }
  revoke(cookie?: string) {
    const hash = this.tokenHash(cookie);
    this.store.state.sessions = this.store.state.sessions.filter(s => s.tokenHash !== hash);
  }
  clear(res: Response) { res.setHeader('Set-Cookie', serialize('tower_session', '', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/', maxAge: 0 })); }
}

export function authRouter(auth: Auth, onRevoke: (hash: string) => void, onProfile: (id: string) => void) {
  const router = Router();
  const limit = new RateLimiter(20, 60000);
  const loginLimit = new RateLimiter(8, 60000);
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && !limit.allow(req.ip ?? 'unknown')) { res.status(429).json({ error: 'Un peu de patience : réessayez dans une minute.' }); return; }
    next();
  });
  router.get('/me', (req, res) => { const p = auth.authenticate(req.headers.cookie); res.json({ profile: p ? publicProfile(p) : null, settings: p?.settings ?? {} }); });
  router.post('/guest', async (req, res) => {
    let profile = auth.authenticate(req.headers.cookie);
    if (!profile) { profile = auth.store.createGuest(); auth.issue(res, profile, req.headers.cookie); await auth.store.flush(); }
    res.json({ profile: publicProfile(profile), settings: profile.settings });
  });
  router.post('/register', async (req, res) => {
    if (!loginLimit.allow(req.ip ?? 'unknown')) { res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' }); return; }
    const data = registerSchema.parse(req.body);
    const existing = auth.authenticate(req.headers.cookie);
    if ((['mask', 'hat', 'shoes'] as const).some(slot => data[slot] && !canEquip(slot, data[slot]!, existing?.unlockedCosmetics ?? []))) { res.status(403).json({ error: 'Trouvez cette décoration rare dans la tour pour la porter.' }); return; }
    if (existing?.userId) { res.status(409).json({ error: 'Vous êtes déjà connecté à un compte.' }); return; }
    if (auth.store.state.users.some(u => u.email === data.email)) { res.status(409).json({ error: 'Cette adresse ne peut pas être utilisée.' }); return; }
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    // Recheck after hashing; requests can interleave while Argon2 runs.
    if (auth.store.state.users.some(u => u.email === data.email) || existing?.userId) { res.status(409).json({ error: 'Ce compte existe déjà.' }); return; }
    const user = { id: randomUUID(), email: data.email, passwordHash, createdAt: new Date().toISOString() };
    const profile = existing ?? auth.store.createGuest();
    profile.userId = user.id; profile.displayName = data.displayName; profile.guestIdentity = null;
    if (data.color) profile.color = data.color;
    if (data.mask) profile.mask = data.mask;
    if (data.hat) profile.hat = data.hat;
    if (data.shoes) profile.shoes = data.shoes;
    if (data.shoeColor) profile.shoeColor = data.shoeColor;
    if (data.hatColor !== undefined) profile.hatColor = data.hatColor;
    auth.store.state.users.push(user);
    const previous = auth.tokenHash(req.headers.cookie); if (previous) onRevoke(previous);
    auth.issue(res, profile, req.headers.cookie); await auth.store.flush(); onProfile(profile.id);
    res.status(201).json({ profile: publicProfile(profile), settings: profile.settings });
  });
  router.post('/login', async (req, res) => {
    if (!loginLimit.allow(req.ip ?? 'unknown')) { res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' }); return; }
    const data = credentialsSchema.parse(req.body);
    const user = auth.store.state.users.find(u => u.email === data.email);
    // Spend the same hashing effort for an unknown email to reduce account enumeration by timing.
    const valid = user ? await argon2.verify(user.passwordHash, data.password) : (await argon2.hash(data.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }), false);
    if (!user || !valid) { res.status(401).json({ error: 'Email ou mot de passe incorrect.' }); return; }
    const profile = auth.store.state.profiles.find(p => p.userId === user.id)!;
    const previous = auth.tokenHash(req.headers.cookie); if (previous) onRevoke(previous);
    auth.issue(res, profile, req.headers.cookie); await auth.store.flush();
    res.json({ profile: publicProfile(profile), settings: profile.settings });
  });
  router.post('/logout', async (req, res) => {
    const hash = auth.tokenHash(req.headers.cookie); if (hash) onRevoke(hash);
    auth.revoke(req.headers.cookie); auth.clear(res); await auth.store.flush(); res.json({ ok: true });
  });
  router.patch('/profile', async (req, res) => {
    const p = auth.authenticate(req.headers.cookie);
    if (!p) { res.status(401).json({ error: 'Rejoignez la tour pour créer votre profil.' }); return; }
    const data = appearanceSchema.parse(req.body);
    const current = { color: p.color, ...normalizeCosmetics(p) };
    if (!p.userId && (['color', 'mask', 'hat', 'shoes', 'shoeColor', 'hatColor'] as const).some(key => data[key] !== undefined && data[key] !== current[key])) { res.status(403).json({ error: 'Créez un compte pour personnaliser votre tenue et ses accessoires.' }); return; }
    if ((['mask', 'hat', 'shoes'] as const).some(slot => data[slot] && !canEquip(slot, data[slot]!, p.unlockedCosmetics ?? []))) { res.status(403).json({ error: 'Cette décoration rare doit être trouvée dans la tour.' }); return; }
    Object.assign(p, data); await auth.store.flush(); onProfile(p.id);
    res.json({ profile: publicProfile(p) });
  });
  router.patch('/settings', async (req, res) => {
    const p = auth.authenticate(req.headers.cookie);
    if (!p) { res.status(401).json({ error: 'Session expirée.' }); return; }
    p.settings = z.object({ sound: z.number().min(0).max(100), music: z.number().min(0).max(100), reducedMotion: z.boolean(), crt: z.boolean(), curvedScreen: z.boolean().optional(), screenDefaultsVersion: z.literal(1).optional(), bindings: z.object({ left: z.string().max(24), right: z.string().max(24), jump: z.string().max(24), push: z.string().max(24) }).strict() }).strict().parse(req.body);
    await auth.store.flush(); res.json({ ok: true });
  });
  return router;
}
