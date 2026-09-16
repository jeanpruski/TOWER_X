import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ArrowDownToLine, Flag, Trophy, Users, Settings2, Maximize2, RotateCcw, Wifi, Bug, ChevronLeft, ChevronRight, MoveUp, Shirt, Gem } from 'lucide-react';
import { CHUNK_HEIGHT, DIFFICULTY_LEVELS, difficultyAtChunk, BIOMES, biomeAtChunk, RARE_COSMETICS, heightInMeters, type EntryChoice, type CrumbleState, type Relic, type Platform, type PublicProfile, type NetworkPlayer, type Pickup, type Chunk } from '@tower/shared';
import { GameClient, initialGameState, type GameState } from '../game/client';
import type { Settings } from '../game/input';
import { keyName } from './Settings';
import { MageAvatar } from './Preview';
import { Modal } from './Modal';
import { NearbyPlayers } from './NearbyPlayers';
import { ActionHud } from './ActionHud';

declare global { interface Window { towerDebug?: { teleportToChunk: (chunkIndex: number) => void; inspect: () => { network: GameClient['networkStats']; player: NetworkPlayer | null; players: NetworkPlayer[]; pickups: Pickup[]; relics: Relic[]; bridges: Platform[]; chunks: Chunk[]; platforms: Platform[]; crumbling: CrumbleState[]; tick: number } }; } }

export function Game({ settings, onProfile, onExit, onSettings, onAccount, entry, onEntryRejected, paused }: { settings: Settings; onProfile: (p: PublicProfile) => void; onExit: () => void; onSettings: () => void; onAccount: () => void; entry: EntryChoice; onEntryRejected: (message: string) => void; paused: boolean }) {
  const mount = useRef<HTMLDivElement>(null), container = useRef<HTMLDivElement>(null), client = useRef<GameClient | null>(null);
  const [state, setState] = useState<GameState>(initialGameState); const [menu, setMenu] = useState(false); const [debug, setDebug] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [confirmBase, setConfirmBase] = useState(false);
  const callbacks = useRef({ onProfile, onEntryRejected }); callbacks.current = { onProfile, onEntryRejected };
  const externalModal = useRef(paused); externalModal.current = paused;
  useEffect(() => {
    let destroyed = false; let game: { destroy: (remove: boolean) => void } | undefined;
    const connection = new GameClient(settings, setState, () => { if (!externalModal.current) setMenu(value => !value); }, p => callbacks.current.onProfile(p), entry, message => callbacks.current.onEntryRejected(message));
    client.current = connection;
    const debugCommands = { teleportToChunk: (chunkIndex: number) => connection.socket.emit('devTeleport', { v: 1, chunkIndex }), inspect: () => ({ network: connection.networkStats, player: connection.local, players: connection.renderPlayers(), pickups: connection.pickups, relics: connection.relics, bridges: connection.bridges, chunks: [...connection.chunks.values()], platforms: connection.renderPlatforms(), crumbling: connection.crumbling, tick: connection.renderTick }) };
    if (import.meta.env.DEV) window.towerDebug = debugCommands;
    void import('../game/scene').then(({ mountGame }) => {
      if (destroyed || !mount.current) return;
      game = mountGame(mount.current, connection); setLoading(false);
    }).catch(() => setError('Le rendu du jeu n’a pas pu démarrer. Rechargez la page.'));
    const unlock = () => connection.audio.unlock();
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { destroyed = true; connection.destroy(); game?.destroy(true); client.current = null; if (window.towerDebug === debugCommands) delete window.towerDebug; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [entry]);
  useEffect(() => { client.current?.setSettings(settings); }, [settings]);
  useEffect(() => { if (client.current) { client.current.input.enabled = !menu && !paused && !confirmBase; if (menu || paused || confirmBase) client.current.input.clear(); else mount.current?.focus({ preventScroll: true }); } }, [menu, paused, confirmBase]);
  useEffect(() => { if (client.current) client.current.debug = debug; }, [debug]);
  const player = state.player;
  const mechanism = client.current?.chunks.get(Math.floor((player?.y ?? 0) / CHUNK_HEIGHT))?.mechanisms[0]?.kind;
  const mechanismHint = mechanism ? {
    moving: 'Passerelles bleues : laissez-vous transporter, puis choisissez le bon moment pour sauter.',
    crumble: 'Dalles orange : ça craque sous vos pieds ! Repartez avant 1,2 s. Elles reviennent après 5 s.',
    spring: 'Tremplins roses : atterrissez dessus pour un grand rebond et dirigez-vous en l’air vers un raccourci.',
  }[mechanism] : '';
  const biome = biomeAtChunk(Math.floor((player?.y ?? 0) / CHUNK_HEIGHT));
  const challenge = difficultyAtChunk(Math.floor((player?.y ?? 0) / CHUNK_HEIGHT));
  const current = heightInMeters(player?.y ?? 0), campHeight = heightInMeters((player?.lastCamp ?? 0) * CHUNK_HEIGHT);
  const touch = (action: string, down: boolean) => { client.current?.audio.unlock(); client.current?.input.touch(action, down); };
  return <main className="game-page" ref={container}>
    <header className="game-header"><button className="text-button" onClick={onExit}><ArrowLeft size={17}/> Quitter la tour</button><span className="game-wordmark">TOWER <b>X</b></span><button className="icon-button" aria-label="Menu du jeu" onClick={() => setMenu(true)}><Settings2 size={19}/></button></header>
    <div className="game-layout">
      <section className="game-main">
        <div className="game-topline"><div><span className="live-dot"/> {state.connected ? 'VOUS ÊTES DANS LA TOUR' : 'CONNEXION AU MONDE…'}</div><span><Wifi size={13}/> {state.ping > 0 ? `${state.ping} ms` : '—'} <i/> {state.gamepad ? 'MANETTE' : 'CLAVIER'}</span></div>
        <div className={`game-frame ${settings.crt ? 'crt' : ''} ${settings.curvedScreen ? 'curved' : ''}`}>
          <ActionHud player={player} settings={settings} feedback={state.feedback} connected={state.connected} gamepad={state.gamepad}/>
          <div className="game-viewport">
          <div className="game-canvas" ref={mount} tabIndex={0} aria-label="Jeu TOWER X : utilisez les flèches pour bouger et Espace pour sauter."/>
          <div className="canvas-label" data-biome={biome.id}><span>{String(BIOMES.indexOf(biome) + 1).padStart(2, '0')} / {biome.name.toLocaleUpperCase('fr')}</span><button aria-label="Plein écran" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void container.current?.requestFullscreen().catch(() => setError('Le plein écran n’est pas disponible dans ce navigateur.')); }}><Maximize2 size={16}/></button></div>
          {(!state.connected || loading || error) && <div className="connection-overlay"><div className="spinner"/><strong>{error || (state.reconnecting ? 'On vous retrouve…' : 'La tour s’éveille…')}</strong><span>{state.notice || 'Préparation de votre arrivée au camp.'}</span>{!state.reconnecting && state.notice && <button className="button primary" onClick={onExit}>Retour à l’accueil</button>}</div>}
          {debug && <div className="debug-overlay">seed {state.worldSeed} · chunk {Math.max(0, Math.floor((player?.y ?? 0) / CHUNK_HEIGHT))}<br/>tick {state.tick} · {state.tickMs.toFixed(2)} ms · {state.activeChunks} chunks<br/>x {player?.x.toFixed(1)} · y {player?.y.toFixed(1)} · ack {player?.ack}<br/>{client.current?.networkStats.transport} · {client.current?.networkStats.pending} commandes non confirmées</div>}
          </div>
        </div>
        <div className="game-controls"><span><kbd>{keyName(settings.bindings.left)}</kbd><kbd>{keyName(settings.bindings.right)}</kbd> Bouger</span><span><kbd>{keyName(settings.bindings.jump)}</kbd> Sauter</span><span><kbd>{keyName(settings.bindings.push)}</kbd> Pousser</span><span><kbd>Échap</kbd> Menu</span><button className={`icon-button ${debug ? 'active' : ''}`} aria-label="Afficher le debug" onClick={() => setDebug(value => !value)}><Bug size={15}/></button></div>
        <div className="touch-controls">{[{ action: 'left', icon: <ChevronLeft/> }, { action: 'right', icon: <ChevronRight/> }, { action: 'push', icon: <span>E</span> }, { action: 'jump', icon: <MoveUp/> }].map(({ action, icon }) => <button key={action} aria-label={action} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); touch(action, true); }} onPointerUp={() => touch(action, false)} onPointerCancel={() => touch(action, false)} onLostPointerCapture={() => touch(action, false)}>{icon}</button>)}</div>
        <p className="coop-hint" role="status" hidden={!state.coopHint}><Users size={17}/>{state.coopHint}</p>
        <p className={`mechanism-hint ${mechanism ?? ''}`} role="status" hidden={!mechanismHint}>{mechanismHint}</p>
        <p className="relic-hint"><Gem size={14}/> Les coffres lumineux cachent des visages, masques, coiffes et chaussures rares à garder.</p>
        <p className="game-tip"><span>{state.routeName || 'LE SAVIEZ-VOUS ?'}</span> Visez le dessus clair des plateformes. Les piliers et attaches sombres font partie du décor.</p>
      </section>
      <aside className="game-sidebar">
        <div className="player-label"><MageAvatar {...player} color={player?.color ?? '#c6ed80'} size={30}/><div><strong>{player?.displayName ?? 'Votre mage'}</strong><span>En route vers le sommet</span></div></div>
        <button className="wardrobe-entry" onClick={onAccount}><Shirt size={17}/><span>Garde-robe</span><small><Gem size={12}/> {state.unlockedCount}/{RARE_COSMETICS.length}</small></button>
        <div className="altitude-card"><div className="section-label"><ArrowUp size={14}/> ALTITUDE ACTUELLE</div><div className="big-height">{current}<span>m</span></div><div className="height-line"><span style={{ width: `${current % 100}%` }}/></div><small>Prochain camp à {Math.floor(current / 100) * 100 + 100} m</small><div className="difficulty-meter" data-level={challenge.level} aria-label={`Difficulté ${challenge.level} sur 5 : ${challenge.name}`}><div><span>DIFFICULTÉ</span><strong>{challenge.name}</strong></div><div className="difficulty-bars" aria-hidden="true">{DIFFICULTY_LEVELS.map(level => <i key={level.level} className={level.level <= challenge.level ? 'filled' : ''}/>)}</div><p>{challenge.hint}</p></div></div>
        <NearbyPlayers standings={state.standings} online={state.online} botCount={state.botCount} connected={state.connected}/>
        <div className="stat-row"><Trophy size={18}/><span>Record personnel</span><strong>{player?.personalBest ?? 0} m</strong></div>
        <div className="stat-row"><Flag size={18}/><span>Dernier camp</span><strong>{campHeight} m</strong></div>
        <div className="stat-row"><ArrowUp size={18}/><span>Frontière active</span><strong>{state.frontier} m</strong></div>
        <div className="world-feed"><div className="section-label"><Users size={14}/> DANS LA TOUR</div>{state.feed.map(entry => <p key={entry.id}><span className="feed-dot"/>{entry.text}</p>)}{state.online === 1 && <p className="feed-invite">La tour se partage. Invitez quelqu’un à vous rejoindre avec le lien du site.</p>}</div>
        {state.notice && state.connected && <p className="notice" role="status">{state.notice}</p>}
        <button className="button outline camp-button" onClick={() => { client.current?.respawn(); mount.current?.focus({ preventScroll: true }); }}><RotateCcw size={16}/> Retour au camp</button>
        <button className="button outline camp-button base-button" disabled={!state.connected} onClick={() => setConfirmBase(true)}><ArrowDownToLine size={16}/> Retour au pied de la tour</button>
      </aside>
    </div>
    <footer className="game-footer"><span><span className="live-dot"/> UN MONDE. AUCUNE FIN.</span><span>Vos records sont enregistrés automatiquement.</span></footer>
    {menu && <Modal title="Une petite pause ?" onClose={() => setMenu(false)}><p className="modal-description">La tour continue de vivre. Vous pouvez revenir au camp pour vous mettre à l’abri.</p><div className="menu-actions"><button className="button primary" onClick={() => setMenu(false)}>Reprendre l’ascension <ArrowUp size={18}/></button><button className="button outline" onClick={() => { client.current?.respawn(); setMenu(false); }}>Retourner au camp</button><button className="button outline" onClick={() => { setMenu(false); setConfirmBase(true); }}>Retour au pied de la tour</button><button className="button outline" onClick={() => { setMenu(false); onSettings(); }}>Réglages</button><button className="button outline" onClick={() => { setMenu(false); onAccount(); }}>Mon profil</button><button className="text-button" onClick={onExit}>Quitter la tour</button></div></Modal>}
    {confirmBase && <Modal title="Repartir tout en bas ?" onClose={() => setConfirmBase(false)}><p className="modal-description">Vous retournerez au camp de départ, à <strong>0 m</strong>. Votre record et vos cosmétiques restent acquis. Vos bonus temporaires seront perdus et votre prochain retour au camp se fera au pied de la tour.</p><div className="menu-actions"><button className="button primary" data-initial-focus onClick={() => setConfirmBase(false)}>Continuer l’ascension</button><button className="button outline" disabled={!state.connected} onClick={() => { client.current?.returnToBase(); setConfirmBase(false); }}>Confirmer le retour à 0 m</button></div></Modal>}
  </main>;
}
