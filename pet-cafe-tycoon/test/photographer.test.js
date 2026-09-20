// test/photographer.test.js — the Photographer: hired at the staff desk (hire1) once the Pet camera
// exists (z_photo), arrives from the door like every hire (HIRE_SPAWN), and walks to whichever
// seated pet is posing to take the shot at quality Good. It was hired from the spa's photoDesk1
// until the spa was retired (2026-09-19), and it worked the photo1 booth until Batch B2 moved photos
// to the tables (docs/SHIP-PLAN-2026-09-19.md §1.3).
//
// What's pinned here:
//   STAND   the photographer walks to the posing pet and stands off it — never on the pet itself
//           (two r=0.30 bodies need 0.6m) — and, once close enough (the SAME POSE_SERVE_RADIUS
//           systems/photo.js judges the owner's own presence by), marks the pose 'serving'.
//   RESOLVE a running shot is called by the photographer itself well before PHOTO_AUTO_RESOLVE's
//           anonymous 1.6s timeout, always 'good', never 'perfect' (resolvePoseShot's own clamp —
//           this file only ever passes 'good', so there is nothing else it could come back as).
//   LEVEL 2 a second hired photographer shortens the think time (PHOTOGRAPHER_SHOT_SECONDS_LEVEL2)
//           and the two of them settle on opposite sides of the pet rather than stacking.
//   IDLE    with nothing posing (most of a shift), the photographer parks at spawn: no stall, no
//           crash, no walking toward a pet that is not there.
//   PERSIST photographerSpawnAllowed (src/sim/staffState.js) gates spawning on z_photo being built.
//   SPAWN   systems/staff.js and tools/bot.js both spawn the Photographer at HIRE_SPAWN, the door
//           every hire walks in from — never on the old spa lawn.
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive } from '../src/sim/world.js';
import {
  createStaff, stepStaff, PHOTOGRAPHER_SHOT_SECONDS, PHOTOGRAPHER_SHOT_SECONDS_LEVEL2,
} from '../src/sim/staff.js';
import { stepPetPoses, PHOTO_AUTO_RESOLVE, POSE_SERVE_RADIUS, POSE_GAP_MAX } from '../src/sim/petPose.js';
import { createCustomer } from '../src/sim/customers.js';
import { photographerSpawnAllowed } from '../src/sim/staffState.js';

// Builds every zone in AREA1.zones' own array order up to and including `throughId` (the same
// helper test/nav-regions.test.js uses). Through z_photo this also builds z_hire, the staff desk.
function buildThrough(w, throughId) {
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === throughId) break;
  }
  refreshActive(w);
}
// Where systems/staff.js spawns every hire, the Photographer included (asserted from source below).
const HIRE_SPAWN = { x: -9.0, z: 4.2 };

function seatedGuest(w, id, species, variant, seatId) {
  const seat = w.stations.get(seatId);
  const c = createCustomer(id, species, 0, AREA1);
  c.petVariant = variant;
  seat.occupied = true;
  Object.assign(c, {
    state: 'eating', paid: true, seat, seatId, timer: 0,
    x: seat.pair.human.x, z: seat.pair.human.z,
  });
  Object.assign(c.mover, { x: c.x, z: c.z, hasTarget: false });
  return c;
}

// Mirrors the real per-tick order used by both src/game.js (customers -> photoStudio -> staff) and
// tools/bot.js: the pose steps first, then the photographer reacts to it and (if it just arrived)
// marks 'serving' for the tick after.
function tick(list, w, guests, dt) {
  stepPetPoses(w, guests, dt, { unlocked: true });
  stepStaff(list, w, dt, () => {});
}
function run(list, w, guests, seconds) { for (let t = 0; t < seconds; t += 1 / 30) tick(list, w, guests, 1 / 30); }
// Ticks until the photographer(s) have arrived and the shot has started, and stops THERE: a pose
// clears itself POSE_LINGER after the shot resolves, and everything about where they stood goes
// with it (they walk back to spawn, together).
function runUntilShot(list, w, guests, seconds = 10) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    tick(list, w, guests, 1 / 30);
    if (w.pose && w.pose.session) return true;
  }
  return false;
}
// Starts a pose without waiting out the 35-50s gap: the gap itself is pinned in test/photo.test.js.
function forcePose(w, guests) {
  w.poseGapT = 0;
  for (let t = 0; t < POSE_GAP_MAX && !w.pose; t += 1) stepPetPoses(w, guests, 1 / 30, { unlocked: true });
  assert.ok(w.pose, 'a pose must be live for this test');
  return w.pose;
}

test('a hired photographer walks from the door to the posing pet and stands off it, not on it', () => {
  const w = createWorld(AREA1, {}, 1);
  buildThrough(w, 'z_photo');
  assert.ok(w.stations.get('photoWall1').active, 'the Pet camera is bought');
  assert.ok(w.stations.get('hire1').active, 'the staff desk it is hired at is built on the way');
  const guests = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  const pose = forcePose(w, guests);
  const photographer = createStaff('photographer', HIRE_SPAWN);
  assert.ok(runUntilShot([photographer], w, guests), 'it must reach the pet and start the shot');
  assert.equal(photographer.mover.teleports, 0, 'a genuine, reachable stand spot must never need a teleport rescue');
  const d = Math.hypot(photographer.x - pose.x, photographer.z - pose.z);
  assert.ok(d >= 0.6, `must clear the pet's own body by >= 0.6m, got ${d.toFixed(2)}`);
  assert.ok(d <= POSE_SERVE_RADIUS, `and must be close enough to count as having come, got ${d.toFixed(2)}`);
});

test('once positioned, the photographer marks the pose "serving" using the owner\'s own radius', () => {
  const w = createWorld(AREA1, {}, 2);
  buildThrough(w, 'z_photo');
  const guests = [seatedGuest(w, 1, 'dog', 0, 'seat2')];
  forcePose(w, guests);
  const photographer = createStaff('photographer', HIRE_SPAWN);
  assert.ok(runUntilShot([photographer], w, guests), 'arriving IS the work: the shot is running');
});

test('a lone photographer resolves a running shot as good well before PHOTO_AUTO_RESOLVE, never perfect', () => {
  const w = createWorld(AREA1, {}, 3);
  buildThrough(w, 'z_photo');
  const guests = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  forcePose(w, guests);
  const photographer = createStaff('photographer', HIRE_SPAWN);
  assert.ok(runUntilShot([photographer], w, guests), 'it walks all the way from the door and starts the shot');
  let resolvedAt = null;
  for (let t = 0; t < PHOTO_AUTO_RESOLVE + 0.1; t += 1 / 30) {
    if (w.pose && w.pose.session && w.pose.session.resolved && resolvedAt === null) { resolvedAt = t; break; }
    tick([photographer], w, guests, 1 / 30);
  }
  assert.ok(resolvedAt !== null, 'the shot must resolve');
  assert.ok(resolvedAt < PHOTO_AUTO_RESOLVE, `must beat the anonymous auto-resolve timeout, resolved at ${resolvedAt}`);
  assert.ok(resolvedAt <= PHOTOGRAPHER_SHOT_SECONDS + 0.2, `should resolve around the level-1 think time, got ${resolvedAt}`);
  assert.equal(w.pose.session.quality, 'good', 'a photographer-run shot is always Good, never Perfect');
  assert.ok(w.pose.session.tip > 0);
  assert.equal(w.stations.get('seat1').pile, w.pose.session.tip, 'and the tip is on that pet\'s table');
});

test('hiring a second photographer shortens the think time, and the two settle on opposite sides', () => {
  const w = createWorld(AREA1, {}, 4);
  buildThrough(w, 'z_photo');
  const guests = [seatedGuest(w, 1, 'bunny', 0, 'seat3')];
  forcePose(w, guests);
  const p1 = createStaff('photographer', HIRE_SPAWN);
  const p2 = createStaff('photographer', HIRE_SPAWN);
  const list = [p1, p2];
  assert.ok(runUntilShot(list, w, guests), 'both walk in and the shot starts');
  assert.ok(Math.hypot(p1.x - p2.x, p1.z - p2.z) >= 0.6, 'the two photographers must clear each other by >= 0.6m');
  let resolvedAt = null;
  for (let t = 0; t < PHOTOGRAPHER_SHOT_SECONDS + 0.1; t += 1 / 30) {
    if (w.pose.session.resolved && resolvedAt === null) { resolvedAt = t; break; }
    tick(list, w, guests, 1 / 30);
  }
  assert.ok(resolvedAt !== null && resolvedAt <= PHOTOGRAPHER_SHOT_SECONDS_LEVEL2 + 0.2,
    `two photographers should resolve by the level-2 think time, got ${resolvedAt}`);
  assert.equal(w.pose.session.quality, 'good');
});

test('with nothing posing, the photographer parks at spawn instead of stalling', () => {
  const w = createWorld(AREA1, {}, 5);
  buildThrough(w, 'z_photo');
  const photographer = createStaff('photographer', HIRE_SPAWN);
  run([photographer], w, [], 3); // nobody seated, so no pose all shift
  assert.ok(!w.pose);
  assert.ok(Math.hypot(photographer.x - HIRE_SPAWN.x, photographer.z - HIRE_SPAWN.z) < 0.1,
    'parks at spawn, not mid-walk to nowhere');
});

test('photographerSpawnAllowed gates on z_photo alone, matching how it is used by prepare()', () => {
  assert.equal(photographerSpawnAllowed(new Set()), false);
  assert.equal(photographerSpawnAllowed(new Set(['z_hire', 'z_terrace'])), false, 'the desk alone is not enough: there is no camera');
  assert.equal(photographerSpawnAllowed(new Set(['z_photographer'])), false, 'the retired spa zone no longer opens the role');
  assert.equal(photographerSpawnAllowed(new Set(['z_photo'])), true);
  // Every builtSet shape createWorld/save.js actually produce: a Set (live world.built), a plain
  // array (a raw save's `builds` list before createWorld wraps it) and undefined (a save with no
  // staff at all yet).
  assert.equal(photographerSpawnAllowed(['z_photo']), true);
  assert.equal(photographerSpawnAllowed(undefined), false);
});

test('the Photographer spawns at HIRE_SPAWN in the game and in the bot, never on the old spa lawn', () => {
  const sys = readFileSync(new URL('../src/systems/staff.js', import.meta.url), 'utf8');
  assert.match(sys, /const HIRE_SPAWN = \{ x: -9\.0, z: 4\.2 \};/, 'systems/staff.js HIRE_SPAWN is the door spot this file walks from');
  assert.match(sys, /const PHOTOGRAPHER_SPAWN = HIRE_SPAWN;/);
  assert.match(sys, /createStaffSim\('photographer', PHOTOGRAPHER_SPAWN\)/, 'spawnPhotographer uses the door spawn');
  assert.doesNotMatch(sys, /photoDesk1|PHOTOGRAPHER_FALLBACK/, 'no trace of the spa desk or its lawn fallback');
  // prepare() is the call path from normal play: it spawns the hire once the gate allows it.
  assert.match(sys, /photographerSpawnAllowed\(world\.built\)\) spawnPhotographer\(\)/);
  const bot = readFileSync(new URL('../tools/bot.js', import.meta.url), 'utf8');
  assert.match(bot, /const HIRE_SPAWN = \{ x: -9\.0, z: 4\.2 \};/);
  assert.match(bot, /const PHOTOGRAPHER_SPAWN = HIRE_SPAWN;/);
  assert.match(bot, /createStaff\('photographer', PHOTOGRAPHER_SPAWN\)/);
  assert.doesNotMatch(bot, /photoDesk1|PHOTOGRAPHER_FALLBACK/);
});

test('the Workers sheet lists the Photographer once the Pet camera is bought, and not before', async () => {
  // Both halves. The positive one is here because the merge shipped a roleLock still asking for the
  // deleted photo1 booth: it answered 'hidden' for ever, buildWorkerRows skips a hidden lock, and the
  // role became unhireable while the bot went on buying it — a whole staff role with no door.
  const { buildKioskModel } = await import('../src/ui/models.js');
  const G = {
    coins: 999999, up: {}, staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0, photographer: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    staffList: [], meta: {}, dayState: { day: 30 },
  };
  const early = createWorld(AREA1, {}, 6);
  buildThrough(early, 'z_seats2');
  const before = buildKioskModel(G, early, 'workers').workers.map(r => r.kind);
  assert.equal(before.includes('photographer'), false, 'no row for a role with nothing to do yet');
  assert.ok(before.includes('runner'), 'the other roles are listed as before');

  const late = createWorld(AREA1, {}, 6);
  buildThrough(late, 'z_photo');
  assert.ok(late.stations.get('photoWall1').active, 'the camera is up');
  const rows = buildKioskModel(G, late, 'workers').workers;
  const row = rows.find(r => r.kind === 'photographer');
  assert.ok(row, 'the Photographer can be hired once the camera exists');
  assert.equal(row.hireCost, 3200);
  assert.equal(row.lock, undefined, 'and is offered, not locked behind a teaser');
});
