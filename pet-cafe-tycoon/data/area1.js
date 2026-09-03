// data/area1.js — area 1 "Café". Meters, origin at floor center. +x east, +z south (toward the camera).
// M3 T3: new layout (20x14), production row (ovens/coffee/storage/blender) along the north wall,
// counters/registers mid-floor, seating/garden/bowl/hire/kiosk/gate around the open south half.
// M3 T3 fix round 2 (controller ruling): the original two-seat-row layout (z 2.5 / z 5.0) pinched
// the exit corridor every 'leave' customer walks through (door at z 4.2) down to ~0.6m — under
// the two-movers-never-overlap floor (2 * 0.30m radius) by construction, not an avoidance bug.
// Replaced with a SINGLE seat row at z 6.0 (chairs rotated pi so pair.human lands at z ~4.95,
// clear of the corridor), moved the garden/bowl/kiosk stations to open floor east of the
// counters, and cut queue depth to 5 slots (was 6) so the deepest queue slot (z 2.8) also stays
// out of the corridor. See test/layout.test.js's corridor test for the enforced invariant.
//
// Loop v2 Task 1 (2026-09-03): the three shared 'counter' stations (any product) are replaced by
// four DEDICATED 'display' stations, one per product — a full cookie shelf can no longer block a
// cupcake customer. 'storage1' is renamed 'pantry1' (type 'pantry', same spot, same behaviour —
// the player picks a sack from a popup instead of it being handed out automatically). A new
// 'return' station (a crate) next to the pantry takes back any carried stack for zero coins. The
// kiosk exists from the start (no zone, no proximity auto-open — see systems/stations.js); the
// gate/terrace zone is removed entirely (area 2 is a later milestone, per the design doc's
// "what is removed" list) along with its two extra counter zones (z_counter2/z_counter3/z_kiosk) —
// the zone chain is now exactly the nine zones the design's unlock-chain table calls for.
export const AREA1 = {
  id: 'a1', size: { w: 20, d: 14 },
  door: { x: -9.6, z: 4.2 }, exit: { x: -9.6, z: 4.2 }, spawnStart: { x: -11.5, z: 4.2 },
  stations: [
    // production row (north wall, z = -5.2)
    { id: 'oven1',    type: 'oven',    x: 6.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cookie',  buffer: 12 },
    { id: 'oven2',    type: 'oven',    x: 3.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cupcake', buffer: 12, builtBy: 'z_oven2' },
    { id: 'coffee1',  type: 'coffee',  x: 0.5,  z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },
    { id: 'pantry1',  type: 'pantry',  x: -2.5, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' }, // appears with the coffee machine (playtest fix: no sacks before they are useful)
    // return crate: always active (no builtBy, zero coins so the player is never stuck), between
    // the pantry and the blender on the same production row.
    { id: 'return1',  type: 'return',  x: -4.0, z: -5.2, rot: 0, fw: 1.0, fd: 1.0 },
    { id: 'blender1', type: 'blender', x: -5.0, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_blender' },
    // displays (mid floor, z = -2.0) — one product each, same footprint/queue geometry the shared
    // counters used to have. Queue depth is 5 slots (world.js), last slot at z = -2.0 + 1.4 +
    // 4*0.85 = 2.8 — clear of the z 3.0-4.6 exit corridor by construction (unchanged from the old
    // counter row).
    { id: 'dispCookie',  type: 'display', product: 'cookie',   x: 2.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8 },
    { id: 'dispCupcake', type: 'display', product: 'cupcake',  x: 5.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_oven2' },
    { id: 'barCoffee',   type: 'display', product: 'coffee',   x: -1.0, z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_coffee' },
    { id: 'barSmoothie', type: 'display', product: 'smoothie', x: 8.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_blender' },
    { id: 'register1', type: 'checkout', x: -5.5, z: -2.0, rot: 0, fw: 1.6, fd: 0.9 },
    // queueRight 0.5: still needed — register2 shares its queue's x column (-8.0, nudged to -7.5)
    // with hire1's rotated (fw/fd-swapped) footprint (x -9.4..-7.55, z 0.25..1.75); at right=0 the
    // 5-slot queue (z -0.6..2.8) still runs straight through that z band at x=-8.0, inside it.
    { id: 'register2', type: 'checkout', x: -8.0, z: -2.0, rot: 0, fw: 1.6, fd: 0.9, builtBy: 'z_register2', queueRight: 0.5 },
    // pet treat bowl and garden bushes (east side, open floor, south of the exit corridor)
    { id: 'bowl1', type: 'bowl', x: 6.8, z: 2.5, rot: -Math.PI / 2, fw: 0.8, fd: 0.8, builtBy: 'z_bowl' },
    // z 3.6 (not 3.2): barSmoothie (new in Loop v2 Task 1, x=8.0) reuses the display queue
    // geometry (5 slots, deepest at its own z + 4.8) — at barSmoothie's z=-2.0 that lands the
    // deepest slot at (8, 2.8), which used to fall inside bush1's blocked-cell margin (0.45m
    // half-footprint + 0.25m nav margin = 0.7m; the old z=3.2 was only 0.4m away in z and 0.6m in
    // x, both under that 0.7m floor) — found by test/layout.test.js's queue-slot-free-cell check.
    // 3.6 puts 0.8m of clearance in z, comfortably outside the corridor test's x range too.
    { id: 'bush1', type: 'bush', x: 8.6, z: 3.6, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },
    { id: 'bush2', type: 'bush', x: 8.6, z: 4.7, rot: -Math.PI / 2, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },
    { id: 'bush3', type: 'bush', x: 7.2, z: 5.9, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },
    // seating — a SINGLE row at z 6.0 (was two rows at z 2.5/5.0, which pinched the exit
    // corridor — see the file header). rot pi puts the chairs on the north side of the table so
    // pair.human (world.js: st.z - SEAT_FORWARD with rot pi) lands at z ~4.95, still clear of the
    // z 3.0-4.6 corridor and outside the table's own blocked footprint (z <= 5.05).
    { id: 'seat1', type: 'seat', x: -8.0, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    { id: 'seat2', type: 'seat', x: -5.5, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    { id: 'seat3', type: 'seat', x: -3.0, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat4', type: 'seat', x: -0.5, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat5', type: 'seat', x: 2.0,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat6', type: 'seat', x: 4.5,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    // hire desk, kiosk — the kiosk exists from the start (no zone, per the Loop v2 design's
    // "panels open by intent" rule: a floating HUD button opens it, not proximity).
    { id: 'hire1',  type: 'hire',  x: -8.6, z: 1.0, rot: Math.PI / 2, fw: 1.0, fd: 1.6, builtBy: 'z_hire' },
    // rot -pi/2 (front faces -x, onto open floor) — the seat-row move frees up the south wall, so
    // the kiosk no longer needs the old rot-pi workaround (its default front, at x 7.7, is well
    // inside the floor and the owner's reach; see the fix-round-2 report for the prior rot-pi
    // deviation this replaces).
    { id: 'kiosk1', type: 'kiosk', x: 9.0, z: -3.5, rot: -Math.PI / 2, fw: 1.0, fd: 1.6 },
  ],
  zones: [
    // Loop v2 Task 1: the nine-zone chain from the design doc's unlock table — z_counter2/
    // z_counter3/z_kiosk (the old extra-shared-counter and kiosk zones) are gone; the kiosk is
    // free and the display capacity is a flat 8 for every product (star levels come in Task 3).
    // Loop v2 Task 3: prices tuned UP within the task's own +40% bound of the design's guideline
    // chain (65/120/180/240/360/450/600/700/800) — the bot's first tuning pass cleared all nine
    // zones plus both required stars by day 5 against a 10-12 day target, so the whole chain (and
    // the star costs, which are 2x/4x of a zone's OWN price) needed to cost more to slow it down.
    { id: 'z_seats1',    x: -6.75, z: 4.3,  price: 90,   adds: ['seat1', 'seat2'],                       label: 'Tables' },
    { id: 'z_oven2',     x: 3.5,  z: -3.6,  price: 165,  adds: ['oven2', 'dispCupcake'],                 requires: 'z_seats1',    label: 'Oven' },
    { id: 'z_register2', x: -8.0, z: -0.6,  price: 250,  adds: ['register2'],                            requires: 'z_oven2',     label: 'Register' },
    { id: 'z_hire',      x: -7.2, z: 1.0,   price: 335,  adds: ['hire1'],                                requires: 'z_register2', label: 'Hire desk' },
    { id: 'z_coffee',    x: 0.5,  z: -3.6,  price: 500,  adds: ['coffee1', 'barCoffee', 'pantry1'],       requires: 'z_hire',      label: 'Coffee' },
    { id: 'z_garden',    x: 6.0,  z: 4.2,   price: 630,  adds: ['bush1', 'bush2', 'bush3'],               requires: 'z_coffee',    label: 'Garden' },
    { id: 'z_seats2',    x: 0.8,  z: 4.3,   price: 840,  adds: ['seat3', 'seat4', 'seat5', 'seat6'],      requires: 'z_garden',    label: 'More tables' },
    { id: 'z_bowl',      x: 5.3,  z: 2.5,   price: 980,  adds: ['bowl1'],                                 requires: 'z_seats2',    label: 'Treat bowl' },
    // x -3.5 (not -5.0, directly under blender1): straight south from -5.0 at z > -1.55 runs
    // through register1's footprint (x -6.3..-4.7) — the owner's push-out-only movement (no
    // pathfinding) can't route around that and gets stuck oscillating at the boundary forever
    // (found by tools/bot.js). -3.5 sits in the open gap between register1 and counter3 instead.
    { id: 'z_blender',   x: -3.5, z: -3.6,  price: 1120, adds: ['blender1', 'barSmoothie'],               requires: 'z_bowl',      label: 'Blender' },
  ],
};
function rotateOffset(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}
// Legacy helpers, kept for compatibility. Operate on a world station (has st.front, st.rot).
export function queueSlots(st, n = 5) {
  const rot = st.rot || 0;
  return Array.from({ length: n }, (_, i) => {
    const d = rotateOffset(rot, 0, 0.9 * i);
    return { x: st.front.x + d.x, z: st.front.z + d.z };
  });
}
export function checkoutSpot(st) { return { x: st.front.x, z: st.front.z }; }
export function cashSpot(st) {
  const rot = st.rot || 0;
  const left = rotateOffset(rot, -1.2, 0);
  return { x: st.front.x + left.x, z: st.front.z + left.z };
}
