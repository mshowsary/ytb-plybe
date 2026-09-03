# Milestone 1 carry-over — items deferred to Milestone 2 (from the M1 final review, 2026-09-02)

Do these before adding Milestone 2 features. Each is small; together they remove the debt the final review found.

## Structure (first)
1. Split `src/game.js` `update()` into systems: `src/systems/{stations,zones,customers,visuals}.js`, each `(G, dt)`. M2 adds staff, kiosk, hire desk, 8 builds and 6 species to that function.
2. Single serializable state boundary: `G.snapshot()` / `G.restore(save)`; move the wallet into the sim so `createWorld(area, save)`'s symmetry covers the whole save. Do this before save/load exists.
3. Decouple the sim from `data/area1.js`: `customers.js` imports `queueSlots`/`checkoutSpot` from the area file and derives `area` from `list[0]`. Put the helpers on the area object (`area.queueSlots(st, n)`) or pass a `layout` argument.
4. Move spawn/economy constants out of the glue into `economy.js` formulas (`spawnInterval(builds)`, `maxCustomers(builds)`); use the seeded `makeRng` for weighted species and 10 % VIPs.
5. Add a `dispose()` discipline (scene, input listeners, resize listener). There is no `.dispose()` in the project yet.

## Correctness
6. Queued customers never rebalance onto a newly built counter (`pickCounter` runs only on enter). The "Counter 60" build has no visible throughput effect until the line drains. Re-pick the shortest queue when a counter activates.
7. Precompute queue slot positions once per counter at `createWorld` (`st.queue`) and cache the active checkout on `w`; `assignSlots` allocates a Map and sorts every frame; `activeZones` returns a fresh array every frame; per-station `forEach` closures per frame.
8. Seat leak: `seat.occupied` is released only in `eating`; a customer removed during `toSeat` leaks the seat. Add the full-house invariant test (6 customers, 2 counters, 60 s: no duplicate slots, all reach `done`, every seat ends free).
9. `tools/shot.js` samples draw calls once; poll the max across the run or gate on `customers.length === 6`.
10. Resize: shadow-map size chosen once from `innerWidth`; visible-width jumps 12 → 15 → 20 m at aspect 0.8 / 1.25 (zoom pop on rotate). Interpolate the target width by aspect and re-pick the shadow map on resize.
11. `hud.setCoins()` restarts its 350 ms roll every frame while paying a zone; throttle or roll from the displayed value.
12. `setQuality()` toggles `shadowMap.enabled` without `material.needsUpdate`; untested dead code until the perf pass.

## Visual polish
13. Merge animated pet parts to cut draw calls toward 80 (6 pets × ~10 sub-meshes today).
14. Awning hides the north-wall windows; the ground slab is merged into the static mesh (bounding sphere ≈ 64 m, casts shadows) — split it into its own non-casting mesh.
15. Hearts never spin (`lookAt` overrides rotation) — decide whether they should.
16. The floor reads tan rather than cream under lighting variant B; revisit palette or hemisphere intensity.
17. `part()` skips scaling when an axis is exactly 0 (`!= null`), `merge([])` unguarded, invalid hex → black.
18. three chunk is 544 KB, past the 512 KB SHOULD (not a MUST). Watch it.

## Tests to add first
- `payZone` frame-rate independence (added in the M1 fix wave).
- Product round-trip cupcake (added in the M1 fix wave).
- Full-house invariants (item 8).
