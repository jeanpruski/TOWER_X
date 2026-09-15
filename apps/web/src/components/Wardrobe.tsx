import { useState } from 'react';
import { Check, LockKeyhole, Sparkles } from 'lucide-react';
import { ROBE_COLORS, DEFAULT_COSTUME_DETAILS, DEFAULT_SHOE_COLOR, COMMON_SHOES, SHOE_IDS, SHOE_NAMES, COMMON_FACE_STYLES, FACE_STYLES, COMMON_PLAGUE_MASKS, COMMON_HATS, MASK_IDS, HAT_IDS, MASK_NAMES, HAT_NAMES, RARE_COSMETICS, equippedRares, canEquip, isFaceStyle, isHeadStyle, type CostumeDetails, type ShoeId, type MaskId, type HatId, type CosmeticId } from '@tower/shared';
import { MageAvatar } from './Preview';
import './wardrobe.css';

export interface Costume extends CostumeDetails { color: string; mask: MaskId; hat: HatId; }
export const DEFAULT_COSTUME: Costume = { ...DEFAULT_COSTUME_DETAILS, color: ROBE_COLORS[0], mask: 'ivory', hat: 'top-hat' };
const CATEGORIES = [
  { id: 'face', name: 'Visages', count: COMMON_FACE_STYLES.length, rares: FACE_STYLES.length - COMMON_FACE_STYLES.length },
  { id: 'mask', name: 'Masques', count: COMMON_PLAGUE_MASKS.length, rares: MASK_IDS.length - COMMON_PLAGUE_MASKS.length - FACE_STYLES.length },
  { id: 'hat', name: 'Coiffes', count: COMMON_HATS.length, rares: HAT_IDS.length - COMMON_HATS.length },
  { id: 'shoes', name: 'Chaussures', count: COMMON_SHOES.length, rares: SHOE_IDS.length - COMMON_SHOES.length },
] as const;
type Category = typeof CATEGORIES[number]['id'];
export function Wardrobe({ value, onChange, unlocked = [], guest = false }: { value: Costume; onChange: (value: Costume) => void; unlocked?: CosmeticId[]; guest?: boolean }) {
  const [category, setCategory] = useState<Category>('face');
  const [filter, setFilter] = useState<'all' | 'common' | 'rare'>('all');
  const [search, setSearch] = useState('');
  const [colorTarget, setColorTarget] = useState<'color' | 'hatColor' | 'shoeColor'>('color');
  const slot = category === 'shoes' ? 'shoes' : category === 'hat' ? 'hat' : 'mask';
  const rareHat = RARE_COSMETICS.some(r => r.slot === 'hat' && r.item === value.hat);
  const fixedHat = colorTarget === 'hatColor' && (rareHat || value.hat === 'bare-head');
  const fixedShoes = colorTarget === 'shoeColor' && RARE_COSMETICS.some(r => r.slot === 'shoes' && r.item === value.shoes);
  const colorLabel = colorTarget === 'color' ? 'Robe' : colorTarget === 'hatColor' ? 'Coiffe' : 'Chaussures';
  const items = category === 'face' ? FACE_STYLES : category === 'mask' ? MASK_IDS.filter(item => !isFaceStyle(item)) : category === 'shoes' ? SHOE_IDS : HAT_IDS;
  const changeCategory = (next: Category) => { setCategory(next); setFilter('all'); setSearch(''); };
  const selectedRares = equippedRares(value.mask, value.hat, value.shoes);
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const visible = items.filter(item => {
    const rare = RARE_COSMETICS.some(c => c.slot === slot && c.item === item);
    const name = slot === 'shoes' ? SHOE_NAMES[item as ShoeId] : slot === 'mask' ? MASK_NAMES[item as MaskId] : HAT_NAMES[item as HatId];
    return (filter === 'all' || (filter === 'rare' ? rare : !rare)) && normalize(name).includes(normalize(search));
  });
  return <section className="wardrobe" aria-label="Garde-robe">
    <div className={`wardrobe-preview ${selectedRares.length ? 'wearing-rare' : ''}`}><MageAvatar {...value} size={96}/><div><span className="wardrobe-eyebrow">{guest ? 'VOTRE TIRAGE INVITÉ' : selectedRares.length ? '◆ APPARENCE RARE' : 'VOTRE PERSONNAGE'}</span><strong>{MASK_NAMES[value.mask]}</strong><span>{HAT_NAMES[value.hat]} · {SHOE_NAMES[value.shoes]}</span><small><Sparkles size={12}/> {unlocked.length} / {RARE_COSMETICS.length} pièces rares découvertes</small></div></div>
    {selectedRares.length > 0 && <p className="wardrobe-signature">{selectedRares.map(r => r.signature).join(' · ')}. Le signe ◆ RARE vous identifie aussi auprès des autres joueurs.</p>}
    {guest && <p className="wardrobe-note">Votre tenue a été tirée au sort. Créez un compte pour la personnaliser et retrouver vos trouvailles sur tous vos appareils.</p>}
    <div className="wardrobe-color-target" role="group" aria-label="Élément à colorer">{([['color', 'Tenue'], ['hatColor', 'Coiffe'], ['shoeColor', 'Chaussures']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={colorTarget === id} onClick={() => setColorTarget(id)}><i style={{ background: value[id] ?? value.color }}/>{label}</button>)}</div>
    <fieldset className="wardrobe-colors" disabled={guest || fixedHat || fixedShoes}><legend>{colorTarget === 'color' ? 'Couleur de la tenue' : colorTarget === 'hatColor' ? 'Couleur de la coiffe' : 'Couleur des chaussures'} · {ROBE_COLORS.length} nuances</legend>
      <div className="color-options">{ROBE_COLORS.map(color => <button type="button" key={color} style={{ background: color }} className={value[colorTarget] === color ? 'selected' : ''} aria-label={`${colorLabel} ${color}`} aria-pressed={value[colorTarget] === color} onClick={() => onChange({ ...value, [colorTarget]: color })}>{value[colorTarget] === color && <Check size={15}/>}</button>)}</div>
      {colorTarget !== 'color' && <div className="wardrobe-color-defaults">{colorTarget === 'hatColor' && <button type="button" aria-pressed={value.hatColor === null} onClick={() => onChange({ ...value, hatColor: null })}>Couleurs d’origine / assortie à la tenue</button>}<button type="button" aria-pressed={value[colorTarget] === DEFAULT_SHOE_COLOR} onClick={() => onChange({ ...value, [colorTarget]: DEFAULT_SHOE_COLOR })}><i style={{ background: DEFAULT_SHOE_COLOR }}/>Cuir sombre</button></div>}
    </fieldset>
    {fixedHat && <p className="wardrobe-category-note">{rareHat ? 'Cette coiffe rare conserve ses couleurs et son aura caractéristiques.' : 'Choisissez une coiffe ou une coiffure pour lui donner une couleur.'}</p>}
    {fixedShoes && <p className="wardrobe-category-note">Ces chaussures rares conservent leurs couleurs et leurs effets caractéristiques.</p>}
    <div className="wardrobe-tabs" role="tablist" aria-label="Catégorie de décoration" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = CATEGORIES.findIndex(c => c.id === category);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORIES.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + CATEGORIES.length) % CATEGORIES.length;
      const next = CATEGORIES[nextIndex]!.id; changeCategory(next); document.getElementById(`costume-tab-${next}`)?.focus();
    }}>
      {CATEGORIES.map(c => <button key={c.id} type="button" id={`costume-tab-${c.id}`} role="tab" tabIndex={category === c.id ? 0 : -1} aria-selected={category === c.id} aria-controls="costume-choices" onClick={() => changeCategory(c.id)}>{c.name}<small>{c.count} classiques{c.rares > 0 && ` + ${c.rares} rares`}</small></button>)}
    </div>
    <p className="wardrobe-category-note">{category === 'face' ? 'À visage découvert, en lunettes ou en créature : tous ces styles sont sans bec. Associez-les à une coiffe ou choisissez Tête nue.' : category === 'mask' ? 'Les masques de peste et leurs longs becs emblématiques.' : category === 'shoes' ? 'Baskets, bottes, palmes ou pattes de chat : choisissez la forme, puis la couleur avec le bouton Chaussures au-dessus de la palette. Les rares gardent leurs teintes et leurs effets propres.' : 'Chapeaux, coiffures, oreilles, casque audio… À combiner avec tous les visages et masques.'}</p>
    <div className="wardrobe-tools"><input type="search" aria-label="Chercher une décoration" placeholder="Chercher une décoration…" value={search} onChange={e => setSearch(e.target.value)}/><div role="group" aria-label="Filtrer les décorations">{([['all', 'Tout'], ['common', 'Classiques'], ['rare', '◆ Rares']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
    <div id="costume-choices" role="tabpanel" aria-labelledby={`costume-tab-${category}`} className="wardrobe-grid">
      {visible.map(item => {
        const rare = RARE_COSMETICS.find(c => c.slot === slot && c.item === item);
        const owned = canEquip(slot, item, unlocked), selected = value[slot] === item;
        const name = slot === 'shoes' ? SHOE_NAMES[item as ShoeId] : slot === 'mask' ? MASK_NAMES[item as MaskId] : HAT_NAMES[item as HatId];
        const look: Costume = { ...value, ...(slot === 'shoes' ? { shoes: item as ShoeId } : slot === 'mask' ? { mask: item as MaskId } : { hat: item as HatId }) };
        return <button type="button" key={item} className={`costume-choice ${selected ? 'selected' : ''} ${rare ? 'rare' : ''} ${!owned ? 'locked' : ''}`} disabled={!owned || guest}
          aria-label={`${category === 'shoes' ? 'Chaussures' : category === 'face' ? 'Visage' : slot === 'mask' ? 'Masque' : isHeadStyle(item) ? 'Coiffe' : 'Chapeau'} : ${name}${!owned ? ', verrouillé' : ''}`} aria-pressed={selected} title={rare ? owned ? `${rare.signature}. Pièce rare découverte.` : 'Apparence cachée : à découvrir dans un coffre rare.' : name} onClick={() => onChange(look)}>
          <span className="costume-art"><MageAvatar {...look} size={category === 'shoes' ? 64 : 48} detail={category === 'shoes' ? 'shoes' : 'full'}/>{!owned && <span className="costume-lock" aria-hidden="true"><LockKeyhole size={17}/></span>}</span><strong>{name}</strong>
          {rare ? <small>{owned ? selected ? '◆ RARE ÉQUIPÉ' : '◆ RARE ACQUIS' : <><LockKeyhole size={9}/> RARE À TROUVER</>}</small> : selected ? <small><Check size={10}/> ÉQUIPÉ</small> : <small>CLASSIQUE</small>}
        </button>;
      })}
      {!visible.length && <p className="wardrobe-empty">Aucune décoration trouvée.</p>}
    </div>
    <p className="wardrobe-caption">Les {RARE_COSMETICS.length} pièces rares restent floutées jusqu’à leur découverte. Retrouvez-les dans les coffres espacés de plusieurs centaines de mètres, à partir de 400 m. Le tirage inclut les pièces déjà possédées : un nouvel objet n’est pas garanti. Un coffre s’ouvre une seule fois par personnage. Vos découvertes restent acquises après une chute.</p>
  </section>;
}
