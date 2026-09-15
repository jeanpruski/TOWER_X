import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, ArrowRight, ArrowUp, Users, Infinity as InfinityIcon, Gamepad2, Volume2, VolumeX, Settings2, Trophy, Flag, Sparkles, X, Check, Mail, LogOut, ChevronDown } from 'lucide-react';
import { BOT_COLOR, ROBE_COLORS, type EntryChoice, type PublicProfile, type WorldStatus } from '@tower/shared';
import { api } from './api';
import { Preview, MageAvatar } from './components/Preview';
import { Modal } from './components/Modal';
import { SettingsPanel } from './components/Settings';
import { StartChoice } from './components/StartChoice';
import { Game } from './components/Game';
import { TowerFeatures } from './components/TowerFeatures';
import { Wardrobe, DEFAULT_COSTUME, type Costume } from './components/Wardrobe';
import { loadSettings, mergeSettings, type Settings } from './game/input';

type ModalKind = 'login' | 'register' | 'settings' | 'leaderboard' | 'profile' | 'start' | null;
type Leader = Pick<PublicProfile, 'id' | 'displayName' | 'color' | 'mask' | 'hat' | 'shoes' | 'shoeColor' | 'hatColor' | 'personalBest'>;
function TowerMark() { return <svg viewBox="0 0 32 36" aria-hidden="true"><path d="M3 2h6v7h4V2h6v7h4V2h6v14h-5v18h-8V23h-4v11H7V16H3z" fill="currentColor"/></svg>; }

export default function App() {
  const [view, setView] = useState<'landing' | 'game'>('landing'); const [modal, setModal] = useState<ModalKind>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null), [settings, setSettings] = useState<Settings>(loadSettings);
  const [world, setWorld] = useState<WorldStatus | null>(null), [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [entry, setEntry] = useState<EntryChoice>({ mode: 'saved' }), [gameKey, setGameKey] = useState(0);
  const [displayName, setDisplayName] = useState(''), [costume, setCostume] = useState<Costume>(DEFAULT_COSTUME);
  const [navOpen, setNavOpen] = useState(false);
  const refreshWorld = useCallback(() => { void api<WorldStatus>('/world').then(setWorld).catch(() => setWorld(null)); }, []);
  useEffect(() => {
    void api<{ profile: PublicProfile | null; settings: Partial<Settings> }>('/auth/me').then(data => {
      setProfile(data.profile); if (data.profile && Object.keys(data.settings).length) setSettings(current => mergeSettings(data.settings, current));
    }).catch(() => {});
    refreshWorld(); const timer = setInterval(refreshWorld, 10000); return () => clearInterval(timer);
  }, [refreshWorld]);
  useEffect(() => { localStorage.setItem('tower.settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    if (modal !== 'leaderboard') return;
    setLeaders(null); void api<{ players: Leader[] }>('/leaderboard').then(data => setLeaders(data.players)).catch(e => setError((e as Error).message));
  }, [modal]);
  const open = (kind: ModalKind) => { if (kind === 'profile' || kind === 'register') { setDisplayName(profile?.displayName ?? ''); setCostume(profile ? { color: profile.color, mask: profile.mask, hat: profile.hat, shoes: profile.shoes ?? DEFAULT_COSTUME.shoes, shoeColor: profile.shoeColor ?? DEFAULT_COSTUME.shoeColor, hatColor: profile.hatColor ?? null } : DEFAULT_COSTUME); } setError(''); setSaved(false); setNavOpen(false); setModal(kind); };
  const closeModal = async () => {
    if (modal === 'settings' && profile) {
      try { await api('/auth/settings', settings, 'PATCH'); }
      catch (e) { setError((e as Error).message); return; }
    }
    setModal(null); setError('');
  };
  const enterGame = async () => {
    setBusy(true); setError('');
    try { const data = await api<{ profile: PublicProfile }>('/auth/guest', {}); setProfile(data.profile); setView('landing'); setModal('start'); window.scrollTo(0, 0); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ profile: PublicProfile; settings: Partial<Settings> }>(`/auth/${modal}`, { email: data.get('email'), password: data.get('password'), ...(modal === 'register' ? { displayName: data.get('displayName'), ...costume } : {}) });
      setProfile(result.profile); if (Object.keys(result.settings).length) setSettings(current => mergeSettings(result.settings, current));
      setView('landing'); setModal('start'); window.scrollTo(0, 0);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const startGame = (choice: EntryChoice) => { setEntry(choice); setError(''); setModal(null); setGameKey(key => key + 1); setView('game'); window.scrollTo(0, 0); };
  const rejectEntry = (message: string) => { setView('landing'); setError(message); setModal('start'); };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api<{ profile: PublicProfile }>('/auth/profile', { displayName, ...costume }, 'PATCH'); setProfile(result.profile); setSaved(true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const logout = async () => {
    try { await api('/auth/logout', {}); setProfile(null); setView('landing'); setModal(null); refreshWorld(); }
    catch (e) { setError((e as Error).message); }
  };
  return <>
    {view === 'landing' ? <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#" aria-label="TOWER X, accueil"><TowerMark/><span>TOWER<span className="brand-x">X</span></span></a>
        <nav id="site-navigation" className={navOpen ? 'open' : ''} aria-label="Navigation principale"><a href="#univers" onClick={() => setNavOpen(false)}>L’univers</a><a href="#nouveautes" onClick={() => setNavOpen(false)}>Nouveautés</a><a href="#comment-jouer" onClick={() => setNavOpen(false)}>Comment jouer</a><button onClick={() => open('leaderboard')}>Les sommets <ArrowUpRight size={13}/></button></nav>
        <div className="header-actions"><span className="version-badge">ALPHA 0.1</span><button className="icon-button header-settings" aria-label="Réglages" onClick={() => open('settings')}><Settings2 size={18}/></button><button className="login-button" onClick={() => open(profile ? 'profile' : 'login')}>{profile ? profile.displayName : 'Se connecter'}<ArrowUpRight size={15}/></button><button className="icon-button mobile-nav" aria-label="Ouvrir la navigation" aria-expanded={navOpen} aria-controls="site-navigation" onClick={() => setNavOpen(value => !value)}><ChevronDown size={20}/></button></div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="tiny-star">✦</span>GRANDE ASCENSION.</div>
            <h1 aria-label="Toujours plus haut.">Toujours<br/>plus <span>haut<svg viewBox="0 0 227 17" aria-hidden="true"><path d="M3 11C54 2 132 0 222 7M35 15C87 8 158 5 202 11" fill="none" stroke="currentColor" strokeWidth="4"/></svg></span><span className="headline-dot">.</span></h1>
            <p className="hero-description">Une tour infinie. Des mages hauts en couleur.<br/>Esquivez les pics, attrapez un bonus,<br/><strong>et faites la courte échelle vers les nuages.</strong></p>
            <a className="hero-update" href="#nouveautes"><Sparkles size={14}/><span>La tour bouge. Et elle pique.</span><ArrowRight size={14}/></a>
            <div className="hero-cta"><button className="button primary play-button" disabled={busy} onClick={() => void enterGame()}>{busy ? 'Ouverture de la tour…' : profile ? 'Reprendre l’ascension' : 'Jouer en invité'}<ArrowUpRight size={23}/></button><span>Gratuit. Sans installation. Sans compte obligatoire.</span></div>
            {!profile && <p className="account-nudge">Envie d’un mage à votre goût ? <button onClick={() => open('register')}>Créer un compte <ArrowRight size={13}/></button></p>}
            {error && !modal && <p className="form-error" role="alert">{error}</p>}
            <div className="hero-live"><div className="mini-mages">{ROBE_COLORS.slice(0, 3).map(c => <span key={c}><MageAvatar color={c} size={22}/></span>)}</div><div><strong><span className={`live-dot ${world ? '' : 'offline'}`}/>{world ? 'La tour est ouverte' : 'La tour se prépare'}</strong><span>{world ? `${world.online} ${world.online === 1 ? 'aventurier en ligne' : 'aventuriers en ligne'} · Le prochain, c’est vous ?` : 'Le monde vous attend au lancement du serveur.'}</span></div></div>
          </div>
          <div className="hero-art-wrap">
            <div className="art-corner top-left"/><div className="art-corner bottom-right"/>
            <div className="hero-art"><Preview reducedMotion={settings.reducedMotion}/><div className="art-top"><span><span className="live-dot"/> UN MONDE PERSISTANT</span><span>∞</span></div><div className="art-altitude"><ArrowUp size={15}/><span>LE CIEL EST UNE ÉTAPE.</span></div><div className="art-bottom"><div><span className="art-biome">BIOME 01</span><strong>Les ruines verdoyantes</strong></div><span className="art-level">↑ ∞</span></div></div>
            <div className="floating-note"><span>✦</span> Le sommet ? Quel sommet ?<svg viewBox="0 0 55 36" aria-hidden="true"><path d="M3 3c37 2 47 9 44 28m-8-7 8 9 5-12" stroke="currentColor" fill="none" strokeWidth="2"/></svg></div>
          </div>
        </section>
        <section className="manifesto-strip" aria-label="Les principes du jeu"><span><InfinityIcon/> Une tour sans fin</span><i/><span><Users/> Un monde pour tous</span><i/><span><Flag/> Chaque camp compte</span><i/><span><Gamepad2/> Clavier ou manette</span></section>
        <section className="universe-section" id="univers"><div className="section-heading"><div><span className="eyebrow">LE VOYAGE COMPTE AUTANT QUE LA HAUTEUR</span><h2>Seul, c’est bien.<br/>Ensemble, c’est toute une histoire.</h2></div><p>Pas de manche. Pas de compte à rebours.<br/>Juste vous, quelques mages et cette envie<br/>de voir ce qu’il y a un peu plus haut.</p></div><div className="feature-grid">
          <article className="feature-card"><span className="feature-number">01</span><div className="feature-art steps-art"><i/><i/><i/><MageAvatar color="#789956" mask="fox" hat="beret" size={34}/><ArrowUpRight size={26}/></div><h3>Un saut à la fois.</h3><p>Des murs à escalader, des tremplins et des détours. Maintenez le saut pour monter plus haut.</p><span className="feature-tag">LE BON SAUT AU BON MOMENT</span></article>
          <article className="feature-card"><span className="feature-number">02</span><div className="feature-art friends-art"><MageAvatar color="#a48cbe" mask="cat-face" hat="bare-head" size={36}/><MageAvatar color={BOT_COLOR} hat="witch" size={43}/><MageAvatar color="#d5a163" mask="moustache" hat="beret" size={32}/><span>♡</span></div><h3>Un coup de main. Ou de coude.</h3><p>Franchissez les brèches à deux. Les bots noirs continuent de monter, vous aident… et vous poussent parfois.</p><span className="feature-tag">JUSQU’À 3 BOTS COMPAGNONS</span></article>
          <article className="feature-card"><span className="feature-number">03</span><div className="feature-art camp-art"><Flag size={45} strokeWidth={1.5}/><span className="camp-spark">✦</span><i/><i/></div><h3>Tomber fait partie du voyage.</h3><p>Un camp tous les 100 m. Les pics vous y renvoient ; votre record et vos trouvailles restent acquis.</p><span className="feature-tag">VOTRE PROGRESSION RESTE</span></article>
        </div></section>
        <TowerFeatures reducedMotion={settings.reducedMotion} onCustomize={() => open(profile && !profile.isGuest ? 'profile' : 'register')} onSettings={() => open('settings')}/>
        <section className="how-section" id="comment-jouer"><div><span className="eyebrow">LE GRAND DÉPART</span><h2>Vous savez déjà jouer.</h2><p>Quelques touches. Une infinité de possibilités.</p><button className="text-button" onClick={() => open('settings')}>Personnaliser mes commandes <ArrowUpRight size={15}/></button></div><div className="how-keys"><div><span><kbd>A</kbd><kbd>D</kbd><small>ou ← →</small></span><strong>Se déplacer</strong></div><div><span><kbd className="space-key">ESPACE</kbd></span><strong>Sauter</strong><small>Maintenez pour sauter plus haut</small></div><div><span><kbd>E</kbd></span><strong>Pousser</strong><small>Avec modération. Ou presque.</small></div></div></section>
        <section className="closing-cta"><span>↑</span><div><h2>On se retrouve là-haut ?</h2><p>Votre prochaine petite aventure commence par un saut.</p></div><button className="button primary" disabled={busy} onClick={() => void enterGame()}>C’est parti <ArrowUpRight size={21}/></button></section>
      </main>
      <footer className="site-footer"><a className="brand" href="#"><TowerMark/><span>TOWER<span className="brand-x">X</span></span></a><p>Un petit jeu. Une grande tour. Fait pour être partagé.</p><div><span>EN CONSTRUCTION, COMME VOTRE LÉGENDE.</span><button className="icon-button" aria-label={settings.sound ? 'Couper le son' : 'Activer le son'} onClick={() => setSettings(s => ({ ...s, sound: s.sound ? 0 : 45 }))}>{settings.sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button></div></footer>
    </div> : <Game key={gameKey} settings={settings} onProfile={setProfile} onExit={() => { setView('landing'); refreshWorld(); void api<{ profile: PublicProfile }>('/auth/me').then(data => setProfile(data.profile)); }} onSettings={() => open('settings')} onAccount={() => open('profile')} entry={entry} onEntryRejected={rejectEntry} paused={modal !== null}/>}
    {modal && <Modal key={modal} title={{ login: 'Content de vous revoir.', register: 'Votre histoire commence ici.', settings: 'À votre façon.', leaderboard: 'Toujours un peu plus haut.', profile: 'Votre petit mage.', start: 'Choisissez votre départ.' }[modal]} onClose={closeModal} wide={modal === 'start' || modal === 'leaderboard' || modal === 'profile' || modal === 'register'} className={modal === 'profile' || modal === 'register' ? 'modal-wardrobe' : undefined}>
      {(modal === 'login' || modal === 'register') && <><p className="modal-description">{modal === 'register' ? 'Gardez votre progression et retrouvez votre mage sur tous vos appareils.' : 'Retrouvez votre dernier camp et reprenez l’ascension.'}</p><form className="auth-form" onSubmit={event => void submitAuth(event)}>{modal === 'register' && <label>Nom d’aventurier<input name="displayName" autoComplete="nickname" placeholder="Ex. Brindille" defaultValue={profile?.displayName} minLength={2} maxLength={18} required/></label>}<label>Adresse email<input name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" required maxLength={254}/></label><label>Mot de passe<input name="password" type="password" autoComplete={modal === 'register' ? 'new-password' : 'current-password'} placeholder="10 caractères minimum" minLength={10} maxLength={128} required/></label>{modal === 'register' && <Wardrobe value={costume} onChange={setCostume} unlocked={profile?.unlockedCosmetics}/>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Un instant…' : modal === 'register' ? 'Créer mon compte et jouer' : 'Reprendre l’ascension'}<ArrowUpRight size={19}/></button></form><p className="auth-switch">{modal === 'login' ? 'Pas encore de compte ?' : 'Déjà aventurier ?'} <button onClick={() => open(modal === 'login' ? 'register' : 'login')}>{modal === 'login' ? 'Créer un compte' : 'Se connecter'}</button></p><div className="auth-divider"><span>ou, tout simplement</span></div><button className="button outline" disabled={busy} onClick={() => void enterGame()}>Jouer en invité <ArrowRight size={16}/></button></>}
      {modal === 'start' && profile && <StartChoice profile={profile} message={error} onStart={startGame}/>}
      {modal === 'settings' && <>{error && <p className="form-error" role="alert">{error}</p>}<SettingsPanel settings={settings} onChange={setSettings}/></>}
      {modal === 'leaderboard' && <><p className="modal-description">Les records de cette tour. Chaque mètre a son histoire.</p>{error ? <p className="form-error">{error}</p> : leaders === null ? <div className="empty-state"><div className="spinner"/> À la recherche des sommets…</div> : leaders.length === 0 ? <div className="empty-state"><Trophy size={38}/><h3>La légende reste à écrire.</h3><p>Soyez le premier à laisser votre marque dans la tour.</p><button className="button primary" onClick={() => void enterGame()}>Faire le premier saut <ArrowUpRight size={18}/></button></div> : <div className="leaderboard"><div className="leader-head"><span>RANG / AVENTURIER</span><span>RECORD</span></div>{leaders.map((leader, index) => <div className="leader-row" key={leader.id}><span className="rank">{String(index + 1).padStart(2, '0')}</span><MageAvatar {...leader} size={27}/><strong>{leader.displayName}{leader.id === profile?.id && <small>VOUS</small>}</strong><span>{leader.personalBest} <small>m</small></span></div>)}</div>}</>}
      {modal === 'profile' && profile && <form className="profile-form" onSubmit={event => void saveProfile(event)}><Wardrobe value={costume} onChange={value => { setCostume(value); setSaved(false); }} unlocked={profile.unlockedCosmetics} guest={profile.isGuest}/><label>Nom d’aventurier<input value={displayName} onChange={event => { setDisplayName(event.target.value); setSaved(false); }} minLength={2} maxLength={18} required/></label><p className="cosmetic-note"><Sparkles size={13}/> Du style, les mêmes capacités pour tous.</p><div className="profile-stats"><span><Trophy size={16}/> Record <b>{profile.personalBest} m</b></span><span><Flag size={16}/> Camp <b>{profile.lastCamp * 20} m</b></span></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{saved ? <><Check size={17}/> Profil enregistré</> : 'Enregistrer'}</button>{profile.isGuest && <button type="button" className="button outline" onClick={() => open('register')}><Mail size={16}/> Conserver ma progression avec un compte</button>}{profile.isGuest && <button type="button" className="text-button" onClick={() => open('login')}>J’ai déjà un compte</button>}<button type="button" className="text-button" onClick={() => void enterGame()}><Users size={15}/> Choisir mon départ</button><button type="button" className="text-button muted" onClick={() => void logout()}><LogOut size={14}/> Se déconnecter</button></form>}
    </Modal>}
  </>;
}
