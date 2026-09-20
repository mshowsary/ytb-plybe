export const MECHANIC_LEARNING_VERSION = 1;
export const REFRESH_AFTER_FAILURES = 2;
export const COACH_PULSE_AFTER = 3;
export const COACH_ROUTE_AFTER = 7;

export const MECHANIC_IDS = Object.freeze([
  'move', 'build', 'pickup', 'serve', 'cash',
  'return', 'kiosk', 'hire', 'pantry',
  'refillCoffee', 'refillBowl', 'blend', 'harvest',
  // Guidance (2026-09-17): the first time a routine errand of a kind is offered, the floor trail
  // walks the player through it once; from then on it only appears after real hesitation. These
  // two are the errand kinds with no other proof of their own.
  'clean', 'deliver',
  // 'staffDemoRunner'/'staffDemoCashier' were Task 33's one-time staff demo (a purple ring under a
  // worker for 2.5 s, fired by the worker's own state and connected to nothing the player did).
  // Batch F replaced it with First Look's per-role lesson below, so the ids have no writer and no
  // reader any more and are dropped rather than left in a whitelist nothing fills.
]);
const KNOWN = new Set(MECHANIC_IDS);

// ---- First Look (docs/SHIP-PLAN-2026-09-19.md §1.8) ---------------------------------------------
// One quiet demo per new thing, shown once ever, so the ids the player has already been shown have
// to survive the save. They are a CLOSED whitelist for exactly the reason the proven set above is:
// this payload crosses the host boundary, so an id this build does not recognise is dropped on the
// way in rather than stored and replayed at some later version.
export const FIRST_LOOK_IDS = Object.freeze([
  // the café's own chain, in the order a player meets it
  'build', 'clean', 'upgrades', 'hire',
  // the first worker of each role, followed to its lane
  'roleRunner', 'roleCashier', 'roleCleaner', 'roleBarista', 'rolePhotographer',
  // each purchase's own new verb
  'coffee', 'pantry', 'bowl', 'harvest', 'blend',
  'garden', 'icestand', 'photo', 'pose',
]);
const FIRST_LOOK_KNOWN = new Set(FIRST_LOOK_IDS);

/**
 * Bounded show-once payload. Restore is untrusted input: only known lesson ids survive, duplicates
 * collapse and the list is sorted, so a hand-edited save can at most silence a tutorial it has
 * already seen — it can never unlock content or replay one.
 */
export function normalizeFirstLook(raw) {
  const out = new Set();
  const list = Array.isArray(raw) ? raw : (isRecord(raw) && Array.isArray(raw.looks) ? raw.looks : null);
  if (list) {
    for (const id of list.slice(0, FIRST_LOOK_IDS.length * 2)) if (FIRST_LOOK_KNOWN.has(id)) out.add(id);
  }
  return [...out].sort();
}

// Task 0.8 half credit. These live here, beside the canonical payload, because the save boundary
// (sim/save.js -> normalizeMechanicLearning) and the coach must agree on exactly one bound.
export const REFILL_LESSON_KEYS = Object.freeze(['refillCoffee', 'refillBowl']);
/** Refills of any supply after which every refill lesson counts as proven. */
export const REFILLS_TO_MASTER = 2;
const SACK_MARKS = new Set(REFILL_LESSON_KEYS.map(key => `${key}:sack`));

function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

function addEvidence(proven, evidence) {
  const step = Math.max(0, evidence?.intro?.step | 0);
  if (step >= 1) proven.add('move');
  if (step >= 2) proven.add('build');
  if (step >= 3) proven.add('pickup');
  if (step >= 4) proven.add('serve');
  if (step >= 5) proven.add('cash');
  if ((evidence?.stats?.served | 0) > 0) { proven.add('pickup'); proven.add('serve'); }
  if (Object.values(evidence?.staff || {}).some(n => (n | 0) > 0)) proven.add('hire');
  if (Object.values(evidence?.upgrades || evidence?.up || {}).some(n => Number(n) > 0)) proven.add('kiosk');
}

/**
 * Bounded half-credit payload. Restore is untrusted input, so only the two known `<key>:sack` marks
 * survive (de-duplicated, sorted) and the tally is clamped to an integer in 0..REFILLS_TO_MASTER.
 * Nothing here can unlock content: it only decides whether a tutorial hand is shown again.
 */
export function normalizeRefillProgress(raw) {
  const sack = new Set();
  if (isRecord(raw) && Array.isArray(raw.sack)) {
    for (const entry of raw.sack.slice(0, REFILL_LESSON_KEYS.length * 2)) {
      if (typeof entry === 'string' && SACK_MARKS.has(entry)) sack.add(entry);
    }
  }
  const tally = isRecord(raw) ? Math.trunc(Number(raw.refills)) : NaN;
  return {
    sack: [...sack].sort(),
    refills: Number.isFinite(tally) ? Math.max(0, Math.min(REFILLS_TO_MASTER, tally)) : 0,
  };
}

/** Canonical Task-29 payload: only demonstrated, known mechanic IDs survive. */
export function normalizeMechanicLearning(raw, evidence = null) {
  const proven = new Set();
  const versioned = isRecord(raw) && raw.v === MECHANIC_LEARNING_VERSION;
  if (versioned) {
    if (Array.isArray(raw.proven)) {
      for (const key of raw.proven.slice(0, MECHANIC_IDS.length * 2)) if (KNOWN.has(key)) proven.add(key);
    } else if (isRecord(raw.proven)) {
      for (const [key, value] of Object.entries(raw.proven)) if (value === true && KNOWN.has(key)) proven.add(key);
    }
  }
  addEvidence(proven, evidence);
  const out = { v: MECHANIC_LEARNING_VERSION, proven: [...proven].sort() };
  // Task 0.8: half credit rides inside this same canonical payload, so it survives a real host
  // save/load round trip and not merely an in-memory snapshot. Both fields are omitted while empty,
  // so a save that never touched a refill lesson still serializes exactly as it did before.
  const half = normalizeRefillProgress(versioned ? raw : null);
  if (half.sack.length) out.sack = half.sack;
  if (half.refills > 0) out.refills = half.refills;
  // Batch F: which First Look lessons the player has already been shown, bounded the same way and
  // omitted while empty, so a save from before this batch serializes exactly as it did before.
  const looks = normalizeFirstLook(versioned ? raw : null);
  if (looks.length) out.looks = looks;
  return out;
}

export function mechanicIsKnown(key) { return KNOWN.has(key); }

/** Task 30 exact staged escalation. Reduced motion keeps the cue static rather than animated. */
export function coachEscalationStage(elapsed, reducedMotion = false) {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (t < COACH_PULSE_AFTER) return 'natural';
  if (reducedMotion) return 'static';
  if (t < COACH_ROUTE_AFTER) return 'pulse';
  return 'route';
}

export function selectCoachPriority({ urgent = false, stock = false, construction = false, contextual = false } = {}) {
  if (urgent) return 'urgent';
  if (stock) return 'stock';
  if (construction) return 'construction';
  if (contextual) return 'contextual';
  return null;
}

function d2(a, b) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }

/**
 * Stable contextual action recognition. This mirrors the station priorities using station types and
 * player position; visible English text is deliberately irrelevant, so localization cannot change
 * mechanic recognition or persistence.
 */
export function stableContextAction(G) {
  if (!G?.P || !G?.world?.stations) return null;
  let best = null;
  const offer = (st, id, radius, priority) => {
    if (!st.active || !st.front || d2(G.P, st.front) >= radius * radius) return;
    const d = d2(G.P, st.front);
    if (!best || priority > best.priority || (priority === best.priority && d < best.d)) best = { id, priority, d, stationId: st.id };
  };
  // The staff desk is the only station that still raises a button (docs/SHIP-PLAN-2026-09-19.md
  // §1.4): the RETURN crate and the upgrade kiosk are deleted, and the pantry hands its sack over
  // by being stood at. Their IDs stay in MECHANIC_IDS above so an old save's proven set still
  // normalizes, but nothing in the world offers them any more.
  for (const st of G.world.stations.values()) {
    if (st.type === 'hire') offer(st, 'hire', 1.35, 2);
  }
  return best ? best.id : null;
}
