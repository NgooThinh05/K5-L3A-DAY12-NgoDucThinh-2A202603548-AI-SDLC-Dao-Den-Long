/**
 * Pure WebAudio procedural night music & sound effects (0 external audio files).
 * Strictly visual/audio layer — zero impact on simulation state.
 */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const BGM_NOTES = [261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66, 329.63];

export class SoundEffects {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmIndex = 0;

  public muted = false;
  public volume = 0.7;

  public unlock(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    }
    return this.muted;
  }

  public startNightMusic(): void {
    this.unlock();
    if (this.bgmTimer !== null) return;
    this.bgmTimer = window.setInterval(() => {
      if (this.muted || !this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
      const freq = BGM_NOTES[this.bgmIndex % BGM_NOTES.length];
      this.bgmIndex++;
      // Soft dreamy pentatonic pad note
      this.tone(freq, 1.35, 'sine', 0.035, freq * 0.998);
      if (this.bgmIndex % 2 === 0) {
        this.tone(freq * 0.5, 1.8, 'triangle', 0.025, freq * 0.5);
      }
    }, 1150);
  }

  public stopNightMusic(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public playMotePickup(carried: number): void {
    const freq = PENTATONIC[(Math.max(1, carried) - 1) % PENTATONIC.length];
    this.tone(freq, 0.16, 'sine', 0.13, freq * 1.04);
  }

  public playDeposit(): void {
    this.tone(440, 0.18, 'triangle', 0.14, 660);
  }

  public playLanternLit(): void {
    [392.0, 523.25, 659.25, 783.99].forEach((f, idx) => {
      this.tone(f, 0.55, 'triangle', 0.1, f, idx * 0.07);
    });
  }

  public playPulse(): void {
    this.tone(240, 0.35, 'sine', 0.18, 740);
    this.tone(480, 0.28, 'triangle', 0.1, 960, 0.04);
  }

  public playJump(): void {
    this.tone(260, 0.14, 'sine', 0.09, 480);
  }

  public playDash(): void {
    this.tone(520, 0.16, 'triangle', 0.13, 210);
    this.tone(760, 0.12, 'sine', 0.08, 340, 0.02);
  }

  public playCharmPickup(): void {
    [587.33, 783.99, 1046.5].forEach((f, idx) => {
      this.tone(f, 0.28, 'sine', 0.12, f * 1.02, idx * 0.05);
    });
  }

  public playShadeSpawn(): void {
    this.tone(130, 0.45, 'sawtooth', 0.08, 82);
  }

  public playDrifterSteal(): void {
    this.tone(680, 0.2, 'triangle', 0.12, 320);
  }

  public playWindWarning(): void {
    this.tone(290, 0.65, 'sine', 0.07, 420);
  }

  public playCountdownTick(): void {
    this.tone(880, 0.07, 'square', 0.06, 880);
  }

  public playHit(): void {
    this.tone(170, 0.28, 'sawtooth', 0.14, 70);
  }

  public playGameOver(won: boolean): void {
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 293.66, 220.0];
    notes.forEach((f, idx) => {
      this.tone(f, 0.48, 'triangle', 0.13, f, idx * 0.11);
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
    if (this.muted || !this.ctx || !this.masterGain) return;
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
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
