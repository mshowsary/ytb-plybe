# Pet Café Tycoon — handoff

A three.js YouTube Playable (publisher: MediaCube). The player runs a pet café: bake, stock the
counters, serve at the till, wipe tables, hire staff, buy the next part of the café, collect pets in
the Pet Book. Live build: https://mshowsary.github.io/ytb-plybe/ (GitHub Pages serves `dist/` from
the `chatgpt/pet-cafe-production` branch).

The owner is not a game developer. Apply real game-design judgment rather than transcribing their
words. Their standing rules: **simple**, **coherent** (every object says what it is, every cause
shows its effect), **never punishing** (no fines, no pressure), **pictures not words** in the play
field, **pets are the hook**, and ads are opt-in rewards that never gate anything.

## How to work on it (please read)

- **Do not run long test suites or browser "smoke" tools.** They take hours on this machine, peg the
  CPU, and have repeatedly cost days for no change in the game. They are not in this bundle.
- Make small, targeted changes. Explain what you changed and why in plain language.
- The owner tests by playing: `npm install`, then `npm run dev` (Vite dev server), or
  `npm run build` and open the result. Add `?dev=1` to the URL for a dev panel (skip days, add coins,
  build next zone).
- To ship: `npm run build`, commit `dist/` with the source, push to `chatgpt/pet-cafe-production`.
- Saves must keep loading. If you remove a zone or station, add it to `RETIRED_ZONES` in
  `src/sim/save.js` so old saves are refunded rather than broken.
- No `Math.random()` inside `src/sim/` (the simulation is deterministic).

## Map of the code

| path | what it is |
|---|---|
| `data/area1.js` | the café layout: every station (position, size, type) and every buyable zone (price, what it adds, what it requires) |
| `data/decor.js`, `data/accessories.js` | décor catalogue and pet outfits |
| `src/main.js` | boot, frame loop, platform (YouTube Playables SDK) wiring |
| `src/game.js` | creates the game object `G`, wires every system, the per-frame `update`, save snapshot/restore, the day summary |
| `src/sim/` | pure simulation, no DOM/three.js: `world.js` (stations, machines, zones), `customers.js` (guest state machine, seating, queues), `staff.js`, `economy.js` + `economyConfig.js` (all prices and tunables), `day.js`, `pawRating.js` (Café Stars engine), `dailyGoal.js`, `petBook.js`, `petArrivals.js`, `petPose.js` (photos at tables), `adPacing.js` + `rewards.js` (ad caps, daily gift), `save.js` + `saveSchema.js`, `nav.js` + `mover.js` + `ownerReach.js` (pathfinding/collision), `supplies.js`, `carry.js` |
| `src/systems/` | glue between sim and screen: `party.js` (jukebox + Pet Party offer), `stations.js` (owner movement + every station interaction), `customers.js`, `staff.js`, `zones.js` (build pads), `visuals.js` (station meshes, need bubbles, signs), `offers.js` (rewarded offers in the world), `firstLook.js` (one-time tutorials), `objective.js` (guidance arrow/trail), `starRewards.js`, `photo.js`, `residentPets.js`, `rewardsSystem.js` (daily gift, golden hour) |
| `src/ui/` | DOM UI: `hud.js` (wallet), `pauseMenu.js` (the Café card), `shop.js` + `sheets.js` (the Shop), `meta.js` (Pet Book), `pawSheet.js` (Café Stars), `daySummary.js`, `moments.js` (one queue for banners/toasts/reveals), `modal.js` (every sheet pauses the game), `labelLayout.js` (arbiter for all world-anchored labels), `icons.js` |
| `src/render/` | three.js: `scene.js` (fixed camera), `props.js` (all procedural station/furniture meshes), `environment.js` (lawn, garden, play yard, streets), `geo.js` (mesh/merge helpers), `human.js`, `pets.js`, `post.js`, `daylight.js`, `fx.js` |
| `src/platform/` | YouTube Playables SDK wrapper (pause/resume, audio gating, ads, cloud save). Already compliant — change with care |
| `docs/SHIP-PLAN-2026-09-19.md` | the design contract for the current ship: what was cut, why, and the intended design of every area |

## State of the game (2026-09-22)

Shipped in the last two days: the pet spa removed (saves refunded); the terrace is a self-serve
**Ice cream garden** with its own street entrance and guests; **photos of pets at their tables** and
a photo wall; **one-page menu** (Pet Book · Shop · Café Stars); no RETURN crates, no pantry menu, no
upgrade kiosk (hands auto-return, the pantry hands you a sack); blender moved beside the fruit
bushes; **Café Stars** with real rewards; pets arrive as the café grows; one daily goal; a café that
is already working at t=0; **four rewarded offers in the world** (special guest at the door, helper
pup in a rush, build boost on a half-paid pad, double-your-day at closing) plus a free daily gift;
**First Look** one-time tutorials; pictogram signs on every station; frame budget met.

Added 2026-09-22: a **jukebox** by the door (`systems/party.js`) whose ▶ ♫ ×2 badge offers a rewarded
60-second **Pet Party** (double sales, party music, confetti) when guests are in, twice a day; a
**grand opening** when the last plot is bought (`game.js grandOpening`); First Look lessons only
appear when their subject is on screen or the player has stood still 3.5 s; a wider landscape camera
and a portrait camera that looks ahead of the owner.

Not yet verified by a human playing it: everything above. The owner should play days 1–10 and report
what feels wrong. Known soft spots: guests still queue a while when the owner is busy (one person
also works the garden); the late game after ~day 13 relies on café themes, stars and the Pet Book
rather than new rooms; ★5 needs 10 "perfect" photos, which only a human tap can earn.
