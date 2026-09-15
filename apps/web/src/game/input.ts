import { neutralInput, type PlayerInput } from '@tower/shared';

export interface Settings { sound: number; music: number; reducedMotion: boolean; crt: boolean; curvedScreen: boolean; screenDefaultsVersion: number; bindings: { left: string; right: string; jump: string; push: string }; }
export const DEFAULT_SETTINGS: Settings = { sound: 45, music: 0, reducedMotion: false, crt: true, curvedScreen: true, screenDefaultsVersion: 1, bindings: { left: 'KeyA', right: 'KeyD', jump: 'Space', push: 'KeyE' } };
export function mergeSettings(saved: Partial<Settings>, current = DEFAULT_SETTINGS): Settings {
  const visual = saved.screenDefaultsVersion === 1 ? {} : { crt: true, curvedScreen: true };
  // Retain the legacy API field, but never restore a saved music volume.
  return { ...current, ...saved, ...visual, music: 0, screenDefaultsVersion: 1, bindings: { ...current.bindings, ...saved.bindings } };
}
export function loadSettings(): Settings {
  try { const saved = JSON.parse(localStorage.getItem('tower.settings') ?? '{}') as Partial<Settings>; return mergeSettings(saved); }
  catch { return structuredClone(DEFAULT_SETTINGS); }
}
export class InputController {
  private keys = new Set<string>(); private pointers = new Set<string>(); private lastMenu = false;
  private queuedJump = false; private queuedPush = false;
  private blockedPadButtons = new Set<number>();
  private blockedPadAxes = false;
  gamepadConnected = false; enabled = true;
  constructor(public settings: Settings, private onMenu: () => void) {
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clear); document.addEventListener('visibilitychange', this.clear);
    window.addEventListener('gamepadui', this.consumePad);
    this.consumePad(); // A button held while confirming the start screen must be released before playing.
  }
  private consumePad = () => {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
    pad?.buttons.forEach((button, index) => { if (button.pressed) this.blockedPadButtons.add(index); });
    if (pad?.axes.some(axis => Math.abs(axis) > 0.2)) this.blockedPadAxes = true;
    this.lastMenu = Boolean(pad?.buttons[9]?.pressed);
  };
  private keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement)?.closest('input, textarea, select, button')) return;
    if (!this.enabled) return;
    if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.onMenu(); return; }
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ...Object.values(this.settings.bindings)].includes(event.code)) event.preventDefault();
    if (!this.keys.has(event.code)) {
      if (event.code === this.settings.bindings.jump) this.queuedJump = true;
      if (event.code === this.settings.bindings.push) this.queuedPush = true;
    }
    this.keys.add(event.code);
  };
  private keyup = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  clear = () => { this.keys.clear(); this.pointers.clear(); this.queuedJump = false; this.queuedPush = false; };
  touch(action: string, down: boolean) {
    if (!this.enabled) return;
    if (down && !this.pointers.has(action)) { if (action === 'jump') this.queuedJump = true; if (action === 'push') this.queuedPush = true; }
    if (down) this.pointers.add(action); else this.pointers.delete(action);
  }
  sample(seq: number): PlayerInput {
    const pads = navigator.getGamepads?.() ?? []; const pad = Array.from(pads).find(p => p?.connected);
    this.gamepadConnected = Boolean(pad);
    for (const index of this.blockedPadButtons) if (!pad?.buttons[index]?.pressed) this.blockedPadButtons.delete(index);
    if (!pad?.axes.some(axis => Math.abs(axis) > 0.2)) this.blockedPadAxes = false;
    const menu = pad?.buttons[9]?.pressed ?? false;
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));
    if (menu && !this.lastMenu && !dialogOpen) this.onMenu(); this.lastMenu = menu;
    const input = { ...neutralInput(seq), clientTime: performance.now() };
    if (!this.enabled || dialogOpen || document.hidden) { this.clear(); this.consumePad(); return input; }
    const b = this.settings.bindings;
    input.moveX = Number(this.keys.has(b.right) || this.keys.has('ArrowRight') || this.pointers.has('right')) - Number(this.keys.has(b.left) || this.keys.has('ArrowLeft') || this.pointers.has('left'));
    // Preserve even a tap shorter than one 30 Hz tick, exactly once.
    input.jump = this.queuedJump || this.keys.has(b.jump) || this.pointers.has('jump'); input.push = this.queuedPush || this.keys.has(b.push) || this.pointers.has('push');
    this.queuedJump = false; this.queuedPush = false;
    if (pad) {
      const axis = this.blockedPadAxes ? 0 : pad.axes[0] ?? 0;
      if (Math.abs(axis) > 0.2) input.moveX = Math.max(-1, Math.min(1, axis));
      const pressed = (index: number) => Boolean(pad.buttons[index]?.pressed) && !this.blockedPadButtons.has(index);
      if (pressed(14)) input.moveX = -1; if (pressed(15)) input.moveX = 1;
      input.jump ||= pressed(0); input.push ||= pressed(1) || pressed(2);
    }
    return input;
  }
  destroy() { window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.clear); window.removeEventListener('gamepadui', this.consumePad); document.removeEventListener('visibilitychange', this.clear); }
}
