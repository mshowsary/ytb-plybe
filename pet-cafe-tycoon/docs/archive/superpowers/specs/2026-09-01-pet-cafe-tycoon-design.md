# Pet Café Tycoon — design

Date: 2026-09-01. Status: approved in chat (lane: low-poly 3D tycoon; theme: pet café; stack: Three.js + Vite, no WASM; visuals first, tests last).

## Goal

A premium-looking, asset-free 3D tycoon for YouTube Playables, published through Mediacube (MC Play), that
passes YouTube certification on the first pass and monetizes through voluntary rewarded ads plus late,
spaced interstitials. It must look as good as the category leaders (My Mini Mart, Pizza Ready, Hypermarket 3D)
in a side-by-side screenshot and load to interactive in under 3 seconds on a mid-range phone.

## Non-goals (v1)

- Multiplayer, leaderboards beyond YouTube's single score, sign-in, or any personal data.
- Rigged or skinned characters, imported textures, or any downloaded asset. Everything is procedural.
- Playgama or other stores. One platform layer (ytgame) plus a standalone mock for local preview.
- A third area, seasonal events, or a gacha. These are v1.1+ candidates.

## Player experience

You are the owner of a small café for animals. Customers (blocky cats, dogs, bunnies, hamsters, pandas,
foxes) walk in from the street, queue at the display counter, take a treat, pay at the checkout, then sit
on the terrace and eat. You bake treats at the oven, carry a wobbling stack on your head, restock the
counter, collect the cash pile, and spend it on glowing build circles that pop new stations into the world.
Everything you do gives immediate physical feedback: stacks bounce, cash flies, buildings squash in, pets
hop with hearts. A session is a chain of small purchases leading to a big one (the terrace gate), then
the same rhythm again in the second area.

### First-session targets (tuned by the headless bot, see Verification)

| Moment | Target time |
|---|---|
| First treat carried to the counter | 15 s |
| First cash collected | 30 s |
| First build completed (second counter) | 60 s |
| First staff hired | 3 min |
| Area 2 (terrace) gate opened | 6 to 8 min |
| All v1 builds done | 45 to 60 min of active play |

## Core loop

### Controls
- Touch: floating joystick. Touch anywhere on the game view to spawn the joystick base at that point; drag
  to move; release to stop. Deadzone 8 px, full speed at 48 px.
- Mouse: same as touch (drag anywhere).
- Keyboard: WASD / arrows move. Esc opens pause or closes the open modal. Space or Enter confirms modal
  primary buttons. Esc is never `preventDefault`ed.
- The player never taps world objects. Every interaction is "walk into it", so the whole game works with
  one input mode and no aiming.

### Player character
- Blocky owner: rounded box body, box head, apron, chef hat (default cosmetic). Speed 4.6 m/s base (ruled 2026-09-02; 3.6 felt slow).
- Carry stack in front at chest height with both arms forward (ruled 2026-09-02; never on the head): up to `carry` items (base 6), each item a small box with a color per product. Stack
  sways with velocity (lag spring per item), bounces on add/remove.

### Stations (interaction volumes on the floor grid)
| Station | Player action | Output |
|---|---|---|
| Oven | Stand adjacent, auto-takes 1 item every 0.35 s while oven has stock | Oven produces 1 item per `bakeTime` (base 1.2 s) up to buffer 12 |
| Display counter | Stand adjacent with items, drops 1 item every 0.15 s onto the counter (capacity 12 base) | Customers take from here |
| Checkout | Cash pile grows as customers pay; walking through the pile collects it (flies to HUD wallet) | Coins |
| Seating (terrace tables) | None | Customers sit 4 s then leave with a heart burst; +tip bonus 60 % |
| Grooming station (area 2) | Player stands to groom a waiting pet (progress ring 2 s) | Premium coins (gems) 1 per groom, cap 5 per hour |
| Play zone (area 2) | None | Raises customer spawn rate +25 % |
| Upgrade kiosk | Stand adjacent opens the upgrade sheet | Speed, carry, income (3 tiers each) |
| Hire desk | Stand adjacent opens hire sheet | Runner (carries oven → counter), Cashier (auto-collect) |

### Customers
- Spawn from the street door every `spawnInterval` (base 3.2 s, −0.4 s per seating build, floor 1.2 s), up to `maxCustomers` (base 6, +2
  per seating build, cap 12). Customers are humans walking a pet on a leash (decision 2026-09-02); the human queues and pays, the pet eats. Pet type chosen weighted; VIP pets (cosmetic unlock) 10 % once owned.
- State machine: enter → queue slot (line in front of counter, 0.85 m spacing, 6 slots, rebalanced to the shortest counter) → take 1–2 items (if counter empty,
  wait with a "…" bubble; after 15 s leave angry, no pay) → walk to the least-loaded checkout → pay (`price` × multipliers) →
  if a free seat exists sit and eat 4 s, else exit → exit.
- Movement: straight-line steering to station front points with circle-vs-box push-out against station footprints and an arrival tolerance of 0.35 m at seats (ruled 2026-09-02: this replaces the waypoint graph). Customers repel each other with a soft radius 0.6 m.

### Build zones
- A build zone is a floor disc (radius 1.1 m) with a price label and a ghost outline of what it builds.
- While the player stands inside and has coins, coins drain at `max(50, price/2) per second` in visual
  chunks (coin sprites fly from the HUD to the disc), a ring fills, and at 100 % the building pops in
  (scale 0 → 1.15 → 1.0 over 0.5 s) with a dust puff and a chime. Partial payment persists in the save.
- Build order is a directed list per area; a zone appears only when its prerequisite is built.

### Area 1 — Café (8 builds, in unlock order)
1. Display counter 2 (price 60)
2. Seating: 2 tables (90)
3. Oven 2 (180)
4. Checkout upgrade: 2 registers (300)
5. Hire desk (480)
6. Upgrade kiosk (720)
7. Seating: 4 more tables (1200)
8. Terrace gate → opens area 2 (3000)

### Area 2 — Garden terrace (8 builds)
1. Terrace counter (3000)
2. Grooming station (4500)
3. Terrace oven with new product "smoothie" (6000)
4. Play zone (8000)
5. Terrace seating 6 tables (10000)
6. Fountain (decor, +10 % tips) (12000)
7. Second grooming chair (15000)
8. Café sign "Grand Opening" — end of content card, coins keep flowing (20000)

### Products
| Product | Price | Bake time | Introduced by |
|---|---|---|---|
| Cookie | 12 | 1.2 s | start |
| Cupcake | 20 | 1.6 s | Oven 2 |
| Smoothie | 32 | 2.0 s | Terrace oven |

Customers order 1 or 2 items (alternating by customer id) and pay the sum. Balanced 2026-09-02 by the economy bot.

### Upgrades (kiosk) and staff
- Speed: +15 % per tier, tiers cost 400 / 900 / 1800.
- Carry: 6 → 9 → 12 → 16, tiers cost 300 / 700 / 1500.
- Income: +20 % per tier, tiers cost 600 / 1400 / 3000.
- Runner: 1000 (walks oven ↔ counter at 2.6 m/s, carries 6). Second runner 2500.
- Cashier: 1500 (auto-collects the checkout pile every 3 s).
- Staff and upgrades are permanent (no expiry). Rewarded "free runner for 5 min" gives a temporary third runner.

## Monetization (nothing gates progress; every ad is a player choice)

Rewarded ads (IDs are stable strings sent to `requestRewardedAd`):
| ID | Offer | Where |
|---|---|---|
| `income_x2` | 2× income for 3 min | HUD button, cooldown 5 min after expiry |
| `instant_build` | finish the current build zone | shown on a zone when ≥ 25 % paid and price ≥ 800 |
| `free_runner` | extra runner for 5 min | HUD button, first offered after build 3 |
| `offline_x2` | double offline earnings | offline earnings card |
| `gem_pack` | +5 gems | shop |

Interstitials: only after these milestones: terrace gate opened, each level-up from level 3, and the end-of-content
card. Never in the first 3 minutes of a session, never within 2 minutes of any other ad, never while a modal is
open, always with the game paused underneath. Pre-roll is YouTube's, not ours.

Score to YouTube: `lifetimeEarned` (integer, monotonic), sent after each cash collection that increases it
and once after load.

## Meta

- **Offline earnings:** on load, `min(elapsed, 4 h) × passiveRate` where `passiveRate` is what staff would have
  earned (0 with no staff, so it only matters after hiring). Card shows the amount with COLLECT and a 2× rewarded button.
- **Daily streak:** 7-day calendar (coins 200, 400, 600, 800, 1000, 1500, 5 gems). Day advances when the
  first load of a new UTC day happens; missing a day resets to day 1. Uses the device clock; no network.
- **Missions:** three active from a pool (serve N customers, earn N coins, bake N cupcakes, seat N pets,
  groom N pets, hire a runner). Reward coins or gems; completing one draws the next. Missions are per save.
- **Level / XP:** XP per coin earned (1 XP per 10 coins). Level curve `xpToNext = 500 × 1.35^level`. Level-up
  card grants coins and, at 3/6/9, a free cosmetic.
- **Cosmetics shop** (coins or gems): owner hats (5), owner outfits (4), café color themes (4, recolor
  walls/awning/floor), VIP pet visitors (3: golden retriever, black cat, red panda). Equip from the shop.
- **End of content:** after build 8 of area 2 a card says "Grand Opening! You've built everything — your café
  keeps earning. More areas coming." and the game continues.

## Save format

Single JSON object, versioned. `{v:1, coins, gems, lifetimeEarned, xp, level, builds:{a1:[8 bools], a2:[8 bools]},
partial:{zoneId:amount}, upgrades:{speed,carry,income}, staff:{runner:n,cashier:n}, cosmetics:{owned:[],equipped:{hat,outfit,theme,vip}},
missions:{active:[{id,progress}],done:[]}, streak:{day, lastUtcDay}, lastSeen:epochMs, stats:{served,baked,groomed,seated}, settings:{sfx,music}}`.
Saved through the platform layer (debounced 300 ms, flushed on pause, on every build completion and on
every card close). Loading a newer or malformed save falls back to a fresh save without crashing. Size stays
far below 3 MiB.

## ytgame integration (from Sky Putt's platform layer, unchanged rules)

- SDK script first in `index.html`; `firstFrameReady()` once the loading screen paints; `gameReady()` only when
  the café is rendered and the joystick works; `loadData()` before any `saveData()`; `getLanguage()` only.
- `onPause`: stop the loop, audio, timers; show PAUSED overlay with RESUME; all HUD buttons inert. `onResume`
  restarts the loop with a clamped dt. No Page Visibility API, no storage APIs, no eval/WASM/workers.
- Audio only through `isAudioEnabled()` / `onAudioEnabledChange`; no global mute button in the game; SFX and
  music toggles in Settings still respect the host mute.
- No icons resembling YouTube's close, mute or menu near the top edge. Our top bar: a gear (settings) and a
  pause glyph, 48 × 48 CSS px, bottom-right of the safe area on portrait, top-right on landscape.
- Responsive from 9:32 to 32:9, no orientation lock; the camera reframes on resize and the HUD reflows.

## UI screens (HTML/CSS overlay over the WebGL canvas)

Loading (static spinner, no SDK dependency) · HUD (wallet with coin icon and count, gem count, level pill with
XP bar, active boost chips, joystick ring, build hint arrow) · Build zone labels (world-anchored DOM labels
projected each frame) · Sheets that slide up from the bottom: Upgrade kiosk, Hire desk, Shop (tabs Hats,
Outfits, Themes, VIP), Missions, Daily streak, Settings (SFX, music, language) · Cards centered: Offline earnings,
Level up, Area unlocked, End of content, Pause, Ad mock (standalone only) · Toasts. All text from the i18n table;
8 languages: EN ES PT FR DE RU TR ID. Text never smaller than 14 px, contrast ≥ 4.5:1, touch targets ≥ 48 px.

## Visual style (deliberately not Sky Putt)

Bright, warm, toy-like. Think a wooden toy café in morning light.
- **Geometry:** rounded boxes and spheres with vertex colors; edges softened by a subtle 2-tone gradient ramp
  (MeshToonMaterial with a 3-step gradient map) plus an ambient hemisphere light (sky cream, ground peach).
- **Palette:** floor sand `#F3E2C7`, walls mint `#BFE8D8`, awning stripes coral `#FF8A80` / cream `#FFF4E6` (the awning hangs along the north wall above the back windows, as built in Milestone 1),
  wood `#D9A066`, plants `#7BC47F`, coins `#FFD84D`, accent purple `#8B7CF6`. Pets: cat orange, dog beige,
  bunny white, hamster caramel, panda black/white, fox rust.
- **Lighting:** one directional sun (warm) with PCF soft shadows (map 2048 desktop, 1024 mobile), hemisphere
  fill, a faint sky gradient background rendered as a large inverted sphere. No fog. Bloom at low strength
  only on emissive elements (coins, build rings, cash piles).
- **Motion:** every spawn scales in with overshoot; every removal shrinks; pets hop when happy; steam from
  ovens, hearts from seated pets, coin arcs into the wallet, dust puffs on build, camera micro-shake on
  big purchases. Floating "+N" numbers.
- **Camera:** perspective, 3/4 view from the south-east, pitch 52°, follows the player with critically damped
  smoothing; distance auto-adjusts so the visible width is 10 m in portrait, 13 m square and 18 m in landscape, interpolated by aspect (ruled 2026-09-02 so characters read at phone size).
- **Post:** ACES tone mapping, sRGB output, renderer pixel ratio capped at 2. No EffectComposer: three's composer pulls in a `visibilitychange` listener that the Playables rules forbid; bloom, if wanted later, needs a Timer-free composer written in-project.

## Audio

WebAudio synthesized at boot (no files): coin, pop, chime, whoosh, oven ding, pet chirps per species
(pitch-shifted noise bursts), UI tap, level-up fanfare. Music: a 16-bar generative ukulele-style loop from
oscillators (major pentatonic, 96 BPM) with a low-pass filter opened on level-up. Music and SFX toggles in
Settings; both silent under host mute.

## Architecture

Folder `pet-cafe-tycoon/` (Vite project). ES modules, plain JavaScript with JSDoc types.

```
index.html            SDK script tag first, loading overlay, canvas, HUD/overlay markup
src/main.js           boot: loading paint → firstFrameReady → build world → platform init → gameReady
src/platform/yt.js    ported Sky Putt 12-yt.js (same PG surface, ES module)
src/core/loop.js      fixed-step simulation (60 Hz) + render on rAF; pause-aware; dt clamp
src/core/input.js     joystick (touch/mouse) + keyboard → normalized move vector
src/core/tween.js     tiny tween/spring helpers (no dependency)
src/core/rng.js       seeded RNG
src/sim/economy.js    prices, upgrades, staff, multipliers; pure functions (unit-testable, no three)
src/sim/world.js      areas, build zones, stations, waypoint graph; pure data + state
src/sim/customers.js  customer state machine (pure)
src/sim/save.js       save schema, migration, validation
src/sim/meta.js       missions, streak, level, offline earnings (pure)
src/render/scene.js   renderer, lights, camera rig, post, resize
src/render/palette.js colors, gradient map
src/render/props.js   procedural meshes: counters, ovens, tables, plants, fence, fountain, sign
src/render/pets.js    procedural pet builders + procedural animation
src/render/owner.js   player mesh + head stack
src/render/fx.js      particles (instanced), floating numbers, coin arcs
src/render/labels.js  world-anchored DOM labels
src/ui/hud.js, sheets.js, cards.js, i18n.js, strings/*.js
src/audio/synth.js    ported Sky Putt synth core + new patches
data/areas.js         build lists, prices, waypoints (data only)
tools/bot.js          headless economy bot: plays the sim, prints time-to-unlock table
tools/postbuild.js    guard: one external script (SDK), no forbidden tokens, file sizes, zip
test/                 unit (node) + smoke (Playwright) — written last, see Verification
```

Rendering rules: one InstancedMesh per prop type and per pet species part; per-frame allocations avoided;
draw calls ≤ 120 (revised after Milestone 1: six pets at ~10 sub-meshes each make 80 unreachable without merging animated parts, which is a polish item); triangles ≤ 150 k; JS heap ≤ 100 MB.

## Verification (order follows the user's instruction: visuals first, tests last)

1. **Milestone screenshots.** From milestone 1 on, a Playwright script boots the standalone build on the RTX
   GPU, plays a scripted 60 s, and saves screenshots at fixed moments. These are reviewed by eye and
   compared against the category leaders before moving on.
2. **Economy bot** (tools/bot.js) runs the pure sim headlessly and prints the first-session table above. Run
   whenever prices change.
3. **Unit tests** for economy, save migration and customer state machine — written after the visuals are
   approved.
4. **Smoke suite** with the YouTube SDK mock (call order, pause inertness, audio, ads, save round-trip) and the
   11-ratio layout matrix with overlap and 48 px checks — written last, before the MC Play submission, and
   kept small enough to run in under 3 minutes.
5. **Post-build guard** runs on every build from milestone 3.

## Milestones

1. **Vertical slice, visuals first:** café floor, walls, awning, sun and shadows; owner walks with joystick;
   oven → head stack → counter; 3 pet species queue, take, pay, exit; cash pile and collect; one build zone
   working; HUD wallet. Screenshots for review.
2. **Area 1 complete:** all 8 builds, seating, staff, kiosk, upgrades, all 6 pets, terrace gate, camera reframing, resize.
3. **Meta and ads:** platform layer, save/load, offline earnings, streak, missions, level, shop and cosmetics,
   rewarded and interstitial flows, settings, i18n, audio.
4. **Area 2 and polish:** terrace builds, grooming, play zone, fountain, end card, particle and motion pass,
   performance pass on a throttled profile.
5. **Certification:** post-build guard, smoke suite, layout matrix, screencast build, covers, zip, checklist.

## Delivery

`dist/` with `index.html` + chunk files (each under 512 KB where feasible, all under 30 MB), a zip for MC Play, a
screencast build with everything unlocked, cover images at 1:1 800², 5:7 1000×1400, 16:9 1920×1080 and
9:16 1080×1920, and the pre-submit checklist.
