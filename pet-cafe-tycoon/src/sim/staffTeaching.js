// Task 33: observe the first employee doing a REAL chore; never invent work or steer the worker.
export const STAFF_DEMO_SECONDS = 2.5;
export const STAFF_DEMO_MECHANICS = Object.freeze({
  runner: 'staffDemoRunner',
  cashier: 'staffDemoCashier',
});

export function hasStaffDemo(proven) {
  const has = key => proven instanceof Set ? proven.has(key) : Array.isArray(proven) ? proven.includes(key) : !!proven?.[key];
  return Object.values(STAFF_DEMO_MECHANICS).some(has);
}

function queueLength(world, checkoutId) {
  const q = world?._regQueues?.get(checkoutId);
  return q ? q.length : 0;
}

/**
 * Returns only an already-existing actionable employee chore.
 * Runner: carrying real items toward a real active display.
 * Cashier: assigned to a real active checkout with a real customer queue.
 * Cleaner is intentionally excluded: the blueprint asks the first-hire teaching beat to show
 * delivery or checkout work, not manufacture a cleaning job just to have something to point at.
 */
export function nextStaffDemoJob(staffList, world, proven = new Set()) {
  if (!world?.stations || hasStaffDemo(proven)) return null;
  for (const worker of staffList || []) {
    if (!worker) continue;
    if (worker.kind === 'runner' && worker.state === 'toCounter' && (worker.items?.length || 0) > 0) {
      const target = world.stations.get(worker.target);
      if (target?.active && target.type === 'display' && target.front) {
        return {
          role: 'runner', mechanic: STAFF_DEMO_MECHANICS.runner,
          worker, targetId: target.id, targetPoint: { x: target.front.x, z: target.front.z },
        };
      }
    }
    if (worker.kind === 'cashier' && worker.target && queueLength(world, worker.target) > 0) {
      const target = world.stations.get(worker.target);
      if (target?.active && target.type === 'checkout') {
        const p = target.cash || target.front || target;
        return {
          role: 'cashier', mechanic: STAFF_DEMO_MECHANICS.cashier,
          worker, targetId: target.id, targetPoint: { x: p.x, z: p.z },
        };
      }
    }
  }
  return null;
}
