# Pet Café: current references, diagnostics and completion

Branch: `chatgpt/pet-cafe-production`, following `73606e607002376e58a20edad24ff72e843e4c60`.

## Implemented

- Task 40 capture workflow: current boot/full café/coffee-empty/hire/rush/Bestie-renovated/summary screenshots at 390×844 and 844×390, recorded sessions containing actual item pickup/drop and keyboard walking, plus SHA/viewport/user-agent manifests. It uses canonical restored fixtures and real inventory transactions. The first run caught the capture script reading a bot-only carry counter; it now observes `G.owner.items.length`, the actual gameplay inventory. No game assertion was weakened.
- Task 45 instrumentation foundation: opt-in bounded frame capture at `window.__performanceCapture`. `start()` resets a 1,800-frame ring; `stop()` returns p50/p95/p99/max uncapped frame elapsed time, >100ms stalls, UI and render CPU timing, draw calls, triangles and optional heap. Simulation dt remains capped and unchanged. Unsupported heap is null. UI timing includes responsive/shell/coach work, not a claim to isolate every DOM operation.
- Task 47 implementation: room completion derives from saved building ownership. Only the genuine final build event triggers a brief existing-pool burst/chime/banner; loading a completed room does not replay it. Café Journey and summaries give explicit optional friendship/renovation/mastery/upgrade paths. Fully exhausted finite content is recognized only after all builds, pet Besties, renovations, mastery and upgrades, then presents favorite pets and weekly cups as optional. No fake area, new currency or duplicate completion reward.

## Validation and limits

470 local tests and production build pass. Current reference capture and GitHub gates must be checked at the pushed SHA. Previous instrumentation-only head `c4c18ed09870784b3e10578b7e044dfbdfe1b40d` passed Fast Checks, lifecycle and Task 25 save/progression certification.

These are CI desktop captures, not low-end Android/iPhone performance acceptance. Temperature and background load are unknown and labelled accordingly. Gate C human ad-expectation/pet-recall evidence remains open. Task 47 browser presentation also needs current evidence review; unit tests alone do not certify it.

## Continue

Review the current visual-reference artifact before Task 41 camera or Task 42 palette tuning. Task 43 transaction handoff polish and Task 44 real audio-mix review remain. Collect actual 10-minute device profiles with the opt-in recorder for Task 45 before choosing Task 46 optimizations. No speculative render cleanup was made. Task 48 release packaging, Task 49 human commercial study and Task 50 release decision remain; do not mark the game commercially certified from CI.

Live preview remains https://mshowsary.github.io/ytb-plybe/ and its workflow is refreshed with this batch. Keep the prior Task 38–39 ad/save fixes and batched certification cadence.
