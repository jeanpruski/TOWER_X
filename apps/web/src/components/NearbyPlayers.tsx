import { ArrowDown, ArrowUp, Users } from 'lucide-react';
import { equippedRares, type NearbyStandings, type Standing } from '@tower/shared';
import { MageAvatar } from './Preview';
import './nearby-players.css';

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const gap = (delta: number) => delta === 0 ? '0 m' : `${delta > 0 ? '+' : '−'}${number.format(Math.abs(delta))} m`;

function PlayerRow({ player, relation }: { player: Standing; relation: 'above' | 'self' | 'below' }) {
  const self = relation === 'self';
  const rares = equippedRares(player.mask, player.hat, player.shoes);
  return <li className={`nearby-player ${self ? 'is-self' : ''}`} data-relation={relation} data-player-id={player.id}
    aria-label={`${self ? 'Vous, ' : ''}${player.displayName}${player.isBot ? ', bot' : ''}${rares.length ? `, rare : ${rares.map(r => r.name).join(', ')}` : ''}, rang ${player.rank}, ${player.height} mètres, écart ${gap(player.delta)}`}>
    <span className="nearby-rank">{player.rank}</span>
    <MageAvatar {...player} size={20}/>
    <span className="nearby-name" title={player.displayName}>{rares.length > 0 && <small className="rare-badge" title={rares.map(r => r.name).join(' · ')}>◆ RARE</small>}{self ? 'Vous' : player.displayName}{player.isBot && <small className="bot-badge">BOT</small>}</span>
    <span className="nearby-height">{number.format(player.height)}<small> m</small></span>
    <span className={`nearby-gap ${player.delta > 0 ? 'positive' : player.delta < 0 ? 'negative' : ''}`}>{self ? '—' : gap(player.delta)}</span>
  </li>;
}

export function NearbyPlayers({ standings, online, botCount = 0, connected }: { standings: NearbyStandings | null; online: number; botCount?: number; connected: boolean }) {
  return <section className="nearby-panel" aria-labelledby="nearby-title">
    <div className="nearby-online" role="status" aria-live="polite"><Users size={14}/><strong>{connected ? `${online} ${online > 1 ? 'MAGES EN LIGNE' : 'MAGE EN LIGNE'}` : 'RECONNEXION EN COURS'}</strong><span className={`live-dot ${connected ? '' : 'offline'}`}/></div>
    {botCount > 0 && <div className="nearby-bots">+ {botCount} {botCount > 1 ? 'BOTS COMPAGNONS' : 'BOT COMPAGNON'}</div>}
    <div className="nearby-heading"><h2 id="nearby-title">Autour de vous</h2><span>{standings ? `#${standings.self.rank} / ${online + botCount}` : '—'}</span></div>
    <div className="nearby-columns" aria-hidden="true"><span>MAGE</span><span>HAUTEUR</span><span>ÉCART</span></div>
    {standings ? <>
      <div className="nearby-group"><ArrowUp size={10}/><span>DEVANT VOUS</span><small>{standings.above.length} / 5</small></div>
      {standings.above.length ? <ol className="nearby-list" aria-label="Joueurs devant vous">{standings.above.map(player => <PlayerRow key={player.id} player={player} relation="above"/>)}</ol> : <p className="nearby-empty">Personne devant vous.</p>}
      <ol className="nearby-list nearby-self" aria-label="Votre position"><PlayerRow player={standings.self} relation="self"/></ol>
      <div className="nearby-group"><ArrowDown size={10}/><span>DERRIÈRE VOUS</span><small>{standings.below.length} / 5</small></div>
      {standings.below.length ? <ol className="nearby-list" aria-label="Joueurs derrière vous">{standings.below.map(player => <PlayerRow key={player.id} player={player} relation="below"/>)}</ol> : <p className="nearby-empty">Personne derrière vous.</p>}
    </> : <p className="nearby-empty">{connected ? 'Recherche des aventuriers…' : 'Les altitudes reviendront à la reconnexion.'}</p>}
    <p className="nearby-caption">Écart vertical par rapport à vous · en direct</p>
  </section>;
}
