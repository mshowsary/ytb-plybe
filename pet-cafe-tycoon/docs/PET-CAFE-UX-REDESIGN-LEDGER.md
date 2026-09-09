# Pet Café UX redesign ledger

Development branch: `chatgpt/pet-cafe-production`
Starting SHA: `1fc193b2218a825c4c963c7b3f38ad713b11e947`
Working tree: uncommitted implementation batch

## Implemented

- R2: Normal play now has two persistent HUD containers: compact wallet and Café menu.
- R2: Menu routes preserve Pets, Party Order, Café Journey, Paw Rating, Daily Rewards, contextual rewarded bonuses, Music, SFX and Reduced motion.
- R2/R3: Nested destinations keep simulation paused and return to the menu when closed.
- R3: `ui/hudLayout.js` owns the final persistent HUD contract and safe-area sizing down to 183 px width.
- R5/R6: Interaction coach is stable after hesitation and performs one finite gesture beat; repeated warning shake/pulse motion is suppressed.
- R7/R8: Added render-only metadata for all 20 existing pet identities. Profiles vary proportions, markings and dog/bunny ears without changing save keys or simulation RNG.
- R8: Pet Book portraits share the appearance metadata. The 3D portrait camera now faces the pet, and the portrait remains visible in a short scrollable detail sheet.
- R10 partial: Migrated publisher and ultra-narrow smoke checks from old floating controls to the Café menu contract. Added `tools/ux-redesign-smoke.mjs`.

## Route inventory

| Old persistent control | New route |
|---|---|
| Pet Book chip | Café menu → Pets → Pet Visitor Book |
| Day/Journey chip | Café menu → Journey → Café Journey |
| Paw Rating chip | Café menu → Journey → Paw Rating |
| Calendar button | Café menu → Journey → Daily rewards |
| Contextual rewarded chips | Café menu → Journey → Available bonus, enabled only while an offer is waiting |
| Party Order chip | Café menu → Café → Party order, enabled only for an active order |
| Music / SFX pause controls | Café menu → Settings |
| Station/build controls | Remain contextual in the world |

## Development evidence

- `npm test`: 955 passed, 0 failed, 1 pre-existing TODO (`★-gated decor survives a reload at all`).
- `npm run bot`: completed; deterministic movement/inventory gates passed. Printed economy warnings are unchanged diagnostic targets.
- `node tools/fee-removal-cert.js`: passed.
- `npm run build`: passed; postbuild passed; 4 files, 1,215 KB total. Two existing per-chunk SHOULD warnings remain.
- `node tools/ux-redesign-smoke.mjs`: passed at 320×480 and 480×320, including nested pause/menu routes, contextual bonus reachability, Reduced motion and the 20-pet gallery capture.
- `node tools/playables-cert-smoke.js`: passed at 218×418 and 418×218.
- `node tools/ultra-narrow-smoke.js`: passed at 183×416.
- `node tools/responsive-audit.js --no-build --shots`: 0 violations across 13 viewports.

Review artifacts are under `output/playwright/pet-cafe-ux/`; responsive screenshots are under `shots/responsive/`. This is Fast Check and targeted browser evidence, not Production `suite=all` certification.

## Remaining design tasks

- R4: reduce dense world-label candidates based on relevance and validate busy customer ownership.
- R6: finish threading the saved Reduced motion preference into renderer helpers that currently consult only the operating-system preference.
- R9: tune initial pet framing and add restrained pet-café dressing without navigation changes.
- R10: run a recorded hesitation/cooldown review and manual Production `suite=all` on the eventual release SHA.
