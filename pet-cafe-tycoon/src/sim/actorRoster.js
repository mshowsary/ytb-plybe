// Freeze membership for one avoidance step; mover positions still advance normally.
export function beginActorStep(world, ...groups) {
  const unique = new Set();
  for (const group of groups) for (const actor of group || []) {
    if (!actor || actor.done || actor.active === false) continue;
    const mover = actor.mover;
    if (mover) unique.add(mover);
  }
  world._movers = Object.freeze([...unique]);
  world._actorRosterActive = true;
  return world._movers;
}
export function endActorStep(world) {
  world._actorRosterActive = false;
  world._custRanFlag = false;
  world._movers = [];
}
