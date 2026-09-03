# Pet Café Tycoon — Milestone 2 (game feel + complete area 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are specified by exact interfaces, numbers and tests; the implementer writes the code.

**Goal:** Make the slice feel like a real game (snappy joystick, collision, chest-carried stacks, human customers walking their pets, crisp queues, sound) and complete area 1 (all 8 builds, tables in use, cupcakes, second register, hire desk with runner and cashier, upgrade kiosk, terrace gate as end card), then redeploy the demo.

**Architecture:** Same split as M1: pure sim (`src/sim/*`, node:test) → render (`src/render/*`) → glue, with the glue split into systems (`src/systems/*`). New pure modules: `collide.js`, `staff.js`. New render: `human.js`, leash, new props. New `src/audio/synth.js`. HTML bottom sheets in `src/ui/sheets.js`.

**Tech Stack:** unchanged (Vite 8, three.js 0.185, plain ES modules, node:test, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-01-pet-cafe-tycoon-design.md` (binding), plus the design rulings in this plan's Global Constraints. **Carry-over:** `docs/superpowers/plans/2026-09-02-m1-carry-over.md` items 1–8 are folded into the tasks below.

## Global Constraints

- Everything in M1's Global Constraints still holds (build guard, one external script, no WASM/workers/eval/storage/visibilitychange, Esc never `preventDefault`ed, +x east +z south, palette).
- **Customers are humans walking a pet** (user decision 2026-09-02). The human is the sim entity; the pet is a render-side follower on a leash.
- **The owner carries the stack in front at chest height**, both arms forward. Never on the head.
- **Feel numbers (exact):** joystick deadzone 6 px, full speed at 14 px of drag, knob visual clamp 40 px; owner base speed 4.6 m/s (`BASE_SPEED`), velocity damping λ = 18; customer speed 2.2 m/s; runner speed 2.8 m/s. Portrait visible width 10 m, landscape 18 m, square 13 m.
- **Collision:** circle-vs-axis-aligned-box push-out for the owner (r 0.35), customers (r 0.30) and staff (r 0.30) against every active station footprint and the floor bounds. No one passes through a station.
- **Draw-call budget 150** for this milestone (pairs of characters). Triangles ≤ 150 k.
- Tests: pure sim modules keep node:test coverage; every render task is verified by GPU screenshots the controller inspects.
- Commit after every task with the project's git identity flags and the Co-Authored-By trailer.

---

## File structure (new or changed in M2)

```
data/area1.js           full area 1: 14 stations, 8 zones, footprints, queue geometry
src/sim/economy.js      + spawnInterval(built), maxCustomers(built), STAFF costs, buyUpgrade, hire
src/sim/world.js        + precomputed st.queue slots, st.front, activeCheckouts cache, seats helpers
src/sim/customers.js    humans-with-pets state machine, rebalance, 6-slot queues, seat pairs
src/sim/staff.js        runner and cashier simulation (pure)
src/sim/collide.js      circle vs boxes push-out (pure)
src/render/human.js     blocky human builder with variants (customers + staff)
src/render/owner.js     chest carry
src/render/pets.js      2-leg-group merge, followTarget(), leash anchor
src/render/props.js     + hireDeskMesh, kioskMesh, gateMesh, checkout as before, table with 2 seats, footprints unchanged
src/render/leash.js     THREE.Line between hand and pet
src/audio/synth.js      WebAudio synth patches + host mute + unlock on first input
src/ui/sheets.js        bottom sheet component, kiosk sheet, hire sheet, end card
src/systems/{stations,zones,customers,staff,visuals}.js   the update loop split
src/game.js             creates systems, owns G state, 20-line update()
tools/bot.js            headless economy bot
tools/shot.js           + moments: kiosk, seated, staff
test/{customers,staff,collide,economy,world}.test.js
```

---

### Task 1: Sim — humans with pets, crisp queues, staff, economy formulas

**Files:**
- Modify: `src/sim/customers.js`, `src/sim/world.js`, `src/sim/economy.js`
- Create: `src/sim/staff.js`, `test/staff.test.js`
- Modify: `test/customers.test.js`, `test/economy.test.js`, `test/world.test.js`

**Interfaces (Produces):**
- `economy.js`: `BASE_SPEED = 4.6`; `spawnInterval(builtSet) = max(1.5, 4 - 0.3 * seatingBuilds)`, `maxCustomers(builtSet) = min(10, 6 + 2 * seatingBuilds)` where `seatingBuilds` counts zone ids in `['z_seats1','z_seats2']` that are built; `STAFF = { runner: { costs: [1000, 2500], speed: 2.8, carry: 6 }, cashier: { costs: [1500], every: 3 } }`; `hireCost(kind, staffCounts) → int|null`; `buyUpgrade(state, key) → {ok, cost}` and `hire(state, kind) → {ok, cost}` where `state = { coins, up, staff: { runner: n, cashier: n } }` is mutated on success (coins deducted, tier or count incremented).
- `world.js`: `createWorld(area, save)` now precomputes on every station `st.front = {x, z}` (pos + rotated (0,0,front) with `front` from the data, default 1.3) and on counters `st.queue = [{x, z} × 6]` (front point plus 0.85 m steps away from the counter along its facing); `w.checkouts = [ids]` and `w.counters = [ids]` arrays refreshed by `refreshActive(w)` (called after every `payZone` completion); `freeSeat(w) → seat station` with `seat.pair = {human:{x,z}, pet:{x,z}}` precomputed from the table's rotation (human on the chair side, pet 0.6 m to its right); `seatById`.
- `customers.js`: `createCustomer(id, species, variant, area)` where `variant = { shirt: 0..4, hair: 0..3, skin: 0..2 }`; states `enter → queue → toCheckout → (toSeat → eating) → leave → done`; `WAIT_LIMIT = 15`; rebalance rule: every step, a queued customer with `slot >= 2` moves to another active counter whose queue length is at least 2 shorter, keeping state `queue` and taking the last slot there (event `{type:'moved', id, counterId}`); at most one move per customer per 3 s. Slot positions come from `st.queue[min(slot, 5)]`; slots 6+ (only possible transiently) stand 0.85 m further along the same line. Customers at `slot === 0` with an empty counter wait with `c.mood = 'wait'` (set on the record) and leave angry at `WAIT_LIMIT`. Pay uses `price(product, seated)`. Seat: on pay, if a seat is free the customer walks to `seat.pair.human`, then `eating` for `EAT_TIME = 4`, `seated` event carries `seatId`, then `leave`. `stepCustomers(list, w, price, dt)` unchanged signature. No allocation per frame: `st.queue` is precomputed, `w.checkouts` cached; `assignSlots` keeps a per-counter array on `w._queues` reused each frame.
- `staff.js`: `createStaff(kind, spawnPos) → s` with `{ kind, x, z, rot, state, items:[keys], target, timer }`; `stepStaff(list, w, dt, onCollect)`: runner loop `toOven` (oven with the highest stock) → take up to 6 (0.2 s per item) → `toCounter` (active counter with the fewest items, front point) → drop (0.1 s per item) → repeat; idles at its spawn when nothing to do. Cashier: stands at `checkoutSpot` of the first checkout; every `STAFF.cashier.every` seconds collects all active checkouts' piles via `collectCash` and calls `onCollect(amount, x, z)`. Staff use `moveToward` from customers.js (export it) at `STAFF.runner.speed`.

- [ ] **Step 1: Tests first** — write or update these, run `npm test`, confirm the new ones fail, then implement until 100 % pass:
  - economy: `spawnInterval(new Set()) === 4`, `spawnInterval(new Set(['z_seats1','z_seats2'])) === 3.4`, `maxCustomers` 6 → 8 → 10; `buyUpgrade` deducts 400 for speed tier 0 and refuses with `ok:false` when coins are short or the tier is maxed; `hire` deducts 1000 then 2500 for runners and refuses a second cashier.
  - world: `st.queue` has 6 entries spaced 0.85 m starting 1.4 m in front of counter1 along +z; a rotated station (rot π/2) has `front` at +x; `refreshActive` after building `z_counter2` lists both counters; `freeSeat` returns null with no seats and a seat with `pair.human` and `pair.pet` 0.6 m apart after `z_seats1`.
  - customers: existing five tests still pass with the new queue geometry; new: **rebalance** — 6 customers queued at counter1, build counter2, step 3 s, assert at least 2 customers now have `counterId === 'counter2'` and no two customers share `(counterId, slot)`; **wait mood** — empty counter, customer at slot 0 for 2 s has `mood === 'wait'`, leaves angry after 15 s; **seated pair** — with seats built, after pay the customer reaches `seat.pair.human` within 0.05 m and the `seated` event has a `seatId`; **product round trip** (exists) still passes; **full house invariant** — 8 customers, 2 counters stocked with 12 cookies each, stepped 60 s: every customer reaches `done`, no duplicate `(counterId, slot)` at any step, every seat ends `occupied === false`.
  - staff: runner with oven1 stock 6 and empty counter1: after 8 s the counter has 6 cookies and the oven 0 (then refills); runner picks the counter with fewer items when two are active; cashier collects a 30-coin pile within 3.1 s and `onCollect` receives 30.
- [ ] **Step 2: Implement** to the interfaces above. `moveToward` stays exported; `SEP` separation only between customers, never against staff.
- [ ] **Step 3: `npm test` green**, commit: `feat(sim): human customers with pets, rebalance, seats, staff, economy formulas`.

---

### Task 2: Data — full area 1 with footprints

**Files:**
- Modify: `data/area1.js`; Create: `src/sim/collide.js`, `test/collide.test.js`; Modify: `test/world.test.js`

**Interfaces (Produces):**
- Station records gain `fw, fd` (footprint width along x and depth along z before rotation) and optional `front` distance. Types: `oven, counter, checkout, seat, hire, kiosk, gate`.
- Full station list (positions in meters, rot in radians, footprint w×d):
  - `oven1` (5.5, −4.2) rot 0, 1.6×1.2, product cookie; `oven2` (1.5, −4.2) rot 0, 1.6×1.2, product cupcake, builtBy `z_oven2`
  - `counter1` (0, −1.5) rot 0, 2.4×1.0; `counter2` (3, −1.5) rot 0, builtBy `z_counter2`
  - `checkout1` (−4, −1.5) rot 0, 1.6×0.9; `checkout2` (−6.3, −1.5) rot 0, builtBy `z_checkout2`
  - seats: `seat1` (−3, 3) , `seat2` (0.5, 3) builtBy `z_seats1`; `seat3` (−3, 4.9), `seat4` (0.5, 4.9), `seat5` (3.5, 3), `seat6` (3.5, 4.9) builtBy `z_seats2`; all rot 0, footprint 1.4×1.4, chair on the south side (+z), so `pair.human = (x, z + 0.75)`, `pair.pet = (x + 0.6, z + 0.75)`
  - `hire1` type hire (−6.6, 2.0) rot π/2 (front faces +x), 1.0×1.6, builtBy `z_hire`
  - `kiosk1` type kiosk (7.0, 2.0) rot −π/2 (front faces −x), 1.0×1.6, builtBy `z_kiosk`
  - `gate1` type gate (7.9, 4.6) rot −π/2, 0.3×2.4, builtBy `z_gate`
- Zones (id, x, z, price, adds, requires) in this exact chain: `z_counter2` (3, 0.6, 60, [counter2]) → `z_seats1` (−1.2, 3.0, 150, [seat1, seat2]) → `z_oven2` (1.5, −2.4, 300, [oven2]) → `z_checkout2` (−6.3, 0.3, 500, [checkout2]) → `z_hire` (−5.0, 2.0, 800, [hire1]) → `z_kiosk` (5.4, 2.0, 1200, [kiosk1]) → `z_seats2` (1.2, 4.9, 2000, [seat3, seat4, seat5, seat6]) → `z_gate` (6.3, 4.6, 5000, [gate1]). Labels: Counter, Tables, Oven, Register, Hire desk, Upgrades, More tables, Terrace gate.
- `collide.js`: `pushOut(p, r, boxes)` where `p = {x, z}` is mutated, `boxes = [{x, z, hw, hd}]` (centre, half extents, axis-aligned; a station with rot ±π/2 swaps `hw/hd`); resolves each overlapping box by the minimum-penetration axis; returns true if moved. `stationBoxes(w) → boxes` rebuilt only by `refreshActive` (cached on `w.boxes`), including only active stations. Floor bounds are clamped separately by the caller.
- `queueSlots`/`checkoutSpot`/`cashSpot` helpers remain for compatibility but derive from `st.front`; `cashSpot` = front + 1.2 m to the station's left.

- [ ] **Step 1: Tests** — collide: a circle overlapping a box on its +x side is pushed to `x = box.x + hw + r`; a circle inside the box corner is pushed along the axis with the smallest penetration; a non-overlapping circle is untouched and returns false; a rotated station (rot π/2) yields swapped half extents in `stationBoxes`. world: `createWorld(AREA1)` has 15 stations, 8 zones, exactly 3 active at start (oven1, counter1, checkout1; assert the active set equals that list); `activeZones` is `[z_counter2]`; after building the whole chain in order every station is active and `w.boxes.length === 15`.
- [ ] **Step 2: Implement**; keep `tools/shot.js` targets valid (oven front is now `(5.5, −2.6)`, counter front `(0, −0.1)`, cash spot `(−5.2, −0.6)`, zone `(3, 0.6)` — unchanged).
- [ ] **Step 3: `npm test` green**, commit: `feat(data): full area 1 with footprints and collision`.

---

### Task 3: Render — humans, pets on leashes, chest carry, new props

**Files:**
- Create: `src/render/human.js`, `src/render/leash.js`; Modify: `src/render/owner.js`, `src/render/pets.js`, `src/render/props.js`

**Interfaces (Produces):**
- `createHuman(variant, role) → H` with `H.group` (feet at y 0, faces +z), `H.update(dt, vx, vz)` (walk cycle, facing turn, idle sway), `H.hand` (an `Object3D` at the right hand, world anchor for the leash), `H.setCarry(n)` (arms forward when n > 0), `H.stack` (Group at chest height (0, 1.05, 0.42) for carried items), `H.height` 1.95. Variants: `SHIRTS = ['#FFB3C1', '#8FD3FF', '#FFE08A', '#B5F2C8', '#D9B8FF']`, `HAIR = ['#3B2E2A', '#8A5A2B', '#E8C36A', '#C94F3D']`, `SKIN = ['#FFD9B3', '#E0B48C', '#A9744F']`. Role `'customer'` gets a hair cap; role `'runner'` gets a cream cap and apron; role `'cashier'` gets a purple vest. Draw calls per human ≤ 4 (leg L, leg R, body+arms merged, head+hair merged). Geometry is cached per `(variant, role)` key; a variant is only ~60 combinations, cache lazily.
- `owner.js`: the owner is `createHuman({shirt: coral, hair: 0, skin: 0}, 'owner')` with a chef hat and apron; keep the exported `createOwner()` signature and `O.items`, `O.addItem`, `O.popItem`, `O.update`; items stack upward from `H.stack` at 0.17 m; sway lags velocity as before; `O.setCarry` is called automatically when items change.
- `pets.js`: leg pairs merged into two meshes (front-left + back-right, front-right + back-left) so a pet is ≤ 6 draw calls; `P.followTarget(hx, hz, hrot, dt)`: pet goal = human position − facing × 0.9 + right × 0.45, position damped λ 8, facing toward its own velocity, `moving` derived from its own speed; `P.neck` anchor Object3D for the leash; `P.sit()` / `P.stand()` (sit lowers the body and tucks legs); everything else unchanged.
- `leash.js`: `createLeash(scene) → L` with `L.attach(handObj, neckObj)`, `L.update()` (2-point `THREE.Line`, `LineBasicMaterial` colour `#7A5A3A`, sags via a third mid point 0.15 m below the midpoint), `L.detach()`. Lines are ≤ 1 draw call each.
- `props.js`: `hireDeskMesh()` (wood desk with a clipboard and a "HIRE" sign board), `kioskMesh()` (purple kiosk with a screen and a gear icon), `gateMesh()` (two wooden posts with an arched sign "TERRACE", closed gate leaf), `tableMesh()` gains a second chair on the pet side and a small bowl; all return Groups with +z as front. `counterMesh` shows a small "COOKIES"/"CUPCAKES" chalkboard via `g.setProduct(key)` that swaps a colour bar (no text rendering).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Screenshot check** (throwaway `main.js`, headless, both viewports, saved under the SDD workspace): a human customer of each shirt colour walking with each pet species on a leash; the owner carrying 6 items at chest height with arms forward; the hire desk, kiosk, gate and a table with two chairs placed at their area positions; a sitting pet. The controller inspects these before the task is complete.
- [ ] **Step 3:** `npm run build` green (guard), commit: `feat(render): humans with pets on leashes, chest carry, area 1 props`.

---

### Task 4: Feel — input, collision, camera, sound

**Files:**
- Modify: `src/core/input.js`, `src/render/scene.js`; Create: `src/audio/synth.js`

**Interfaces (Produces):**
- `input.js`: `DEAD = 6`, `FULL = 14`, knob visual clamp 40 px; `I.pressed` true while a pointer is down; `I.onFirstInput(cb)` fires once on the first pointerdown or keydown (audio unlock).
- `scene.js`: visible width 10 / 13 / 18 m (portrait / square / landscape) with a smooth interpolation over aspect 0.8..1.25 instead of a step; shadow map re-picked on resize (1024 under 700 px width, else 2048); `S.shake(amount)` adds a decaying camera offset (0.08 m for builds).
- `synth.js`: `createAudio() → A` with `A.unlock()` (creates the AudioContext, call from the first input), `A.setHostMute(bool)`, `A.setSfx(bool)`, `A.play(name, opts)` for names `coin` (sine 880→1760 Hz, 90 ms, slight random detune), `pop` (triangle 220→70 Hz, 120 ms), `drop` (sine 520 Hz 60 ms), `ding` (triangle 1320 Hz, 400 ms decay), `chime` (three sines 660/880/1320 staggered 60 ms), `build` (noise sweep 200→2000 Hz 300 ms + chord 440/554/659), `step` (filtered noise 40 ms, volume 0.12), `tap` (sine 1000 Hz 30 ms), `angry` (square 180 Hz 150 ms); voice cap 24; master through a compressor. No samples, no fetch. Never plays while host-muted; `setSfx(false)` silences.

- [ ] **Step 1: Implement.** Add `test/synth.test.js` only for pure helpers if any; the audio graph is verified by ear later and by the absence of console errors.
- [ ] **Step 2: Check** with a throwaway `main.js`: the joystick knob clamps at 40 px, moving starts at 6 px and reaches full speed at 14 px (log `I.x, I.z` magnitudes for a scripted pointer drag of 5, 10, 14, 40 px); portrait screenshot shows characters about 30 % taller on screen than in M1's `queue-portrait.png`.
- [ ] **Step 3:** commit: `feat: snappy joystick, camera framing, synth audio`.

---

### Task 5: UI — bottom sheets (kiosk, hire), end card, HUD polish

**Files:**
- Create: `src/ui/sheets.js`; Modify: `index.html`, `src/style.css`, `src/ui/hud.js`

**Interfaces (Produces):**
- `createSheets(root) → U` with `U.open(kind, model, actions)` for kinds `kiosk`, `hire`, `end`; `U.close()`; `U.isOpen`; `U.onClose(cb)`. Sheets slide up from the bottom (transform transition 220 ms), max width 420 px centred, safe-area padding, a 48 px close button top-right, Esc closes (never `preventDefault`).
  - kiosk model: `[{ key, label, tier, maxTier, cost|null, effect }]` renders three rows with BUY buttons (disabled when `cost === null` or `coins < cost`); actions `{ buy(key) }`. Labels: Speed (+15 % per tier), Carry (6 → 9 → 12 → 16), Income (+20 % per tier).
  - hire model: `[{ kind, label, count, cost|null, desc }]`; actions `{ hire(kind) }`. Runner: "Carries treats from the ovens to the counters." Cashier: "Collects the registers every 3 s."
  - end model: `{ title: 'Terrace unlocked!', body: 'The garden terrace opens in the next update. Your café keeps earning.' }` with a CONTINUE button.
- HUD: wallet pill gets a coin-arc target anchor; a second pill under it shows the customer count `👥 n/max` (use a simple SVG icon, not an emoji glyph, so all fonts render it); hint pill unchanged; `hud.toast(text)` 1.5 s.
- Pointer events on `.sheet` must not spawn the joystick (already excluded in input.js by `.sheet`).

- [ ] **Step 1: Implement**; add `test/sheets.test.js`? No — DOM. Verify by screenshots at 450×800 and 1280×720: kiosk sheet with three rows and one disabled button, hire sheet, end card; every button ≥ 48 px; nothing overflows the viewport.
- [ ] **Step 2:** commit: `feat(ui): kiosk and hire sheets, end card, HUD count`.

---

### Task 6: Glue — systems split, staff and pairs in the world, bot, screenshots, deploy

**Files:**
- Create: `src/systems/stations.js`, `src/systems/zones.js`, `src/systems/customers.js`, `src/systems/staff.js`, `src/systems/visuals.js`, `tools/bot.js`; Modify: `src/game.js`, `src/main.js`, `tools/shot.js`

**Interfaces (Produces):**
- `G` state: `{ coins, up, staff: {runner, cashier}, boosts, stats, settings: {sfx: true}, built (via world), customers, staffList }`; `G.snapshot() → save object` and `G.restore(save)` per the spec's save format (fields that exist in M2: `v, coins, lifetimeEarned, builds/partial via world, upgrades, staff, stats, settings`); no storage calls yet — the platform layer arrives in M3.
- Each system exports `create<Name>(G, S, ctx) → { update(dt) }`; `game.js` calls them in order stations → zones → customers → staff → visuals, then `fx.update`, `hud.update`.
- Behaviour:
  - Collision: after integrating velocity, `pushOut` the owner against `w.boxes`, then clamp to floor bounds; customers and staff likewise (customers keep `separate()`).
  - Owner carry: chest stack; picking from an oven and dropping on a counter as in M1 with the product key of the oven.
  - Kiosk / hire: when the owner enters the station's front circle (r 1.2) and the sheet is not open, open it once (`A.play('tap')`); re-arm when the owner leaves the circle; BUY/HIRE call `buyUpgrade`/`hire`, play `chime` on success, `angry` on refusal, `hud.toast('Not enough coins')`.
  - Staff render: a runner is a `createHuman(variant, 'runner')` carrying its items at the chest; a cashier stands at the register; `onCollect` credits coins and fires a coin arc from the register.
  - Customers render: human + pet + leash per customer; pets `followTarget`; on `seated` both go to the pair spots and the pet `sit()`s; on `took` the pet carries the item; angry leave shows the red mark on the human (reuse the pet's bubble builder above the human head).
  - Sound hooks: coin (collect), drop (item on counter), pop (pick from oven), ding (oven finished a batch of 6), chime (upgrade/hire/build), build (zone completed) + `S.shake(0.08)`, step every 0.28 s while the owner moves, angry.
  - Gate built: end card once; the gate leaf opens (rotate 100°) and stays open; coins keep flowing.
  - Hints: M1 order plus `'Buy upgrades at the kiosk'` when the kiosk is built and `'Hire staff at the desk'` when the hire desk is built, each shown once.
- `tools/bot.js`: headless sim run in node (no three): a scripted owner who repeats oven → counter → cash → nearest affordable zone, with `dt = 1/30`, staff hired when affordable; prints a table of `zone id → seconds` and total time for all 8 builds; must finish in under 15 s of wall clock. Target from the spec: first build ≈ 60 s, terrace gate 6–8 min. Tune prices or spawn numbers only via a follow-up ruling, never silently.
- `tools/shot.js`: add moments `kiosk` (owner at the kiosk front, sheet open), `seated` (a pair eating at a table — set `G.coins` and build the first two zones via `payZone` in the page), `staff` (hire a runner via the sim and wait 6 s). Draw-call gate 150.

- [ ] **Step 1: Implement** the systems split first (behaviour identical to M1), run `npm run shot` to confirm nothing regressed, then add the new behaviour.
- [ ] **Step 2: Verify**: `npm test` green, `npm run build` `postbuild OK`, `npm run shot` exit 0 with the new moments; the controller inspects the PNGs; `node tools/bot.js` prints the pacing table.
- [ ] **Step 3: Deploy**: copy `dist/` into a clone of `mshowsary/pet-cafe-tycoon-demo`, commit, push (Pages redeploys). Commit the source: `feat: milestone 2 — feel, humans with pets, area 1 complete`.

---

## Milestone 2 exit criteria

- The owner never passes through a station; the joystick reaches full speed within 14 px of drag.
- Customers are humans with a pet on a leash; queues are straight lines; a built second counter visibly splits the line within 3 s.
- All 8 area-1 builds are purchasable in the play-test; the kiosk and hire sheets work; a runner restocks; a cashier collects; a pair sits and eats at a table.
- Sound plays on the listed events after the first input, and is silent under host mute.
- The bot reports the first build under 90 s and the gate under 10 min (or a ruling documents a price change).
- Demo redeployed to https://mshowsary.github.io/pet-cafe-tycoon-demo/ with the milestone 2 build.
