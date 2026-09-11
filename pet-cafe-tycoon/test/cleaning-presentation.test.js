// Program §6.3. The owner's report was "cleaning animation seems some tables have it, some are
// not". It was literally true, and the cause was an event that never existed: `cleanSeat` only
// ever announced that a wipe had FINISHED, so a cleaner's 1.6 s of work had no ring, no arm
// movement and no fade -- the crumbs simply popped off at the end -- while a table the owner
// walked past got a burst. These tests pin the missing half: BOTH actors now emit 'cleaning' and
// then 'cleaned' for the same seat, the cleaner's start lands when the wipe really starts, and the
// three presentation layers are wired to that pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { AREA1 } from '../data/area1.js';
import { createWorld, cleanSeat, beginCleanSeat, ownerCleanSeat, OWNER_WIPE_SECONDS } from '../src/sim/world.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { createHuman } from '../src/render/human.js';

const wipeEvents = w => w.events.filter(e => e.type === 'cleaning' || e.type === 'cleaned');
function dirtiedSeat(w) {
  const seat = [...w.stations.values()].find(s => s.type === 'seat' && s.active);
  assert.ok(seat, 'AREA1 starts with at least one active seat');
  seat.dirty = true; seat.occupied = false;
  return seat;
}
const source = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('the owner path emits cleaning then cleaned for the same seat', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = dirtiedSeat(w);

  assert.equal(ownerCleanSeat(w, seat.id), true);

  const pair = wipeEvents(w);
  assert.deepEqual(pair.map(e => e.type), ['cleaning', 'cleaned'], 'start first, finish second');
  assert.equal(pair[0].seatId, seat.id);
  assert.equal(pair[1].seatId, seat.id, 'both halves name the SAME seat');
  assert.equal(pair[0].by, 'owner');
  assert.ok(pair[0].seconds > 0, 'the ring needs a duration to sweep over');
  assert.equal(pair[0].seconds, OWNER_WIPE_SECONDS);
  assert.equal(seat.dirty, false, 'and the seat is genuinely clean, exactly as before this task');
});

test('the owner path is a no-op on a seat that is not dirty', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = [...w.stations.values()].find(s => s.type === 'seat' && s.active);
  seat.dirty = false;

  assert.equal(ownerCleanSeat(w, seat.id), false);
  assert.equal(ownerCleanSeat(w, 'no-such-seat'), false);
  assert.equal(beginCleanSeat(w, seat.id, 'cleaner', 1.6), false);
  assert.deepEqual(wipeEvents(w), [], 'no ring is ever left hanging over an already clean table');
});

test('the cleaner path emits cleaning when the wipe starts and cleaned when it ends', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = dirtiedSeat(w);
  const cleaner = createStaff('cleaner', seat.front);

  let started = null, finished = null, startEvent = null, starts = 0;
  const DT = 1 / 30;
  for (let t = 0; t < 8 && finished === null; t += DT) {
    w.events.length = 0;
    stepStaff([cleaner], w, DT, () => {});
    for (const e of w.events) {
      if (e.type === 'cleaning') { starts++; startEvent = e; if (started === null) started = t; }
      else if (e.type === 'cleaned' && finished === null) { finished = t; assert.equal(e.seatId, seat.id); }
    }
  }

  assert.equal(starts, 1, 'exactly one start per wipe, not one per frame of the cleaning state');
  assert.equal(startEvent.seatId, seat.id, 'start and finish name the SAME seat');
  assert.equal(startEvent.by, 'cleaner');
  assert.ok(startEvent.seconds > 0, 'and carry this cleaner\'s real, level-adjusted duration');
  assert.notEqual(started, null, 'the cleaner announced the start of its wipe');
  assert.notEqual(finished, null, 'and finished it');
  assert.ok(finished > started, 'the start genuinely precedes the finish');
  // The level-1 cleaner takes 1.6 s (CLEANER_RATE in src/sim/staff.js), which is exactly the gap
  // the ring in systems/visuals.js fills over -- so the two have to agree.
  assert.ok(Math.abs((finished - started) - startEvent.seconds) < 0.15,
    `ring duration ${startEvent.seconds}s should match the wipe it covers (${(finished - started).toFixed(2)}s)`);
  assert.equal(seat.dirty, false);
});

test('a wipe interrupted before it lands leaves a start with no finish, and the seat clean', () => {
  // Someone else (the owner walking past) wipes the seat while the cleaner is mid-stroke: the
  // cleaner must not emit a second 'cleaned', and systems/visuals.js drops its ring because the
  // seat is no longer dirty. This is the case that would strand a ring on screen forever.
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = dirtiedSeat(w);
  const cleaner = createStaff('cleaner', seat.front);
  const DT = 1 / 30;
  for (let i = 0; i < 8; i++) stepStaff([cleaner], w, DT, () => {});
  assert.equal(cleaner.state, 'cleaning', 'cleaner is mid-wipe');
  assert.equal(w.events.filter(e => e.type === 'cleaning').length, 1);

  w.events.length = 0;
  cleanSeat(w, seat.id);                       // the owner beats it to the table
  assert.deepEqual(w.events.map(e => e.type), ['cleaned']);

  w.events.length = 0;
  for (let i = 0; i < 8; i++) stepStaff([cleaner], w, DT, () => {});
  assert.deepEqual(wipeEvents(w), [], 'the abandoned wipe neither re-starts nor double-finishes');
  assert.equal(seat.dirty, false);
});

test('H.wipe sweeps the right arm side to side and settles back to rest', () => {
  const human = createHuman({ shirt: 3, hair: 3, skin: 2 }, 'cleaner');
  // The right arm is the only child parked at +0.44 on x (see createHuman's shoulder placement).
  const armR = human.group.children.find(o => o.isMesh && Math.abs(o.position.x - 0.44) < 1e-6);
  assert.ok(armR, 'found the right arm');
  const DT = 1 / 60;

  human.update(DT, 0, 0);
  assert.equal(armR.rotation.z, 0, 'at rest before any wipe');

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 60; i++) { human.wipe(0.35); human.update(DT, 0, 0); min = Math.min(min, armR.rotation.z); max = Math.max(max, armR.rotation.z); }
  assert.ok(max - min > 0.2, `the arm should actually sweep side to side (swept ${(max - min).toFixed(3)} rad)`);
  assert.ok(armR.rotation.x < -0.5, 'and reach out over the table while it does');

  for (let i = 0; i < 120; i++) human.update(DT, 0, 0);
  assert.equal(armR.rotation.z, 0, 'and returns to a clean rest pose once the wipe stops');
  assert.ok(Math.abs(armR.rotation.x) < 1e-6, 'with the reach released too');
});

// The three presentation layers need a DOM (systems/*) or a renderer, so their wiring is pinned at
// the source level. Each assertion is the one line that, if it went missing, would put the game
// straight back into "some tables have the cleaning animation, some do not".
test('every layer is wired to the cleaning/cleaned pair', () => {
  const stations = source('../src/systems/stations.js');
  assert.match(stations, /ownerCleanSeat\(world, st\.id\)/, 'the owner wipes through the paired call');
  assert.doesNotMatch(stations, /[^r]cleanSeat\(world, st\.id\)/, 'and never through the bare one, which emits no start');

  const staffSim = source('../src/sim/staff.js');
  assert.match(staffSim, /beginCleanSeat\(w, st\.id, 'cleaner', rate\)/, 'the cleaner announces its start with its real rate');

  const visuals = source('../src/systems/visuals.js');
  assert.match(visuals, /e\.type === 'cleaning'/, 'visuals shows the ring for either actor');
  assert.match(visuals, /#BFEFFF/, 'and the sparkle burst on the finish');
  assert.match(visuals, /cleanRing\.setProgress/, 'through the same progress ring as before');

  const staffSystem = source('../src/systems/staff.js');
  assert.match(staffSystem, /s\.state === 'cleaning' && r\.human\.wipe/, 'the cleaner wipes while the sim says it is cleaning');
});

// A guard rail rather than a behaviour: three.js is imported so the human rig can be built, and
// this keeps the import honest if the rig ever stops needing it.
test('the rig under test is real three.js geometry', () => {
  const human = createHuman({}, 'cleaner');
  assert.ok(human.group instanceof THREE.Group);
});
