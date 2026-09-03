// src/audio/synth.js — tiny procedural WebAudio synth (no samples, no fetch).
// Nothing here touches window/AudioContext until unlock() is called, so the module is safe to import under node:test.
export function createAudio() {
  let ctx = null, master = null, comp = null, sfx = null, noiseBuf = null, voices = 0;
  let hostMuted = false, sfxOn = true;

  const A = {};
  Object.defineProperty(A, 'muted', { get: () => hostMuted || !sfxOn, enumerable: true });

  A.unlock = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const C = typeof AudioContext !== 'undefined' ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!C) return;
    try { ctx = new C(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = A.muted ? 0 : 1;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    const len = ctx.sampleRate | 0; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };
  const applyMaster = () => { if (ctx && master) master.gain.setTargetAtTime(A.muted ? 0 : 1, ctx.currentTime, 0.03); };
  A.setHostMute = b => { hostMuted = !!b; applyMaster(); };
  A.setSfx = b => { sfxOn = !!b; applyMaster(); };

  function tone(o) {
    if (!ctx || voices >= 24) return;
    const t = o.at != null ? o.at : ctx.currentTime; voices++; setTimeout(() => voices--, (o.dur + 0.1) * 1000);
    const os = ctx.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f0, t);
    if (o.detune) os.detune.value = o.detune;
    if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.att || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = os;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(sfx);
    os.start(t); os.stop(t + o.dur + 0.05);
  }
  function noise(o) {
    if (!ctx || voices >= 24) return;
    const t = o.at != null ? o.at : ctx.currentTime; voices++; setTimeout(() => voices--, (o.dur + 0.1) * 1000);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + o.dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(sfx);
    s.start(t); s.stop(t + o.dur + 0.05);
  }

  const PATCHES = {
    coin: () => { const k = 1 + (Math.random() * 2 - 1) * 0.03; tone({ type: 'sine', f0: 880 * k, f1: 1760 * k, dur: 0.09, vol: 0.25 }); },
    pop: () => tone({ type: 'triangle', f0: 220, f1: 70, dur: 0.12, vol: 0.3 }),
    drop: () => tone({ type: 'sine', f0: 520, dur: 0.06, vol: 0.2 }),
    ding: () => tone({ type: 'triangle', f0: 1320, dur: 0.4, vol: 0.22 }),
    chime: () => { if (!ctx) return; const t = ctx.currentTime; [660, 880, 1320].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.25, vol: 0.2, at: t + i * 0.06 })); },
    build: () => {
      noise({ ft: 'lowpass', f0: 200, f1: 2000, dur: 0.3, vol: 0.25 });
      if (!ctx) return; const t = ctx.currentTime;
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
  return A;
}
