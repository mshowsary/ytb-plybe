export const MECHANIC_LEARNING_VERSION = 1;
export const REFRESH_AFTER_FAILURES = 2;
export const COACH_PULSE_AFTER = 3;
export const COACH_ROUTE_AFTER = 7;

export const MECHANIC_IDS = Object.freeze([
  'move', 'build', 'pickup', 'serve', 'cash',
  'return', 'kiosk', 'hire', 'pantry',
  'refillCoffee', 'refillBowl', 'blend', 'harvest',
  // Task 33 keeps the demonstrated role inside the same compact stable-ID payload. The first one
  // proven suppresses all future first-hire demonstrations; no UI text or employee name is saved.
  'staffDemoRunner', 'staffDemoCashier',
]);
const KNOWN = new Set(MECHANIC_IDS);

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
function heldAnything(G) {
  return !!((G?.owner?.items?.length || 0) || G?.carry?.sack || (G?.carry?.fruit | 0) > 0);
}

/**
 * Stable contextual action recognition. This mirrors the station priorities using station types and
 * player position; visible English text is deliberately irrelevant, so localization cannot change
 * mechanic recognition or persistence.
 */
export function stableContextAction(G) {
  if (!G?.P || !G?.world?.stations) return null;
  let best = null;
  const held = heldAnything(G);
  const offer = (st, id, radius, priority) => {
    if (!st.active || !st.front || d2(G.P, st.front) >= radius * radius) return;
    const d = d2(G.P, st.front);
    if (!best || priority > best.priority || (priority === best.priority && d < best.d)) best = { id, priority, d, stationId: st.id };
  };
  for (const st of G.world.stations.values()) {
    if (st.type === 'return' && held) offer(st, 'return', 1.05, 6);
    else if (st.type === 'pantry') offer(st, 'pantry', 1.35, 3);
    else if (st.type === 'kiosk') offer(st, 'kiosk', 1.35, 2);
    else if (st.type === 'hire') offer(st, 'hire', 1.35, 2);
  }
  return best ? best.id : null;
}
