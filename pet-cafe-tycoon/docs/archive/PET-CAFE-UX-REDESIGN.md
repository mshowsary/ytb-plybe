# Pet Café: calm gameplay and a café worth caring about

Design and executor brief — 2026-09-09

Status: **implementation in progress. The calm HUD/menu, finite coaching motion, responsive routes, and 20 authored pet appearances are implemented; contextual-label and café-composition work remains.**
Inspected branch: `chatgpt/pet-cafe-production`, HEAD `1fc193b2218a825c4c963c7b3f38ad713b11e947`.
Evidence: source modules listed below and saved `shots-production/04-busy-small.png`. That image was visually inspected; its exact generating SHA was not established. It is not a new live playtest. Other viewport/state coverage remains to be captured.

## 1. Direction and scope

The player should see a charming pet café, understand the next useful action, and get on with playing. The room and animals occupy the screen. Money is easy to find. Collection, statistics and long-term progression remain available through deliberate taps.

This brief takes priority for presentation over older roadmap requests for persistent counters, icon-only teaching, mandatory deployment after each batch, or another layer of CSS overrides. Repository `AGENTS.md` remains authoritative for development/certification cadence. Preserve existing economics, content, saves and platform behavior. This is a presentation redesign, not a balance overhaul.

Success at a glance:

- Ordinary active play has **two HUD containers**: a small wallet and one café menu button. No corner dashboards, permanent progress bars, floating gift button, or collection counters.
- At most **one teaching/recommendation cue** is active. Customer order information remains available near relevant customers; it does not compete with tutorial arrows and promotion badges.
- The first screen clearly contains recognizable pets. Later play reveals different body shapes and proportions, not just different colors.
- Resizing changes composition and disclosure, never progress or interaction semantics.
- Visual acceptance includes actual gameplay captures and a short motion recording, not only an overlap checker.

## 2. Diagnosis anchored in this project

| Finding | Evidence | Design consequence |
|---|---|---|
| Large panels dominate a small frame; anonymous numbers and thin bars require decoding | Inspected small-screen busy capture; `ui/hudLayout.js` collects four resources and wraps them into a grid | Remove persistent secondary information rather than compressing the same dashboard |
| Layout is decided by competing injected styles and specificity | `ui/cleanHud.js`, `ui/hudLayout.js`, `ui/playablesShell.js`, `style.css` | One layout owner; remove migrated positioning rules |
| Coaching has useful priority/learning logic but endlessly animated presentation | `ui/interactionCoach.js` has infinite hand/ring/dot animations; `style.css` has infinite wish shaking and demand color pulsing | Preserve learning proof and targeting; replace motion behavior |
| Collision correction cannot guarantee clarity under arbitrary density | `ui/labelLayout.js` only allows some classes to hide and can retain overlap for others | Reduce what is shown before layout; never silently remove an essential action |
| Pets already have a substantial identity system | `sim/petBook.js`: four species, five profiles each; `render/pets.js`: shared species dimensions, procedural geometry | Keep all 20 identities; add silhouette/proportion variation through render metadata |
| A historical comment promises few draw calls, but pets construct additional eye meshes/materials | `render/pets.js` | Measure renderer output before choosing a detail budget; do not treat comments as performance evidence |

## 3. The screen to build

### Normal play

Top-left: a cream rounded rectangle, coin symbol and readable amount. Top-right: one rounded 48 × 48 CSS px café/menu button, with a paw-in-a-cup glyph. The menu glyph must be identifiable in context; give it the accessible name “Café menu” and explain its purpose in the first welcome sheet. Do not use a generic unexplained star as navigation.

The space between them stays open. The bottom stays open for movement. A touch joystick appears only during an active movement gesture if the existing input uses one. Do not add a permanent bottom navigation dock.

The wallet is a readout, not a fake button. Use tabular numerals. Show exact small values; abbreviate values only when required by width (`12.4k`), with the exact value in the menu. Reserve its measured width to prevent number updates shifting controls.

Opening the café menu pauses through the existing pause/lifecycle authority. It shows a clear Resume action and four labeled destinations: **Pets**, **Café**, **Journey**, **Settings**. Calendar/rewards belong in Journey; renovations, staffing and existing management features belong in Café. Preserve every existing feature route, including optional rewarded offers and any required reward disclosures. Do not make progression depend on opening an ad offer.

The menu header may show “Day 13 · 4,240 coins.” Pet collection totals belong in Pets; followers, rating, contracts and milestones belong in Journey. Use labels in sheets: reducing gameplay clutter must not create an icon puzzle.

### Visibility contract

| Existing content | New home / moment |
|---|---|
| Wallet | Persistent compact top-left readout |
| Pause | Café menu opens the established paused state; Resume returns to play |
| Day/time progress, served count, goal/streak | Menu and shift summary; a single short “Closing soon” notice only if actionable and once per shift |
| Followers, Paw Rating, Pet Book totals | Journey or Pets; collection discovery may produce one quiet event notice |
| Party order counter | Physical order crate when nearby/selected; full details in Café |
| Calendar and floating gift | Journey; at most a static menu dot for a newly available, unviewed item |
| Stock/production bars and station captions | Visible physical stock first; relevant icon or short caption on approach/selection |
| Customer wishes | Local order bubble for the current interaction/front waiting customer; other relevant orders on approach |
| Patience alert | A stable urgent symbol for the most relevant customer, no shaking or flashing |
| Build prices | One selected/nearby build site; all choices accessible through existing build UI |
| Carry capacity | Visible carried objects; contextual “Hands full” only after an unsuccessful action, then dismiss |
| Friendship/discovery/rewards | One event notice at a time; details retained in Pets/Journey |

No removed HUD control may become unreachable. Task R2 must maintain a route inventory mapping every old click action to its new destination.

### Art direction

Use milk white `#FFF9F1`, espresso `#3E302B`, sage `#80977C`, biscuit `#DDB986`, and muted coral `#D98C82`. These are proposed UI tokens, not colors to multiply across lighting, fog and every material. Measure actual text contrast before finalizing pairs; dark espresso is the default text color.

Use a locally available rounded sans-serif fallback stack, 14–16 px body text, 18–22 px sheet headings, 16–18 px wallet numerals. No remote font requirement. Controls use 12–16 px corner radii, restrained shadow and one border; avoid huge white bubbles, excessive pill nesting, rainbow meters and glossy gradients. Primary targets remain at least 48 × 48 CSS px under the repository's existing acceptance floor, including short landscape frames.

## 4. Teach through play, with a finite demonstration

Keep `sim/mechanicLearning.js` as the source of demonstrated mastery. A displayed hint, elapsed timer or opened sheet must not count as successful learning. Use real actions as proof.

Presentation state machine: **quiet → target cue → one demo → quiet cooldown**. These timings are proposed UX values, not changes to simulation time or customer patience:

1. Natural affordance immediately: visible empty stock, a customer looking toward the counter, a distinctive machine or build marker.
2. After 4 seconds of genuine hesitation: a stable soft outline at one useful target. No scale pulse.
3. After 8 seconds: one 1.2–1.8 second gesture demonstration, then fade. A touch hand or mouse pointer travels once, or illustrates a hold once. It must match the actual input required.
4. Do not replay automatically during the same unresolved episode. After a meaningful context change or repeated failed attempts, permit another after a 30-second cooldown. Explicit Help can always replay it.
5. Movement toward the target, carrying the correct supply, actual work progress, a modal, pause, or a completed action suppresses irrelevant coaching. Preserve refill partial credit and mode hysteresis already present.

One priority owner selects: current blocked action → current service need → required first-use mechanic → optional expansion. Do not schedule collection promotions while explaining refill. A selected cue stays with its target until resolved, invalid, or preempted by a higher-priority actionable need. Offscreen targets receive at most one stable edge direction marker, linked to that same cue.

First-play sequence, driven by state rather than a cinematic timer:

- Show the café with one clearly framed pet and the existing first reachable interaction.
- If the player moves successfully, suppress the movement demo.
- Demonstrate the existing first productive action only on hesitation. Allow a short caption such as “Hold to refill” when the gesture is ambiguous.
- Show the consequence in the world: product arrives, service completes, pet reacts once, wallet updates.
- Reveal the next useful action only after the preceding action is understood. Never auto-spend, steer the character, spawn bonus resources, or change authored queues to make the tutorial look successful.

## 5. Motion rules

Default gameplay is calm. Disable infinite HUD bouncing, scale pulses, warning shakes, color-flipping demands, repeated hand gestures, coin storms and camera shake. Use 120–180 ms opacity transitions and static selected states. Keep progress rings only while the player is actually holding/working; the fill communicates progress without a second pulsing animation.

Positive feedback: one local expression or ear/tail response and, when needed, one small fading value. Coalesce reward notices within a short window instead of stacking them. Low-priority notices expire rather than arriving late after a modal closes. Important earned rewards remain visible in their destination.

Respect `prefers-reduced-motion` and provide an in-game Reduced motion setting through the existing settings persistence path. Reduced motion removes gesture travel, cosmetic pet bobbing, shake and particle travel; it keeps necessary locomotion and readable static progress. No new localStorage use. These are comfort requirements, not a medical safety certification.

## 6. Responsive layout and camera contract

The frame is a constraint, not a list of phone models. Keep a single measured safe rectangle based on viewport and safe-area insets. Use layout flow, intrinsic sizes and measured keep-outs. No CSS scaling that shrinks hit targets below 48 px; no scattered hard-coded top offsets.

| Available frame | Behavior |
|---|---|
| Width ≥ 360 and height ≥ 480 | Two corner controls; comfortable 12 px outer margin; normal sheets |
| Width 260–359 | 8 px margin; shorter money formatting; full-width bounded sheets |
| Width < 260 | Same two controls with abbreviated amount; no third top item; full-frame scrollable menu |
| Height < 420 | Two controls only; side panel on sufficiently wide screens, otherwise full-frame sheet; compact sheet header |
| Very wide / very tall | Fill viewport; frame useful local play instead of showing excessive empty floor or shrinking the whole café |

World camera uses the HUD-safe playable area and player position. Tune `render/scene.js` distance/composition with reference captures. Keep the owner and immediate interaction target visible where geometrically possible. Do not solve portrait fit by zooming so far out that pets become dots. During resize, update projection and input mapping without restarting gameplay, triggering purchases, cancelling learning, or leaving a held action stuck.

Only one modal is interactive. Sheet body scrolls internally; header/close and primary footer remain usable without overlap. Apply safe-area padding, focus management and Escape handling. Touch outside a sheet must not move the owner. Pointer cancellation, menu opening and orientation changes must release input safely.

Label placement receives **only relevant visible candidates**, then solves overlap. Hide decorative cues first. If essential controls cannot fit, use one explicit selection/context panel; do not silently hide them or push their labels far from the object. Add target identity/connector when needed. Keep labels off pet faces, the owner's head and active hold indicators, as well as DOM HUD rectangles.

Official platform basis: [YouTube Playables design requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements_design), checked 2026-09-09: support changing aspect ratios, preserve state during resize, do not lock orientation, and support touch and mouse. The sizes and disclosure rules above are this project's design choices, not a claim that Google prescribes this HUD.

## 7. Pet art specification

Keep the existing cat, dog, bunny and hamster identities, rarity gates, pet keys and collection progression. Add render-only appearance metadata keyed by the existing species/variant. Avoid save migrations for appearance; stable keys produce the same look after reload. Decorative randomness must use a separate deterministic visual seed, never consume simulation RNG.

First produce one cat and one dog in the actual game camera. Establish their quality before propagating detail to all profiles. The target is soft sculpted toy animals: rounded haunches, distinct muzzles, readable ears, paws grounded on the floor, dark expressive eyes and broad coat markings. Detail must survive the gameplay camera; tiny whiskers and extra fur triangles are not the priority.

| Species | Silhouette and expression | Suggested visual size relative to medium dog |
|---|---|---|
| Cat | Tapered torso, larger cheeks, triangular ears with inset interiors, curved tail; loaf and upright sitting poses | 0.75–0.90 |
| Dog | Distinct muzzle, chest and paws; short-legged, round/fluffy and longer-legged profiles; floppy or upright ears | 0.85–1.15 |
| Bunny | Pear-shaped haunches, long ears, small forepaws, broad hind feet and round tail; one lop-ear profile | 0.60–0.80 |
| Hamster | Compact rounded body, cheek pouches, tiny round ears and feet, no visible tail | 0.40–0.55 |

Ranges are render targets to validate in the room, not literal zoological scale. Keep small pets readable. Do not globally rescale collision footprints or alter queues. Larger visual bodies must still fit existing chair/door/path clearances; reduce an unsafe art proportion rather than allowing overlap.

Give all five variants per species an authored appearance entry. Across each species, use at least two distinct body/ear silhouettes plus coat patterns. For example, calico needs broad irregular patches; tuxedo needs a chest bib and socks; Cloud should read fluffier through silhouette. Legendary pets use a distinctive coat and modest accessory, not continuous sparkle. Retain names/rarities; appearance changes must not invent extra collectible IDs.

Use shared geometries/materials, merged static coat pieces or generated texture patches. Cache by appearance key. Prefer baked face detail or merged eye pieces over several new meshes per eye. Match Pet Book portraits to in-world appearances. Validate front, side, back and seated poses; tails must not penetrate bodies or become straight sticks through seats.

Animate species, not UI: cats glance and settle; dogs occasionally wag; bunnies adjust ears; hamsters sniff. Idle events occur at different phases, not on a shared beat. No idle hopping. Service completion may trigger one small reaction. Nearby residents may receive more detail; distant moving pets should remain inexpensive. Do not add external 3D/image generation or asset downloads to the first implementation batch.

Make the setting support them: a visible cushion/window perch, a low water bowl, a tasteful paw-shaped sign and a coherent feeding nook. Reuse actual pet positions or adapt render dressing around them; new decorative props must not obstruct navigation. Reduce competing floor stripes, confetti and saturated station edging where they overpower animals. Preserve state cues and station recognizability.

## 8. Architecture and bounded execution tasks

Execute serially with Sol or Terra. Do not spawn multiple agents by default. Read this file and only the modules needed for the current task. The suggested new module names below are design contracts; reuse an existing equivalent if it already owns that responsibility.

| Task | Work and primary files | Acceptance / evidence |
|---|---|---|
| **R1 — baseline and tokens** | Capture fresh small portrait, short landscape and developed café states with `tools/current-visual-capture.mjs` after inspecting its invocation. Record SHA, viewport, game state and renderer stats. Define shared tokens in `style.css`. Inventory old controls and active style owners. | Before images and route inventory; no gameplay change. Baseline draw calls/triangles, bundle size and frame-time sampling recorded from real gameplay, not loading/menus. |
| **R2 — two-control HUD** | Refactor `ui/hudLayout.js`, `ui/hud.js`, `ui/pauseMenu.js`, `ui/meta.js`, `main.js`. Move existing actions into labeled menu destinations; preserve handlers and lifecycle semantics. | Wallet + menu only during ordinary play. Every previous feature can be reached. Opening/closing and nested sheets neither leak movement nor double-resume. |
| **R3 — one responsive owner** | Consolidate migrated positioning from `cleanHud.js`, `playablesShell.js`, `responsive.js`, `certificationPolish.js` and `style.css` into `hudLayout.js`/shared CSS. Retire only obsolete rules, not unrelated feature behavior. | No new override stylesheet or specificity arms race. Resize, safe area, short sheets and 48 px targets pass. Keep deliberate non-layout feature styles intact. |
| **R4 — contextual world information** | Update `ui/labelLayout.js`, `systems/visuals.js`, `systems/customers.js`, `systems/stations.js`, `systems/zones.js`, party-order UI. Feed relevant candidates into layout and retain accessible fallback actions. | Busy states are readable; no essential action disappears. Every displayed order belongs clearly to its customer. Selected build/refill remains operable in narrow frames. |
| **R5 — finite teaching** | Update `ui/interactionCoach.js` presentation and relevant objective/intro wiring, reusing existing mechanic learning. Add focused state-transition tests. | One cue, finite demo, cooldown, explicit replay; moving correctly suppresses coaching; showing demo never marks learning. Refill partial-credit behavior preserved. |
| **R6 — calm feedback** | Audit CSS and JS motion in `style.css`, `ui/petMoments.js`, `render/fx.js`, `render/scene.js`, coach and settings. Reuse/extend `core/presentationScheduler.js` after reading its contract. | No infinite attention animations in active play; notices serialize and expire. Reduced motion works in both CSS and renderer. Existing platform pause/audio behavior remains intact. |
| **R7 — hero pet pair** | Add render appearance metadata and upgrade one cat + one dog in `render/pets.js`, `render/geo.js`, `render/petTraitMotion.js`. | Compare before/after in gameplay and portrait at equal scale; approve by this brief's silhouette/grounding criteria. Measure real rendering cost before expanding. |
| **R8 — complete pet variety** | Extend approved approach across existing 20 profiles, `ui/petPortrait.js`, `render/portrait.js`, resident presentation. Keep `sim/petBook.js` identity semantics. | All four species, 20 stable appearances, size variety, readable small pets, seated/tail clearance and matching portraits. Collection/reload tests remain green. |
| **R9 — café composition** | Tune `render/scene.js`, `render/environment.js`, `render/decor.js`, `render/props.js`, `systems/residentPets.js` presentation. Adjust camera for the new HUD safe area. | Pets evident in initial play; owner/target remain readable in portrait and landscape; décor does not block paths or hide service affordances. No economic/content unlock changes. |
| **R10 — integration and handoff** | Extend responsive/browser assertions for the new semantic contracts; retain genuine old acceptance checks. Capture motion and before/after contact sheet. Run batch gates below. | Document exact SHA, results, remaining failures and artifact paths. Full certification required for release; no deployment implied by this document. |

R2→R3→R4 establish space before coaching. R5→R6 share attention policy. R7 must establish the pet quality/cost before R8. R9 follows the HUD and pets. Do not redesign the plan at each step; revise only a concrete mismatch discovered in code, documenting the reason briefly.

## 9. Verification and performance

Ordinary development gate from `pet-cafe-tycoon`: focused tests, `npm test`, `node tools/fee-removal-cert.js` (currently in Fast Checks), and `npm run build`. Run focused responsive/browser checks when touching UI, not a complete Production run for every task. Build once before screenshot checks; use supported `--no-build` options.

At the coherent R1–R10 integration checkpoint, run the existing responsive matrix with screenshots (`node tools/responsive-audit.js --no-build --shots`) and Production manually with `suite=all`, using the current workflow's actual inputs. Use `suite=lifecycle` only to diagnose lifecycle changes. Inspect named suite results rather than rerunning the full matrix to discover the next failure. No claim of release readiness without full certification of the release SHA. Keep main unchanged and never force-push.

Extend coverage beyond the existing 13 sizes: 183×416, 218×418, 320×320, 360×1280 (9:32), 1280×360 (32:9), plus a continuous resize through breakpoints. Test touch and mouse, nonzero safe-area insets, long amounts and expanded text, and reduced motion. Finite viewport tests support coverage; they cannot prove every conceivable screen.

Capture these states: fresh tutorial, active service, empty machine/required refill, full hands, dense late-game café, selected build, menu, Pet Book detail, summary, pause/resume, and a resize while holding/moving. For motion review record at least 30 seconds of normal play and a full hesitation/demo/cooldown episode.

New assertions should verify behavior, not exact markup: exactly two persistent HUD containers; all essential actions reachable; no clipping or intersecting interactive controls; no stuck input after resize/menu; one coaching cue; no automatic demo loop; saved progression unchanged by presentation. Update obsolete selectors only with a documented old-to-new behavior mapping. Never drop a failing acceptance assertion to obtain green.

Performance acceptance: preserve existing hard bundle/postbuild gates and record before/after bytes. The earlier roadmap's 1.4 MB target is a project target, not a current Google platform limit. At the same seeded busy state, camera, device and quality, target no more than 10% extra draw calls or p95 frame time; investigate regressions beyond that before expanding art. This is a proposed regression budget, not a measurement. Record entity counts, renderer settings and sample length. Measure with a real gameplay frame; a two-triangle loading screen is not pet performance evidence. Watch repeated book opening/closing for accumulating geometry/materials. Report device/browser limits honestly.

Final human visual rubric: can a new viewer identify the pet café theme, find money/menu, understand the current action without decoding multiple bars, and play 30 seconds without repetitive attention effects? Confirm with an actual person when available; automated assertions cannot establish intuitiveness.

## 10. Low-context executor handoff

Paste this into a Sol or Terra session:

> Implement `pet-cafe-tycoon/docs/PET-CAFE-UX-REDESIGN.md` starting at the first unfinished R task. Read AGENTS.md and the task's relevant files. Work serially on a development branch; keep main unchanged and preserve others' work. Complete a coherent batch within the session, with Fast Checks and targeted browser evidence. Do not replan the entire game, spawn agents, run Production after each task, generate external assets, or deploy from this brief. Preserve economics, saves, mastery proofs and platform lifecycle. Maintain a compact task ledger with task ID, commit/SHA, checks, artifact paths and unresolved issue. After the full integration batch, run manual Production suite=all and inspect its named results. Report implementation and certification separately.

For shorter sessions, use R1–R3, R4–R6, R7–R9, then R10. This split limits context, not acceptance. Keep one ledger next to this document and append concise evidence; avoid creating another family of handoff files. Bring difficult architectural conflicts or the final visual review back to Astra rather than using it for repetitive implementation.

No model cost, remaining Plus quota or five-hour allowance is observable from this repository. This workflow reduces repeated context reading and unnecessary certification runs; it does not guarantee a particular usage charge or that one model is always cheaper under the user's plan.
