// src/systems/goldenPaw.js — the Golden Paw ceremony (plan §3.4).
//
// WHAT THIS IS
// The one-time payoff for reaching ★5 on the Paw Rating. At the CLOSING phase of the day the fifth
// star is held, the string lights pulse, gold confetti goes up over the rug, the café's residents
// and regulars gather on the medallion, a gold paw plaque mounts on the north wall, and the day
// summary carries the award. It happens ONCE, ever.
//
// IT MUST NOT REPLAY ON RELOAD, AND THAT IS THE WHOLE DESIGN CONSTRAINT.
// `meta.goldenPaw` is the record, exactly as `petKeepsake` records the first-Bestie memory and
// `meta.residents` records a move-in. Those two set the precedent this file follows:
//   * systems/petFriendship.js awards the keepsake inside the pay-event pass, then its refresh()
//     -- called by main.js AFTER G.restore -- puts the already-earned memory straight at its
//     settled wall home with no reveal animation.
//   * systems/residentPets.js mounts a resident already listed in the save instantly (mountSettled)
//     and only animates a walk-in for a key it has not seen before.
// So: sim/pawRating.js's markGoldenPaw(meta) flips the flag and returns true only on the
// transition; refresh() re-mounts the PLAQUE with `animate: false`; and the ceremony itself is
// gated on that same flag, so a reload finds a café that has always had a gold paw on the wall and
// no ceremony left to run.
//
// WHY IT READS THE RATING RATHER THAN WAITING TO BE TOLD
// pawRatingState().best is max(meta.pawBest, live), so this fires correctly whether or not anything
// else in the build has wired applyPawRatchet into settleShift yet. It is also why the ceremony can
// happen during CLOSING at all: the ratchet is written at settlement, which is after the closing
// phase has already ended, so a ceremony that waited for the persisted number would always be a
// day late. The full rating is only computed while the flag is unset and the phase is closing, and
// then at most once a second (see RATING_POLL_SECONDS).
//
// REDUCED MOTION
// Honoured the way the rest of the project honours it (systems/residentPets.js, systems/zones.js,
// ui/interactionCoach.js): no confetti, no light pulse, no walk-in, no mount animation, no hop --
// the pets are simply already sitting on the rug and the plaque is simply already on the wall. The
// award still happens and is still recorded; only the movement is dropped.
//
// TIMING
// The DOM/CSS side goes through core/presentationScheduler.js rather than setTimeout, because a
// YouTube Playables host pause must not age a callback: the scheduler holds every timer and CSS
// animation for the length of the pause and re-arms them on resume, so a ceremony interrupted by
// an ad does not finish invisibly behind the overlay. The 3D side is stepped from update(dt), the
// same as every other scene animation, and that loop does not run while paused at all.
import { createPet } from '../render/pets.js';
import { PET_FRIENDSHIP_TIERS, PET_PROFILES, PET_SPECIES, parsePetKey, petKey } from '../sim/petBook.js';
import { PAW_MAX_STAR, applyPawRatchet, markGoldenPaw, pawRatingState } from '../sim/pawRating.js';
import { addFollowers, followersForGoldenPaw } from '../sim/followers.js';
import { presentationScheduler } from '../core/presentationScheduler.js';
import { equipAccessory } from '../../data/accessories.js';
import { AREA1 } from '../../data/area1.js';

// The rug and its woven paw medallion are authored in render/ambience.js at (0.3, 2.45). The
// gathering is centred on the medallion, so the two numbers have to agree; they are duplicated
// rather than exported because ambience.js builds geometry from them and has no reason to publish
// a point.
export const GOLDEN_PAW_RUG = Object.freeze({ x: 0.3, z: 2.45 });
export const GOLDEN_PAW_RING_RADIUS = 1.45;

// "Regular" is sim/petBook.js's second friendship tier. Read from the tier table so a retuned
// threshold moves the guest list with it instead of leaving a second literal here.
export const GOLDEN_PAW_REGULAR_VISITS = PET_FRIENDSHIP_TIERS[1].minVisits;

// A cap, not a design statement: 20 authored pets on a 5.8 x 3.6 rug is a heap, and every guest is
// a fresh createPet() rig. Twelve fills the ring and still reads as individuals.
export const GOLDEN_PAW_MAX_GUESTS = 12;

export const GOLDEN_PAW_WALK_SECONDS = 2.4;
export const GOLDEN_PAW_CEREMONY_SECONDS = 10;
// How often the (cheap, but not free) rating is recomputed while waiting. Only ever polled during
// the closing phase of a café that has not had its ceremony.
export const RATING_POLL_SECONDS = 1;

const STYLE_ID = 'pet-cafe-golden-paw-style';

// ---- pure helpers (no DOM, no THREE) -----------------------------------------------------------

/**
 * Who gathers. Residents first -- they LIVE here, so they are what the room is about -- then every
 * pet at Regular or better that is not already a resident, in sim/petBook.js's own canonical
 * species-then-variant order (the same order residentPets.js backfills in, so this file introduces
 * no second convention). Capped, deduped, and safe on a null/legacy meta.
 */
export function goldenPawRoster(meta, limit = GOLDEN_PAW_MAX_GUESTS) {
  const cap = Math.max(0, limit | 0);
  const out = [], seen = new Set();
  const push = key => {
    if (out.length >= cap || seen.has(key) || !parsePetKey(key)) return;
    seen.add(key); out.push(key);
  };
  if (!meta || typeof meta !== 'object') return out;
  if (Array.isArray(meta.residents)) for (const key of meta.residents) push(key);
  const friendship = meta.petFriendship;
  if (friendship && typeof friendship === 'object') {
    for (const species of PET_SPECIES) {
      for (let variant = 0; variant < PET_PROFILES[species].length; variant++) {
        const key = petKey(species, variant);
        if ((friendship[key] | 0) >= GOLDEN_PAW_REGULAR_VISITS) push(key);
      }
    }
  }
  return out;
}

/**
 * Where guest `index` of `count` stands, and which way it faces. A ring around the medallion,
 * started at the SOUTH edge and walked clockwise so the first guest -- on most saves the only one --
 * lands in the readable front of the rug rather than behind the emblem. Facing is render/pets.js's
 * convention (rotation.y = atan2(dx, dz)), pointed inward at the medallion.
 */
export function goldenPawGatherPose(index, count, center = GOLDEN_PAW_RUG, radius = GOLDEN_PAW_RING_RADIUS) {
  const n = Math.max(1, count | 0);
  // A single guest sits on the emblem itself and faces the camera; a ring of one is just a pet
  // standing awkwardly off-centre.
  if (n === 1) return { x: center.x, z: center.z, ry: Math.PI };
  // Past eight the ring is widened rather than packed tighter -- the rug is 5.8 x 3.6, so 1.7 m
  // still lands every guest on the weave.
  const r = radius * (n > 8 ? 1.18 : 1);
  const a = Math.PI + (index / n) * Math.PI * 2;
  const x = center.x + Math.sin(a) * r;
  const z = center.z + Math.cos(a) * r;
  return { x, z, ry: Math.atan2(center.x - x, center.z - z) };
}

/** Where a guest walks in FROM: straight out along its own radius, clamped inside the room. */
export function goldenPawEntryPose(pose, center = GOLDEN_PAW_RUG) {
  const dx = pose.x - center.x, dz = pose.z - center.z;
  const len = Math.hypot(dx, dz);
  // A fixed 4.2 m approach regardless of ring size, so every guest walks for the same beat. Pets
  // are decorative here and do not path -- residentPets.js's move-in walks a straight line too.
  const ux = len > 1e-4 ? dx / len : 0, uz = len > 1e-4 ? dz / len : 1;
  return {
    x: Math.max(-8.6, Math.min(8.6, center.x + ux * 4.2)),
    z: Math.max(-1.2, Math.min(6.4, center.z + uz * 4.2)),
  };
}

/** The rating as the ceremony reads it. Always passes the LIVE area, never the AREA1 default. */
export function goldenPawRating(G) {
  return pawRatingState({
    meta: G && G.meta,
    stats: G && G.stats,
    built: G && G.world && G.world.built,
    area: (G && G.world && G.world.area) || AREA1,
  });
}

/** ★5 held, ceremony never run, and the day is closing. The whole trigger, in one predicate. */
export function goldenPawCeremonyReady(G) {
  if (!G || !G.meta || typeof G.meta !== 'object') return false;
  if (G.meta.goldenPaw === true) return false;
  if (!G.dayState || G.dayState.phase !== 'closing') return false;
  return goldenPawRating(G).best >= PAW_MAX_STAR;
}

function prefersReducedMotion(G) {
  if (G && G.settings && G.settings.reducedMotion) return true;
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

// ---- the day-summary award ---------------------------------------------------------------------

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Sits between ui/meta.js's .meta-rating and .meta-reward rows and borrows their metrics, so the
  // summary card keeps one visual rhythm instead of gaining a foreign block.
  style.textContent = `
    .golden-paw-award{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:9px 13px;border-radius:16px;background:linear-gradient(115deg,#FFF3D0,#FFE1A0 62%,#F7C963);border:1px solid #fff;box-shadow:0 4px 16px #b8891f2e,inset 0 0 0 1px #fff9}
    .golden-paw-award .gp-copy{display:flex;flex-direction:column;gap:1px;min-width:0}
    .golden-paw-award .gp-kicker{color:#8a6516;font:950 8px/1 system-ui,sans-serif;letter-spacing:.09em}
    .golden-paw-award .gp-stars{color:#B8891F;font-size:14px;line-height:1;letter-spacing:.06em}
    .golden-paw-award .gp-paw{font-size:23px;line-height:1;filter:drop-shadow(0 2px 3px #b8891f42)}
    @media(max-width:380px){.golden-paw-award{padding:7px 11px}.golden-paw-award .gp-paw{font-size:20px}.golden-paw-award .gp-stars{font-size:12px}}
    @media(max-width:240px){.golden-paw-award .gp-kicker{display:none}}
  `;
  document.head.appendChild(style);
}

// ui/meta.js's decorateSummary polls for the same card because sheets.js builds it a frame or two
// after openDaySummary() returns. Same retry, through presentationScheduler so a host pause during
// the summary does not burn the attempts behind the overlay.
function attachSummaryAward(tries = 0) {
  if (typeof document === 'undefined') return;
  const card = document.querySelector('.sheet-root .card');
  if (!card) {
    if (tries < 24) presentationScheduler.schedule(() => attachSummaryAward(tries + 1), 25);
    return;
  }
  if (card.querySelector('.golden-paw-award')) return;
  ensureStyle();
  const award = document.createElement('div');
  award.className = 'golden-paw-award';
  award.setAttribute('aria-label', 'Golden Paw awarded, five paw rating');
  const copy = document.createElement('div'); copy.className = 'gp-copy';
  const kicker = document.createElement('div'); kicker.className = 'gp-kicker'; kicker.textContent = 'GOLDEN PAW';
  const stars = document.createElement('div'); stars.className = 'gp-stars'; stars.textContent = '★'.repeat(PAW_MAX_STAR);
  copy.append(kicker, stars);
  const paw = document.createElement('div'); paw.className = 'gp-paw'; paw.textContent = '🐾';
  award.append(copy, paw);
  // Below the service rating / reputation rows ui/meta.js owns, above its rewarded-ad offer: the
  // award is the headline of this summary, but the claim button must stay the last thing thumbed.
  const before = card.querySelector('.meta-reward');
  if (before) before.before(award);
  else {
    const anchor = card.querySelector('.meta-rep-summary') || card.querySelector('.meta-rating') || card.querySelector('.cbody');
    if (anchor) anchor.after(award); else card.appendChild(award);
  }
}

// ---- the ceremony ---------------------------------------------------------------------------------

/**
 * `S` is the render/scene.js bundle (needs .scene). `G` is the live game object -- read fresh every
 * time, never cached, because G.restore() replaces G.meta wholesale (the rule systems/
 * residentPets.js documents at its own header).
 *
 * `deps`:
 *   ambience  render/ambience.js's handle: setGoldenPaw(on, { animate }) and celebrate(seconds).
 *   fx        render/fx.js's handle, for burst(). Optional.
 *   residents systems/residentPets.js's handle. OPTIONAL, and the ONLY thing it is asked for is
 *             setCeremonyHidden(bool): the ceremony draws its own copy of every guest on the rug,
 *             so a resident already asleep on its cat tree has to be hidden for the length of the
 *             award or the same cat is visibly in two places. Without the hook the ceremony still
 *             runs in full -- residents simply stay on their furniture as well as on the rug.
 */
export function createGoldenPawCeremony(S, G, deps = {}) {
  const scene = S && S.scene ? S.scene : null;
  const ambience = deps.ambience || null;
  const fx = deps.fx || null;
  const residents = deps.residents || null;

  let phase = 'idle';       // idle -> running -> done
  let elapsed = 0, poll = 0;
  let reducedMotion = false;
  let awardDay = 0;         // the day the ceremony fired; 0 once its summary has been decorated
  const cast = [];          // { pet, from, to, arrived }
  const timers = [];

  function hideResidents(hidden) {
    if (residents && typeof residents.setCeremonyHidden === 'function') residents.setCeremonyHidden(hidden);
  }

  function clearTimers() {
    for (const id of timers) presentationScheduler.cancel(id);
    timers.length = 0;
  }

  function spawnCast() {
    if (!scene) return;
    const keys = goldenPawRoster(G.meta);
    for (let i = 0; i < keys.length; i++) {
      const parsed = parsePetKey(keys[i]);
      if (!parsed) continue;
      const pet = createPet(parsed.species, parsed.variant);
      pet.setBaseScale(1); // §5.4: a resident is exactly the size of a guest's pet, never bigger
      // A resident that owns a bow wears it on the rug too, exactly as systems/residentPets.js
      // mounts it on the furniture -- the gathered copy is the same pet, not a generic stand-in.
      equipAccessory(pet, G.meta && G.meta.equipped && G.meta.equipped[keys[i]]);
      const to = goldenPawGatherPose(i, keys.length);
      const from = reducedMotion ? { x: to.x, z: to.z } : goldenPawEntryPose(to);
      pet.group.position.set(from.x, 0, from.z);
      pet.group.rotation.y = to.ry;
      // Desynchronise blink/breathe/stretch from the pet's own index, not Math.random, so a
      // screenshot of the ceremony is reproducible across reloads and devices.
      pet.setLifePhase((i * 2.713) % 8.5);
      if (reducedMotion) pet.sit();
      scene.add(pet.group);
      cast.push({ pet, from, to, arrived: !!reducedMotion });
    }
  }

  function despawnCast() {
    if (scene) for (const guest of cast) scene.remove(guest.pet.group);
    cast.length = 0;
    hideResidents(false);
  }

  function confetti() {
    if (!fx || typeof fx.burst !== 'function') return;
    // Three staged pops over the medallion rather than one wall of particles: fx.js caps at 300
    // live particles, and a single 60-particle burst spends a budget every other system shares.
    const shots = [
      [GOLDEN_PAW_RUG.x, 1.5, GOLDEN_PAW_RUG.z, 0],
      [GOLDEN_PAW_RUG.x - 1.5, 1.2, GOLDEN_PAW_RUG.z + 0.6, 260],
      [GOLDEN_PAW_RUG.x + 1.5, 1.2, GOLDEN_PAW_RUG.z - 0.6, 520],
    ];
    for (const [x, y, z, delay] of shots) {
      if (!delay) { fx.burst(x, y, z, '#FFD24A', 20); continue; }
      timers.push(presentationScheduler.schedule(() => fx.burst(x, y, z, '#FFD24A', 18), delay));
    }
  }

  function begin() {
    const meta = G.meta;
    // markGoldenPaw is the one-shot latch: true ONLY on the transition, so everything below --
    // including the follower award sim/pawRating.js names this caller for -- happens exactly once,
    // ever, and a second call on a restored save falls straight through to `done`.
    if (!markGoldenPaw(meta)) { phase = 'done'; return; }
    reducedMotion = prefersReducedMotion(G);
    meta.followers = addFollowers(meta.followers, followersForGoldenPaw());
    // Raise the ratchet alongside the flag so nothing reading the rating later in this session sees
    // goldenPaw:true next to pawBest 0. Both are scalar writes on meta, which is what a snapshot's
    // one-level spread copies safely (a nested object would have to be REPLACED, not mutated).
    // Whether pawBest reaches the SAVE is game.js's business: its snapshot meta literal is explicit
    // and does not carry pawBest yet, which is harmless here -- `goldenPaw` is the field that has to
    // survive a reload, and it does.
    applyPawRatchet({ meta, stats: G.stats, built: G.world && G.world.built, area: (G.world && G.world.area) || AREA1 });

    hideResidents(true);
    spawnCast();
    ambience && ambience.setGoldenPaw && ambience.setGoldenPaw(true, { animate: !reducedMotion });
    if (!reducedMotion) {
      ambience && ambience.celebrate && ambience.celebrate(GOLDEN_PAW_CEREMONY_SECONDS);
      confetti();
    }
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('chime');

    phase = 'running';
    elapsed = 0;
    awardDay = ((G.dayState && G.dayState.day) | 0) || 1;
    // Award + follower gain are durable save state written outside settlement, so checkpoint them
    // the way systems/petFriendship.js checkpoints a keepsake: mark, and let the game serialize at
    // its own post-update boundary rather than snapshotting half a frame.
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('golden-paw');
  }

  function stepGuest(guest, dt) {
    const pet = guest.pet;
    if (guest.arrived) {
      // Settled guests never walk, so `moving` is false: no gait, no footfall, no dust.
      pet.update(dt, false);
      pet.idleLife(dt, { lookYaw: null, reducedMotion });
      return;
    }
    const u = Math.min(1, elapsed / GOLDEN_PAW_WALK_SECONDS);
    // Ease-out so the gathering settles instead of stopping dead on the beat.
    const e = 1 - Math.pow(1 - u, 2);
    const x = guest.from.x + (guest.to.x - guest.from.x) * e;
    const z = guest.from.z + (guest.to.z - guest.from.z) * e;
    const dx = x - pet.group.position.x, dz = z - pet.group.position.z;
    pet.group.position.set(x, pet.group.position.y, z);
    if (Math.hypot(dx, dz) > 1e-4) pet.group.rotation.y = Math.atan2(dx, dz);
    pet.update(dt, true);
    if (u >= 1) {
      guest.arrived = true;
      pet.group.rotation.y = guest.to.ry;
      pet.sit();
      pet.pop();
    }
  }

  function update(dt) {
    const step = Math.min(0.12, Math.max(0, Number(dt) || 0));
    if (phase === 'idle') {
      // Cheap gates first; the rating itself is only computed on the poll tick.
      if (!G.meta || G.meta.goldenPaw === true || !G.dayState || G.dayState.phase !== 'closing') { poll = 0; return; }
      poll -= step;
      if (poll > 0) return;
      poll = RATING_POLL_SECONDS;
      if (goldenPawCeremonyReady(G)) begin();
      return;
    }

    if (phase === 'running') {
      elapsed += step;
      for (const guest of cast) stepGuest(guest, step);
      if (elapsed >= GOLDEN_PAW_CEREMONY_SECONDS) { despawnCast(); clearTimers(); phase = 'done'; }
    }

    // The summary opens on the dayEnd event, a moment after the ceremony. Waiting for _ended keeps
    // the award out of any OTHER sheet the player may have open mid-shift.
    if (awardDay && G.dayState && G.dayState._ended && G.dayState.day === awardDay) {
      awardDay = 0;
      attachSummaryAward();
    }
  }

  // main.js calls this after G.restore, exactly as it calls petFriendship.refresh(): an award that
  // is already in the save is a plaque that has always been on the wall. No animation, no confetti,
  // no gathering, and `phase` is retired so update() can never re-fire it.
  function refresh() {
    const mounted = !!(G.meta && G.meta.goldenPaw === true);
    ambience && ambience.setGoldenPaw && ambience.setGoldenPaw(mounted, { animate: false });
    if (mounted && phase === 'idle') phase = 'done';
  }

  return {
    update,
    refresh,
    get phase() { return phase; },
    get guestCount() { return cast.length; },
    destroy() { clearTimers(); despawnCast(); },
  };
}
