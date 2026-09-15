import { useState, type KeyboardEvent } from 'react';
import { ArrowLeftRight, ArrowUp, ArrowUpRight, ChevronRight, Feather, Footprints, Gem, Monitor, Shield, TriangleAlert } from 'lucide-react';
import { DIFFICULTY_LEVELS, METERS_PER_CHUNK, BIOMES, COMMON_SHOES, COMMON_HATS, COMMON_MASKS, POWER_UPS, RARE_COSMETICS, ROBE_COLORS } from '@tower/shared';
import { MageAvatar, MechanismPreview } from './Preview';
import type { PreviewMechanism } from '../game/art';
import './tower-features.css';

const OBSTACLES = [
  { id: 'moving', name: 'Navettes bleues', height: 'Dès 20 m', title: 'Le sol prend la tangente.', description: 'Laissez-vous porter par les plateformes mobiles, puis sautez au bon moment pour rejoindre le prochain palier.', Icon: ArrowLeftRight },
  { id: 'crumble', name: 'Dalles friables', height: 'Dès 40 m', title: 'Ne traînez pas trop.', description: 'La dalle craque pendant 1,2 seconde, puis cède sous vos pieds. Elle revient 5 secondes plus tard : préparez votre prochain saut.', Icon: Footprints },
  { id: 'spikes', name: 'Corniches à pics', height: 'Dès le tronçon de 40\u00a0m', title: 'Regardez où vous atterrissez.', description: 'Les corniches piégées vous renvoient au dernier camp. Repérez les pointes, choisissez un passage sûr. Votre record et vos cosmétiques restent acquis.', Icon: TriangleAlert },
  { id: 'spring', name: 'Tremplins roses', height: 'Dès 80 m', title: 'Un détour qui fait décoller.', description: 'Atterrissez sur un tremplin pour un grand rebond. Ces raccourcis facultatifs vous propulsent plus haut sans consommer vos bottes chargées.', Icon: ArrowUp },
] as const satisfies readonly { id: PreviewMechanism; name: string; height: string; title: string; description: string; Icon: typeof ArrowUp }[];

const BONUSES = [
  { kind: 'feather', Icon: Feather, detail: '12 secondes de gravité réduite et des sauts plus hauts.' },
  { kind: 'boots', Icon: Footprints, detail: 'Un super-saut à utiliser au prochain bond.' },
  { kind: 'bubble', Icon: Shield, detail: 'Absorbe une poussée. Attention, les pics passent à travers !' },
] as const;

export function TowerFeatures({ reducedMotion, onCustomize, onSettings }: { reducedMotion: boolean; onCustomize: () => void; onSettings: () => void }) {
  const [selected, setSelected] = useState(0), [biomeIndex, setBiomeIndex] = useState(0);
  const obstacle = OBSTACLES[selected]!, biome = BIOMES[biomeIndex]!;
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? OBSTACLES.length - 1 : event.key === 'ArrowDown' ? (index + 1) % OBSTACLES.length : event.key === 'ArrowUp' ? (index + OBSTACLES.length - 1) % OBSTACLES.length : null;
    if (next === null) return;
    event.preventDefault(); setSelected(next);
    document.getElementById(`obstacle-tab-${OBSTACLES[next]!.id}`)?.focus();
  };
  return <>
    <section className="tower-discovery" id="nouveautes" aria-labelledby="discovery-title">
      <div className="discovery-heading"><div><span className="eyebrow">À DÉCOUVRIR DANS LA TOUR</span><h2 id="discovery-title">Chaque étage a<br/>son petit piège.</h2></div><p>Des plateformes qui bougent, des détours qui piquent.<br/>Et quelques bonus pour vous tirer d’affaire.</p></div>
      <div className="obstacle-showcase">
        <div className="obstacle-tabs" role="tablist" aria-label="Les obstacles de la tour" aria-orientation="vertical">
          {OBSTACLES.map((item, index) => <button key={item.id} type="button" role="tab" id={`obstacle-tab-${item.id}`} aria-selected={selected === index} aria-controls="obstacle-preview" tabIndex={selected === index ? 0 : -1} data-obstacle={item.id} onClick={() => setSelected(index)} onKeyDown={event => navigate(event, index)}><item.Icon size={23}/><span><strong>{item.name}</strong><small>{item.height}</small></span><ChevronRight size={17}/></button>)}
        </div>
        <div className="obstacle-panel" role="tabpanel" id="obstacle-preview" aria-labelledby={`obstacle-tab-${obstacle.id}`} tabIndex={0}>
          <div className="discovery-screen"><MechanismPreview kind={obstacle.id} biome={biome.id} reducedMotion={reducedMotion}/><span className="discovery-screen-label">{biome.name}</span><span className={`discovery-screen-badge ${obstacle.id}`}>{obstacle.id === 'spikes' ? '⚠ Pics !' : obstacle.height}</span></div>
          <div className="obstacle-caption"><h3>{obstacle.title}</h3><p>{obstacle.description}</p></div>
        </div>
      </div>
      <div className="biome-picker"><div><strong>Cinq décors à traverser.</strong><span>Une nouvelle ambiance tous les 100 m. Découvrez-les :</span></div><div className="biome-options" role="group" aria-label="Choisir un décor pour l’aperçu">{BIOMES.map((item, index) => <button key={item.id} type="button" aria-label={item.name} aria-pressed={biomeIndex === index} data-biome={item.id} onClick={() => setBiomeIndex(index)}><span aria-hidden="true">{item.icon}</span>{item.shortName}</button>)}</div></div>
      <div className="difficulty-story"><h3>Plus haut, plus corsé.</h3><p>Des appuis larges pour débuter, puis des sauts plus précis, des navettes plus rapides et des dalles fragiles à enchaîner. Chaque camp reste un endroit où souffler.</p><ol>{DIFFICULTY_LEVELS.map(level => <li key={level.level}><span>Dès {level.fromChunk * METERS_PER_CHUNK} m</span><strong>{level.name}</strong></li>)}</ol></div>
      <div className="discovery-bonuses"><h3>Un petit coup de pouce.</h3><div className="landing-bonus-grid">{BONUSES.map(({ kind, Icon, detail }) => <article key={kind}><Icon size={25}/><div><h4>{POWER_UPS[kind].name}</h4><p>{detail}</p></div></article>)}</div></div>
      <div className="discovery-retro"><Monitor size={20}/><p>Écran rétro et léger fish-eye par défaut. <strong>Des noms et des indications bien nets.</strong></p><button className="text-button" onClick={onSettings}>Régler l’affichage <ArrowUpRight size={15}/></button></div>
    </section>
    <section className="landing-wardrobe" aria-labelledby="wardrobe-title">
      <div className="wardrobe-story"><span className="eyebrow">VOTRE STYLE, DE LA TÊTE AUX PIEDS.</span><h2 id="wardrobe-title">On vous reconnaîtra<br/>de loin.</h2><p>Lunettes, robot, slime ou visage découvert : trouvez votre allure et associez-la à une coiffure ou un chapeau. En invité, votre mage reçoit une tenue aléatoire. Avec un compte, composez votre style avec 12 modèles de chaussures classiques et 48 couleurs pour la tenue, la coiffe et les chaussures, séparément. Votre look est sauvegardé et reste modifiable à tout moment.</p><div className="wardrobe-counts"><span><b>{ROBE_COLORS.length}</b> couleurs</span><span><b>{COMMON_MASKS.length + COMMON_HATS.length + COMMON_SHOES.length}</b> accessoires classiques</span><span><b>{RARE_COSMETICS.length}</b> pièces rares</span></div><button className="button outline" onClick={onCustomize}>Composer ma tenue <ArrowUpRight size={18}/></button></div>
      <div className="landing-rare-showcase"><div className="rare-mage-lineup"><div><MageAvatar color="#bc9bea" mask="round-glasses" hat="curls" hatColor="#eb76a9" shoes="sneakers" shoeColor="#55a3e6" size={79}/><span>À votre façon</span></div><div className="rare-mage-star"><MageAvatar color="#c6ed80" mask="verdant" hat="antlers" size={122}/><span><Gem size={12}/> RARE</span></div><div><MageAvatar color="#eab077" mask="robot" hat="headphones" hatColor="#55a3e6" shoes="flippers" shoeColor="#92c958" size={79}/><span>À votre façon</span></div></div><h3>Les plus belles pièces se méritent.</h3><p>Des coffres peu fréquents, cachés sur les chemins de la tour. Trouvez des ornements aux grandes silhouettes et aux auras lumineuses. Visages, masques, coiffes, chaussures : {RARE_COSMETICS.length} pièces rares restent floutées dans la garde-robe jusqu’à leur découverte. Chaque coffre tire au hasard dans toute la collection : les doublons sont possibles. Votre collection reste avec vous.</p><span className="rare-showcase-note">Des cosmétiques à trouver en jouant, les mêmes capacités pour tous.</span></div>
    </section>
  </>;
}
