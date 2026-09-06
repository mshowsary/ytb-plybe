# Pet Café continuation: Tasks 25–26

Branch: `chatgpt/pet-cafe-production`. This change follows remote `1830600d324ec743d89002dbecf56ee04af27fb7`.

## Implemented

- Task 25 blocker: `baristaWorker` wrapped `G.restore` but discarded its boolean result. A successful restore therefore looked rejected to the mobile certificate; actual rejection was also hidden from callers. The wrapper now propagates the result, leaves the current worker intact on rejection, and only tears down after successful restore. Regression covers both return paths and detaching the wrapper.
- Task 26: current contract pictogram, counter and progress ring inside the existing shift pill. Serve, earnings and streak use their actual career metrics. Completion pulses once on crossing the target, resets for a new shift, respects reduced motion, and uses a compact layout at 320px. Accessible progressbar metadata accompanies the pictogram. The old persistent goal sentence remains hidden.
- Existing Task 25 mobile certificate now also verifies contract progress, completion and 320px fit, producing two additional screenshots. Its genuine snapshot round-trip assertion remains strict.

## Validation

Local: all 394 tests passed, production build passed, no-fee certificate passed. The build retains its existing Three.js bundle-size warning. Production mobile browser certification must be checked on the commit containing this handoff; do not infer browser or YouTube publisher certification from local tests.

## Next work

1. Check the single targeted `Pet Cafe Task 25 Live Certification` run for this commit. It covers the real Desk → Runner path, genuine save round trip and the new contract HUD. Inspect its evidence screenshots; do not repeatedly launch the full Production workflow for minor changes.
2. Task 27 is **not implemented here**: stabilize adaptive contracts in `sim/career.js` and ledger/tools. Replace unbounded personal-best escalation with achievable capacity-aware targets; measure beginner first-shift throughput instead of defaulting to 24. Target 70–85% normal-policy success after learning, preserve previous awards, and prevent intentional underperformance from becoming advantageous. Use the latest blueprint for exact remaining requirements.
3. Continue independent implementation with focused tests. Batch expensive browser certification at agreed milestones (approximately ten tasks); run it sooner for a demonstrated browser regression. Keep implementation, focused validation, production browser and publisher certification status distinct.

This change does not assert that all tasks before or after Task 26 are complete. Preserve the previous model's Task 25 economy and mobile work; do not restart that investigation or loosen the restore assertion.
