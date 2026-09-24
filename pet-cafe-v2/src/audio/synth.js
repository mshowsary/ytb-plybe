// src/audio/synth.js — the game's sound.
//
// Three layers:
//  - a handful of short RECORDED effects (Kenney CC0, public/sfx, ~70 KB): coins, taps, clinks, thuds,
//    the cloth on a table, footsteps. They load after the first tap; every one has a synthesized
//    stand-in, so a slow or failed load is never silent (and a browser that cannot decode them loses
//    nothing but polish);
//  - SYNTHESIZED voices for everything else: the pets (a meow and a purr, a woof, squeaks), the van's
//    horn, the fanfare, the little coin "ting" that climbs in pitch when coins pour in;
//  - a small MUSIC engine with real instruments made in code — a plucked-string ukulele
//    (Karplus-Strong), an FM electric piano, mallets, a steel drum, bass and soft drums — through one
//    shared reverb, playing a theme per café: a cosy café shuffle in town, an island strum at the
//    beach, a lounge groove at the mall. Rush hour and the Pet Party push the groove harder.
// Nothing touches the AudioContext until the player's first interaction unlocks audio.

const SAMPLES = ['cash', 'tap', 'drop', 'pop', 'pop2', 'build', 'chime', 'clean', 'step1', 'step2', 'step3', 'whoosh', 'open', 'close', 'plate'];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio() {
  let ctx = null, master = null, comp = null, sfx = null, music = null, verbIn = null, noiseBuf = null, voices = 0;
  let hostMuted = false, sfxOn = true, musicOn = true, paused = false;
  const buf = {};

  const A = {};
  Object.defineProperty(A, 'muted', { get: () => hostMuted, enumerable: true });
  Object.defineProperty(A, 'sfxEnabled', { get: () => sfxOn, enumerable: true });
  Object.defineProperty(A, 'musicEnabled', { get: () => musicOn, enumerable: true });
  Object.defineProperty(A, 'paused', { get: () => paused, enumerable: true });
  Object.defineProperty(A, 'voices', { get: () => voices });
  Object.defineProperty(A, 'state', { get: () => ctx ? ctx.state : 'none' });

  const MUSIC_GAIN = 0.5;
  const currentMusicGain = () => musicOn ? MUSIC_GAIN : 0;

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
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);

    sfx = ctx.createGain(); sfx.gain.value = sfxOn ? 1 : 0; sfx.connect(master);
    music = ctx.createGain(); music.gain.value = currentMusicGain(); music.connect(master);

    // one shared room: a generated stereo impulse (a soft 1.8 s tail), low end kept out of it
    const sr = ctx.sampleRate, len = (sr * 1.8) | 0, ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    hp.connect(conv); conv.connect(wet); wet.connect(master); verbIn = hp;

    const nlen = sr | 0;
    noiseBuf = ctx.createBuffer(1, nlen, sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) d[i] = Math.random() * 2 - 1;
    // the recorded effects, fetched once audio is allowed; each decodes on its own and simply stays
    // on its synthesized stand-in if it cannot
    for (const n of SAMPLES) {
      fetch('./sfx/' + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(a => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).then(b => { buf[n] = b; }).catch(() => {});
    }
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

  // ---- voices ------------------------------------------------------------------------------------
  // a voice is counted from its start until its source node reports it has ended (the game's pause-aware
  // scheduler must not be used here: while a menu or the map pauses the game, its timers stand still)
  const track = node => { voices++; node.onended = () => { voices = Math.max(0, voices - 1); }; };
  function out(node, bus, send, vol = 1) {
    const g = ctx.createGain(); g.gain.value = vol; node.connect(g); g.connect(bus);
    if (send > 0 && verbIn) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(verbIn); }
    return g;
  }
  function tone(o, bus = sfx) {
    if (!ctx || paused || !bus || voices >= 40) return;
    const t = o.at != null ? o.at : ctx.currentTime;
    const os = ctx.createOscillator(); track(os); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f0, t);
    if (o.detune) os.detune.value = o.detune;
    if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.glide || o.dur));
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.att || 0.006));
    if (o.hold) g.gain.setValueAtTime(o.vol, t + o.dur * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = os;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; if (o.q) f.Q.value = o.q; node.connect(f); node = f; }
    if (o.bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q || 2; node.connect(f); node = f; }
    node.connect(g); out(g, bus, o.send || 0);
    os.start(t); os.stop(t + o.dur + 0.05);
  }
  function noise(o, bus = sfx) {
    if (!ctx || paused || voices >= 40) return;
    const t = o.at != null ? o.at : ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; track(src);
    const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + o.dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); out(g, bus, o.send || 0);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05);
  }
  function sample(name, o = {}) {
    const b = buf[name]; if (!b || !ctx || paused || voices >= 40) return false;
    const t = o.at != null ? o.at : ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = o.rate || 1; track(src);
    out(src, o.bus || sfx, o.send || 0, o.vol ?? 1);
    src.start(t);
    return true;
  }
  const vary = (k = 0.06) => 1 + (Math.random() * 2 - 1) * k;

  // plucked strings (Karplus-Strong), rendered once per note and kept
  const plucks = new Map();
  function pluckBuf(midi, bright) {
    const key = midi * 10 + Math.round(bright * 9);
    if (plucks.has(key)) return plucks.get(key);
    const sr = ctx.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f));
    const len = (sr * 1.3) | 0, data = new Float32Array(len), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < N; i++) ring[i] = ring[i] * bright + ring[i - 1] * (1 - bright);
    let idx = 0, peak = 0;
    const decay = 0.9965 - Math.max(0, midi - 60) * 0.00012;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b2 = ring[(idx + 1) % N];
      data[i] = a; ring[idx] = (a + b2) * 0.5 * decay; idx = (idx + 1) % N;
      if (Math.abs(a) > peak) peak = Math.abs(a);
    }
    for (let i = 0; i < len; i++) data[i] /= peak || 1;
    const b = ctx.createBuffer(1, len, sr); b.getChannelData(0).set(data); plucks.set(key, b);
    return b;
  }
  function pluck(midi, t, vol, o = {}) {
    if (!ctx || voices >= 40) return;
    const b = pluckBuf(midi, o.bright ?? 0.55);
    const src = ctx.createBufferSource(); src.buffer = b; track(src);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0.0001, t + (o.len || 0.9), 0.12);
    src.connect(g); out(g, o.bus || music, o.send ?? 0.22);
    src.start(t); src.stop(t + b.duration);
  }
  // FM voices: an electric piano (ratio 1, a bright bark that settles), mallets and a steel drum
  function fm(midi, t, vol, dur, o) {
    if (!ctx || voices >= 40) return;
    const f = mtof(midi);
    const car = ctx.createOscillator(); car.frequency.setValueAtTime(f, t); track(car);
    const mod = ctx.createOscillator(); mod.frequency.setValueAtTime(f * o.ratio, t);
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * o.i0, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * o.i1), t + o.idur);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(vol * (o.sus || 0.4), t + Math.min(dur * 0.5, 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g); out(g, o.bus || music, o.send ?? 0.3);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  const ep = (m, t, v, d = 1.4, o = {}) => fm(m, t, v, d, { ratio: 1, i0: 1.6, i1: 0.18, idur: 0.5, sus: 0.45, ...o });
  const mallet = (m, t, v, d = 0.9, o = {}) => fm(m, t, v, d, { ratio: 4, i0: 1.1, i1: 0.05, idur: 0.25, sus: 0.3, ...o });
  const steel = (m, t, v, d = 0.7, o = {}) => fm(m, t, v, d, { ratio: 1.5, i0: 1.4, i1: 0.2, idur: 0.3, sus: 0.35, ...o });
  const bass = (m, t, v, d = 0.5) => { tone({ type: 'triangle', f0: mtof(m), dur: d, vol: v, att: 0.008, lp: 520, hold: 0.55, at: t }, music); tone({ type: 'sine', f0: mtof(m), dur: d, vol: v * 0.9, att: 0.01, hold: 0.55, at: t }, music); };
  const kick = (t, v) => tone({ type: 'sine', f0: 118, f1: 44, glide: 0.12, dur: 0.22, vol: v, att: 0.002, at: t }, music);
  const rim = (t, v) => { noise({ ft: 'bandpass', f0: 1900, q: 1.2, dur: 0.07, vol: v, at: t }, music); tone({ type: 'triangle', f0: 420, dur: 0.04, vol: v * 0.5, at: t }, music); };
  const hat = (t, v) => noise({ ft: 'highpass', f0: 7800, dur: 0.035, vol: v, at: t }, music);
  const shaker = (t, v) => noise({ ft: 'bandpass', f0: 6200, q: 1.4, dur: 0.07, vol: v, att: 0.02, at: t }, music);
  const clap = (t, v) => { for (const dt of [0, 0.012, 0.024]) noise({ ft: 'bandpass', f0: 1400, q: 1.1, dur: 0.09, vol: v, at: t + dt, send: 0.2 }, music); };

  // ---- the effects ---------------------------------------------------------------------------------
  let coinCombo = 0, coinLast = 0, stepN = 0;
  const PATCHES = {
    // a two-note "ting" that climbs a semitone at a time while coins keep landing
    coin: () => {
      const now = ctx.currentTime;
      coinCombo = now - coinLast < 0.4 ? Math.min(coinCombo + 1, 9) : 0; coinLast = now;
      const k = Math.pow(2, coinCombo / 12) * vary(0.008);
      tone({ type: 'sine', f0: 1319 * k, dur: 0.06, vol: 0.17, send: 0.08 });
      tone({ type: 'sine', f0: 1760 * k, dur: 0.16, vol: 0.19, at: now + 0.045, send: 0.12 });
      tone({ type: 'triangle', f0: 3520 * k, dur: 0.05, vol: 0.02, at: now + 0.045 });
    },
    cash: () => { if (!sample('cash', { vol: 0.9, rate: vary(0.04), send: 0.08 })) PATCHES.coin(); },
    tap: () => { if (!sample('tap', { vol: 0.4, rate: vary(0.03) })) tone({ type: 'sine', f0: 1000, dur: 0.03, vol: 0.15 }); },
    drop: () => { if (!sample('drop', { vol: 0.45, rate: vary(0.1) })) tone({ type: 'sine', f0: 520, dur: 0.06, vol: 0.2 }); },
    pop: () => { if (!sample(Math.random() < 0.5 ? 'pop' : 'pop2', { vol: 0.48, rate: vary(0.08) })) tone({ type: 'triangle', f0: 220, f1: 70, dur: 0.12, vol: 0.3 }); },
    plate: () => { if (!sample('plate', { vol: 0.55, rate: vary(0.06), send: 0.1 })) tone({ type: 'sine', f0: 1800, dur: 0.12, vol: 0.08 }); },
    ding: () => mallet(84, ctx.currentTime, 0.13, 0.9, { bus: sfx, send: 0.25 }),
    chime: () => {
      if (!sample('chime', { vol: 0.5, send: 0.18 })) { const t = ctx.currentTime; [76, 81, 88].forEach((m, i) => mallet(m, t + i * 0.06, 0.1, 0.7, { bus: sfx })); }
    },
    whoosh: () => { if (!sample('whoosh', { vol: 0.5 })) noise({ ft: 'bandpass', f0: 400, f1: 3000, q: 0.8, dur: 0.35, vol: 0.12, att: 0.1 }); },
    open: () => { if (!sample('open', { vol: 0.4 })) PATCHES.tap(); },
    close: () => { if (!sample('close', { vol: 0.4 })) PATCHES.tap(); },
    build: () => {
      const t = ctx.currentTime;
      if (!sample('build', { vol: 0.8, send: 0.12 })) noise({ ft: 'lowpass', f0: 200, f1: 2000, dur: 0.3, vol: 0.25 });
      [72, 76, 79, 84].forEach((m, i) => mallet(m, t + 0.12 + i * 0.07, 0.09, 0.8, { bus: sfx, send: 0.3 }));
    },
    step: () => { stepN = (stepN + 1) % 3; if (!sample('step' + (stepN + 1), { vol: 0.22, rate: vary(0.06) })) noise({ ft: 'bandpass', f0: 1200, q: 1, dur: 0.04, vol: 0.1 }); },
    clean: () => {
      if (!sample('clean', { vol: 0.6, rate: vary(0.05) })) noise({ ft: 'highpass', f0: 1500, f1: 4200, q: 0.5, dur: 0.16, vol: 0.055, att: 0.02 });
      const t = ctx.currentTime; [88, 93].forEach((m, i) => mallet(m, t + 0.25 + i * 0.05, 0.05, 0.5, { bus: sfx, send: 0.3 }));
    },
    angry: () => tone({ type: 'square', f0: 180, dur: 0.15, vol: 0.12, lp: 900 }),
    penalty: () => {
      const t = ctx.currentTime;
      tone({ type: 'triangle', f0: 310, f1: 155, dur: 0.18, vol: 0.13, at: t });
      tone({ type: 'sine', f0: 210, f1: 140, dur: 0.22, vol: 0.08, at: t + 0.08 });
    },
    // the pets: a "mee-ow" and a purr, a soft double woof, squeaks
    petCat: () => {
      const t = ctx.currentTime;
      // "mee-ow": a bright rise then a falling vowel, through a resonant filter that gives it a mouth
      tone({ type: 'sawtooth', f0: 560, f1: 880, dur: 0.14, vol: 0.16, lp: 2600, q: 6, at: t });
      tone({ type: 'sawtooth', f0: 900, f1: 540, glide: 0.24, dur: 0.28, vol: 0.18, lp: 2000, q: 7, at: t + 0.12 });
      // the purr: filtered noise, pulsing 26 times a second
      if (!ctx || voices >= 40) return;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; track(src);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      const am = ctx.createGain(); am.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 26; const depth = ctx.createGain(); depth.gain.value = 0.5; lfo.connect(depth); depth.connect(am.gain);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + 0.3); g.gain.exponentialRampToValueAtTime(0.24, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      src.connect(lp); lp.connect(am); am.connect(g); out(g, sfx, 0);
      src.start(t + 0.3); lfo.start(t + 0.3); src.stop(t + 1.35); lfo.stop(t + 1.35);
    },
    petDog: () => {
      const t = ctx.currentTime;
      for (const [dt, f] of [[0, 210], [0.19, 235]]) {
        tone({ type: 'sawtooth', f0: f, f1: f * 0.62, dur: 0.13, vol: 0.26, lp: 1100, q: 4, at: t + dt });
        noise({ ft: 'bandpass', f0: 700, q: 1.5, dur: 0.06, vol: 0.1, at: t + dt });
      }
    },
    petBunny: () => { const t = ctx.currentTime; [0, 0.09].forEach((dt, i) => tone({ type: 'sine', f0: 1500 + i * 200, f1: 2200 + i * 200, dur: 0.07, vol: 0.2, at: t + dt })); },
    petHamster: () => { const t = ctx.currentTime; [0, 0.06, 0.12].forEach((dt, i) => tone({ type: 'sine', f0: 2300 + i * 150, f1: 2900 + i * 150, dur: 0.05, vol: 0.15, at: t + dt })); },
    pour: () => {
      noise({ ft: 'bandpass', f0: 1800, f1: 650, q: 0.7, dur: 0.22, vol: 0.08, att: 0.02 });
      tone({ type: 'sine', f0: 540, f1: 380, dur: 0.18, vol: 0.06 });
    },
    // the delivery van: a friendly two-note car horn, beep-beeep (a soft single beep-beep to remind)
    horn: () => {
      const t = ctx.currentTime;
      for (const [at, len] of [[0, 0.15], [0.22, 0.32]]) {
        tone({ type: 'sawtooth', f0: 392, dur: len, vol: 0.13, at: t + at, lp: 1500, att: 0.01, hold: 0.8 });
        tone({ type: 'sawtooth', f0: 494, dur: len, vol: 0.1, at: t + at, lp: 1500, att: 0.01, hold: 0.8 });
      }
    },
    hornSoft: () => {
      const t = ctx.currentTime;
      for (const at of [0, 0.19]) {
        tone({ type: 'sawtooth', f0: 392, dur: 0.12, vol: 0.08, at: t + at, lp: 1300, att: 0.01, hold: 0.75 });
        tone({ type: 'sawtooth', f0: 494, dur: 0.12, vol: 0.06, at: t + at, lp: 1300, att: 0.01, hold: 0.75 });
      }
    },
    // the big moments: a rising electric-piano arpeggio, the chord held, mallets sparkling on top
    fanfare: () => {
      const t = ctx.currentTime;
      [60, 64, 67, 72].forEach((m, i) => ep(m + 12, t + i * 0.1, 0.14, 0.5, { bus: sfx, send: 0.25 }));
      [60, 64, 67, 71].forEach(m => ep(m, t + 0.42, 0.08, 1.6, { bus: sfx, send: 0.35 }));
      [84, 88, 91, 96].forEach((m, i) => mallet(m, t + 0.5 + i * 0.07, 0.06, 0.9, { bus: sfx, send: 0.4 }));
      if (!sample('cash', { vol: 0.7, at: t + 0.4 })) noise({ ft: 'highpass', f0: 5000, dur: 0.2, vol: 0.03, at: t + 0.4 });
    },
    pop2: () => noise({ ft: 'bandpass', f0: 900, f1: 300, q: 0.8, dur: 0.18, vol: 0.09 }),
  };

  // a level meter on the final output (for tuning: peak and loudness over the last ~45 ms)
  A.meter = () => {
    if (!ctx) return null;
    if (!A._an) { A._an = ctx.createAnalyser(); A._an.fftSize = 2048; comp.connect(A._an); A._buf = new Float32Array(2048); }
    A._an.getFloatTimeDomainData(A._buf);
    let pk = 0, s = 0; for (const v of A._buf) { pk = Math.max(pk, Math.abs(v)); s += v * v; }
    return { peak: pk, rms: Math.sqrt(s / A._buf.length) };
  };
  A.play = (name, opts = {}) => {
    if (!ctx || paused || hostMuted || !sfxOn) return;
    const p = PATCHES[name]; if (p) p(opts);
  };

  // ---- music -------------------------------------------------------------------------------------
  // chord shapes in semitones above the root
  const Q = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], maj: [0, 4, 7], min: [0, 3, 7], six9: [0, 4, 9, 14] };
  // voice a chord into a register (each tone lifted or dropped by octaves to sit between lo and lo+12)
  const voice = (root, q, lo) => Q[q].map(s => { let m = root + s; while (m < lo) m += 12; while (m >= lo + 12) m -= 12; return m; }).sort((a, b) => a - b);
  const PENTA = [0, 2, 4, 7, 9];

  const THEMES = {
    // a cosy café shuffle: electric-piano comping, mallet phrases, walking bass, brushes
    town: {
      bpm: 92, swing: 0.16,
      chords: [[48, 'maj7'], [45, 'm7'], [50, 'm7'], [43, 'dom7']],
      bar(t, s, chord, b, step, busy) {
        const [root, q] = chord;
        if (s === 0 || s === 6 || (s === 10 && b % 2 === 1)) voice(root, q, 55).forEach((m, i) => ep(m, t + i * 0.008, s === 0 ? 0.05 : 0.036, s === 0 ? 1.3 : 0.7));
        if (s === 0) bass(root - 12, t, 0.15, 0.5); if (s === 8) bass(root - 5, t, 0.12, 0.45); if (s === 14) bass(root - 13 + (b % 2 ? 2 : 0), t, 0.09, 0.3);
        if (s === 0 || s === 8) kick(t, busy ? 0.22 : 0.17); if (s === 4 || s === 12) rim(t, 0.05);
        if (s % 2 === 0 || busy) hat(t, s % 4 === 2 ? 0.028 : 0.016);
        melody(t, s, b, root, mallet, 72, 0.075);
      },
    },
    // an island strum: ukulele down-down-up, a shaker, a bouncing bass, a steel drum singing
    beach: {
      bpm: 106, swing: 0.1,
      chords: [[60, 'maj'], [65, 'maj'], [67, 'maj'], [60, 'maj'], [57, 'min'], [65, 'maj'], [67, 'maj'], [60, 'maj']],
      bar(t, s, chord, b, step, busy) {
        const [root, q] = chord;
        const strum = { 0: 1, 3: -1, 6: 1, 8: 1, 10: -1, 12: 1, 14: -1 }[s];
        if (strum) {
          const notes = voice(root, q, 60).concat([voice(root, q, 60)[0] + 12]);
          (strum > 0 ? notes : notes.slice().reverse()).forEach((m, i) => pluck(m, t + i * 0.014, strum > 0 ? 0.09 : 0.055, { len: strum > 0 ? 0.35 : 0.2, bright: 0.62 }));
        }
        if (s === 0 || s === 8) bass(root - 24, t, 0.15, 0.35); if (s === 6 || s === 14) bass(root - 17, t, 0.1, 0.25);
        if (s === 0 || s === 10) kick(t, busy ? 0.2 : 0.15);
        shaker(t, s % 2 ? 0.03 : 0.018); if (busy && s % 4 === 2) hat(t, 0.02);
        melody(t, s, b, root, steel, 76, 0.07);
      },
    },
    // a lounge groove: long electric-piano chords, a warm bass, brushes, a vibraphone line
    mall: {
      bpm: 82, swing: 0.2,
      chords: [[41, 'maj9'], [40, 'm7'], [38, 'm9'], [43, 'six9']],
      bar(t, s, chord, b, step, busy) {
        const [root, q] = chord;
        if (s === 0) voice(root, q, 53).forEach((m, i) => ep(m, t + i * 0.012, 0.056, 2.6, { send: 0.45 }));
        if (s === 10) voice(root, q, 60).slice(1).forEach((m, i) => ep(m, t + i * 0.01, 0.036, 0.9, { send: 0.45 }));
        if (s === 0) bass(root - 12 + 12, t, 0.15, 0.7); if (s === 7) bass(root - 5 + 12, t, 0.1, 0.4); if (s === 12) bass(root + 12, t, 0.11, 0.35);
        if (s === 0 || (s === 10 && busy)) kick(t, 0.16);
        if (s % 4 === 2) noise({ ft: 'bandpass', f0: 3200, q: 0.7, dur: 0.12, vol: busy ? 0.03 : 0.02, att: 0.03, at: t }, music);
        if (s === 12) rim(t, 0.035);
        melody(t, s, b, root, mallet, 72, 0.06);
      },
    },
  };
  // the Pet Party: the café's chords, pumped — four on the floor, claps, plucked arpeggios
  const PARTY = {
    bpm: 124, swing: 0,
    bar(t, s, chord, b) {
      const [root, q] = chord;
      if (s % 4 === 0) kick(t, 0.22); if (s === 4 || s === 12) clap(t, 0.06); if (s % 4 === 2) hat(t, 0.035);
      const arp = voice(root, q, 64); pluck(arp[s % arp.length] + (s >= 8 ? 12 : 0), t, 0.06, { len: 0.18, bright: 0.7 });
      if (s % 2 === 0) bass(root - 12 + (s % 4 === 2 ? 12 : 0), t, 0.12, 0.18);
    },
  };
  // melodies: short pentatonic phrases every other bar, then space — a hook, not a wall of notes
  const PHRASES = [[[0, 2], [4, 3], [6, 4], [8, 2], [12, 1]], [[0, 4], [3, 3], [6, 2], [10, 1]], [[2, 2], [4, 4], [8, 3], [10, 2], [12, 0]], [[0, 0], [4, 1], [8, 2], [11, 4]]];
  function melody(t, s, b, root, inst, lo, vol) {
    if (b % 2 === 1) return;
    const ph = PHRASES[(b / 2 | 0) % PHRASES.length];
    for (const [at, deg] of ph) if (at === s) { const pc = ((root % 12) + PENTA[deg]) % 12; let m = lo + pc; if (m > lo + 12) m -= 12; inst(m, t, vol, 0.9); }
  }

  let theme = 'town', phase = 'morning', partyOn = false, nextT = 0, step = 0, bar = 0;
  A.setTheme = th => { if (!THEMES[th] || th === theme) return; theme = th; step = 0; bar = 0; nextT = 0; };
  A.setParty = on => { partyOn = !!on; step = 0; nextT = 0; };
  A.setMusicPhase = p => { phase = p || 'morning'; };
  A.musicUpdate = () => {
    if (!ctx || !music || paused || hostMuted || !musicOn || ctx.state !== 'running') { nextT = 0; return; }
    const T = THEMES[theme] || THEMES.town, busy = phase === 'rush';
    const cfg = partyOn ? PARTY : T;
    const bpm = partyOn ? PARTY.bpm : T.bpm * (busy ? 1.1 : 1), sixteenth = 60 / bpm / 4;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.06;
    while (nextT < ctx.currentTime + 0.2) {
      const chord = T.chords[bar % T.chords.length];
      const swing = step % 2 ? (cfg.swing || 0) * sixteenth : 0;
      cfg.bar(nextT + swing, step, chord, bar, step, busy);
      nextT += sixteenth; step++;
      if (step === 16) { step = 0; bar++; }
    }
  };

  return A;
}
