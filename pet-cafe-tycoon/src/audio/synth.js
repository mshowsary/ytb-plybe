// Tiny procedural WebAudio sound + adaptive score. No samples, no fetch, no asset payload.
// Nothing touches AudioContext until the player's first interaction unlocks audio.
export function createAudio() {
  let ctx = null, master = null, comp = null, sfx = null, music = null, noiseBuf = null, voices = 0;
  let hostMuted = false, sfxOn = true;
  let musicPhase = 'morning', musicClock = 0, musicStep = 0;

  const A = {};
  Object.defineProperty(A, 'muted', { get: () => hostMuted || !sfxOn, enumerable: true });

  A.unlock = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const Ctx = typeof AudioContext !== 'undefined' ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!Ctx) return;
    try { ctx = new Ctx(); } catch (_) { return; }

    master = ctx.createGain(); master.gain.value = A.muted ? 0 : 1;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);

    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    music = ctx.createGain(); music.gain.value = 0.22; music.connect(master);

    const len = ctx.sampleRate | 0;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    musicClock = 0.1;
  };

  const applyMaster = () => {
    if (ctx && master) master.gain.setTargetAtTime(A.muted ? 0 : 1, ctx.currentTime, 0.03);
  };
  A.setHostMute = b => { hostMuted = !!b; applyMaster(); };
  A.setSfx = b => { sfxOn = !!b; applyMaster(); };

  function tone(o, bus = sfx) {
    if (!ctx || !bus || voices >= 28) return;
    const t = o.at != null ? o.at : ctx.currentTime;
    voices++;
    setTimeout(() => voices--, (o.dur + 0.12) * 1000);
    const os = ctx.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f0, t);
    if (o.detune) os.detune.value = o.detune;
    if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.att || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = os;
    if (o.lp) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(bus);
    os.start(t); os.stop(t + o.dur + 0.05);
  }

  function noise(o) {
    if (!ctx || voices >= 28) return;
    const t = o.at != null ? o.at : ctx.currentTime;
    voices++;
    setTimeout(() => voices--, (o.dur + 0.1) * 1000);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + o.dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    src.start(t); src.stop(t + o.dur + 0.05);
  }

  const PATCHES = {
    coin: () => { const k = 1 + (Math.random() * 2 - 1) * 0.03; tone({ type: 'sine', f0: 880 * k, f1: 1760 * k, dur: 0.09, vol: 0.25 }); },
    pop: () => tone({ type: 'triangle', f0: 220, f1: 70, dur: 0.12, vol: 0.3 }),
    drop: () => tone({ type: 'sine', f0: 520, dur: 0.06, vol: 0.2 }),
    ding: () => tone({ type: 'triangle', f0: 1320, dur: 0.4, vol: 0.22 }),
    chime: () => {
      if (!ctx) return;
      const t = ctx.currentTime;
      [660, 880, 1320].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.25, vol: 0.2, at: t + i * 0.06 }));
    },
    build: () => {
      noise({ ft: 'lowpass', f0: 200, f1: 2000, dur: 0.3, vol: 0.25 });
      if (!ctx) return;
      const t = ctx.currentTime;
      [440, 554, 659].forEach(f => tone({ type: 'sine', f0: f, dur: 0.4, vol: 0.15, at: t }));
    },
    step: () => noise({ ft: 'bandpass', f0: 1200, q: 1, dur: 0.04, vol: 0.12 }),
    tap: () => tone({ type: 'sine', f0: 1000, dur: 0.03, vol: 0.15 }),
    angry: () => tone({ type: 'square', f0: 180, dur: 0.15, vol: 0.18 }),
  };

  A.play = (name, opts = {}) => {
    if (!ctx || A.muted) return;
    const p = PATCHES[name]; if (p) p(opts);
  };

  // A restrained pentatonic lounge loop changes density by day phase. It is intentionally quiet
  // enough that register/machine SFX remain the foreground information channel.
  const MUSIC = {
    morning:   { gap: 0.46, roots: [261.63, 293.66, 349.23, 329.63], notes: [0, 4, 7, 11, 14], vol: 0.055, dur: 0.5 },
    rush:      { gap: 0.285, roots: [293.66, 349.23, 392.00, 329.63], notes: [0, 4, 7, 9, 12, 14], vol: 0.058, dur: 0.34 },
    afternoon: { gap: 0.52, roots: [246.94, 293.66, 329.63, 261.63], notes: [0, 4, 7, 11, 12], vol: 0.05, dur: 0.58 },
    closing:   { gap: 0.72, roots: [220.00, 246.94, 261.63, 196.00], notes: [0, 7, 11, 14], vol: 0.042, dur: 0.78 },
  };
  const ratio = semis => Math.pow(2, semis / 12);

  A.setMusicPhase = phase => {
    if (!MUSIC[phase] || phase === musicPhase) return;
    musicPhase = phase;
    musicStep = 0;
    musicClock = Math.min(musicClock, 0.15);
    if (ctx && music) {
      const target = phase === 'rush' ? 0.25 : phase === 'closing' ? 0.16 : 0.22;
      music.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
    }
  };

  A.musicUpdate = dt => {
    if (!ctx || !music || A.muted || ctx.state !== 'running') return;
    const cfg = MUSIC[musicPhase] || MUSIC.morning;
    musicClock -= dt;
    if (musicClock > 0) return;
    musicClock += cfg.gap;

    const root = cfg.roots[(musicStep / cfg.notes.length | 0) % cfg.roots.length];
    const semi = cfg.notes[musicStep % cfg.notes.length];
    const f = root * ratio(semi);
    tone({ type: 'triangle', f0: f, dur: cfg.dur, vol: cfg.vol, att: 0.025, lp: 1800 }, music);

    // Soft root pulse every four notes gives the loop shape without a separate percussion sample.
    if (musicStep % 4 === 0) {
      tone({ type: 'sine', f0: root / 2, dur: Math.min(0.65, cfg.dur + 0.1), vol: cfg.vol * 0.68, att: 0.03, lp: 700 }, music);
    }
    musicStep++;
  };

  return A;
}
