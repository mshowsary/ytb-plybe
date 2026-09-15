// Pure routing helper for the two-step supply refill lesson.
// The operational job detector can still say "refill"; presentation points the player at the place
// the supply comes from first, and only then at the machine that needs it.
//
// It used to know two supplies. The ice cream machine's cream and the bath's water were left out,
// so the moment either ran dry the arrow pointed at the dry machine and the player stood there with
// empty hands and no idea where cream is kept. Every supply now routes through src/sim/supplies.js,
// which is the one place that knows machine -> supply -> where you fetch it.
import { SUPPLY_OF, isStarved, supplyKind, acceptsSupply, supplySource } from './supplies.js';

export function refillGuideTarget(world, G = null, from = null) {
  if (!world || !world.stations) return null;
  const ref = from || (G && G.P) || null;

  // Already holding something? Then the lesson is halfway done: point at the machine it belongs in.
  const carry = G && G.carry;
  const held = carry && (carry.sack || ((carry.fruit | 0) > 0 ? 'fruit' : null));
  if (held) {
    let best = null, bestD = Infinity;
    for (const st of world.stations.values()) {
      if (!acceptsSupply(st, held)) continue;
      // A machine that has run dry outranks one that is merely not full.
      const d = (ref ? (st.x - ref.x) ** 2 + (st.z - ref.z) ** 2 : 0) - (isStarved(st) ? 1e6 : 0);
      if (d < bestD) { bestD = d; best = st; }
    }
    if (best) return { x: best.x, z: best.z, kind: 'refill', stationId: best.id, supply: held };
  }

  // Otherwise find the emptiest lane and send them to where that supply is kept. The blender is
  // excluded: its fruit comes off the bushes, and the 'harvest' job already owns that errand.
  let starved = null, bestD = Infinity;
  for (const st of world.stations.values()) {
    if (!isStarved(st) || st.type === 'blender' || !SUPPLY_OF[st.type]) continue;
    const d = ref ? (st.x - ref.x) ** 2 + (st.z - ref.z) ** 2 : 0;
    if (d < bestD) { bestD = d; starved = st; }
  }
  if (!starved) return null;

  const supply = supplyKind(starved);
  const source = supplySource(world, supply, ref);
  if (source) {
    return { x: source.x, z: source.z, kind: 'supplies', stationId: source.id, supply };
  }
  return { x: starved.x, z: starved.z, kind: 'refill', stationId: starved.id, supply };
}
