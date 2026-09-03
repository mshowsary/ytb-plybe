# Milestone 2 carry-over — items for Milestone 3 (from the M2 final review, 2026-09-02)

Milestone 3 is the platform layer (ytgame save/load, pause/resume, host mute, ads, i18n). Do the "before features" items first; they are what make the platform work correct.

## Before features
1. **Timer registry.** `setTimeout` is used in `fx.js`, `hud.js`, `sheets.js`, `synth.js`. Add `src/core/timers.js` (`set`, `clearAll`, `pauseAll/resumeAll`) and route every call through it so `onPause` can stop everything.
2. **Game clock, not wall clock.** `Date.now()` drives `boosts.x2Until` in `game.js`. Use `G.time` (advanced only by `update`) so a host pause does not burn boosts.
3. **Persistent state hoisted onto `G`.** `endShown`, gate open flag, sheet arming, hint flags, spawn timer/seq/species cursor and rng cursor live in system closures; a restored save replays hints and the end card. Put them in `G` and in `snapshot()`.
4. **i18n table.** Every user-facing string is an English literal across `sheets.js`, `models.js`, `zones.js`, `stations.js`, `index.html`, `data/area1.js`, plus two `toLocaleString('en-US')` calls. Extract to `src/ui/i18n.js` with the 8 languages; `getLanguage()` is the only source.
5. **`dispose()` discipline.** Only `input.dispose()` exists; add scene/resize/leash/render-record teardown.

## Performance (the full-house gate fails: 208 calls / 203 k triangles vs 200 / 150 k)
6. Counter and oven item meshes (36) → one `InstancedMesh` per product.
7. Shadow casters: blob shadows or cast only from bodies; drop shadow casting for items and props that do not read.
8. Triangle audit: humans/pets share geometry but the per-part segment counts add up; halve sphere segments on eyes/cheeks and the hair cap.
9. `three` chunk 547 KB (> 512 KB SHOULD); check tree-shaking of addons.

## Gameplay polish
10. Species weighting and VIP pets (spec) — species is still round-robin.
11. Pet carries only one item when the order is 2; `+N` feedback when a customer pays.
12. Zone labels clamp to the viewport; kiosk/hire props read from the camera side (kiosk now rot 0).
13. `takeT`/`dropT` per station, not global.
14. Awning hides the north windows; ground slab merged into the shadow-casting static mesh; hearts never spin; floor reads tan; `part()` zero-scale guard; `merge([])` guard.
15. Dead code: `queueSlots/checkoutSpot` in `data/area1.js`, duplicated `rotateOffset`, `S.setQuality` without `needsUpdate`, unused imports.

## Tests to add
- Round-trip `snapshot/restore` through `createGame` once a three-free render stub exists (or keep the sim-level `save.test.js` and add a DOM-less visuals sync test).
- Pacing assertion inside `npm test` (bot as a test with the 90 s / 11 min bounds).
