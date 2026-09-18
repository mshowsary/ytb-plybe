// Batch 4b (plan 3.9) — the Pet Spa's browser bridge (src/systems/spa.js). These tests pin the PURE
// parts: proximity geometry (near), the friendship-tier lookup, the follower-award fallback, and the
// resolved/already-credited session model (sessionNeedsCredit) — the same de-dupe shape
// src/systems/photo.js's own `creditedFor` map uses. None of this calls createSpaBridge/
// createGroomGame themselves, which build real DOM (document.createElement) this repo's plain
// `node --test` has no browser/jsdom for — exactly the split test/photo.test.js already draws
// around src/systems/photo.js (there is no browser-level test file for that bridge either; only its
// underlying sim/world.js functions are pinned there).
//
// src/sim/world.js's groom/bath mechanics (stepGroomTable/stepBath/resolveGroomBeat) were authored
// by a different task in this same batch, in parallel with this one, and had already landed by the
// time this file was finished — spa.js binds them with a normal named import, exactly like
// photo.js's own. followers.js's FOLLOWER_SOURCES.spaSession has NOT landed as of this writing
// (it is this task's own wiringNeeded, not another task's parallel work), which is what the
// followersForSpaSession fallback test below is actually pinning.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVE_RADIUS, COLLECT_RADIUS, near, tierForGroomCustomer, followersForSpaSession, sessionNeedsCredit,
  createSpaBridge,
} from '../src/systems/spa.js';
import { ensurePetBook, recordPetVisit, PET_FRIENDSHIP_TIERS } from '../src/sim/petBook.js';

test('the module loads and exports its real sim bindings', () => {
  assert.equal(typeof createSpaBridge, 'function');
  assert.ok(SERVE_RADIUS > 0 && COLLECT_RADIUS > 0);
  // Matches photo.js's own SERVE_RADIUS (1.3) / COLLECT_RADIUS (1.2) exactly — a spa station that
  // manned/collected at a noticeably different distance would read as a bug, not a design choice.
  assert.equal(SERVE_RADIUS, 1.3);
  assert.equal(COLLECT_RADIUS, 1.2);
});

test('near(): a simple radius check, symmetric and exclusive at the boundary', () => {
  const a = { x: 0, z: 0 };
  assert.equal(near(a, { x: 0.5, z: 0 }, 1), true);
  assert.equal(near(a, { x: 1, z: 0 }, 1), false, 'exactly at the radius is NOT near (strict <)');
  assert.equal(near(a, { x: 5, z: 5 }, 1), false);
  assert.equal(near(a, { x: 0, z: 0 }, 1), true);
});

test('tierForGroomCustomer reads the same Pet Visitor Book friendship tier photo.js\'s tierFor does', () => {
  const meta = {};
  ensurePetBook(meta);
  const customer = { species: 'cat', petVariant: 0 };
  assert.equal(tierForGroomCustomer(meta, customer), 0, 'a never-visited pet starts at tier 0 (New Face)');

  // Visit enough times to cross into the second tier (PET_FRIENDSHIP_TIERS[1].minVisits) and confirm
  // the bridge's lookup tracks it — this is the exact mechanism a finished groom session feeds via
  // recordPetVisit in creditGroomSession.
  const need = PET_FRIENDSHIP_TIERS[1].minVisits;
  for (let i = 0; i < need; i++) recordPetVisit(meta, 'cat', 0);
  assert.equal(tierForGroomCustomer(meta, customer), 1);
});

test('tierForGroomCustomer defaults petVariant to 0 and tolerates a missing customer', () => {
  const meta = {};
  ensurePetBook(meta);
  assert.equal(tierForGroomCustomer(meta, { species: 'dog' }), 0);
  assert.doesNotThrow(() => tierForGroomCustomer(meta, null));
});

test('followersForSpaSession falls back to a small positive literal (src/sim/followers.js does not export it yet)', () => {
  const n = followersForSpaSession();
  assert.equal(typeof n, 'number');
  assert.ok(n > 0 && n < 10, 'a "small award" per the task brief, not a photo-sized one');
});

test('sessionNeedsCredit: false with no session, or an unresolved one', () => {
  const credited = new Map();
  assert.equal(sessionNeedsCredit({ id: 'groom1', session: null }, credited), false);
  assert.equal(sessionNeedsCredit({ id: 'groom1', session: { customerId: 5, resolved: false } }, credited), false);
});

test('sessionNeedsCredit: true exactly once per finished customer, then false until a NEW customer resolves', () => {
  const credited = new Map();
  const st = { id: 'groom1', session: { customerId: 5, resolved: true, species: 'cat', variant: 0 } };
  assert.equal(sessionNeedsCredit(st, credited), true);
  credited.set(st.id, st.session.customerId); // mirrors creditGroomSession's own bookkeeping
  assert.equal(sessionNeedsCredit(st, credited), false, 'the same finished customerId must not re-credit');

  // A different customer at the same station (the next guest through groom1) needs crediting again.
  st.session = { customerId: 6, resolved: true, species: 'dog', variant: 1 };
  assert.equal(sessionNeedsCredit(st, credited), true);
});

test('sessionNeedsCredit is de-duped PER STATION: bath1 finishing the same customerId as groom1 still needs its own credit', () => {
  const credited = new Map();
  const groom = { id: 'groom1', session: { customerId: 9, resolved: true } };
  const bath = { id: 'bath1', session: { customerId: 9, resolved: true } };
  assert.equal(sessionNeedsCredit(groom, credited), true);
  credited.set(groom.id, groom.session.customerId);
  assert.equal(sessionNeedsCredit(bath, credited), true, 'a different station id must not be shadowed by groom1\'s own map entry');
});
