# HANDOFF — Pet Café "Golden Paw" Upgrade (in progress)

Branch: `claude/pet-cafe-economy-viz` (forked from `origin/chatgpt/pet-cafe-production` @ 22ecfcc)
Return points: remote branch `chatgpt/pet-cafe-production` (untouched) + local tag `return-point/pre-upgrade`.
Main's uncommitted screenshot/CSV deletions are stashed (`git stash list` — "main: uncommitted deletions…").

## Mission (owner's brief)
1. **Meta economics**: pre-roll, rewarded ads "and more", retention + playtime, balanced economy.
2. **Depth**: more days/things to build/upgrade, bonuses & challenges on theme.
3. **Visual flex**: pets, coffee machine, drinks, physics, animations.
4. **Icon-first minimal-text UI** (YouTube Playables convention: icons, no prose).
5. Don't ruin the game; deploy live via the GitHub Pages pipeline when done.

## Deploy pipeline facts
- `pet-cafe-preview-pages.yml` deploys `pet-cafe-tycoon/dist` to GitHub Pages. Triggers on push to
  `chatgpt/pet-cafe-production` **only when the workflow file itself changes**, or manually:
  `gh workflow run "Pet Cafe Live Preview" --ref chatgpt/pet-cafe-production`.
- It runs `npm test` then `npm run build` as the gate. So: full suite must pass before merge/push.
- `pet-cafe-production.yml` = manual full certification (suites: all/lifecycle/gameplay/visual/publisher/economy).
- gh CLI authenticated as `mshowsary`. AGENTS.md: never force-push, keep main unchanged, keep genuine test assertions.

## DONE so far (committed nothing yet — all changes are working-tree on the branch)
### New files
1. `src/sim/specialDays.js` — deterministic per-day themed challenges (6 themes: puppy/catcafe/
   bunnybrunch/latte-rush/sweet-tooth/berry-blast; species+family bias, tipBonus, target, reward),
   from day 3; plus deterministic Golden Hour (2x tips, 25s, early afternoon, ~38% of shifts from
   day 2). Exports: THEMES, specialForDay(day), saleMatchesTheme(special,key,familyOf),
   specialProgress(special,themedSales), specialReward(special), goldenHourForDay(day),
   createGoldenHourState(), stepGoldenHour(state,schedule,dayT,dt)→started, goldenHourMult(state).
2. `src/sim/rewards.js` — Gift Calendar (real-UTC-day streak, 7 slots, CALENDAR_REWARDS
   [120..1000], final slot restock flag) + Mystery Paw Gift (deterministic per-day ~55% from day 3,
   mysteryForDay(day)→{startT,day}, mysteryCoinsForDay(day,baseline) 80–500 coins @0.3×baseline,
   mysteryRewardKindForDay(day,goldenActive)→'coins'|'restock'|'golden'). Exports:
   dayKeyFor(ms), isConsecutiveDay(prev,key), normalizeCalendar(raw), advanceCalendar(cal,key),
   calendarSlotIndex(cal,key) (null = claimed today), calendarRewardFor(i), calendarIsFinalSlot(i).

### Modified files
3. `src/sim/adPacing.js` — REWROTE: placement-scoped rewarded claims. `summaryClaimedForShift`
   (numeric day key), `inShiftClaimedForShift` (relief: + gift: keys share one in-shift budget),
   `rewardedClaimedForShift` kept as legacy union; `markRewardedClaim(meta,day,'summary'|'relief'|'gift')`;
   `bootInterstitialDue(completedDays)` ≥3 = welcome-back interstitial (pre-roll equivalent);
   interstitial cadence now every **2** shifts (was 3). AD_PACING still has rewardedClaimsPerShift=1
   (per placement) + 4-min interstitial gap.
4. `src/platform/adLaunchPolicy.js` — rewarded requests no longer blocked by the shared 4-min gap
   (user-initiated); interstitials keep both gap checks; `canRequestAd('rewarded')` drops gap.
5. `test/ad-pacing.test.js` — updated: new placement-model test, cadence now every-2-days + boot
   spot, legacy recognition includes 'gift:'. **STILL FAILING (2 tests, not yet edited)**:
   - line ~147 "launch spacing applies from interstitial to rewarded as well" — asserts rewarded
     IS gap-blocked. Rewrite: rewarded works immediately after an interstitial (user-initiated),
     e.g. request interstitial at t, request rewarded right after → true.
   - line ~159 "a request at clock zero still starts the shared cooldown" — asserts rewarded→
     rewarded cooldown. Rewrite: rewarded is user-initiated (no hidden clock): two calls both true,
     keeping pause/adBusy gating (busy check: set p.adBusy=true → false).

## NOT STARTED (remaining plan, in order)
1. Fix those 2 tests; run `node --test test/ad-pacing.test.js test/ad-lock.test.js`.
2. **Save schema**: add `meta.rewards = { calendar:{lastKey,streak}, giftClaimedDay? (use rewardedDays gift: keys), specialStats? }` — extend `normalizeRewardedDays` regex in `src/sim/saveSchema.js` to `/^(?:(?:relief|gift):)?(\d+)$/`; add a `normalizeRewards` for meta.rewards (bounded strings/ints); wire into `validateAndMigrateSave` meta + `G.snapshot()` in game.js + `applySave` in src/sim/save.js. Keep v4 (optional group w/ defaults).
3. **game.js wiring** (src/game.js):
   - `G.meta.rewards = normalizeCalendar(...)` on create/restore.
   - golden hour state: `G.golden = createGoldenHourState()`; each update: `stepGoldenHour(G.golden, goldenHourForDay(G.dayState.day), G.dayState.t, dt)`; on start → banner + scene golden tint + fx sparkles; on day transition reset usedToday (createGoldenHourState()).
   - special day: `G.special = specialForDay(G.dayState.day)`; themed sale counting: in the `pay` event loop, `saleMatchesTheme(G.special, product, familyOf)` → increment `G.dayStats.specialServed` (add to freshDayStats + SHIFT_STAT_KEYS in saveSchema + snapshot); at settlement (openDaySummary) if `specialProgress().met` → `G.coins += specialReward(G.special)` + show chip (icon-first).
   - price injection (game.js line ~138): multiply by `(1 + (G.special ? G.special.tipBonus : 0) * (saleMatchesTheme? 1 : 0)) * goldenHourMult(G.golden) * (1 + musicMult) * (1 + perchMult)` — see zones below. Customers compute price at register (sim/customers.js calls `price(key, seated)`); safe.
   - Mystery gift: on shift start compute `mysteryForDay(day)`; when `dayState.t >= startT` and not yet offered and not `inShiftClaimedForShift(meta,day)` → show gift UI; on claim: rewarded ad → `markRewardedClaim(meta, day, 'gift')` → apply kind via mysteryRewardKindForDay.
   - Calendar: after restore/boot, `calendarSlotIndex(meta.rewards.calendar, dayKeyFor(Date.now()))` ≠ null → show gift button; claim → rewarded ad → `advanceCalendar` → coins (+ restock top-off displays/machines if final slot).
   - Boot interstitial: main.js after `platform.gameReady()` first frame: `if (bootInterstitialDue(G.meta.completedDays) && platform.canRequestAd('interstitial')) { platform.noteAdEligible('interstitial','boot:returning'); platform.requestInterstitialAd(); }` — once per session (guard flag).
   - Summary rewarded offer: change `rewardedClaimedForShift(G.meta, completedDay)` (game.js ~line 220) to `summaryClaimedForShift` and `markRewardedClaim(...,'summary')` (already 'summary'). economyExperience.js relief offers must check `inShiftClaimedForShift` instead of `rewardedClaimedForShift` — find its usage (it imports reliefClaimKey; search rewardedClaimedForShift across src/).
4. **New zones** (depth): add to `data/area1.js` zones+stations:
   - `z_playground` "Pet Playground" price 2600 requires z_seats2, at east side (x≈7.5,z≈6.0? check collisions vs seat6/bush3; area is 20×14, x∈[-10,10], z∈[-7,7]), adds `playground1` type 'playground'.
   - `z_music` "Music Corner" 3400 requires z_playground, adds `music1` type 'music' (gramophone).
   - `z_perch` "Sunroom Perch" 4800 requires z_music, adds `perch1` type 'perch' (window birdhouse).
   - Effects: playground → pet patience decay ×0.88 (hook: sim/customers.js `setPatience(w,c,c.patience - dt)` call sites → `dt * patienceRate(w)` where patienceRate(w)=0.88 if any active playground station else 1 — w.dayState gating not needed since tests never build it); music → global tip +8%; perch → seated orders +6% (bake into price()).
   - Render: new meshes in `render/props.js` (playground: platforms+ramp+yarn; music: gramophone horn; perch: shelf+birdhouse+2 birds), register in `systems/visuals.js` MESH_FOR map, zone ring/preview comes free via zones system. Zone label text is world-space `.zlabel` — keep labels tiny or icon.
5. **Visuals**:
   - `render/pets.js`: split eyes into separate meshes for blink (scale.y 1→0.1, random 2.5–5s per pet), squash&stretch on hop/land (body scale spring), ear wiggle (unmerge cat/dog ears into own mesh group, wiggle on happy), 2-segment tail (base+tip groups, phase-offset wag). MUST preserve P API exactly: group/neck/height/species/variant/setMood/carry/sit/stand/setHop/update/react/followTarget.
   - `systems/machineJuice.js`: coffee — pour stream (thin dark cylinder group-head→cup while brewing), cup fill level rises with st.timer/st buffer progress, 5-puff sine-wiggle steam (replace 3 spheres); blender — liquid level rises with stock, fruit plop burst on refill; oven — ready sparkle once when stock crosses 1 (edge detect).
   - NEW `render/butterflies.js` — 3 butterflies (2 flapping quads on sine) wandering garden area (x 6–10, z 3–7); update(dt) called from main.js frame next to machineJuice.
   - NEW `render/yarnBall.js` — physics yarn ball in playground: velocity+friction+wall bounce, rolls (rotation from velocity), kicked periodically; only when playground built.
   - `render/scene.js`: add `S.setGoldenHour(k 0..1)` — lerp sun color→'#FFD9A0', intensity 2.05→2.35, hemi→warmer, fog→'#F7E3C4'; call each frame from main.js with smoothed k from golden state. Respect reduced motion (jump k).
6. **Icon-first UI** (YouTube Playables style, extend `src/ui/icons.js` convention):
   - New icons needed: gift, calendar, sun (golden), bell (rush), moon (closing), music note, bird, sparkle, heart, dog/cat/bunny faces (for special-day chip + pet book), check.
   - `ui/hud.js`: `H.banner` accepts `{icon,text?}` (render icon SVG big + optional short text); day pill: phase label → icon (sun/bell/moon/sun) keep "Day N" number, keep aria-label; `H.toast(icon, text?)` variant for icon-first toasts (service misses: person icon + "−N").
   - `ui/sheets.js` renderSummary: rows → icon+value grid (coin icon + number, person icon + served, coral sparkle + recovery), keep aria-labels with full text; title "Day N ✓" keep.
   - `ui/meta.js` pet book cards: species text ("CAT") → species icon; rarity text → colored pip dots (common=gray, rare=purple, epic=gold).
   - `ui/pauseMenu.js`: ON/OFF text → toggle switch visuals only.
   - Special-day chip + golden-hour chip on day pill (icon-only, tooltip aria).
   - New UIs (calendar button w/ dot pips, mystery gift card) built icon-first from scratch.
   - WARNING: some tests/tools assert text (certificationPolish compact labels, serviceSummary). Run full suite; convert honestly (update assertions that encode presentation, keep gameplay assertions).
7. **Tests to add**: test/special-days.test.js (determinism, day-2/3 gates, progress/reward), test/rewards.test.js (calendar streak/consecutive/wrap, mystery determinism/coins bounds), save-schema round-trip with meta.rewards.
8. **Verify**: `npm test` (full, ~84 files), `npm run build`, then browser smoke: `npm run preview` + playwright via `npx playwright` or use browser-use skill; check: new-day special chip, calendar button, golden hour tint, zones buildable, pets blink, coffee pour. tools/runtime-bot-parity.js + task25-live-cert.mjs exist for deeper runs.
9. **Commit + push** `claude/pet-cafe-economy-viz`, then merge FF into `chatgpt/pet-cafe-production` (no force), then `gh workflow run "Pet Cafe Live Preview" --ref chatgpt/pet-cafe-production`, watch `gh run watch`, verify Pages URL serves new build.

## Key architecture notes (for the next agent)
- Frame loop: main.js → G.update(dt) [game.js: sim systems] → baristaWorker → finishActorStep → petMess → machineJuice → coffeePolish → cashTrays → UI → S.noteFrame → S.render. Add new render updaters in main.js startGame + frame.
- `price(key, seated)` closure in game.js line ~138 is THE income gate: salePrice × mastery; inject special/golden/music/perch mults here.
- Species spawn: sim/customerSpawn.js round-robins SPECIES (cat,dog,bunny) — RNG draw order is sacred (bot parity). To bias species for special days, override AFTER `resolveUniquePetIdentity` in systems/customers.js spawn() without consuming extra rng draws.
- wishFor(w) in sim/economy.js: add optional special-day product-family bias — only draw extra rng when dayState && special (tests don't set it).
- Save: game.js G.snapshot() ↔ saveSchema.validateAndMigrateSave ↔ save.js applySave must all be extended in sync.
- Pet API (render/pets.js) consumers: systems/customers.js, systems/petMess.js, baristaWorker; don't break.
- No EffectComposer (build guard forbids three's Timer via postprocessing imports).
- Instanced meshes + merged geometry via render/geo.js `part()/merge()/mesh()`; toon material singleton in render/palette.js.
- 84 test files under test/; npm test = node --test test/**/*.test.js.
