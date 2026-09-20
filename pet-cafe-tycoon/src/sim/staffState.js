// Durable staff work choices. Task 11 intentionally persists only explicit player choices,
// not worker position/state/items/navigation: those are transient and rebuilt on resume.
export const STAFF_STATE_VERSION = 1;

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

function activeDisplayIds(area, builtSet) {
  const ids = new Set();
  if (!area || !Array.isArray(area.stations)) return ids;
  for (const def of area.stations) {
    if (!def || def.type !== 'display' || typeof def.id !== 'string') continue;
    if (def.builtBy && !(builtSet && builtSet.has(def.builtBy))) continue;
    ids.add(def.id);
  }
  return ids;
}

function runnerCount(staff) {
  const n = staff && Number.isFinite(staff.runner) ? Math.trunc(staff.runner) : 0;
  return Math.max(0, n);
}

export function normalizeStaffState(raw, area, builtSet = new Set(), staff = {}) {
  const count = runnerCount(staff);
  const allowed = activeDisplayIds(area, builtSet);
  if (raw == null) {
    return {
      ok: true,
      legacy: true,
      data: { v: STAFF_STATE_VERSION, runnerAssignments: Array(count).fill(null) },
    };
  }
  if (!isRecord(raw)) return { ok: false, reason: 'shape' };
  if (raw.v !== STAFF_STATE_VERSION) return { ok: false, reason: 'version' };
  if (!Array.isArray(raw.runnerAssignments)) return { ok: false, reason: 'runnerAssignments' };
  if (raw.runnerAssignments.length > 32) return { ok: false, reason: 'runnerAssignments' };

  const runnerAssignments = [];
  for (let i = 0; i < count; i++) {
    const id = raw.runnerAssignments[i];
    // Corrupt/retired/inactive assignments lose only the assignment. Never fabricate a different
    // station or reject otherwise legitimate player progress because a display changed versions.
    runnerAssignments.push(typeof id === 'string' && allowed.has(id) ? id : null);
  }
  return { ok: true, legacy: false, data: { v: STAFF_STATE_VERSION, runnerAssignments } };
}

// The Photographer is hired at the staff desk (hire1) and shoots posing pets, so it can only exist
// once the Pet camera (z_photo) is owned — no camera, nothing to photograph. Unlike a runner —
// which idles harmlessly at spawn once its assigned display disappears (see normalizeStaffState/
// activeDisplayIds above, which drops only the assignment and never fabricates a replacement) — a
// photographer without the camera has no work at all. systems/staff.js's prepare() calls this every
// tick (not just once on load) to gate spawning a photographer actor on it, so a save whose
// staff.photographer count outruns its own builds (a hand-edited save, or a downgrade path) never
// materialises a worker with nothing to do; the moment the camera is bought, the very next
// prepare() tick spawns it at the desk.
export function photographerSpawnAllowed(builtSet) {
  if (!builtSet) return false;
  if (typeof builtSet.has === 'function') return builtSet.has('z_photo');
  if (Array.isArray(builtSet)) return builtSet.includes('z_photo');
  return !!builtSet.z_photo;
}

export function snapshotStaffState(staffList, world, fallback = null) {
  const allowed = new Set();
  if (world && Array.isArray(world.displays)) {
    for (const id of world.displays) {
      const st = world.stations && world.stations.get(id);
      if (st && st.active) allowed.add(id);
    }
  }
  const liveRunners = (staffList || []).filter(s => s && s.kind === 'runner');
  const source = liveRunners.length
    ? liveRunners.map(s => s.assign || null)
    : (fallback && Array.isArray(fallback.runnerAssignments) ? fallback.runnerAssignments : []);
  const runnerAssignments = source.map(id => typeof id === 'string' && allowed.has(id) ? id : null);
  return { v: STAFF_STATE_VERSION, runnerAssignments };
}
