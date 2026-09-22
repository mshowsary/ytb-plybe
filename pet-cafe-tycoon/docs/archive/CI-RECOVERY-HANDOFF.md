# CI recovery and Task 17 handoff

Base: remote `99db8c30c11093d01c95de32dfd4158c1955af39`, production branch.

## Actual failure

Production #374, run 34001142445, job 101400105883 failed at gate-a-lifecycle-smoke.js:139:
`CSS transition did not continue after resume`, paused and resumed time both 433.23ms, resumed state running.
The previous pause-drift assertion passed. Do not reopen it as the current failure.

The smoke used a fixed 140ms wall-clock wait after play(), which can return while Chromium still has a pending play task. The patch waits up to five seconds for the same animation to leave pending state and advance more than 40ms. A stalled animation still fails. The paused-time tolerance stays 35ms. The synthetic transition lasts ten seconds so runner delays do not finish it before sampling. Browser verification remains outstanding; local unit tests cannot certify Chromium behavior.

## Workflow correction

Production is workflow_dispatch-only. Fast Checks remain automatic. Preview was already manual on this remote baseline.
Select `lifecycle` for the repaired smoke plus persistence/boot checks; select `all` for full certification.
All 24 pre-existing certification commands are retained exactly once. Five independent suites run with fail-fast disabled; Gate A runs first within lifecycle. Each suite continues to collect independent test results after a failure, then exits nonzero if any failed. Unit tests and builds retain their prerequisite roles.
Every completed check writes a log immediately. Result JSON records the tested SHA. Artifacts upload on failure. The final result stays red if any selected suite fails; focused diagnostics explicitly do not count as full certification.
Later pushes cannot cancel a frozen certification run. Do not force a new full run per minor task.

## Additional implementation

Task 17 ported onto the actual remote baseline: explicit ordered world subscriptions replace the friendship/friction/pet-mess Array.push wrappers. Priorities preserve prior observer order. Runtime/simulation emitters and relevant smoke fixtures use the new dispatcher. No fees, prices, reward logic or friendship-saving behavior was changed. Tests cover event identity/order and independent idempotent disposal.

The earlier local art/party/staff-demo commits are on the other local branch and are NOT included in this recovery branch. Do not claim them remotely delivered or overwrite this newer lifecycle implementation with the earlier presentation clock.

## Verification and continuation

360 local unit/simulation tests passed, including new check-runner failure/timeout coverage and event tests. Production build/postbuild checked separately. Browser certification is pending because local Chromium is unavailable.
Read root AGENTS.md for the user's batched cadence: failed release certification does not mandate halting independent development. Fix demonstrated failures; do not claim certification until the appropriate suite passes on its SHA.
After this patch is remotely delivered, dispatch only `lifecycle` first. If it passes, continue Tasks 18–21 with Fast Checks; run `all` at the coherent batch/release checkpoint. If it fails, use its named log; independent publisher/visual results remain obtainable without the economy wait.

## Remote delivery and Task 18

Recovery and Task 17 delivered as `ef4a99a5e10ce5a5cf6d91826b3f3955afd8a574`; Fast Checks passed remotely. The earlier shell credential issue was resolved by using the connected GitHub app after explicit user authorization.

Task 18 extracts one Barista state machine AND navigation function into `src/sim/baristaState.js`. Both the renderer adapter and the economy A/B tool import it. Rendering taps and metrics are adapter hooks; state transitions, timers, inventory transfers, arrival tolerances and work selection live in the shared module. Blocked delivery retains cups, and loading takes only available stock. No economy constants changed.

A small Lifecycle Diagnostic workflow runs only when lifecycle code/the diagnostic changes, plus manual dispatch. It runs the integrated smoke directly, without economy or unrelated browser gates. It is not full certification. Production remains manual and batched.

Task 18 validation: 362 unit/simulation tests and production build/postbuild pass. Before/after deterministic 25-day Barista A/B JSON matches in every gameplay field; only measured execution wallMs differs.
