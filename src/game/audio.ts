// 原创程序化音效（WebAudio 合成），无外部素材
export class AudioManager {
  ctx: AudioContext | null = null;
  volume = 0.7;
  private noiseBuffer: AudioBuffer | null = null;

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const len = this.ctx.sampleRate * 1;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  private noise(dur: number, gain: number, filterFreq: number) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  shootPrimary() { this.tone(880, 0.08, 'square', 0.12, 320); }
  shootPulse() { this.tone(1400, 0.1, 'sawtooth', 0.1, 500); }
  shootMissile() { this.noise(0.35, 0.22, 900); this.tone(220, 0.3, 'triangle', 0.1, 600); }
  shootBlast() { this.noise(0.3, 0.25, 500); }
  explosion() { this.noise(0.7, 0.4, 700); this.tone(120, 0.6, 'sine', 0.25, 40); }
  hit() { this.tone(300, 0.06, 'square', 0.08, 180); }
  lock() { this.tone(660, 0.09, 'sine', 0.12, 990); }
  pickup() { this.tone(520, 0.12, 'sine', 0.14, 1040); }
  alarm() { this.tone(440, 0.18, 'square', 0.14, 440); }
  uiClick() { this.tone(700, 0.05, 'triangle', 0.08, 900); }
  damage() { this.noise(0.25, 0.3, 400); }
  evade() { this.noise(0.2, 0.18, 1400); }
}

export const audio = new AudioManager();
