// Pure routing helper for the two-step supply refill lesson.
// The operational job detector can still say "refill"; presentation points the player to the
// Pantry first unless they already hold the correct supply for an empty station.
export function refillGuideTarget(world, G = null) {
  if (!world || !world.stations) return null;
  let coffee = null, bowl = null, pantry = null;
  for (const st of world.stations.values()) {
    if (!st || !st.active) continue;
    if (!pantry && st.type === 'pantry') pantry = st;
    else if (!coffee && st.type === 'coffee' && (st.beans | 0) <= 0) coffee = st;
    else if (!bowl && st.type === 'bowl' && (st.stock | 0) <= 0) bowl = st;
  }
  if (!coffee && !bowl) return null;

  const sack = G && G.carry && G.carry.sack;
  if (sack === 'beans' && coffee) return { x: coffee.x, z: coffee.z, kind: 'refill', stationId: coffee.id };
  if (sack === 'kibble' && bowl) return { x: bowl.x, z: bowl.z, kind: 'refill', stationId: bowl.id };
  if (pantry) return { x: pantry.x, z: pantry.z, kind: 'supplies', stationId: pantry.id };

  const st = coffee || bowl;
  return { x: st.x, z: st.z, kind: 'refill', stationId: st.id };
}
