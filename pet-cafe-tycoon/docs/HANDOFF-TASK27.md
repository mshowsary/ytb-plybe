# Pet Café: Task 27 and pet personality continuation

Branch: `chatgpt/pet-cafe-production`. Parent: `4bf572247eb8de51bd9a2f3f05cc6112a520ae73`.

## Implemented

Task 27 replaces the live game's personal-best target escalation with four productive-capacity tiers, fixed at shift start. First serve target is 20 (all 15 beginner bot runs served 24). Serve targets are 20/24/28/34; earnings 350/650/950/1900; streak 4/5/8/12. Existing rewards and earned awards remain unchanged. The current contract persists through the canonical save schema, so building mid-shift or reloading cannot move the target. Tomorrow's preview uses copied metadata to avoid replacing today's contract. Historical experiment callers without a world context retain their original control behavior.

Partial Task 35 visual implementation: Marmalade turns toward the real oven; Biscuit gives a head tilt and tail greeting; Snowdrop scans the active garden bush. Short idle-only head/tail performances add no geometry, paths, inventory or economic effects. Movement resets the performance; reduced-motion preference suppresses it. Task 34 identity uniqueness and Task 35 phone motion-clip acceptance are not claimed complete.

## Evidence and limitations

Verified code commit: `d7b80d88e8a8519935607a0792ea1d9181cdfa57`. All 398 local tests, production build and existing no-fee certificate pass. GitHub [Fast Checks 34051964576](https://github.com/mshowsary/ytb-plybe/actions/runs/34051964576) and [production mobile certificate 34051964600](https://github.com/mshowsary/ytb-plybe/actions/runs/34051964600) both passed. The first mobile attempt caught the separate live snapshot builder omitting `currentContract`; that omission is fixed in this verified commit. Do not repeat that investigation. This handoff's subsequent commit changes documentation only.

`node tools/contract-capacity-experiment.js` runs paired controls/candidates across 5 fixed seeds × 3 policies × 12 shifts (360 simulated shifts total). Full reproducible output is written to `artifacts/task27-contracts.json`; the compact committed summary is `docs/task27-contract-evidence.json`.

After two learning shifts, normal-policy success is 84% (control 76%), slow 76% (78%), staff-first 86% (78%). Normal policy meets the blueprint's 70–85% range; staff-first is slightly above it. All ledgers reconcile. These are bots, not observed human learning.

Median first hire stays 10.33 minutes for balanced and 7.06 for staff-first; slow improves 11.17 → 10.60. Mean final wallets: balanced 1637 → 1634; slow 1350 → 1229; staff-first 1569 → 1891. Thus increased staff-first contract success retains more coins; track this in Task 28, do not silently add fees. Loss rates remain approximately 0.3%/0.9%/0.3%.

Regression tests cover frozen targets, canonical save round-trip, malformed cache, unchanged prior awards, and independence from deliberately weak or extreme prior scores. The passing mobile certificate includes the contract in its genuine save comparison and proves the existing 320px HUD acceptance. It does not certify the three new pet motion clips. No full Production or YouTube publisher run was requested.

## Continue here

1. Task 28: instrument bot waits by cause and phase; report useful owner work, idle and purchase intervals, stockouts. Compare current rush/recovery against one isolated arrival or refill candidate, with no live tuning. Use Task 27's paired evidence as the current economy baseline.
2. Gate B still requires five fresh human phone sessions. This is a release/research boundary, not a reason to stop independent implementation.
3. Tasks 29–34 remain to be verified/implemented against the latest blueprint. Do not claim the personality work completes its prerequisites. Capture three silent phone clips for Marmalade/Biscuit/Snowdrop and walking interruption before closing Task 35.
4. Keep focused tests and batched production certification; do not run the full pipeline for each cosmetic edit. Do not reopen the already-fixed Task 25 restore-result investigation.
