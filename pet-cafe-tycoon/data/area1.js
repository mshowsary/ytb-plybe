// Area 1 — Café. Meters, origin at floor centre; +x east, +z toward the camera.
export const AREA1 = {
  id: 'a1', size: { w: 20, d: 14 },
  door: { x: -9.6, z: 4.2 }, exit: { x: -9.6, z: 4.2 }, spawnStart: { x: -11.5, z: 4.2 },
  // The Ice cream garden's own guest entrance (docs/SHIP-PLAN-2026-09-19.md §1.2): a garden arch in
  // the deck's WEST edge. Garden guests arrive along the street, come in here, and leave the same
  // way, so no guest ever needs the café-to-deck gate — that gate is the owner's and the staff's.
  // The opening itself is the terrace region's `streetDoor` below (sim/nav.js cuts it).
  terraceDoor: { x: -9.6, z: 12.6 }, terraceSpawn: { x: -11.5, z: 12.6 }, terraceSpawnOut: { x: -11.5, z: 12.6 },
  // Batch 1 — the regions engine (plan 7.1). A region is a second physical space outside the
  // interior rectangle, inert (its cells stay blocked, its stations stay inactive) until
  // `builtBy` is in world.built. Interior `size` above is UNCHANGED so every existing coordinate
  // still holds; the terrace sits south of the fence, z 7.4-14 (the 7.0-7.4 sliver is the fence's
  // own thickness plus the gate — see src/sim/nav.js's fence-row handling).
  //
  // The engine is data-driven for more than one region and either fence axis: a region off the
  // EAST fence keys its gate gap on |z| (`gateZ`) instead of |x| (`gateX`), and src/sim/nav.js's
  // regionEdge() derives which it is from the rectangle itself (test/nav-regions.test.js pins that
  // with a synthetic east region). The Pet Spa that used it was retired on 2026-09-19; saves that
  // built it are refunded by src/sim/save.js RETIRED_ZONES.
  // `streetDoor` opens the region's west edge onto the street margin at z 11.6-13.6 (half-width 1.0
  // about terraceDoor.z), with the same entry/exit lanes the café door has.
  regions: [
    { id: 'terrace', x0: -10, x1: 10, z0: 7.4, z1: 14, builtBy: 'z_terrace', floor: 'deck' , gateX: 0, gateHalfW: 2.4, streetDoor: { z: 12.6, halfW: 1.0 } },
  ],
  stations: [
    { id: 'oven1',    type: 'oven',    x: 6.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cookie',  buffer: 12 },
    { id: 'oven2',    type: 'oven',    x: 3.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cupcake', buffer: 12, builtBy: 'z_oven2' },
    { id: 'coffee1',  type: 'coffee',  x: 0.5,  z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },
    { id: 'pantry1',  type: 'pantry',  x: -2.2, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },

    // THE SMOOTHIE CORNER (docs/SHIP-PLAN-2026-09-19.md §1.4). The blender used to stand in the
    // production row at (-5.5, -5.2) while its fruit grew at x 8.6 and its counter stood at x 8.6:
    // bush front -> blender front was 15.4 m and blender -> counter 14.4 m, so the 19-day
    // playthrough measured harvest+blend at 100-130 s of a 240 s day, nearly all of it walking.
    // It moves in beside its own lane. Measured on the built café: bush1 1.20 m, barSmoothie
    // 2.25 m (test/smoothie-corner.test.js pins both).
    //
    // x 7.8 and not 8.6 (in line with the bushes and the counter) because barSmoothie's queue runs
    // north along x 8.6 from z -0.6 to 2.8: a blender centred on that line would have guests
    // standing inside it. 7.8 keeps its east face 0.2 m clear of the queue and its front spot
    // (7.8, 1.4) out of the lane entirely. z 0.1 leaves a 1.0 m corridor to the counter behind it.
    { id: 'blender1', type: 'blender', x: 7.8,  z: 0.1,  rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_blender' },

    { id: 'dispCookie',  type: 'display', product: 'cookie',   x: 2.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8 },
    { id: 'dispCupcake', type: 'display', product: 'cupcake',  x: 5.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_oven2' },
    { id: 'barCoffee',   type: 'display', product: 'coffee',   x: -1.0, z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_coffee' },
    { id: 'barSmoothie', type: 'display', product: 'smoothie', x: 8.6,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_blender' },

    // The 0.9 m slot between the two tills (0.8 m once their drawn tops count) is narrower than the
    // 0.92 m body: the owner serves from BEHIND them (world.js st.serve) and reaches that aisle round
    // either end, never between them. Moving register1 to open the slot re-times the untouchable
    // test/nav-fullhouse.test.js into a door overlap, so the slot stays and Batch C's owner-grid trail
    // (docs/SHIP-PLAN-2026-09-19.md §1.4) is what must stop pointing through it.
    { id: 'register1', type: 'checkout', x: -5.5, z: -2.0, rot: 0, fw: 1.6, fd: 0.9 },
    { id: 'register2', type: 'checkout', x: -8.0, z: -2.0, rot: 0, fw: 1.6, fd: 0.9, builtBy: 'z_register2', queueRight: 0.5 },

    // One starter plant arrives with the blender so the smoothie loop works immediately. The two
    // remaining plants are a later throughput/beauty expansion, not a resource with no destination.
    { id: 'bowl1', type: 'bowl', x: 6.8, z: 2.5, rot: -Math.PI / 2, fw: 0.8, fd: 0.8, builtBy: 'z_bowl' },
    { id: 'bush1', type: 'bush', x: 8.6, z: 3.6, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_blender' },
    { id: 'bush2', type: 'bush', x: 8.6, z: 4.7, rot: -Math.PI / 2, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },
    { id: 'bush3', type: 'bush', x: 7.2, z: 5.9, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },

    // The z 6.0 table row. The gate apron (|x| <= 2.9, z 4.0-8.5) stays clear of every footprint
    // (docs/SHIP-PLAN-2026-09-19.md §1.2): the lounge used to put seat4/seat5 straight across it,
    // which left two 0.5 m corridors into a 4.8 m gate and stopped the owner walking at its centre.
    // The west three tables close up to x <= -3.85 so seat3 clears the apron too (seat1 stays east
    // of the corner plant at (-9.2, 6.2), which tools/prop-overlap-smoke.js watches), and the lounge
    // now adds two tables (seat3, seat6); the deck's four tables are the garden's own.
    // THE FIRST THREE SECONDS (Batch E1, ship plan §1.6: "the first 3 seconds show the café
    // working"). seat1 and seat2 have NO builtBy: they are the café's own two tables, standing
    // before the player arrives, with a guest and its pet already at each of them at t = 0
    // (src/game.js seedOpeningGuests). The room used to open with zero tables and zero coins, so
    // the first thing a new player saw was an empty shop. The table COUNT is unchanged — four
    // inside, exactly as §2b measured — the two purchased ones just moved one zone later: z_seats1
    // now buys seat3 and z_seats2 buys seat6.
    { id: 'seat1', type: 'seat', x: -7.8,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4 },
    { id: 'seat2', type: 'seat', x: -5.85, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4 },
    { id: 'seat3', type: 'seat', x: -3.85, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    { id: 'seat6', type: 'seat', x: 4.5,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },

    // The staff desk is the only thing left in the café that opens a sheet by standing at it. The
    // upgrade kiosk that stood at (9.0, -3.5) is gone (docs/SHIP-PLAN-2026-09-19.md §1.4): the Shop
    // it opened is reached from the Café card and from this desk (G.openShop), and its 1.35 m
    // button radius overlapped oven1's standing spot, so an UPGRADE pill popped up while baking.
    { id: 'hire1',  type: 'hire',  x: -8.6, z: 1.0, rot: Math.PI / 2, fw: 1.0, fd: 1.6, builtBy: 'z_hire' },

    // The photo wall (docs/SHIP-PLAN-2026-09-19.md §1.3): the corkboard the album fills in, hung on
    // the WEST wall between the staff desk (z 1.0) and the door (z 4.2), facing east into the room.
    // Type 'wall' is mounted, not standing: like 'gate' it contributes no collision box anywhere
    // (sim/nav.js, sim/ownerReach.js, world.js's w.boxes), so it has no floor footprint and cannot
    // narrow the door corridor, and it has no working spot to stand at either. It replaced photo1,
    // the booth that trapped the owner in the deck's west corner and sat on the garden's exit;
    // photos now happen at the tables (sim/petPose.js).
    //
    // z 1.1, the desk end of that stretch of wall, is the only part of it the board can have: the
    // door gap runs z 3.0-5.4 (render/props.js buildStatic) and the two buyable hanging plants
    // (data/decor.js d_plant_hang_a/c) own the wall at z 0.0 and z 2.2, leaving exactly z 0.89-1.31
    // clear of both by the 0.9 m the décor layout test requires.
    { id: 'photoWall1', type: 'wall', x: -9.74, z: 1.1, rot: Math.PI / 2, fw: 1.6, fd: 0.3, builtBy: 'z_photo' },

    // The Ice cream garden (docs/SHIP-PLAN-2026-09-19.md §1.2). One room: the owner's gate in the
    // north fence, the fountain in the middle, the stand on the east, the guests' arch in the west
    // edge, and the tables along the fence facing the camera. Every station is inert until bought.
    { id: 'gate1',      type: 'gate',     x: 0.0,  z: 7.0,  rot: 0,            fw: 4.8, fd: 0.4, builtBy: 'z_terrace' },
    // front 1.6 (default 1.3 is inside fountain1's own nav-expanded half-extent of 1.45 — a 2.4x2.4
    // decor circle's default front point is never outside its own footprint's safety margin).
    { id: 'fountain1',  type: 'decor',    x: 0.0,  z: 10.6, rot: 0,            fw: 2.4, fd: 2.4, front: 1.6, builtBy: 'z_terrace' },
    // The self-serve stand. The counter faces west, so garden guests queue along z 12.4 straight
    // from their arch, and they pay into its cash jar themselves (`selfServe`: sim/customers.js
    // payAtStand) — no terrace register. The owner and the staff work it from BEHIND, like a real
    // stand: front -1.25 puts its stocking spot on the east side, and the machine stands directly
    // behind it facing the same spot, so machine -> counter is one step (fronts 0.15 m apart) in a
    // 1.5 m aisle the 0.92 m owner fits with room to spare. The machine needs no supply.
    { id: 'barIce',     type: 'display',  product: 'icecream', x: 6.2, z: 12.4, rot: -Math.PI / 2, fw: 2.4, fd: 1.0, front: -1.25, capacity: 8, selfServe: true, builtBy: 'z_terrace' },
    { id: 'icecream1',  type: 'icecream', x: 8.8,  z: 12.4, rot: -Math.PI / 2, fw: 1.6, fd: 1.2, front: 1.2, builtBy: 'z_terrace' },
    // Four tables in a row along the fence, guests seated on the fence side facing the camera: two
    // come with the garden (one either side of the gate) and z_terraceSeats adds the outer pair.
    // Every expanded footprint stays out of the gate apron and off the z 12.4 queue row.
    { id: 'seat7',      type: 'seat',     x: -3.9, z: 9.4,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terrace' },
    { id: 'seat8',      type: 'seat',     x: 3.9,  z: 9.4,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terrace' },
    { id: 'seat9',      type: 'seat',     x: -6.5, z: 9.4,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terraceSeats' },
    { id: 'seat10',     type: 'seat',     x: 6.3,  z: 9.4,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terraceSeats' },
  ],

  // A zone's x/z is its build PAD: where the owner stands to pay. The future station's ghost is drawn
  // where the station will actually appear (systems/zones.js). Every pad sits >= 1.6 m from every
  // station's working spot (front, till, cash) — past every action-button radius — so a purchase
  // never instantly fills the owner's hands or raises an unrelated prompt: z_coffee's pad sat 0.3 m
  // from the coffee machine (four coffees loaded within ten seconds of buying it), z_hire's on the
  // desk's own front (docs/SHIP-PLAN-2026-09-19.md §1.4; test/zone-spacing.test.js).
  //
  // The plot a pad draws on the floor is normally the shape of the station it builds. A zone may
  // author `pad` instead when that station has no floor footprint to stand in: z_photo hangs a
  // 0.3 m-deep board on the wall, and a 0.3 m plot is narrower than the 0.55 s stand-still the
  // build needs. Only systems/zones.js (and test/zone-spacing.test.js, which checks the same
  // ground) read it.
  zones: [
    { id: 'z_seats1',    x: -6.75, z: 4.3,  price: 90,   adds: ['seat3'],                                 label: 'Tables' },
    { id: 'z_oven2',     x: 5.0,   z: -3.2, price: 220,  adds: ['oven2', 'dispCupcake'],                 requires: 'z_seats1', label: 'Cupcake oven' },
    // Task 25 supported candidate: after Cupcakes, staffing and checkout capacity become parallel
    // choices. The Desk advances the productive room chain; the second register is a useful but
    // genuinely optional throughput branch rather than a hidden prerequisite for automation.
    { id: 'z_register2', x: -8.5,  z: 2.1,  price: 340,  adds: ['register2'],                            requires: 'z_oven2', label: 'Second register' },
    { id: 'z_hire',      x: -6.5,  z: 2.6,  price: 300,  adds: ['hire1'],                                requires: 'z_oven2', label: 'Staff desk' },
    { id: 'z_coffee',    x: 2.0,   z: -3.2, price: 700,  adds: ['coffee1', 'barCoffee', 'pantry1'],       requires: 'z_hire',   label: 'Coffee bar' },
    { id: 'z_bowl',      x: 3.8,   z: 2.5,  price: 900,  adds: ['bowl1'],                                 requires: 'z_coffee', label: 'Pet treat bar' },
    // The pad moved east with the blender (see blender1 above): it used to sit at (-3.2, -2.3), a
    // room away from all three things it builds, so the plot said nothing about where the smoothie
    // bar would be. It now stands in the corner itself, still >= 1.6 m from every working spot.
    { id: 'z_blender',   x: 6.3,   z: 0.5,  price: 1150, adds: ['blender1', 'barSmoothie', 'bush1'],      requires: 'z_bowl',   label: 'Smoothie bar' },
    { id: 'z_garden',    x: 5.5,   z: 4.3,  price: 1400, adds: ['bush2', 'bush3'],                        requires: 'z_blender',label: 'Fruit garden' },
    { id: 'z_seats2',    x: -3.0,  z: 4.8,  price: 1750, adds: ['seat6'],                                 requires: 'z_garden', label: 'Pet lounge' },

    // Two parallel goals after the lounge (docs/SHIP-PLAN-2026-09-19.md §1.1): the cheaper Pet
    // camera and the Ice cream garden. The player picks which one to save for.
    //
    // The camera is the photo purchase now. It used to be a booth on the deck behind the garden
    // (3000, requires z_terrace), which meant photos — the thing the whole collection is made of —
    // could not be reached until 5200 coins of deck had been paid for first. Its plot is at the
    // wall it hangs on, inside the café; z_splash (retired) hung off it, which src/sim/save.js's
    // RETIRED_ZONES chain still resolves because z_photo itself is still sold.
    { id: 'z_photo',        x: -7.2, z: 3.6,  price: 2400, adds: ['photoWall1'], pad: { w: 1.6, d: 1.6 },                         requires: 'z_seats2', label: 'Pet camera' },

    // The garden chain. z_terrace's own plot sits in the INTERIOR (the region does not exist yet, so
    // its cells are still blocked), in front of the gate it opens; z_terraceSeats sits on the deck.
    //
    // TASK 1.6c history: the terrace chain's prices were re-tuned against tools/bot.js (the chain
    // once unlocked on day 25). 2026-09-19 (docs/SHIP-PLAN-2026-09-19.md §1.1): the ice cream lane
    // folded into z_terrace (5200 = the old 3600 deck + most of the old 3600 lane), the terrace
    // register, restroom and splash pool were retired (refunded by src/sim/save.js RETIRED_ZONES),
    // and the garden now follows the pet lounge instead of the smoothie bar.
    { id: 'z_terrace',      x: 0.75, z: 5.0,  price: 5200, adds: ['gate1', 'fountain1', 'icecream1', 'barIce', 'seat7', 'seat8'], requires: 'z_seats2', label: 'Ice cream garden' },
    { id: 'z_terraceSeats', x: 2.6,  z: 11.2, price: 3000, adds: ['seat9', 'seat10'],                                            requires: 'z_terrace', label: 'Garden tables' },
  ],
};

function rotateOffset(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}

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
  // Cashier/collection point stays immediately beside the till instead of 1.2m left of the
  // customer queue. It is still outside the register collision shell, so touch collection remains
  // easy in a crowd, but visually reads as part of the register rather than a separate floor zone.
  const off = rotateOffset(rot, -0.78, -0.30);
  return { x: st.front.x + off.x, z: st.front.z + off.z };
}
