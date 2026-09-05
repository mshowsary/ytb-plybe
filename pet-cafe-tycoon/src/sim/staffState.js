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
