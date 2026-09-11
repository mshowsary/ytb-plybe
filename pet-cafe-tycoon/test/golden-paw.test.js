// test/golden-paw.test.js — the Golden Paw ceremony (plan §3.4).
//
// The one thing this file exists to prove is that the ceremony fires ONCE, EVER: not twice in a
// session, not again on the next closing phase, and above all not on every page load. The rest of
// the suite guards the roster/geometry helpers and the reduced-motion contract.
//
// DOM-free, like test/resident-pets.test.js: createGoldenPawCeremony's summary decoration and its
// stylesheet both bail out when `document` is undefined, so the module can be exercised headless
// against a plain THREE.Scene and stubbed ambience/fx handles.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AREA1 } from '../data/area1.js';
import {
  GOLDEN_PAW_CEREMONY_SECONDS,
  GOLDEN_PAW_MAX_GUESTS,
  GOLDEN_PAW_REGULAR_VISITS,
  GOLDEN_PAW_RUG,
  createGoldenPawCeremony,
  goldenPawCeremonyReady,
  goldenPawEntryPose,
  goldenPawGatherPose,
  goldenPawRating,
  goldenPawRoster,
} from '../src/systems/goldenPaw.js';
import { PAW_MAX_STAR, goldenPawDue } from '../src/sim/pawRating.js';
import { PET_BESTIE_VISITS } from '../src/sim/petBook.js';
import { createAmbience } from '../src/render/ambience.js';

// --- roster ---------------------------------------------------------------------------------------

test('roster puts residents first, then regulars in canonical order, with no duplicates', () => {
  const meta = {
    residents: ['bunny:0', 'dog:1'],
    petFriendship: {
      'bunny:0': PET_BESTIE_VISITS,          // already a resident: must not appear twice
      'cat:2': GOLDEN_PAW_REGULAR_VISITS,
      'dog:1': PET_BESTIE_VISITS,            // already a resident
      'cat:0': GOLDEN_PAW_REGULAR_VISITS + 4,
      'hamster:1': GOLDEN_PAW_REGULAR_VISITS,
    },
  };
  // Residents keep their save order; the rest follow petBook's cat -> dog -> bunny -> hamster order.
  assert.deepEqual(goldenPawRoster(meta), ['bunny:0', 'dog:1', 'cat:0', 'cat:2', 'hamster:1']);
});

test('roster ignores pets below the Regular tier and rejects malformed keys', () => {
  const meta = {
    residents: ['cat:99', 'not-a-pet', 42, 'cat:0'],
    petFriendship: { 'dog:0': GOLDEN_PAW_REGULAR_VISITS - 1 },
  };
  assert.deepEqual(goldenPawRoster(meta), ['cat:0'], 'only the one valid, earned key survives');
  assert.deepEqual(goldenPawRoster(null), []);
  assert.deepEqual(goldenPawRoster({}), []);
});

test('roster is capped so a full 20-pet book cannot pile the whole catalogue onto the rug', () => {
  const friendship = {};
  for (const species of ['cat', 'dog', 'bunny', 'hamster']) {
    for (let v = 0; v < 5; v++) friendship[`${species}:${v}`] = PET_BESTIE_VISITS;
  }
  assert.equal(goldenPawRoster({ petFriendship: friendship }).length, GOLDEN_PAW_MAX_GUESTS);
  assert.equal(goldenPawRoster({ petFriendship: friendship }, 3).length, 3);
});

// --- gathering geometry ---------------------------------------------------------------------------

test('a lone guest sits on the medallion facing the camera, not off in a ring of one', () => {
  const pose = goldenPawGatherPose(0, 1);
  assert.equal(pose.x, GOLDEN_PAW_RUG.x);
  assert.equal(pose.z, GOLDEN_PAW_RUG.z);
  assert.equal(pose.ry, Math.PI, 'faces south, toward the play camera');
});

test('every gathered guest lands on the rug and faces the medallion', () => {
  // render/ambience.js authors the rug as 5.8 x 3.6 centred on (0.3, 2.45).
  const halfW = 5.8 / 2, halfD = 3.6 / 2;
  for (const count of [2, 3, 5, 8, 9, GOLDEN_PAW_MAX_GUESTS]) {
    for (let i = 0; i < count; i++) {
      const p = goldenPawGatherPose(i, count);
      assert.ok(Math.abs(p.x - GOLDEN_PAW_RUG.x) <= halfW, `x on rug (${count}/${i})`);
      assert.ok(Math.abs(p.z - GOLDEN_PAW_RUG.z) <= halfD, `z on rug (${count}/${i})`);
      // rotation.y = atan2(dx, dz) is render/pets.js's facing convention: walking one step along it
      // from the pose has to move the guest toward the centre.
      const nx = p.x + Math.sin(p.ry) * 0.1, nz = p.z + Math.cos(p.ry) * 0.1;
      const before = Math.hypot(p.x - GOLDEN_PAW_RUG.x, p.z - GOLDEN_PAW_RUG.z);
      const after = Math.hypot(nx - GOLDEN_PAW_RUG.x, nz - GOLDEN_PAW_RUG.z);
      assert.ok(after < before + 1e-9, `faces inward (${count}/${i})`);
    }
    // Deterministic: no rng anywhere in the layout, so a screenshot reproduces across reloads.
    assert.deepEqual(goldenPawGatherPose(0, count), goldenPawGatherPose(0, count));
  }
});

test('entry poses start outside the ring and stay inside the room', () => {
  for (let i = 0; i < 6; i++) {
    const to = goldenPawGatherPose(i, 6);
    const from = goldenPawEntryPose(to);
    const out = Math.hypot(from.x - GOLDEN_PAW_RUG.x, from.z - GOLDEN_PAW_RUG.z);
    const on = Math.hypot(to.x - GOLDEN_PAW_RUG.x, to.z - GOLDEN_PAW_RUG.z);
    assert.ok(out > on, 'the walk is inward, never outward');
    assert.ok(from.x >= -8.6 && from.x <= 8.6, 'inside the 20 m room');
    assert.ok(from.z >= -1.2 && from.z <= 6.4, 'clear of the north production row and the seats');
  }
});

// --- harness --------------------------------------------------------------------------------------

function fakeAmbience() {
  const calls = { setGoldenPaw: [], celebrate: [] };
  return {
    calls,
    setGoldenPaw: (on, opts = {}) => calls.setGoldenPaw.push({ on: !!on, animate: !!opts.animate }),
    celebrate: seconds => calls.celebrate.push(seconds),
  };
}

function fakeFx() {
  const bursts = [];
  return { bursts, burst: (x, y, z, hex, n) => bursts.push({ x, y, z, hex, n }) };
}

function fakeGame(metaOverrides = {}, dayOverrides = {}) {
  const checkpoints = [];
  return {
    checkpoints,
    meta: {
      goldenPaw: false, pawBest: 0, followers: 0, residents: [], petFriendship: {},
      petBook: {}, album: {}, career: {},
      ...metaOverrides,
    },
    stats: { served: 0 },
    settings: {},
    dayState: { day: 9, t: 0, phase: 'closing', _ended: false, ...dayOverrides },
    world: { built: new Set(), area: AREA1 },
    requestCheckpoint: reason => checkpoints.push(reason),
  };
}

// meta.pawBest is the RATCHET, and pawRatingState reports best = max(stored, live) — so a save that
// has already been awarded ★5 is the honest, minimal way to put the ceremony on the launch pad
// without reconstructing 120 guests, a terrace, a gold cup and 2000 followers here.
const star5 = extra => fakeGame({ pawBest: PAW_MAX_STAR, ...extra });

function run(ceremony, seconds, step = 1 / 30) {
  for (let i = 0; i < Math.ceil(seconds / step); i++) ceremony.update(step);
}

// One update is enough to trigger: the rating poll timer starts already expired, so the very first
// frame of the closing phase is the one that checks.
const FIRST_POLL = 1 / 30;

// --- the trigger ----------------------------------------------------------------------------------

test('the ceremony is due only at ★5, only during closing, and only while unclaimed', () => {
  assert.equal(goldenPawCeremonyReady(star5()), true);
  assert.equal(goldenPawRating(star5()).best, PAW_MAX_STAR);

  for (const phase of ['morning', 'rush', 'afternoon']) {
    const G = star5(); G.dayState.phase = phase;
    assert.equal(goldenPawCeremonyReady(G), false, `${phase} is not the ceremony phase`);
  }
  assert.equal(goldenPawCeremonyReady(fakeGame()), false, 'a ★0 café earns nothing');
  assert.equal(goldenPawCeremonyReady(star5({ goldenPaw: true })), false, 'already awarded');
  assert.equal(goldenPawCeremonyReady(null), false);
});

// --- the ceremony itself --------------------------------------------------------------------------

test('the ceremony fires once: it mounts the sign, gathers the roster and records the award', () => {
  const S = { scene: new THREE.Scene() };
  const G = star5({ residents: ['cat:0'], petFriendship: { 'dog:1': PET_BESTIE_VISITS } });
  const ambience = fakeAmbience(), fx = fakeFx();
  const hidden = [];
  const ceremony = createGoldenPawCeremony(S, G, {
    ambience, fx, residents: { setCeremonyHidden: v => hidden.push(v) },
  });

  assert.equal(ceremony.phase, 'idle');
  ceremony.update(FIRST_POLL);
  assert.equal(ceremony.phase, 'running');
  assert.equal(G.meta.goldenPaw, true, 'the one-shot record is written immediately');
  assert.equal(goldenPawDue(G.meta), false, 'sim/pawRating.js agrees the ceremony is spent');
  assert.ok(G.meta.followers > 0, 'the Golden Paw follower award is paid');
  assert.equal(G.meta.pawBest, PAW_MAX_STAR, 'the live ratchet is raised alongside the flag');
  assert.ok(G.checkpoints.includes('golden-paw'), 'the award is checkpointed, not left to the next save');

  assert.deepEqual(ambience.calls.setGoldenPaw.at(-1), { on: true, animate: true });
  assert.equal(ambience.calls.celebrate.length, 1, 'the string lights pulse');
  assert.ok(fx.bursts.length >= 1, 'gold confetti over the rug');
  assert.equal(fx.bursts[0].hex, '#FFD24A');
  assert.equal(ceremony.guestCount, 2, 'the resident and the Bestie regular both gather');
  assert.deepEqual(hidden, [true], 'the settled residents stand down so no cat appears twice');

  // ...and it ends, putting the borrowed residents back.
  run(ceremony, GOLDEN_PAW_CEREMONY_SECONDS + 1);
  assert.equal(ceremony.phase, 'done');
  assert.equal(ceremony.guestCount, 0, 'the gathered copies are removed from the scene');
  assert.deepEqual(hidden, [true, false]);
});

test('the ceremony never fires a second time in the same session', () => {
  const S = { scene: new THREE.Scene() };
  const G = star5({ residents: ['cat:0'] });
  const ambience = fakeAmbience(), fx = fakeFx();
  const ceremony = createGoldenPawCeremony(S, G, { ambience, fx });

  run(ceremony, GOLDEN_PAW_CEREMONY_SECONDS + 2);
  assert.equal(ceremony.phase, 'done');
  const mounts = ambience.calls.setGoldenPaw.length, bursts = fx.bursts.length;

  // A new day rolls around and closes again on a café that still holds ★5.
  G.dayState.day = 10; G.dayState.phase = 'morning'; ceremony.update(1);
  G.dayState.phase = 'closing';
  run(ceremony, GOLDEN_PAW_CEREMONY_SECONDS + 2);

  assert.equal(ceremony.phase, 'done');
  assert.equal(ceremony.guestCount, 0);
  assert.equal(ambience.calls.setGoldenPaw.length, mounts, 'the sign is not re-mounted');
  assert.equal(fx.bursts.length, bursts, 'no second confetti');
});

test('THE RELOAD CASE: a restored save shows the sign and never replays the ceremony', () => {
  const S = { scene: new THREE.Scene() };
  // Exactly what main.js sees after G.restore on a café that was awarded in an earlier session.
  const G = star5({ goldenPaw: true, residents: ['cat:0'] });
  const ambience = fakeAmbience(), fx = fakeFx();
  const ceremony = createGoldenPawCeremony(S, G, { ambience, fx });

  ceremony.refresh();
  assert.deepEqual(ambience.calls.setGoldenPaw.at(-1), { on: true, animate: false },
    'the plaque is simply there — never animated on load');
  assert.equal(ceremony.phase, 'done');

  run(ceremony, GOLDEN_PAW_CEREMONY_SECONDS + 2);
  assert.equal(ceremony.guestCount, 0, 'no gathering');
  assert.equal(fx.bursts.length, 0, 'no confetti');
  assert.equal(ambience.calls.celebrate.length, 0, 'no light pulse');
  assert.equal(G.meta.followers, 0, 'the follower award is not paid a second time');
});

test('refresh on a café that has NOT earned the award leaves the wall bare', () => {
  const S = { scene: new THREE.Scene() };
  const G = fakeGame();
  const ambience = fakeAmbience();
  const ceremony = createGoldenPawCeremony(S, G, { ambience });
  ceremony.refresh();
  assert.deepEqual(ambience.calls.setGoldenPaw.at(-1), { on: false, animate: false });
  assert.equal(ceremony.phase, 'idle', 'still earnable');
});

test('prefers-reduced-motion: the award still happens, the movement does not', () => {
  const S = { scene: new THREE.Scene() };
  const G = star5({ residents: ['cat:0', 'dog:0'] });
  G.settings.reducedMotion = true; // the project-level opt-out the ceremony checks first
  const ambience = fakeAmbience(), fx = fakeFx();
  const ceremony = createGoldenPawCeremony(S, G, { ambience, fx });

  ceremony.update(1 / 30);
  assert.equal(ceremony.phase, 'running');
  assert.equal(G.meta.goldenPaw, true, 'the award is recorded either way');
  assert.deepEqual(ambience.calls.setGoldenPaw.at(-1), { on: true, animate: false }, 'no mount animation');
  assert.equal(ambience.calls.celebrate.length, 0, 'no pulsing lights');
  assert.equal(fx.bursts.length, 0, 'no confetti');
  assert.equal(ceremony.guestCount, 2, 'the pets are still gathered — they simply do not walk in');
});

test('the ceremony survives a café with no residents, no regulars and no fx handle', () => {
  const S = { scene: new THREE.Scene() };
  const G = star5();
  const ambience = fakeAmbience();
  const ceremony = createGoldenPawCeremony(S, G, { ambience });
  run(ceremony, GOLDEN_PAW_CEREMONY_SECONDS + 2);
  assert.equal(ceremony.phase, 'done');
  assert.equal(ceremony.guestCount, 0);
  assert.equal(G.meta.goldenPaw, true);
});

// --- render/ambience.js's half of the contract ------------------------------------------------------

test('ambience mounts and restores the gold paw sign, and a restored sign carries no animation', () => {
  const ambience = createAmbience(AREA1);
  assert.equal(typeof ambience.setGoldenPaw, 'function');
  assert.equal(typeof ambience.celebrate, 'function');

  const sign = ambience.group.children.find(c => c.isGroup && c.position.x === -2.5);
  assert.ok(sign, 'the plaque group is on the north wall panel between the west and centre windows');
  assert.equal(sign.visible, false, 'nothing on the wall before the award');

  // Restore path: full size on the very first frame, no growth animation to sit through.
  ambience.setGoldenPaw(true, { animate: false });
  assert.equal(sign.visible, true);
  assert.equal(sign.scale.x, 1);
  ambience.update(1 / 60);
  assert.equal(sign.scale.x, 1);

  // Earned path: starts collapsed and settles at exactly 1.
  ambience.setGoldenPaw(true, { animate: true });
  assert.ok(sign.scale.x < 0.05, 'the mount starts from nothing');
  for (let i = 0; i < 120; i++) ambience.update(1 / 60);
  assert.equal(sign.scale.x, 1, 'and lands on the same transform the restore path uses');
  assert.equal(sign.position.y, 1.75);
});

test('ambience.celebrate is a bounded pulse that returns the string lights to their resting tint', () => {
  const ambience = createAmbience(AREA1);
  const lights = ambience.group.children.find(c => c.isInstancedMesh && c.material.color);
  const resting = lights.material.color.getHex();

  ambience.celebrate(2);
  for (let i = 0; i < 30; i++) ambience.update(1 / 60);
  // A pulse is only observable as *some* change; assert it ends, which is what matters for cert.
  for (let i = 0; i < 300; i++) ambience.update(1 / 60);
  assert.equal(lights.material.color.getHex(), resting, 'the tint is put back when the pulse ends');
  assert.ok(lights.material.opacity > 0.8, 'and so is the resting opacity swing');
});
