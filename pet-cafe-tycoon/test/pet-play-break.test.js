import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PET_PLAY_BREAK_SECONDS, PET_PLAY_BREAK_SLOTS, petPlayBreakEligible,
  selectPetPlayBreakCustomers, startPetPlayBreak, stepPetPlayBreak,
  restorePetPlayBreakBoost, petPlayBreakActive,
} from '../src/sim/petPlayBreak.js';

function guest(id, patience, state = 'atBowl', mood = 'wait', extra = {}) {
  return { id, patience, state, mood, done: false, ...extra };
}
function game(customers = []) { return { customers, boosts: {} }; }
const rush = (day = 4) => ({ day, phase: 'rush', t: 90 });

test('Pet Play Break chooses exactly the two most stressed genuine waiting guests', () => {
  const customers = [
    guest(1, 3.2), guest(2, 1.4, 'atRegister'), guest(3, 2.1, 'queue'),
    guest(4, 0.8, 'enter'), guest(5, 0.7, 'atBowl', 'none'), guest(6, 0.6, 'atBowl', 'wait', { done: true }),
  ];
  assert.equal(petPlayBreakEligible(customers[0]), true);
  assert.equal(petPlayBreakEligible(customers[3]), false);
  assert.deepEqual(selectPetPlayBreakCustomers(customers).map(c => c.id), [2, 3]);
});

test('starting a break holds two guests without moving or reassigning their queue state', () => {
  const a = guest(1, 0.2, 'queue', 'wait', { counterId: 'dispCookie', slot: 0, x: 2, z: 3 });
  const b = guest(2, 2.4, 'atRegister', 'wait', { registerId: 'register1', slot: 0, x: -1, z: 4 });
  const G = game([a, b, guest(3, 7)]);
  const before = G.customers.map(c => ({ id:c.id, state:c.state, slot:c.slot, x:c.x, z:c.z }));
  const picked = startPetPlayBreak(G, rush());
  assert.deepEqual(picked.map(c => c.id), [1, 2]);
  assert.equal(G.boosts.petPlayBreak.remaining, PET_PLAY_BREAK_SECONDS);
  assert.equal(G.boosts.petPlayBreak.slots, PET_PLAY_BREAK_SLOTS);
  assert.ok(a.patience >= 1, 'near-expiry guest gets only the safety floor needed to survive the next tick');
  assert.deepEqual(G.customers.map(c => ({ id:c.id, state:c.state, slot:c.slot, x:c.x, z:c.z })), before);
});

test('post-sim stepping restores patience after ordinary drains and expires cleanly', () => {
  const a = guest(1, 2.5), b = guest(2, 3.5), G = game([a, b]);
  startPetPlayBreak(G, rush(), 2, 2);
  const floorA = a.patience, floorB = b.patience;

  // Pretend customer/world simulation has just drained both guests this frame.
  a.patience -= 0.4; b.patience -= 0.7;
  let r = stepPetPlayBreak(G, rush(), 0.5);
  assert.equal(r.active, true);
  assert.equal(a.patience, floorA);
  assert.equal(b.patience, floorB);

  a.patience -= 0.3; b.patience -= 0.3;
  r = stepPetPlayBreak(G, rush(), 1.5);
  assert.equal(r.expired, true);
  assert.equal(G.boosts.petPlayBreak, undefined);
  assert.equal(a._petBreakFloor, undefined);
  assert.equal(b._petBreakFloor, undefined);
});

test('a saved break restores only into the exact same rush and waits for new stressed guests', () => {
  const saved = { day: 4, remaining: 9.5, slots: 2 };
  const restored = restorePetPlayBreakBoost(saved, rush(4));
  assert.deepEqual(restored, { day:4, remaining:9.5, slots:2, recipientIds:[], needsRecipients:true });
  assert.equal(restorePetPlayBreakBoost(saved, { day:4, phase:'afternoon' }), null);
  assert.equal(restorePetPlayBreakBoost(saved, rush(5)), null);

  const G = { customers: [], boosts: { petPlayBreak: restored } };
  assert.equal(petPlayBreakActive(G.boosts, rush(4)), true);
  const idle = stepPetPlayBreak(G, rush(4), 5);
  assert.equal(idle.active, true);
  assert.equal(G.boosts.petPlayBreak.remaining, 9.5, 'reward time is not burned while reload has no eligible guests');

  G.customers.push(guest(7, 2), guest(8, 3));
  const attached = stepPetPlayBreak(G, rush(4), 0.5);
  assert.deepEqual(attached.assigned.map(c => c.id), [7, 8]);
  assert.equal(G.boosts.petPlayBreak.remaining, 9);
});
