// Area 1 — Café. Meters, origin at floor centre; +x east, +z toward the camera.
export const AREA1 = {
  id: 'a1', size: { w: 20, d: 14 },
  door: { x: -9.6, z: 4.2 }, exit: { x: -9.6, z: 4.2 }, spawnStart: { x: -11.5, z: 4.2 },
  // The deck's own street exit. Without it a guest seated on the terrace walks the full width of
  // the café back through the single fence gap, head-on into everyone arriving — measured at 5
  // stalls regardless of how wide that gap is made.
  terraceExit: { x: -9.2, z: 10.6 }, terraceSpawnOut: { x: -9.85, z: 10.6 },
  // Batch 1 — the regions engine (plan 7.1). A region is a second physical space outside the
  // interior rectangle, inert (its cells stay blocked, its stations stay inactive) until
  // `builtBy` is in world.built. Interior `size` above is UNCHANGED so every existing coordinate
  // still holds; the terrace sits south of the fence, z 7.4-14 (the 7.0-7.4 sliver is the fence's
  // own thickness plus the gate — see src/sim/nav.js's fence-row handling).
  //
  // Batch 4b — the spa (plan 3.9). The SECOND region, and the first one that is not south: it
  // hangs off the EAST fence (x = halfW = 10) instead of the south fence row, with its gate gap
  // keyed on |z| rather than |x| (`gateZ` instead of `gateX`). src/sim/nav.js's regionEdge()
  // derives which of the two it is from the rectangle itself, so this row is the entire
  // "engine work" for a second axis. `floor: 'tile'` picks props.js buildRegion's tile floor over
  // the terrace's planks.
  regions: [
    { id: 'terrace', x0: -10, x1: 10, z0: 7.4, z1: 14, builtBy: 'z_terrace', floor: 'deck' , gateX: 0, gateHalfW: 2.4 },
    { id: 'spa',     x0: 10, x1: 17.5, z0: -7, z1: 7,  builtBy: 'z_spa',     floor: 'tile', gateZ: 0, gateHalfW: 2.4 },
  ],
  stations: [
    { id: 'oven1',    type: 'oven',    x: 6.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cookie',  buffer: 12 },
    { id: 'oven2',    type: 'oven',    x: 3.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cupcake', buffer: 12, builtBy: 'z_oven2' },
    { id: 'coffee1',  type: 'coffee',  x: 0.5,  z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },
    { id: 'pantry1',  type: 'pantry',  x: -2.2, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },
    { id: 'return1',  type: 'return',  x: -3.8, z: -5.2, rot: 0, fw: 0.8, fd: 0.9 },
    { id: 'blender1', type: 'blender', x: -5.5, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_blender' },

    { id: 'dispCookie',  type: 'display', product: 'cookie',   x: 2.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8 },
    { id: 'dispCupcake', type: 'display', product: 'cupcake',  x: 5.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_oven2' },
    { id: 'barCoffee',   type: 'display', product: 'coffee',   x: -1.0, z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_coffee' },
    { id: 'barSmoothie', type: 'display', product: 'smoothie', x: 8.6,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_blender' },

    { id: 'register1', type: 'checkout', x: -5.5, z: -2.0, rot: 0, fw: 1.6, fd: 0.9 },
    { id: 'register2', type: 'checkout', x: -8.0, z: -2.0, rot: 0, fw: 1.6, fd: 0.9, builtBy: 'z_register2', queueRight: 0.5 },

    // One starter plant arrives with the blender so the smoothie loop works immediately. The two
    // remaining plants are a later throughput/beauty expansion, not a resource with no destination.
    { id: 'bowl1', type: 'bowl', x: 6.8, z: 2.5, rot: -Math.PI / 2, fw: 0.8, fd: 0.8, builtBy: 'z_bowl' },
    { id: 'bush1', type: 'bush', x: 8.6, z: 3.6, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_blender' },
    { id: 'bush2', type: 'bush', x: 8.6, z: 4.7, rot: -Math.PI / 2, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },
    { id: 'bush3', type: 'bush', x: 7.2, z: 5.9, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },

    { id: 'seat1', type: 'seat', x: -8.0, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    { id: 'seat2', type: 'seat', x: -5.5, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    // The first lounge table faces sideways so its service/cleaning spot does not sit directly on
    // the westbound exit stream. This gives guests right-of-way through the doorway approach while
    // keeping the table in the same visual row and footprint.
    { id: 'seat3', type: 'seat', x: -3.0, z: 6.0, rot: Math.PI / 2, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat4', type: 'seat', x: -0.5, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat5', type: 'seat', x: 2.0,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat6', type: 'seat', x: 4.5,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },

    { id: 'hire1',  type: 'hire',  x: -8.6, z: 1.0, rot: Math.PI / 2, fw: 1.0, fd: 1.6, builtBy: 'z_hire' },
    { id: 'kiosk1', type: 'kiosk', x: 9.0, z: -3.5, rot: -Math.PI / 2, fw: 1.0, fd: 1.6 },

    // Batch 1 — the terrace (plan 3.1/7.1). Every station here has builtBy so it is inert (and
    // does not appear in footprintBoxes/nav in any way that changes days 1-12) until bought.
    { id: 'gate1',      type: 'gate',     x: 0.0,  z: 7.0,  rot: 0,            fw: 4.8, fd: 0.4, builtBy: 'z_terrace' },
    // front 1.6 (default 1.3 is inside fountain1's own nav-expanded half-extent of 1.45 — a 2.4x2.4
    // decor circle's default front point is never outside its own footprint's safety margin).
    { id: 'fountain1',  type: 'decor',    x: 0.0,  z: 10.6, rot: 0,            fw: 2.4, fd: 2.4, front: 1.6, builtBy: 'z_terrace' },
    // Fix round 1: at the plan's literal z:9.2, seat7's own pair.human spot (z 8.15) quantizes
    // (nav.js CELL=0.5) to a cell centre that lands exactly on seat7's OWN nav-expanded footprint
    // edge — the interior seats avoid this by sitting on a friendlier grid alignment (z:6.0); the
    // terrace's grid offset (oz=-7, same origin) doesn't extend that luck to z:9.2. 9.3 clears it.
    { id: 'seat7',      type: 'seat',     x: -6.5, z: 9.3,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terrace' },
    // Fix round 1 (measured by test/layout.test.js): the plan's literal z:9.2 put seat8's own
    // footprint and front inside barIce's (6.2, 8.4), and icecream1's front inside seat8 right
    // back — the ice cream lane and the fountain-side table were drawn overlapping. Only z moves.
    { id: 'seat8',      type: 'seat',     x: 6.5,  z: 10.75, rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terrace' },
    // front 1.2 (default 1.3 lands INSIDE icecream1's own nav-expanded footprint at this rot, and
    // the plan's literal x left less than a nav margin's width between icecream1 and barIce, so no
    // front distance clears both at once until barIce also moves — see barIce's own comment below).
    { id: 'icecream1',  type: 'icecream', x: 8.6,  z: 8.6,  rot: -Math.PI / 2, fw: 1.6, fd: 1.2, front: 1.2, builtBy: 'z_icecream' },
    // Fix round 1: the plan's literal x:6.2 left under a nav margin's width between barIce and
    // icecream1 (no room for icecream1's own front to exist between them), on top of its 5-slot
    // queue running down the same column as seat8, seat12, coldPantry1 and seat10's nav margins in
    // turn. x moves west just enough to open that gap; queueRight (see register2's own comment
    // above for the precedent) walks the QUEUE ONLY into the one column (x~4.85) that every one of
    // those footprints happens to miss at its own z.
    { id: 'barIce',     type: 'display',  product: 'icecream', x: 5.5, z: 8.4, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_icecream', queueRight: -0.65 },
    { id: 'coldPantry1',type: 'pantry',   x: 9.2,  z: 11.4, rot: -Math.PI / 2, fw: 1.2, fd: 1.2, builtBy: 'z_icecream', supplies: ['cream'] },
    // Fix round 1: the plan's literal x:-7.0 put register3's own footprint touching seat7's
    // (-6.5, 9.2), and its queue running north into it. The whole west corner behind it
    // (photo1/seat11) leaves no queueRight-only gap the way barIce's east side does, so the
    // register itself moves — east, off seat7's column entirely. Only x moves.
    { id: 'register3',  type: 'checkout', x: -4.4, z: 8.4,  rot: 0,            fw: 1.6, fd: 0.9, builtBy: 'z_register3' },
    // Fix round 1: the plan's literal z:11.2 put seat11's front and pair spots inside photo1's own
    // nav-expanded footprint (a graze, not a solid clash, but a real "the owner/cleaner can never
    // reach that table" bug). Only z moves.
    { id: 'photo1',     type: 'photo',    x: -9.0, z: 10.4, rot: Math.PI / 2,  fw: 1.4, fd: 2.0, builtBy: 'z_photo' },
    { id: 'seat9',      type: 'seat',     x: -3.2, z: 12.4, rot: Math.PI / 2,  fw: 1.4, fd: 1.4, builtBy: 'z_terraceSeats' },
    { id: 'seat10',     type: 'seat',     x: 3.2,  z: 12.4, rot: -Math.PI / 2, fw: 1.4, fd: 1.4, builtBy: 'z_terraceSeats' },
    { id: 'seat11',     type: 'seat',     x: -8.4, z: 13.0, rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terraceSeats' },
    // Fix round 1: the plan's literal x:8.4 gave seat12's own footprint a solid clash with wc1
    // (9.3, 13.6) and put its front inside coldPantry1's (9.2, 11.4) nav-expanded footprint too —
    // a table wedged between two later-built stations with no reachable side. Only x moves.
    { id: 'seat12',     type: 'seat',     x: 6.8,  z: 13.0, rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_terraceSeats' },
    { id: 'wc1',        type: 'restroom', x: 9.3,  z: 13.6, rot: -Math.PI / 2, fw: 1.6, fd: 1.4, builtBy: 'z_restroom' },
    { id: 'splash1',    type: 'splash',   x: 0.0,  z: 10.6, rot: 0,            fw: 2.4, fd: 2.4, front: 1.6, builtBy: 'z_splash' },

    // ── Batch 4b — the Pet Spa (plan 3.9) ────────────────────────────────────────────────────────
    // The spa region is x 10..17.5, z -7..7, entered through gate2's gap at |z| <= 2.4 on the east
    // fence column (x = 10). LAYOUT RULE used throughout, learned from Batch 1's two shipped bugs
    // (a decor piece 0.67 m from a gate killed pathfinding; a queue slot 0.1 m from its own front
    // pinned runners for months):
    //   - NOTHING's nav-expanded footprint (fw/2 + 0.25) enters the gate lane and its 1 m halo,
    //     i.e. the rectangle x 10..13.4 by |z| <= 3.4. That leaves the whole middle band as one
    //     open hall from the gate to the far wall.
    //   - every front and every queue slot was checked against the REAL grid (CELL 0.5, ox -12,
    //     oz -7) rather than by eye — see test/spa-foundation.test.js, which re-derives all of it.
    // The two service queues run EAST along constant-z rows (the region is 14 m deep but only
    // 7.5 m wide, and a 5-slot queue is 4.8 m long: east-running rows fit, north-running ones
    // would spill straight through the gate lane).
    { id: 'gate2',      type: 'gate',     x: 10.0, z: 0.0,  rot: Math.PI / 2,  fw: 4.8, fd: 0.4, builtBy: 'z_spa' },
    // Lounge seats: pets are pampered, their owners sit. Centres on a 0.5 m multiple ON PURPOSE —
    // SEAT_FORWARD (1.05) clears the nav-expanded half-depth (0.95) by only 0.10 m, so the human
    // spot's CELL centre lands inside its own table's footprint unless the table sits on the grid
    // the way the interior row at z 6.0 does. Same z 6.0 here, for exactly that reason.
    { id: 'spaSeat1',   type: 'seat',     x: 11.2, z: 6.0,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_spa' },
    { id: 'spaSeat2',   type: 'seat',     x: 13.4, z: 6.0,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_spa' },
    { id: 'spaSeat3',   type: 'seat',     x: 15.4, z: 6.0,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy: 'z_spa' },
    // The planter cluster that dresses the lounge corner. Type 'decor' (blocking, no state) rather
    // than a new type: it is fountain1's role exactly, and rule 9 says a new type costs 14 switches.
    { id: 'planters',   type: 'decor',    x: 16.9, z: 6.0,  rot: Math.PI,      fw: 1.0, fd: 1.0, builtBy: 'z_spa' },
    // groom1/bath1 mirror photo1's SHAPE (a queue + a per-guest session), not its numbers. Both
    // face east so their 5-slot queues run down open rows; fd 1.0 (not photo1's 2.0) keeps the
    // rotated depth at 0.95, which is what holds them clear of the gate halo at |z| >= 3.4.
    { id: 'groom1',     type: 'groom',    x: 11.2, z: -4.4, rot: Math.PI / 2,  fw: 1.4, fd: 1.0, builtBy: 'z_groom' },
    { id: 'bath1',      type: 'bath',     x: 11.2, z: -6.4, rot: Math.PI / 2,  fw: 1.4, fd: 1.0, builtBy: 'z_bath' },
    // The bath's supply, mirroring coldPantry1's relationship to icecream1: its own pantry, its own
    // declared supply, so nothing about the interior pantry changes. Parked east of BOTH queue
    // rows (its nav box spans z -6.15..-4.45, which is the one band neither queue row uses).
    { id: 'waterTank1', type: 'pantry',   x: 16.8, z: -5.3, rot: -Math.PI / 2, fw: 1.2, fd: 1.2, builtBy: 'z_bath', supplies: ['water'] },
    // The accessory rack: no queue (you buy from it, you don't wait at it), on the far east wall
    // facing the gate, so it is the thing you see through the arch.
    { id: 'boutique1',  type: 'boutique', x: 16.8, z: 0.0,  rot: -Math.PI / 2, fw: 2.0, fd: 0.8, builtBy: 'z_boutique' },
    // The Photographer's hire desk. Type 'hire' — the SAME type as hire1, deliberately: the role is
    // staff (economyConfig STAFF.photographer), the desk is just a second place to open the workers
    // sheet, so it needs no new type and no new switch arm anywhere. `front: 1.5` (not the default
    // 1.3) because at 1.3 the front's cell centre sits only 0.2 m outside the desk's own nav box.
    { id: 'photoDesk1', type: 'hire',     x: 14.5, z: 3.7,  rot: Math.PI / 2,  fw: 1.0, fd: 1.6, front: 1.5, builtBy: 'z_photographer' },
  ],

  zones: [
    { id: 'z_seats1',    x: -6.75, z: 4.3,  price: 90,   adds: ['seat1', 'seat2'],                       label: 'Tables' },
    { id: 'z_oven2',     x: 3.5,   z: -3.6, price: 220,  adds: ['oven2', 'dispCupcake'],                 requires: 'z_seats1', label: 'Cupcake oven' },
    // Task 25 supported candidate: after Cupcakes, staffing and checkout capacity become parallel
    // choices. The Desk advances the productive room chain; the second register is a useful but
    // genuinely optional throughput branch rather than a hidden prerequisite for automation.
    { id: 'z_register2', x: -8.0,  z: -0.6, price: 340,  adds: ['register2'],                            requires: 'z_oven2', label: 'Second register' },
    { id: 'z_hire',      x: -7.2,  z: 1.0,  price: 300,  adds: ['hire1'],                                requires: 'z_oven2', label: 'Staff desk' },
    { id: 'z_coffee',    x: 0.5,   z: -3.6, price: 700,  adds: ['coffee1', 'barCoffee', 'pantry1'],       requires: 'z_hire',   label: 'Coffee bar' },
    { id: 'z_bowl',      x: 5.3,   z: 2.5,  price: 900,  adds: ['bowl1'],                                 requires: 'z_coffee', label: 'Pet treat bar' },
    { id: 'z_blender',   x: -3.5,  z: -3.6, price: 1150, adds: ['blender1', 'barSmoothie', 'bush1'],      requires: 'z_bowl',   label: 'Smoothie bar' },
    { id: 'z_garden',    x: 6.0,   z: 4.2,  price: 1400, adds: ['bush2', 'bush3'],                        requires: 'z_blender',label: 'Garden expansion' },
    { id: 'z_seats2',    x: 0.8,   z: 4.3,  price: 1750, adds: ['seat3', 'seat4', 'seat5', 'seat6'],      requires: 'z_garden', label: 'Pet lounge' },

    // Batch 1 — the terrace chain (plan 3.1/7.1). z_terrace's own circle sits in the INTERIOR (the
    // region doesn't exist yet, so its cells are still blocked) just north of the pet lounge, by the
    // gap between seat4 and seat5 where the gate will open; every zone after it sits on the deck
    // itself, clear of stations and the gate lane (|x| <= 1.2 near z 7.0-7.4).
    //
    // TASK 1.6c: prices below are re-tuned from their Batch 1 originals (z_terrace 20000, z_icecream
    // 9500, z_register3 6000, z_photo 12000, z_terraceSeats 8500, z_restroom 7500, z_splash 11000).
    // Measured (tools/bot.js, 40-day run): at the original prices the terrace unlocked day 25 and
    // only 3/7 chain zones were bought within 40 days, against the plan's day 14-16 / ~day 30
    // targets (plan 4.2/4.3). The save-vs-spend fix in botDecide.js (see its CONTENT_SAVE_AFFORD_
    // MULTIPLIER comment) closes most of the gap on its own but the core café's income ceiling
    // (bounded by the existing demand/friction model, out of this task's scope — see the plan's own
    // "PRICE IS NOT THE CAUSE" framing) can't fund a 20k save in ~4 days; these prices are the
    // "then prices last" lever, applied only after confirming the policy fix alone wasn't enough.
    // Days 1-12 stay sales-for-sales identical (see tools/bot.js's day table) — the terrace zone
    // only ever becomes active starting day 12, so no earlier day reads any of these numbers.
    // Batch 6: the terrace is the first ROOM the player unlocks and it used to land on day 14 in the
    // bot (6500 behind z_seats2). The owner's verdict was that ten days of "+15% speed" is not a
    // reward. 3600 behind the smoothie bar puts it within reach around day 9–10; the garden and the
    // pet lounge stay buyable on the way, they are simply no longer the gate.
    { id: 'z_terrace',      x: 0.75, z: 5.0,  price: 3600, adds: ['gate1', 'fountain1', 'seat7', 'seat8'],            requires: 'z_blender',    label: 'Terrace' },
    { id: 'z_icecream',     x: 7.4,  z: 9.5,  price: 3600,  adds: ['icecream1', 'barIce', 'coldPantry1'],              requires: 'z_terrace',    label: 'Ice cream lane' },
    { id: 'z_register3',    x: -5.0, z: 9.6,  price: 4000,  adds: ['register3'],                                      requires: 'z_icecream',   label: 'Terrace register' },
    { id: 'z_photo',        x: -9.0, z: 8.6,  price: 3000, adds: ['photo1'],                                         requires: 'z_terrace',    label: 'Pet photo studio' },
    { id: 'z_terraceSeats', x: 0.0,  z: 12.8, price: 4000,  adds: ['seat9', 'seat10', 'seat11', 'seat12'],             requires: 'z_register3',  label: 'Terrace tables' },
    { id: 'z_restroom',     x: 6.0,  z: 13.2, price: 3500,  adds: ['wc1'],                                            requires: 'z_terraceSeats', label: 'Restroom' },
    { id: 'z_splash',       x: 4.0,  z: 10.2, price: 4000, adds: ['splash1'],                                        requires: 'z_photo',      label: 'Splash pool' },

    // Batch 4b — the spa chain (plan 3.9). A LINEAR chain on purpose (each zone requires the one
    // before it) so content cadence past the terrace is a single measurable line rather than a
    // branching tree the bot can wander through in any order.
    //
    // NO STAR GATE, and this is a decision, not an omission. Plan 3.9 says z_spa "requires ★3".
    // But src/sim/pawRating.js's ★4 row r4.spa already requires z_spa to be BUILT, and that row
    // goes live the moment z_spa appears in this catalogue (pawZoneInCatalogue) — so the
    // space -> star link the plan wants is already encoded, from the rating's side. Adding a star
    // gate on the ZONE as well would close the loop into a circle for tools/bot.js, which cannot
    // model ★2+ (the rows above ★1 need meta the headless loop never writes — see the bot's own
    // "WHAT THIS BOT CANNOT MEASURE" section): the spa would be unbuyable, and therefore
    // unmeasurable, to day 60. Zone chain only.
    //
    // PRICES ARE PLACEHOLDERS, not the plan's 45,000. Batch 2 measured the plan's terrace prices
    // as unreachable and re-priced the whole chain by bot (see z_terrace's own TASK 1.6c note
    // above: 20000 -> 6500). The same measurement has to happen here; these numbers only have to
    // be (a) above CONTENT_ZONE_PRICE (4000, economyConfig.js) so the bot's content-save policy
    // treats them as big content, and (b) far enough past the terrace chain that the spa cannot
    // open before it. A pacing agent replaces them.
    { id: 'z_spa',          x: 9.0,  z: 0.8,  price: 9000, adds: ['gate2', 'spaSeat1', 'spaSeat2', 'spaSeat3', 'planters'], requires: 'z_splash',    label: 'Pet spa' },
    { id: 'z_groom',        x: 13.5, z: -4.4, price: 6000,  adds: ['groom1'],                                                requires: 'z_spa',       label: 'Grooming table' },
    { id: 'z_bath',         x: 13.5, z: -6.4, price: 7000,  adds: ['bath1', 'waterTank1'],                                   requires: 'z_groom',     label: 'Pet bath' },
    { id: 'z_boutique',     x: 14.8, z: 0.0,  price: 6500,  adds: ['boutique1'],                                             requires: 'z_bath',      label: 'Boutique' },
    { id: 'z_photographer', x: 13.0, z: 2.0,  price: 8000,  adds: ['photoDesk1'],                                            requires: 'z_boutique',  label: 'Photographer' },
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
