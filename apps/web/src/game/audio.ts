import type { Settings } from './input';

export class GameAudio {
  private context?: AudioContext;
  constructor(public settings: Settings) {}
  unlock() { this.context ??= new AudioContext(); void this.context.resume(); }
  tone(frequency: number, duration: number, volume: number, endFrequency?: number) {
    const context = this.context; if (!context || context.state !== 'running' || !volume) return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'square'; oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + duration);
    gain.gain.setValueAtTime(volume * 0.08, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  }
  jump() { this.tone(180, 0.12, this.settings.sound / 100, 580); }
  land() { this.tone(90, 0.06, this.settings.sound / 160, 45); }
  push() { this.tone(150, 0.08, this.settings.sound / 100, 60); }
  impact(blocked = false) { this.tone(blocked ? 720 : 65, blocked ? 0.16 : 0.1, this.settings.sound / 80, blocked ? 210 : 32); }
  pickup() { this.tone(540, 0.2, this.settings.sound / 110, 1200); }
  destroy() { void this.context?.close(); }
}
