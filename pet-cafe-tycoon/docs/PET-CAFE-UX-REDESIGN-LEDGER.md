# Pet Café UX redesign ledger

Development branch: `chatgpt/pet-cafe-production`
Starting SHA: `1fc193b2218a825c4c963c7b3f38ad713b11e947`
First redesign deployed as `f163eb82ec6832e2f37c7705081f5dd348bca000`.

## September 10: café life expansion

- Added a compact day badge and a quiet 15-second pre-rush countdown within the existing menu control. No third persistent HUD container.
- Added Today: actual shift phase, time until the next phase, themed-service progress, settlement reward, season, tomorrow's theme and current career-goal progress. This exposes the existing seasonal/theme simulation; it does not invent a second event economy.
- Added a Café workshop with direct access to existing speed/carry/income upgrades and an explanation of the next actual build. Prices and effects use the existing economy functions.
- Added three new permanent coin purchases: feather perch (180), hamster playground (360), paw splash garden (640). Each awards +1 reputation and survives the canonical save path. These are pet-play furnishings, not new production lanes. They contain authored merged geometry; the perch and wheel have decorative companion pets. Their toy motion starts on approach, lasts 2.4 seconds and settles.
- Added bounded social head/torso/tail performances across all 20 pet looks, plus customer greeting/thank-you waves. Motion changes no navigation, collision or simulation RNG. New social/toy motion respects Reduced motion.
- Replaced the blind bonus button with named, explained reward choices. Preview uses “Try bonus”; YouTube uses “Watch ad”. Missing/cancelled/failed YouTube ads cannot grant these rewards; duplicate and changed-shift completions are rejected.
- Removed the returning-player boot interstitial: YouTube owns pre-roll. Existing paced interstitials at shift transitions remain. Portal monetization settings and revenue-sharing eligibility still require the developer's YouTube account; Pages is a preview, not a revenue-generating YouTube placement.
- Fixed the old visual smoke's Music navigation to enter Settings, and blocked opening a second pause menu while a child destination is open.

Validation: 961 unit/simulation tests, 960 passed, 0 failed, 1 existing TODO; build/postbuild 1,228 KB; fee-removal certification passed. New browser smoke verifies purchases, refused repeat purchases, carry upgrade, saved projects, rendered equipment, and reachable 48px controls through 183×416, 218×418, 320×480, 480×320 and 1280×360. Existing UX, publisher and ultra-narrow smokes pass. Screenshots: `output/playwright/cafe-expansion/`.

Release limitation: the previous full Production run `34403467524` failed visual/economy checks (including obsolete experiment source anchors and missing bot reports). This update is a live testing preview, not a claim that those failures have been resolved or that the game is fully certified. No measured revenue or studio-quality claim is made.

Official ad references checked September 10: https://developers.google.com/youtube/gaming/playables/reference/monetization and https://developers.google.com/youtube/gaming/playables/certification/requirements_monetization .

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
