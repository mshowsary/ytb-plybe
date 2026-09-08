# Pet Café — The Complete Program

Executor: **Opus 5**. Author: Fable 5.1, 2026-09-08, from a playtest of the live build
(`chatgpt/pet-cafe-production` @ `ff46e34`, https://mshowsary.github.io/ytb-plybe/) and the code.

> **Read this first.** This repository already contains ten `HANDOFF-*.md` files and one
> `PET-CAFE-DEPTH-BLUEPRINT.md` marked *PLAN ONLY*. None of them shipped. This document is not
> another one of those. It is an execution order: **do Batch 0 today, deploy it, then Batch 1.**
> Do not write a new planning document. Do not re-derive the diagnosis. If something here turns out
> to be wrong against the code, fix the code or amend *this* file in the same commit, and move on.

---

## 0. Rules for the executor

1. **Every batch ends deployed.** Merge to `chatgpt/pet-cafe-production`, then
   `gh workflow run 349513834 --ref chatgpt/pet-cafe-production` (the Pages workflow does not
   auto-trigger on game code — Batch 0 fixes that). Verify the live asset hash changed. The owner
   plays each increment on the live URL; that playtest is the acceptance standard.
2. **Gates that must stay green on every commit:** `npm test`, `node tools/responsive-audit.js`
   (13 viewports, 0 violations), `npm run bot` (0 stalls, 0 teleports, ledger reconciles),
   `node tools/task25-live-cert.mjs` (needs `npx vite preview --port 4173`), `npm run build`
   (postbuild guard: no `visibilitychange`, no `localStorage`, exactly one external script).
3. **Measure, don't guess.** Balance changes are proven with `npm run bot` day tables, not by
   reading numbers. Visual changes are proven with a screenshot (`tools/responsive-audit.js
   --no-build --shots --only=390x844`), not by reading shader code. Both of those bit the last
   session: a shader that looked correct washed the game out; a harness that reported green had
   overlaps on screen.
4. **Extend, don't replace.** Authored days 1–12 must stay bit-identical unless a task says
   otherwise. Every new system is additive; saves migrate v4 → v5 with defaults; old saves load.
5. **No text on the play field.** New UI is icon + numeral. Text is allowed only in sheets the
   player reads once (settings, summary, pet book detail) and for pet names.
6. **Certification is a hard constraint.** Every new floating element registers with
   `src/ui/labelLayout.js` (`.demand`/`.wish`-style classes or `layout.avoid`), every HUD element
   fits the short-viewport rows in `src/ui/hudLayout.js`, and all of it goes through the audit.
7. **Bundle discipline.** Everything is procedural geometry, generated textures, or inline SVG.
   No asset files. Keep `dist/` under 1.4 MB total; three.js is 554 KB of that and is fixed.
8. Commit messages explain *why*. The history of this repo is its documentation.

---

## 1. Diagnosis — what the screenshots and the code say

Playtest facts (owner's screenshots, day 1 → day 15):

| Day | Observed | Cause in code |
|---|---|---|
| 1 | Two resident cats on the east strip read as blocks with a stray line; empty floor | `systems/residentPets.js` scales pets 1.22, uses `sit()` on bare floor; cat `long` tail geometry sticks out in sit pose |
| 1–4 | Whole scene is tan/sepia; morning looks like evening | Warm tints baked into **every** layer: `palette.js` floor `#F3E2C7/#EAD3B3`, `scene.js` hemi `#FFF7EA/#E7BFA5`, sun `#FFF0CF`, fog `#F7EDE2`; `post.js` `shadowTint #FFE9D2`, vignette 0.20 |
| 4 | Station labels still English ("COFFEE – needs beans", "PANTRY", "OVEN – cupcakes") | `systems/visuals.js:160` `.chalk` label spans were never converted |
| 15 | 22,219 coins, moon icon, 34/34 served, **same room, same equipment** | The economy is endless (ladders continue) but the *content* is finite: one room, 9 zones. Ladders past ★3 are invisible progression — "stack money" |
| 15 | 19,591 coins during a "Pupcake Picnic" social | Events exist but do not change the space |

Bug reports, with root causes (all verified in code, see §6 for fixes):

1. **Runner stacks cookies and stands "in front of the cupcake display"; holds cookies while the cookie counter needs refill** — `src/sim/staff.js` `pickSource()` picks the source with the most *stock* (or the customer's wished family, else falls back to most stock) with **no regard for whether the matching display has room**. It then holds the batch in place ("try again next tick") wherever it happens to stand — oven1's front, which sits directly behind dispCupcake from the camera. The second symptom is the same loop one tick later.
2. **Dirty tables have no consequence** — `src/sim/customers.js:516` a paid guest with no clean seat silently `state = 'leave'` (no bubble, no event, no stat). From day 8 the policy path exists but `serviceQuality.js serviceRecoveryCost()` **returns 0 unconditionally**. The only effect is the guest paid 1× instead of 2× at arrival, which nobody can see.
3. **Cleaning animation inconsistent** — owner cleaning has a hold ring (`stations.js cleanProg`) and a chime; the cleaner's `stepCleaner 'cleaning'` state (1.6 s) has **no presentation at all**; the dirty mesh just pops off on the `'cleaned'` event (`visuals.js:195`). So tables cleaned by staff look broken.
4. **Pantry demo persists / flickers until the first refill** — `interactionCoach.js`: a refill lesson fires the moment beans hit 0 and is only `mark()`ed on `holdCompleted`; the hand switches between `showTap` (sheet open) and `showRoute` modes, each switch resets `candidateT` → hide → re-show after dwell, and `PROGRESS_RESET_METERS` hides it every time the player walks toward the target. Reads as a glitch.
5. **Residents look freaky** — see row 1.

**A regression from the previous session (mine) — P0:** `src/sim/stationState.js:38-39` still clamps a display's star tier to 3 for restore. `outputCapacity` therefore returns ≤ 16, and `boundedQuantity(stock, 16)` returns **0** for any stock above it. A ★4+ display that is full at save time restores **empty**. Fix first (Batch 0, task 0.1).

The honest answer to "is this how Playables should look?": Playables are lighter than app-store tycoons and sessions are shorter, but the ones that rank are not shallow — they have a visible *next thing*, a collection, and a reason to come back tomorrow. This game has the bones (contracts, cups, pet book, calendar, socials) and none of the *content* those hooks need past day 12. That is what this program adds.

---

## 2. The design

### 2.1 Three pillars

1. **Pets are the point.** Every new system is about the animals: photographing them, dressing them, befriending them until they *move in*, a garden they play in, a spa that pampers them. Humans are the wallets; pets are the reward.
2. **Space is progression.** The map grows: Café → **Terrace** (day ~14) → **Pet Spa** (day ~28) → Rooftop (day ~45). Each space brings new equipment, a new verb, new guests' wishes, and new staff work. Ladders past the authored tiers remain as a sink, never as the headline.
3. **A visible end goal with a rhythm after it.** The **Paw Rating** (★1→★5) is an on-screen checklist that culminates in the **Golden Paw ceremony**. After ★5: **Seasons** (7-day themed cycles) and an optional **Franchise** prestige.

### 2.2 The loop, in the player's words

*Run the shift → earn → the next build circle is always visible and reachable in 1–3 shifts →
build it → the room changes and a new wish/verb appears → new pets arrive → photograph and befriend
them → followers grow → busier café, rarer pets → next star → next space.*

### 2.3 Difficulty principle (owner direction, 2026-09-08)

The late game must be **not boring — never punishing**. Do not tune patience, service policy or
spawn pacing to make guests leave, tables fail or shifts get lost; a low lost-sales figure is
acceptable and a cosy café that serves everyone is the point. Engagement comes from new verbs, new
spaces, seasonal variety and positive stretch goals. A shift rating that reads 3 every day is a
*legibility* problem (the score has stopped carrying information), not a difficulty one.

### 2.4 What is explicitly NOT in scope

Multiplayer, real-money purchases, external assets, free placement, employee payroll, offline
penalties, forced mid-shift interstitials.

---

## 3. Content specification

### 3.1 Space 2 — The Terrace (unlock target: day 13–15, 20,000 coins)

The garden the previous session built south of the fence (z 7.5–14) is exactly where the terrace
goes. Buying it **transforms the garden into a built terrace** on screen (reveal animation via
`render/buildReveal.js`), which is the single biggest visual moment in the game and lands on the
one purchase the player has been saving for.

**Region** (new concept, §7.1): `{ id:'terrace', x0:-10, x1:10, z0:7.4, z1:14, builtBy:'z_terrace', floor:'deck' }`.
Interior `area.size` stays `{ w:20, d:14 }` so every existing coordinate holds.

**Zone chain** (append to `data/area1.js` `zones`; prices are initial, tune with the bot):

| id | price | requires | adds | label (icon) |
|---|---|---|---|---|
| `z_terrace` | 20,000 | `z_seats2` **and** `meta.reputation ≥ 60` | `fountain1, seat7, seat8, gate` | deck + fountain + 2 tables |
| `z_icecream` | 9,500 | `z_terrace` | `icecream1, barIce, coldPantry1` | ice cream lane |
| `z_register3` | 6,000 | `z_icecream` | `register3` | terrace register |
| `z_photo` | 12,000 | `z_terrace` | `photo1` | pet photo studio |
| `z_terraceSeats` | 8,500 | `z_register3` | `seat9, seat10, seat11, seat12` | 4 tables |
| `z_restroom` | 7,500 | `z_terraceSeats` | `wc1` | comfort |
| `z_splash` | 11,000 | `z_photo` | replaces `fountain1` mesh with a splash pool; adds `splash1` | pet play pool |

Chain total ≈ 74,500 over roughly days 14–26 at 3–4.5k/day (income rises with the terrace).

**Stations** (append to `data/area1.js` `stations`; +z is toward the camera; the gate is at x 0):

```js
// terrace — every station here has builtBy so it is inert until bought
{ id:'gate1',      type:'gate',     x: 0.0,  z: 7.0,  rot: 0,            fw: 2.4, fd: 0.4, builtBy:'z_terrace' }, // fence gap, non-blocking
{ id:'fountain1',  type:'decor',    x: 0.0,  z: 10.6, rot: 0,            fw: 2.4, fd: 2.4, builtBy:'z_terrace' }, // blocks; splash pool reuses id
{ id:'seat7',      type:'seat',     x:-6.5,  z: 9.2,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy:'z_terrace' },
{ id:'seat8',      type:'seat',     x: 6.5,  z: 9.2,  rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy:'z_terrace' },
{ id:'icecream1',  type:'icecream', x: 8.6,  z: 8.6,  rot:-Math.PI / 2,  fw: 1.6, fd: 1.2, builtBy:'z_icecream' },
{ id:'barIce',     type:'display',  product:'icecream', x: 6.2, z: 8.4, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy:'z_icecream' },
{ id:'coldPantry1',type:'pantry',   x: 9.2,  z: 11.4, rot:-Math.PI / 2,  fw: 1.2, fd: 1.2, builtBy:'z_icecream', supplies:['cream'] },
{ id:'register3',  type:'checkout', x:-7.0,  z: 8.4,  rot: 0,            fw: 1.6, fd: 0.9, builtBy:'z_register3' },
{ id:'photo1',     type:'photo',    x:-9.0,  z: 11.2, rot: Math.PI / 2,  fw: 1.4, fd: 2.0, builtBy:'z_photo' },
{ id:'seat9',      type:'seat',     x:-3.2,  z: 12.4, rot: Math.PI / 2,  fw: 1.4, fd: 1.4, builtBy:'z_terraceSeats' },
{ id:'seat10',     type:'seat',     x: 3.2,  z: 12.4, rot:-Math.PI / 2,  fw: 1.4, fd: 1.4, builtBy:'z_terraceSeats' },
{ id:'seat11',     type:'seat',     x:-8.4,  z: 13.0, rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy:'z_terraceSeats' },
{ id:'seat12',     type:'seat',     x: 8.4,  z: 13.0, rot: Math.PI,      fw: 1.4, fd: 1.4, builtBy:'z_terraceSeats' },
{ id:'wc1',        type:'restroom', x: 9.3,  z: 13.6, rot:-Math.PI / 2,  fw: 1.6, fd: 1.4, builtBy:'z_restroom' },
{ id:'splash1',    type:'splash',   x: 0.0,  z: 10.6, rot: 0,            fw: 2.4, fd: 2.4, builtBy:'z_splash' },
```

**The ice cream lane** mirrors the coffee lane so every existing system generalises:

- `economy.js PRODUCTS`: `icecream { price: 26, make: 2.0, color:'#FFF0F5' }`, `sundae { price: 34, make: 2.6, color:'#FFD6E7' }` (alt product of `icecream1`, add to `world.js ALT_PRODUCT`), `pupcup { price: 14, color:'#FFE4C4' }`. `FAMILY`: `sundae → icecream`.
- `world.js createWorld`: `type === 'icecream'` → `{ product:'icecream', baseProduct, altProduct, cream: 20, stock: 0, buffer: 8, timer: 0 }`; `stepMachines` produces while `cream > 0` (same shape as coffee/beans). `refillCream(w, id, sack=20)` mirrors `refillBeans`. `takeFromMachine` unchanged.
- **Pup cup**: a pet-treat variant dispensed at `icecream1` (costs 1 cream, no stock slot). `economy.wishFor`: when `icecream1` is active with cream, a pet wish has a 55% chance of `pupcup` instead of `treat` (only if the guest is heading to the terrace, i.e. `c.terraceBound` set at spawn when terrace seats have room). Dog reaction on delivery: `pet.react('zoomies')`.
- `carry.js`: a third sack kind `'cream'`; the pantry sheet gets a third choice (icons only: bean / kibble / cream). `coldPantry1.supplies` restricts which choices a pantry offers.
- **Staff**: runners treat `icecream` as any machine product (`pickSource` includes `type === 'icecream'`; `productOf` returns `st.product`). The **second barista** (added last session, currently identical to the first) owns the cold lane: `barista.js baristaLane()` returns the coffee lane for barista #1 and the ice lane for #2. Bot (`botDecide.js`): refill cream like beans.
- Coach lessons: `refillIce` (supply `cream`, icon = a new `creamIcon`).

**Terrace register** — `register3` is a normal `checkout`; `customers.js` queue routing picks the *nearest* register with the shortest queue among `w.checkouts` (today it is fixed order — generalise to nearest-by-queue-length, which also fixes register2 under-use). Terrace-bound guests pay there. Cashier #2 (already hireable) mans it; `staff.js stepCashier` assigns cashiers to registers by index.

**Restroom** (`type:'restroom'`) — a comfort buff, not a queue: while `wc1` is active and `wc1.tidy > 0.3`, seated guests eat 20% faster and tip +15% (`customers.js` eat timer, `salePrice` tipMult). `tidy` drains 0.08 per seated guest; the cleaner tidies it (a chore in `stepCleaner` when no dirty seats: walk to `wc1.front`, 2.2 s, `tidy = 1`); the owner can tidy by hold. Below 0.3 the buff is off and a small stink wisp shows.

**Fountain → splash pool** — decor with a particle ring (reuse `fx.burst` tinted `#A8DCEF` on a timer). After `z_splash`, `petPlayBreak.js` picks `splash1.front` as the play spot for dogs; friendship +1 extra per play there.

**Deck rendering** (`render/props.js` new `buildRegion(area, region)`): planks `#D9B48A` with gaps `#C69A6B`, a stone border `#E6E0D6`, planters at the corners, string lights along the new rail (reuse the `ambience.js` instanced bulb pattern), the gate arch. Two groups are attached to the scene: `garden` (the current `environment.js` near-band content, visible until `z_terrace` is built) and `terraceDeck` (visible after). The mid/far rings of `environment.js` stay.

### 3.2 The Pet Photo Studio (`z_photo`) — the pet highlight

A new **verb** that is the player's skill, not a timer.

- **Flow:** after paying, a guest whose pet is named (identity from `petBook`) and who is not in a rush-capped shift has a 40% chance to enter state `toPhoto` → queues at `photo1` (reuse register queue geometry) → the owner stands at `photo1.front` → the **shot mini-game** starts: a ring shrinks over the pet from 2.2× to 0.6× over 1.4 s; the player taps (or releases a hold) when the ring is inside the target band. Score: **Perfect** (±0.08), **Good** (±0.22), else **Ok**. Tips: `40 + 20 × friendshipTier`, ×2 Perfect, ×1.3 Good, into a tray at the booth (collect like a register pile). The pet strikes a pose (`petTraitMotion` clip: cats `loaf`, dogs `sit-tilt`, bunnies `ear-up`, hamsters `cheeks`).
- **Polaroid:** a card slides out of the booth (DOM element, `.polaroid`, registered with labelLayout) showing the **rendered portrait** (§3.2.1) and flies into the pet-book button. First photo of a pet: +10 followers; Perfect: +3; otherwise +1.
- **Album:** `meta.album[petKey] = { shots, best: 0|1|2, poseId, accessoryId }`. The Pet Book (`ui/meta.js`) gains an **Album** tab: a grid of framed portraits (grey silhouette if not yet shot; a gold frame for Perfect). Tapping a card opens the pet: large portrait, name, trait, friendship tier, and the **accessory picker** (§3.5).
- **Bot:** the headless bot and the in-game auto bot auto-resolve a shot as `Ok` after 1.6 s (the mini-game is player skill; automation must not stall).

#### 3.2.1 Portrait rendering (`src/render/portrait.js`)

Portraits are **never stored as pixels**. They are deterministic renders of `(petKey, poseId, accessoryId)`:
a private `THREE.Scene` with a two-tone gradient backdrop plane, one `createPet()` instance posed by
`poseId`, a key light and a rim light; render into a 256×256 `WebGLRenderTarget` with the main
renderer (`setRenderTarget(rt) → render → setRenderTarget(null)`), `readRenderTargetPixels` into a
2D canvas (flip Y), `canvas.toDataURL('image/png')`, cache in a `Map` for the session. Cost is paid
only when the album opens. `toDataURL` is not on the postbuild forbid list; do not touch storage.

### 3.3 Followers → busier café, rarer pets

`meta.followers` (int, saved). Sources: photos (above), Perfect shots, first-time discoveries (+5),
Bestie (+15), Golden Paw ceremony (+200). Effects (read-only, derived each frame):

- `spawnInterval` gets a final multiplier `1 / (1 + min(0.5, followers / 4000))` (busier, bounded).
- Rare-pet weighting: `PET_VARIANT_WEIGHTS` shifts one step toward rare/epic per 500 followers, capped at the epic tier weight ×3.
- Milestones 100 / 500 / 2,000 / 5,000 unlock accessory tiers (§3.5) and a café-sign colour.

The follower count lives in the top-left HUD stack as a heart-icon pill (`#followers`, add to
`hudLayout.js` rows and `labelLayout.js` keep-out).

### 3.4 Paw Rating ★1–★5 — the end goal (`src/sim/pawRating.js`)

Derived, never stored (except `meta.goldenPaw: true` after the ceremony). Requirements are shown as
an icon checklist in the star sheet (the existing ★ button top-left). Each star: **+10% arrivals,
+1 resident slot, an awning set (`props.js AWNING_SETS`, extend to 6), a decor set unlocked.**

| ★ | Requirements (all icon-representable) |
|---|---|
| 1 | 120 guests served (lifetime) |
| 2 | every interior zone built **and** one Bestie |
| 3 | `z_terrace` built, 10 photos in the album, a 7-day window with ≤ 3 missed seats |
| 4 | `z_spa` built, 16 of 20 pets discovered, one gold weekly cup |
| 5 | every pet photographed, 3 Perfect shots, followers ≥ 2,000 |

**Golden Paw ceremony** (once): closing phase of the day ★5 is reached — the string lights pulse,
confetti (`fx.burst` gold), every resident and regular pet gathers on the rug, a gold paw sign
mounts on the north wall (`ambience.js prestige[3]` style), the day summary shows the award.
Then Seasons unlock (§3.8) and the Franchise offer appears (§3.9).

### 3.5 Accessories — dress your favourites

`data/accessories.js`: 12 items as merged primitive parts attached to the pet rig's head/neck
nodes (`pets.js` exposes `P.attach(node, mesh)`): bow, bandana (3 colours), collar tag, tiny beret,
round glasses, flower crown, scarf, party hat (seasonal), sunglasses, bell collar. Unlock by
follower milestones and stars; **equip per named pet** from the album detail view; the pet arrives
wearing it on every visit; Perfect-shot tip +10 with an accessory. Saved as `meta.equipped[petKey] = accessoryId`.

### 3.6 Besties move in — residents are earned, not placed

Today's seven residents (`systems/residentPets.js`) are placeholders. Change: resident **slots**
(3 at start, +1 per star, max 8) are filled, in order, by pets that reach the **Bestie** tier
(`petBook.js PET_FRIENDSHIP_TIERS`, 10 visits). A Bestie moving in is a moment: the pet walks in
on its own at the next morning, a name tag appears (`petMoments.js`), it settles on its spot.
Residents keep their name, accessory, and react to the owner (head turn within 3 m). Empty slots
render their furniture (cat bed, windowsill cushion, dog basket) — an invitation. Placeholder
residents are removed. Saved as `meta.residents: [petKey…]`.

### 3.7 Twenty pets — a fourth species and legendary coats

- **Hamster** (`pets.js` species `hamster`): w 0.30, h 0.26, l 0.34; round body, cheek spheres,
  tiny round ears, no visible tail, sits up on hind legs for idle; `hop` gait. Four variants
  (`petBook.js PET_PROFILES.hamster`): Peanut (common), Clove (common), Marble (rare), Saffron (epic).
- **One legendary coat per species** (variant 4): unique accent (sparkle emissive dots), unlocked
  to spawn at ★4. Book grid goes to 20 cards (4 columns on ≥ 380 px wide, 3 below).
- Hamster owners carry the pet on the ground like others (no new rig work beyond the species).

### 3.8 Seasons (after ★5, and available earlier as a soft system)

`src/sim/seasons.js`: season = 7 days, cycling **Blossom → Splash → Harvest → Lights**. Each
season: a garden/terrace re-tint (flower palette, tree crown colours, string-light colour), one
special day theme (reuse `specialDays.js THEMES`), one seasonal accessory (party hat, flower crown,
scarf, sunglasses), and a **season goal** (e.g. 40 Perfect photos) with a cup reward. Purely
additive to the existing weekly rhythm.

### 3.9 Space 3 — Pet Spa (unlock target: day ~28, 45,000, requires ★3)

Region east: `{ id:'spa', x0:10, x1:17.5, z0:-7, z1:7, builtBy:'z_spa', floor:'tile' }` (the east
strip past the fence; the fence gains a second gate at z 0).

| id | price | adds | verb |
|---|---|---|---|
| `z_spa` | 45,000 | `spaLounge` seats ×3, planters | pets' owners sit while pets are pampered |
| `z_groom` | 14,000 | `groom1` | **brush hold** — a rhythm hold: hold while a paw icon pulses, release on the beat, 3 beats; score → tip + friendship |
| `z_bath` | 18,000 | `bath1, waterTank1` | refill water (sack `water`), pets exit sparkling (emissive dots 20 s) |
| `z_boutique` | 16,000 | `boutique1` | sells accessories for coins (alternative to milestones) |
| `z_photographer` | 20,000 | hire slot | a **Photographer** staff role auto-takes `Good` shots at `photo1` |

Spa guests are a new arrival type (`c.spaBound`) from day 28: they skip food, queue at `groom1`/`bath1`, pay 60–90 at `register3`, and count as served. Detailed data for this space is written when Batch 4 starts, using the terrace as the template.

### 3.10 Space 4 — Rooftop Night Garden (outline only, ≥ day 45, 120,000)

A stair at the north-east corner to a rooftop with lanterns, a night market stall, and evening-only
guests. Not designed here; it exists so the Paw Rating and price curve have a horizon.

### 3.11 Franchise (optional prestige, after Golden Paw)

`meta.franchise = { level, multiplier }`. "Open a second branch": resets builds, coins, staff and
stars to a fresh café; **keeps** the Pet Book, album, accessories, followers, residents (they visit
the new branch), decor unlocks and rating history; grants +8% income per level (bounded at +40%),
+1 resident slot, a new café sign colour. Offered, never forced. Ship last.

### 3.12 Décor catalogue — the "always something to buy" sink

`data/decor.js`: 24 items with fixed slots (interior and terrace), 60 → 900 coins, each +1
reputation and a small visual: wall art, hanging plants, a chalk-paw sign, rugs, lanterns, a cat
tree, a bird feeder, a bicycle by the door, terrace umbrellas, a chalk menu board (icons only).
Sold from a fourth kiosk tab (`ui/sheets.js TABS`: workers / machines / player / **décor**, icon
tabs). This fixes the measured *[0,0,0,0,0]* affordable-options gap on days 2–6 — there is always a
60–200 coin item to buy — and it lets the café look like the player's.

---

## 4. Economy engineering

### 4.1 One config module

Create `src/sim/economyConfig.js` and move every tunable number there (prices, ladders, growth,
demand curve constants, reward caps, terrace/spa prices, follower effects). `economy.js` imports it.
The bot prints the config hash in its header so a balance result is tied to the numbers that made it.

### 4.2 Targets (median gross sales per shift, from `npm run bot`)

| Day | 1 | 3 | 5 | 8 | 10 | 12 | 14 | 16 | 20 | 24 | 28 | 32 | 36 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Income | 400 | 650 | 950 | 1,400 | 1,600 | 1,900 | 2,200 | 3,000 | 3,800 | 4,400 | 5,000 | 6,200 | 7,000 | 7,500 |
| Next content unlock affordable | — | seats/oven | coffee | bowl | blender | garden/seats2 | **terrace 20k** | ice cream | photo, seats | restroom, splash | **spa 45k** | groom | bath | boutique |

Days 1–7 are the measured current curve (do not move them). Days 8–11 moved once, in Batch 4a,
when `tools/bot.js` began simulating staff actors and the service policy — the earlier days-1–12
freeze had been measuring a café with no staff on the floor, so preserving it would have preserved
an artifact. Nothing can differ before day 8 (the policy's own floor, and the first hire). The step at 14–16 is the terrace
(seated capacity + ice cream at 26/34 + pup cups), the step at 28–32 is the spa.

### 4.3 Invariants — turn these into bot gates (`tools/bot.js`, WARN → FAIL)

- **A. Always something to buy.** For every day 2..40: ≥ 1 purchasable item (zone, décor, hire,
  upgrade, star) with price ≤ 2.5 × that day's income. Today days 2–6 report 0.
- **B. Content cadence.** A *new-content* unlock (zone/space/species/accessory tier — not a ladder
  tier) becomes affordable at least every 3 days through day 30 and every 5 days through day 45.
- **C. No stacking.** For days 15–40: end-of-day wallet ÷ that day's income ≤ 6 while any content
  unlock is unbought. (The HUD shows "saving for ▢" — the next unlock's icon and a progress ring
  on the wallet pill — so the pile has a *purpose*.)
- **D. Runner sanity.** No runner holds items for > 6 s while a same-family display has free capacity.
- **E. Early game frozen.** Days 1–5 lost sales ≤ 1/day, sales within the checkpoint bands.
- Existing: 0 stalls, 0 teleports, ledger reconciles. **Lost sales ≤ 10%** — a *low* figure is not
  a defect (§2.3); the earlier 4–14% floor was written to create tension and is withdrawn. Rush and
  outside-rush "friction" are reported, not gated. Days 1–5 governed by E.
- **D is measured as net progress, not elapsed time** (Batch 4a): a runner is stuck only if it holds
  product for > 6 s *without moving ≥ 1 m* while a same-family display has room. The elapsed-time
  form reported honest 14 m deliveries as faults — the same mistake as Batch 1's stall detector.

Run the bot to **60 days** (`MAX_DAYS`) once the spa exists.

### 4.4 Ads — placements that scale with the content (all opt-in, one claim per shift each)

Existing and kept: summary ×2 earnings, in-shift relief helper, mystery gift (scales with level),
gift calendar. Interstitials stay host-paced (every 2 completed shifts at the day transition, and
the returning-player boot spot) behind the 4-minute gap in `adPacing.js`. **Never add a forced
mid-shift interstitial** — it fails certification and kills session length.

New rewarded placements (`systems/rewardsSystem.js`, `adPacing.js` placement keys):

| key | when | reward |
|---|---|---|
| `speed-build` | standing on a build circle ≥ 40% paid | finish the build now |
| `rare-visitor` | morning, from day 6 | next spawn is rare/epic (feeds the album) |
| `golden-shot` | first photo of the shift | photo tips ×2 this shift |
| `season-pass-day` | once per season | today's seasonal accessory unlocks now |

The revenue lever is retention, not placement count: `adLaunchPolicy.report()` already counts
eligible/requested/earned per format — log it in the day summary console line so QA can see the
funnel. Do not fabricate revenue-share numbers anywhere in the UI.

---

## 5. The look

### 5.1 Time of day (`src/render/daylight.js`, driven by `G.dayState.t` over `DAY_LENGTH = 240`)

Replace the fixed lighting in `scene.js` with keyframes lerped by shift time (t in seconds):

| t | name | sun colour / intensity / elevation | hemi sky / ground | sky top / horizon | fog | string lights |
|---|---|---|---|---|---|---|
| 0 | dawn | `#FFE8C8` 1.6, low east | `#DCEBFF` / `#C9D8C0` | `#BFD9FF` / `#FFE6D0` | `#EAF2F8` | off |
| 45 | morning | `#FFFFFF` 2.3, high | `#EAF3FF` / `#D6E2CC` | `#9FCBFF` / `#E8F2FF` | `#F2F6F9` | off |
| 130 | midday | `#FFFDF7` 2.4, highest | `#F2F7FF` / `#D9E3CF` | `#8FC3FF` / `#E6F1FF` | `#F4F7FA` | off |
| 175 | afternoon | `#FFE9B8` 2.1, lower west | `#F0E8FF` / `#D2C8B8` | `#7FB0F5` / `#FFD9B0` | `#F3E9DE` | off |
| 215 | sunset | `#FF9E6A` 1.5, low west | `#D9C4FF` / `#8C7A9E` | `#6C7FCF` / `#FF9F7A` | `#F5C7B4` | **on** |
| 240 | dusk | `#5E6FB8` 0.5 | `#4A5A9C` / `#2C3350` | `#1E2A5A` / `#4C4E8C` | `#2E355C` | on |

Night (`t = 240`, the summary screen) is the café lit from within: pendant bulbs and string lights
emissive at full, window panes `#FFE3A8` emissive, a warm pool under each lamp (a flat additive disc,
no point lights). Golden Hour (`S.setGoldenHour`) becomes a *boost* on top of the keyframe, not a
separate palette. The sun's elevation moves its shadow direction across the day.

### 5.2 De-sepia (one commit, verified by screenshot at t = 45)

- `palette.js`: `floorA #F7F0E6`, `floorB #EFE5D6` (cream, not tan); walls stay mint; wood `#D9A066` stays.
- `post.js` uniforms: `shadowTint #FFFFFF`, `highlightTint #FFFFFF`, `vignetteAmount 0.10`,
  `saturation 1.12`; add a `gradeWarmth` uniform lerped by time of day (−0.04 at morning, +0.06 at sunset) applied as a tiny R/B shift.
- Terrace deck and stone use the §3.1 colours; garden flowers §5.3.
- Acceptance: at t = 45 the frame's mean chroma is visibly higher than today and the floor reads
  cream, not tan; at t = 225 the string lights are on and shadows are blue.

### 5.3 Garden and flowers (`render/environment.js`)

Replace the hexagon-sphere blooms with **layered petal clusters**: 5 flattened petal spheres around
a centre sphere, two leaves, three sizes; tulips (cone + stem) and daisies (white petals, yellow
centre); saturated pinks / yellows / purples / whites; ≤ 40 triangles per bloom, ≤ 120 blooms in the
near band. Planters get a wooden edge. Paw-print path stones become smaller and darker (`#D8CFC2`),
half as many. Pond keeps its lily pads; add three reeds. Seasons (§3.8) re-tint this palette.

### 5.4 Residents (`systems/residentPets.js`)

Scale 1.0. Every resident sits **on furniture**: cat bed (round cushion), windowsill cushion under
the north window at x −5, cat tree in the kiosk corner, dog basket by the door, bunny hutch corner in
the garden. Poses use the rig (`sit()`), plus: breathing (body scale y ±2 % at 0.3 Hz), tail sway,
blink (exists), an occasional stretch/yawn clip via `petTraitMotion`, and a head turn toward the
owner within 3 m. The cat's `long` tail curls (rotate + shorten) in sit pose so nothing sticks out.
Placeholder residents are replaced by Besties (§3.6).

### 5.5 Chalk labels → icons (`systems/visuals.js:160`)

Drop the `.chalkLabel` span; keep `.chalkIcon` and a state dot (stocked / low / empty). The
"needs beans / cream" state is the bean/cream icon with a red dot. The coach already points at
stations, so words add nothing.

---

## 6. Bug fixes — root cause, fix, test

**6.0 P0 — ★4+ displays restore empty** (`src/sim/stationState.js:38-39`).
Replace the `Math.min(3, …)` + `DISPLAY_STAR_CAP[tier]` with `displayStarCap(tier)` from
`economy.js`; grep for any other `DISPLAY_STAR_CAP[` consumer and do the same. Test: snapshot a
world with `dispCookie` at ★5 holding 24 → `normalizeStationState` → `restoreStationState` →
stock is 24, not 0.

**6.1 Runner** (`src/sim/staff.js`).
- `pickSource`: rank candidates by **display need** = `displayFor(product).capacity − stock`
  (0 if no display or full), tie-break by source stock; an unassigned runner ignores sources whose
  display need is 0; an assigned runner ignores sources when its display is full.
- `idle` with items and a full display: walk to a **wait spot** beside the display
  (`ct.front` offset 0.9 m along the station's local +x) instead of freezing in place; after
  4 s still full → `unload` state: walk back to the source and put items back (`src.stock += n`
  bounded by `buffer`), then re-pick.
- Watchdog: if `items.length > 0` for > 6 s while any same-family display has free capacity,
  force `state = 'toCounter'` toward it. Emit `{ type:'runnerStuck' }` for the bot to count.
- Tests: `test/staff-runner-need.test.js` — (a) cupcakes wished, cupcake oven empty, cookie display
  full → runner does **not** load cookies; (b) display fills while en route → runner waits beside
  it, then unloads; (c) invariant D over a 3-minute scripted shift.

**6.2 Dirty tables matter** (`src/sim/customers.js`, `serviceQuality.js`, `systems/visuals.js`).
- A paid guest with no clean seat while ≥ 1 seat is dirty: state `noSeat` for 1.2 s showing a
  **table-with-X bubble**, then leaves; `dayStats.missedSeats++`; `meta.reputation −1` with a
  floating "−1★"; emit `{ type:'seatMissed' }`. The day summary lists missed seats (icon + count).
- From day 8 (`servicePolicyActive`), `serviceRecoveryCost('table')` returns the bounded refund the
  blueprint intended: 25 % of the receipt, max 18 coins. Only for `'table'`; every other reason stays 0.
- Visual escalation on a dirty seat: crumbs immediately; a 3-dot fly loop after 12 s; a stink wisp
  after 25 s; after 30 s a 35 % chance to spawn a `petMess` beside it (blocks a tile until cleaned).
- Weekly cup and the ★3 requirement read `missedSeats`.
- Test: `test/dirty-tables.test.js` — no clean seat → `seatMissed` emitted, stat increments, rep −1;
  day ≥ 8 → refund cost 25 %, capped 18; day < 8 → 0.

**6.3 Cleaning presentation** (`sim/world.js`, `sim/staff.js`, `systems/visuals.js`, `render/human.js`).
- `cleanSeat` already emits `'cleaned'`. Add `emitWorld(w, { type:'cleaning', seatId, by:'cleaner'|'owner', seconds })` when a clean **starts** (cleaner: entering `'cleaning'`; owner: hold start in `stations.js`).
- `visuals.js`: on `'cleaning'` show the same progress ring the owner uses (`cleanProg`) over the
  seat for either actor; on `'cleaned'` play a sparkle burst (`fx.burst`, `#BFEFFF`, 8) and a table
  `pop()`; the dirty mesh fades over 0.25 s instead of vanishing.
- `human.js`: `H.wipe(seconds)` — right arm sweeps side to side; `systems/staff.js` calls it while
  `s.state === 'cleaning'`.
- Test: cleaner path and owner path both emit `cleaning` then `cleaned` with the same seatId.

**6.4 Coach lesson lifecycle** (`src/ui/interactionCoach.js`).
- A refill lesson may only *start* when the machine has been empty for ≥ 6 s **and** a guest is
  waiting for that family (`urgent` for that product), not the instant beans hit 0.
- Half-credit: opening the pantry sheet and taking the right sack marks `${key}:sack`; the hand
  then only shows the **route** to the machine; `holdCompleted` marks the lesson proven. Two
  successful refills of any supply mark all refill lessons proven.
- Hysteresis: once a mode (`tap`/`route`/`hold`) is shown, keep it ≥ 0.8 s before switching; never
  hide on `PROGRESS_RESET` while the player is within 4 m and moving toward the target; mode changes
  cross-fade (opacity 0.15 s) rather than hide → dwell → show.
- Tests extend `test/interaction-coach*.test.js`: no lesson before 6 s empty; sack taken → route
  only; two refills → suppressed.

**6.5 Residents** — §5.4 and §3.6.

**6.6 Deploy trigger** (`.github/workflows/pet-cafe-preview-pages.yml`): add
`'pet-cafe-tycoon/src/**'`, `'pet-cafe-tycoon/data/**'`, `'pet-cafe-tycoon/index.html'` to
`paths`. Keep `workflow_dispatch`.

---

## 7. Engine work the content needs

### 7.1 Regions (`data/area1.js`, `sim/nav.js`, `render/props.js`, `systems/stations.js`, `sim/ownerState.js`)

`area.regions = [{ id, x0, x1, z0, z1, builtBy, floor }]`. Interior `size` is unchanged.
Every site that assumes the rectangle (inventory from `grep -rn "size\.w\|size\.d\|halfD\|halfW\|D / 2\|W / 2" src/`):

- `sim/nav.js buildGrid`: grid extents = interior ∪ regions; a cell outside the interior is free
  only inside a region whose `builtBy` is in `world.built`; the interior's south fence row
  (`|z − halfD| < CELL/2`) is blocked except the gate gap (`|x| ≤ 1.2`) once the terrace is built —
  mirror the door-lane code for the west wall. `refreshActive` already rebuilds the grid on every
  build, so buying the terrace unblocks it with no extra plumbing.
- `systems/stations.js:245` and `sim/ownerState.js:17` clamp the owner to the interior — clamp to
  interior ∪ built regions.
- `render/props.js`: fence at `z = D/2` gets a togglable gate section (`g.gate.setOpen(bool)`);
  `buildRegion(area, region)` renders the deck; `ambience.js` string lights extend along the new rail
  when built.
- `render/environment.js`: split the near band into `garden` (z 7.5–14, shown until built) and
  keep everything else; `terraceDeck` replaces it on `'built' z_terrace` with the `buildReveal` pop.
- `mover.js` / `collide.js`: verify no hard bounds on `size`; the grid is the authority.
- `sim/customers.js`: guests are `terraceBound` at spawn when a terrace seat is free (probability
  scales with terrace seats ÷ all seats); routing picks the nearest register by queue length.

### 7.2 New station types

`gate` (non-blocking marker), `decor` (blocking, no state), `icecream` (machine, `cream`),
`photo` (queue + tray, `shots`), `restroom` (`tidy`), `splash` (decor with fx). Add each to
`world.js createWorld`, `stationState.js normalizeRow/snapshot` (state fields only), `visuals.js`
(mesh + demand pill), `props.js` (mesh factories), `botDecide.js` (interaction or explicit skip),
and `saveSchema.js` (new zone ids are validated against `area.zones`, so appending zones is enough).

### 7.3 Save v5

`saveSchema.js`: `CURRENT_SAVE_VERSION = 5`; v4 → v5 migration adds `meta.followers: 0`,
`meta.album: {}`, `meta.equipped: {}`, `meta.residents: []`, `meta.decor: []`, `meta.goldenPaw: false`,
`meta.season: { index: 0, dayStart: 1 }`, `meta.franchise: { level: 0 }`; every field bounded
(followers ≤ 1e6, album keys validated against `PET_PROFILES`, accessory ids against the catalogue).
Tests in `test/save-schema.test.js`: v4 fixture migrates with defaults; tampered values clamp.

### 7.4 UI surfaces (all icon-first, all through the layout arbiters)

- Wallet pill: "saving for ▢" progress ring around the coin (next unbought unlock).
- Followers pill (heart) in the left HUD stack; `hudLayout.js` short-viewport row 2.
- Star sheet: the ★ button opens the Paw Rating checklist (icons + numerals + check marks).
- Pet Book: **Album** tab, portrait cards, accessory picker, resident badge.
- Kiosk: **Décor** tab.
- Build circles: unchanged (walk + hold), plus the `speed-build` offer button when ≥ 40 % paid.
- Photo mini-game overlay: the shrinking ring is a DOM element over the projected pet position
  (`fx.project`), registered with `labelLayout` as `.wish` priority so it never hides behind HUD.

---

## 8. Batches — execute in order, deploy after each

Each task lists files and the check that proves it. A batch is done when its checks pass **and** the
increment is live on the URL.

### Batch 0 — Correctness and the look (1 session)

| # | Task | Files | Check |
|---|---|---|---|
| 0.1 | **P0** display restore clamp (§6.0) | `sim/stationState.js`, test | new test; `npm test` |
| 0.2 | Deploy trigger paths (§6.6) | `.github/workflows/pet-cafe-preview-pages.yml` | push → workflow runs |
| 0.3 | Time of day + de-sepia (§5.1, §5.2) | `render/daylight.js` (new), `scene.js`, `palette.js`, `post.js`, `game.js`/`main.js` wiring | screenshots at t = 45 / 175 / 225 / 240 |
| 0.4 | Chalk labels → icons (§5.5) | `systems/visuals.js`, `style.css` | screenshot; audit 0/13 |
| 0.5 | Runner need-based pick + watchdog (§6.1) | `sim/staff.js`, `tools/bot.js` (invariant D), test | bot: runnerStuck 0 |
| 0.6 | Dirty tables (§6.2) | `sim/customers.js`, `sim/serviceQuality.js`, `systems/visuals.js`, `ui/serviceSummary.js`, test | test; bot lost-sales still in band |
| 0.7 | Cleaning presentation (§6.3) | `sim/world.js`, `sim/staff.js`, `systems/visuals.js`, `systems/staff.js`, `render/human.js` | screenshot of cleaner mid-clean |
| 0.8 | Coach lifecycle (§6.4) | `ui/interactionCoach.js`, tests | tests |
| 0.9 | Residents on furniture + rig polish (§5.4) | `systems/residentPets.js`, `render/pets.js`, `render/props.js` (beds) | screenshot |
| 0.10 | Garden flowers (§5.3) | `render/environment.js` | screenshot; tris ≤ 210k |
| 0.11 | Décor catalogue (§3.12) + kiosk tab | `data/decor.js`, `render/decor.js`, `ui/sheets.js`, `sim/economy.js`, save v5 (§7.3 — do the whole migration now) | bot invariant A green for days 2–6 |

Deploy. Owner playtest.

### Batch 1 — The Terrace (2 sessions)

| # | Task | Check |
|---|---|---|
| 1.1 | Regions in nav/props/clamps (§7.1) with `z_terrace` data, gate, deck, reveal | `test/nav-regions.test.js`: cells blocked before, walkable after; owner can walk through the gate; bot 0 stalls |
| 1.2 | Terrace seats + terrace-bound routing + nearest-register routing | bot: seated share rises after day 14 |
| 1.3 | Ice cream lane: products, machine, cream sack, pantry choice, barista #2 lane, coach lesson, bot refill | bot day table shows icecream sales; runner invariant D holds |
| 1.4 | `register3`, cashier #2 assignment | bot: register3 processes |
| 1.5 | Restroom comfort + cleaner chore; fountain fx; splash pool + play break | tests for tidy buff; screenshot |
| 1.6 | `economyConfig.js` + bot invariants A–E as gates; tune terrace prices to §4.2 | `npm run bot` green through day 40 |
| 1.7 | `speed-build` rewarded placement | `tools/task38`-style smoke: one claim per shift |

Deploy. Owner playtest.

### Batch 2 — Pets front and centre (2 sessions)

| # | Task | Check |
|---|---|---|
| 2.1 | Photo studio station, queue, mini-game overlay, tray, bot auto-resolve (§3.2) | test: score bands; bot flows |
| 2.2 | Portrait renderer + Album tab (§3.2.1) | screenshot of the album with 6 portraits |
| 2.3 | Followers pill + effects (§3.3) | test: bounded multipliers |
| 2.4 | Accessories catalogue, rig attach, equip UI (§3.5) | screenshot: a dog in a bandana |
| 2.5 | Besties move in (§3.6) | test: Bestie → resident slot; screenshot |
| 2.6 | Hamster + legendary coats (§3.7) | book shows 20; audit 0/13 |
| 2.7 | `rare-visitor`, `golden-shot` placements | smoke |

Deploy. Owner playtest.

### Batch 3 — The goal (1 session)

Paw Rating sheet + effects (§3.4), Golden Paw ceremony, awning sets 4–6, decor sets per star,
"saving for ▢" wallet ring, day-summary rows for missed seats / photos / followers.
Check: a scripted 40-day bot run reaches ★3 by day ~20 and ★4 by ~day 34; ceremony fires once.

### Batch 4 — The Spa and Seasons (2 sessions)

**4a ✅ live** — Seasons (§3.8); the bot harness made honest (staff actors + service policy); the
runner arrival fix; demand bounded past a soft cap; the season save exploit closed.

**4a-fix** (found by the post-4a review; do before 4b):
| # | Task | Check |
|---|---|---|
| 4a.1 | **Text → icons on the play field.** 42 banner/toast call sites across 9 files, plus the "Host a Pet Social" / "MYSTERY GIFT" buttons and the coach verb captions — rule 5 was only ever applied to chalk labels (§5.5). Proper nouns and numerals stay; sentences, verbs and labels go; aria-labels survive. | `test/play-field-text.test.js` fails before / passes after; screenshots at day 1 and at the day-8 policy moment; `production-smoke` proseLeak stays false |
| 4a.2 | **Make seasons visible from the default camera.** The palette lands on the far garden and the garland, which sit *behind* the camera; once the terrace is built the visible garden is flat deck and the four seasons are near-indistinguishable (`shots/seasons/*.png`). Seasonal planters on the deck, a garland along the fence lit in the evening, fountain tint — positions never move. | four midday + four evening screenshots with the terrace built; a stranger can name which is which |

**4b** — §3.9 the Spa. Check: bot to day 60 green (`MAX_DAYS`); invariants A–C hold to day 45; audit 0/13 (now 13 viewports × 5 states).

### Batch 5 — Franchise and hardening (1 session)

§3.11; then a full certification pass: audit, `production-smoke.js` (the `nextChase`/`perfectText`
empties were cleared in Batch 3; one pre-existing assertion about returned waste still fails and
predates every batch — root-cause it), `playables-cert-smoke.js`, task25, task38, a 30-minute
real-device session in portrait and landscape. Also from Batch 4a: the runner watchdog fires ~11
recoveries/day (`runnerStuck`, self-correcting but wasteful) and `src/sim/world.js` seats a display's
queue slot 0 only 0.1 m beyond the display's front — the geometric root of the runner pin.

---

## 9. Definition of done for the program

- A new player on day 1 sees a bright, saturated café with living pets on furniture and no English on the play field.
- On every day from 2 to 45 the bot finds something affordable, and a new content unlock at least every 3 days to 30 and every 5 days to 45 (invariants A–C green).
- By day ~15 the player buys the terrace and watches the garden become one; by ~28 the spa.
- Pets are photographed, dressed, and move in; the album fills toward 20; followers change the café.
- The Paw Rating reaches ★5 with a ceremony; Seasons keep changing the look; Franchise is offered.
- Dirty tables cost something visible; runners never freeze holding stock; cleaning looks the same whoever does it; the coach never flickers.
- Every gate in §0 rule 2 is green, the responsive audit reports 0/13, and the increment is live.

*End of program. Start with Batch 0, task 0.1.*
