// test/lifetime-served.test.js — the lifetime "guests served" count actually counts.
//
// G.stats.served feeds the Paw Rating's ★1 (120 guests) and so every star reward behind it. It was
// incremented in systems/customers.js when that system saw a 'pay' world event — but 'pay' is
// emitted by stepRegisters inside staff.update, which runs AFTER customers.update in game.js's
// frame, and world.events is cleared at the end of the frame. So the counter never moved: 700
// guests in, the rating still read 0/120 on day 19. It now counts in game.js's world-event drain
// (sim/settlement.js recordPaidGuest), beside the per-day count that always worked, and saves that
// never counted are backfilled from their own shift history on load.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AREA1 } from '../data/area1.js';
import { createWorld, putOnDisplay } from '../src/sim/world.js';
import { createCustomer, stepCustomers } from '../src/sim/customers.js';
import { stepStaff } from '../src/sim/staff.js';
import { recordPaidGuest } from '../src/sim/settlement.js';
import { validateAndMigrateSave } from '../src/sim/save.js';
import { pawRatingState } from '../src/sim/pawRating.js';

const price = (k, seated) => (seated ? 6 : 5);
function freshG() {
  return {
    stats: { served: 0 }, dayStats: { served: 0, earned: 0, bestStreak: 0 },
    serviceStreak: { count: 0, t: 0 }, shiftBestStreak: 0,
  };
}

test('one guest served through the real frame order counts once, for the lifetime and the day', () => {
  const w = createWorld(AREA1);
  putOnDisplay(w, 'dispCookie', 'cookie', 5);
  const G = freshG();
  const c = createCustomer(1, 'cat', 0, AREA1);
  let payVisibleToCustomersUpdate = 0, paysDrained = 0;
  for (let i = 0; i < 30 * 30 && !c.done; i++) {
    // systems/stations.js: the owner standing at the till mans it for this frame.
    w.stations.get('register1').serving = 'owner';
    // customers.update — and what the old counter saw of this frame's events at that point.
    stepCustomers([c], w, price, 1 / 30);
    payVisibleToCustomersUpdate += w.events.filter(e => e.type === 'pay').length;
    // staff.update: stepStaff runs stepRegisters, which is what emits 'pay'.
    stepStaff([], w, 1 / 30, () => {});
    // game.js's world-event drain, then the end-of-frame clear.
    for (const e of w.events) if (e.type === 'pay') { recordPaidGuest(G, e.amount); paysDrained++; }
    w.events.length = 0;
  }
  assert.equal(paysDrained, 1, 'the guest paid exactly once');
  assert.equal(payVisibleToCustomersUpdate, 0, 'why the old counter never moved: no pay exists yet when customers.update reads events');
  assert.equal(G.stats.served, 1);
  assert.equal(G.dayStats.served, 1);
  assert.equal(G.dayStats.earned, 5);
  assert.equal(G.dayStats.bestStreak, 1);
});

test('the live game counts in the drain after staff.update, and nowhere else', () => {
  const game = fs.readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const update = game.slice(game.indexOf('G.update = dt => {'));
  const order = ['customers.update(dt)', 'staff.update(dt)', "if (e.type === 'pay') {", 'recordPaidGuest(G, e.amount);', 'world.events.length = 0;'];
  let at = -1;
  for (const step of order) {
    const i = update.indexOf(step, at + 1);
    assert.ok(i > at, `${step} must come after the previous step in G.update`);
    at = i;
  }
  const customers = fs.readFileSync(new URL('../src/systems/customers.js', import.meta.url), 'utf8');
  assert.doesNotMatch(customers, /stats\.served/, 'the dead counter is gone, so nothing can double-count');
});

// ---- the backfill ----------------------------------------------------------------------------

function saveWith(over = {}) {
  return {
    v: 5, coins: 100,
    builds: { a1: ['z_seats1'] },
    dayState: { day: 4, t: 30, phase: 'morning' },
    stats: { served: 0 },
    dayStats: { served: 6 },
    ...over,
    meta: {
      completedDays: 3,
      career: {
        history: {
          1: { served: 23, lost: 0, earned: 400, bestStreak: 5, rating: 2, contractMet: false },
          2: { served: 40, lost: 1, earned: 700, bestStreak: 8, rating: 3, contractMet: true },
          3: { served: 51, lost: 0, earned: 900, bestStreak: 9, rating: 3, contractMet: true },
        },
      },
      ...(over.meta || {}),
    },
  };
}
const validate = raw => validateAndMigrateSave(raw, AREA1);

test('a save that never counted gets its lifetime served back from its own shift history', () => {
  const r = validate(saveWith());
  assert.equal(r.ok, true);
  assert.equal(r.data.stats.served, 23 + 40 + 51 + 6, 'three settled shifts plus the one in progress');
  // ...which is past ★1's 120, so the stars the player earned are finally reachable.
  const paw = pawRatingState({ meta: r.data.meta, stats: r.data.stats, built: new Set(r.data.builds.a1), area: AREA1 });
  assert.ok(paw.live >= 1, `★1 opens on the backfilled count (live ${paw.live})`);
});

test('a settled day is not counted twice, and a live count above the history is never lowered', () => {
  // Day 3 ended and is already in the history: its dayStats are that same shift.
  const ended = validate(saveWith({ dayState: { day: 3, t: 240, phase: 'closing', _ended: true }, dayStats: { served: 51 } }));
  assert.equal(ended.data.stats.served, 23 + 40 + 51);
  const live = validate(saveWith({ stats: { served: 500 } }));
  assert.equal(live.data.stats.served, 500);
});

test('the backfill is idempotent and bounded by what the save can prove', () => {
  const once = validate(saveWith());
  assert.equal(validate(once.data).data.stats.served, once.data.stats.served);
  // History rows for days the save has not settled prove nothing (normalizeCareer drops them).
  const forged = validate(saveWith({ meta: { completedDays: 1 } }));
  assert.equal(forged.data.stats.served, 23 + 6);
  // A save with no history at all keeps what it had.
  assert.equal(validate({ v: 5, coins: 0, stats: { served: 7 } }).data.stats.served, 7);
});
