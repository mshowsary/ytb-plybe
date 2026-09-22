# Pet Café Task 38–39 recovery and playable preview

Branch: `chatgpt/pet-cafe-production`; follows `85ba642db4cde61fa7df52e097553b1761204fe6`.

## Fixed and connected

- The red ad-lock test expected an immediate interstitial after a reward, contrary to Task 39's launch cooldown. It now uses an injected clock and proves both the shared transaction lock and the four-minute cooldown before another format can start. The assertion was not removed or bypassed.
- Central one-claim-per-shift policy is wired into Rush offer eligibility/claim, saved pending entitlements and summary rewards. Either historical claim key consumes the same allowance. Eligibility reporting is called at real surfaced offers and eligible Continue boundaries.
- Shared minimum spacing now also blocks rewarded ads immediately after an interstitial. Availability is exposed to the UI so it does not invite requests during cooldown. A timestamp of zero is handled correctly. Failed requests do not award benefits; existing pause/resume lock behavior remains intact.
- Task 38's browser certificate uses the established genuine guest + ready-stock Runner fixture, not the disabled purchase bridge. It checks portrait/landscape offer geometry, AD disclosure, intentional expansion, joystick isolation, and actual earned Runner benefit. The permanent purchase bridge stays disabled.
- Preview workflow installs dependencies before testing/building. Updating that workflow on this development branch triggers a guarded Pages preview deployment; ordinary code pushes do not trigger preview publishing. Manual preview dispatch remains available.

## Validation status

Verified gameplay code: `311ce4f014f655b2520af94d0d1ffd618d2dc3c7`.

- [Fast Checks 34066295248](https://github.com/mshowsary/ytb-plybe/actions/runs/34066295248): passed (467 tests, no-fee certificate, production build).
- [Task 38 mobile certificate 34066295254](https://github.com/mshowsary/ytb-plybe/actions/runs/34066295254): passed, including four portrait/landscape screenshots, actual dismiss-button hit testing, AD disclosure, joystick isolation, and the delivered Runner benefit.
- [Pages preview 34066295183](https://github.com/mshowsary/ytb-plybe/actions/runs/34066295183): passed. **Play now: https://mshowsary.github.io/ytb-plybe/**.
- Lifecycle diagnostic [34066138068](https://github.com/mshowsary/ytb-plybe/actions/runs/34066138068) and Task 25 save/progression browser certificate [34066138045](https://github.com/mshowsary/ytb-plybe/actions/runs/34066138045) passed on `818c099e60988bcf3e66a3928ffe914ab323ac4b`. The subsequent gameplay change only moves expanded reward cards below the Pause control; its mobile test passed on the newer SHA above.

The first Task 38 attempt exposed a genuine collision: Pause intercepted taps intended for the expanded offer's close button. Both portrait and short-landscape expanded cards now start 66px below the safe-area top. The certificate verifies hit targeting and clicks normally; it never forces the click through another control.

Tasks 38–39 now have the focused acceptance evidence described above. This is not full publisher certification or human Gate C evidence. The subsequent handoff commit changes documentation only.

## Continue

Tasks 29–37 were delivered by the preceding model; preserve that work. Gate C requires actual equivalent no-ad/voluntary-ad sessions, benefit expectation checks and named-pet recall. Do not fabricate human evidence. Independent work can proceed under AGENTS.md's batched-development policy. Next blueprint implementation slice after this boundary is Task 40: capture current boot/full café/coffee-empty/hire/rush/summary/Bestie at phone portrait and landscape before changing camera/palette. Pet trait motion clips and broad publisher acceptance remain separate from the focused offer certificate.
