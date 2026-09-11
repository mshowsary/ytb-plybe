// src/render/daylight.js — time of day for the four-minute shift (program plan §5.1 / §5.2).
//
// WHY THIS EXISTS
// The look used to be a single warm-locked lighting rig plus a sepia grade baked into post.js.
// Every hour of the day read the same tan. This module is the one place that owns "what colour is
// the light right now": sun colour/intensity/ELEVATION, hemisphere sky+ground, the sky sphere
// gradient, fog, the post-grade warmth/exposure/shadow tint, and the after-dark interior glow.
//
// Everything below is data + lerps. `sampleDaylight` is pure and importable without a WebGL
// context so the keyframe table can be tested directly; `createDaylight` binds it to a scene.
//
// COST
// Called once per frame from the frame loop, but it early-outs unless shift time actually moved
// (~0.3 s of sim time) or Golden Hour changed. A full apply is a handful of colour writes plus one
// 325-vertex sky repaint, so at 60 fps this is a few hundred float writes per second.

import * as THREE from 'three';
import { DAY_LENGTH } from '../sim/day.js';

// Colours are authored in sRGB hex. THREE.Color stores linear-sRGB internally (ColorManagement is
// on by default in three r15x+), so `.lerp` between two of these interpolates in LINEAR space —
// which is what keeps a dawn→midday blend from going muddy through the middle.
//
// `elevation`/`azimuth` are degrees. Azimuth 0 looks down +z (toward the camera side), +90 is +x
// (east in data/area1.js terms), so the table walks the sun from the east at dawn to the west at
// dusk and the shadow direction sweeps across the floor with it. Elevation never drops below ~14°:
// the directional shadow camera is a ±14 m ortho box and a lower sun throws shadows out of it.
export const KEYFRAMES = [
  {
    t: 0, name: 'dawn',
    sun: '#FFE8C8', sunI: 1.6, elevation: 15, azimuth: 100,
    hemiSky: '#DCEBFF', hemiGround: '#C9D8C0', hemiI: 0.74, fill: '#D9E8FF', fillI: 0.30,
    skyTop: '#BFD9FF', skyHorizon: '#FFE6D0', fog: '#EAF2F8',
    shadowTint: '#FFFFFF', exposure: 1.05, warmth: 0.02,
    lights: 0, interior: 0.14,
  },
  {
    t: 45, name: 'morning',
    sun: '#FFFFFF', sunI: 2.3, elevation: 40, azimuth: 78,
    hemiSky: '#EAF3FF', hemiGround: '#D6E2CC', hemiI: 0.82, fill: '#D9E8FF', fillI: 0.32,
    skyTop: '#9FCBFF', skyHorizon: '#E8F2FF', fog: '#F2F6F9',
    // The plan asks for warmth −0.04 here. Measured on screen, −0.04 shifts the lit floor to
    // R−B = −1, i.e. it cancels the new cream floor exactly and the room reads grey. Half of it
    // keeps morning the coolest, crispest light of the day and still lets the cream read.
    shadowTint: '#FFFFFF', exposure: 1.06, warmth: -0.02,
    lights: 0, interior: 0,
  },
  {
    t: 130, name: 'midday',
    sun: '#FFFDF7', sunI: 2.4, elevation: 60, azimuth: 30,
    hemiSky: '#F2F7FF', hemiGround: '#D9E3CF', hemiI: 0.85, fill: '#D9E8FF', fillI: 0.30,
    skyTop: '#8FC3FF', skyHorizon: '#E6F1FF', fog: '#F4F7FA',
    shadowTint: '#FFFFFF', exposure: 1.05, warmth: -0.012,
    lights: 0, interior: 0,
  },
  {
    t: 175, name: 'afternoon',
    sun: '#FFE9B8', sunI: 2.1, elevation: 42, azimuth: -10,
    hemiSky: '#F0E8FF', hemiGround: '#D2C8B8', hemiI: 0.80, fill: '#DCE6FF', fillI: 0.30,
    skyTop: '#7FB0F5', skyHorizon: '#FFD9B0', fog: '#F3E9DE',
    shadowTint: '#FFFFFF', exposure: 1.06, warmth: 0.02,
    lights: 0, interior: 0.05,
  },
  {
    t: 215, name: 'sunset',
    sun: '#FF9E6A', sunI: 1.5, elevation: 18, azimuth: -42,
    // Owner feedback, playing on a phone: at dusk "the floor, furniture and characters are hard to
    // distinguish" even though the mood itself should stay. hemiI/fillI raised here so bodies and
    // floor already read before the sun finishes dropping, not just at the very last keyframe.
    // skyTop/skyHorizon/fog untouched — the mood lives in the sky, not the ambient floor.
    hemiSky: '#D9C4FF', hemiGround: '#8C7A9E', hemiI: 0.85, fill: '#A8BFFF', fillI: 0.5,
    skyTop: '#6C7FCF', skyHorizon: '#FF9F7A', fog: '#F5C7B4',
    // Cool shadows are what makes a warm sun read as low. The base grade stays neutral (§5.2);
    // only the last two keyframes tint, and they tint BLUE, never sepia.
    shadowTint: '#E9EEFF', exposure: 1.09, warmth: 0.06,
    lights: 1, interior: 0.6,
  },
  {
    t: 240, name: 'dusk',
    // Sun stays cool/dim (colour untouched) — this is intensity only, so the low-angle blue key
    // light brightens without turning warm or losing "the sun is basically gone" read. Measured
    // (see below) it moves the needle far less than the ambient terms, so it is nudged rather than
    // carrying the fix — a strong low-angle key would also throw harder, longer shadows, which reads
    // as MORE contrast/gloom on a small screen even while the lit side gets brighter.
    sun: '#5E6FB8', sunI: 1.2, elevation: 14, azimuth: -52,
    // Measured with a canvas luma readback of an 852x393 screenshot (owner idle at the boot spot,
    // camera framing fixed, two fixed sample rects: the owner's torso, a bare floor-tile patch),
    // before vs. after this keyframe's edit, both against the SAME midday (t=130) reading:
    //   BEFORE (hemiI .62, hemiGround #2C3350, fillI .26, sunI .5, exposure 1.30):
    //     floor 60.5 / midday 206.8 = 29.2%   body 39.6 / midday 168.4 = 23.5%
    //   AFTER  (this keyframe): floor 136.6 / 206.8 = 66.1%   body 94.6 / 168.4 = 56.2%
    // Both clear the phone-readability bar (floor >=45%, body >=55%) with a margin. Getting there
    // took much more out of hemiI/hemiGround/fillI than out of sunI or exposure: the ambient terms
    // light every surface regardless of its angle to the (very low, near-set) sun, so they were the
    // efficient lever. hemiGround moved from a near-black navy to a lit slate-blue (still cool, never
    // sepia — §5.2) since the ground bounce is what lights faces and the floor from below/around.
    // skyTop/skyHorizon/fog/shadowTint (the actual "cozy evening" mood) are UNTOUCHED, so the sky and
    // shadow colour read exactly as dark and blue as before — only what stands on the floor got easier
    // to see.
    hemiSky: '#4A5A9C', hemiGround: '#747A9E', hemiI: 1.52, fill: '#CFE0FF', fillI: 1.12,
    skyTop: '#1E2A5A', skyHorizon: '#4C4E8C', fog: '#2E355C',
    shadowTint: '#DDE5FF', exposure: 1.42, warmth: 0.02,
    lights: 1, interior: 1,
  },
];

const COLOR_FIELDS = ['sun', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'fog', 'shadowTint', 'fill'];
const NUMBER_FIELDS = ['sunI', 'elevation', 'azimuth', 'hemiI', 'fillI', 'exposure', 'warmth', 'lights', 'interior'];

const PREPARED = KEYFRAMES.map(k => {
  const out = { t: k.t, name: k.name };
  for (const f of COLOR_FIELDS) out[f] = new THREE.Color(k[f]);
  for (const f of NUMBER_FIELDS) out[f] = k[f];
  return out;
});

const clamp01 = v => (v > 1 ? 1 : v < 0 ? 0 : v || 0);

export function createDaylightState() {
  const s = { name: '' };
  for (const f of COLOR_FIELDS) s[f] = new THREE.Color();
  for (const f of NUMBER_FIELDS) s[f] = 0;
  return s;
}

// Linear interpolation of the keyframe table at shift time `t` (seconds, 0..DAY_LENGTH).
export function sampleDaylight(t, out = createDaylightState()) {
  const time = Math.max(0, Math.min(DAY_LENGTH, Number.isFinite(t) ? t : 0));
  const last = PREPARED[PREPARED.length - 1];
  // Landing exactly on a keyframe must reproduce it bit for bit, so a keyframe time always starts
  // the NEXT segment (u = 0) and the final keyframe short-circuits — `a + (b - a) * 1` is not `b`.
  if (time >= last.t) {
    for (const f of COLOR_FIELDS) out[f].copy(last[f]);
    for (const f of NUMBER_FIELDS) out[f] = last[f];
    out.name = last.name;
    return out;
  }
  let i = 0;
  while (i < PREPARED.length - 2 && time >= PREPARED[i + 1].t) i++;
  const a = PREPARED[i], b = PREPARED[i + 1];
  const span = b.t - a.t;
  const u = span > 0 ? Math.max(0, Math.min(1, (time - a.t) / span)) : 0;
  for (const f of COLOR_FIELDS) out[f].copy(a[f]).lerp(b[f], u);
  for (const f of NUMBER_FIELDS) out[f] = a[f] + (b[f] - a[f]) * u;
  out.name = u < 0.5 ? a.name : b.name;
  return out;
}

// Golden Hour is a BOOST on whatever the clock already says, not a second palette. Nudging the
// existing keyframe keeps a golden hour at t=90 (bright day) distinct from one at t=200 (low sun)
// instead of collapsing both onto the same orange.
const GOLDEN_SUN = new THREE.Color('#FFC98A');
const GOLDEN_HEMI = new THREE.Color('#FFE7C4');
const GOLDEN_FOG = new THREE.Color('#F8DFC0');

export function applyGoldenBoost(state, k) {
  const f = clamp01(Number(k) || 0);
  if (f <= 0) return state;
  state.sun.lerp(GOLDEN_SUN, f * 0.55);
  state.hemiSky.lerp(GOLDEN_HEMI, f * 0.4);
  state.fog.lerp(GOLDEN_FOG, f * 0.45);
  state.sunI *= 1 + 0.16 * f;
  state.warmth += 0.05 * f;
  state.exposure += 0.03 * f;
  state.interior = Math.max(state.interior, 0.12 * f);
  return state;
}

// A soft round falloff, generated rather than shipped. Used by every glow sprite below.
function radialTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1, v = ((y + 0.5) / size) * 2 - 1;
      const r = Math.min(1, Math.sqrt(u * u + v * v));
      const a = Math.pow(1 - r, 2.4);
      const i = (y * size + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// After dark the café is lit from within. No point lights: three shadowless point lights would
// still cost a per-fragment loop on every toon material in the room for a look we can fake exactly
// with five additive draw calls that are hidden outright while the sun is up.
function buildNightLayer(S, area) {
  const scene = S && S.scene;
  if (!scene) return { set() {}, dispose() {} };

  const W = (area && area.size && area.size.w) || 20;
  const D = (area && area.size && area.size.d) || 14;
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 4;
  scene.add(group);

  const glowTex = radialTexture(64);
  const additive = hex => new THREE.MeshBasicMaterial({
    map: glowTex, color: new THREE.Color(hex), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });

  const stringMat = additive('#FFD9A0');
  const lampMat = additive('#FFC98A');
  const poolMat = additive('#FFB861');
  // >1 so the pane crosses the bloom bright-pass threshold and reads as a light source, not paint.
  const paneMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FFE3A8').multiplyScalar(1.45), transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false,
  });

  const quadGeo = new THREE.PlaneGeometry(1, 1);
  const poolGeo = new THREE.CircleGeometry(2.05, 28).rotateX(-Math.PI / 2);
  const paneGeo = new THREE.PlaneGeometry(1.78, 1.28);

  function instanced(geo, mat, entries, quat) {
    const m = new THREE.InstancedMesh(geo, mat, entries.length);
    const mx = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
    entries.forEach((e, i) => {
      p.set(e[0], e[1], e[2]); s.setScalar(e[3] === undefined ? 1 : e[3]);
      mx.compose(p, quat, s); m.setMatrixAt(i, mx);
    });
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    m.renderOrder = 4;
    group.add(m);
    return m;
  }

  // Positions mirror render/ambience.js: three pendants over the service row, string bulbs along
  // the open east and south fence lines. Kept in sync by construction (same literals, same step).
  const PENDANT_X = [-5.2, 0.2, 5.6], PENDANT_Z = -3.5;
  const stringBulbs = [];
  for (let z = -5.8; z <= 5.8; z += 1.15) stringBulbs.push([W / 2 - 0.08, 1.28, z, 0.44]);
  for (let x = -8.8; x <= 8.8; x += 1.15) stringBulbs.push([x, 1.28, D / 2 - 0.08, 0.44]);

  const lampBulbs = PENDANT_X.map(x => [x, 2.82, PENDANT_Z, 1.15]);
  const flat = new THREE.Quaternion();
  const billboard = new THREE.Quaternion();
  const stringGlow = instanced(quadGeo, stringMat, stringBulbs, billboard);
  const lampGlow = instanced(quadGeo, lampMat, lampBulbs, billboard);
  const lampPool = instanced(poolGeo, poolMat, PENDANT_X.map(x => [x, 0.028, PENDANT_Z, 1]), flat);

  // Owner feedback (playing on a phone): at dusk the service row (above) was the only place with a
  // warm pool of light, so guests actually SEATED at tables sat in the dark. Pulled straight from
  // data/area1.js's own `type: 'seat'` stations rather than a second hardcoded literal table, so a
  // future layout change to the seating rows moves these pools with it for free. Bounded to the
  // INTERIOR room (|x|<=W/2, |z|<=D/2) so the terrace/spa regions — open-air, already ringed by the
  // fence's own string lights — don't also get an indoor pendant-pool look. Grouped into a handful
  // of clusters (not one pool per chair) because a 2.05 m pool already covers 2-3 chairs at the
  // ~1.4 m station spacing this area uses, same footprint as the service row's pools above.
  const interiorSeats = (area && area.stations || []).filter(s => s.type === 'seat' && Math.abs(s.x) <= W / 2 && Math.abs(s.z) <= D / 2);
  interiorSeats.sort((a, b) => a.x - b.x);
  const SEAT_POOL_CLUSTERS = Math.min(4, Math.max(1, Math.ceil(interiorSeats.length / 2)));
  const seatPoolEntries = [];
  if (interiorSeats.length) {
    const perCluster = Math.ceil(interiorSeats.length / SEAT_POOL_CLUSTERS);
    for (let i = 0; i < interiorSeats.length; i += perCluster) {
      const group2 = interiorSeats.slice(i, i + perCluster);
      const cx = group2.reduce((sum, s) => sum + s.x, 0) / group2.length;
      const cz = group2.reduce((sum, s) => sum + s.z, 0) / group2.length;
      seatPoolEntries.push([cx, 0.028, cz, 1]);
    }
  } else {
    // No seat stations in this area's data (e.g. a stub area passed to a test) — fall back to a
    // fixed spread across the room so the layer still degrades gracefully instead of lighting nothing.
    for (const z of [2.5, 4.5]) for (const x of [-6, 0, 6]) seatPoolEntries.push([x, 0.028, z, 1]);
  }
  const seatPoolMat = additive('#FFB861');
  const seatPool = instanced(poolGeo, seatPoolMat, seatPoolEntries, flat);
  // Windows are the merged north wall in props.js (x −5/0/5, y 1.7). The pane box front face sits
  // at z = −D/2 + 0.25, so this overlay hovers 20 mm in front of it, facing the room.
  const paneGlow = instanced(paneGeo, paneMat, [-5, 0, 5].map(x => [x, 1.7, -D / 2 + 0.27, 1]), flat);

  // The camera never rotates (scene.js pins yaw/pitch and only translates), so the sprite
  // orientation is computed once instead of every frame.
  let orientedAt = -1;
  const mx = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
  function orient() {
    if (!S.camera) return;
    billboard.copy(S.camera.quaternion);
    for (const [inst, entries] of [[stringGlow, stringBulbs], [lampGlow, lampBulbs]]) {
      entries.forEach((e, i) => {
        p.set(e[0], e[1], e[2]); s.setScalar(e[3]);
        mx.compose(p, billboard, s); inst.setMatrixAt(i, mx);
      });
      inst.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    set(lights, interior) {
      const L = clamp01(lights), I = clamp01(interior);
      const on = L > 0.012 || I > 0.012;
      group.visible = on;
      if (!on) return;
      if (orientedAt < 0) { orient(); orientedAt = 1; }
      stringMat.opacity = L * 0.85;
      lampMat.opacity = I * 0.9;
      poolMat.opacity = I * 0.72;
      seatPoolMat.opacity = I * 0.6;
      paneMat.opacity = I * 0.95;
      stringGlow.visible = L > 0.012;
      lampGlow.visible = lampPool.visible = paneGlow.visible = I > 0.012;
      seatPool.visible = I > 0.012;
    },
    dispose() {
      scene.remove(group);
      for (const m of [stringGlow, lampGlow, lampPool, seatPool, paneGlow]) m.dispose();
      for (const m of [stringMat, lampMat, poolMat, seatPoolMat, paneMat]) m.dispose();
      quadGeo.dispose(); poolGeo.dispose(); paneGeo.dispose(); glowTex.dispose();
    },
  };
}

export function createDaylight(S, area) {
  const state = createDaylightState();
  const night = buildNightLayer(S, area);
  let lastT = Number.NaN, lastGolden = Number.NaN, dirty = true;

  function apply(t, golden) {
    sampleDaylight(t, state);
    applyGoldenBoost(state, golden);

    if (S.sun) { S.sun.color.copy(state.sun); S.sun.intensity = state.sunI; }
    if (S.setSunAngles) S.setSunAngles(state.elevation, state.azimuth);
    if (S.hemi) {
      S.hemi.color.copy(state.hemiSky);
      S.hemi.groundColor.copy(state.hemiGround);
      S.hemi.intensity = state.hemiI;
    }
    // The fill is the room's bounce light. It goes COOL under a low sun (that is what makes the
    // sunset shadows read blue) and WARM after dark, where the only real light left is the lamps.
    if (S.fill) { S.fill.color.copy(state.fill); S.fill.intensity = state.fillI; }
    if (S.scene && S.scene.fog) S.scene.fog.color.copy(state.fog);
    if (S.setSky) S.setSky(state.skyTop, state.skyHorizon);

    const u = S.post && S.post.uniforms;
    if (u) {
      if (u.gradeWarmth) u.gradeWarmth.value = state.warmth;
      if (u.exposure) u.exposure.value = state.exposure;
      if (u.shadowTint) u.shadowTint.value.copy(state.shadowTint);
    }
    night.set(state.lights, state.interior);
  }

  const api = {
    // The string-light blend — 0 by day, rising through dusk — is the one number every "after dark"
    // effect outside this module keys on, so the fireflies and the interior glow agree on when
    // night is instead of each guessing from the clock.
    get lights() { return state.lights; },
    state,
    // Cheap per-frame guard: a shift second is 1/240th of the day, so re-applying only every
    // ~0.3 s of sim time is imperceptible and skips the sky repaint on ~19 of every 20 frames.
    update(t, golden = 0) {
      const g = clamp01(Number(golden) || 0);
      const time = Number.isFinite(t) ? t : 0;
      if (!dirty && Math.abs(time - lastT) < 0.3 && Math.abs(g - lastGolden) < 0.01) return api;
      dirty = false; lastT = time; lastGolden = g;
      apply(time, g);
      return api;
    },
    invalidate() { dirty = true; return api; },
    dispose() { night.dispose(); },
  };
  return api;
}
