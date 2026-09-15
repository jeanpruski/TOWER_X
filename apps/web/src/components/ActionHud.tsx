import { useEffect, useState } from 'react';
import { Feather, Footprints, Hand, Shield, X } from 'lucide-react';
import { POWER_UPS, type NetworkPlayer, type PowerUpKind } from '@tower/shared';
import { inSafeCamp, PHYSICS } from '@tower/game-core';
import type { Settings } from '../game/input';
import { keyName } from './Settings';
import './action-hud.css';

export function ActionHud({ player, settings, feedback, connected, gamepad }: { player: NetworkPlayer | null; settings: Settings; feedback: string; connected: boolean; gamepad: boolean }) {
  const [detail, setDetail] = useState<PowerUpKind | null>(null);
  useEffect(() => { if (!detail) return; const timer = setTimeout(() => setDetail(null), 7000); return () => clearTimeout(timer); }, [detail]);
  const safe = !player || inSafeCamp(player) || player.protection > 0;
  const cooldown = player?.pushCooldown ?? 0;
  const pushLabel = !connected ? 'Connexion…' : safe ? 'Zone protégée' : (player?.stun ?? 0) > 0 ? 'Sonné' : cooldown > 0 ? `Recharge ${cooldown.toFixed(1)} s` : 'Poussée prête';
  const unavailable = safe || !connected || (player?.stun ?? 0) > 0;
  const progress = unavailable ? 0 : Math.max(0, Math.min(100, (1 - cooldown / PHYSICS.pushCooldown) * 100));
  const bonuses = [
    { kind: 'feather' as const, short: 'Plume', Icon: Feather, active: (player?.feather ?? 0) > 0, status: `${Math.ceil(player?.feather ?? 0)} s` },
    { kind: 'boots' as const, short: 'Bottes', Icon: Footprints, active: Boolean(player?.boots), status: '1 saut' },
    { kind: 'bubble' as const, short: 'Bulle', Icon: Shield, active: Boolean(player?.bubble), status: '1 choc' },
  ];
  return <div className="action-hud" role="group" aria-label="Poussée et bonus">
    <div className={`push-status ${!unavailable && cooldown <= 0 ? 'ready' : ''}`} title="Placez-vous face à un mage proche, hors du camp, puis poussez.">
      <Hand size={19}/><div><span className="push-key">{gamepad ? 'Est / Ouest' : keyName(settings.bindings.push)} · POUSSER</span><strong>{pushLabel}</strong>
        <div className="push-meter" role="progressbar" aria-label="Disponibilité de la poussée" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }}/></div>
      </div>
    </div>
    <div className="bonus-slots">{bonuses.map(({ kind, short, Icon, active, status }) => <button type="button" className={`bonus-slot ${active && connected ? 'active' : ''}`} key={kind} data-bonus={kind} data-active={active && connected} style={{ '--bonus-color': POWER_UPS[kind].color } as React.CSSProperties}
      aria-label={`${POWER_UPS[kind].name} : ${active && connected ? status : 'non équipé'}. ${POWER_UPS[kind].description}`} aria-expanded={detail === kind} onPointerDown={event => event.preventDefault()} onClick={() => setDetail(current => current === kind ? null : kind)}>
      <Icon size={19}/><span><strong>{short}</strong><small>{active && connected ? status : '—'}</small></span>
    </button>)}</div>
    {detail && <div className="hud-bonus-detail hud-obstacle" role="status"><div><strong>{POWER_UPS[detail].name}</strong><span>{POWER_UPS[detail].description}. Ramassez le bonus dans la tour.</span></div><button aria-label="Fermer l’information du bonus" onPointerDown={event => event.preventDefault()} onClick={() => setDetail(null)}><X size={16}/></button></div>}
    <p className={`action-feedback ${feedback ? 'visible hud-obstacle' : ''}`} role="status" aria-live="polite">{feedback}</p>
  </div>;
}
