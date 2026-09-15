import { placeLabels, projectScreenPoint, type Point, type WorldAnnotations } from './label-layout';

interface LabelNode { label: HTMLSpanElement; line: HTMLSpanElement; }

/** Native text above the low-resolution canvas and CRT filter. No React updates per frame. */
export class WorldLabels {
  private readonly root = document.createElement('div');
  private readonly nodes = new Map<string, LabelNode>();
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  private readonly widths = new Map<string, number>();
  private readonly observer: ResizeObserver;
  private width = 0;
  private height = 0;

  constructor(private parent: HTMLElement, private canvas: HTMLCanvasElement) {
    this.root.className = 'world-labels';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Noms et indications dans la tour');
    parent.append(this.root);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(parent); this.observer.observe(canvas);
    this.resize();
    void document.fonts.ready.then(() => this.widths.clear());
  }

  private resize() {
    const bounds = this.canvas.getBoundingClientRect(), parent = this.parent.getBoundingClientRect();
    this.width = bounds.width; this.height = bounds.height;
    Object.assign(this.root.style, {
      left: `${bounds.left - parent.left}px`, top: `${bounds.top - parent.top}px`,
      width: `${this.width}px`, height: `${this.height}px`,
      fontSize: this.width < 520 ? '12px' : '14px', lineHeight: this.width < 520 ? '16px' : '18px',
    });
    this.measure.font = `600 ${this.width < 520 ? 12 : 14}px "DM Sans Variable", sans-serif`;
    this.widths.clear();
  }

  update(annotations: WorldAnnotations, curved: boolean) {
    if (!this.width || !this.height) return;
    this.root.dataset.curved = String(curved);
    const project = (point: Point) => {
      const p = projectScreenPoint(point, curved);
      return { x: p.x * this.width / 320, y: p.y * this.height / 200 };
    };
    const labels = annotations.labels.map(label => {
      let w = this.widths.get(label.text);
      if (w === undefined) {
        w = Math.min(this.width < 520 ? 174 : 220, Math.ceil(this.measure.measureText(label.text).width) + 18);
        if (this.widths.size > 256) this.widths.clear();
        this.widths.set(label.text, w);
      }
      return { ...label, ...project(label), w, h: this.width < 520 ? 24 : 26 };
    });
    const obstacles = annotations.obstacles.map(rect => {
      const points = [project(rect), project({ x: rect.x + rect.w, y: rect.y }), project({ x: rect.x, y: rect.y + rect.h }), project({ x: rect.x + rect.w, y: rect.y + rect.h })];
      const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
      return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
    });
    const bounds = this.canvas.getBoundingClientRect();
    for (const element of this.parent.closest('.game-frame')?.querySelectorAll('.hud-obstacle') ?? []) {
      const rect = element.getBoundingClientRect();
      obstacles.push({ x: rect.left - bounds.left, y: rect.top - bounds.top, w: rect.width, h: rect.height });
    }
    const placed = placeLabels(labels, this.width, this.height, obstacles), active = new Set<string>();
    for (const item of placed) {
      active.add(item.id);
      let node = this.nodes.get(item.id);
      if (!node) {
        const label = document.createElement('span'), line = document.createElement('span');
        label.className = 'world-label'; label.dataset.id = item.id;
        line.className = 'world-label-line'; line.setAttribute('aria-hidden', 'true');
        node = { label, line }; this.nodes.set(item.id, node); this.root.append(line, label);
      }
      const { label, line } = node;
      if (label.textContent !== item.text) label.textContent = item.text;
      label.dataset.kind = item.kind; label.title = item.text;
      label.style.setProperty('--label-accent', item.color);
      label.style.width = `${item.w}px`;
      label.style.transform = `translate(${item.left}px, ${item.top}px)`;
      const x = Math.max(item.left + 8, Math.min(item.left + item.w - 8, item.x)), y = item.top + item.h;
      const dx = item.x - x, dy = item.y - y, distance = Math.hypot(dx, dy);
      line.hidden = distance < 5;
      line.style.width = `${distance}px`;
      line.style.transform = `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
    }
    for (const [id, node] of this.nodes) if (!active.has(id)) {
      node.label.remove(); node.line.remove(); this.nodes.delete(id);
    }
  }

  destroy() { this.observer.disconnect(); this.nodes.clear(); this.root.remove(); }
}
