# Milestone 3 carry-over — from the M3 final review (2026-09-03)

The final review approved the navigation core and the loop. These are the items it deferred, grouped by the pass that should take them.

## Next balance/polish pass
1. **Owner ↔ crowd avoidance.** The player is invisible to customers (and walks through queues). Add the owner's circle to the avoidance list customers read; the player is never pushed.
2. **Perf gate red.** Forced full house ≈ 191 draw calls / ~164 k triangles vs 200 / 150 k. Cheapest: `RoundedBoxGeometry` segments 3 → 1 in `geo.js`, eye/cheek spheres 6×3 or boxes, merge arms into the body when not carrying. Wire the shot budget into `npm test`.
3. **Friction index** replaces the busy index (share of customers who waited > 6 s, target 30–60 %); attack the 100 s cadence (the `z_kiosk` step at 850 after 640 is the whole gap).
4. **Bot honesty.** `botDecide.js` discards a held kibble sack or fruit to escape dead ends; give the game a real drop-the-sack action at storage (or allow topping up partially full machines/bowls) and delete the bot's discards; drop the "2 s stuck = arrived" valve in `tools/bot.js`.
5. `fanSpot` `slot % 6` vs a 12 pool (7th treat-seeker overlaps the 1st); hint flags written but never read (`refillCoffee/refillBowl/harvest/blend/clean`); pip `classList.toggle` per frame ungated; `cachedPath` Maps recreated per frame; hire button alignment on the Runner row; a cold-start (minutes 0–2) play strip.

## Platform milestone (save/load, pause, ads, i18n)
6. `G.restore` must reset transient state: seats occupied/dirty, counter items, machine stock/beans/fruit/stage, register piles, carry, the `_doorTaken_*`/`_bowlTaken`/`_queues` pools; add a `resetTransient(w)` and a restore test.
7. `Date.now()` in `game.js` pricing (boost expiry) and `performance.now()` in `hud.js` → `G.time`.
8. Timers outside the update loop: `fx.js`, `hud.js`, `sheets.js`, `synth.js` `setTimeout`s → a frame-driven timer list so pause and interstitials stop everything.
9. Dispose paths for `scene.js` resize and `sheets.js` listeners.
10. i18n: ~30 hardcoded strings across `zones.js`, `objective.js`, `models.js`, `sheets.js`, `hud.js`, `index.html`, plus `toLocaleString('en-US')` calls.
11. Save semantics decision: "reload = fresh café, same progress" and enforce it.

## Tests to add
- `G.restore` resets everything transient (item 6).
- The balance targets as a test (the bot's exit code inside `npm test`, with the friction index).
