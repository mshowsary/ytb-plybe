// test/photographer.test.js — Batch 4b, the Photographer (plan 3.9): "hired from photoDesk1,
// auto-takes Good shots at photo1". Mirrors the barista's own gating shape (a two-tier hire ladder,
// STAFF.photographer already landed in economyConfig) and photo1's own SIM contract (Batch 2's
// stepPhotoBooth/resolvePhotoShot) rather than inventing either.
//
// What's pinned here:
//   STAND   the photographer walks to photo1 and stands beside its front — off the customer queue
//           AND off the exact front spot the owner themselves would use (two r=0.30 bodies need
//           0.6m; see photographerSpot's own comment in src/sim/staff.js) — and, once close enough
//           (the SAME radius systems/photo.js judges the owner's own presence by), marks the booth
//           'serving'.
//   RESOLVE a running session is called by the photographer itself well before PHOTO_AUTO_RESOLVE's
//           anonymous 1.6s timeout, always 'good', never 'perfect' (resolvePhotoShot's own clamp —
//           this file only ever passes 'good', so there is nothing else it could come back as).
//   LEVEL 2 a second hired photographer shortens the think time (PHOTOGRAPHER_SHOT_SECONDS_LEVEL2)
//           and the two of them settle on opposite sides of the booth rather than stacking.
//   IDLE    with no active photo booth at all (a hand-edited/inconsistent save — the real zone
//           chain makes z_photo a hard ancestor of z_photographer, so this cannot happen from
//           normal play), the photographer parks at spawn: no stall, no crash.
//   PERSIST photographerSpawnAllowed (src/sim/staffState.js) gates spawning on z_photographer being
//           built, mirroring how a runner's assignment (never its existence) is the thing that gets
//           dropped when its target disappears.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive, stepPhotoBooth, PHOTO_AUTO_RESOLVE } from '../src/sim/world.js';
import {
  createStaff, stepStaff, PHOTOGRAPHER_SHOT_SECONDS, PHOTOGRAPHER_SHOT_SECONDS_LEVEL2,
} from '../src/sim/staff.js';
import { photographerSpawnAllowed } from '../src/sim/staffState.js';

// Builds every zone in AREA1.zones' own array order up to and including `throughId` — identical in
// shape to test/spa-foundation.test.js's own helper of the same name. Because z_splash requires
// z_photo (data/area1.js), this always brings photo1 online along the way to z_photographer: there
// is no reachable save where the photographer's zone exists but photo1's doesn't.
function buildThrough(w, throughId) {
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === throughId) break;
  }
  refreshActive(w);
}
function photoStation(w) {
  for (const st of w.stations.values()) if (st.type === 'photo') return st;
  return null;
}
function forceSession(st, t = 0) {
  st.session = { customerId: 1, species: 'cat', variant: 0, tier: 0, t, resolved: false, quality: null, tip: 0 };
}
// Mirrors the real per-tick order used by both src/game.js (photoStudio.update before staff.update)
// and tools/bot.js (stepPhotoBooth before stepStaff): the booth's own session clock ticks first,
// then the photographer reacts to it and (if it just arrived) marks 'serving' for the tick after.
function tick(list, w, dt) { stepPhotoBooth(w, dt); stepStaff(list, w, dt, () => {}); }
function run(list, w, seconds) { for (let t = 0; t < seconds; t += 1 / 30) tick(list, w, 1 / 30); }

test('a hired photographer walks to photo1 and stands off both the queue and the exact front spot', () => {
  const w = createWorld(AREA1, {}, 1);
  buildThrough(w, 'z_photographer');
  const st = photoStation(w);
  const desk = w.stations.get('photoDesk1');
  assert.ok(desk && desk.active, 'photoDesk1 must be active once z_photographer is built');
  const photographer = createStaff('photographer', desk.front);
  run([photographer], w, 20);
  assert.equal(photographer.mover.teleports, 0, 'a genuine, reachable stand spot must never need a teleport rescue');
  const distFront = Math.hypot(photographer.x - st.front.x, photographer.z - st.front.z);
  const distQueue0 = Math.hypot(photographer.x - st.queue[0].x, photographer.z - st.queue[0].z);
  assert.ok(distFront >= 0.6, `must clear the owner's own serve spot by >= 0.6m, got ${distFront}`);
  assert.ok(distQueue0 >= 0.6, `must clear the customer queue by >= 0.6m, got ${distQueue0}`);
});

test('once positioned, the photographer marks the booth "serving" using the owner\'s own proximity radius', () => {
  const w = createWorld(AREA1, {}, 2);
  buildThrough(w, 'z_photographer');
  const st = photoStation(w);
  // Spawn at photoDesk1's own FRONT (the same free point systems/staff.js actually spawns from —
  // its raw x/z sits on the desk's own collision footprint, a blocked cell no real spawn ever uses).
  const desk = w.stations.get('photoDesk1');
  const photographer = createStaff('photographer', desk.front);
  run([photographer], w, 20);
  assert.equal(st.serving, true);
});

test('a lone photographer resolves a running session as good well before PHOTO_AUTO_RESOLVE, never perfect', () => {
  const w = createWorld(AREA1, {}, 3);
  buildThrough(w, 'z_photographer');
  const st = photoStation(w);
  const desk = w.stations.get('photoDesk1');
  const photographer = createStaff('photographer', desk.front);
  run([photographer], w, 20); // let it walk all the way from photoDesk1 and settle into position
  assert.equal(st.serving, true);
  forceSession(st);
  let resolvedAt = null;
  for (let t = 0; t < PHOTO_AUTO_RESOLVE + 0.1; t += 1 / 30) {
    tick([photographer], w, 1 / 30);
    if (st.session.resolved && resolvedAt === null) resolvedAt = t;
  }
  assert.ok(resolvedAt !== null, 'the session must resolve');
  assert.ok(resolvedAt < PHOTO_AUTO_RESOLVE, `must beat the anonymous auto-resolve timeout, resolved at ${resolvedAt}`);
  assert.ok(resolvedAt <= PHOTOGRAPHER_SHOT_SECONDS + 0.1, `should resolve around the level-1 think time, got ${resolvedAt}`);
  assert.equal(st.session.quality, 'good', 'a photographer-run shot is always Good, never Perfect');
  assert.ok(st.session.tip > 0);
});

test('hiring a second photographer shortens the think time, and the two settle on opposite sides', () => {
  const w = createWorld(AREA1, {}, 4);
  buildThrough(w, 'z_photographer');
  const st = photoStation(w);
  const desk = w.stations.get('photoDesk1');
  const p1 = createStaff('photographer', desk.front);
  const p2 = createStaff('photographer', desk.front);
  const list = [p1, p2];
  run(list, w, 20);
  assert.equal(st.serving, true);
  // photographerSpot's preferLeft split: with both bodies settled, they must not be sharing a spot.
  assert.ok(Math.hypot(p1.x - p2.x, p1.z - p2.z) >= 0.6, 'the two photographers must clear each other by >= 0.6m');
  forceSession(st);
  let resolvedAt = null;
  for (let t = 0; t < PHOTOGRAPHER_SHOT_SECONDS + 0.1; t += 1 / 30) {
    tick(list, w, 1 / 30);
    if (st.session.resolved && resolvedAt === null) resolvedAt = t;
  }
  assert.ok(resolvedAt !== null && resolvedAt <= PHOTOGRAPHER_SHOT_SECONDS_LEVEL2 + 0.1,
    `two photographers should resolve by the level-2 think time, got ${resolvedAt}`);
  assert.equal(st.session.quality, 'good');
});

test('with no active photo booth, the photographer parks at spawn instead of stalling', () => {
  const w = createWorld(AREA1, {}, 5);
  buildThrough(w, 'z_photographer'); // z_splash's own chain always builds z_photo first (see above)
  // Simulate the one save shape this cannot reach through normal play: an inconsistent state where
  // the booth exists but is not active.
  photoStation(w).active = false;
  const spawn = { x: 14.5, z: 3.7 };
  const photographer = createStaff('photographer', spawn);
  run([photographer], w, 3);
  assert.ok(Math.hypot(photographer.x - spawn.x, photographer.z - spawn.z) < 0.1, 'parks at spawn, not mid-walk to nowhere');
});

test('photographerSpawnAllowed gates on z_photographer alone, matching how it is used by prepare()', () => {
  assert.equal(photographerSpawnAllowed(new Set()), false);
  assert.equal(photographerSpawnAllowed(new Set(['z_spa', 'z_groom', 'z_bath', 'z_boutique'])), false);
  assert.equal(photographerSpawnAllowed(new Set(['z_photographer'])), true);
  // Every builtSet shape createWorld/save.js actually produce: a Set (live world.built), a plain
  // array (a raw save's `builds` list before createWorld wraps it) and undefined (a save with no
  // staff at all yet).
  assert.equal(photographerSpawnAllowed(['z_photographer']), true);
  assert.equal(photographerSpawnAllowed(undefined), false);
});
