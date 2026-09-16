// src/sim/petLife.js — what the animals are actually doing.
//
// WHY THIS EXISTS
// This is a pet café in which, until now, no pet has had any behaviour. A visiting pet was a balloon
// on a leash: src/sim/customers.js never modelled it as a creature at all, and residents are
// documented in their own file as "strictly decorative. No navigation, no collision, no simulation".
// Of the twenty personalities authored in sim/petBook.js — "Sunbeam seeker", "Counter inspector",
// "Zoomie expert", "Wheel-spin champion" — three had a canned pose clip and seventeen had nothing.
// Those trait lines are already behaviour descriptions. This module makes them true.
//
// WHAT IT IS, AND DELIBERATELY IS NOT (spec §4.1)
// A SUB-simulation. It reads a frozen view of the world and advances its own agents; it never writes
// to `world`, never touches stations, queues, patience, prices or coins, and is stepped after the
// economy sim. Three things follow from that, and all three are the point:
//   * tools/bot.js does not run this, so the 60-day economy ledger stays byte-identical by
//     construction rather than by careful review;
//   * test/nav-fullhouse.test.js is unaffected, because pets are not movers in its sense — they hold
//     no nav slot and nobody ever waits for one (§4.2: a person walks through the space a pet is
//     standing in and the PET yields);
//   * every behaviour here is a pure function of (agent, view, dt) and can be tested without a DOM,
//     a renderer or a running game.
//
// RANDOMNESS
// Each agent owns a seeded stream and draws from it ONLY on a state transition, never per frame.
// That keeps a replay stable regardless of frame rate, and keeps a test's expectations stable when
// an unrelated change shifts how many frames elapse.
import { makeRng } from '../core/rng.js';

// ---- the twenty personalities, as behaviour ----------------------------------------------------
// Drives are resting levels in 0..1, not starting values: a pet's drive decays toward its resting
// level, so a high `nap` cat spends its day drifting back toward wanting a nap while a high `play`
// dog drifts back toward wanting to move. `seeks` is the kind of place this pet prefers when it has
// a choice, and `favourite` is the behaviour its score is biased toward, so two pets in the same
// room with the same needs still do different things.
export const PET_TRAITS = {
  // cats
  Marmalade: { seeks: 'sun', favourite: 'nap', drives: { energy: 0.35, curiosity: 0.4, social: 0.3, appetite: 0.5, affection: 0.45 } },
  Tuxedo: { seeks: 'counter', favourite: 'perch', drives: { energy: 0.6, curiosity: 0.9, social: 0.35, appetite: 0.5, affection: 0.3 } },
  Lavender: { seeks: 'window', favourite: 'nap', drives: { energy: 0.3, curiosity: 0.45, social: 0.15, appetite: 0.4, affection: 0.35 } },
  Calico: { seeks: 'bowl', favourite: 'sniff', drives: { energy: 0.5, curiosity: 0.7, social: 0.35, appetite: 0.85, affection: 0.4 } },
  Nebula: { seeks: 'window', favourite: 'watch', drives: { energy: 0.55, curiosity: 0.75, social: 0.25, appetite: 0.45, affection: 0.4 } },
  // dogs
  Biscuit: { seeks: 'people', favourite: 'greet', drives: { energy: 0.7, curiosity: 0.6, social: 0.95, appetite: 0.55, affection: 0.8 } },
  Cocoa: { seeks: 'seat', favourite: 'nap', drives: { energy: 0.3, curiosity: 0.4, social: 0.5, appetite: 0.5, affection: 0.7 } },
  Cloud: { seeks: 'door', favourite: 'greet', drives: { energy: 0.65, curiosity: 0.55, social: 0.9, appetite: 0.45, affection: 0.6 } },
  Bluebell: { seeks: 'toy', favourite: 'zoomies', drives: { energy: 0.95, curiosity: 0.7, social: 0.6, appetite: 0.5, affection: 0.5 } },
  Comet: { seeks: 'toy', favourite: 'zoomies', drives: { energy: 0.9, curiosity: 0.8, social: 0.55, appetite: 0.45, affection: 0.5 } },
  // bunnies
  Snowdrop: { seeks: 'garden', favourite: 'watch', drives: { energy: 0.45, curiosity: 0.7, social: 0.3, appetite: 0.55, affection: 0.4 } },
  Mocha: { seeks: 'crumb', favourite: 'sniff', drives: { energy: 0.5, curiosity: 0.9, social: 0.35, appetite: 0.75, affection: 0.4 } },
  Lilac: { seeks: 'cushion', favourite: 'nap', drives: { energy: 0.3, curiosity: 0.4, social: 0.4, appetite: 0.45, affection: 0.55 } },
  Honey: { seeks: 'people', favourite: 'pose', drives: { energy: 0.6, curiosity: 0.55, social: 0.9, appetite: 0.5, affection: 0.75 } },
  Aurora: { seeks: 'cushion', favourite: 'nap', drives: { energy: 0.25, curiosity: 0.5, social: 0.3, appetite: 0.4, affection: 0.5 } },
  // hamsters
  Peanut: { seeks: 'crumb', favourite: 'forage', drives: { energy: 0.6, curiosity: 0.85, social: 0.3, appetite: 0.9, affection: 0.35 } },
  Clove: { seeks: 'wheel', favourite: 'wheel', drives: { energy: 0.9, curiosity: 0.6, social: 0.3, appetite: 0.55, affection: 0.35 } },
  Marble: { seeks: 'cushion', favourite: 'burrow', drives: { energy: 0.5, curiosity: 0.8, social: 0.25, appetite: 0.5, affection: 0.35 } },
  Saffron: { seeks: 'bowl', favourite: 'forage', drives: { energy: 0.5, curiosity: 0.6, social: 0.35, appetite: 0.9, affection: 0.4 } },
  Cosmo: { seeks: 'cushion', favourite: 'nap', drives: { energy: 0.2, curiosity: 0.5, social: 0.3, appetite: 0.4, affection: 0.45 } },
};

// A pet whose name this table has never heard of (a designer adds a profile, a save carries an old
// one) still behaves like an animal rather than freezing: middling drives, no strong preference.
const DEFAULT_TRAIT = { seeks: 'people', favourite: 'wander', drives: { energy: 0.55, curiosity: 0.6, social: 0.5, appetite: 0.5, affection: 0.5 } };

export function traitFor(profileName) {
  return PET_TRAITS[profileName] || DEFAULT_TRAIT;
}

// ---- species ------------------------------------------------------------------------------------
// Amble is the speed a pet moves at when it has somewhere to be but no urgency; dash is zoomies and
// chasing. A hamster is not slower because it is small -- it is slower because it stops constantly,
// which the behaviours below express through short hops rather than a low number here.
const SPECIES = {
  cat: { amble: 1.05, dash: 3.4, turn: 7, canPerch: true, canWheel: false },
  dog: { amble: 1.35, dash: 4.2, turn: 8, canPerch: false, canWheel: false },
  bunny: { amble: 1.0, dash: 3.2, turn: 9, canPerch: false, canWheel: false },
  hamster: { amble: 0.85, dash: 2.6, turn: 10, canPerch: true, canWheel: true },
};
const speciesOf = s => SPECIES[s] || SPECIES.dog;

// ---- behaviours ----------------------------------------------------------------------------------
// Each entry scores itself against the agent's current drives and what the room offers, and the
// highest score wins -- but only if it beats the incumbent by MIN_SWITCH_GAIN, which is what stops a
// pet flickering between two nearly-equal urges and reads, from outside, as an animal that has made
// up its mind. `min`/`max` bound how long a behaviour lasts once chosen.
export const PET_BEHAVIOURS = [
  'follow', 'wander', 'sniff', 'greet', 'play', 'nap', 'drink', 'beg',
  'watch', 'zoomies', 'shake', 'scratch', 'stretch', 'perch', 'forage',
  'wheel', 'burrow', 'pose', 'return',
];

const MIN_SWITCH_GAIN = 0.12;
// A pet that has just started doing something gets a grace period before anything can displace it,
// so a single loud frame (a guest walking past, a drive crossing a threshold) cannot cut a nap short
// after half a second. Interruptions that MUST win -- the owner leaving -- bypass this by scoring
// above 1, which no ordinary behaviour can reach.
const COMMIT_SECONDS = 1.6;
// Seconds after a nap ends during which another nap is progressively unattractive. Without it a pet
// whose resting energy is low (a "Nebula napper", a "Soft-seat connoisseur") wakes, re-scores, finds
// nap still the highest urge and lies straight back down — which is exactly what the first
// measurement showed.
// 12, not the 28 the first correction used: at 28 a cat whose whole personality is "Sunbeam seeker"
// napped for 4% of its shift, which is the same failure as sleeping through the day, inverted.
const NAP_COOLDOWN = 12;

// How close counts as arrived. Generous: a pet stopping dead on an exact point looks mechanical,
// and every behaviour below plays its idle motion in place once it is inside this radius.
const ARRIVE = 0.45;

function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

// Nearest point of a kind, or null. Points come from the view and are never mutated.
function nearestPoint(view, kind, x, z, maxDist = Infinity) {
  const list = view.points && view.points[kind];
  if (!list || !list.length) return null;
  let best = null, bestD = maxDist * maxDist;
  for (const p of list) {
    const d = dist2(x, z, p.x, p.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function nearestOtherPet(agents, self, maxDist = 4) {
  let best = null, bestD = maxDist * maxDist;
  for (const other of agents) {
    if (other === self || other.asleep) continue;
    const d = dist2(self.x, self.z, other.x, other.z);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

// ---- the agent ------------------------------------------------------------------------------------
export function createPetAgent(opts = {}) {
  const profileName = opts.profileName || '';
  const trait = traitFor(profileName);
  const seed = (opts.seed | 0) || 1;
  const rng = makeRng(seed);
  return {
    id: opts.id || `pet-${seed}`,
    species: opts.species || 'dog',
    profileName,
    kind: opts.kind === 'resident' ? 'resident' : 'visitor',
    ownerId: opts.ownerId ?? null,
    homeId: opts.homeId ?? null,          // a resident's cushion, so it has somewhere that is "its"
    x: opts.x || 0, z: opts.z || 0, rot: opts.rot || 0,
    vx: 0, vz: 0,
    state: 'wander', t: 0, target: null,
    leashed: opts.kind !== 'resident',    // a visitor arrives on the leash and is unclipped at the table
    asleep: false,
    // Drives start AT their resting level, so a pet that has just arrived behaves in character
    // immediately rather than spending its first minute drifting into character.
    drives: { ...trait.drives },
    mood: 0.6,
    trait,
    rng,
    // Presentation hints the render bridge reads; the sim never interprets them itself.
    pose: 'stand', lookAt: null, tailRate: 1, earsBack: false,
  };
}

// ---- drives ---------------------------------------------------------------------------------------
// Drives move toward their resting level all the time, and the ACTIVE behaviour pushes one of them
// the other way -- napping spends the desire to nap. Rates are per second and deliberately slow: the
// whole shift is four minutes, and a pet that cycles its entire personality twice a minute reads as
// a random-number generator rather than an animal.
// Calibrated against a shift, which is four minutes: REST_TAU is the time constant of the pull back
// toward a pet's resting level, and SPEND_RATE is how fast the active behaviour spends the drive it
// serves. The first draft had SPEND_RATE at 0.22, which drained a playing dog from full energy to
// empty in a little over two seconds and produced an animal that flickered between playing and
// sleeping; at 0.035 a dog plays for roughly ten seconds before it starts to tire and recovers over a
// nap, which is a rhythm you can actually watch.
const REST_TAU = 25;
const SPEND_RATE = 0.035;

function stepDrives(a, dt) {
  const rest = a.trait.drives;
  const k = Math.min(1, dt / REST_TAU);
  for (const key of ['energy', 'curiosity', 'social', 'appetite', 'affection']) {
    const d = a.drives[key];
    a.drives[key] = d + (rest[key] - d) * k;
  }
  const spend = (key, mult = 1) => { a.drives[key] = Math.max(0, a.drives[key] - SPEND_RATE * mult * dt); };
  switch (a.state) {
    // A nap RECHARGES hard. The first draft recovered energy at 0.7x the spend rate, which meant a
    // sleepy pet woke barely less sleepy and immediately wanted another nap: measured over a shift,
    // eight pets spent 42% of it asleep and one cat spent 87%. A nap that genuinely satiates, plus
    // the cooldown below, is what turns a café of sleeping animals into one with a rhythm.
    case 'nap': a.drives.energy = Math.min(1, a.drives.energy + SPEND_RATE * 1.4 * dt); break;
    // Burrowing into a cushion is half a nap and half an investigation, and it pays both.
    case 'burrow': a.drives.energy = Math.min(1, a.drives.energy + SPEND_RATE * 0.8 * dt); spend('curiosity', 0.8); break;
    case 'zoomies': case 'play': case 'wheel': spend('energy', 1.4); spend('social', 0.5); break;
    case 'greet': case 'pose': spend('social', 1.6); spend('affection', 0.6); break;
    case 'sniff': spend('curiosity', 1.2); break;
    // Foraging is eating crumbs off the floor, so it has to spend the appetite that drove it there.
    // Without this one line a hungry hamster forages for the entire shift and never does anything else.
    case 'forage': spend('curiosity', 1.0); spend('appetite', 1.1); break;
    case 'drink': spend('appetite', 1.8); break;
    case 'beg': spend('appetite', 0.5); break;
    case 'follow': case 'return': spend('affection', 0.8); break;
    // Watching, perching and burrowing are all curiosity being satisfied. Leaving perch out of this
    // list is what made one cat sit on the counter for 99% of a shift: nothing it did ever reduced
    // the urge that put it there.
    case 'watch': spend('curiosity', 0.8); break;
    case 'perch': spend('curiosity', 1.0); break;
    default: break;
  }
  // A pet that has just woken does not immediately want another nap, however low its resting energy.
  if (a.napCooldown > 0) a.napCooldown = Math.max(0, a.napCooldown - dt);
}

// ---- scoring ---------------------------------------------------------------------------------------
// One function per behaviour, returning 0 when the behaviour is impossible here and a 0..1 urge
// otherwise. Availability is checked FIRST in every case: a pet must never choose to do something
// the room cannot offer, because the failure mode is a pet standing still looking broken.
// How much a pet's authored favourite counts for. At 0.18 the "Zoomie expert" never once zoomed in a
// measured shift — playing with a toy outscored it by a hair every single time — which is precisely
// the failure this whole module exists to fix. 0.25 is enough for a personality to win its own trait.
const FAV_BONUS = 0.25;

function scoreBehaviour(name, a, view, agents) {
  const d = a.drives;
  const fav = a.trait.favourite === name ? FAV_BONUS : 0;
  switch (name) {
    case 'follow': {
      // Leashed visitors follow, full stop. This is not an urge, it is the leash.
      if (a.kind !== 'visitor' || !a.leashed) return 0;
      return 1.2;
    }
    case 'return': {
      // The owner is leaving. Outranks everything an unleashed pet could otherwise want.
      if (a.kind !== 'visitor' || a.leashed) return 0;
      return a.ownerLeaving ? 1.5 : 0;
    }
    case 'nap': {
      const spot = nearestPoint(view, a.trait.seeks === 'sun' ? 'sun' : 'cushion', a.x, a.z, 9)
        || nearestPoint(view, 'cushion', a.x, a.z, 9) || nearestPoint(view, 'seat', a.x, a.z, 6);
      if (!spot) return 0;
      // Sun matters to a sunbeam seeker only while there IS sun; at dusk the same cat wants a cushion.
      const sunBonus = a.trait.seeks === 'sun' ? (view.sun || 0) * 0.25 : 0;
      // Freshly awake, a nap cannot win no matter how low the resting energy — see NAP_COOLDOWN.
      const rested = a.napCooldown > 0 ? Math.max(0, 1 - a.napCooldown / NAP_COOLDOWN) : 1;
      return ((1 - d.energy) * 0.9 + sunBonus + fav) * rested;
    }
    case 'drink': {
      if (!nearestPoint(view, 'bowl', a.x, a.z, 10)) return 0;
      return d.appetite * 0.8 + fav;
    }
    case 'beg': {
      const table = nearestPoint(view, 'occupiedSeat', a.x, a.z, 6);
      if (!table) return 0;
      return d.appetite * 0.6 + d.social * 0.2 + fav;
    }
    case 'forage': {
      if (!nearestPoint(view, 'crumb', a.x, a.z, 8)) return 0;
      return d.appetite * 0.5 + d.curiosity * 0.4 + fav;
    }
    case 'greet': {
      const other = nearestOtherPet(agents, a, 4.5);
      if (!other) return 0;
      // Two pets should not both walk at each other forever; the one with more social urge leads.
      return d.social * 0.85 + fav;
    }
    case 'play': {
      if (!nearestPoint(view, 'toy', a.x, a.z, 9)) return 0;
      return d.energy * 0.7 + d.curiosity * 0.25 + fav;
    }
    case 'wheel': {
      if (!speciesOf(a.species).canWheel || !nearestPoint(view, 'wheel', a.x, a.z, 9)) return 0;
      return d.energy * 0.85 + fav;
    }
    case 'zoomies': {
      // Needs room as well as energy -- zoomies in a corridor is a pet vibrating against a counter.
      if (!view.openSpace) return 0;
      // Zoomies are a discharge of HAPPINESS, not a function of stored energy: gated on energy alone
      // (the first two drafts) a "Zoomie expert" measured 0% over a full shift, because playing with
      // a toy drained the very energy that was supposed to trigger the zoom. Mood carries most of the
      // weight now, the energy term only keeps an exhausted animal from sprinting, and the behaviour
      // pays for itself — it spends energy fast and lasts a few seconds, so it cannot dominate.
      // No energy THRESHOLD, after three measured attempts to find one that worked. Zoomies and play
      // are two expressions of the same drive, and any threshold loses the race: play drains energy
      // below the bar within seconds and the zoom never comes back. Scored just under play's own
      // energy weight instead, so the trait bonus is what decides — which is the whole point. A
      // "Zoomie expert" zooms; a "Sunbeam seeker" with a resting energy of 0.35 never gets near it.
      return d.energy * 0.62 + a.mood * 0.15 + fav;
    }
    case 'perch': {
      if (!speciesOf(a.species).canPerch) return 0;
      if (!nearestPoint(view, a.trait.seeks === 'counter' ? 'counter' : 'perch', a.x, a.z, 7)) return 0;
      return d.curiosity * 0.7 + fav;
    }
    case 'burrow': {
      // Cats, bunnies and hamsters dig into a cushion; a dog flops onto it. Ungated, this was the
      // hole the nap cooldown did not close, and a measured shift had a dog burrowing 7% of the time.
      if (a.species === 'dog') return 0;
      if (!nearestPoint(view, 'cushion', a.x, a.z, 8)) return 0;
      const rested = a.napCooldown > 0 ? Math.max(0, 1 - a.napCooldown / NAP_COOLDOWN) : 1;
      return (d.curiosity * 0.4 + (1 - d.energy) * 0.35 + fav) * rested;
    }
    case 'watch': {
      const what = nearestPoint(view, a.trait.seeks === 'garden' ? 'garden' : 'window', a.x, a.z, 9)
        || (view.people && view.people.length ? { x: view.people[0].x, z: view.people[0].z } : null);
      if (!what) return 0;
      return d.curiosity * 0.45 + fav;
    }
    case 'pose': {
      if (!view.people || !view.people.length) return 0;
      return d.social * 0.6 + d.affection * 0.3 + fav;
    }
    case 'sniff': return d.curiosity * 0.6 + fav;
    case 'wander': return 0.28 + fav;      // the floor: always possible, never exciting
    default: return 0;
  }
}

// One-shot reflexes. These are not chosen by score; something happened TO the pet and it reacts.
// Kept separate so a reflex can never be starved by a strong competing urge.
function reflex(a) {
  if (a.wetUntil && a.wetUntil > 0) return 'shake';
  if (a.justWoke) return 'stretch';
  return null;
}

// ---- movement ---------------------------------------------------------------------------------------
// Seek-and-arrive with separation from people. §4.2: the pet yields, never the person. A person's
// velocity is not consulted -- a simple repulsion from where people ARE keeps pets out from
// underfoot without pets appearing to dodge prophetically, which looks uncanny.
const PERSON_CLEAR = 0.75;
const PET_CLEAR = 0.5;

function steer(a, view, agents, speed, dt) {
  let ax = 0, az = 0;
  if (a.target) {
    const dx = a.target.x - a.x, dz = a.target.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    ax += (dx / len) * speed;
    az += (dz / len) * speed;
  }
  if (view.people) {
    for (const p of view.people) {
      const dx = a.x - p.x, dz = a.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001 && d < PERSON_CLEAR) {
        const push = (PERSON_CLEAR - d) / PERSON_CLEAR;
        ax += (dx / d) * push * speed * 2.2;
        az += (dz / d) * push * speed * 2.2;
      }
    }
  }
  for (const other of agents) {
    if (other === a) continue;
    const dx = a.x - other.x, dz = a.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.0001 && d < PET_CLEAR) {
      const push = (PET_CLEAR - d) / PET_CLEAR;
      ax += (dx / d) * push * speed * 0.8;
      az += (dz / d) * push * speed * 0.8;
    }
  }
  // Critically damped-ish approach to the desired velocity, so a pet accelerates and stops with
  // weight instead of snapping between still and full speed.
  const k = Math.min(1, dt * 8);
  a.vx += (ax - a.vx) * k;
  a.vz += (az - a.vz) * k;
  const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
  // Walls and furniture: try the full step, then each axis alone, so a pet slides along a counter
  // instead of sticking to it.
  if (!view.isWalkable || view.isWalkable(nx, nz)) { a.x = nx; a.z = nz; }
  else if (!view.isWalkable || view.isWalkable(nx, a.z)) { a.x = nx; a.vz = 0; }
  else if (!view.isWalkable || view.isWalkable(a.x, nz)) { a.z = nz; a.vx = 0; }
  else { a.vx = 0; a.vz = 0; }
  const sp = Math.hypot(a.vx, a.vz);
  if (sp > 0.05) {
    const want = Math.atan2(a.vx, a.vz);
    let diff = want - a.rot;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a.rot += diff * Math.min(1, speciesOf(a.species).turn * dt);
  }
  return sp;
}

function arrived(a) { return !a.target || dist2(a.x, a.z, a.target.x, a.target.z) < ARRIVE * ARRIVE; }

// ---- entering a behaviour ---------------------------------------------------------------------------
// The ONLY place the agent's rng is drawn, so the number of draws depends on decisions rather than
// on frame rate.
function enter(a, name, view, agents) {
  a.state = name;
  a.t = 0;
  a.target = null;
  a.asleep = false;
  a.justWoke = false;
  // Every pet that wants the same cushion would otherwise walk to the identical point and be held
  // apart only by the separation force, which reads as a queue rather than as animals choosing
  // their own spot. A small per-pet offset, drawn once on entry, gives each one its own place.
  const spread = () => (a.rng.f() - 0.5) * 0.7;
  const at = p => p && { x: p.x + spread(), z: p.z + spread() };
  const pick = kind => nearestPoint(view, kind, a.x, a.z, 12);
  switch (name) {
    case 'wander': {
      const r = 1.2 + a.rng.f() * 2.6, ang = a.rng.f() * Math.PI * 2;
      a.target = { x: a.x + Math.cos(ang) * r, z: a.z + Math.sin(ang) * r };
      a.holdFor = 2.5 + a.rng.f() * 3;
      break;
    }
    case 'follow': case 'return': a.holdFor = 0.5; break;
    case 'nap': {
      a.target = at((a.trait.seeks === 'sun' && pick('sun')) || pick('cushion') || pick('seat'));
      a.holdFor = 9 + a.rng.f() * 12;
      break;
    }
    case 'drink': { a.target = at(pick('bowl')); a.holdFor = 3 + a.rng.f() * 2; break; }
    case 'beg': { const s = pick('occupiedSeat'); a.target = s && { x: s.x + 0.5, z: s.z + 0.4 }; a.holdFor = 4 + a.rng.f() * 4; break; }
    case 'forage': { a.target = at(pick('crumb')); a.holdFor = 3 + a.rng.f() * 3; break; }
    case 'greet': {
      const other = nearestOtherPet(agents, a, 5);
      a.target = other && { x: other.x, z: other.z };
      a.greetId = other ? other.id : null;
      a.holdFor = 2.5 + a.rng.f() * 2;
      break;
    }
    case 'play': { a.target = at(pick('toy')); a.holdFor = 5 + a.rng.f() * 5; break; }
    case 'wheel': { a.target = at(pick('wheel')); a.holdFor = 6 + a.rng.f() * 6; break; }
    case 'perch': {
      a.target = at((a.trait.seeks === 'counter' && pick('counter')) || pick('perch'));
      a.holdFor = 5 + a.rng.f() * 6;
      break;
    }
    case 'burrow': { a.target = at(pick('cushion')); a.holdFor = 5 + a.rng.f() * 5; break; }
    case 'watch': {
      const w = (a.trait.seeks === 'garden' && pick('garden')) || pick('window');
      a.target = w && { x: w.x - 0.6, z: w.z + 0.6 };
      a.lookAt = w ? { x: w.x, z: w.z } : null;
      a.holdFor = 4 + a.rng.f() * 5;
      break;
    }
    case 'pose': a.holdFor = 2.5 + a.rng.f() * 2; break;
    case 'zoomies': {
      // A lap, not a straight line: three waypoints around the open space, taken at a dash.
      const c = view.openSpace;
      const ang = a.rng.f() * Math.PI * 2, r = c.r * (0.55 + a.rng.f() * 0.35);
      a.target = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
      a.lapsLeft = 2 + a.rng.i(0, 2);
      a.holdFor = 6;
      break;
    }
    case 'sniff': a.holdFor = 2 + a.rng.f() * 2.5; break;
    case 'shake': a.holdFor = 1.1; break;
    case 'stretch': a.holdFor = 1.5; break;
    case 'scratch': a.holdFor = 1.6; break;
    default: a.holdFor = 2; break;
  }
}

// ---- presentation hints -----------------------------------------------------------------------------
// The sim decides WHAT the animal is doing; these three lines are how the renderer should show it,
// computed here so every consumer agrees. Tail rate is the single most readable signal at the game's
// wide camera (spec §3), which is why happiness drives it directly.
function paintHints(a, speed) {
  a.mood = Math.max(0, Math.min(1,
    0.35 + a.drives.affection * 0.25 + (1 - a.drives.appetite) * 0.15 + a.drives.energy * 0.1
    + (a.state === 'play' || a.state === 'zoomies' || a.state === 'greet' ? 0.25 : 0)
    - (a.state === 'beg' ? 0.05 : 0)));
  a.tailRate = a.state === 'nap' ? 0.15 : 0.6 + a.mood * 2.2 + (speed > 0.6 ? 0.6 : 0);
  a.earsBack = a.state === 'shake' || (a.drives.energy < 0.15 && a.state !== 'nap');
  a.asleep = a.state === 'nap' && arrived(a) && a.t > 1.2;
  if (a.state === 'nap') a.pose = a.asleep ? 'sleep' : 'sit';
  else if (a.state === 'watch' || a.state === 'beg' || a.state === 'pose') a.pose = 'sit';
  else if (a.state === 'perch' || a.state === 'burrow') a.pose = arrived(a) ? 'sit' : 'walk';
  else if (a.state === 'sniff' || a.state === 'forage') a.pose = 'sniff';
  else if (speed > 2.2) a.pose = 'run';
  else if (speed > 0.15) a.pose = 'walk';
  else a.pose = 'stand';
}

// ---- the step ----------------------------------------------------------------------------------------
export function stepPetLife(agents, view, dt) {
  if (!Array.isArray(agents) || !agents.length || dt <= 0) return;
  const clamped = Math.min(dt, 0.1);   // a long frame must not teleport an animal across the room
  for (const a of agents) {
    stepDrives(a, clamped);
    a.t += clamped;

    // 1. Reflexes and forced transitions, before any scoring.
    const rx = reflex(a);
    if (rx && a.state !== rx) enter(a, rx, view, agents);
    if (a.wetUntil > 0) a.wetUntil = Math.max(0, a.wetUntil - clamped);

    // A fidget, on its own clock. Scoring cannot produce one: a scratch is not something an animal
    // WANTS more than napping, it is something it does while it is already settled, and given a
    // score high enough to win it would displace the behaviours it is supposed to punctuate.
    a.fidgetIn = (a.fidgetIn === undefined ? 6 + a.rng.f() * 10 : a.fidgetIn) - clamped;
    if (a.fidgetIn <= 0) {
      const settled = !a.target && (a.state === 'wander' || a.state === 'watch' || a.state === 'pose' || a.state === 'perch');
      if (settled) enter(a, 'scratch', view, agents);
      a.fidgetIn = 9 + a.rng.f() * 14;
    }

    // 2. Re-decide, but only when the commitment has expired or the behaviour has run its course.
    const done = a.t >= (a.holdFor || 2);
    if ((done || a.t > COMMIT_SECONDS) && a.state !== 'shake' && a.state !== 'stretch') {
      // The stickiness margin is what it takes to displace the INCUMBENT — it must not be charged
      // again between candidates. Folding it into the running comparison (the first draft did) means
      // the second-best option shields the best one: a "Zoomie expert" measured over a full shift
      // never zoomed once, because `play` was evaluated first and `zoomies`, though the higher urge,
      // could not clear play's score plus the margin.
      const incumbent = scoreBehaviour(a.state, a, view, agents);
      let bestName = null, best = -Infinity;
      for (const name of PET_BEHAVIOURS) {
        if (name === a.state) continue;
        const s = scoreBehaviour(name, a, view, agents);
        if (s > best) { best = s; bestName = name; }
      }
      if (bestName && best > incumbent + (done ? 0 : MIN_SWITCH_GAIN)) {
        if (a.state === 'nap' || a.state === 'burrow') { a.justWoke = true; a.napCooldown = NAP_COOLDOWN; }
        enter(a, bestName, view, agents);
      } else if (done) {
        enter(a, a.state, view, agents);   // same behaviour, fresh target: keep wandering, keep napping
      }
    }

    // 3. Behaviour-specific target upkeep, then move.
    const sp = speciesOf(a.species);
    let speed = 0;
    if (a.state === 'follow' || a.state === 'return') {
      const owner = view.ownerOf ? view.ownerOf(a) : null;
      if (owner) {
        const slack = a.state === 'return' ? 0.5 : 1.0;
        const d = Math.hypot(owner.x - a.x, owner.z - a.z);
        a.target = d > slack ? { x: owner.x, z: owner.z } : null;
        speed = d > 2.2 ? sp.dash * 0.7 : sp.amble * 1.25;
      } else { a.target = null; }
    } else if (a.state === 'zoomies') {
      speed = sp.dash;
      if (arrived(a)) {
        a.lapsLeft = (a.lapsLeft | 0) - 1;
        if (a.lapsLeft > 0) {
          const c = view.openSpace, ang = a.rng.f() * Math.PI * 2, r = c.r * (0.55 + a.rng.f() * 0.35);
          a.target = { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
        } else { a.target = null; a.holdFor = 0; }
      }
    } else if (a.state === 'greet') {
      const other = agents.find(o => o.id === a.greetId);
      if (other) { a.target = { x: other.x, z: other.z }; a.lookAt = { x: other.x, z: other.z }; }
      speed = sp.amble * 1.15;
    } else {
      speed = arrived(a) ? 0 : sp.amble;
    }

    const moved = steer(a, view, agents, speed, clamped);
    paintHints(a, moved);
  }
}

// ---- wiring helpers ---------------------------------------------------------------------------------
// A visitor is clipped to the leash on the way in and unclipped once its guest has settled, which is
// what turns the café into the playground the owner asked for. Exposed as functions rather than left
// to the bridge so the rule lives with the behaviour it governs.
export function unclip(a) { if (a.kind === 'visitor') { a.leashed = false; a.holdFor = 0; } }
export function clip(a) { if (a.kind === 'visitor') { a.leashed = true; a.ownerLeaving = false; a.holdFor = 0; } }
export function callHome(a) { if (a.kind === 'visitor') { a.ownerLeaving = true; a.holdFor = 0; } }
export function soak(a, seconds = 2.5) { a.wetUntil = seconds; }
