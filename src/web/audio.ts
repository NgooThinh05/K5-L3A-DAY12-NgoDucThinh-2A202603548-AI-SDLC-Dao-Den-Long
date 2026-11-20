/**
 * Pure WebAudio procedural sound effects (no external audio assets).
 * Strictly visual/audio layer — zero impact on simulation state.
 */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

export class SoundEffects {
  private ctx: AudioContext | null = null;
  public muted = false;

  public unlock(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public playMotePickup(carried: number): void {
    if (this.muted || !this.ctx) return;
    const freq = PENTATONIC[(Math.max(1, carried) - 1) % PENTATONIC.length];
    this.tone(freq, 0.16, 'sine', 0.11, freq * 1.03);
  }

  public playDeposit(): void {
    if (this.muted || !this.ctx) return;
    this.tone(440, 0.18, 'triangle', 0.12, 660);
  }

  public playLanternLit(): void {
    if (this.muted || !this.ctx) return;
    const notes = [392.0, 523.25, 659.25, 783.99];
    notes.forEach((f, idx) => {
      this.tone(f, 0.55, 'triangle', 0.09, f, idx * 0.07);
    });
  }

  public playPulse(): void {
    if (this.muted || !this.ctx) return;
    this.tone(240, 0.35, 'sine', 0.16, 720);
    this.tone(480, 0.28, 'triangle', 0.09, 960, 0.04);
  }

  public playHit(): void {
    if (this.muted || !this.ctx) return;
    this.tone(170, 0.25, 'sawtooth', 0.12, 75);
  }

  public playGameOver(won: boolean): void {
    if (this.muted || !this.ctx) return;
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 293.66, 220.0];
    notes.forEach((f, idx) => {
      this.tone(f, 0.45, 'triangle', 0.11, f, idx * 0.11);
    });
  }

  private tone(
    startFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFreq: number,
    delay = 0,
  ): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
