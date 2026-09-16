// Task 2.1 — the Pet Photo Studio (plan 3.2). These tests pin the sim-layer contract: a paid,
// named-pet guest may be routed to photo1's queue, a manned booth starts exactly one mini-game
// session at a time, an untouched session auto-resolves as 'ok' well before the bot could ever
// stall on it, a player's tap (resolvePhotoShot) pays the right tip for tier/quality, and every new
// branch is gated on w.dayState so the untouchable test/nav-fullhouse.test.js and this file's own
// pre-2.1 sibling (test/customers.test.js) keep replaying their exact old paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  createWorld, payZone, stepPhotoBooth, resolvePhotoShot, photoTipAmount,
  photoRingScale, photoJudgeQuality,
  PHOTO_QUEUE_CAP, PHOTO_AUTO_RESOLVE, PHOTO_RING_DURATION, PHOTO_RING_START, PHOTO_RING_END, PHOTO_TARGET_SCALE,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers, PATIENCE } from '../src/sim/customers.js';

const price = (k, seated) => (seated ? 6 : 5);

// Walks the zone `requires` chain up to (and including) `targetId`, paying each in full. Generic
// over the chain rather than hard-coding it, so a re-priced or re-ordered chain upstream (the
// terrace agent's own tuning, out of this task's scope) can't silently desync this helper.
function buildUpTo(w, targetId) {
  const zones = AREA1.zones;
  const need = [];
  let cur = zones.find(z => z.id === targetId);
  while (cur) { need.unshift(cur.id); cur = cur.requires ? zones.find(z => z.id === cur.requires) : null; }
  for (const id of need) { let guard = 0; while (!w.built.has(id) && guard++ < 2000) payZone(w, id, 1e9, 1); }
}

function photoStation(w) {
  for (const st of w.stations.values()) if (st.type === 'photo') return st;
  return null;
}

test('photo1 is a real station shape once built: pile, serving, session and a 5-slot queue', () => {
  const w = createWorld(AREA1, {}, 1);
  buildUpTo(w, 'z_photo');
  const st = photoStation(w);
  assert.ok(st && st.active);
  assert.equal(st.pile, 0);
  assert.equal(st.serving, '');
  assert.equal(st.session, null);
  assert.equal(st.queue.length, 5);
});

test('a paid, named-pet guest may be routed to the photo studio once dayState + an active booth are both present', () => {
  const w = createWorld(AREA1, {}, 7);
  buildUpTo(w, 'z_photo');
  w.dayState = { day: 15, t: 100, phase: 'morning' };
  w.rng.chance = () => true; // force the 40% roll to land
  const st = photoStation(w);
  const c = createCustomer(1, 'cat', 0, AREA1);
  c.petVariant = 0;
  Object.assign(c, {
    state: 'atRegister', paid: true, slot: 0, registerId: w.checkouts[0], amount: 12,
    wish: { product: 'cookie', treat: false },
  });
  stepCustomers([c], w, price, 1 / 30);
  assert.equal(c.state, 'toPhoto');
  assert.equal(c._photoTarget, st.id);
});

test('a rush-capped shift never routes to the photo studio, even when the roll would say yes', () => {
  const w = createWorld(AREA1, {}, 8);
  buildUpTo(w, 'z_photo');
  w.dayState = { day: 15, t: 100, phase: 'rush' };
  w.rng.chance = () => true;
  const c = createCustomer(2, 'dog', 0, AREA1);
  c.petVariant = 1;
  Object.assign(c, {
    state: 'atRegister', paid: true, slot: 0, registerId: w.checkouts[0], amount: 12,
    wish: { product: 'cookie', treat: false },
  });
  stepCustomers([c], w, price, 1 / 30);
  assert.notEqual(c.state, 'toPhoto');
  assert.equal(c._photoTarget, null);
});

test('no dayState (untouched pre-2.1 path): a paid guest never enters toPhoto, even with an active booth and a forced-true roll', () => {
  const w = createWorld(AREA1, {}, 9);
  buildUpTo(w, 'z_photo'); // mirrors nav-fullhouse's buildAll(): every zone including z_photo exists
  w.rng.chance = () => true; // if this were ever consulted, it would say yes
  const c = createCustomer(3, 'bunny', 0, AREA1);
  c.petVariant = 2;
  Object.assign(c, {
    state: 'atRegister', paid: true, slot: 0, registerId: w.checkouts[0], amount: 12,
    wish: { product: 'cookie', treat: false },
  });
  stepCustomers([c], w, price, 1 / 30);
  assert.notEqual(c.state, 'toPhoto');
});

test('the queue cap keeps a new arrival from piling past PHOTO_QUEUE_CAP, even when the roll says yes', () => {
  const w = createWorld(AREA1, {}, 21);
  buildUpTo(w, 'z_photo');
  w.dayState = { day: 15, t: 50, phase: 'morning' };
  w.rng.chance = () => true;
  const st = photoStation(w);
  w._photoQueues = new Map([[st.id, new Array(PHOTO_QUEUE_CAP).fill(0)]]);
  const c = createCustomer(50, 'cat', 0, AREA1);
  c.petVariant = 0;
  Object.assign(c, {
    state: 'atRegister', paid: true, slot: 0, registerId: w.checkouts[0], amount: 10,
    wish: { product: 'cookie', treat: false },
  });
  stepCustomers([c], w, price, 1 / 30);
  assert.notEqual(c.state, 'toPhoto');
});

test('a manned booth starts a session for the waiting guest and auto-resolves as ok well within PHOTO_AUTO_RESOLVE, paying the tray', () => {
  const w = createWorld(AREA1, {}, 3);
  buildUpTo(w, 'z_photo');
  const st = photoStation(w);
  const c = createCustomer(4, 'cat', 0, AREA1);
  c.petVariant = 0;
  Object.assign(c, { state: 'atPhoto', _photoTarget: st.id, x: st.queue[0].x, z: st.queue[0].z, slot: 0, patience: PATIENCE });
  Object.assign(c.mover, { x: st.queue[0].x, z: st.queue[0].z });
  const list = [c];
  let started = false, paid = null, done = false;
  for (let t = 0; t < PHOTO_AUTO_RESOLVE + 1; t += 1 / 30) {
    st.serving = true; // the owner stands here continuously
    stepCustomers(list, w, price, 1 / 30);
    stepPhotoBooth(w, 1 / 30);
    for (const e of w.events) {
      if (e.type === 'photoStart') started = true;
      if (e.type === 'photo') paid = e;
      if (e.type === 'photoDone') done = true;
    }
    w.events.length = 0;
    if (done) break;
  }
  assert.ok(started, 'a session should have started');
  assert.ok(paid, 'the timeout should have auto-resolved the shot');
  assert.equal(paid.quality, 'ok');
  assert.equal(paid.tip, photoTipAmount(0, 'ok'));
  assert.ok(done, 'the guest FSM should have consumed the resolved session');
  assert.equal(st.pile, photoTipAmount(0, 'ok'));
  assert.equal(st.session, null, 'the booth frees up for the next guest');
  assert.equal(c._photoTarget, null);
  assert.notEqual(c.state, 'atPhoto');
});

test('resolvePhotoShot pays tier + quality correctly and is idempotent past the first call', () => {
  const w = createWorld(AREA1, {}, 5);
  buildUpTo(w, 'z_photo');
  const st = photoStation(w);
  const c = createCustomer(9, 'dog', 0, AREA1);
  c.petVariant = 1;
  Object.assign(c, { state: 'atPhoto', _photoTarget: st.id, x: st.queue[0].x, z: st.queue[0].z, slot: 0 });
  Object.assign(c.mover, { x: st.queue[0].x, z: st.queue[0].z });
  const list = [c];
  st.serving = true;
  stepCustomers(list, w, price, 1 / 30);
  stepPhotoBooth(w, 1 / 30, () => 2); // a friendship-tier lookup, injected — sim itself never reads meta
  assert.ok(st.session);
  assert.equal(st.session.tier, 2);
  const result = resolvePhotoShot(w, st.id, 'perfect');
  assert.equal(result.tip, photoTipAmount(2, 'perfect'));
  assert.equal(result.tip, 160); // (40 + 20*2) * 2
  assert.equal(st.pile, 160);
  const again = resolvePhotoShot(w, st.id, 'good'); // a stray double-resolve must not double-pay
  assert.equal(again, null);
  assert.equal(st.pile, 160);
  stepCustomers(list, w, price, 1 / 30); // the guest's own FSM notices and clears the booth
  assert.notEqual(c.state, 'atPhoto');
  assert.equal(c._photoTarget, null);
  assert.equal(st.session, null);
});

test('quality multipliers: perfect 2x, good 1.3x, anything else (ok) 1x, tier scales the base', () => {
  assert.equal(photoTipAmount(0, 'ok'), 40);
  assert.equal(photoTipAmount(0, 'perfect'), 80);
  assert.equal(photoTipAmount(0, 'good'), 52); // round(40 * 1.3)
  assert.equal(photoTipAmount(3, 'ok'), 100);
  assert.equal(photoTipAmount(3, 'perfect'), 200);
  assert.equal(photoTipAmount(9, 'ok'), 100); // tier clamps at 3
});

test('an unmanned booth: the guest waits, gives up gracefully after patience runs out (no lost/angry), and proceeds toward a table', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] }, 11);
  buildUpTo(w, 'z_photo');
  const st = photoStation(w);
  const c = createCustomer(6, 'bunny', 0, AREA1);
  c.petVariant = 2;
  Object.assign(c, { state: 'atPhoto', _photoTarget: st.id, x: st.queue[0].x, z: st.queue[0].z, slot: 0, patience: PATIENCE });
  Object.assign(c.mover, { x: st.queue[0].x, z: st.queue[0].z });
  const list = [c];
  for (let t = 0; t < PATIENCE + 1 && (c.state === 'atPhoto' || c.state === 'toPhoto'); t += 1 / 30) {
    stepCustomers(list, w, price, 1 / 30); // st.serving never set — nobody mans the booth
    stepPhotoBooth(w, 1 / 30);
  }
  assert.notEqual(c.state, 'atPhoto');
  assert.equal(c._photoTarget, null);
  assert.ok(!w.events.some(e => e.type === 'lost' || e.type === 'angry'), 'a missed photo op is not a service failure');
  assert.ok(w.events.some(e => e.type === 'photoSkipped'));
  assert.ok(['toSeat', 'noSeat', 'waitSeat', 'leave'].includes(c.state));
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
