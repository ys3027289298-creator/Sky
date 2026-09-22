export class SoundFX {
  ctx?: AudioContext;
  constructor(public volume = .6) {}
  play(freq: number, duration = .08, type: OscillatorType = 'square', gain = .05) {
    try {
      this.ctx ??= new AudioContext();
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq; g.gain.value = gain * this.volume;
      osc.connect(g); g.connect(this.ctx.destination); osc.start(); osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * .45), this.ctx.currentTime + duration); osc.stop(this.ctx.currentTime + duration);
    } catch {}
  }
  shoot() { this.play(720, .055, 'sawtooth', .035); }
  missile() { this.play(190, .22, 'triangle', .055); }
  hit() { this.play(110, .12, 'square', .045); }
  alarm() { this.play(90, .35, 'sine', .07); }
}
