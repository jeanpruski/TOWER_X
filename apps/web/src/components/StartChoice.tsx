import { useEffect, useState } from 'react';
import { ArrowRight, Check, Flag, Users } from 'lucide-react';
import { METERS_PER_CHUNK, type EntryChoice, type JoinablePlayer, type PublicProfile } from '@tower/shared';
import { api } from '../api';
import { MageAvatar } from './Preview';
import './start-choice.css';

export function StartChoice({ profile, message, onStart }: { profile: PublicProfile; message: string; onStart: (entry: EntryChoice) => void }) {
  const [players, setPlayers] = useState<JoinablePlayer[]>([]);
  const [selected, setSelected] = useState<EntryChoice>({ mode: 'saved' });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const data = await api<{ players: JoinablePlayer[] }>('/world/players');
        if (active) { setPlayers(data.players); setError(''); }
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) { setLoading(false); timer = setTimeout(() => void refresh(), 2500); } }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  const target = selected.mode === 'player' ? players.find(p => p.id === selected.playerId) : undefined;
  const missing = selected.mode === 'player' && !target;
  return <form className="start-choice" onSubmit={event => { event.preventDefault(); if (!loading && !missing) onStart(selected); }}>
    <p className="modal-description">Choisissez où commencer, puis lancez la partie quand vous êtes prêt.</p>
    {message && <p className="form-error" role="alert">{message}</p>}
    <div role="group" aria-label="Votre destination">
      <button type="button" className="start-destination" aria-pressed={selected.mode === 'saved'} data-initial-focus onClick={() => setSelected({ mode: 'saved' })}>
        <Flag size={23}/><span><strong>{profile.lastCamp > 0 ? 'Reprendre à mon camp' : 'Commencer au pied de la tour'}</strong><small>{profile.lastCamp * METERS_PER_CHUNK} m · Votre point de départ habituel</small></span>{selected.mode === 'saved' && <Check size={19}/>}
      </button>
      <div className="start-players-heading"><h3><Users size={17}/> Rejoindre un joueur</h3><span>{players.length} en ligne</span></div>
      <p className="start-hint">Arrivez sur une plateforme près du joueur choisi. La liste et les hauteurs s’actualisent automatiquement.</p>
      {loading ? <p className="start-empty" role="status">Recherche des joueurs connectés…</p> : !players.length && !error ? <p className="start-empty">Aucun autre joueur connecté pour le moment. Vous pouvez commencer votre ascension.</p> : null}
      {error && <p className="form-error" role="status">Liste indisponible : {error} Vous pouvez partir de votre camp.</p>}
      <div className="start-players">
        {players.map(player => <button type="button" key={player.id} data-entry-player-id={player.id} className="start-destination" aria-pressed={selected.mode === 'player' && selected.playerId === player.id} onClick={() => setSelected({ mode: 'player', playerId: player.id })}>
          <MageAvatar {...player} size={36}/><span><strong>{player.displayName}</strong><small>Joueur connecté</small></span><b>{player.height} m</b>{target?.id === player.id && <Check size={18}/>}
        </button>)}
      </div>
    </div>
    {missing && <p className="form-error" role="alert">Le joueur sélectionné est parti. Choisissez un autre joueur ou votre camp.</p>}
    <p className="start-summary" aria-live="polite">{missing ? 'Une nouvelle destination est nécessaire.' : target ? `Destination : près de ${target.displayName}.` : `Destination : ${profile.lastCamp > 0 ? 'votre camp' : 'le pied de la tour'}, à ${profile.lastCamp * METERS_PER_CHUNK} m.`}</p>
    <button type="submit" className="button primary" disabled={loading || missing}>Commencer la partie <ArrowRight size={19}/></button>
  </form>;
}
