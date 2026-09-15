import { useEffect, useState } from 'react';
import { Gamepad2, Keyboard, Volume2, Eye, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS, type Settings as SettingsValue } from '../game/input';

export const keyName = (code: string) => ({ Space: 'Espace', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'Shift' })[code] ?? code.replace('Key', '').replace('Digit', '');
export function SettingsPanel({ settings, onChange }: { settings: SettingsValue; onChange: (value: SettingsValue) => void }) {
  const [mapping, setMapping] = useState<keyof SettingsValue['bindings'] | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!mapping) return;
    const handler = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.code === 'Escape') { setMapping(null); return; }
      if (['Tab', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight'].includes(event.code)) { setMessage('Choisissez une autre touche.'); return; }
      if (Object.entries(settings.bindings).some(([action, code]) => action !== mapping && code === event.code)) { setMessage('Cette touche est déjà utilisée.'); return; }
      onChange({ ...settings, bindings: { ...settings.bindings, [mapping]: event.code } }); setMapping(null); setMessage('');
    };
    const cancel = (event: Event) => { event.preventDefault(); setMapping(null); setMessage(''); };
    window.addEventListener('gamepadback', cancel);
    window.addEventListener('keydown', handler, true);
    return () => { window.removeEventListener('keydown', handler, true); window.removeEventListener('gamepadback', cancel); };
  }, [mapping, settings, onChange]);
  return <div className="settings-panel">
    <div className="section-label"><Volume2 size={15}/> AMBIANCE SONORE</div>
    <label className="slider-row"><span>Effets sonores<small>{settings.sound} %</small></span><input aria-label="Volume des effets" type="range" min="0" max="100" step="1" value={settings.sound} onChange={e => onChange({ ...settings, sound: Number(e.target.value) })}/></label>
    <div className="section-label"><Eye size={15}/> CONFORT VISUEL</div>
    <label className="toggle-row"><span>Réduire les animations<small>Décor fixe et effets discrets.</small></span><input type="checkbox" checked={settings.reducedMotion} onChange={e => onChange({ ...settings, reducedMotion: e.target.checked })}/></label>
    <label className="toggle-row"><span>Écran bombé<small>Une légère courbure, comme sur une ancienne télévision.</small></span><input type="checkbox" checked={settings.curvedScreen} onChange={e => onChange({ ...settings, curvedScreen: e.target.checked })}/></label>
    <label className="toggle-row"><span>Filtre écran rétro<small>Les scanlines des bonnes vieilles consoles.</small></span><input type="checkbox" checked={settings.crt} onChange={e => onChange({ ...settings, crt: e.target.checked })}/></label>
    <div className="section-label"><Keyboard size={15}/> CLAVIER</div>
    <div className="remap-grid">{(Object.keys(settings.bindings) as (keyof SettingsValue['bindings'])[]).map(key => <button key={key} className={`remap ${mapping === key ? 'listening' : ''}`} onClick={() => { setMapping(key); setMessage('Appuyez sur une touche · Échap pour annuler'); }}><span>{{ left: 'Gauche', right: 'Droite', jump: 'Sauter', push: 'Pousser' }[key]}</span><kbd>{mapping === key ? '…' : keyName(settings.bindings[key])}</kbd></button>)}</div>
    {message && <p className="form-hint" role="status">{message}</p>}
    <p className="gamepad-help"><Gamepad2 size={20}/><span>Dans les menus : stick ou croix pour naviguer, gauche / droite pour régler le volume, Sud pour valider, Est ou Start pour revenir. En jeu : Sud pour sauter, Est / Ouest pour pousser, Start pour le menu.</span></p>
    <button className="text-button" onClick={() => { onChange(structuredClone(DEFAULT_SETTINGS)); setMapping(null); }}><RotateCcw size={14}/> Réinitialiser les réglages</button>
  </div>;
}
