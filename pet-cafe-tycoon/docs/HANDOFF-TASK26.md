# Pet Café continuation: Tasks 25–26

Branch: `chatgpt/pet-cafe-production`. This change follows remote `1830600d324ec743d89002dbecf56ee04af27fb7`.

## Implemented

- Task 25 blocker: `baristaWorker` wrapped `G.restore` but discarded its boolean result. A successful restore therefore looked rejected to the mobile certificate; actual rejection was also hidden from callers. The wrapper now propagates the result, leaves the current worker intact on rejection, and only tears down after successful restore. Regression covers both return paths and detaching the wrapper.
- Task 26: current contract pictogram, counter and progress ring inside the existing shift pill. Serve, earnings and streak use their actual career metrics. Completion pulses once on crossing the target, resets for a new shift, respects reduced motion, and uses a compact layout at 320px. Accessible progressbar metadata accompanies the pictogram. The old persistent goal sentence remains hidden.
- Existing Task 25 mobile certificate now also verifies contract progress, completion and 320px fit, producing two additional screenshots. Its genuine snapshot round-trip assertion remains strict.

## Validation

Local: all 394 tests passed, production build passed, no-fee certificate passed. The build retains its existing Three.js bundle-size warning.

Certified code commit: `ebf9989d4d68119afcebd9fda27e43012b0c509c`. GitHub Fast Checks [34050828081](https://github.com/mshowsary/ytb-plybe/actions/runs/34050828081) and production mobile certificate [34050827992](https://github.com/mshowsary/ytb-plybe/actions/runs/34050827992) both completed successfully. The latter proves the genuine save round trip and Task 26 progress, completion pulse and 320px fit, and uploads five screenshots. This subsequent handoff update is documentation only. Full Production/YouTube publisher certification was not rerun and is not implied by these targeted results.

## Next work

1. Resume from the current branch; the Task 25 restore blocker is resolved and the targeted browser gate is green. Review the linked screenshots if needed; do not repeat the investigation or launch the full Production workflow for minor changes.
2. Task 27 is **not implemented here**: stabilize adaptive contracts in `sim/career.js` and ledger/tools. Replace unbounded personal-best escalation with achievable capacity-aware targets; measure beginner first-shift throughput instead of defaulting to 24. Target 70–85% normal-policy success after learning, preserve previous awards, and prevent intentional underperformance from becoming advantageous. Use the latest blueprint for exact remaining requirements.
3. Continue independent implementation with focused tests. Batch expensive browser certification at agreed milestones (approximately ten tasks); run it sooner for a demonstrated browser regression. Keep implementation, focused validation, production browser and publisher certification status distinct.

This change does not assert that all tasks before or after Task 26 are complete. Preserve the previous model's Task 25 economy and mobile work; do not restart that investigation or loosen the restore assertion.
