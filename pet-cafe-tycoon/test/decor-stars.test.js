// test/decor-stars.test.js — the star-gated decor sets (plan 3.4: "each star unlocks a decor set").
//
// Two things are under test and they are not the same thing:
//   1. the GATE — a star row is unreachable until its star is on the ratchet, in the shop, in the
//      world and, above all, in a restored save;
//   2. the SLOTS — where the 15 new pieces physically stand. A decor piece is not in the nav grid,
//      so nothing crashes when one is parked badly; it just silently sits inside a counter or on a
//      queue lane and is never noticed until a screenshot. These assertions are the notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1, queueSlots } from '../data/area1.js';
import {
  DECOR, DECOR_IDS, DECOR_MAX_STAR, DECOR_STAR_SETS, TERRACE_ZONE,
  decorCatalogue, decorSetForStar, decorUnlocked,
} from '../data/decor.js';
import { PAW_MAX_STAR } from '../src/sim/pawRating.js';
import { affordableDecor, buyDecor, cheapestDecor } from '../src/sim/economy.js';
import { validateAndMigrateSave } from '../src/sim/save.js';

const starRows = () => DECOR.filter(item => item.star);
const openRows = () => DECOR.filter(item => !item.star && !item.requires);

// ---------------------------------------------------------------------------------------------
// the sets
test('there is exactly one authored set per star, several pieces each', () => {
  assert.equal(DECOR_MAX_STAR, PAW_MAX_STAR, 'the catalogue must gate on the same 5 stars the rating awards');
  for (let star = 1; star <= DECOR_MAX_STAR; star++) {
    const set = decorSetForStar(star);
    assert.ok(set.length >= 3, `star ${star} set has only ${set.length} pieces`);
    assert.deepEqual(set, DECOR.filter(i => i.star === star).map(i => i.id), `star ${star} set is out of catalogue order`);
    assert.ok(Object.isFrozen(set), `star ${star} set must be frozen`);
  }
  assert.equal(starRows().length, [...DECOR_STAR_SETS.values()].reduce((n, s) => n + s.length, 0));
  // Nothing is gated on a star the rating cannot award, in either direction.
  for (const item of starRows()) {
    assert.ok(Number.isInteger(item.star) && item.star >= 1 && item.star <= DECOR_MAX_STAR, `${item.id} star ${item.star}`);
  }
  assert.deepEqual(decorSetForStar(0), []);
  assert.deepEqual(decorSetForStar(DECOR_MAX_STAR + 1), []);
  assert.deepEqual(decorSetForStar('3'), [], 'a string star must not resolve a set');
  assert.deepEqual(decorSetForStar(NaN), []);
});

// A star set is a SINK, not a reward payout: it has to obey every rule the rest of the catalogue
// obeys, or it destabilises the reputation ceiling and the shop rows it shares.
test('star rows obey the catalogue contract the other rows obey', () => {
  assert.equal(new Set(DECOR_IDS).size, DECOR.length, 'duplicate decor id');
  for (const item of starRows()) {
    assert.ok(Number.isInteger(item.price) && item.price >= 60 && item.price <= 900, `${item.id} price ${item.price}`);
    assert.equal(item.rep, 1, `${item.id} must grant exactly +1 reputation, like every other row`);
    assert.equal(item.region, 'interior', `${item.id}: star sets are unconditional rewards, so none may also need a region built`);
    assert.equal(item.requires, undefined, `${item.id} must not carry a zone gate as well`);
    assert.ok(typeof item.icon === 'string' && item.icon.startsWith('<svg'), `${item.id} icon`);
    for (const axis of ['x', 'y', 'z', 'rot']) assert.ok(Number.isFinite(item.slot[axis]), `${item.id} slot.${axis}`);
  }
  // Prices climb with the star, so the sink stays ahead of the wallet that unlocked it.
  let ceiling = 0;
  for (let star = 1; star <= DECOR_MAX_STAR; star++) {
    const prices = decorSetForStar(star).map(id => DECOR.find(i => i.id === id).price);
    assert.ok(Math.min(...prices) > ceiling, `star ${star} undercuts star ${star - 1}`);
    ceiling = Math.max(...prices);
  }
});

// ---------------------------------------------------------------------------------------------
// the gate
test('a star row is locked until its star is on the ratchet, and one star opens exactly one set', () => {
  const built = new Set(AREA1.zones.map(z => z.id));
  for (let best = 0; best <= DECOR_MAX_STAR; best++) {
    for (const item of starRows()) {
      assert.equal(decorUnlocked(item, built, best), item.star <= best, `${item.id} at best ${best}`);
    }
    // every earlier set stays open — the ratchet never repossesses
    const open = decorCatalogue(built, best).filter(i => i.star);
    assert.equal(open.length, starRows().filter(i => i.star <= best).length, `best ${best} opened the wrong number of rows`);
  }
});

test('the star gate fails shut on every shape that is not a whole earned star', () => {
  const item = starRows()[0];
  const built = new Set(AREA1.zones.map(z => z.id));
  for (const junk of [undefined, null, NaN, Infinity, '5', '1', true, {}, [], -1, 0.9, 0]) {
    assert.equal(decorUnlocked(item, built, junk), false, `bestStar ${String(junk)} must not open a star row`);
  }
  // ...and a fraction rounds DOWN: 1.9 stars is not a star.
  assert.equal(decorUnlocked(item, built, 1.9), true, 'floor(1.9) = 1 opens the star-1 set');
  assert.equal(decorUnlocked(DECOR.find(i => i.star === 2), built, 1.9), false);
});

test('the two gates are independent and BOTH must pass', () => {
  const noStar = decorCatalogue(new Set(), 0);
  assert.equal(noStar.some(i => i.star), false, 'no built zone can substitute for a star');
  assert.equal(noStar.length, openRows().length, 'the ungated shelf is exactly the rows with no gate at all');
  const allStars = decorCatalogue(new Set(), DECOR_MAX_STAR);
  assert.equal(allStars.some(i => i.region === 'terrace'), false, 'no star can substitute for a built terrace');
  assert.equal(allStars.length, openRows().length + starRows().length);
  // A row carrying both gates (none is authored today; this proves the code would honour one).
  const both = { id: 'x', star: 3, requires: TERRACE_ZONE, price: 1, rep: 1, region: 'terrace', slot: { x: 0, y: 0, z: 0, rot: 0 }, icon: '<svg/>' };
  assert.equal(decorUnlocked(both, new Set([TERRACE_ZONE]), 3), true);
  assert.equal(decorUnlocked(both, new Set([TERRACE_ZONE]), 2), false, 'zone built, star short');
  assert.equal(decorUnlocked(both, new Set(), 5), false, 'star earned, zone unbuilt');
  assert.equal(decorUnlocked(null, new Set([TERRACE_ZONE]), 5), false);
});

// The shop reads the same predicate. Until the wiring in wiringNeeded lands, no caller supplies a
// star at all, so these assertions describe the un-wired state AND the wired state for a save that
// has earned nothing — which is the state that matters, because it is the one a forger starts from.
test('the shop never offers, and never sells, a star row to a cafe that has not earned it', () => {
  const rich = { coins: 1_000_000, meta: { reputation: 0, decor: [] }, world: { built: new Set(AREA1.zones.map(z => z.id)) } };
  assert.equal(affordableDecor(rich).some(i => i.star), false);
  for (const item of starRows()) {
    assert.deepEqual(buyDecor(rich, item.id), { ok: false, cost: item.price }, item.id);
  }
  assert.equal(rich.coins, 1_000_000, 'a refused buy must never touch the wallet');
  assert.deepEqual(rich.meta.decor, []);
  assert.equal(rich.meta.reputation, 0);
  // The shelf still empties, so "always something to buy" still terminates rather than dangling
  // permanently-locked rows in front of the player. (This cafe has built the terrace, so the
  // terrace rows are on its shelf too — the set that empties is whatever decorCatalogue lists.)
  for (const item of decorCatalogue(rich.world.built, 0)) assert.equal(buyDecor(rich, item.id).ok, true, item.id);
  assert.equal(cheapestDecor(rich), null);
});

// ---------------------------------------------------------------------------------------------
// the save boundary — the whole reason the gate lives in decorUnlocked() and not in the UI.
test('a forged save cannot own a star piece it has not earned, exactly like a terrace piece', () => {
  const forged = {
    v: 5, coins: 0, dayState: { day: 2, t: 10 },
    meta: {
      completedDays: 1, reputation: 99, pawBest: 5,
      decor: ['d_paw_sign', ...starRows().map(i => i.id), 'd_umbrella_a'],
    },
  };
  const result = validateAndMigrateSave(forged, AREA1);
  assert.equal(result.ok, true);
  const kept = result.data.meta.decor;
  assert.deepEqual(kept, ['d_paw_sign'], 'only the ungated piece survives');
  assert.equal(result.data.meta.pawBest, 0, 'an empty save cannot declare a rating either');
  // ...and the reputation those pieces would have bought is clamped away with them: 1 settled shift
  // (3 points) plus the single surviving piece.
  assert.equal(result.data.meta.reputation, 3 * 1 + kept.length);
});

// ---------------------------------------------------------------------------------------------
// the slots. AREA1 space: x -10..10, z -7..7 interior, +z toward the camera.
const DOOR_LANES = [
  ['door', AREA1.door.x, AREA1.door.z],
  ['exit', AREA1.exit.x, AREA1.exit.z],
];

// Every point an actor actually walks to: a station's service front, and the five queue cells in
// front of every register and counter. A prop standing on one of these is the Batch 1 failure this
// suite exists to prevent.
function walkTargets() {
  const pts = [...DOOR_LANES];
  for (const st of AREA1.stations) {
    const dist = st.front != null && typeof st.front === 'number' ? st.front : 1.3;
    const rot = st.rot || 0;
    const front = { x: st.x + 1.3 * 0 + dist * Math.sin(rot), z: st.z + dist * Math.cos(rot) };
    // queueSlots() reads st.front as a POINT, so give it the one we just derived.
    const staged = { ...st, front };
    pts.push([`${st.id}.front`, front.x, front.z]);
    if (st.type === 'checkout' || st.type === 'display') {
      const right = st.queueRight || 0;
      queueSlots(staged, 5).forEach((q, i) => pts.push([`${st.id}.q${i}`, q.x + right, q.z]));
    }
  }
  return pts;
}

// A rug is 4 cm of fabric and the string lights hang at head height plus a metre: both are meant to
// be walked under/over, so only pieces with a real standing footprint are held to the lane rule.
const STANDS_IN_THE_ROOM = item => item.slot.y < 2.4 && item.kind !== 'rug';

test('every star slot is inside the room and clear of stations, fronts, queues and the door', () => {
  const { w, d } = AREA1.size;
  const targets = walkTargets();
  for (const item of starRows()) {
    const { x, z } = item.slot;
    assert.ok(Math.abs(x) <= w / 2, `${item.id} x ${x} out of bounds`);
    assert.ok(Math.abs(z) <= d / 2, `${item.id} z ${z} out of bounds`);
    for (const st of AREA1.stations) {
      const gap = Math.hypot(st.x - x, st.z - z);
      assert.ok(gap >= 0.9, `${item.id} is ${gap.toFixed(2)}m from station ${st.id}`);
    }
    if (!STANDS_IN_THE_ROOM(item)) continue;
    for (const [id, tx, tz] of targets) {
      const gap = Math.hypot(tx - x, tz - z);
      assert.ok(gap >= 1.0, `${item.id} is ${gap.toFixed(2)}m from walk target ${id}`);
    }
  }
});

// The terrace gate is a 4.8m-wide hole in the fence at z 7.0 and it is the only way onto the deck.
// Batch 1 lost pathfinding to a prop 0.67m off it; nothing standing may come near it again.
test('no standing star piece crowds the terrace gate lane', () => {
  const gate = AREA1.regions.find(r => r.id === 'terrace');
  assert.ok(gate, 'the terrace region must exist for this to mean anything');
  for (const item of starRows()) {
    if (!STANDS_IN_THE_ROOM(item)) continue;
    const { x, z } = item.slot;
    // distance from the gate opening: 0 while inside the mouth, growing sideways past its jambs
    const lateral = Math.max(0, Math.abs(x - gate.gateX) - gate.gateHalfW);
    const gap = Math.hypot(lateral, gate.z0 - 0.4 - z);
    assert.ok(gap >= 2.0, `${item.id} is ${gap.toFixed(2)}m from the terrace gate lane`);
  }
});

test('no star piece shares a volume with another decor piece', () => {
  const list = DECOR.filter(i => i.region === 'interior');
  for (const item of starRows()) {
    for (const other of list) {
      if (other.id === item.id) continue;
      const gap = Math.hypot(item.slot.x - other.slot.x, item.slot.y - other.slot.y, item.slot.z - other.slot.z);
      assert.ok(gap >= 0.9, `${item.id} overlaps ${other.id} (${gap.toFixed(2)}m)`);
    }
  }
});

// Wall pieces are authored facing +z and turned onto their wall by slot.rot, so a piece whose
// rotation does not match the wall it is mounted on renders face-first into the plaster.
test('wall-mounted star pieces face into the room', () => {
  const { w, d } = AREA1.size;
  const FACING = { art: 1, mural: 1, sign: 1, hanging: 1 };
  for (const item of starRows()) {
    if (!FACING[item.kind]) continue;
    const { x, z, rot } = item.slot;
    const west = Math.abs(x + w / 2) < 0.6, east = Math.abs(x - w / 2) < 0.6;
    const north = Math.abs(z + d / 2) < 0.6;
    assert.ok(west || east || north, `${item.id} is a wall piece but touches no wall`);
    const want = west ? Math.PI / 2 : east ? -Math.PI / 2 : 0;
    assert.ok(Math.abs(rot - want) < 1e-9, `${item.id} rot ${rot} should be ${want} for its wall`);
  }
});
