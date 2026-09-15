import { useEffect, useRef } from 'react';
import { drawPreview, drawMechanismPreview, drawShoePreview, mage, type PreviewMechanism } from '../game/art';
import { BIOMES, type BiomeId, type MaskId, type HatId, type CostumeDetails } from '@tower/shared';

export function Preview({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, c = canvas?.getContext('2d'); if (!canvas || !c) return;
    let frame = 0, visible = false;
    const render = (time: number) => { drawPreview(c, 320, 326, reducedMotion ? 0 : time); if (visible && !reducedMotion) frame = requestAnimationFrame(render); };
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); cancelAnimationFrame(frame); if (visible) render(performance.now()); });
    render(0); observer.observe(canvas);
    return () => { visible = false; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [reducedMotion]);
  return <canvas ref={ref} width={320} height={326} className="tower-illustration" role="img" aria-label="Des mages aux styles variés, dont un compagnon noir, un mage à lunettes et un mage aux bois rares, gravissent une tour avec des bonus et une corniche à pics." />;
}
export function MechanismPreview({ kind, biome, reducedMotion }: { kind: PreviewMechanism; biome: BiomeId; reducedMotion: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, c = canvas?.getContext('2d'); if (!canvas || !c) return;
    let frame = 0, visible = false, start = performance.now();
    const render = (now: number) => {
      drawMechanismPreview(c, kind, biome, reducedMotion ? 500 : now - start);
      if (visible && !reducedMotion) frame = requestAnimationFrame(render);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting); cancelAnimationFrame(frame);
      if (visible) { start = performance.now(); render(start); }
    });
    render(start); observer.observe(canvas);
    return () => { visible = false; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [kind, biome, reducedMotion]);
  const label = { moving: 'Une navette bleue transporte un mage', crumble: 'Une dalle fissurée se brise puis se reforme', spikes: 'Un mage saute au-dessus de pointes sur une corniche rouge', spring: 'Un tremplin rose propulse un mage' }[kind];
  return <canvas ref={ref} width={320} height={176} className="mechanism-illustration" data-biome={biome} data-obstacle={kind} role="img" aria-label={`${label}. Décor : ${BIOMES.find(item => item.id === biome)!.name}.`}/>;
}
export function MageAvatar({ color, size = 40, mask = 'ivory', hat = 'top-hat', shoes, shoeColor, hatColor, detail = 'full' }: { color: string; size?: number; mask?: MaskId; hat?: HatId; detail?: 'full' | 'shoes' } & Partial<CostumeDetails>) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = detail === 'shoes' ? 36 : 44, height = detail === 'shoes' ? 16 : 48;
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (c) {
      c.clearRect(0, 0, width, height);
      if (detail === 'shoes') drawShoePreview(c, 17, 10, shoes, shoeColor);
      else mage(c, 21, 44, color, 0, 1, false, 'idle', 0, mask, hat, 0, { shoes, shoeColor, hatColor });
    }
  }, [color, mask, hat, shoes, shoeColor, hatColor, detail, width, height]);
  return <canvas ref={ref} width={width} height={height} style={{ width: size, height: size * height / width, imageRendering: 'pixelated' }} aria-hidden="true" />;
}
