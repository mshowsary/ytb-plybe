# Pet Café Tycoon — Milestone 3 (navigation that works + a loop with tension) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Tasks are specified by exact interfaces, numbers and tests; the implementer writes the code. The navigation acceptance test in Task 1 is authored by the controller and must be transcribed verbatim.

**Goal:** Replace push-out steering with grid pathfinding that provably never jams, then make the loop tense: wish bubbles with patience, a manned register, several production chains, dirty tables, demand counters, an objective arrow, workers with levels. Balance with the bot to a measured unlock cadence and busy index, then deploy for the user's playtest.

**Architecture:** unchanged split (pure sim → render → systems). New pure modules `src/sim/nav.js` (grid + A\*), `src/sim/mover.js` (path following, avoidance, stall handling), `src/sim/jobs.js` (pending-job detection used by the arrow and the bot). Customers, staff and the bot all move through `mover.js`; pets stay render-side followers.

**Spec:** `docs/superpowers/specs/2026-09-02-m3-fun-and-navigation-design.md` (binding) on top of the original spec as amended.

## Global Constraints

- All M1/M2 Global Constraints hold (build guard, one external script, no WASM/workers/eval/storage/visibilitychange, no `preventDefault`, palette, chest carry, feel numbers).
- **Every mover walks the grid.** No `pushOut`-based steering remains for customers or staff after Task 2; the owner keeps push-out (player-controlled).
- **Acceptance is automated:** `test/nav-fullhouse.test.js` (Task 1, verbatim) must pass from Task 2 onward and stay in `npm test`. No task is complete while it fails.
- **Budget for a mover step:** the full-house test (1200 simulated seconds, ≤ 16 movers) must finish in under 25 s wall clock on this machine.
- New numbers (exact): grid cell 0.5 m; footprint margin 0.25 m; patience 12 s; register processing 0.6 s per customer for the owner, 1.0 s for a level-1 cashier; coffee 2.5 s per cup, bean sack 20 cups; bush regrow 25 s, 3 fruit per harvest; blender 2.0 s per smoothie, 1 fruit each; treat bowl capacity 10, kibble sack 20; table cleaning 1.0 s by the owner, 1.6 s by a level-1 cleaner.
- Draw-call budget stays 200 at a forced full house; new props must be merged meshes; bubbles and counters are DOM or shared geometry.

---

## New area layout (Task 3 data; used by every later task)

Floor 20 × 14 m (x −10..10, z −7..7), origin centre. Door on the west wall at z 4.2 (entry lane z 3.0..4.2, exit lane z 4.2..5.4, both extending 2 m outside to the spawn/despawn points). Camera widths unchanged.

| Station | Type | Pos (x, z) | Rot | Footprint | Notes |
|---|---|---|---|---|---|
| oven1 | oven | (6.5, −5.2) | 0 | 1.6×1.2 | cookie |
| oven2 | oven | (3.5, −5.2) | 0 | 1.6×1.2 | cupcake, z_oven2 |
| coffee1 | coffee | (0.5, −5.2) | 0 | 1.2×1.2 | coffee, beans 20, z_coffee |
| storage1 | storage | (−2.5, −5.2) | 0 | 1.2×1.2 | sacks: beans, kibble |
| blender1 | blender | (−5.0, −5.2) | 0 | 1.2×1.2 | smoothie from fruit, z_blender |
| counter1 | counter | (2.0, −2.0) | 0 | 2.4×1.0 | |
| counter2 | counter | (5.0, −2.0) | 0 | 2.4×1.0 | z_counter2 |
| counter3 | counter | (−1.0, −2.0) | 0 | 2.4×1.0 | z_counter3 |
| register1 | register | (−5.5, −2.0) | 0 | 1.6×0.9 | queue of 6 in front |
| register2 | register | (−8.0, −2.0) | 0 | 1.6×0.9 | z_register2 |
| bowl1 | bowl | (6.8, 2.5) | −π/2 | 0.8×0.8 | pet treats, z_bowl (ruled during execution) |
| bush1..3 | bush | (8.6, 3.2) rot π, (8.6, 4.7) rot −π/2, (7.2, 5.9) rot π | — | 0.9×0.9 | harvest, z_garden (ruled during execution) |
| seat1..2 | seat | (−8.0, 6.0), (−5.5, 6.0) | π | 1.4×1.4 | z_seats1 — one seat row, chairs on the north side, so the exit corridor z 3.0..4.6 stays free (ruled during execution after the acceptance test exposed a 0.6 m pinch between two rows) |
| seat3..6 | seat | (−3.0, 6.0), (−0.5, 6.0), (2.0, 6.0), (4.5, 6.0) | π | 1.4×1.4 | z_seats2 |
| hire1 | hire | (−8.6, 1.0) | π/2 | 1.0×1.6 | z_hire |
| kiosk1 | kiosk | (9.0, −3.5) | −π/2 | 1.0×1.6 | z_kiosk (ruled during execution) |
| gate1 | gate | (9.9, 1.0) | −π/2 | 0.3×2.4 | z_gate |

Zone chain (price, adds): z_counter2 (60) → z_seats1 (90) → z_oven2 (180) → z_register2 (240) → z_coffee (320) → z_hire (420) → z_bowl (520) → z_garden (700, bush1..3) → z_blender (900) → z_counter3 (1100) → z_kiosk (1300) → z_seats2 (1600) → z_gate (2400). Zone discs sit where the station will be, offset toward open floor; no zone disc inside another footprint (tested).

Queue lanes: counters and registers queue toward +z (south), 5 slots at 1.4 m then 0.85 m steps (last slot z 2.8; ruled during execution — 6 slots reached into the exit corridor); the layout test asserts every slot, seat spot, bowl spot and bush spot lies on a free grid cell and that the corridor z 3.0..4.6, x −9..6 is free.

---

### Task 1: Grid, A\*, mover, and the acceptance test (controller-authored)

**Files:** Create `src/sim/nav.js`, `src/sim/mover.js`, `test/nav.test.js`, `test/nav-fullhouse.test.js` (verbatim below; it will FAIL until Task 2 and is registered in `npm test` from Task 2 — in Task 1 it is created with `test.skip` on the full-house case and un-skipped in Task 2).

**Interfaces (Produces):**
- `nav.js`
  - `buildGrid(area, world) → grid` with `{ w, h, cell: 0.5, ox, oz, blocked: Uint8Array, lane: Uint8Array }`; `ox = -area.size.w/2 - 2`, `oz = -area.size.d/2` (2 m street margin on the west for the door lanes); cells whose centre lies inside an active station footprint expanded by 0.25 m are blocked; cells outside the floor are blocked except the door lanes (`lane 1` entry cells z 3.0..4.2, `lane 2` exit cells z 4.2..5.4, from x = ox to the wall); the wall column at x = −w/2 is blocked except the door gap.
  - `idx(grid, x, z) → int` (clamped), `cx(grid, i)`, `cz(grid, i)` (cell centres), `isFree(grid, i, mask)`.
  - `findPath(grid, from, to, mask, out) → n` A\* (8-connected, no corner cutting through blocked cells, octile heuristic, binary heap), writes cell indices from `from` to `to` into `out` (Int32Array of length ≥ w*h), returns the count (0 = no path). `mask`: bit 1 allows entry-lane cells, bit 2 allows exit-lane cells; normal cells always allowed. Uses preallocated typed arrays kept on the grid (`gScore`, `parent`, `closedStamp` with an incrementing stamp) — no allocation per search.
  - `nearestFree(grid, i, mask) → int` (BFS ring search, radius ≤ 6).
  - `pathCache(grid)` keyed by `from * N + to` valid for the current `grid.frame` (call `grid.frame++` once per sim step).
- `mover.js`
  - `createMover(x, z, r, speed) → m` with `{ x, z, rot, r, speed, path: Int32Array(64), n: 0, k: 0, tx, tz, hasTarget, stall: 0, blockedT: 0, replans: 0, teleports: 0, vx, vz, mask: 0 }`.
  - `setTarget(m, x, z, grid)`: plans from `nearestFree(idx(m))` to `nearestFree(idx(target))` with the mover's `mask`; the final waypoint is the exact `(x, z)`.
  - `stepMover(m, grid, movers, dt) → arrived` where `movers` is the array of all movers for avoidance: follows waypoints (`moveToward` semantics, waypoint reached within 0.12 m, final target within 0.05 m); local avoidance: for any other mover within `r + o.r + 0.1` ahead (dot of relative position with velocity > 0), side-step 0.3 m/s toward the side with the larger free clearance (sample the grid 0.5 m left/right); stall detection: if progress toward the current waypoint over the last 0.5 s < 0.05 m, `blockedT += dt`; at 1.5 s re-plan (`replans++`); at 4.0 s teleport 0.5 m along the path (`teleports++`) and reset. Never allocates.
  - `overlapPenetration(a, b) → m` helper for tests.

**Step 1 — `test/nav.test.js` (write first, then implement):**
- grid dimensions for a 20×14 area with 2 m margin: `w = 44, h = 28`; the cell containing (0,0) is free; the cell at oven1's centre is blocked; the cell at counter1's first queue slot is free; entry cells at (−11, 3.5) have `lane 1`, exit cells at (−11, 4.8) have `lane 2`; a wall cell at (−10, 0) is blocked.
- `findPath` from (−9, 0) to (9, 0) on an empty floor returns a path whose length in cells ≤ 1.2 × the straight-line cell distance; with a 6-cell wall segment across the middle (block manually) the path goes around and no consecutive pair of cells cuts a blocked corner; from a fully enclosed cell returns 0.
- `nearestFree` of a blocked cell returns an adjacent free cell.
- mover: on an empty floor a mover reaches a target 8 m away in ≤ 8/speed + 0.5 s; two movers walking head-on along the same line pass each other without any overlap > 0.15 m (both use avoidance) and both arrive; a mover whose path is walled off after planning re-plans within 1.5 s and arrives.

**Step 2 — `test/nav-fullhouse.test.js` (verbatim; `test.skip` in Task 1, `test` in Task 2):**

```js
// test/nav-fullhouse.test.js — controller-authored acceptance test. 20 simulated minutes at full house; any jam fails.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, putOnCounter, refreshActive } from '../src/sim/world.js';
import { buildGrid } from '../src/sim/nav.js';
import { overlapPenetration } from '../src/sim/mover.js';
import { createCustomer, stepCustomers, SPECIES } from '../src/sim/customers.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
const DT = 1 / 30, MINUTES = 20, MAXC = 12;
function buildAll(w) { for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); } refreshActive(w); }
test('full house: 20 minutes, no stalls, no teleports, no overlaps, no leaked seats', () => {
  const w = createWorld(AREA1); buildAll(w); w.grid = buildGrid(AREA1, w);
  const price = (k, seated) => seated ? 8 : 5;
  const staff = [createStaff('runner', { x: 4, z: -3.5 }), createStaff('runner', { x: 0, z: -3.5 }), createStaff('cashier', { x: -5.5, z: -0.6 }), createStaff('cleaner', { x: -6, z: 4 })];
  const customers = []; let seq = 1, spawnT = 0;
  const stalls = [], overlaps = new Map(); let teleports = 0, served = 0;
  const lastPos = new Map();
  const t0 = Date.now();
  for (let t = 0; t < MINUTES * 60; t += DT) {
    for (const id of w.counters) { const st = w.stations.get(id); while (st.items.length < st.capacity) putOnCounter(w, id, st.items.length % 2 ? 'cupcake' : 'cookie', 1); }
    for (const st of w.stations.values()) if (st.type === 'bowl' && st.active) st.stock = st.capacity;
    spawnT -= DT;
    if (spawnT <= 0 && customers.length < MAXC) { spawnT = 1.5; customers.push(createCustomer(seq, SPECIES[seq % SPECIES.length], { shirt: seq % 5, hair: seq % 4, skin: seq % 3 }, AREA1)); seq++; }
    stepCustomers(customers, w, price, DT); stepStaff(staff, w, DT, () => {});
    const movers = [...customers.filter(c => !c.done).map(c => c.mover), ...staff.map(s => s.mover)];
    for (const m of movers) {
      teleports += m.teleports; m.teleports = 0;
      if (m.hasTarget) { const p = lastPos.get(m) || { x: m.x, z: m.z, t: t, d: Infinity }; const d = Math.hypot(m.tx - m.x, m.tz - m.z);
        if (d < p.d - 0.02) { p.d = d; p.t = t; } else if (t - p.t > 3) { stalls.push({ t: +t.toFixed(1), x: +m.x.toFixed(2), z: +m.z.toFixed(2), tx: m.tx, tz: m.tz, kind: m.kind }); p.t = t; }
        lastPos.set(m, p); } else lastPos.delete(m);
    }
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) { const pen = overlapPenetration(movers[i], movers[j]); const key = i * 64 + j;
      if (pen > 0.15) { overlaps.set(key, (overlaps.get(key) || 0) + DT); } else overlaps.delete(key);
      assert.ok((overlaps.get(key) || 0) <= 1.0, `overlap ${pen.toFixed(2)} m for >1 s at t=${t.toFixed(1)}`); }
    for (const e of w.events) if (e.type === 'pay') served++;
    w.events.length = 0;
    for (let i = customers.length - 1; i >= 0; i--) if (customers[i].done) customers.splice(i, 1);
  }
  for (const st of w.stations.values()) if (st.type === 'seat') assert.equal(st.occupied, false, `seat ${st.id} leaked`);
  assert.equal(teleports, 0, 'teleports happened');
  assert.deepEqual(stalls, [], 'stalls > 3 s: ' + JSON.stringify(stalls.slice(0, 5)));
  assert.ok(served > 400, 'throughput too low: ' + served);
  assert.ok(Date.now() - t0 < 25000, 'too slow: ' + (Date.now() - t0) + ' ms');
});
```

The test defines the contract for Task 2: customers and staff expose `.mover` (a mover from `mover.js`) with `kind`, `hasTarget`, `tx/tz`, `teleports`; `stepCustomers`/`stepStaff` drive them through the grid at `w.grid`; the bowl station has `stock/capacity`; `createStaff` supports `'cleaner'`.

**Step 3:** implement `nav.js` and `mover.js` until `test/nav.test.js` passes; keep the full-house test skipped; `npm test` green. Commit: `feat(sim): grid navigation, A*, movers, acceptance test`.

---

### Task 2: Everyone walks the grid

**Files:** Modify `src/sim/customers.js`, `src/sim/staff.js`, `src/sim/world.js` (`w.grid` built in `createWorld` and rebuilt in `refreshActive`), `src/systems/customers.js`, `src/systems/staff.js`, `src/render/pets.js` (follower unchanged), `tools/bot.js`, `test/customers.test.js`, `test/staff.test.js`, `test/integration.test.js` (replace push-out rules with the grid), `test/nav-fullhouse.test.js` (un-skip).

**Interfaces:**
- Customer record gains `mover` (`createMover(x, z, 0.30, CUSTOMER_SPEED)`, `kind: 'customer'`, `mask: 1` while entering, `2` while leaving); every walk (`enter`, queue slot, register slot, seat, bowl, leave) is `setTarget` + `stepMover`; `c.x/c.z/c.rot` mirror the mover each step. `separate()` and all push-out calls are deleted. Arrival tolerances: waypoint 0.12 m, final 0.05 m (from mover.js).
- Staff records gain `mover` (`r 0.30`, speed from `STAFF[kind].speed`, `kind`); runner, cashier, cleaner all walk the grid; a runner whose target counter fills up re-targets; a mover with no path idles at its spawn.
- Door lanes: entering customers get `mask 1`, leaving `mask 2`; staff `mask 0`.
- `w.grid` rebuilt in `refreshActive` (stations change); movers re-plan on the next step after a rebuild (`grid.version` compared to `m.gridVersion`).
- Systems: render positions come from the sim records as now; pets follow humans; no collision code remains in `src/systems/customers.js` or `src/systems/staff.js`.
- Bot: uses the same mover for its owner (mask 0) so its routes are realistic.

**Tests:** existing suites updated to the grid; `nav-fullhouse` un-skipped and green; `integration.test.js` reduced to a 3-minute version of the same invariants with the M2 layout still (it moves to the new layout in Task 3).

Commit: `feat(sim): customers and staff walk the grid; jam acceptance test green`.

---

### Task 3: New layout, wish bubbles, patience, manned register, lost sales

**Files:** Modify `data/area1.js` (layout table above), `src/sim/world.js` (types `register`, `bowl`, `bush`, `coffee`, `storage`, `blender`; `w.registers`), `src/sim/customers.js`, `src/sim/economy.js`, `src/systems/*`, `src/render/props.js` (`registerMesh`, `bowlMesh`, `bushMesh(stage)`, `coffeeMesh`, `storageMesh`, `blenderMesh`), `src/ui/hud.js`/`style.css` (DOM bubbles), tests.

**Interfaces:**
- `economy.js`: `PRODUCTS` gains `coffee: { price: 16, make: 2.5, color: '#6B4A2B' }`, `smoothie` price 32 `make 2.0`, `treat: { price: 10, color: '#C97A3A' }`; `wishFor(rng, w) → { product, treat: bool }` weights: available products equally; treat with probability 0.5 when a bowl is active.
- Customer flow: `enter → queue(counter with the wished product; if none stocks it, the least-loaded counter) → take (or wait with patience 12 s, then `angry` + leave) → [bowl queue if `treat`] → register queue (6 slots in front of the least-loaded active register) → wait until processed (`processed` event) → seat or leave`. Patience applies at the counter and at the register (12 s each; a register with nobody serving drains it).
- Register processing: `w.registers[i].serving` is set by the systems layer when the owner stands in the register's front circle (r 1.2) or a cashier stands at its work spot; `stepRegisters(w, dt)`: for each register with `serving`, process the head customer every `rate` seconds (owner 0.6, cashier `1.0 / level`), creating the `pay` event and a cash pile at the register. The owner collecting the pile is unchanged.
- Events: `wish` (`id, product, treat`), `patience` (`id, value` throttled to 4/s for the bar), `lost` (`id, reason`), `processed` (`id, amount`).
- Render: wish bubble = DOM element above the head (projected) with a product colour chip and, for treat, a bone icon (SVG); patience bar under the bubble; lost sale = red "−" floater and an angry stomp (`hop` negative); register: cash bubble icon on waiting customers; the owner at the register: arms animate a "tap" each processing.
- `jobs.js` (pure): `pendingJobs(w, G) → { registerWaiting, emptyDisplayWithWaiting, dirtyTables (0 until Task 4), sacksEmpty, ripeBushes, next }` and `busy(w, G) → bool` (≥ 2 pending).

**Tests:** wish selection weights; patience drains only when waiting; angry leave after 12 s at an empty counter or an unmanned register; register processes one per 0.6 s with the owner present and none without; two registers split the queue; the full-house test still green on the new layout (it stocks bowls); every zone disc and slot lies on a free cell (layout test).

Commit: `feat: wish bubbles, patience, manned register, lost sales, new layout`.

---

### Task 4: Chains — coffee, garden, blender, treat bowl, dirty tables, cleaner

**Files:** Modify `src/sim/world.js`, `src/sim/staff.js`, `src/sim/economy.js`, `src/systems/*`, `src/render/props.js`, `src/render/human.js` (sack carry pose), tests.

**Interfaces:**
- Coffee machine: `{ beans: 20, stock, buffer 8, timer }`, makes one coffee per 2.5 s while `beans > 0`, consuming one bean per cup; the owner or a runner takes cups like oven items; when `beans === 0` the machine flashes (demand counter coral) — refill by carrying a `beans` sack from `storage1`: standing at storage with an empty carry takes a sack (`items = ['sack:beans']`, carry full); standing at the coffee machine with the sack refills 20 and empties the carry.
- Storage: infinite sacks of `beans` and `kibble`; taking alternates by what is emptiest (or the sheet lets the player choose; M3: automatic by need).
- Garden: bushes have `stage 0..3`, growing one stage per 25/3 s; the owner (or a runner with the garden upgrade, out of scope) walking through a stage-3 bush harvests 3 `fruit` onto the carry and resets the stage; the blender accepts fruit like an oven accepts nothing — the owner drops fruit at the blender (`fruit` buffer 9), it makes one smoothie per 2.0 s per fruit into its stock; smoothies go to counters.
- Treat bowl: `{ stock, capacity 10 }`; a customer with `treat` takes 1; refilled by a `kibble` sack (+10 per sack, sack empties over two bowls? No: one sack = 20 kibble, bowl capacity 10, the sack keeps its remainder on the carry until empty).
- Dirty tables: after `eating`, `seat.dirty = true`; a dirty seat is not free; cleaned by the owner standing in its front circle for 1.0 s or by a cleaner (1.6 s / level); event `cleaned`. Render: a plate + crumbs prop toggled by `dirty`; a sparkle burst on clean.
- Staff: `cleaner` kind (cost 700, speed 2.2, `every` n/a) walks to the nearest dirty seat and cleans; runners also service the coffee machine → counters; a runner at level 2 carries 9.
- `jobs.js` extended with dirty tables, empty machines, ripe bushes.

**Tests:** coffee consumes beans and stops at 0; a sack refill restores 20; bushes grow and harvest 3 fruit; blender turns fruit into smoothies at 2.0 s; bowl decrements per treat customer and refills from kibble; a seat becomes dirty after eating and free after cleaning; the cleaner cleans within 10 s of a table dirtying; full-house test extended: stock the coffee machine and bowls, keep the cleaner, still green.

Commit: `feat: coffee, garden and blender chains, treat bowl, dirty tables, cleaner`.

---

### Task 5: Readability and the upgrade panel

**Files:** Modify `src/ui/hud.js`, `src/ui/sheets.js`, `src/style.css`, `src/systems/zones.js`, `src/systems/visuals.js`, `src/render/props.js` (build outline), `src/render/fx.js` (cash bills), `index.html`.

**Interfaces:**
- Demand counters: a DOM label `n/cap` above every counter, machine, bowl and bush (projected each frame, text updated on change), cream normally, coral when empty, pulsing coral when a customer is waiting for that station.
- Objective arrow: a 3D chevron above the most urgent job from `jobs.js` (`next`), bobbing, with a one-word DOM caption (`Register`, `Restock`, `Clean`, `Refill`, `Harvest`, `Build`).
- Build spots: the purple disc becomes a dashed floor outline the size of the footprint (a thin merged mesh of dashes) with a price bubble (coin icon + number); paying makes cash bills (DOM `.fbill`) fly from the wallet to the outline.
- Upgrade panel: tabs `Player | Workers | Machines`; Player: Speed, Carry, Income (existing); Workers: for each kind, HIRE (count/cap) and Speed/Carry level buttons; Machines: Oven speed, Coffee speed, Display capacity (each 3 tiers). Costs in `economy.js` (`MACHINE_UPGRADES`, `WORKER_UPGRADES` with tiers 200/500/1200 scaled ×1.5 per row). Opens from the kiosk as now; the hire desk opens the same panel on the Workers tab.
- MAX tags on maxed rows; the crowd pill shows waiting-count in coral when any customer's patience < 4 s.

**Check:** a 3-minute headless play strip (12 frames at 15 s, 450×800) with the bot's route driven through `setMove`; the controller inspects the strip.

Commit: `feat(ui): demand counters, objective arrow, build outlines, upgrade panel with tabs`.

---

### Task 6: Balance to the busy index and cadence; play strip; deploy

**Files:** Modify `tools/bot.js`, `data/area1.js` (prices within bounds), `src/sim/economy.js`; add `tools/strip.js`.

- Bot: the owner mover does the most urgent job from `jobs.js`, hires/upgrades when affordable at the right desks; reports per zone unlock times, `busyIndex` (fraction of seconds in minutes 1..10 with ≥ 2 pending jobs), `angryRate` (lost sales per 100 customers), teleports/stalls (must be 0). Targets: first unlock ≤ 45 s; a new unlock or upgrade affordable every 30–60 s through minute 10; busy index 0.6–0.8; angry rate 5–15 % (some pressure, not punishment); gate 12–16 min. Levers and bounds are listed in the task brief at dispatch (prices ±40 %, spawn 2.4–3.2 s, patience 10–14 s, processing 0.5–0.7 s).
- `tools/strip.js`: builds, previews, drives the owner via the bot's decision function through `window.__game.setMove`, captures 12 frames, tiles them into `shots/strip.png` (2 rows × 6, 225×400 each) for the controller's review.
- Deploy to the demo repo as before.

Commit: `balance: busy index and cadence targets; play strip; milestone 3 build`.

---

## Milestone 3 exit criteria

- `npm test` green including `nav-fullhouse` (0 stalls, 0 teleports, 0 overlaps, 0 leaked seats, > 400 served in 20 minutes).
- The bot reports busy index 0.6–0.8, cadence 30–60 s, angry rate 5–15 %, gate 12–16 min, 0 stalls.
- The play strip shows wish bubbles, patience bars, demand counters, the arrow, a manned register with a queue, a dirty table being cleaned, a bean sack carried, a harvest.
- Demo redeployed; the user playtests.
