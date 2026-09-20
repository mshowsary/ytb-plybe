// Photos of pets at their tables (docs/SHIP-PLAN-2026-09-19.md §1.3). These tests pin the sim-layer
// contract of src/sim/petPose.js, which REPLACED the Pet Photo Studio booth: there is no queue, no
// station to stand at and no detour any more. A seated pet poses where it is, whoever walks up takes
// the shot, the tip lands on that pet's own table, and a pose nobody takes just ends.
//
// What this file used to pin, and why those tests are gone rather than weakened: a paid guest being
// ROUTED to photo1's queue (the detour the ship plan deletes — 40% of paid guests crossed the map
// for it), the queue cap that bounded that line, and the patience clock a guest ran down waiting at
// an unmanned booth. The behaviour they protected — "a missed photo is never a service failure" —
// is kept below, as "a pose nobody comes to ends quietly".
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { createCustomer, stepCustomers } from '../src/sim/customers.js';
import {
  stepPetPoses, resolvePoseShot, photoTipAmount, photoRingScale, photoJudgeQuality,
  PHOTO_AUTO_RESOLVE, PHOTO_RING_DURATION, PHOTO_RING_START, PHOTO_RING_END, PHOTO_TARGET_SCALE,
  POSE_GAP_MIN, POSE_GAP_MAX, POSE_MAX_SECONDS, POSE_LINGER,
} from '../src/sim/petPose.js';

const DT = 1 / 30;
const price = (k, seated) => (seated ? 6 : 5);

// Walks the zone `requires` chain up to (and including) `targetId`, paying each in full. Generic
// over the chain rather than hard-coding it, so a re-priced or re-ordered chain upstream cannot
// silently desync this helper.
function buildUpTo(w, targetId) {
  const zones = AREA1.zones;
  const need = [];
  let cur = zones.find(z => z.id === targetId);
  while (cur) { need.unshift(cur.id); cur = cur.requires ? zones.find(z => z.id === cur.requires) : null; }
  for (const id of need) { let guard = 0; while (!w.built.has(id) && guard++ < 2000) payZone(w, id, 1e9, 1); }
}

// A guest mid-meal at `seatId` — the only state a pose is ever chosen from.
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

// Steps poses until one starts, at one second a tick. Returns the seconds it took, or null.
function runToPose(w, list, opts = {}, limit = POSE_GAP_MAX + 5) {
  for (let t = 0; t <= limit; t += 1) {
    const pose = stepPetPoses(w, list, 1, opts);
    if (pose) return t;
  }
  return null;
}

test('nothing poses until the Pet camera is bought', () => {
  const w = createWorld(AREA1, {}, 1);
  buildUpTo(w, 'z_seats2');
  const list = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  for (let t = 0; t < POSE_GAP_MAX + 10; t += 1) stepPetPoses(w, list, 1, { unlocked: false });
  assert.equal(w.pose, null, 'no camera, no pose');
  assert.equal(w.poseGapT, null, 'and no clock running either');
});

test('with the camera bought, a seated pet poses within the authored gap', () => {
  const w = createWorld(AREA1, {}, 3);
  buildUpTo(w, 'z_photo');
  const list = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  const at = runToPose(w, list, { unlocked: true });
  assert.ok(at !== null, 'a pose should have started');
  assert.ok(at >= POSE_GAP_MIN && at <= POSE_GAP_MAX + 1, `first pose at ${at}s, outside ${POSE_GAP_MIN}-${POSE_GAP_MAX}`);
  const seat = w.stations.get('seat1');
  assert.equal(w.pose.seatId, 'seat1');
  assert.equal(w.pose.customerId, 1);
  // The bubble and the ring hang over the PET, not the person: the pet's own spot beside the table.
  assert.equal(w.pose.x, seat.pair.pet.x);
  assert.equal(w.pose.z, seat.pair.pet.z);
  assert.equal(w.pose.session, null, 'nobody has come to take it yet');
});

test('the clock only runs while somebody is seated: an empty cafe never banks up poses', () => {
  const w = createWorld(AREA1, {}, 4);
  buildUpTo(w, 'z_photo');
  for (let t = 0; t < POSE_GAP_MAX * 3; t += 1) stepPetPoses(w, [], 1, { unlocked: true });
  assert.ok(!w.pose);
  // Somebody sits down now; the full gap still has to pass before their pet poses.
  const list = [seatedGuest(w, 1, 'dog', 1, 'seat2')];
  const at = runToPose(w, list, { unlocked: true });
  assert.ok(at !== null && at >= POSE_GAP_MIN, `posed after ${at}s, which is less than the ${POSE_GAP_MIN}s gap`);
});

test('a pet the album has never seen is chosen over one it already holds', () => {
  const w = createWorld(AREA1, {}, 9);
  buildUpTo(w, 'z_photo');
  const known = seatedGuest(w, 1, 'cat', 0, 'seat1');
  const fresh = seatedGuest(w, 2, 'bunny', 2, 'seat2');
  const photographed = (species, variant) => species === 'cat' && variant === 0;
  const at = runToPose(w, [known, fresh], { unlocked: true, photographed });
  assert.ok(at !== null);
  assert.equal(w.pose.customerId, 2, 'the bunny nobody has photographed');
  assert.equal(w.pose.species, 'bunny');
  assert.equal(w.pose.variant, 2);
});

test('only ever one pose at a time, however many pets are sitting', () => {
  const w = createWorld(AREA1, {}, 11);
  buildUpTo(w, 'z_photo');
  const list = [
    seatedGuest(w, 1, 'cat', 0, 'seat1'), seatedGuest(w, 2, 'dog', 0, 'seat2'),
    seatedGuest(w, 3, 'bunny', 0, 'seat3'), seatedGuest(w, 4, 'hamster', 0, 'seat6'),
  ];
  assert.ok(runToPose(w, list, { unlocked: true }) !== null);
  const first = w.pose.customerId;
  // Long past the next gap: the live pose holds the slot until it ends on its own.
  for (let t = 0; t < POSE_MAX_SECONDS - 2; t += 1) stepPetPoses(w, list, 1, { unlocked: true });
  assert.ok(w.pose, 'still the same pose');
  assert.equal(w.pose.customerId, first);
});

test('a pose nobody comes to ends quietly: no loss, no anger, no event at all', () => {
  const w = createWorld(AREA1, {}, 13);
  buildUpTo(w, 'z_photo');
  const list = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  assert.ok(runToPose(w, list, { unlocked: true }) !== null);
  w.events.length = 0;
  for (let t = 0; t < POSE_MAX_SECONDS + 2; t += 1) stepPetPoses(w, list, 1, { unlocked: true });
  assert.equal(w.pose, null, 'the pose ended on its own');
  assert.equal(list[0].state, 'eating', 'and the guest never noticed');
  assert.ok(!w.events.some(e => e.type === 'lost' || e.type === 'angry'), 'a missed photo is not a service failure');
  assert.ok(!w.events.some(e => e.type === 'photo'), 'and nothing was paid');
});

test('the pose ends the moment its guest gets up', () => {
  const w = createWorld(AREA1, {}, 15);
  buildUpTo(w, 'z_photo');
  const guest = seatedGuest(w, 1, 'dog', 0, 'seat1');
  const list = [guest];
  assert.ok(runToPose(w, list, { unlocked: true }) !== null);
  guest.state = 'leave'; guest.seat = null; guest.seatId = null;
  stepPetPoses(w, list, DT, { unlocked: true });
  assert.equal(w.pose, null);
});

test('somebody walks up: the shot runs, auto-resolves as ok and tips that pet\'s own table', () => {
  const w = createWorld(AREA1, {}, 17);
  buildUpTo(w, 'z_photo');
  const list = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  assert.ok(runToPose(w, list, { unlocked: true }) !== null);
  const seat = w.stations.get('seat1');
  assert.equal(seat.pile, 0);
  w.events.length = 0;
  w.pose.serving = true; // the owner is within POSE_SERVE_RADIUS
  stepPetPoses(w, list, DT, { unlocked: true });
  assert.ok(w.pose.session, 'the shot starts');
  assert.ok(w.events.some(e => e.type === 'photoStart' && e.seatId === 'seat1'));
  let paid = null;
  for (let t = 0; t < PHOTO_AUTO_RESOLVE + 0.5 && !paid; t += DT) {
    stepPetPoses(w, list, DT, { unlocked: true });
    paid = w.events.find(e => e.type === 'photo') || null;
  }
  assert.ok(paid, 'an untouched shot resolves itself');
  assert.equal(paid.quality, 'ok');
  assert.equal(paid.seatId, 'seat1');
  assert.equal(paid.tip, photoTipAmount(0, 'ok'));
  assert.equal(seat.pile, photoTipAmount(0, 'ok'), 'the tip is on the table, as a pile to sweep');
  // It lingers a beat so the polaroid can fly, then the pose is over.
  for (let t = 0; t < POSE_LINGER + 0.2; t += DT) stepPetPoses(w, list, DT, { unlocked: true });
  assert.equal(w.pose, null);
});

test('resolvePoseShot pays tier + quality correctly and is idempotent past the first call', () => {
  const w = createWorld(AREA1, {}, 19);
  buildUpTo(w, 'z_photo');
  const list = [seatedGuest(w, 1, 'dog', 1, 'seat2')];
  assert.ok(runToPose(w, list, { unlocked: true, tierFor: () => 2 }) !== null);
  w.pose.serving = true;
  stepPetPoses(w, list, DT, { unlocked: true, tierFor: () => 2 });
  assert.equal(w.pose.session.tier, 2);
  const result = resolvePoseShot(w, 'perfect');
  assert.equal(result.tip, photoTipAmount(2, 'perfect'));
  assert.equal(result.tip, 160); // (40 + 20*2) * 2
  assert.equal(w.stations.get('seat2').pile, 160);
  assert.equal(resolvePoseShot(w, 'good'), null, 'a stray double-resolve must not double-pay');
  assert.equal(w.stations.get('seat2').pile, 160);
});

test('the Golden Shot multiplier reaches the tip, so the pile the player sees is the doubled one', () => {
  const w = createWorld(AREA1, {}, 21);
  buildUpTo(w, 'z_photo');
  const list = [seatedGuest(w, 1, 'cat', 0, 'seat1')];
  assert.ok(runToPose(w, list, { unlocked: true }) !== null);
  w.photoTipMult = 2; // systems/photo.js mirrors G.goldenShotMult onto the world every frame
  w.pose.serving = true;
  stepPetPoses(w, list, DT, { unlocked: true });
  const result = resolvePoseShot(w, 'good');
  assert.equal(result.tip, photoTipAmount(0, 'good') * 2);
  assert.equal(w.stations.get('seat1').pile, result.tip);
});

test('quality multipliers: perfect 2x, good 1.3x, anything else (ok) 1x, tier scales the base', () => {
  assert.equal(photoTipAmount(0, 'ok'), 40);
  assert.equal(photoTipAmount(0, 'perfect'), 80);
  assert.equal(photoTipAmount(0, 'good'), 52); // round(40 * 1.3)
  assert.equal(photoTipAmount(3, 'ok'), 100);
  assert.equal(photoTipAmount(3, 'perfect'), 200);
  assert.equal(photoTipAmount(9, 'ok'), 100); // tier clamps at 3
});

test('no guest anywhere detours for a photo: paying leads straight to a table', () => {
  // Before this batch, 40% of paid guests walked to photo1's queue in the deck's far corner and
  // back (docs/SHIP-PLAN-2026-09-19.md §1.3). There is no such state to enter now.
  const w = createWorld(AREA1, {}, 23);
  buildUpTo(w, 'z_photo');
  w.dayState = { day: 15, t: 100, phase: 'morning' };
  let rolled = 0;
  w.rng.chance = () => { rolled++; return true; }; // if anything still rolled for a detour, it would say yes
  const c = createCustomer(1, 'cat', 0, AREA1);
  c.petVariant = 0;
  Object.assign(c, {
    state: 'atRegister', paid: true, slot: 0, registerId: w.checkouts[0], amount: 12,
    wish: { product: 'cookie', treat: false },
  });
  stepCustomers([c], w, price, DT);
  assert.ok(['toSeat', 'waitSeat', 'noSeat', 'leave'].includes(c.state), `went to ${c.state}`);
  assert.equal(rolled, 0, 'no detour roll is taken any more');
  assert.equal(w._photoQueues, undefined, 'and no photo queue is ever built');
});

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('photoRingScale shrinks linearly from START to END over RING_DURATION and clamps past it', () => {
  assert.ok(close(photoRingScale(0), PHOTO_RING_START));
  assert.ok(close(photoRingScale(PHOTO_RING_DURATION), PHOTO_RING_END));
  assert.ok(close(photoRingScale(PHOTO_RING_DURATION * 2), PHOTO_RING_END)); // clamped, never overshoots
  assert.ok(close(photoRingScale(-5), PHOTO_RING_START)); // clamped the other way too
  const mid = photoRingScale(PHOTO_RING_DURATION / 2);
  assert.ok(close(mid, (PHOTO_RING_START + PHOTO_RING_END) / 2));
});

test('photoJudgeQuality: perfect/good/ok bands are centered on PHOTO_TARGET_SCALE', () => {
  assert.equal(photoJudgeQuality(PHOTO_TARGET_SCALE), 'perfect');
  assert.equal(photoJudgeQuality(PHOTO_TARGET_SCALE + 0.05), 'perfect'); // comfortably inside +-0.08
  assert.equal(photoJudgeQuality(PHOTO_TARGET_SCALE + 0.15), 'good'); // comfortably inside +-0.22, outside +-0.08
  assert.equal(photoJudgeQuality(PHOTO_TARGET_SCALE - 0.15), 'good');
  assert.equal(photoJudgeQuality(PHOTO_TARGET_SCALE + 0.3), 'ok'); // outside +-0.22
  assert.equal(photoJudgeQuality(PHOTO_RING_START), 'ok'); // the ring's own starting scale is way outside the band
});
