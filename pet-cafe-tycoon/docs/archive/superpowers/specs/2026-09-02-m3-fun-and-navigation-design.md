# Pet Café Tycoon — Milestone 3 design: navigation that works and a loop with tension

Date: 2026-09-02. Status: proposed after the user's Milestone 2 playtest. Supersedes the order of the original milestone plan: this comes before the platform layer.

## Why this milestone exists

The playtest showed two failures. Characters jam (seating exits pile up, a pair spins in the doorway, the runner freezes behind a counter) because movement is straight-line steering with collision push-out and no notion of going around. And the loop is boring: the only bottleneck is baking, so the player fills the counter and waits. Reference: a My-Mini-Mart-style Playable where the player is the bottleneck four ways at once and every station shows what it needs.

## Part A — Navigation (correctness first)

- **Walkable grid** over each area at 0.5 m cells (area 1: 32 × 24). Cells inside station footprints (plus a 0.25 m margin) are blocked; the door cell column is a lane. Built at `createWorld` and rebuilt in `refreshActive`.
- **A\*** on the grid with 8-connectivity and corner-cutting forbidden. Every mover (owner excluded, customers, pets are followers, staff) has `path: [cells]` computed when its target changes or when blocked for more than 0.5 s; movers follow the path with the existing `moveToward` on successive waypoints. Paths cache by `(fromCell, toCell)` for one frame so a queue of six moving to the same slot costs one search.
- **Reserved cells**: queue slots, seat spots, checkout spots and staff work spots are reserved targets; a mover only targets a spot it holds. Slots are laid out so no slot lies inside another footprint (tests enforce this for every area).
- **Local avoidance** replaces `separate()`: movers on a path treat other movers within 0.5 m as soft obstacles (side-step 0.3 m to the free side); a mover blocked for 1.5 s re-plans; after 4 s it teleports 0.5 m toward its target along the path (last resort, logged as a stat so the bot can count it — target 0 per 10 minutes).
- **Door**: an entry lane and an exit lane (two adjacent columns), leaving customers use the exit lane; both are one-directional in the grid.
- **Acceptance (all automated, no three.js):** the full-house test runs 20 simulated minutes at 12 customers with all builds active, staff hired, tables used; it fails if any mover's progress toward its target stalls for more than 3 s, if any teleport happens, if any two movers overlap by more than 0.15 m for more than 1 s, or if any seat stays occupied after its pair left. The bot reports these counts every run and `npm test` includes the test.

## Part B — The loop: "busy hands"

The player must always have two or three competing demands. Concretely:

1. **Wish bubbles.** Each customer wants a specific product (bubble with a 3D icon above the head). Products available depend on what is built. If the display has it, they take it; if not, they wait with a **patience bar** that drains in 12 s, then leave angry (a visible lost sale: red "−" floater and an angry-count stat). Pets want a **pet treat** from a treat bowl station (a separate stock the player fills from a kibble sack).
2. **Manned register.** Money is only taken when the owner (or a cashier) is standing at the register. Customers queue at the register with a small cash bubble; the owner walking into the register zone rings them up one per 0.6 s (satisfying "cha-ching" and cash fly). This is the tension that makes the cashier hire matter.
3. **Several production chains with different rhythms:**
   - Oven: cookies (start), cupcakes (oven 2).
   - Coffee machine: fills cups slowly from a bean sack the player refills (sack empties every 20 cups; refill by walking a sack from the storeroom).
   - Blender: smoothies need fruit from a garden plot outside (3 bushes, harvest by walking through when ripe, 25 s regrow).
   - Treat bowl for pets: kibble from a sack.
4. **Dirty tables.** After a pair eats, the table is dirty (plate and crumbs); it cannot be used until cleaned (owner walks through, 1 s, or a hired cleaner).
5. **Demand counters** on every station: `n/cap` DOM labels like the reference, turning coral when empty and pulsing when customers are waiting for it.
6. **Objective arrow**: a floating arrow points at the most urgent job (register queue > empty display with waiting customers > dirty table > next build); a small text under it.
7. **Staff with levels**: shelver (oven → display, later coffee → display), cashier, cleaner; each has Speed and Carry levels bought in a tabbed panel (Player / Workers / Machines) like the reference. Workers use the grid; no more stuck workers.
8. **Unlock cadence**: a new build or upgrade becomes affordable every 30–60 s for the first 10 minutes, measured by the bot. The bot also reports a **busy index**: the fraction of simulated time in which at least two jobs are pending; target 60–80 % between minute 1 and minute 10.

## Part C — Readability and juice (what the reference does that we do not)

- Dashed build outline on the floor with a price bubble (icon + number), not a purple disc.
- Cost drains as cash bills flying from the wallet into the outline.
- Wish bubbles, patience bars, demand counters, objective arrow, "MAX" tags on maxed stations.
- Register cha-ching, cash spray, customer happy bounce on purchase, angry stomp on leaving.

## Out of scope for this milestone

Save/load, pause, ads, i18n, area 2. They come after the loop is proven fun by the bot's busy index and by the user's playtest.

## Process for this milestone

- The controller writes the grid/navigation acceptance test and the bot's busy-index metric first; workers implement against them.
- Interaction code is reviewed by a reviewer and by the automated full-house test, never by screenshots alone.
- Visual tasks are judged by the controller from a headless 3-minute play strip (12 screenshots at 15 s intervals), not from a single frame.
- Tasks: (1) grid + A\* + acceptance test; (2) movers on the grid (customers, staff, followers) + door lanes + full-house test green; (3) wish bubbles, patience, manned register, lost sales; (4) chains: coffee, garden, blender, treat bowl, dirty tables, cleaner; (5) demand counters, objective arrow, build outlines, upgrade panel with tabs; (6) balance with the bot to the cadence and busy-index targets; play strip; deploy.

## Shipped numbers after balance pass 2 (2026-09-03)

Products: cookie 24, cupcake 40, coffee 32, smoothie 64, treat 20 (order size 1–3 by customer id). Seated tip ×2.0. Patience 16 s at counters, bowls and registers (18 s broke the full-house acceptance test in 14 sweeps); a customer settles for any stocked product after 6 s of waiting, and gives up a treat after 6 s at an empty bowl. Spawn 3.5 s and at most 8 customers until the hire desk is built, then the tuned formulas (cap 10). Register: owner 0.6 s per customer, cashier 1.0 s at level 1. Hire costs: runner 500 / 1250, cashier 750, cleaner 350. Zone chain: counter2 60 → tables 65 → oven2 75 → register2 90 → coffee 110 → hire desk 130 → garden 220 → treat bowl 300 → blender 400 → counter3 640 → upgrades 850 → more tables 1120 → terrace gate 1500.

Bot metrics at this balance: first build 32 s, terrace gate 13.2 min, lost sales 8.5 %, longest purchase gap 100 s (target 60), zero stalls or teleports. The "busy index" as first defined (≥ 1 urgent category pending) reads 0.98 because a display lacking one wished product counts even while settle-for handles it; the next pass replaces it with a friction index (share of customers who waited more than 6 s, target 30–60 %).
