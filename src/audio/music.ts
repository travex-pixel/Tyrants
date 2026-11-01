/**
 * Generative fantasy score, synthesised in WebAudio (no audio files).
 * Layers: a slow pad on a cycling chord progression, a harp-like arpeggio, an occasional
 * flute motif, and soft drums during evening bonfires. Night slows and softens it;
 * storms turn it tense. Everything is scheduled a little ahead of the clock.
 */
export type MusicMood = "day" | "night" | "storm" | "bonfire" | "menu";

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
// D dorian flavoured progressions (midi roots). Each chord: [root, third, fifth, colour]
const PROGRESSIONS: Record<"day" | "night" | "storm", number[][]> = {
  day: [
    [62, 65, 69, 72], // Dm7
    [60, 64, 67, 71], // Cmaj7
    [65, 69, 72, 76], // F
    [67, 71, 74, 77], // G
  ],
  night: [
    [57, 60, 64, 67], // Am
    [62, 65, 69, 72], // Dm
    [55, 59, 62, 66], // G
    [57, 60, 64, 71], // Am(maj7)
  ],
  storm: [
    [50, 53, 57, 60], // Dm low
    [48, 51, 55, 58], // Cm
    [50, 53, 57, 60],
    [53, 56, 60, 63], // Fm
  ],
};
const PENTA = [0, 2, 4, 7, 9]; // minor-ish pentatonic offsets from root (dorian safe)

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private padGain: GainNode | null = null;
  private harpGain: GainNode | null = null;
  private fluteGain: GainNode | null = null;
  private drumGain: GainNode | null = null;
  private running = false;
  private timer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private mood: MusicMood = "day";
  private volume = 0.5;
  private chordIndex = 0;
  private motifCooldown = 0;
  private noise: AudioBuffer | null = null;

  attach(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.padGain = ctx.createGain();
    this.harpGain = ctx.createGain();
    this.fluteGain = ctx.createGain();
    this.drumGain = ctx.createGain();
    this.padGain.gain.value = 0.5;
    this.harpGain.gain.value = 0.55;
    this.fluteGain.gain.value = 0.35;
    this.drumGain.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    // a little room: feedback delay
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(comp);
    for (const g of [this.padGain, this.harpGain, this.fluteGain, this.drumGain]) {
      g.connect(comp);
      g.connect(delay);
    }
    comp.connect(this.out).connect(dest);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }
  setMood(m: MusicMood) {
    if (m === this.mood) return;
    this.mood = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.drumGain?.gain.setTargetAtTime(m === "bonfire" ? 0.5 : 0, t, 1.5);
    this.harpGain?.gain.setTargetAtTime(m === "night" ? 0.3 : m === "storm" ? 0.25 : 0.55, t, 1.5);
    this.padGain?.gain.setTargetAtTime(m === "storm" ? 0.65 : 0.5, t, 1.5);
  }
  private bpm() {
    return this.mood === "night" ? 56 : this.mood === "storm" ? 96 : this.mood === "bonfire" ? 92 : 76;
  }

  start() {
    if (this.running || !this.ctx) return;
    this.running = true;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.timer = window.setInterval(() => this.schedule(), 120);
  }
  stop() {
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    const spb = 60 / this.bpm();
    while (this.nextBeat < ctx.currentTime + 0.6) {
      this.playBeat(this.nextBeat, spb);
      this.nextBeat += spb / 2; // eighth-note grid
      this.beat++;
    }
  }

  private chord(): number[] {
    const prog = PROGRESSIONS[this.mood === "storm" ? "storm" : this.mood === "night" ? "night" : "day"];
    return prog[this.chordIndex % prog.length];
  }

  private playBeat(t: number, spb: number) {
    const eighth = this.beat % 16; // two bars of 4/4 in eighths
    if (eighth === 0) {
      this.chordIndex++;
      this.pad(t, spb * 8);
    }
    // harp arpeggio: probabilistic pentatonic/chord tones on the eighth grid
    const ch = this.chord();
    const density = this.mood === "night" ? 0.35 : this.mood === "storm" ? 0.5 : 0.62;
    if (Math.random() < density) {
      const pool = [...ch, ch[0] + 12, ch[1] + 12, ch[0] + PENTA[2] + 12];
      const midi = pool[Math.floor(Math.random() * pool.length)] + (Math.random() < 0.3 ? 12 : 0);
      this.pluck(t, NOTE(midi), 0.16 + Math.random() * 0.08);
    }
    // flute motif every so often
    this.motifCooldown--;
    if (eighth === 4 && this.motifCooldown <= 0 && Math.random() < (this.mood === "storm" ? 0.15 : 0.4)) {
      this.motifCooldown = 6 + Math.floor(Math.random() * 6);
      this.motif(t, spb);
    }
    // bonfire drums
    if (this.mood === "bonfire") {
      if (eighth % 4 === 0) this.drum(t, 110, 0.5);
      if (eighth % 4 === 2) this.drum(t, 220, 0.25);
      if (eighth % 2 === 1 && Math.random() < 0.6) this.shaker(t);
    }
    if (this.mood === "storm" && eighth % 8 === 0) this.drum(t, 70, 0.6);
  }

  private pad(t: number, dur: number) {
    const ctx = this.ctx!;
    const ch = this.chord();
    for (let i = 0; i < ch.length; i++) {
      const f = NOTE(ch[i] - 12);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? "sawtooth" : "triangle";
        o.frequency.value = f;
        o.detune.value = det;
        const flt = ctx.createBiquadFilter();
        flt.type = "lowpass";
        flt.frequency.setValueAtTime(380, t);
        flt.frequency.linearRampToValueAtTime(this.mood === "storm" ? 900 : 620, t + dur * 0.5);
        flt.frequency.linearRampToValueAtTime(380, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + dur * 0.25);
        g.gain.setValueAtTime(0.045, t + dur * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
        o.connect(flt).connect(g).connect(this.padGain!);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
  }

  private pluck(t: number, freq: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * 0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.harpGain!);
    o2.connect(g2).connect(this.harpGain!);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.5);
    o2.stop(t + 0.5);
  }

  private motif(t: number, spb: number) {
    const ctx = this.ctx!;
    const ch = this.chord();
    const root = ch[0] + 12;
    const steps = [0, 2, 4, 7, 9, 12];
    let idx = 2 + Math.floor(Math.random() * 3);
    const len = 3 + Math.floor(Math.random() * 3);
    for (let n = 0; n < len; n++) {
      idx = Math.max(0, Math.min(steps.length - 1, idx + (Math.random() < 0.5 ? -1 : 1)));
      const midi = root + steps[idx];
      const start = t + n * spb * (n === len - 1 ? 1 : 0.5);
      const dur = n === len - 1 ? spb * 1.6 : spb * 0.5;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = NOTE(midi);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vg = ctx.createGain();
      vg.gain.value = 4;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.09, start + 0.06);
      g.gain.setValueAtTime(0.09, start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.1);
      o.connect(g).connect(this.fluteGain!);
      o.start(start);
      vib.start(start);
      o.stop(start + dur + 0.2);
      vib.stop(start + dur + 0.2);
    }
  }

  private drum(t: number, freq: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.drumGain!);
    o.start(t);
    o.stop(t + 0.3);
  }
  private shaker(t: number) {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f).connect(g).connect(this.drumGain!);
    src.start(t);
    src.stop(t + 0.1);
  }
}
