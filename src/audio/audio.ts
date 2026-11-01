/**
 * Procedural audio: no asset files required. Every sound is synthesised with WebAudio so the
 * game ships with a complete soundscape; drop-in sample support can replace any `play*` method.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private ambientStarted = false;
  private volumes = { master: 0.8, sfx: 0.9, ambient: 0.6 };
  private lastPlayed: Record<string, number> = {};
  private stormGain: GainNode | null = null;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.sfx = this.ctx.createGain();
        this.amb = this.ctx.createGain();
        this.sfx.connect(this.master);
        this.amb.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    const ctx = this.ensure();
    if (ctx && !this.ambientStarted) this.startAmbient();
  }

  setVolumes(v: Partial<{ master: number; sfx: number; ambient: number }>) {
    this.volumes = { ...this.volumes, ...v };
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.ctx) return;
    this.master!.gain.value = this.volumes.master;
    this.sfx!.gain.value = this.volumes.sfx;
    this.amb!.gain.value = this.volumes.ambient * 0.5;
  }

  private noiseBuffer(seconds = 2): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startAmbient() {
    const ctx = this.ensure();
    if (!ctx || !this.amb) return;
    this.ambientStarted = true;
    // Wind: filtered noise with slow LFO on filter frequency
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer(4);
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "lowpass";
    wf.frequency.value = 400;
    const wg = ctx.createGain();
    wg.gain.value = 0.25;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.amb);
    wind.start();
    lfo.start();
    // Water: bandpassed noise, gentle
    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuffer(3);
    water.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = 1800;
    bf.Q.value = 0.6;
    const wgain = ctx.createGain();
    wgain.gain.value = 0.07;
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.35;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 0.03;
    lfo2.connect(lfo2G).connect(wgain.gain);
    water.connect(bf).connect(wgain).connect(this.amb);
    water.start();
    lfo2.start();
    // Storm layer (silent until a storm)
    const storm = ctx.createBufferSource();
    storm.buffer = this.noiseBuffer(3);
    storm.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = "lowpass";
    sf.frequency.value = 900;
    this.stormGain = ctx.createGain();
    this.stormGain.gain.value = 0;
    storm.connect(sf).connect(this.stormGain).connect(this.amb);
    storm.start();
    // Occasional birds
    const bird = () => {
      if (!this.ctx) return;
      if (this.volumes.ambient > 0 && Math.random() < 0.6) this.chirp(1800 + Math.random() * 1200, 0.08, 0.05);
      setTimeout(bird, 2500 + Math.random() * 6000);
    };
    setTimeout(bird, 3000);
  }

  setStorm(on: boolean) {
    if (!this.stormGain || !this.ctx) return;
    this.stormGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 1.5);
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if ((this.lastPlayed[key] ?? 0) + ms > now) return false;
    this.lastPlayed[key] = now;
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, dest?: AudioNode, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.sfx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  private burst(dur: number, vol: number, filterType: BiquadFilterType, freq: number, slideTo?: number, q = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.sfx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.min(2, dur + 0.1));
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, ctx.currentTime);
    f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  chirp(freq: number, dur: number, vol: number) {
    this.tone(freq, dur, "sine", vol, this.amb ?? undefined, freq * 1.4);
  }

  // ── Public sound events ──
  click() {
    if (!this.throttle("click", 40)) return;
    this.tone(520, 0.06, "triangle", 0.12, undefined, 380);
  }
  hover() {
    if (!this.throttle("hover", 60)) return;
    this.tone(900, 0.03, "sine", 0.03);
  }
  select() {
    this.tone(660, 0.08, "triangle", 0.1, undefined, 880);
  }
  grab() {
    this.tone(300, 0.12, "sine", 0.14, undefined, 520);
    this.creatureVoice(1, "surprised");
  }
  throwWhoosh(power = 1) {
    this.burst(0.35, 0.25 * power, "bandpass", 600, 2400, 0.8);
  }
  splash() {
    if (!this.throttle("splash", 80)) return;
    this.burst(0.5, 0.35, "highpass", 900, 300);
    this.tone(180, 0.25, "sine", 0.12, undefined, 90);
  }
  thud() {
    if (!this.throttle("thud", 60)) return;
    this.tone(110, 0.18, "sine", 0.25, undefined, 50);
    this.burst(0.12, 0.12, "lowpass", 500);
  }
  lightning() {
    const ctx = this.ensure();
    if (!ctx) return;
    this.burst(0.08, 0.6, "highpass", 2000);
    setTimeout(() => this.burst(1.6, 0.5, "lowpass", 400, 60), 60);
    this.tone(60, 1.2, "sawtooth", 0.08, undefined, 30);
  }
  bless() {
    const base = 523.25;
    [1, 1.25, 1.5, 2].forEach((m, i) => setTimeout(() => this.tone(base * m, 0.5, "sine", 0.12), i * 90));
  }
  spawn() {
    this.tone(440, 0.15, "triangle", 0.1, undefined, 880);
    setTimeout(() => this.tone(880, 0.12, "sine", 0.06), 100);
  }
  build() {
    if (!this.throttle("build", 350)) return;
    this.tone(220 + Math.random() * 60, 0.06, "square", 0.05, undefined, 160);
  }
  chop() {
    if (!this.throttle("chop", 300)) return;
    this.burst(0.08, 0.1, "lowpass", 1200);
    this.tone(140, 0.05, "triangle", 0.06);
  }
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "triangle", 0.12), i * 80));
  }
  levelup() {
    [659, 880, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "sine", 0.1), i * 70));
  }
  notify() {
    this.tone(784, 0.1, "sine", 0.08);
    setTimeout(() => this.tone(1046, 0.14, "sine", 0.08), 90);
  }
  bad() {
    this.tone(220, 0.2, "sawtooth", 0.06, undefined, 110);
  }
  creatureVoice(species: number, mood: "happy" | "surprised" | "grumpy" = "happy") {
    if (!this.throttle("voice", 120)) return;
    const base = species === 1 ? 520 : species === 2 ? 180 : 360;
    const f = base * (0.9 + Math.random() * 0.25);
    if (mood === "surprised") this.tone(f, 0.12, "square", 0.05, undefined, f * 1.8);
    else if (mood === "grumpy") this.tone(f * 0.7, 0.18, "sawtooth", 0.04, undefined, f * 0.5);
    else this.tone(f, 0.1, "square", 0.04, undefined, f * 1.2);
  }
  terraform() {
    if (!this.throttle("terra", 120)) return;
    this.burst(0.25, 0.12, "lowpass", 300, 120);
  }
  whooshCamera() {
    if (!this.throttle("cam", 600)) return;
    this.burst(0.6, 0.1, "bandpass", 300, 1200, 0.5);
  }
}

export const audio = new AudioEngine();
