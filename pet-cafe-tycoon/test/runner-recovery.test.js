// Runner watchdog, second pass — why the HOLD_LIMIT rescue was firing ~12 times a day, and the
// two things that actually caused it.
//
// MEASUREMENT (tools/bot.js, 60 days, a throwaway instrumented copy that tagged every runnerStuck
// event with the runner's state at the moment the watchdog pre-empted it):
//
//     701 of 703  state = 'waiting', parked, at the display the batch in hand was bound for
//       2 of 703  state = 'unload', walking a surplus back to blender1
//       0 of 703  anything else
//
// and at every one of those 701, the display had just freed 1 or 2 slots (a customer bought
// something). That is not a stuck runner. It is a runner standing beside ONE full shelf,
// drip-feeding leftovers into it a unit at a time as they sell, for minutes — while the café's
// other four displays went unserviced. Two mechanisms produced those leftovers:
//
//  1. OVER-FETCHING. 'loading' filled the batch to the runner's carry tier (up to 16) and
//     pickSource only ever asked "does the destination have ANY room". So a carry-16 runner drained
//     an oven for a shelf with two free slots; 'dropping' bails to 'idle' on the first refused
//     placement, 'idle' sees a full display and parks it in 'waiting', and 'waiting' can only end
//     via unloadSource — which returns null exactly when the family is backed up, because the oven
//     is at its own buffer BECAUSE the shelf is full. Fixed by loadCap(): the batch is bounded by
//     what its destination can hold.
//
//  2. NO IN-FLIGHT ACCOUNTING. Once the roster reached 2-4 runners they all read the same raw free
//     capacity and all set off for the same shelf; whoever arrived second had an undeliverable
//     remainder. Fixed by committed(): a batch in transit is capacity that is already spoken for,
//     subtracted inside displayNeed() so both the source ranking and the load cap see it.
//
// After both, on the same pinned 60-day run: runnerStuck 681 -> 0, worst hold 3.3s -> 1.6s,
// invariant D 0 (unchanged), stalls 0, teleports 0, ledger mismatches 0, and service moved the
// right way rather than merely going quiet — gross sales 262490 -> 283358, served 2399 -> 2417,
// missed seats 164 -> 136, rush friction 68.7% -> 66.1%.
//
// NOTE ON THE WATCHDOG ITSELF, found while attributing the events and worth writing down: it can
// never actually rescue anything. It fires before the switch, on `ct.stock < ct.capacity` — and
// every non-busy branch ('waiting', 'unload', 'idle'-with-items) opens with that same test and the
// same transition to 'toCounter'. So the watchdog only ever pre-empts a recovery that was about to
// happen in the very same tick. It is an honest tripwire (the count above is exactly the signal
// this task needed) but it is not, and never was, the thing keeping runners moving. Left in place
// deliberately: it costs nothing and it is how this behaviour is measured.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, takeFromDisplay } from '../src/sim/world.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';

const DT = 1 / 30;
const LEVELS = carry => ({ runner: { speed: 0, carry }, cashier: { speed: 0 }, cleaner: { speed: 0 } });
function run(list, w, seconds, levels, onTick) {
  for (let t = 0; t < seconds; t += DT) { stepStaff(list, w, DT, () => {}, levels); if (onTick) onTick(t); }
}

test('a runner never picks up more than its display can actually take', () => {
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'); oven.stock = 20;
  const ct = w.stations.get('dispCookie');
  ct.stock = ct.capacity - 3; // three free slots, against a base carry of six

  const runner = createStaff('runner', oven.front);
  let maxItems = 0;
  run([runner], w, 8, undefined, () => { maxItems = Math.max(maxItems, runner.items.length); });

  assert.equal(maxItems, 3, `the batch must be bounded by the shelf's three free slots, not the carry tier (was ${maxItems})`);
  assert.equal(ct.stock, ct.capacity, 'and those three must actually land');
  assert.equal(runner.items.length, 0, 'nothing is left in hand to babysit');
});

test('the Carry upgrade is still fully spent when the display has the room for it', () => {
  // The clamp is by DESTINATION, not a cap on the upgrade: give the shelf a starred capacity
  // (economy.js's displayStarCap writes exactly this field) and a carry-9 runner loads all nine.
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'); oven.stock = 30;
  const ct = w.stations.get('dispCookie'); ct.capacity = 12; ct.stock = 0;

  const runner = createStaff('runner', oven.front);
  let maxItems = 0;
  run([runner], w, 8, LEVELS(1), () => { maxItems = Math.max(maxItems, runner.items.length); });

  assert.equal(maxItems, 9, `RUNNER_CARRY_LEVELS[1] is 9 and the shelf has room for 12, so all nine must be carried (was ${maxItems})`);
});

test('a second runner does not fetch into capacity a sibling is already carrying toward', () => {
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'); oven.stock = 30;
  const ct = w.stations.get('dispCookie');
  ct.stock = ct.capacity - 4; // four free slots

  // Ahead of us: a runner already holding exactly those four, walking them in.
  const ahead = createStaff('runner', { x: ct.front.x, z: ct.front.z - 6 });
  ahead.items = ['cookie', 'cookie', 'cookie', 'cookie'];
  ahead.srcId = 'oven1'; ahead.state = 'toCounter'; ahead.target = 'dispCookie';
  const behind = createStaff('runner', oven.front);

  // Freeze the leader in place so its batch stays genuinely IN FLIGHT for the whole window; this
  // is about what the second runner decides while the first is still walking, not about a race.
  const px = ahead.x, pz = ahead.z;
  run([ahead, behind], w, 3, undefined, () => {
    ahead.x = px; ahead.z = pz; ahead.mover.x = px; ahead.mover.z = pz;
    assert.equal(behind.items.length, 0, 'the second runner must never load against capacity already spoken for');
  });
  assert.equal(ahead.items.length, 4, 'the leader still holds its batch (it was held in place on purpose)');
});

test('the measured 703-event scenario emits no runnerStuck at all: a top-up leaves nothing in hand', () => {
  // The exact shape the instrumented bot attributed: a nearly-full shelf, a source with plenty in
  // its buffer, and a sale that frees one slot well after HOLD_LIMIT has elapsed. Before the fix
  // the runner was parked beside the shelf with a surplus by then, and that sale is precisely what
  // let the watchdog fire.
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'); oven.stock = 20;
  const ct = w.stations.get('dispCookie');
  ct.stock = ct.capacity - 2; // two free slots against a six-item carry

  const runner = createStaff('runner', oven.front);
  let worstHoldWithRoom = 0, holdT = 0;
  run([runner], w, 16, undefined, t => {
    // Well past HOLD_LIMIT: before the fix the runner had been parked beside the shelf with four
    // surplus cookies for ~9s by now, and this one sale is exactly what let the watchdog fire.
    if (t >= 11 && ct.stock === ct.capacity) takeFromDisplay(w, 'dispCookie');
    // An outside clock, shaped like tools/bot.js's own invariant D: items in hand while the shelf
    // has room, with no exemption for any state.
    if (runner.items.length > 0 && ct.stock < ct.capacity) { holdT += DT; worstHoldWithRoom = Math.max(worstHoldWithRoom, holdT); }
    else holdT = 0;
  });

  const stuck = w.events.filter(e => e.type === 'runnerStuck');
  assert.equal(stuck.length, 0, `the watchdog must not fire at all here (fired ${stuck.length}x)`);
  assert.ok(worstHoldWithRoom < 6, `no hold-with-room may approach HOLD_LIMIT (worst was ${worstHoldWithRoom.toFixed(1)}s)`);
  assert.notEqual(runner.state, 'waiting', `the runner must not end up parked beside the shelf (state ${runner.state})`);
});

test('a display that fills while the runner walks to the oven sends it home empty, not to the wait spot', () => {
  // loadCap reads live, so a cap of 0 on arrival means the runner picks up nothing at all rather
  // than acquiring a batch it would then have to babysit. This is the "re-targeting a display that
  // filled while it walked" case the attribution run was asked to rule in or out.
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'); oven.stock = 20;
  const ct = w.stations.get('dispCookie'); ct.stock = ct.capacity - 5;

  const runner = createStaff('runner', { x: oven.front.x, z: oven.front.z + 3 });
  run([runner], w, 1); // long enough to commit to the oven, not long enough to reach it and load
  assert.equal(runner.state === 'toOven' || runner.state === 'loading', true, `expected it heading for the oven (was ${runner.state})`);

  ct.stock = ct.capacity; // somebody else topped the shelf up mid-walk
  run([runner], w, 4);
  assert.equal(runner.items.length, 0, 'nothing may be picked up for a shelf with no room');
  assert.notEqual(runner.state, 'waiting', 'and so there is nothing to stand beside the shelf holding');
});
