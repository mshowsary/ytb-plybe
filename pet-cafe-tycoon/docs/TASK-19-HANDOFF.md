# Task 19 handoff — shared actor roster

Repository: mshowsary/ytb-plybe. Branch: chatgpt/pet-cafe-production. Main unchanged.
Previous remote implementation: b7211b64b2abb2afc0c5a4ac9ec9134f4d665398 (Tasks 17–18 plus CI recovery).

## Implemented

- `sim/actorRoster.js` builds one deduplicated, frozen membership array for an avoidance step, excluding departed/inactive actors. Mover positions remain mutable simulation state.
- Customer spawning and staff creation/assignment preparation happen before customer navigation. Live Barista preparation joins the same boundary. Customers therefore see hired workers from the first movement pass, not only after staff updates.
- Customer/staff/Barista movement consumes that same roster; Barista no longer pushes/pops itself. Frame completion clears ownership for standalone simulation callers. The headless Barista economy runner uses the same preparation/roster boundary.
- Integration uncovered genuine near-station customer orbits: complete worker awareness could hold guests about 8cm from their target, just outside the 5cm navigation epsilon. Customers now accept physical arrival within 10cm, without snapping coordinates. This stays inside checkout's existing 15cm head check. No prices/capacities/rates changed.
- Existing live Barista browser smoke now observes frozen/deduplicated roster membership at the actual Barista update, including exactly one Barista. Focused diagnostic runs this alongside lifecycle without the economy matrix.

## Validation

- 365 unit/simulation tests passed. New tests cover frozen membership, deduplication, inactive/departed exclusion, clean standalone fallback, and mixed Barista/Runner/customer coffee-lane and doorway encounters.
- Both 25-day economy scenarios finished with zero recorded stalls and zero teleports after the near-target fix. Before that fix the new shared avoidance exposed 40/92 stalls; the detector was kept unchanged.
- Production build/postbuild passed. Existing Three.js 512KB SHOULD warning remains.
- Focused browser results must be read on the published task SHA. Do not infer full Production certification from these diagnostics. Manual crowded-café visual review remains outstanding.

## Next task: 20 — shared economic ledger

Work in game.js, customer/friction/party systems and new sim/ledger.js. Record sales, cash collection, bonuses, spending and deductions with categories and transaction IDs. Distinguish accrued sales from collected wallet money. Reconcile wallet deltas and preserve accounting identity through reload. Share the accounting rules with bots. Do not tune prices, fees or reward amounts during this refactor.

Then Task 21 is runtime/bot parity, followed by Tasks 22–28 economic experiments/contracts. Continue with Fast Checks and focused regressions; full Production is manual at a coherent batch or release checkpoint. Read root AGENTS.md. A red certification is a release/certification blocker, not a prohibition on independent development.

## Important continuity

Tasks 17 and 18 are remotely delivered. The old integrated lifecycle smoke passed remotely at b7211b6 (run 34035586560), and Fast Checks passed (34035586541). Do not reopen that old failure based on historical red runs.
Earlier Astra art, coaching, party platter and first-hire-demo commits lived on a separate local branch and are NOT integrated into this remote baseline. Do not claim Tasks 29–37/43 delivered here. Recover and reconcile those changes later, preserving the newer presentationScheduler and shared Barista/roster work.
Full release/publisher certification and human research gates are not claimed complete.
