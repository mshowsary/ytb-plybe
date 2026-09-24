// src/sim/petPose.js — photos of pets at their tables (docs/SHIP-PLAN-2026-09-19.md §1.3).
//
// This replaces the Pet Photo Studio booth. The booth was a station in the deck's west corner with
// a queue of its own: 40% of guests who had already paid walked across the map to stand in it, the
// owner had to be parked at it for anything to happen at all, and buying it sealed the owner into a
// pocket he could not walk out of (playthrough.md). A photo is a MOMENT, not an errand, so nobody
// queues for it any more: while the Pet camera is owned, one seated pet at a time strikes a pose
// where it already is, a camera bubble pops over it, and whoever walks up — the owner or the hired
// Photographer — takes the shot. A pose nobody takes simply ends when the guest leaves. No
// detour, no queue, no penalty.
//
// Sim purity, exactly as the booth had it: this file never reads meta. `photographed` and `tierFor`
// are injected by src/systems/photo.js (which owns the Pet Visitor Book lookups); tools/bot.js and
// the tests may omit both and still drive a complete, correctly-scored shot at tier 0.
import { emitWorld } from './events.js';

// The mini-game's timing/scoring constants live in the sim (not in ui/photoGame.js) so the headless
// bot and the deterministic test suite can drive the exact same numbers as the real render layer
// without importing anything DOM-shaped. They moved here verbatim from src/sim/world.js when the
// booth station was deleted — the ring, the bands and the tip table are unchanged.
export const PHOTO_RING_START = 2.2;      // ring scale at shot start
export const PHOTO_RING_END = 0.6;        // ring scale at the end of its shrink
export const PHOTO_RING_DURATION = 1.4;   // seconds the ring takes to shrink start -> end
// A shot left untouched (player skill is optional, never mandatory) resolves itself 0.2s after the
// ring finishes shrinking — comfortably past PHOTO_RING_DURATION so a real player's last-instant tap
// is never raced by the timeout, and short enough that neither the headless bot nor the in-game
// auto-play bot ever stalls on it.
export const PHOTO_AUTO_RESOLVE = 1.6;
export const PHOTO_PERFECT_BAND = 0.08;
export const PHOTO_GOOD_BAND = 0.22;
// The ring's "home" scale — where the pet actually sits inside the ring.
export const PHOTO_TARGET_SCALE = 1.0;

// Ring scale at elapsed time `t` (seconds since the shot started), clamped past the shrink's own
// duration so a caller that samples slightly late (a dropped frame, a delayed tap handler) still
// gets a sane, in-range answer instead of extrapolating past PHOTO_RING_END.
export function photoRingScale(t) {
  const p = Math.max(0, Math.min(1, (Number(t) || 0) / PHOTO_RING_DURATION));
  return PHOTO_RING_START + (PHOTO_RING_END - PHOTO_RING_START) * p;
}

// Perfect (+-0.08), Good (+-0.22), else Ok — centered on PHOTO_TARGET_SCALE.
export function photoJudgeQuality(scale) {
  const d = Math.abs(scale - PHOTO_TARGET_SCALE);
  if (d <= PHOTO_PERFECT_BAND) return 'perfect';
  if (d <= PHOTO_GOOD_BAND) return 'good';
  return 'ok';
}

export const PHOTO_BASE_TIP = 40;
export const PHOTO_TIP_PER_TIER = 20;
export const PHOTO_QUALITY_MULT = { perfect: 2, good: 1.3, ok: 1 };

// tips = (40 + 20 * friendshipTier) * {perfect:2, good:1.3, ok:1}, rounded to a whole coin like
// every other price computation in this codebase. `tier` is clamped 0-3 (petBook.js's
// PET_FRIENDSHIP_TIERS never exceeds 3) so a corrupt/out-of-range caller can't inflate a tip.
export function photoTipAmount(tier, quality) {
  const t = Math.max(0, Math.min(3, tier | 0));
  const mult = PHOTO_QUALITY_MULT[quality] || 1;
  return Math.round((PHOTO_BASE_TIP + PHOTO_TIP_PER_TIER * t) * mult);
}

// How often a pose happens, and how long one waits. The gap runs only while somebody is actually
// seated, so an empty café does not burn through the schedule and then fire four poses the moment
// the first guest sits. 25 s is a little under the 30 s a guest spends eating (EAT_TIME), so a pose
// the owner ignores ends on its own while its pet is still at the table.
export const POSE_GAP_MIN = 35;
export const POSE_GAP_MAX = 50;
export const POSE_MAX_SECONDS = 25;
// How close counts as "came to take the picture". The same radius the owner was judged by at the
// booth, and sim/staff.js's photographer uses its own literal copy of it (sim/ never imports
// systems/, so there is no shared binding to import — see that file's comment).
export const POSE_SERVE_RADIUS = 1.3;
// The pose holds for a beat after the shot resolves so the presentation layer (ui/photoGame.js) can
// read the resolved session and fly its polaroid before the pose object disappears.
export const POSE_LINGER = 0.8;

function scheduleNextPose(w) {
  w.poseGapT = POSE_GAP_MIN + (w.rng ? w.rng.f() : 0.5) * (POSE_GAP_MAX - POSE_GAP_MIN);
}

export function clearPose(w) {
  if (!w) return;
  w.pose = null;
  scheduleNextPose(w);
}

// A guest who is sitting at a table right now, with a pet the Pet Book can name.
function poseable(c) {
  return !!c && !c.done && c.state === 'eating' && !!c.seat && typeof c.petVariant === 'number';
}

// Advances the one live pose, or starts one. `list` is the same customer array stepCustomers just
// stepped. Call it once per tick, AFTER stepCustomers and BEFORE stepStaff, so the photographer
// reacts to the pose the same frame the guest's seat state produced it.
//
// `unlocked`  the Pet camera is owned (world.built has z_photo)
// `photographed(species, variant)`  true when the album already holds this pet — those are chosen
//             last, so photos fill the collection instead of repeating the same cat
// `tierFor(customer)`  0-3 friendship tier for the tip; omitted means tier 0 throughout
export function stepPetPoses(w, list, dt, { unlocked = false, photographed = null, tierFor = null } = {}) {
  if (!w) return null;
  if (!unlocked) { w.pose = null; w.poseGapT = null; return null; }
  const guests = Array.isArray(list) ? list : [];
  const pose = w.pose || null;

  if (pose) {
    const guest = guests.find(c => c.id === pose.customerId) || null;
    if (pose.session) {
      if (!pose.session.resolved) {
        pose.session.t += dt;
        if (pose.session.t >= PHOTO_AUTO_RESOLVE) resolvePoseShot(w, 'ok');
      } else {
        pose.after += dt;
        if (pose.after >= POSE_LINGER) clearPose(w);
      }
      pose.serving = false;
      return w.pose;
    }
    pose.t += dt;
    // The pose ends with the guest (it got up, or it was never there) or when it has held long
    // enough that a pet frozen in a pose would start to look broken. Neither is a failure: no
    // event, no stat, nothing lost.
    if (!poseable(guest) || pose.t >= POSE_MAX_SECONDS) { clearPose(w); return null; }
    if (pose.serving) {
      const rawTier = typeof tierFor === 'function' ? tierFor(guest) : 0;
      const tier = Math.max(0, Math.min(3, Number.isFinite(rawTier) ? Math.trunc(rawTier) : 0));
      pose.session = {
        customerId: pose.customerId, species: pose.species, variant: pose.variant,
        tier, t: 0, resolved: false, quality: null, tip: 0,
      };
      emitWorld(w, { type: 'photoStart', id: pose.customerId, seatId: pose.seatId });
    }
    pose.serving = false;
    return w.pose;
  }

  // Nobody is posing. The clock only runs while there is somebody who could. Scanned without
  // allocating: this runs every tick of every shift, and the candidate list is only ever built on
  // the one tick in ~1200 where a pose actually starts.
  let anySeated = false;
  for (const c of guests) if (poseable(c)) { anySeated = true; break; }
  if (!anySeated) return null;
  if (w.poseGapT == null) { scheduleNextPose(w); return null; }
  w.poseGapT -= dt;
  if (w.poseGapT > 0) return null;

  // Pets the album has never seen go first, so the collection keeps filling; once every seated pet
  // is already in it, any of them will do.
  const seated = guests.filter(poseable);
  let pool = seated;
  if (typeof photographed === 'function') {
    const fresh = seated.filter(c => !photographed(c.species, typeof c.petVariant === 'number' ? c.petVariant : 0));
    if (fresh.length) pool = fresh;
  }
  const guest = w.rng ? w.rng.pick(pool) : pool[0];
  if (!guest) return null;
  const spot = guest.seat.pair ? guest.seat.pair.pet : guest.seat;
  w.pose = {
    // `id` is the seat's, so ui/photoGame.js can key its ring on the same "which subject is this"
    // string a station id used to give it.
    id: guest.seat.id, seatId: guest.seat.id,
    customerId: guest.id, species: guest.species,
    variant: typeof guest.petVariant === 'number' ? guest.petVariant : 0,
    x: spot.x, z: spot.z,
    t: 0, after: 0, serving: false, session: null,
  };
  scheduleNextPose(w);
  emitWorld(w, { type: 'pose', id: guest.id, seatId: guest.seat.id });
  return w.pose;
}

// Called by the player's tap (ui/photoGame.js, with a real 'perfect'|'good'|'ok' judged from ring
// timing), by the hired Photographer (sim/staff.js, always 'good') or by stepPetPoses's own timeout
// above (always 'ok'). Idempotent past the first call: a tap racing the timeout cannot double-pay.
//
// The tip lands on the pet's OWN TABLE, as a walk-past pile exactly like a register's tray — so the
// shot's reward is a physical thing sitting where the moment happened, not a number that appears in
// the wallet. `w.photoTipMult` is a whole-shift multiplier on photo tips (the retired Golden Shot
// offer set it; nothing does today, and it reads 1 -- see systems/photo.js) (set by
// systems/rewardsSystem.js through systems/photo.js); applying it here means the pile the player
// sees is already the doubled amount.
export function resolvePoseShot(w, quality) {
  const pose = w && w.pose;
  if (!pose || !pose.session || pose.session.resolved) return null;
  const q = quality === 'perfect' || quality === 'good' ? quality : 'ok';
  const mult = Number.isFinite(w.photoTipMult) && w.photoTipMult > 0 ? w.photoTipMult : 1;
  const tip = Math.round(photoTipAmount(pose.session.tier, q) * mult);
  pose.session.resolved = true; pose.session.quality = q; pose.session.tip = tip;
  pose.after = 0;
  const seat = w.stations && w.stations.get(pose.seatId);
  if (seat) seat.pile = (seat.pile || 0) + tip;
  emitWorld(w, { type: 'photo', id: pose.session.customerId, seatId: pose.seatId, quality: q, tip });
  return { quality: q, tip };
}
