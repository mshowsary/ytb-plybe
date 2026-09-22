# Pet Café — Task 28 recovery measurement and visual polish

Branch: `chatgpt/pet-cafe-production`; follows `96d4b0b9388ad409543d5811b7d266f90246e609`.

## Delivered

Task 28 measurement tooling now records owner approach/task/idle seconds by shift phase, useful fetched/delivered/refill units, cleaned seats and build coins, completed purchase/build intervals, contiguous idle intervals, and customer stockout guest-seconds classified as delivery/production/refill/unknown waits. Owner-at-task time means the bot reached its target, not that every second produced output; useful actions are separate counts. Stockout attribution describes station state when waiting, not proof of a navigation defect.

`node tools/recovery-experiment.js` compares current Task 27 contracts and Task 25 staffing with one experiment-only change: rush spawn intervals ×1.10 (about 9.1% fewer scheduled arrivals). Three policies × three fixed seeds × two arms × twelve shifts = 216 simulated shifts. No live demand, production, prices, saves or contract targets changed.

Full reproducible output: `artifacts/task28-recovery.json`. Committed summary: `docs/task28-recovery-evidence.json`, including phase breakdowns, useful work and purchase/idle interval statistics. The nine instrumented control runs exactly matched prior Task 27 results for served/lost customers, wallet, first hire and stockouts; instrumentation did not change the economy.

Visual polish: authored cat/dog/bunny face pictograms replace generic hearts inside the existing visitor name badges, with warm cream cameos and each pet's accent color. No extra HUD panel, assets or WebGL geometry. Phone appearance remains to be reviewed in browser evidence; this does not claim completion of Task 34/35 or the larger art pass.

## Decision from measured evidence

| Policy | Current → slower rush: served | Empty-display guest-seconds | Mean first hire, minutes |
|---|---:|---:|---:|
| Balanced | 374.3 → 354.0 | 602 → 560 | 9.47 → 10.62 |
| Slow | 370.7 → 349.3 | 666 → 693 | 10.47 → 10.72 |
| Staff-first | 377.0 → 353.3 | 528 → 497 | 7.06 → 7.80 |

Almost all sampled empty-display waits have ready producer stock: delivery/stock transfer is the dominant measured constraint. In the slow-policy candidate, recovery-phase delivery waits rise about 136 → 171 guest-seconds. Slower arrivals reduce throughput, delay hires, and do not consistently improve recovery. **Reject this arrival candidate; preserve live pacing.** Next investigate owner/Runner delivery arbitration and comprehension of stock transfer, not blanket production buffs or rewards. Bots are not substitutes for human phone observations.

## Checks and continuation

399 tests and production build pass locally (existing Three.js size warning remains). No full Production/publisher certification was launched. Check automatic Fast Checks and any targeted mobile run on the pushed code SHA before claiming browser certification. Do not rerun expensive certification for this measurement-only change.

Next: Task 29 mechanic learning persistence, then Task 30 coach arbitration. Gate B still needs five fresh human phone sessions; independent development may continue under AGENTS.md's batching policy. Task 29 must persist stable mechanic IDs only after demonstrated success, and remove English-text action recognition. Preserve the already-green Task 25 restore fix and Task 27 frozen-contract save coverage. The Task 35 pet reactions from the prior handoff still need their three phone motion clips and Task 34 identity work.
