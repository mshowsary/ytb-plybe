// Tiny procedural WebAudio sound + adaptive score. No samples, no fetch, no asset payload.
// Nothing touches AudioContext until the player's first interaction unlocks audio.
export function createAudio() {
  let ctx = null, master = null, comp = null, sfx = null, music = null, noiseBuf = null, voices = 0;
  let hostMuted = false, sfxOn = true, musicOn = true, paused = false;
  let musicPhase = 'morning', musicClock = 0, musicStep = 0;

  const A = {};
  Object.defineProperty(A, 'muted', { get: () => hostMuted, enumerable: true });
  Object.defineProperty(A, 'sfxEnabled', { get: () => sfxOn, enumerable: true });
  Object.defineProperty(A, 'musicEnabled', { get: () => musicOn, enumerable: true });
  Object.defineProperty(A, 'paused', { get: () => paused, enumerable: true });

  const MUSIC_GAIN = { morning: 0.22, rush: 0.25, afternoon: 0.22, closing: 0.16 };
  const currentMusicGain = () => musicOn ? (MUSIC_GAIN[musicPhase] || 0.22) : 0;

  A.unlock = () => {
    if (ctx) {
      if (!paused && ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const Ctx = typeof AudioContext !== 'undefined' ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!Ctx) return;
    try { ctx = new Ctx(); } catch (_) { return; }

    master = ctx.createGain(); master.gain.value = hostMuted || paused ? 0 : 1;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);

    sfx = ctx.createGain(); sfx.gain.value = sfxOn ? 1 : 0; sfx.connect(master);
    music = ctx.createGain(); music.gain.value = currentMusicGain(); music.connect(master);

    const len = ctx.sampleRate | 0;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    musicClock = 0.1;
    if (paused && ctx.state === 'running') ctx.suspend().catch(() => {});
  };

  const applyBuses = () => {
    if (!ctx) return;
    if (master) master.gain.setTargetAtTime(hostMuted || paused ? 0 : 1, ctx.currentTime, 0.015);
    if (sfx) sfx.gain.setTargetAtTime(sfxOn ? 1 : 0, ctx.currentTime, 0.03);
    if (music) music.gain.setTargetAtTime(currentMusicGain(), ctx.currentTime, 0.12);
  };
  A.setHostMute = b => { hostMuted = !!b; applyBuses(); };
  A.setSfx = b => { sfxOn = !!b; applyBuses(); };
  A.setMusic = b => { musicOn = !!b; applyBuses(); };
  A.setPaused = b => {
    paused = !!b;
    applyBuses();
    if (!ctx) return;
    if (paused) {
      if (ctx.state === 'running') ctx.suspend().catch(() => {});
    } else if (ctx.state === 'suspended') {
      ctx.resume().then(applyBuses).catch(() => {});
    }
  };

  function tone(o, bus = sfx) {
    if (!ctx || paused || !bus || voices >= 28) return;
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
    if (!ctx || paused || voices >= 28) return;
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
    penalty: () => {
      if (!ctx) return; const t = ctx.currentTime;
      tone({ type: 'triangle', f0: 310, f1: 155, dur: 0.18, vol: 0.13, at: t });
      tone({ type: 'sine', f0: 210, f1: 140, dur: 0.22, vol: 0.08, at: t + 0.08 });
    },
    petCat: () => {
      if (!ctx) return; const t = ctx.currentTime;
      tone({ type: 'triangle', f0: 620, f1: 860, dur: 0.16, vol: 0.12, at: t });
      tone({ type: 'sine', f0: 760, f1: 1050, dur: 0.2, vol: 0.095, at: t + 0.11 });
    },
    petDog: () => {
      if (!ctx) return; const t = ctx.currentTime;
      tone({ type: 'triangle', f0: 230, f1: 150, dur: 0.11, vol: 0.15, at: t, lp: 1200 });
      tone({ type: 'triangle', f0: 270, f1: 170, dur: 0.1, vol: 0.12, at: t + 0.13, lp: 1200 });
    },
    petBunny: () => {
      if (!ctx) return; const t = ctx.currentTime;
      [920, 1160, 1380].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.12 + i * 0.03, vol: 0.07, at: t + i * 0.045 }));
    },
    pour: () => {
      noise({ ft: 'bandpass', f0: 1800, f1: 650, q: 0.7, dur: 0.22, vol: 0.08, att: 0.02 });
      tone({ type: 'sine', f0: 540, f1: 380, dur: 0.18, vol: 0.06 });
    },
    clean: () => {
      if (!ctx) return; const t = ctx.currentTime;
      noise({ ft: 'highpass', f0: 1500, f1: 4200, q: 0.5, dur: 0.16, vol: 0.055, att: 0.02, at: t });
      [880, 1320].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.09, at: t + 0.09 + i * 0.04 }));
    },
  };

  A.play = (name, opts = {}) => {
    if (!ctx || paused || hostMuted || !sfxOn) return;
    const p = PATCHES[name]; if (p) p(opts);
  };

  const MUSIC = {
    morning:   { gap: 0.46, roots: [261.63, 293.66, 349.23, 329.63], notes: [0, 4, 7, 11, 14], vol: 0.055, dur: 0.5 },
    rush:      { gap: 0.285, roots: [293.66, 349.23, 392.00, 329.63], notes: [0, 4, 7, 9, 12, 14], vol: 0.058, dur: 0.34 },
    afternoon: { gap: 0.52, roots: [246.94, 293.66, 329.63, 261.63], notes: [0, 4, 7, 11, 12], vol: 0.05, dur: 0.58 },
    closing:   { gap: 0.72, roots: [220.00, 246.94, 261.63, 196.00], notes: [0, 7, 11, 14], vol: 0.042, dur: 0.78 },
  };
  const ratio = semis => Math.pow(2, semis / 12);

  A.setMusicPhase = phase => {
    if (!MUSIC[phase] || phase === musicPhase) return;
    musicPhase = phase; musicStep = 0; musicClock = Math.min(musicClock, 0.15);
    applyBuses();
  };

  A.musicUpdate = dt => {
    if (!ctx || !music || paused || hostMuted || !musicOn || ctx.state !== 'running') return;
    const cfg = MUSIC[musicPhase] || MUSIC.morning;
    musicClock -= dt;
    if (musicClock > 0) return;
    musicClock += cfg.gap;

    const root = cfg.roots[(musicStep / cfg.notes.length | 0) % cfg.roots.length];
    const semi = cfg.notes[musicStep % cfg.notes.length];
    const f = root * ratio(semi);
    tone({ type: 'triangle', f0: f, dur: cfg.dur, vol: cfg.vol, att: 0.025, lp: 1800 }, music);
    if (musicStep % 4 === 0) tone({ type: 'sine', f0: root / 2, dur: Math.min(0.65, cfg.dur + 0.1), vol: cfg.vol * 0.68, att: 0.03, lp: 700 }, music);
    musicStep++;
  };

  return A;
}
