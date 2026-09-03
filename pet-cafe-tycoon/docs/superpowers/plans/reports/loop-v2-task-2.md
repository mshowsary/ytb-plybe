# Loop v2 Task 2 — Clarity and onboarding — report

Branch `loop-v2`, starting HEAD `073a745`. All work done directly (no subagents), per instruction.

## What changed, per file

### Chalkboards
- **`src/render/props.js`** — new `chalkboardMesh()` (post + small dark board, merged), replacing the removed `gateMesh()`.
- **`src/systems/visuals.js`** — `chalkInfo(st)` maps every non-seat station type (+ product, for oven/display) to a `{ label, icon }` pair using the exact names from the task brief (`OVEN · cookies`, `COFFEE BAR`, `RETURN`, `STAFF`, …) and the new icon set. The board mesh is added as a **child** of the station's own render group `g`, in local (front-left-corner) coordinates, so it inherits `g`'s build pop-in, rotation and active/visible state for free — no separate lifecycle bookkeeping needed. The DOM label (`.chalk`, icon + text set once) is projected from a precomputed world position every frame, hidden off-screen or while the station is inactive, exactly like the existing demand counters. `CHALK_Y` (1.05) sits well below every `DEMAND_Y` (1.55–2.3) and the board is horizontally offset to the front-left corner, so the two never collide — confirmed visually in the strip (see below).
- **`src/ui/icons.js`** — added `coinIcon`, `sackIcon`, `returnIcon`, `leafIcon`, `gearIcon`, `personIcon` (the bone/treat icon already existed as `treatIcon`).

### First-approach hints
- **`src/systems/stations.js`** — `FIRST_HINT` (station type → one-line text, exactly the eleven lines in the brief; coffee has no entry, matching the brief's list) and `noteFirstHint(type, active)`, which fires into a new shared `ctx.firstHint` mailbox the first time `G.hintsSeen` (a `Set`, new field on `G`) doesn't already have that type. Wired into every station-type branch of the per-frame loop (oven/coffee/blender, display, checkout, pantry, return, bowl, bush, seat, and the new kiosk/hire branch), reusing each branch's existing dwell/proximity check rather than adding a second one.
- **`src/systems/zones.js`** — the only `hud.hint()` caller; now reads `ctx.firstHint` each frame and gives it top priority over the existing chain/override hints. Replaced "Bring the treats to the **counter**" → "…**display**" and "Refill the coffee machine from **storage**" → "…**pantry**" (the only two remaining "counter"/"storage" hint strings). `src/ui/models.js`'s runner description ("…to the counters") fixed the same way.

### Intro
- **`src/systems/intro.js`** (new) — `G.intro` (`step`, `active`, `target`); `step === undefined` → step 0 (fresh game). Five steps exactly as specified (bake/oven1 → stock/dispCookie → serve/register1 → collect/register1.cash → build/zones[0]), each with its own completion check read from live state (owner holds a cookie / display stock ≥ 1 / a `processed` event this frame / `G.coins > 0` / the zone is built). A `SKIP` pill (`.skipPill`, appended to `<body>`) shows from step ≥ 3, tapping it jumps straight to step 5.
- **`src/systems/objective.js`** — while `G.intro.active`, the chevron/caption is forced to `G.intro.target` every frame (no throttle) instead of `jobTarget()`; added `bake`/`stock`/`serve`/`collect` to the `CAPTION` map (`build` already existed).
- **`src/systems/customers.js`** — spawn cap `Math.min(maxC, 2)` while `G.intro.active && step < 3`.
- **`src/game.js`** — creates `intro`, calls `intro.update(dt)` **after** `staff.update` (so it sees this frame's `processed` event from `stepRegisters`) and **before** `visuals`/`objective`; `G.hintsSeen`/`G.intro` seeded; `intro` included in `snapshot()`.
- **`src/sim/save.js`** — `applySave` now restores `state.intro` (`{}` for a save with no `intro` field, e.g. an M3 save — replays the intro once, same as a genuinely fresh game).

### Floating buttons
- **`src/systems/stations.js`** — a single reusable `.fbtn` DOM button; a new kiosk/hire branch in the per-frame loop sets it to whichever station the owner is standing in front of (plain proximity, not the dwell timer — matches the design's "stand in front of" wording) and the panel isn't open; hidden the instant neither is true. Tapping it opens the kiosk sheet on the Player (kiosk) or Workers (hire) tab. The temporary HUD `#upgradesBtn` wiring, and the button itself, are gone (`index.html`, `src/ui/hud.js`, `src/style.css`).
- **`src/core/input.js`** — `.fbtn` added to `isUi`'s `closest()` exclusions (it's already a `<button>`, so this is a belt-and-suspenders match per the task brief, not a behaviour change).
- **`tools/strip.js`** — Phase 2 (`panel-portrait.png`, not part of `--cold`) updated to walk to `hire1.front` and click `.fbtn` instead of the removed `#upgradesBtn`.

### Pantry popup
- **`src/ui/sheets.js`** — `renderPantry` now renders both buttons unconditionally (Kibble `disabled` when `!model.kibble`, was previously omitted outright), each with a `sackIcon()` + label, using the existing `.sheet`/chevron-close shell (`shell()` already gives `'pantry'` the `.sheet` class).

### Runner assignment picker
- **`src/ui/models.js`** — `buildWorkerRows` now also returns, for the runner row only, `displays` (every active display's `{id, product}`) and `runners` (one entry per hired runner, in `G.staffList` order, carrying its current `assign`).
- **`src/ui/sheets.js`** — `renderRunnerChips` draws one icon chip per active display under each hired runner (label "Runner N" only when there's more than one), current `assign` highlighted (`.chip.active`).
- **`src/systems/stations.js`** — `doAssignRunner(index, displayId)` sets that one runner's `s.assign`, wired into `sheetActions`.

### Gate cleanup
- Removed the dead `gateMesh()` (`props.js`), its `MESH_FOR.gate` entry and import (`visuals.js`), and the `z_gate`/`gate1`-triggered `gateOpening` logic and the terrace "end" card trigger (`zones.js`) — none of it was reachable any more (`gate1`/`z_gate` don't exist in `data/area1.js` since Task 1). Confirmed no gate mesh or data remains anywhere in the live game path (`props.js`, `visuals.js`, `world.js`, `data/area1.js`, `zones.js`); the east fence loop in `props.js` was already unconditional/continuous and needed no change. `tools/shot.js` still references the old `z_gate`/`z_counter2` chain — pre-existing staleness from Task 1 (flagged in that report), out of this task's file list, left untouched.

### CSS
`src/style.css` — `.chalk`/`.chalkIcon` (chalkboard label), `.fbtn` (floating button), `.skipPill` (intro skip), `.sicon` (inline icon inside a `.sbtn`), `.chiprow`/`.chip` (runner picker); removed `#upgradesBtn`.

## Verify
- `npm test`: 164/164 pass (ran once).
- `npm run build`: `postbuild OK: 4 files, 667 KB total`.
- `node tools/strip.js --cold`: produced `shots/strip-cold.png` (12 frames, 450×800 each, 2×6 tile).

## Strip description (frames 1–4, `shots/strip-cold.png`)
Cropped each tile individually for inspection (via a scratch script, not committed).

- **Frame 1 (t=15s):** objective caption **"Stock"** (chevron over the cookie display) — meaning the "bake" step (0) already completed inside the first 15s. The first-approach hint **"Stand here to take cookies"** (the oven hint) is showing at the bottom, confirming `noteFirstHint` fired earlier in that same window and its 4s window is still up. Chalkboards "RETURN" (down-arrow) and "OVEN · co…" (truncated "cookies") are both legible.
- **Frame 2 (t=30s):** objective caption **"Build"**, arrow/price bubble on `z_seats1` (65 coins) — steps 1 (stock), 2 (serve) and 3 (collect) all completed between 15s and 30s (a single owner with only 2 customers capped and short in-café travel distances clears each of those very quickly — no exploration, no competition). The **SKIP** pill is now visible (step ≥ 3), and stays visible every frame after. "REGISTER" and "RETURN" chalkboards legible.
- **Frames 3–4 (t=45s, 60s):** caption stays **"Build"** — expected and correct: with `--cold` forcing `G.coins = 0` on every driven tick, `z_seats1` (65 coins) can never actually be paid off, so step 4's own completion condition (`world.built.has(zones[0].id)`) never fires and the intro is genuinely stuck at "Build" for the rest of the run, same as every other zone in this mode. "COOKIES", "REGISTER", "RETURN" chalkboards all legible and clearly separated from the display's demand counter (which shows "0/8" in coral, well above and to the right of the chalkboard's front-left position).

**Honest gap vs. the task brief's literal wording:** only two of the five verbs ("Stock", then "Build") actually land on the four 15s-interval screenshots — "Bake", "Serve" and "Collect" each complete faster than 15 real seconds in this small, uncontested café (event-gated, not time-gated, steps — there's nothing to tune without changing the design), so they're never caught between two samples. This isn't a bug: the code path for all five steps is exercised and correct (confirmed by "Stock" appearing at all, which requires step 0's completion; "Build" persisting, which requires steps 1–3 all completing; the SKIP pill's step ≥ 3 gating firing exactly on schedule), it's a mismatch between the brief's assumed pacing and how fast a single competent bot actually clears the first three steps in a --cold economy.

Chalkboards are readable at 450px width in every frame they appear in ("RETURN", "REGISTER", "COOKIES", "OVEN · cookies"); no overlap with any demand counter was observed. **The floating `.fbtn` button never appears in this run** — the bot's priority chain (`botDecide.js`) has no notion of "open the kiosk panel," it only walks toward chores/hires/zones, and with coins permanently forced to 0 nothing near the kiosk (x=9, far east, never visited by the camera in any of the 12 frames) or the never-built hire desk is ever a target, so the owner genuinely never dwells there in this 3-minute run.

## Concerns
1. **Intro verb sampling gap**, as described above — cosmetic/reporting only, not a functional defect (see the honest-gap note).
2. **`.fbtn` unverified by the strip** — the floating-button code path (position/show/hide/click) was verified by reading, and exercised end-to-end by `tools/strip.js`'s (fixed) Phase 2 `panel-portrait.png` staged shot, but that phase only runs in warm mode and wasn't executed as part of this task's required verification (`--cold` only, per instruction). Confidence is code-review-level, not screenshot-level, for the actual click/open behaviour.
3. **`tools/shot.js`** still references the old 13-zone chain (`z_counter2`/`z_kiosk`/`z_gate`) — pre-existing from Task 1, not touched (out of this task's file list).

## Bot table
Not re-run (Task 2 doesn't touch sim/economy files `tools/bot.js` measures — `npm run bot` untouched from Task 1's numbers).
