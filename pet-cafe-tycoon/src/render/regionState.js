// src/render/regionState.js — which regions the RENDER side has been told are built.
//
// game.js tells exactly one render module when a region opens: environment.setRegionBuilt (via
// syncRegions, at load and on every 'built' event). Two others draw things that sit in a region's
// gate gap — the fence string lights (ambience.js) and their after-dark glow (daylight.js) — and
// neither has a path to the world. Rather than a new call from game.js, environment.js records the
// state here and they read it. Keyed by the area object, which main.js hands to all three, so two
// games (or two test fixtures) never see each other's gates.
const states = new WeakMap();

function stateFor(area) {
  let s = states.get(area);
  if (!s) { s = { built: new Set(), version: 0 }; states.set(area, s); }
  return s;
}

export function setRegionBuiltState(area, id, built) {
  if (!area || typeof area !== 'object') return;
  const s = stateFor(area);
  if (s.built.has(id) === !!built) return;
  if (built) s.built.add(id); else s.built.delete(id);
  s.version++;
}

// { built: Set<regionId>, version } — version bumps on every change, so a per-frame reader only
// rebuilds what it draws when something actually moved.
export function regionBuiltState(area) {
  return area && typeof area === 'object' ? stateFor(area) : { built: new Set(), version: 0 };
}
