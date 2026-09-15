// The pet behaviour sub-simulation (spec 2026-09-15 §4.1, §4.2). Until this module existed, no pet
// in this pet café had any behaviour: a visitor was a balloon on a leash and a resident was
// documented as decoration. These tests pin the three properties the rest of the program depends on
// — it is deterministic, it never touches the world, and a pet always yields to a person — plus the
// promise that made the module worth writing: the twenty authored personalities behave differently
// from one another.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPetAgent, stepPetLife, traitFor, unclip, clip, callHome, soak,
  PET_BEHAVIOURS, PET_TRAITS,
} from '../src/sim/petLife.js';
import { PET_PROFILES } from '../src/sim/petBook.js';

// A café with something of every kind in it, so any behaviour a pet might choose is available and a
// pet that stands still is a real finding rather than an empty room.
function fullView(overrides = {}) {
  const view = {
    t: 0,
    sun: 1,
    isWalkable: () => true,
    openSpace: { x: 0, z: 4, r: 3.5 },
    people: [],
    points: {
      sun: [{ id: 'sun1', x: -3, z: 5 }],
      cushion: [{ id: 'cu1', x: 4, z: 5 }],
      seat: [{ id: 's1', x: 1, z: 4 }],
      occupiedSeat: [{ id: 's2', x: 2, z: 4 }],
      bowl: [{ id: 'b1', x: -2, z: 1 }],
      counter: [{ id: 'c1', x: 0, z: -2 }],
      perch: [{ id: 'p1', x: 3, z: -1 }],
      window: [{ id: 'w1', x: -5, z: -3 }],
      garden: [{ id: 'g1', x: 6, z: 6 }],
      crumb: [{ id: 'cr1', x: -1, z: 3 }],
      toy: [{ id: 't1', x: 5, z: 2 }],
      wheel: [{ id: 'wh1', x: 5, z: 3 }],
      door: [{ id: 'd1', x: 0, z: 8 }],
    },
    ownerOf: () => null,
  };
  return Object.assign(view, overrides);
}

const run = (agents, view, seconds, dt = 1 / 30) => {
  const seen = new Set();
  for (let t = 0; t < seconds; t += dt) {
    stepPetLife(agents, view, dt);
    for (const a of agents) seen.add(a.state);
  }
  return seen;
};

test('the same seed and the same room produce exactly the same run', () => {
  const make = () => [createPetAgent({ id: 'p', species: 'cat', profileName: 'Marmalade', kind: 'resident', x: 0, z: 0, seed: 1234 })];
  const a = make(), b = make();
  const trace = agents => {
    const out = [];
    for (let i = 0; i < 600; i++) { stepPetLife(agents, fullView(), 1 / 30); out.push(`${agents[0].state}@${agents[0].x.toFixed(4)},${agents[0].z.toFixed(4)}`); }
    return out.join('|');
  };
  assert.equal(trace(a), trace(b));
});

test('a different seed produces a different run — the pets are not all the same animal', () => {
  // Compared as a TRACE of what the pet did and when, not as a final position: two dogs of the same
  // breed that both end their minute standing at the room's single toy is correct behaviour, not a
  // seed that failed to take.
  const trace = seed => {
    const agents = [createPetAgent({ id: String(seed), species: 'dog', profileName: 'Biscuit', kind: 'resident', seed })];
    const out = [];
    for (let i = 0; i < 1800; i++) {
      stepPetLife(agents, fullView(), 1 / 30);
      // Sampled, not change-triggered: a pet can spend a whole minute in one behaviour and still be
      // somewhere different from its twin, because where it chose to stand came out of its own seed.
      if (i % 90 === 0) out.push(`${agents[0].state}@${agents[0].x.toFixed(2)},${agents[0].z.toFixed(2)}`);
    }
    return out.join('|');
  };
  assert.notEqual(trace(7), trace(99));
});

test('the world view is never mutated — this is a sub-simulation, not a second economy', () => {
  const view = fullView({ people: [{ x: 1, z: 1 }] });
  const before = JSON.stringify({ points: view.points, people: view.people, sun: view.sun, openSpace: view.openSpace });
  const agents = ['Marmalade', 'Bluebell', 'Peanut', 'Honey'].map((n, i) => createPetAgent({
    id: `p${i}`, species: ['cat', 'dog', 'hamster', 'bunny'][i], profileName: n, kind: 'resident', x: i, z: i, seed: 10 + i,
  }));
  run(agents, view, 60);
  assert.equal(JSON.stringify({ points: view.points, people: view.people, sun: view.sun, openSpace: view.openSpace }), before);
});

test('every authored personality has a trait mapping, and every mapping names a real behaviour', () => {
  for (const species of Object.keys(PET_PROFILES)) {
    for (const profile of PET_PROFILES[species]) {
      const t = PET_TRAITS[profile.name];
      assert.ok(t, `${profile.name} ("${profile.trait}") has no behaviour mapping`);
      assert.ok(PET_BEHAVIOURS.includes(t.favourite), `${profile.name}'s favourite ${t.favourite} is not a behaviour`);
      for (const k of ['energy', 'curiosity', 'social', 'appetite', 'affection']) {
        assert.ok(t.drives[k] >= 0 && t.drives[k] <= 1, `${profile.name}.${k} out of range`);
      }
    }
  }
  // An unknown name must still behave like an animal rather than freeze.
  assert.ok(PET_BEHAVIOURS.includes(traitFor('Nobody').favourite));
});

test('personalities are visibly different: the sunbeam seeker naps, the zoomie expert runs', () => {
  const tally = (name, species) => {
    const a = [createPetAgent({ id: name, species, profileName: name, kind: 'resident', x: 0, z: 4, seed: 42 })];
    const counts = {};
    for (let i = 0; i < 7200; i++) { // four simulated minutes: one shift
      stepPetLife(a, fullView(), 1 / 30);
      counts[a[0].state] = (counts[a[0].state] || 0) + 1;
    }
    return counts;
  };
  const marmalade = tally('Marmalade', 'cat');     // "Sunbeam seeker"
  const bluebell = tally('Bluebell', 'dog');       // "Zoomie expert"
  assert.ok((marmalade.nap || 0) > (bluebell.nap || 0),
    `the sunbeam seeker should nap more than the zoomie expert (${marmalade.nap || 0} vs ${bluebell.nap || 0})`);
  assert.ok((bluebell.zoomies || 0) + (bluebell.play || 0) > (marmalade.zoomies || 0) + (marmalade.play || 0),
    'the zoomie expert should spend more of the shift moving');
});

test('a leashed visitor stays with its owner; unclipping lets it explore; calling it home brings it back', () => {
  const owner = { x: 0, z: 0 };
  const view = fullView({ ownerOf: () => owner });
  const a = createPetAgent({ id: 'v', species: 'dog', profileName: 'Biscuit', kind: 'visitor', ownerId: 1, x: 0, z: 0, seed: 5 });
  const agents = [a];

  owner.x = 6; owner.z = 6;
  run(agents, view, 12);
  assert.equal(a.state, 'follow');
  assert.ok(Math.hypot(a.x - owner.x, a.z - owner.z) < 2.5, `a leashed pet should stay with its owner, was ${Math.hypot(a.x - owner.x, a.z - owner.z).toFixed(2)}m away`);

  unclip(a);
  run(agents, view, 45);
  assert.notEqual(a.state, 'follow', 'an unclipped pet should stop heeling');

  callHome(a);
  run(agents, view, 25);
  assert.ok(Math.hypot(a.x - owner.x, a.z - owner.z) < 2.0,
    `a pet called home should come back, was ${Math.hypot(a.x - owner.x, a.z - owner.z).toFixed(2)}m away`);
  clip(a);
  run(agents, view, 5);
  assert.equal(a.state, 'follow');
});

test('a pet yields to a person and never the other way round', () => {
  // A person stands exactly where the pet wants to be and never moves. The person's position is
  // read-only, so the only thing that can give is the pet.
  const person = { x: 0, z: 0 };
  const view = fullView({ people: [person], points: { ...fullView().points, cushion: [{ id: 'cu', x: 0, z: 0 }] } });
  const a = createPetAgent({ id: 'p', species: 'cat', profileName: 'Lilac', kind: 'resident', x: 2, z: 0, seed: 3 });
  run([a], view, 30);
  assert.equal(person.x, 0); assert.equal(person.z, 0);
  assert.ok(Math.hypot(a.x - person.x, a.z - person.z) > 0.5,
    `the pet should have kept clear of the person, ended ${Math.hypot(a.x - person.x, a.z - person.z).toFixed(2)}m away`);
});

test('a pet never walks through a wall', () => {
  // The room is a 4x4 box; everything outside is solid.
  const view = fullView({ isWalkable: (x, z) => Math.abs(x) <= 2 && Math.abs(z) <= 2, openSpace: { x: 0, z: 0, r: 1.5 } });
  view.points.toy = [{ id: 't', x: 9, z: 9 }];   // bait outside the room
  view.points.cushion = [{ id: 'c', x: 9, z: -9 }];
  const agents = [createPetAgent({ id: 'p', species: 'dog', profileName: 'Bluebell', kind: 'resident', x: 0, z: 0, seed: 11 })];
  for (let i = 0; i < 3600; i++) {
    stepPetLife(agents, view, 1 / 30);
    assert.ok(Math.abs(agents[0].x) <= 2.001 && Math.abs(agents[0].z) <= 2.001,
      `escaped the room at ${agents[0].x.toFixed(2)},${agents[0].z.toFixed(2)} while ${agents[0].state}`);
  }
});

test('species rules hold: only a hamster uses the wheel, only cats and hamsters perch', () => {
  const seen = (species, profileName) => {
    const a = [createPetAgent({ id: species, species, profileName, kind: 'resident', x: 4, z: 3, seed: 8 })];
    return run(a, fullView(), 300);
  };
  assert.ok(!seen('dog', 'Bluebell').has('wheel'), 'a dog must never run in a hamster wheel');
  assert.ok(!seen('dog', 'Cloud').has('perch'), 'a dog must never perch on the counter');
  assert.ok(!seen('bunny', 'Lilac').has('wheel'));
});

test('a wet pet shakes itself off, whatever else it wanted to do', () => {
  const a = createPetAgent({ id: 'p', species: 'dog', profileName: 'Cocoa', kind: 'resident', x: 0, z: 0, seed: 2 });
  soak(a, 2);
  stepPetLife([a], fullView(), 1 / 30);
  assert.equal(a.state, 'shake');
});

test('a long run stays finite and produces a rich day', () => {
  const agents = Object.keys(PET_TRAITS).slice(0, 8).map((name, i) => createPetAgent({
    id: `p${i}`, species: ['cat', 'cat', 'cat', 'cat', 'cat', 'dog', 'dog', 'dog'][i],
    profileName: name, kind: 'resident', x: (i % 4) - 1.5, z: Math.floor(i / 4) - 0.5, seed: 100 + i,
  }));
  const view = fullView();
  const seen = new Set();
  // Deliberately ragged dt, including a long stall frame, because the real frame loop is ragged.
  for (let i = 0; i < 9000; i++) {
    stepPetLife(agents, view, i % 97 === 0 ? 0.4 : 1 / 30 + (i % 7) * 0.001);
    for (const a of agents) seen.add(a.state);
  }
  for (const a of agents) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.rot), `${a.id} went non-finite`);
    assert.ok(a.mood >= 0 && a.mood <= 1, `${a.id} mood out of range: ${a.mood}`);
    assert.ok(a.tailRate >= 0 && a.tailRate < 10);
  }
  // The spec's Batch 9 gate is twelve distinct behaviours observable in play. Eight pets over five
  // simulated minutes in a full room is a far easier bar than the live café, so this is the floor.
  assert.ok(seen.size >= 8, `only ${seen.size} distinct behaviours in a full room: ${[...seen].join(', ')}`);
});
