# Pet Café Task 38–39 recovery and playable preview

Branch: `chatgpt/pet-cafe-production`; follows `85ba642db4cde61fa7df52e097553b1761204fe6`.

## Fixed and connected

- The red ad-lock test expected an immediate interstitial after a reward, contrary to Task 39's launch cooldown. It now uses an injected clock and proves both the shared transaction lock and the four-minute cooldown before another format can start. The assertion was not removed or bypassed.
- Central one-claim-per-shift policy is wired into Rush offer eligibility/claim, saved pending entitlements and summary rewards. Either historical claim key consumes the same allowance. Eligibility reporting is called at real surfaced offers and eligible Continue boundaries.
- Shared minimum spacing now also blocks rewarded ads immediately after an interstitial. Availability is exposed to the UI so it does not invite requests during cooldown. A timestamp of zero is handled correctly. Failed requests do not award benefits; existing pause/resume lock behavior remains intact.
- Task 38's browser certificate uses the established genuine guest + ready-stock Runner fixture, not the disabled purchase bridge. It checks portrait/landscape offer geometry, AD disclosure, intentional expansion, joystick isolation, and actual earned Runner benefit. The permanent purchase bridge stays disabled.
- Preview workflow installs dependencies before testing/building. Updating that workflow on this development branch triggers a guarded Pages preview deployment; ordinary code pushes do not trigger preview publishing. Manual preview dispatch remains available.

## Validation status

The previous 465-test suite passed locally; two additional reverse-cooldown/clock-zero regressions also passed (17 focused ad tests). Production build and no-fee certificate passed. Check the current commit's Fast Checks, Task 38 mobile certificate, Task 25 live certificate and Pages deployment for exact browser/deployment status. This file will be updated with results when available. No full Production or publisher certification is implied.

## Continue

Tasks 29–37 were delivered by the preceding model; preserve that work. Gate C requires actual equivalent no-ad/voluntary-ad sessions, benefit expectation checks and named-pet recall. Do not fabricate human evidence. Independent work can proceed under AGENTS.md's batched-development policy. Next blueprint implementation slice after this boundary is Task 40: capture current boot/full café/coffee-empty/hire/rush/summary/Bestie at phone portrait and landscape before changing camera/palette. Pet trait motion clips and broad publisher acceptance remain separate from the focused offer certificate.
