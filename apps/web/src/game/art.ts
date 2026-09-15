import { BOT_COLOR, DEFAULT_COSTUME_DETAILS, CHUNK_HEIGHT, POWER_UPS, RARE_COSMETICS, equippedRares, biomeAtChunk, isFaceStyle, type CostumeDetails, type ShoeId, type FaceStyleId, type PlagueMaskId, type BiomeId, type Chunk, type NetworkPlayer, type Pickup, type PowerUpKind, type MaskId, type HatId, type Relic, type Platform } from '@tower/shared';
import { canPushTarget, CRUMBLE_WARNING_TICKS, inSafeCamp } from '@tower/game-core';
import type { MotionStamp, VisualEffect } from './presentation';
import type { WorldAnnotations } from './label-layout';

export const PALETTE = { sky: '#15292c', deep: '#112024', stone: '#566d61', edge: '#78907a', shadow: '#344d47', moss: '#9eae64', glow: '#eac677', lime: '#c6ed80' };
type Context = CanvasRenderingContext2D;
const rect = (c: Context, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
interface Theme { sky: string; mortar: string; brick: string; stone: string; edge: string; shadow: string; moss: string; detail: string; }
const THEMES: Record<BiomeId, Theme> = {
  ruins: { sky: '#172c2d', mortar: '#1b3031', brick: '#4c6359', stone: '#718475', edge: '#8d9b7c', shadow: '#344e47', moss: '#a1b976', detail: '#d5d99770' },
  forest: { sky: '#132b28', mortar: '#1b3930', brick: '#526448', stone: '#869365', edge: '#c0c68c', shadow: '#344c34', moss: '#beda75', detail: '#d8ef9377' },
  caves: { sky: '#211e35', mortar: '#2c2944', brick: '#55516d', stone: '#8b84a5', edge: '#c3abd9', shadow: '#393750', moss: '#ad98d3', detail: '#d8b7f388' },
  frost: { sky: '#182e44', mortar: '#213c52', brick: '#537489', stone: '#91b3c3', edge: '#d7f4f1', shadow: '#354f69', moss: '#cef4ef', detail: '#e9ffffb0' },
  astral: { sky: '#241c36', mortar: '#2e2544', brick: '#655477', stone: '#a08ba8', edge: '#e3c8ab', shadow: '#453752', moss: '#e6c696', detail: '#f4d4f099' },
};

function rareAura(c: Context, mask: MaskId, hat: HatId, shoes: ShoeId, time: number) {
  for (const [slot, rare] of equippedRares(mask, hat, shoes).entries()) {
    if (rare.slot === 'shoes') {
      const glow = c.createRadialGradient(0, -2, 2, 0, -2, 17);
      glow.addColorStop(0, `${rare.tint}66`); glow.addColorStop(1, `${rare.tint}00`);
      c.fillStyle = glow; c.fillRect(-18, -9, 36, 13);
      for (let i = 0; i < 5; i++) {
        const phase = i * Math.PI * 2 / 5 + time / 650;
        const px = Math.round(Math.cos(phase) * 14), py = Math.round(-3 + Math.sin(phase) * 3);
        rect(c, rare.tint, px, py, 2, 2);
        if (shoes === 'comet-boots' || shoes === 'crystal-heels') { rect(c, '#fff4d4', px - 1, py, 4, 1); rect(c, '#fff4d4', px, py - 1, 1, 4); }
        if (shoes === 'cloud-slippers') rect(c, '#e6f3ff88', px - 2, py, 5, 2);
        if (shoes === 'root-boots') rect(c, '#91c55b', px - 1, py - 1, 3, 1);
      }
      if (shoes === 'void-greaves') { c.strokeStyle = '#d1a7ff'; c.beginPath(); c.ellipse(0, -1, 16, 3, 0, 0, Math.PI * 2); c.stroke(); }
      continue;
    }
    const glow = c.createRadialGradient(0, -19, 3, 0, -19, 19);
    glow.addColorStop(0, `${rare.tint}44`); glow.addColorStop(1, `${rare.tint}00`);
    c.fillStyle = glow; c.fillRect(-19, -38, 38, 38);
    for (let i = 0; i < 4; i++) {
      const phase = i * Math.PI / 2 + time / 1800 + slot;
      const px = Math.round(Math.cos(phase) * 16), py = Math.round(-19 + Math.sin(phase) * 17);
      rect(c, rare.tint, px, py, 2, 2);
      if (['crystal', 'ice-crown', 'storm'].includes(rare.item)) { rect(c, '#f5ffff', px - 1, py + 1, 4, 1); rect(c, '#f5ffff', px + 1, py - 1, 1, 4); }
      else if (['verdant', 'antlers'].includes(rare.item)) rect(c, '#edffd4', px - 1, py, 1, 3);
      else rect(c, '#fff0cf', px, py - 1, 1, 1);
    }
    if (['astral', 'eclipse', 'solar'].includes(rare.item)) {
      c.strokeStyle = `${rare.tint}99`; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -21, 17, 12, -0.35, 0, Math.PI * 2); c.stroke();
    }
    if (rare.item === 'storm') {
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) rect(c, '#d6f6ff', side * (12 + i % 2 * 3), -25 + i * 4, 3, 4);
    }
  }
}

/** Short noses, two eyes and rounded heads give these styles their own silhouette. */
function drawFace(c: Context, style: FaceStyleId, block: typeof rect) {
  const ink = '#17272e';
  const tones: Record<FaceStyleId, [string, string]> = {
    'face-peach': ['#edbc98', '#bc8268'], 'face-amber': ['#be8256', '#875439'], 'face-umber': ['#885338', '#593727'],
    'round-glasses': ['#be8256', '#875439'], sunglasses: ['#edbc98', '#bc8268'], goggles: ['#885338', '#593727'],
    'eye-patch': ['#be8256', '#875439'], moustache: ['#edbc98', '#bc8268'], beard: ['#885338', '#593727'],
    ninja: ['#596278', '#353e53'], robot: ['#acc6cc', '#5e8193'], skeleton: ['#eee3c3', '#a29d88'],
    pumpkin: ['#e99749', '#a95832'], slime: ['#9dcf86', '#527f63'], cyclops: ['#b89ccf', '#806b9b'],
    goblin: ['#99b974', '#5d7e58'], 'cat-face': ['#aaa6b1', '#6b6a7e'], 'fox-face': ['#d89757', '#975c39'],
    'fire-spirit': ['#ffbe62', '#d75d3e'], 'ice-spirit': ['#dcfaff', '#72aace'], 'void-eye': ['#54416d', '#28253d'],
    'jade-dragon': ['#8ddca3', '#398575'], 'moon-fox': ['#edf0ff', '#9b9cd3'], 'golden-idol': ['#ffe49b', '#bd8748'],
    'prismatic-slime': ['#deb0f1', '#9871c1'], 'porcelain-doll': ['#fff1e5', '#c599a8'],
  };
  const [skin, shade] = tones[style];
  block(c, ink, -5, -20, 12, 11); block(c, ink, -3, -10, 8, 2);
  block(c, skin, -4, -19, 10, 9); block(c, shade, -4, -18, 2, 7); block(c, shade, -2, -10, 7, 1);
  const eyes = () => { block(c, ink, -1, -15, 2, 2); block(c, ink, 4, -15, 2, 2); };
  if (['face-peach', 'face-amber', 'face-umber', 'round-glasses', 'sunglasses', 'goggles', 'eye-patch', 'moustache', 'beard', 'goblin'].includes(style)) {
    block(c, ink, -7, -16, 3, 5); block(c, skin, -6, -15, 2, 3);
    block(c, ink, 6, -14, 2, 3); block(c, skin, 6, -14, 1, 2);
    eyes(); block(c, shade, 2, -11, 3, 1);
  }
  switch (style) {
    case 'face-peach': case 'face-amber': case 'face-umber': break;
    case 'round-glasses':
      for (const px of [-3, 3]) { block(c, '#d6b77a', px, -16, 5, 4); block(c, '#344b58', px + 1, -15, 3, 2); block(c, '#bde5e4', px + 1, -15, 1, 1); }
      block(c, '#d6b77a', 1, -15, 2, 1); break;
    case 'sunglasses':
      block(c, ink, -4, -16, 12, 2); block(c, ink, -3, -14, 5, 1); block(c, ink, 4, -14, 4, 1);
      block(c, '#8cadd0', -2, -16, 3, 1); block(c, '#8cadd0', 5, -16, 2, 1); break;
    case 'goggles':
      block(c, '#715c46', -5, -17, 13, 5);
      for (const px of [-4, 3]) { block(c, '#c2b49b', px, -17, 5, 5); block(c, '#76bbc9', px + 1, -16, 3, 3); block(c, '#e0f4e5', px + 1, -16, 2, 1); } break;
    case 'eye-patch':
      block(c, ink, -4, -17, 10, 1); block(c, ink, 2, -16, 5, 4); block(c, '#d5c6ad', 3, -15, 1, 1); break;
    case 'moustache':
      block(c, '#503b35', -3, -12, 11, 2); block(c, '#503b35', -4, -13, 2, 2); block(c, '#503b35', 7, -13, 2, 2); block(c, skin, 2, -12, 1, 1); break;
    case 'beard':
      block(c, '#dfd5bd', -4, -12, 11, 4); block(c, '#dfd5bd', -2, -8, 7, 3); block(c, '#b8b09f', 0, -8, 1, 4); block(c, shade, 2, -11, 3, 1); break;
    case 'ninja':
      block(c, '#efc39e', -2, -16, 8, 3); eyes(); block(c, '#919eb4', -3, -19, 8, 1);
      block(c, shade, -9, -17, 5, 2); block(c, shade, -10, -15, 2, 4); break;
    case 'robot':
      block(c, shade, -7, -17, 3, 5); block(c, shade, 6, -17, 3, 5); block(c, ink, -3, -17, 9, 4); block(c, '#b9e6d8', -2, -16, 7, 1);
      block(c, shade, -1, -11, 6, 1); for (const px of [0, 2, 4]) block(c, ink, px, -12, 1, 2); break;
    case 'skeleton':
      block(c, ink, -3, -16, 4, 3); block(c, ink, 3, -16, 4, 3); block(c, shade, 1, -12, 2, 2);
      block(c, ink, -1, -10, 7, 1); for (const px of [0, 2, 4]) block(c, skin, px, -10, 1, 2); break;
    case 'pumpkin':
      block(c, ink, -7, -18, 16, 7); block(c, skin, -6, -18, 14, 7); block(c, shade, -4, -18, 1, 7); block(c, shade, 6, -18, 1, 7);
      block(c, '#283d32', -2, -16, 3, 3); block(c, '#283d32', 4, -16, 3, 3); block(c, '#f8cd78', -1, -15, 1, 1); block(c, '#f8cd78', 5, -15, 1, 1);
      block(c, ink, -1, -11, 7, 1); block(c, ink, 0, -12, 1, 1); block(c, '#637d48', 0, -23, 2, 3); break;
    case 'slime':
      block(c, shade, -7, -13, 15, 4); block(c, skin, -6, -14, 13, 4); eyes();
      block(c, '#e3eebe', -3, -18, 4, 2); block(c, '#c3df9e', -4, -16, 2, 1); block(c, '#c3df9e', 3, -11, 3, 1); break;
    case 'cyclops':
      block(c, shade, -3, -17, 10, 6); block(c, '#ede5d0', -2, -17, 8, 5); block(c, ink, 2, -16, 3, 3); block(c, '#cfe4d1', 2, -16, 1, 1); break;
    case 'goblin':
      for (const side of [-1, 1]) { const px = side < 0 ? -10 : 7; block(c, ink, px, -18, 4, 5); block(c, skin, px + 1, -17, 2, 3); }
      block(c, '#ead7ae', 4, -11, 1, 2); block(c, shade, -2, -17, 4, 1); break;
    case 'cat-face': case 'fox-face':
      for (const px of [-5, 4]) { block(c, ink, px, -23, 3, 5); block(c, style === 'cat-face' ? '#d3aeb7' : '#f0d5a8', px + 1, -22, 1, 3); }
      eyes(); block(c, '#e6dec9', 0, -12, 7, 2); block(c, ink, 3, -13, 2, 2);
      for (const px of [-6, 7]) { block(c, shade, px, -14, 3, 1); block(c, shade, px, -11, 3, 1); } break;
    case 'fire-spirit':
      for (const px of [-9, 7]) { block(c, '#d95345', px, -20, 4, 13); block(c, '#ffcd70', px + 1, -22, 2, 11); block(c, '#fff4c0', px + 1, -16, 1, 4); }
      block(c, '#893c48', -2, -16, 9, 3); block(c, '#fff5c7', -1, -15, 2, 1); block(c, '#fff5c7', 4, -15, 2, 1);
      block(c, '#fff5c7', 1, -11, 4, 1); break;
    case 'ice-spirit':
      for (const side of [-1, 1]) { block(c, '#609dc9', side < 0 ? -9 : 7, -19, 3, 10); block(c, '#d9ffff', side < 0 ? -8 : 8, -22, 1, 11); }
      block(c, '#4c6cab', -2, -15, 3, 2); block(c, '#4c6cab', 4, -15, 3, 2); block(c, '#ffffff', 1, -19, 2, 5);
      block(c, '#b4e8f6', -3, -9, 9, 3); break;
    case 'void-eye':
      block(c, '#251e39', -7, -19, 16, 10); block(c, '#ab83e4', -5, -17, 12, 6);
      block(c, '#f0d5ff', -3, -16, 9, 4); block(c, '#302642', 1, -17, 3, 7); block(c, '#fcf2ff', 1, -16, 1, 2);
      block(c, '#966db9', -8, -12, 2, 5); block(c, '#966db9', 8, -14, 2, 4); break;
    case 'jade-dragon':
      for (const px of [-8, 7]) { block(c, '#dfc279', px, -25, 2, 10); block(c, '#fff0b0', px - 1, -26, 2, 3); }
      block(c, '#52a080', -7, -16, 15, 6); eyes(); block(c, '#cbf9bc', -2, -12, 10, 3);
      block(c, '#f2e0a0', -11, -12, 6, 1); block(c, '#f2e0a0', 7, -12, 5, 1); block(c, '#348569', 2, -11, 3, 1); break;
    case 'moon-fox':
      for (const px of [-8, 6]) { block(c, '#8f91c2', px, -27, 4, 12); block(c, '#edf4ff', px + 1, -26, 2, 9); block(c, '#d4b3e8', px + 1, -22, 1, 3); }
      block(c, '#7787c1', -6, -13, 14, 3); block(c, '#fff6e3', -2, -13, 8, 3); eyes();
      block(c, '#ecce89', 1, -19, 3, 2); block(c, skin, 2, -20, 2, 2); block(c, ink, 2, -12, 2, 1); break;
    case 'golden-idol':
      block(c, '#c49148', -7, -20, 16, 12); block(c, '#ffe6a1', -4, -19, 11, 9);
      for (const px of [-2, 4]) { block(c, '#477f79', px, -16, 3, 3); block(c, '#90ffe0', px + 1, -16, 1, 1); }
      for (const px of [-8, 8]) { block(c, '#f2c768', px, -15, 2, 9); block(c, '#74d4b8', px - 1, -8, 4, 2); }
      block(c, '#a56e3c', 0, -11, 5, 1); break;
    case 'prismatic-slime':
      block(c, '#af82c9', -7, -17, 16, 9); block(c, '#e8b6ec', -5, -19, 11, 10);
      block(c, '#88e3d4', -5, -18, 4, 9); block(c, '#ffdf9c', 4, -16, 4, 7); block(c, '#f2edff', -3, -18, 4, 2); eyes();
      for (const px of [-9, 10]) { block(c, '#b9eaff', px, -19, 3, 3); block(c, '#ffffff', px, -19, 1, 1); } break;
    case 'porcelain-doll':
      block(c, '#87759d', -3, -16, 4, 2); block(c, '#87759d', 3, -16, 4, 2);
      block(c, '#eea3b5', -4, -13, 3, 2); block(c, '#eea3b5', 5, -13, 3, 2); block(c, '#dcb564', 0, -14, 1, 4);
      block(c, '#b26b84', 1, -11, 3, 1);
      for (const px of [-7, -3, 1, 5, 9]) { block(c, '#fff5eb', px, -9, 3, 3); block(c, '#d8b8cf', px, -7, 2, 1); } break;
  }
}

function drawShoe(c: Context, block: typeof rect, style: ShoeId, color: string, x: number, y: number) {
  const ink = '#203136', light = '#f5ead4';
  const b = (tint: string, px: number, py: number, w: number, h: number) => block(c, tint, x + px, y + py, w, h);
  switch (style) {
    case 'classic': b(color, 0, 0, 3, 3); break;
    case 'sneakers': b(color, 0, 0, 5, 2); b(light, 0, 2, 5, 1); b(light, 1, 0, 1, 1); break;
    case 'high-boots': b(color, 0, -4, 3, 7); b(color, 2, 1, 3, 2); b(light, 0, -4, 3, 1); b(ink, 0, 2, 5, 1); break;
    case 'elf-shoes': b(color, 0, 0, 5, 3); b(color, 4, -1, 2, 3); b(light, 5, -2, 1, 1); break;
    case 'clogs': b(color, -1, 0, 5, 2); b('#ae805b', -1, 2, 5, 1); b(light, 0, 0, 2, 1); break;
    case 'sandals': b('#e6d6b2', 0, 0, 4, 2); b(color, 0, 0, 1, 2); b(color, 2, 0, 1, 2); b(ink, 0, 2, 4, 1); break;
    case 'slippers': b(color, -1, 0, 5, 3); b(light, -1, -1, 3, 2); b(light, 3, 0, 1, 1); break;
    case 'armored': b(ink, -1, -3, 4, 6); b(color, 0, -3, 3, 5); b(color, 2, 1, 3, 2); b(light, 0, -3, 1, 4); b(light, 2, 1, 2, 1); break;
    case 'striped': b(color, 0, -4, 3, 7); b(color, 2, 1, 2, 2); for (const py of [-3, -1, 1]) b(light, 0, py, 3, 1); break;
    case 'lace-up': b(color, 0, -3, 3, 6); b(color, 2, 1, 2, 2); for (const py of [-2, 0]) b(light, 1, py, 2, 1); b(ink, 0, 2, 4, 1); break;
    case 'flippers': b(color, 0, 0, 3, 2); b(color, 1, 1, 7, 2); b(ink, 5, 1, 1, 2); b(light, 2, 1, 2, 1); break;
    case 'cat-paws': b(color, -1, -1, 5, 4); b(light, 0, 0, 1, 1); b(light, 2, 0, 1, 1); b('#d997ac', 1, 1, 2, 1); break;
    case 'comet-boots': b('#b98445', 0, -4, 4, 7); b('#ffe0a1', 1, -4, 2, 5); b('#f1b869', 2, 0, 5, 3); b('#fff4c1', 5, -1, 1, 4); b('#fff4c1', 4, 0, 3, 1); break;
    case 'frost-skates': b('#71a9cd', 0, -3, 4, 5); b('#d8fbff', 1, -3, 2, 3); b('#a1d9eb', 2, 0, 5, 2); b('#f0ffff', -2, 3, 10, 1); b('#8db8d4', 1, 2, 1, 1); b('#f0ffff', 7, 1, 1, 2); break;
    case 'lava-hooves': b('#4c3743', -1, -3, 6, 6); b('#9a4241', -2, 0, 8, 3); b('#ff9765', 0, -2, 1, 5); b('#ffd094', 2, 1, 1, 2); b('#281f32', 3, 1, 1, 2); break;
    case 'cloud-slippers': b('#adbad9', -2, 0, 9, 3); b('#f2f7ff', -2, -1, 8, 3); b('#ffffff', -1, -3, 3, 3); b('#e1edff', 3, -2, 3, 3); b('#d4e1f4', 6, 0, 2, 2); break;
    case 'root-boots': b('#84664a', 0, -4, 4, 6); b('#b18f55', -2, 1, 8, 2); b('#513f36', 2, -3, 1, 5); b('#a5d779', -2, -4, 3, 2); b('#d1f795', 3, -3, 3, 2); b('#e9faba', 3, -3, 1, 1); break;
    case 'void-greaves': b('#493856', -1, -5, 5, 8); b('#a484ce', 0, -5, 2, 7); b('#3b2c4b', 2, 0, 5, 3); b('#d9b4ff', 0, -3, 4, 1); b('#c7a1ed', 2, 2, 5, 1); break;
    case 'crystal-heels': b('#9e77b7', 0, -3, 4, 6); b('#efbbef', 1, -4, 2, 6); b('#cea0dc', 2, 0, 5, 3); b('#fff0ff', -1, -5, 1, 5); b('#fff0ff', 4, -2, 1, 4); b('#8d75ae', 0, 3, 2, 1); break;
    case 'winged-sandals': b('#e2bb76', 0, 0, 6, 3); b('#fff1c8', 1, 0, 1, 2); for (let i = 0; i < 3; i++) { b(i % 2 ? '#dfd6c0' : '#fff7de', -4 + i * 2, -6 + i, 2, 5 - i); } b('#bd965b', -1, -1, 3, 2); break;
  }
}

/** Footwear swatches use the same shapes as the character, without its coat or face. */
export function drawShoePreview(c: Context, x: number, y: number, shoes: ShoeId = DEFAULT_COSTUME_DETAILS.shoes, color = DEFAULT_COSTUME_DETAILS.shoeColor) {
  c.save(); c.translate(x, y);
  rareAura(c, 'ivory', 'top-hat', shoes, 0);
  drawShoe(c, rect, shoes, color, -4, -1);
  drawShoe(c, rect, shoes, color, 2, -1);
  c.restore();
}

// Keep ink and translucent shadows; recolor matte materials with their shading intact.
function tintMaterial(source: string, color: string): string {
  if (source.length !== 7 || source === color) return source;
  const channels = [1, 3, 5].map(i => parseInt(source.slice(i, i + 2), 16));
  const luminance = (channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722) / 255;
  if (luminance < .18) return source;
  const shade = Math.max(0, (.65 - luminance) * 1.1), highlight = Math.max(0, (luminance - .65) * 1.8);
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(color.slice(i, i + 2), 16) * (1 - shade - highlight) + 245 * highlight).toString(16).padStart(2, '0')).join('');
}

export function mage(c: Context, x: number, y: number, color = '#c6ed80', frame = 0, facing = 1, crown = false, pose: 'idle' | 'run' | 'rise' | 'fall' | 'land' | 'push' | 'hurt' = 'idle', amount = 0, mask: MaskId = 'ivory', hat: HatId = 'top-hat', auraTime = 0, details: Partial<CostumeDetails> = {}) {
  c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(facing, 1);
  rareAura(c, mask, hat, details.shoes ?? 'classic', auraTime);
  const step = Math.floor(frame) % 4;
  const darkCoat = color === BOT_COLOR;
  const coatEdge = darkCoat ? '#737b89' : '#142529';
  // Quantize squash/stretch before drawing: every edge stays on the logical pixel grid.
  const scaleX = pose === 'land' ? 1 + amount * 0.12 : 1;
  const scaleY = pose === 'land' ? 1 - amount * 0.12 : pose === 'rise' ? 1.04 : 1;
  const block = (ctx: Context, tint: string, px: number, py: number, w: number, h: number) => rect(ctx, tint, Math.round(px * scaleX), Math.round(py * scaleY), Math.max(1, Math.round((px + w) * scaleX) - Math.round(px * scaleX)), Math.max(1, Math.round((py + h) * scaleY) - Math.round(py * scaleY)));
  if (pose === 'run') c.translate(1, step % 2 ? -1 : 0);
  if (pose === 'idle') c.translate(0, step === 2 ? -1 : 0);
  if (pose === 'rise') c.translate(1, 0);
  if (pose === 'fall') c.translate(-1, 0);
  if (pose === 'push') c.translate(Math.round(amount * 2), 0);
  if (pose === 'hurt') c.translate(-2, 1);
  // The colored coat and cape remain recognizable with every face and headdress.
  block(c, coatEdge, -5, -11, 11, 12);
  block(c, color, -4, -10, 9, 9); block(c, color, -6 - (pose === 'run' ? step % 2 : 0), -5, 12, 4);
  block(c, '#17292a66', -4, -9, 2, 8); block(c, '#17292a66', -5, -3, 3, 2);
  block(c, '#324440', 1, -8, 1, 7); block(c, '#ead6a0', 2, -7, 1, 1); block(c, '#ead6a0', 2, -4, 1, 1);
  const stride = pose === 'run' ? [-2, 0, 2, 0][step]! : 0;
  const shoes = details.shoes ?? DEFAULT_COSTUME_DETAILS.shoes, shoeColor = details.shoeColor ?? DEFAULT_COSTUME_DETAILS.shoeColor;
  drawShoe(c, block, shoes, shoeColor, -4 + stride, pose === 'rise' ? -2 : -1);
  drawShoe(c, block, shoes, shoeColor, 2 - stride, pose === 'fall' ? 0 : -1);
  // A separate sleeve and glove make the action readable even without particles.
  const arm = pose === 'push' ? Math.round(amount * 10) : pose === 'run' ? stride : 0;
  const armY = pose === 'rise' ? -11 : pose === 'fall' ? -13 : -9;
  block(c, coatEdge, 3, armY - 1, 5 + Math.max(0, arm), 5);
  block(c, color, 4, armY, 3 + Math.max(0, arm), 3); block(c, '#e6d6b2', 6 + arm, armY, 3, 3);
  if (isFaceStyle(mask)) {
    drawFace(c, mask, block);
  } else {
    // The original plague masks retain their long beaks and ornaments.
    const masks: Record<PlagueMaskId, [string, string, string]> = {
      ivory: ['#f4ecd2', '#c4b896', '#84a7a0'], raven: ['#4a5670', '#27364b', '#f3c77e'], owl: ['#efe0ba', '#9d8867', '#f7c65f'], fox: ['#dd9869', '#965f43', '#ace0b0'],
      bone: ['#c9c5a5', '#7e806b', '#cfdfc8'], brass: ['#d2ac64', '#88703d', '#a7e8e6'], harlequin: ['#df9eb4', '#907aaa', '#f9dfb6'], moth: ['#cbb1da', '#7a6998', '#e9e99d'],
      cat: ['#8b789e', '#514963', '#c6ed80'], porcelain: ['#f1f5e5', '#9aaccc', '#759ccc'], verdant: ['#b4da83', '#63835c', '#f8edb7'], crystal: ['#bcecf4', '#808ddd', '#ffffff'], astral: ['#ad8edd', '#665184', '#f8e99f'],
      stork: ['#eee9d5', '#c96651', '#88a4ba'], ibis: ['#bd817e', '#753b4a', '#f4d99c'], pelican: ['#e7d6b1', '#c39865', '#a6caab'], vulture: ['#b3a49c', '#645657', '#e6b97f'], heron: ['#b0c4cd', '#5a788f', '#f5cc86'],
      woodpecker: ['#c6bfaf', '#753c47', '#eee1c4'], kingfisher: ['#74b6c3', '#486a92', '#f2bb83'], parrot: ['#9fb873', '#b56a53', '#f5df91'], bat: ['#9c91b5', '#54485f', '#e5afa1'], ram: ['#d9c6a1', '#9a795c', '#c6dfa5'],
      stag: ['#bc906c', '#79634c', '#e7d9b2'], hare: ['#d8cfbd', '#9c8c88', '#dcabb0'], badger: ['#ddd9cd', '#4c5559', '#bcd4c8'], panda: ['#e4e2cf', '#4e505a', '#c6cf93'], clockwork: ['#c4a173', '#706450', '#b9d9c3'],
      patchwork: ['#c19c94', '#7e6f8e', '#dce5b1'], diver: ['#a4afb0', '#576c76', '#d7dba3'], bandage: ['#d6ceb2', '#8d8b77', '#c3af82'], samurai: ['#c48476', '#733f48', '#e4cdb2'], domino: ['#e2dfd0', '#485361', '#b9cacc'],
      solar: ['#ffe9a2', '#cb913f', '#ffffff'], abyss: ['#63bdaf', '#305776', '#b8fff4'], storm: ['#c2e8ff', '#5776b4', '#ffffff'],
      obsidian: ['#624e67', '#322d43', '#ffc277'], scarab: ['#65d7bb', '#357c88', '#fff1b5'],
    };
    const [face, shade, lens] = masks[mask];
    block(c, '#142529', -4, -17, 10, 9);
    block(c, face, -1, -16, 7, 6); block(c, shade, 0, -10, 5, 1);
    block(c, '#142529', 5, -14, 7, 4); block(c, '#142529', 8, -10, 3, 2);
    block(c, face, 5, -13, 6, 2); block(c, shade, 6, -11, 4, 1); block(c, shade, 9, -10, 1, 1);
    block(c, shade, 0, -16, 4, 4); block(c, '#172b2c', 1, -15, 3, 3); block(c, lens, 1, -15, 1, 1);
    block(c, '#63706a', -3, -14, 3, 1);
    if (mask === 'raven') { block(c, '#8190ae', -2, -16, 1, 5); block(c, '#293448', 10, -13, 3, 2); }
    if (mask === 'owl') { block(c, '#fff1c9', -3, -16, 7, 1); block(c, shade, -2, -15, 2, 3); block(c, lens, -1, -14, 1, 1); }
    if (mask === 'fox' || mask === 'cat') { block(c, face, -4, -18, 2, 6); block(c, face, 5, -18, 2, 3); block(c, '#edd7bd', -3, -12, 4, 2); }
    if (mask === 'bone') { block(c, '#38423b', -2, -13, 2, 2); for (let px = 1; px < 6; px += 2) block(c, '#6d7967', px, -10, 1, 2); }
    if (mask === 'brass') { for (const px of [-2, 5, 8]) block(c, '#f6dfa1', px, -12, 1, 1); block(c, '#684e31', -2, -16, 1, 2); }
    if (mask === 'harlequin') { block(c, '#8abeca', -3, -16, 3, 5); block(c, '#eeda92', 5, -15, 2, 2); block(c, '#f6dfba', 0, -11, 2, 1); }
    if (mask === 'moth') { block(c, shade, -5, -15, 3, 5); block(c, face, -6, -14, 2, 2); block(c, lens, -4, -12, 1, 1); }
    if (mask === 'porcelain') { block(c, '#6485b8', -2, -15, 1, 4); block(c, '#6485b8', 5, -12, 2, 1); block(c, '#d6dffa', 7, -13, 1, 1); }
    if (['stork', 'ibis', 'heron', 'kingfisher'].includes(mask)) {
      block(c, shade, 7, -13, 8, 2); block(c, face, 6, -14, 7, 1);
      if (mask === 'ibis') { block(c, shade, 13, -12, 2, 4); block(c, shade, 12, -9, 2, 1); }
      if (mask === 'heron') { block(c, shade, -6, -16, 4, 1); block(c, face, -5, -18, 2, 3); }
      if (mask === 'kingfisher') { block(c, '#d7a26f', -2, -11, 5, 2); block(c, face, -4, -19, 4, 2); }
    }
    if (mask === 'pelican') { block(c, '#e4bd86', 6, -12, 8, 5); block(c, shade, 7, -7, 6, 1); }
    if (mask === 'vulture') { block(c, '#ece0bd', -5, -10, 11, 3); block(c, shade, 10, -12, 2, 5); }
    if (mask === 'woodpecker') { block(c, '#ae5259', -5, -19, 5, 4); block(c, shade, 9, -14, 5, 2); block(c, '#efe6ce', -3, -12, 5, 1); }
    if (mask === 'parrot') { block(c, '#c59763', 8, -13, 5, 4); block(c, shade, 10, -10, 2, 3); block(c, '#e5d8a2', -1, -16, 4, 4); block(c, '#334b40', 1, -15, 2, 2); }
    if (mask === 'bat') for (const side of [-1, 1]) { block(c, shade, side < 0 ? -8 : 5, -20, 3, 8); block(c, face, side < 0 ? -7 : 6, -18, 1, 4); }
    if (mask === 'ram') for (const side of [-1, 1]) { const px = side < 0 ? -8 : 7; block(c, shade, px, -18, 4, 7); block(c, '#e7d9b7', px + 1, -17, 2, 4); block(c, shade, px + 2, -13, 2, 1); }
    if (mask === 'stag') { block(c, shade, -7, -20, 2, 6); block(c, shade, -9, -20, 2, 2); block(c, face, -6, -15, 3, 2); }
    if (mask === 'hare') for (const px of [-6, 5]) { block(c, face, px, -24, 3, 10); block(c, '#c49b9e', px + 1, -22, 1, 6); }
    if (mask === 'badger') { block(c, shade, -3, -17, 2, 7); block(c, shade, 4, -16, 2, 5); block(c, face, 0, -17, 2, 3); }
    if (mask === 'panda') { block(c, shade, -6, -18, 4, 4); block(c, shade, 4, -18, 3, 3); block(c, shade, -1, -16, 5, 4); block(c, lens, 1, -15, 1, 1); }
    if (mask === 'clockwork') { block(c, '#e4c998', -6, -15, 5, 5); block(c, shade, -5, -14, 3, 3); for (const px of [-6, -3, 5, 8]) block(c, '#ede0b4', px, -12, 1, 1); }
    if (mask === 'patchwork') { block(c, '#8da9a0', -3, -16, 3, 5); for (let px = -2; px < 10; px += 3) block(c, '#efe3c8', px, -12, 1, 2); }
    if (mask === 'diver') { block(c, shade, -6, -18, 13, 10); block(c, face, -5, -17, 11, 8); block(c, '#3c5667', -2, -16, 7, 5); block(c, lens, -1, -15, 2, 1); block(c, '#bd9970', 6, -13, 7, 3); }
    if (mask === 'bandage') { for (let py = -16; py <= -10; py += 2) block(c, shade, -3, py, 9, 1); block(c, '#344846', 0, -14, 4, 2); block(c, face, -5, -12, 2, 6); }
    if (mask === 'samurai') { block(c, shade, -5, -12, 12, 3); block(c, face, -6, -16, 3, 6); block(c, '#eddfbc', -2, -10, 1, 3); block(c, '#eddfbc', 5, -10, 1, 3); }
    if (mask === 'domino') { block(c, shade, -4, -16, 10, 4); block(c, '#eee9d5', 0, -15, 2, 1); block(c, shade, -7, -14, 3, 1); }
    if (mask === 'verdant') { block(c, '#638e55', -5, -15, 4, 2); block(c, '#c5ed98', -5, -17, 2, 2); block(c, '#f2dba5', 6, -12, 2, 1); }
    if (mask === 'crystal') { block(c, '#ecffff', -3, -17, 2, 5); block(c, '#a2bef4', -5, -15, 2, 2); block(c, '#ffffff', 8, -13, 2, 1); }
    if (mask === 'astral') { block(c, '#ffecab', -3, -15, 3, 1); block(c, '#ffecab', -2, -16, 1, 3); block(c, '#e8ccff', 7, -12, 1, 1); }
  }
  // Common hats use matte cloth and ordinary materials. Collectibles have larger silhouettes.
  const customHatColor = RARE_COSMETICS.some(r => r.slot === 'hat' && r.item === hat) ? null : details.hatColor;
  const hatTint = customHatColor ?? color, darkHat = hatTint === BOT_COLOR || hatTint === DEFAULT_COSTUME_DETAILS.shoeColor;
  const hatEdge = darkHat ? '#737b89' : '#142529';
  const hatPalette = new Map<string, string>();
  const hatBlock: typeof rect = (ctx, tint, px, py, w, h) => {
    if (customHatColor && tint !== hatEdge) {
      if (!hatPalette.has(tint)) hatPalette.set(tint, tintMaterial(tint, customHatColor));
      tint = hatPalette.get(tint)!;
    }
    block(ctx, tint, px, py, w, h);
  };
  const brim = (width = 15) => { hatBlock(c, hatEdge, -Math.floor(width / 2) - 1, -18, width + 2, 3); hatBlock(c, hatTint, -Math.floor(width / 2), -18, width, 2); };
  switch (hat) {
    case 'bare-head': break;
    case 'curls':
      hatBlock(c, '#4d3836', -7, -23, 15, 5); hatBlock(c, '#4d3836', -7, -19, 3, 6);
      for (const [px, py] of [[-6, -24], [-2, -25], [2, -24], [5, -22], [-7, -20]] as const) { hatBlock(c, '#785548', px, py, 4, 3); hatBlock(c, '#a07a5c', px, py, 2, 1); } break;
    case 'braid':
      hatBlock(c, '#b88b51', -5, -23, 12, 5); hatBlock(c, '#e1b978', -3, -23, 9, 2); hatBlock(c, '#b88b51', -6, -20, 3, 7);
      for (let i = 0; i < 5; i++) hatBlock(c, i % 2 ? '#b88b51' : '#e1b978', -8 + i % 2, -14 + i * 2, 3, 2);
      hatBlock(c, hatTint, -8, -4, 4, 2); break;
    case 'mohawk':
      hatBlock(c, '#69556b', -4, -21, 10, 3); hatBlock(c, '#b8759c', -1, -28, 4, 10);
      hatBlock(c, '#dda3bb', 0, -31, 2, 6); hatBlock(c, '#dda3bb', 3, -26, 2, 5); break;
    case 'headphones':
      hatBlock(c, '#293d4a', -7, -24, 15, 3); hatBlock(c, '#9badb9', -5, -24, 11, 1);
      for (const px of [-8, 6]) { hatBlock(c, '#293d4a', px, -22, 3, 10); hatBlock(c, '#c09c75', px, -17, 3, 4); } break;
    case 'headband':
      hatBlock(c, '#ebe0c6', -5, -20, 12, 3); hatBlock(c, hatTint, -5, -19, 12, 1);
      hatBlock(c, '#ebe0c6', -8, -19, 3, 3); hatBlock(c, hatTint, -10, -17, 3, 6); break;
    case 'bunny-ears':
      hatBlock(c, '#d4c7c4', -6, -20, 13, 2);
      for (const px of [-5, 3]) { hatBlock(c, '#d4c7c4', px, -32, 4, 13); hatBlock(c, '#b98795', px + 1, -30, 2, 9); } break;
    case 'sprout':
      hatBlock(c, '#6c8e56', 0, -29, 2, 10); hatBlock(c, '#9eb877', -5, -29, 6, 3); hatBlock(c, '#9eb877', 2, -31, 5, 3); hatBlock(c, '#cad399', -4, -29, 3, 1); break;
    case 'top-hat':
      hatBlock(c, hatEdge, -5, -26, 11, 9); hatBlock(c, hatTint, -4, -25, 9, 8); hatBlock(c, '#263a3599', -4, -20, 9, 2); brim(); hatBlock(c, '#ead6a0', 3, -20, 2, 1); break;
    case 'witch':
      for (let i = 0; i < 6; i++) hatBlock(c, hatTint, -5 + i, -19 - i * 2, 11 - i * 2, 2);
      if (darkHat) for (let i = 0; i < 6; i++) hatBlock(c, hatEdge, -5 + i, -19 - i * 2, 1, 2);
      hatBlock(c, hatTint, 1, -30, 4, 2); hatBlock(c, '#263a3599', -4, -20, 10, 2); brim(19); break;
    case 'hood':
      hatBlock(c, darkHat ? hatEdge : '#172a29', -7, darkHat ? -25 : -24, 14, darkHat ? 10 : 9); hatBlock(c, hatTint, -6, -24, 12, 5); hatBlock(c, hatTint, -7, -20, 3, 12); hatBlock(c, '#273b3588', -6, -19, 2, 10); hatBlock(c, hatTint, 5, -21, 2, 5); break;
    case 'tricorn':
      brim(19); hatBlock(c, hatTint, -7, -22, 15, 5); hatBlock(c, hatTint, -9, -24, 3, 5); hatBlock(c, hatTint, 7, -24, 3, 5); hatBlock(c, '#e8d394', -7, -23, 15, 1); hatBlock(c, '#263a3588', -3, -22, 7, 3); break;
    case 'bowler':
      hatBlock(c, '#162b29', -6, -23, 13, 6); hatBlock(c, hatTint, -5, -23, 11, 5); hatBlock(c, hatTint, -3, -25, 7, 2); hatBlock(c, '#263a35aa', -5, -20, 11, 2); brim(); break;
    case 'beret':
      hatBlock(c, hatTint, -7, -22, 15, 4); hatBlock(c, hatTint, -4, -24, 11, 3); hatBlock(c, '#263a35aa', -5, -19, 10, 2); hatBlock(c, '#ead6a0', 6, -23, 2, 2); hatBlock(c, hatTint, 1, -26, 2, 2); break;
    case 'feather-cap':
      brim(13); hatBlock(c, hatTint, -6, -22, 12, 5); hatBlock(c, hatTint, -3, -24, 7, 2); for (let i = 0; i < 4; i++) hatBlock(c, '#efe2b4', -6 - i, -24 - i * 2, 3, 3); break;
    case 'helmet':
      hatBlock(c, '#455764', -6, -24, 13, 7); hatBlock(c, '#9fbbc3', -5, -24, 11, 5); hatBlock(c, '#d4e4dc', -1, -26, 3, 9); hatBlock(c, '#65818c', -7, -19, 4, 5); hatBlock(c, hatTint, -1, -29, 3, 3); break;
    case 'turban':
      hatBlock(c, hatTint, -7, -23, 15, 5); hatBlock(c, hatTint, -5, -26, 11, 4); hatBlock(c, '#e4dac366', -5, -24, 9, 1); hatBlock(c, '#263a3566', -4, -21, 10, 1); hatBlock(c, '#ead6a0', 4, -21, 3, 3); hatBlock(c, hatTint, -7, -19, 3, 9); break;
    case 'crownlet':
      hatBlock(c, '#827045', -6, -22, 13, 5); hatBlock(c, '#e5c875', -6, -21, 13, 3); for (const px of [-5, 0, 5]) hatBlock(c, '#f3da86', px, -26, 2, 5); hatBlock(c, hatTint, 0, -21, 2, 2); break;
    case 'antlers':
      hatBlock(c, '#67845a', -7, -22, 15, 5);
      for (const side of [-1, 1]) { hatBlock(c, '#cda775', side * 8, -34, 3, 14); hatBlock(c, '#ffe1a6', side * 12, -37, 2, 9); hatBlock(c, '#e3c08a', side > 0 ? 8 : -14, -30, 7, 2); hatBlock(c, '#e3c08a', side > 0 ? 12 : -17, -35, 6, 2); hatBlock(c, '#c9f5a0', side * 16, -37, 2, 3); }
      hatBlock(c, '#dfffaa', -3, -23, 7, 3); break;
    case 'ice-crown':
      hatBlock(c, '#749aca', -10, -23, 21, 6); for (let i = 0; i < 5; i++) { const h = [10, 14, 19, 14, 10][i]!; hatBlock(c, '#a5dcff', -9 + i * 4, -21 - h, 3, h); hatBlock(c, '#f1ffff', -9 + i * 4, -21 - h, 1, h - 2); } hatBlock(c, '#ecffff', -9, -23, 19, 2); break;
    case 'phoenix':
      hatBlock(c, '#b85c46', -5, -24, 11, 7); for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { hatBlock(c, '#f39755', side * (5 + i * 3) - 1, -25 - i * 3, 4, 9); hatBlock(c, '#ffe6a0', side * (5 + i * 3), -27 - i * 3, 2, 6); } hatBlock(c, '#fff1b4', -1, -36, 3, 17); break;
    case 'fez':
      hatBlock(c, hatTint, -5, -29, 11, 11); hatBlock(c, '#263a3566', -5, -20, 11, 2); hatBlock(c, '#d7b77b', 0, -30, 7, 1); hatBlock(c, '#74614b', 6, -29, 1, 8); break;
    case 'boater':
      brim(23); hatBlock(c, '#d2bb8d', -6, -25, 13, 7); hatBlock(c, hatTint, -6, -21, 13, 2); hatBlock(c, '#efe1b9', -6, -25, 13, 1); break;
    case 'sombrero':
      hatBlock(c, '#bd9b68', -14, -19, 29, 3); hatBlock(c, '#ebd0a0', -13, -21, 27, 2); hatBlock(c, '#d4b282', -5, -27, 11, 7); hatBlock(c, '#d4b282', -3, -30, 7, 3); hatBlock(c, hatTint, -5, -22, 11, 2); break;
    case 'ushanka':
      hatBlock(c, '#a69a83', -7, -26, 15, 9); hatBlock(c, hatTint, -5, -26, 11, 5); hatBlock(c, '#c5b79c', -8, -21, 4, 10); hatBlock(c, '#c5b79c', 5, -21, 4, 7); break;
    case 'nightcap':
      hatBlock(c, hatTint, -6, -24, 13, 6); hatBlock(c, hatTint, -3, -29, 8, 5); hatBlock(c, hatTint, 3, -29, 5, 3); hatBlock(c, hatTint, 6, -27, 3, 5); hatBlock(c, '#ece2c9', 7, -23, 4, 4); hatBlock(c, '#ece2c9', -6, -19, 13, 2); break;
    case 'chef':
      hatBlock(c, '#dddacb', -5, -27, 11, 10); hatBlock(c, '#f1eee0', -9, -32, 19, 7); hatBlock(c, '#f1eee0', -6, -35, 5, 5); hatBlock(c, '#f1eee0', 2, -35, 5, 5); hatBlock(c, '#b6baaa', -4, -20, 9, 1); break;
    case 'pirate':
      hatBlock(c, '#455052', -11, -23, 23, 6); hatBlock(c, '#455052', -7, -27, 15, 5); hatBlock(c, '#dfc28a', -10, -19, 21, 1); hatBlock(c, '#e3dcc4', -2, -25, 5, 3); hatBlock(c, '#455052', -1, -24, 1, 1); hatBlock(c, '#455052', 1, -24, 1, 1); break;
    case 'aviator':
      hatBlock(c, '#946d51', -7, -26, 15, 9); hatBlock(c, '#946d51', -7, -20, 3, 10); hatBlock(c, '#d3b58a', -6, -25, 13, 5); hatBlock(c, '#4e636b', -5, -24, 5, 3); hatBlock(c, '#4e636b', 2, -24, 5, 3); break;
    case 'straw':
      for (let i = 0; i < 5; i++) hatBlock(c, i % 2 ? '#d2b986' : '#b79c6b', -12 + i * 2, -19 - i * 2, 25 - i * 4, 2); hatBlock(c, '#eee0b6', -12, -19, 25, 1); break;
    case 'flower-pot':
      hatBlock(c, '#ad795d', -6, -26, 13, 8); hatBlock(c, '#d9a57c', -8, -27, 17, 3); hatBlock(c, '#718851', 0, -34, 2, 8); hatBlock(c, '#93a769', -3, -31, 4, 2); hatBlock(c, '#d7a1ae', -2, -36, 6, 4); hatBlock(c, '#e9d0a1', 0, -35, 2, 2); break;
    case 'mushroom':
      hatBlock(c, '#d6c8a7', -4, -23, 9, 6); hatBlock(c, '#ae6d66', -11, -27, 23, 6); hatBlock(c, '#ae6d66', -7, -31, 15, 4); for (const px of [-7, 0, 6]) hatBlock(c, '#e9d9b9', px, px === 0 ? -30 : -26, 3, 2); break;
    case 'jester':
      hatBlock(c, hatTint, -6, -23, 13, 6); for (const side of [-1, 1]) { hatBlock(c, hatTint, side * 5, -29, 4, 7); hatBlock(c, '#8d819b', side * 8, -29, 4, 3); hatBlock(c, '#d3b886', side * 10, -27, 3, 3); } break;
    case 'viking':
      hatBlock(c, '#82989c', -6, -26, 13, 9); hatBlock(c, '#bdc9bd', -1, -27, 3, 10); for (const side of [-1, 1]) { hatBlock(c, '#d4c7a7', side < 0 ? -11 : 7, -27, 4, 5); hatBlock(c, '#e5dabe', side < 0 ? -12 : 10, -30, 2, 4); } break;
    case 'plumber':
      hatBlock(c, hatTint, -6, -24, 14, 7); hatBlock(c, hatTint, -3, -27, 9, 3); hatBlock(c, hatTint, 5, -19, 9, 2); hatBlock(c, '#ece2c9', 1, -24, 4, 4); hatBlock(c, '#657954', 2, -23, 2, 2); break;
    case 'sailor':
      hatBlock(c, '#e6e4d5', -7, -25, 15, 7); hatBlock(c, '#7391a5', -7, -20, 15, 2); hatBlock(c, '#eeeade', -5, -27, 11, 3); hatBlock(c, '#536b81', -6, -18, 2, 7); break;
    case 'graduation':
      hatBlock(c, '#536260', -5, -24, 11, 7); hatBlock(c, '#657271', -12, -27, 25, 3); hatBlock(c, '#8b9990', -7, -29, 15, 2); hatBlock(c, '#c9b17d', 10, -26, 1, 10); hatBlock(c, '#c9b17d', 9, -17, 3, 2); break;
    case 'bucket':
      brim(19); hatBlock(c, hatTint, -6, -25, 13, 7); hatBlock(c, '#263a3566', -6, -22, 13, 1); hatBlock(c, '#e7dfc077', -6, -25, 13, 1); break;
    case 'detective':
      hatBlock(c, '#a3977d', -7, -25, 15, 7); hatBlock(c, '#c3b59b', -5, -27, 11, 3); hatBlock(c, '#a3977d', -10, -19, 24, 2); for (const px of [-4, 0, 4]) hatBlock(c, '#746c5d', px, -25, 1, 7); break;
    case 'bonnet':
      hatBlock(c, '#d4c3bc', -7, -27, 13, 9); hatBlock(c, '#e9dfc7', 4, -25, 4, 10); hatBlock(c, '#d4c3bc', -8, -20, 3, 8); hatBlock(c, '#b6a29e', -6, -13, 4, 2); break;
    case 'paper-boat':
      hatBlock(c, '#dcdcc9', -11, -21, 23, 4); for (let i = 0; i < 5; i++) hatBlock(c, '#eee9d8', -8 + i * 2, -23 - i * 2, 17 - i * 3, 2); hatBlock(c, '#aaa997', 0, -28, 1, 7); break;
    case 'eclipse':
      hatBlock(c, '#8164a9', -8, -22, 17, 5); hatBlock(c, '#ebcaff', -8, -23, 17, 2); hatBlock(c, '#edc8ff', -6, -40, 13, 12); hatBlock(c, '#392951', -2, -40, 9, 9); hatBlock(c, '#fff1ba', -1, -29, 3, 8); break;
    case 'jellyfish':
      hatBlock(c, '#e097c6', -13, -30, 27, 8); hatBlock(c, '#f3b9dd', -10, -35, 21, 6); hatBlock(c, '#ffe0f4', -5, -37, 11, 3); for (const px of [-12, -8, 8, 12]) { hatBlock(c, '#eeb0df', px, -22, 1, 13 + Math.abs(px) % 5); hatBlock(c, '#fff2ff', px - 1, -11, 3, 2); } break;
    case 'dragon':
      hatBlock(c, '#ab535a', -7, -26, 15, 9); hatBlock(c, '#ffbd90', -1, -30, 3, 12); for (const side of [-1, 1]) { hatBlock(c, '#e1a77e', side * 8, -37, 3, 13); hatBlock(c, '#ffe5b4', side * 10, -40, 2, 7); for (let i = 0; i < 3; i++) hatBlock(c, i % 2 ? '#ef9b80' : '#ae5669', side * (9 + i * 3), -27 - i * 2, 3, 9 - i * 2); } break;
    case 'comet-crown':
      hatBlock(c, '#b98b53', -7, -23, 15, 5); hatBlock(c, '#ffe4a0', -7, -24, 15, 2);
      hatBlock(c, '#ffd578', 1, -40, 3, 17); hatBlock(c, '#fff0b5', -5, -35, 15, 3); hatBlock(c, '#fff8e0', 0, -36, 5, 5);
      for (let i = 0; i < 4; i++) hatBlock(c, i % 2 ? '#f5a975' : '#ffdd95', -8 - i * 2, -32 + i * 3, 4, 2); break;
    case 'mycelium':
      hatBlock(c, '#c4eed5', -4, -24, 9, 7); hatBlock(c, '#368984', -15, -31, 31, 8); hatBlock(c, '#72d8be', -12, -36, 25, 7); hatBlock(c, '#aff8d8', -6, -39, 13, 4);
      for (const px of [-11, -3, 6]) { hatBlock(c, '#e9ffc9', px, -31 + Math.abs(px) % 3, 4, 2); hatBlock(c, '#7decd5', px, -23, 1, 7); } break;
  }
  // Rare masks have large ornaments around the face, still visible under any hat.
  if (mask === 'verdant') for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { block(c, '#6baf62', side * (8 + i * 2) - 1, -16 + i * 4, 4, 5); block(c, '#d7ffa5', side * (8 + i * 2), -16 + i * 4, 1, 4); }
  if (mask === 'crystal') for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { block(c, '#9b99e9', side * (9 + i * 3) - 1, -20 + i * 4, 3, 9 - i); block(c, '#f0ffff', side * (9 + i * 3), -20 + i * 4, 1, 6); }
  if (mask === 'astral') { block(c, '#fce9a9', -8, -15, 5, 1); block(c, '#fce9a9', -6, -17, 1, 5); block(c, '#e9c8ff', 12, -9, 5, 1); block(c, '#e9c8ff', 14, -11, 1, 5); }
  if (mask === 'solar') for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { block(c, '#f9c858', side * (8 + i % 2 * 4) - 1, -22 + i * 5, 5, 2); block(c, '#fff2b4', side * (10 + i % 2 * 4), -22 + i * 5, 2, 1); }
  if (mask === 'abyss') for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { block(c, '#408d98', side * (8 + i * 3), -15 + i * 2, 2, 10); block(c, '#96fff0', side * (8 + i * 3) - 1, -7 + i * 2, 3, 2); }
  if (mask === 'storm') for (const side of [-1, 1]) { block(c, '#6c9ee7', side * 9, -19, 4, 9); block(c, '#eaffff', side * 12, -21, 2, 6); block(c, '#bcefff', side * 14, -15, 3, 2); }
  if (mask === 'obsidian') for (const side of [-1, 1]) { block(c, '#41364e', side * 9, -22, 4, 15); block(c, '#ff9c66', side * 10, -18, 1, 8); block(c, '#ffcd87', side * 11, -14, 2, 2); }
  if (mask === 'scarab') for (const side of [-1, 1]) { block(c, '#b28c50', side < 0 ? -13 : 9, -20, 5, 12); block(c, '#71dfbc', side < 0 ? -12 : 10, -18, 3, 8); block(c, '#ffdda0', side * 9, -25, 2, 7); }
  if (crown) { const top = equippedRares(mask, hat).length ? -52 : -40; block(c, '#f0cd73', -3, top + 3, 7, 2); for (const px of [-3, 0, 3]) block(c, '#f0cd73', px, top, 1, 3); }
  c.restore();
}

function brick(c: Context, x: number, y: number, w: number, h: number, light = false, theme = THEMES.ruins) {
  rect(c, light ? theme.stone : theme.brick, x, y, w, h);
  rect(c, light ? theme.edge : theme.stone, x, y, w, 1);
  rect(c, theme.shadow, x, y + h - 1, w, 1);
  rect(c, theme.shadow, x + w - 1, y + 1, 1, h - 1);
}

function vine(c: Context, x: number, y: number, length: number, phase = 0, theme = THEMES.ruins) {
  for (let i = 0; i < length; i += 3) {
    const dx = Math.round(Math.sin(i * 0.2 + phase) * 2);
    rect(c, theme.shadow, x + dx, y + i, 1, 4);
    if (i % 9 === 0) rect(c, i % 18 ? theme.moss : theme.edge, x + dx - 2, y + i, 4, 2);
  }
}

function biomeScenery(c: Context, biome: BiomeId, cameraY: number, time: number) {
  const drift = Math.round(cameraY * 0.25) % 130;
  if (biome === 'forest') {
    for (const x of [44, 250]) {
      rect(c, '#2e4d37', x, 0, 13, 200); rect(c, '#3c6040', x + 2, 0, 3, 200);
      for (let i = -1; i < 3; i++) {
        const y = i * 110 + drift;
        rect(c, '#385b39', x - 24, y, 71, 11); rect(c, '#466b3f', x - 15, y - 8, 51, 13);
        rect(c, '#567a45', x - 4, y - 13, 29, 9); vine(c, x + 20, y + 10, 49, i, THEMES.forest);
      }
    }
    for (let i = 0; i < 8; i++) { const x = 38 + i * 37, y = (i * 43 + drift) % 200; rect(c, '#678652', x, y, 6, 2); rect(c, '#35523b', x + 2, y + 2, 2, 7); }
  } else if (biome === 'caves') {
    for (let i = -1; i < 3; i++) for (const x of [36, 258]) {
      const y = i * 110 + drift;
      for (let layer = 0; layer < 6; layer++) rect(c, '#494463', x + layer * 2, y + layer * 5, 27 - layer * 4, 7);
      for (let shard = 0; shard < 3; shard++) {
        const top = y + 46 + shard * 6, cx = x + shard * 9;
        rect(c, '#796b9f', cx, top, 5, 27 - shard * 5); rect(c, '#b29cce', cx + 1, top - 3, 2, 16); rect(c, '#5b557f', cx + 5, top + 6, 3, 18);
      }
    }
  } else if (biome === 'frost') {
    for (let i = -1; i < 4; i++) {
      const y = i * 75 + drift;
      rect(c, '#426781', 24, y, 45, 4); rect(c, '#426781', 254, y + 30, 42, 4);
      for (const x of [30, 43, 58, 265, 282]) {
        const top = x > 200 ? y + 30 : y;
        rect(c, '#719baa', x, top, 5, 12 + x % 9); rect(c, '#a5d9dd', x + 1, top + 8, 3, 10); rect(c, '#d2f5ed', x + 2, top + 18, 1, 6);
      }
    }
    rect(c, '#33536b', 100, 18, 95, 2); rect(c, '#4a7185', 118, 21, 70, 1);
  } else if (biome === 'astral') {
    c.strokeStyle = '#665278'; c.lineWidth = 1;
    for (let i = -1; i < 3; i++) {
      const x = i % 2 ? 249 : 67, y = i * 120 + drift + 35;
      c.beginPath(); c.arc(x, y, 23, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x, y, 17, 0, Math.PI * 2); c.stroke();
      for (let j = 0; j < 4; j++) { const angle = j * Math.PI / 2; rect(c, '#c0a28f', x + Math.cos(angle) * 23 - 1, y + Math.sin(angle) * 23 - 1, 3, 3); }
    }
    for (let i = 0; i < 14; i++) { const x = 28 + i * 59 % 264, y = (i * 41 + drift) % 200; rect(c, '#c7aad1', x, y, 1, 3); rect(c, '#c7aad1', x - 1, y + 1, 3, 1); }
  }
}

function torch(c: Context, x: number, y: number, time: number) {
  const glow = c.createRadialGradient(x, y, 0, x, y, 23);
  glow.addColorStop(0, '#deb66d35'); glow.addColorStop(1, '#deb66d00'); c.fillStyle = glow; c.fillRect(x - 23, y - 23, 46, 46);
  rect(c, '#283e3a', x - 2, y + 2, 4, 7); rect(c, '#8c7651', x - 1, y + 1, 2, 6);
  rect(c, '#d59358', x - 2, y - 3, 4, 5); rect(c, '#efd28a', x - 1, y - 5 + Math.floor(time / 160) % 2, 2, 6);
}

export function drawPreview(c: Context, width: number, height: number, time: number) {
  c.clearRect(0, 0, width, height);
  const gradient = c.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#b4c8ae'); gradient.addColorStop(0.55, '#c6cfaf'); gradient.addColorStop(1, '#7f9b85');
  c.fillStyle = gradient; c.fillRect(0, 0, width, height);
  rect(c, '#ecedc8', 219, 28, 29, 29); rect(c, '#d8ddba', 213, 36, 40, 14);
  // Distant ruins and trees, at three depths.
  for (let i = 0; i < 12; i++) {
    const x = i * 31 - 12; const top = 134 + (i * 23 % 69);
    rect(c, '#93ae9a', x, top, 22, height - top); rect(c, '#93ae9a', x + 5, top - 12, 12, 16);
    rect(c, '#abc0a5', x + 7, top + 11, 3, 8);
  }
  for (let i = 0; i < 5; i++) {
    const x = (i * 83 + time * 0.0008) % 410 - 40; const y = 48 + i * 31;
    rect(c, '#e7e9c8', x, y, 34, 3); rect(c, '#e7e9c8', x + 8, y - 3, 17, 4);
  }
  // A cutaway through the shared tower.
  const left = 78, right = 246;
  rect(c, '#243c38', left + 17, -3, right - left - 17, height);
  for (let row = -1; row < height / 9; row++) for (let col = 0; col < 9; col++) {
    const x = left + 17 + col * 18 + (row % 2) * 9;
    rect(c, '#2b433e', x, row * 9, 16, 8);
  }
  // Large arched windows.
  for (const [x, y] of [[127, 32], [191, 114], [128, 210]] as const) {
    rect(c, '#657d6a', x - 3, y + 6, 26, 42); rect(c, '#657d6a', x + 1, y, 18, 9);
    rect(c, '#afc2a1', x + 1, y + 9, 18, 33); rect(c, '#afc2a1', x + 5, y + 4, 10, 7);
    rect(c, '#405b4e', x + 9, y + 5, 2, 38); rect(c, '#526b57', x, y + 27, 20, 2);
    rect(c, '#819779', x - 4, y + 42, 28, 3);
  }
  for (let row = -1; row < height / 10; row++) {
    brick(c, left, row * 10, 18, 10, true); brick(c, right, row * 10, 19, 10, true);
    brick(c, left - (row % 7 === 0 ? 4 : 0), row * 10, 5, 10);
    brick(c, right + 15, row * 10, 7, 10);
  }
  for (const [x, y, w] of [[94, 65, 76], [195, 106, 51], [117, 150, 60], [184, 194, 63], [95, 235, 69], [148, 280, 99]] as const) {
    for (let offset = 0; offset < w; offset += 14) brick(c, x + offset, y, Math.min(14, w - offset), 9, true);
    rect(c, '#a6b575', x, y - 2, w, 2);
    for (let i = 2; i < w; i += 11) rect(c, '#a6b575', x + i, y - 4, 2, 3);
    rect(c, '#354c42', x + 4, y + 9, w - 8, 3);
  }
  vine(c, 90, 6, 65); vine(c, 251, 2, 85); vine(c, 159, 150, 28); vine(c, 235, 195, 49); vine(c, 105, 238, 22); vine(c, 87, 113, 56);
  torch(c, 232, 62, time); torch(c, 108, 193, time + 200); torch(c, 231, 260, time + 50);
  drawSpikes(c, 210, 106, 28, 9);
  powerUpIcon(c, 'feather', 113, 211 + Math.sin(time / 650) * 2);
  powerUpIcon(c, 'bubble', 224, 147);
  mage(c, 139, 149, '#c6ed80', 0, 1, false, 'idle', 0, 'verdant', 'antlers', time);
  mage(c, 211, 192, BOT_COLOR, 1, -1, false, 'idle', 0, 'ivory', 'witch');
  mage(c, 140, 222 - Math.sin(time / 650) * 7, '#eab077', 0, 1, false, 'rise', 0, 'round-glasses', 'curls');
  // Camp at the foot of the illustration.
  rect(c, '#526d54', 67, height - 18, 217, 18); rect(c, '#98a46a', 65, height - 20, 219, 3);
  for (let i = 0; i < 24; i++) {
    const x = (i * 47 + 13) % width; const y = (i * 71 + time * 0.004) % height;
    rect(c, i % 3 ? '#e1dab48a' : '#f9eabc', x, y, 1, 1);
  }
  rect(c, '#f5e3b3', 294, 91, 1, 7); rect(c, '#f5e3b3', 291, 94, 7, 1);
}

export function powerUpIcon(c: Context, kind: PowerUpKind, x: number, y: number) {
  const color = POWER_UPS[kind].color;
  if (kind === 'feather') {
    for (let i = 0; i < 5; i++) { rect(c, color, x - 4 + i, y + 3 - i * 2, 5, 2); }
    for (let i = 0; i < 8; i++) rect(c, '#fff7d8', x - 3 + i, y + 5 - i, 1, 1);
  } else if (kind === 'boots') {
    rect(c, color, x - 5, y - 4, 4, 8); rect(c, color, x - 1, y + 1, 4, 3); rect(c, '#fff3bf', x - 4, y - 4, 3, 2);
    rect(c, '#fff3bf', x + 2, y - 7, 3, 3); rect(c, '#fff3bf', x + 1, y - 4, 3, 2);
  } else {
    c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
    rect(c, '#e5f7ff', x - 3, y - 4, 3, 1); rect(c, '#e5f7ff', x - 4, y - 3, 1, 2);
  }
}

function drawSpikes(c: Context, x: number, y: number, width: number, height: number) {
  rect(c, '#442a32', x - 1, y + 1, width + 2, 4);
  for (let left = x; left < x + width; left += 7) {
    rect(c, '#eb8c79', left, y - 2, 7, 2);
    rect(c, '#eb8c79', left + 1, y - 5, 5, 3);
    rect(c, '#ffe6c7', left + 2, y - height + 2, 3, height - 5);
    rect(c, '#fff6df', left + 3, y - height, 1, 3);
    rect(c, '#e98372', left, y + 1, 3, 2);
  }
}

export type PreviewMechanism = 'moving' | 'crumble' | 'spikes' | 'spring';
/** Decorative landing-page scenes; gameplay remains in the shared simulation. */
export function drawMechanismPreview(c: Context, kind: PreviewMechanism, biome: BiomeId, time: number) {
  const theme = THEMES[biome];
  rect(c, theme.sky, 0, 0, 320, 176);
  for (let row = 0; row < 14; row++) for (let col = 0; col < 19; col++) rect(c, theme.mortar, col * 18 + row % 2 * 9, row * 14, 17, 13);
  biomeScenery(c, biome, 0, time);
  for (let row = 0; row < 18; row++) { brick(c, 0, row * 10, 20, 10, false, theme); brick(c, 300, row * 10, 20, 10, false, theme); }
  const floor = (x: number, y: number, width: number, tint = theme.edge) => {
    for (let left = x; left < x + width; left += 13) brick(c, left, y, Math.min(13, x + width - left), 8, true, theme);
    rect(c, tint, x, y, width, 2); rect(c, theme.shadow, x + 5, y + 8, width - 10, 4);
  };
  floor(32, 150, 66, theme.moss); floor(234, 91, 66, theme.moss);
  vine(c, 40, 150, 20, 1, theme); vine(c, 288, 91, 36, 0, theme);
  torch(c, 28, 80, time); torch(c, 290, 128, time);
  if (kind === 'moving') {
    const x = 110 + Math.sin(time / 950) * 32;
    rect(c, '#456c79', 78, 145, 140, 2); rect(c, '#b0dce7', 78, 141, 2, 9); rect(c, '#b0dce7', 216, 141, 2, 9);
    floor(x, 128, 76, '#8bdce8'); rect(c, '#386273', x + 2, 131, 72, 3);
    for (const wheel of [x + 8, x + 60]) { rect(c, '#8bdce8', wheel, 138, 7, 7); rect(c, '#386273', wheel + 2, 140, 3, 3); }
    mage(c, x + 38, 128, '#c6ed80', Math.floor(time / 340), 1);
  } else if (kind === 'crumble') {
    const phase = time % 7400, broken = phase >= 1200 && phase < 6200;
    if (!broken) {
      floor(120, 127, 70, '#ffba77');
      for (let i = 0; i < 4; i++) { rect(c, '#493b37', 127 + i * 16, 129, 2, 3); rect(c, '#493b37', 125 + i * 16, 132, 3, 2); }
      rect(c, '#473c36', 120, 122, 70, 2); rect(c, '#ffd497', 120, 122, 70 * (1 - Math.min(1, phase / 1200)), 2);
      mage(c, 154, 127, '#eab077', 0, 1);
    } else {
      for (let x = 120; x < 190; x += 7) rect(c, '#b68a6888', x, 127, 4, 1);
      const fall = (phase - 1200) / 80;
      if (fall < 12) { for (let i = 0; i < 5; i++) rect(c, '#a9856b', 122 + i * 14, 130 + fall * fall, 5, 4); mage(c, 154, 127 + fall * fall, '#eab077', 0, 1, false, 'fall'); }
    }
  } else if (kind === 'spikes') {
    floor(137, 137, 46, '#e98372'); drawSpikes(c, 146, 137, 28, 9);
    const phase = (time % 2400) / 2400, jump = Math.min(1, phase / .8);
    mage(c, 65 + jump * 195, 150 - jump * 59 - Math.sin(jump * Math.PI) * 72, '#bc9bea', 0, 1, false, jump < .5 ? 'rise' : jump < 1 ? 'fall' : 'idle', 0, 'owl', 'feather-cap');
  } else {
    floor(120, 140, 72, '#e5a8dc');
    for (const x of [128, 177]) for (let i = 0; i < 4; i++) rect(c, '#d4afd7', x + i % 2 * 2, 144 + i * 2, 6, 1);
    rect(c, '#f7d2ea', 154, 132, 3, 6); rect(c, '#f7d2ea', 151, 134, 9, 1);
    const phase = (time % 1400) / 1400, y = 140 - Math.sin(phase * Math.PI) * 78;
    mage(c, 156, y, '#eab077', 0, 1, false, phase < .5 ? 'rise' : 'fall', 0, 'moustache', 'beret');
    if (phase < .35) for (const x of [150, 155, 160]) rect(c, '#e8b5e5', x, y + 9, 2, 5);
  }
}

export function drawGame(c: Context, chunks: Chunk[], players: NetworkPlayer[], localId: string, cameraY: number, time: number, debug: boolean, frontRunnerId: string | null, pickups: Pickup[] = [], effects: VisualEffect[] = [], motion: Map<string, MotionStamp> = new Map(), reducedMotion = false, relics: Relic[] = [], bridges: Platform[] = [], projectedPlatforms?: Platform[], mechanismTick = 0) {
  const annotations: WorldAnnotations = { labels: [], obstacles: [] };
  const { labels, obstacles } = annotations;
  const width = 320, height = 200;
  const ambientTime = reducedMotion ? 0 : time;
  const screenY = (y: number) => Math.round(height - 42 - (y - cameraY));
  const biome = biomeAtChunk(Math.floor((players.find(p => p.id === localId)?.y ?? cameraY) / CHUNK_HEIGHT));
  const theme = THEMES[biome.id];
  rect(c, theme.sky, 0, 0, width, height);
  // Slow parallax masonry and silhouettes through the windows.
  const offset = Math.round(cameraY * 0.18) % 14;
  for (let row = -1; row < 16; row++) for (let col = 0; col < 19; col++) rect(c, theme.mortar, col * 18 + row % 2 * 9, row * 14 + offset, 17, 13);
  if (biome.id === 'ruins') for (let i = -1; i < 4; i++) {
    const y = i * 110 + (cameraY * 0.35 % 110); const x = i % 2 === 0 ? 74 : 223;
    rect(c, '#354f49', x - 3, y + 5, 31, 55); rect(c, '#354f49', x + 3, y, 19, 8);
    rect(c, '#638677', x + 1, y + 9, 23, 45); rect(c, '#638677', x + 5, y + 4, 15, 8);
    rect(c, '#88a48a', x + 4, y + 13, 16, 18); rect(c, '#45675e', x + 1, y + 42, 23, 12);
    rect(c, '#293f3b', x + 11, y + 5, 3, 52); rect(c, '#3d5750', x - 5, y + 55, 35, 4);
  }
  c.save(); c.globalAlpha = 0.5; biomeScenery(c, biome.id, cameraY, ambientTime); c.restore();
  const platformGroups = chunks.map(chunk => {
    const ids = new Set(chunk.platforms.map(p => p.id));
    const rendered = projectedPlatforms?.filter(p => ids.has(p.id) || p.id === chunk.cooperation?.bridge.id) ?? [...chunk.platforms, ...bridges.filter(p => p.id === chunk.cooperation?.bridge.id)];
    return { chunk, stoneTheme: THEMES[chunk.biome], rendered };
  });
  // Paint ALL supports first: a higher pillar must never hide the usable ledge below it.
  c.save(); c.globalAlpha = 0.6;
  for (const { chunk, stoneTheme, rendered } of platformGroups) for (const p of rendered) {
    const y = screenY(p.y); if (p.disabled || y < -85 || y > height + 50) continue;
    // Architectural supports are dark scenery; the bright top is the collision surface.
    if (p.mechanism === 'moving') {
      const source = chunk.platforms.find(source => source.id === p.id)!;
      const mechanism = chunk.mechanisms.find(m => m.platformId === p.id)!;
      const amplitude = mechanism.kind === 'moving' ? mechanism.amplitude : 0;
      rect(c, '#37586a', source.x - amplitude, y + 12, p.w + amplitude * 2, 2);
      for (const x of [source.x - amplitude, source.x + p.w + amplitude]) rect(c, '#82becb', x, y + 9, 2, 8);
      for (const x of [p.x + 6, p.x + p.w - 10]) { rect(c, '#28464f', x, y + 6, 6, 8); rect(c, '#99d4df', x + 1, y + 8, 4, 4); rect(c, '#456874', x + 2, y + 9, 2, 2); }
    } else if (p.style === 'pillar') {
      const x = Math.round(p.x + p.w / 2);
      rect(c, stoneTheme.shadow, x - 7, y + 9, 14, 48); rect(c, stoneTheme.brick, x - 6, y + 10, 3, 45);
      rect(c, stoneTheme.brick, x - 9, y + 10, 18, 3); rect(c, stoneTheme.mortar, x - 8, y + 54, 16, 4);
      for (let offset = 22; offset < 52; offset += 12) rect(c, stoneTheme.mortar, x - 6, y + offset, 12, 1);
    } else if (p.style === 'hanging') {
      for (const x of [p.x + 5, p.x + p.w - 6]) for (let offset = 5; offset < 44; offset += 5) {
        rect(c, '#536457', x, y - offset, 2, 3); rect(c, '#293f39', x, y - offset + 1, 1, 1);
      }
    } else if (p.style === 'balcony') {
      const wall = p.x + p.w / 2 < 160 ? 20 : 300;
      for (let offset = 8; offset < 25; offset += 4) {
        const inset = (offset - 8) * 0.9;
        const left = wall === 20 ? p.x + inset : p.x + inset / 2;
        rect(c, stoneTheme.shadow, left, y + offset, Math.max(5, p.w - inset * 1.5), 3);
      }
    }
  }
  c.restore();
  for (const { chunk, stoneTheme, rendered } of platformGroups) {
    for (const p of rendered) {
      const y = screenY(p.y); if (y < -85 || y > height + 50) continue;
      if (p.disabled) {
        // Broken end markers leave an unmistakable hole instead of a ghost floor.
        for (const x of [p.x, p.x + p.w - 2]) { rect(c, '#a9856b', x, y + 2, 2, 4); rect(c, '#d5af87', x, y + 5, 2, 1); }
        const fall = Math.max(0, mechanismTick - (p.breakTick ?? 0));
        if (!reducedMotion && fall < 24) for (let i = 0; i < 5; i++) rect(c, '#a9856b', p.x + i * p.w / 5 + Math.sin(i) * fall / 4, y + fall * fall / 18, 4, 3);
        labels.push({ id: `platform:${p.id}`, kind: 'warning', text: `Dalle absente · ${Math.max(1, Math.ceil(((p.restoreTick ?? 0) - mechanismTick) / 30))} s`, x: p.x + p.w / 2, y: y - 5, color: '#ffd497', priority: 3 });
        continue;
      }
      obstacles.push({ x: p.x, y, w: p.w, h: p.h });
      // Opaque outlined decks are always painted in front of decorative supports.
      rect(c, '#102326', p.x - 1, y - 1, p.w + 2, p.h + 2);
      for (let x = p.x; x < p.x + p.w; x += 13) brick(c, x, y, Math.min(13, p.x + p.w - x), p.h, true, stoneTheme);
      if (p.style === 'beam') {
        rect(c, '#8f8762', p.x, y, p.w, 3); rect(c, '#524e3d', p.x, y + 4, p.w, 2);
        for (let x = p.x + 6; x < p.x + p.w; x += 17) rect(c, '#d3bd7c', x, y + 2, 2, 2);
      }
      rect(c, p.kind === 'camp' ? '#c6b97f' : p.kind === 'moss' ? stoneTheme.moss : stoneTheme.edge, p.x, y, p.w, 2);
      if (p.style === 'rune') {
        rect(c, '#ecc775', p.x, y, p.w, 2); rect(c, '#786546', p.x + 2, y + 3, p.w - 4, 2);
        const center = p.x + p.w / 2;
        rect(c, '#efd69e', center - 1, y + 7, 3, 1); rect(c, '#a18456', center, y + 8, 1, 2);
      }
      rect(c, '#102326', p.x + 3, y + p.h, p.w - 6, 2);
      if (p.mechanism === 'moving') {
        rect(c, '#8bdce8', p.x, y, p.w, 2); rect(c, '#386273', p.x + 2, y + 3, p.w - 4, 3);
        const center = p.x + p.w / 2;
        rect(c, '#c7f5f2', center - 7, y + 4, 15, 1); rect(c, '#c7f5f2', center - 7, y + 3, 2, 3); rect(c, '#c7f5f2', center + 6, y + 3, 2, 3);
      }
      if (p.mechanism === 'crumble') {
        const warning = p.breakTick !== undefined;
        const remaining = warning ? Math.max(0, Math.min(1, (p.breakTick! - mechanismTick) / CRUMBLE_WARNING_TICKS)) : 1;
        rect(c, warning ? '#ffba77' : '#d3a273', p.x, y, p.w, 2);
        for (let i = 0; i < 3; i++) { const x = p.x + 6 + i * (p.w - 12) / 3; rect(c, '#493b37', x, y + 2, 2, 3); rect(c, '#493b37', x - 2, y + 5, 3, 2); }
        if (warning) {
          rect(c, '#473c36', p.x, y - 4, p.w, 2); rect(c, '#ffd497', p.x, y - 4, p.w * remaining, 2);
          labels.push({ id: `platform:${p.id}`, kind: 'warning', text: 'Ça craque !', x: p.x + p.w / 2, y: y + 25, color: '#ffd497', priority: 0 });
          if (!reducedMotion) for (let i = 0; i < 3; i++) rect(c, '#cba079', p.x + 4 + i * p.w / 3, y + p.h + 4 + (mechanismTick + i * 7) % 14, 2, 2);
        }
      }
      if (p.mechanism === 'spring') {
        rect(c, '#41334c', p.x - 1, y - 1, p.w + 2, 4); rect(c, '#e5a8dc', p.x, y, p.w, 2);
        for (const x of [p.x + 5, p.x + p.w - 11]) for (let i = 0; i < 4; i++) rect(c, '#a78bb6', x + i % 2 * 2, y + 4 + i * 2, 5, 1);
        rect(c, '#f7d2ea', p.x + p.w / 2 - 1, y - 7, 3, 5); rect(c, '#f7d2ea', p.x + p.w / 2 - 3, y - 5, 7, 1);
        rect(c, '#795f8a', p.x + 2, y + 13, p.w - 4, 2);
      }
      if (p.kind === 'moss') { vine(c, p.x + 9, y + 2, 13, chunk.index, stoneTheme); vine(c, p.x + p.w - 10, y + 3, 20, 0, stoneTheme); }
      if (p.kind === 'camp') {
        const x = p.x + p.w - 18;
        rect(c, '#31413c', x - 5, y - 2, 12, 2); rect(c, '#886643', x - 4, y - 4, 9, 2);
        torch(c, x, y - 8, ambientTime);
        rect(c, '#596d59', p.x + 13, y - 27, 2, 27); rect(c, '#c6ed80', p.x + 15, y - 27, 13, 8); rect(c, '#b0cf6e', p.x + 15, y - 19, 8, 3);
      }
    }
    if (chunk.cooperation) {
      const gap = chunk.cooperation, y = screenY(gap.y), open = bridges.some(p => p.id === gap.bridge.id);
      rect(c, '#a7e5cc', gap.x - 13, y - 1, 26, 2);
      labels.push({ id: `coop:${chunk.index}`, kind: 'coop', text: open ? 'Rejoignez-vous' : 'À deux !', x: gap.x, y: y - 44, color: '#bcebd8', priority: 8 });
      // A two-person sign and arrow identify the shoulder position.
      for (const x of [gap.x - 5, gap.x + 3]) { rect(c, '#a7e5cc', x, y - 38, 3, 3); rect(c, '#709d91', x - 1, y - 34, 5, 5); }
      rect(c, '#bcebd8', gap.x - 1, y - 26, 2, 6); rect(c, '#bcebd8', gap.x - 3, y - 24, 6, 2);
      const landing = chunk.platforms.find(p => p.id === gap.landingId)!;
      const reelX = landing.x + landing.w / 2, reelY = screenY(landing.y);
      rect(c, '#344d47', reelX - 6, reelY + 8, 12, 10); rect(c, '#a4c8ac', reelX - 4, reelY + 10, 8, 2);
      if (open) { c.strokeStyle = '#a4c8ac'; c.beginPath(); c.moveTo(reelX, reelY + 12); c.lineTo(gap.bridge.x + gap.bridge.w / 2, screenY(gap.bridge.y)); c.stroke(); }
    }
    for (const [slot, hazard] of chunk.hazards.entries()) {
      const y = screenY(hazard.y);
      if (y < -20 || y - hazard.h > height + 20) continue;
      // Ivory teeth on a red hazard stripe: silhouette and contrast both signal
      // danger. The visible tips/base match the server's vertical collision bounds.
      drawSpikes(c, hazard.x, y, hazard.w, hazard.h);
      obstacles.push({ x: hazard.x - 1, y: y - hazard.h, w: hazard.w + 2, h: hazard.h + 4 });
      labels.push({ id: `spikes:${chunk.index}:${slot}`, kind: 'warning', text: '⚠ Pics !', x: hazard.x + hazard.w / 2, y: y - hazard.h - 5, color: '#ffb9a6', priority: 4 });
    }
    if (debug) {
      c.strokeStyle = '#c6ed8077'; c.strokeRect(20, screenY(chunk.exit.y), 280, 216);
      labels.push({ id: `debug:${chunk.index}`, kind: 'debug', text: `${chunk.index} ${chunk.id} seed:${chunk.seed}`, x: 90, y: screenY(chunk.entry.y) - 5, color: '#c6ed80', priority: 90 });
      for (const p of rendered) if (!p.disabled) { c.strokeStyle = '#f28080'; c.strokeRect(p.x, screenY(p.y), p.w, p.h); }
    }
  }
  for (const pickup of pickups) {
    const y = screenY(pickup.y) + (reducedMotion ? 0 : Math.sin(time / 360 + pickup.x) * 2);
    if (y < -20 || y > height + 20) continue;
    const color = POWER_UPS[pickup.kind].color;
    const glow = c.createRadialGradient(pickup.x, y, 1, pickup.x, y, 19);
    glow.addColorStop(0, `${color}60`); glow.addColorStop(1, `${color}00`); c.fillStyle = glow; c.fillRect(pickup.x - 19, y - 19, 38, 38);
    powerUpIcon(c, pickup.kind, pickup.x, y);
    obstacles.push({ x: pickup.x - 7, y: y - 7, w: 14, h: 14 });
    const local = players.find(p => p.id === localId);
    if (local && Math.abs(local.y - pickup.y) < 120) {
      labels.push({ id: `pickup:${pickup.id}`, kind: 'pickup', text: POWER_UPS[pickup.kind].name, x: pickup.x, y: y - 11, color, priority: 15 });
    }
  }
  for (const relic of relics) {
    const y = screenY(relic.y) + (reducedMotion ? 0 : Math.sin(time / 480) * 2);
    if (y < -30 || y > height + 20) continue;
    const rare = RARE_COSMETICS.find(c => c.id === relic.cosmeticId)!;
    const glow = c.createRadialGradient(relic.x, y, 1, relic.x, y, 22); glow.addColorStop(0, `${rare.tint}66`); glow.addColorStop(1, `${rare.tint}00`); c.fillStyle = glow; c.fillRect(relic.x - 22, y - 22, 44, 44);
    rect(c, '#231e34', relic.x - 7, y - 7, 14, 13); rect(c, '#d4af6e', relic.x - 6, y - 6, 12, 11); rect(c, '#63527b', relic.x - 5, y - 3, 10, 7);
    rect(c, rare.tint, relic.x - 1, y - 7, 3, 14); rect(c, '#f5e3ac', relic.x - 2, y - 2, 5, 3);
    obstacles.push({ x: relic.x - 8, y: y - 8, w: 16, h: 16 });
    labels.push({ id: `relic:${relic.id}`, kind: 'rare', text: '◆ Relique rare', x: relic.x, y: y - 13, color: '#ffe2a2', priority: 5 });
  }
  for (let row = -1; row < 23; row++) {
    const y = row * 10 + Math.round(cameraY) % 10;
    brick(c, 0, y, 20, 10, false, theme); brick(c, 300, y, 20, 10, false, theme);
    rect(c, theme.edge, 18, y, 2, 10); rect(c, theme.edge, 300, y, 2, 10);
  }
  const torchOffset = Math.round(cameraY) % 120;
  for (let i = -1; i < 3; i++) { torch(c, 28, i * 120 + torchOffset + 50, ambientTime); torch(c, 292, i * 120 + torchOffset + 10, ambientTime + 200); }
  const local = players.find(p => p.id === localId);
  for (const p of players) {
    const y = screenY(p.y); if (y < -30 || y > height + 60) continue;
    const rares = equippedRares(p.mask, p.hat, p.shoes), rare = rares[0], ornateHead = rares.some(r => r.slot !== 'shoes');
    if (p.protection > 0) { c.strokeStyle = '#c6ed8066'; c.strokeRect(Math.round(p.x) - 8, y - 24, 17, 28); }
    const swing = [...effects].reverse().find(e => e.data.kind === 'push' && e.data.actorId === p.id && time >= e.at && time - e.at < 350);
    const landed = time - (motion.get(p.id)?.landedAt ?? -1000);
    const pose = p.stun > 0 ? 'hurt' : swing ? 'push' : !p.grounded ? p.vy > 0 ? 'rise' : 'fall' : landed < 150 ? 'land' : Math.abs(p.vx) > 10 ? 'run' : 'idle';
    const amount = swing ? Math.sin(Math.PI * Math.min(1, (time - swing.at) / 350)) : Math.max(0, 1 - landed / 150);
    if (p.bubble) { c.fillStyle = '#a5d9f511'; c.strokeStyle = '#a5d9f5bb'; c.beginPath(); c.ellipse(p.x, y - 11, 16, 20, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (p.feather > 0) { rect(c, '#b9efcf', p.x - 10, y - 6, 3, 1); rect(c, '#b9efcf', p.x + 8, y - 9, 3, 1); }
    if (p.boots) { rect(c, '#f2c879', p.x - 5, y + 2, 11, 2); }
    if (p.spring > 0) {
      for (const offset of [-5, 0, 5]) rect(c, '#e8b5e5', p.x + offset, y + 5 + Math.abs(offset), 2, 4);
      if (p.spring > 0.3) labels.push({ id: `spring:${p.id}`, kind: 'effect', text: 'Boïng !', x: p.x, y: y + 24, color: '#f6cee9', priority: 1 });
    }
    if (local && local.stun <= 0 && local.pushCooldown <= 0 && local.protection <= 0 && !inSafeCamp(local) && canPushTarget(local, p)) {
      c.strokeStyle = '#f2c879'; c.strokeRect(Math.round(p.x) - 10, y - 26, 23, 31);
      labels.push({ id: `range:${p.id}`, kind: 'warning', text: 'À portée', x: p.x, y: y + 18, color: '#f2c879', priority: 12 });
    }
    mage(c, p.x, y, p.color, reducedMotion ? 0 : Math.floor(time / (pose === 'run' ? 85 : 340)), p.facing, p.id === frontRunnerId && players.length > 1, reducedMotion && (pose === 'idle' || pose === 'land') ? 'idle' : pose, reducedMotion && pose === 'land' ? 0 : amount, p.mask, p.hat, reducedMotion ? 0 : time, p);
    if (p.stun > 0) for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + (reducedMotion ? 0 : time / 95);
      const sx = p.x + Math.cos(angle) * 12, sy = y - 33 + Math.sin(angle) * 3;
      rect(c, '#ffe4a0', sx - 2, sy, 5, 1); rect(c, '#ffe4a0', sx, sy - 2, 1, 5);
    }
    if (p.id === localId) { const markerY = y - (ornateHead ? 47 : 37); rect(c, p.color, p.x - 1, markerY, 3, 2); rect(c, p.color, p.x, markerY + 2, 1, 1); }
    // A permanent diamond remains visible even when crowded names are suppressed.
    if (rare) { rect(c, '#322940', p.x + 13, y - 6, 7, 7); rect(c, '#ffe2a2', p.x + 16, y - 6, 1, 7); rect(c, '#ffe2a2', p.x + 14, y - 4, 5, 3); rect(c, rare.tint, p.x + 15, y - 4, 3, 3); }
    const headTop = ornateHead ? 41 : p.hat === 'flower-pot' ? 37 : p.hat === 'chef' ? 36 : 32;
    const crownTop = p.id === frontRunnerId && players.length > 1 ? ornateHead ? 53 : 41 : 0;
    obstacles.push({ x: p.x - (rare ? 18 : 10), y: y - headTop, w: rare ? 36 : 20, h: headTop + 3 });
    if (crownTop) obstacles.push({ x: p.x - 4, y: y - crownTop, w: 9, h: 7 });
    if (rares.some(r => r.slot === 'shoes')) obstacles.push({ x: p.x - 17, y: y - 8, w: 34, h: 12 });
    if (p.id !== localId) labels.push({
      id: `player:${p.id}`, kind: rare ? 'rare' : p.isBot ? 'bot' : 'player',
      text: `${p.displayName}${rare ? ' · ◆ RARE' : p.helping ? ' · AIDE' : p.isBot ? ' · BOT' : ''}`,
      x: p.x, y: y - Math.max(headTop, crownTop) - 6,
      color: rare ? '#ffe2a2' : p.isBot ? '#b9ccd7' : p.color,
      priority: (p.isBot ? 20 : 10) + Math.min(1, Math.abs(p.y - (local?.y ?? cameraY)) / 1000),
    });
    if (debug) { c.strokeStyle = '#f0ce71'; c.strokeRect(p.x - 5, y - 15, 10, 15); }
  }
  for (const effect of effects) {
    const age = time - effect.at; if (age < 0 || age > 600) continue;
    const data = effect.data, y = screenY(data.y), fade = Math.max(0, 1 - age / 600);
    c.save(); c.globalAlpha = fade;
    if (data.kind === 'push') {
      const progress = Math.min(1, age / 280), x = data.x + data.facing * (12 + progress * 14);
      c.strokeStyle = data.hits.length ? '#ffe0a1' : '#c6d3c0'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y - 9, 8 + progress * 5, data.facing === 1 ? -1 : Math.PI - 1, data.facing === 1 ? 1 : Math.PI + 1); c.stroke();
      for (const hit of data.hits) {
        const hy = screenY(hit.y) - 10, color = hit.blocked ? '#a5d9f5' : '#ffe0a1';
        if (reducedMotion) { c.strokeStyle = color; c.strokeRect(hit.x - 9, hy - 9, 18, 18); }
        else for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4, radius = 5 + age / 22;
          rect(c, color, hit.x + Math.cos(angle) * radius, hy + Math.sin(angle) * radius, i % 2 ? 2 : 3, i % 2 ? 2 : 3);
        }
        labels.push({ id: `hit:${data.id}:${hit.id}`, kind: 'effect', text: hit.blocked ? 'Bulle !' : 'Pouf !', x: hit.x, y: hy - 19 - (reducedMotion ? 0 : age / 55), color, priority: 1 });
      }
    } else if (!reducedMotion) {
      const color = data.kind === 'pickup' ? POWER_UPS[data.powerUp].color : data.kind === 'unlock' ? '#ffe4ab' : '#b9c79d';
      for (let i = 0; i < (data.kind === 'land' ? 4 : 10); i++) {
        const angle = data.kind === 'land' ? Math.PI + i * Math.PI / 3 : i * Math.PI / 5;
        rect(c, color, data.x + Math.cos(angle) * (3 + age / 28), y + Math.sin(angle) * (3 + age / 45), 2, 2);
      }
    }
    c.restore();
  }
  for (let i = 0; i < 14; i++) rect(c, theme.detail, (i * 67 + 9) % 280 + 20, (i * 37 + ambientTime * (biome.id === 'frost' ? 0.016 : 0.005) + cameraY * 0.4) % 200, biome.id === 'frost' ? 2 : 1, 1);
  const shadow = c.createLinearGradient(0, 0, 0, height); shadow.addColorStop(0, '#101f2740'); shadow.addColorStop(0.7, '#101f2700'); shadow.addColorStop(1, '#101f2750'); c.fillStyle = shadow; c.fillRect(20, 0, 280, height);
  return annotations;
}
