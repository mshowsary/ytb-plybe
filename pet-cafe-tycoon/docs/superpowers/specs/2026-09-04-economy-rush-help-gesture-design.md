# Pet Café — economy, rush help and micro-gesture polish

Date: 2026-09-04
Status: production design guardrail; implement in measured 25-minute slices, with CI/bot evidence between risky economy changes.

## Why this document exists

Pet Café already has a coherent four-minute shift, permanent café progression, staff, service streaks, party orders, reputation, pets, rewarded relief and day-end rewards. The next risk is not a lack of systems; it is adding too many systems or monetization surfaces until the café stops feeling like a game and starts feeling like a collection of ad buttons.

Every idea below therefore has one rule: **the unpaid game must create the problem, teach the normal solution and remain satisfying without an ad. Rewarded ads may offer a voluntary, contextually relevant convenience or delight. They may not be required to erase a tax we deliberately created.**

## Evidence from the current deterministic build

The current stable 25-day / 100-minute bot completes Area 1 in 11 days and has zero movement stalls/teleports. It still reports balance warnings:

- Day 1 gross service earnings: 412 (slightly above the 220–400 target, but first contract now succeeds 24/24).
- Day 8 gross service earnings: 658 (below 900–1800 target).
- Rush customers waiting >6s: 60.4% (target 25–60%).
- Outside-rush waiting >6s: 56.4% (target <25%).
- Lost sales: 10.2% average/day (target 4–10%).
- Closing-day affordable choices on days 2–8: `[0, 0, 5, 5, 0, 0, 0]`; the desired experience is usually 1–3 meaningful choices, not zero or everything.

Those numbers make **flat staff payroll unsafe to ship now**. Early/mid-game cash is already tight and Day 8 is already weak. Adding mandatory wages first would create the exact shortage a rewarded ad could then appear to solve, which is the wrong monetization relationship.

## Design decisions

### 1. Staff wages: prototype in telemetry before gameplay

Do not deduct salaries from live saves yet.

First add an offline/report-only model that replays current bot results through candidate staff operating costs. Candidate models to compare:

- 0% baseline.
- 5% of gross shift earnings after the first full week.
- 8% of gross shift earnings after the first full week.
- 10% of gross shift earnings after the first full week.
- A per-role model may be evaluated only after percentage models, and must be wallet-capped.

If an operating-cost model eventually ships:

- No staff cost before Day 8.
- Never make the wallet negative.
- Never charge for a worker who was not owned/active for that shift.
- Prefer a bounded percentage of gross to a large fixed wage, because revenue naturally scales with café maturity.
- End-of-day summary must show `Gross service`, `Service/waste costs`, `Staff operating cost`, and `Net`, so the player understands the economy.
- There must be **no rewarded button labelled as paying wages or deleting wages**.

Service streaks should remain a skill/feedback system. If we later add a streak-derived economic bonus, it should be a small positive tip multiplier or contract progress, not a mechanism the player must farm to afford payroll.

### 2. One contextual Rush Help surface, not many ad buttons

`sim/relief.js` already detects genuine bottlenecks and `systems/economyExperience.js` already waits for sustained pressure before showing one optional rush-help offer. Extend this architecture rather than introducing multiple floating ad icons.

The future Rush Help picker should classify the dominant live problem after at least five seconds of sustained evidence:

- **Checkout pressure** → recommend ordinary cashier/hiring first; if the user already has relevant staff, a temporary Rush Crew boost may be eligible.
- **Display/restock pressure** → recommend ordinary runner/carry upgrades first; later, a temporary runner capacity/speed assist may be eligible.
- **Dirty-space pressure** → recommend ordinary cleaner first; a temporary Roomba may be eligible only when real cleanable dirt exists.
- **Pet/crowd pressure** → a temporary two-guest Pet Lounge buffer may be eligible; this is the most on-theme relief mechanic.

Rules:

- At most one Rush Help offer visible at a time.
- Only during Rush or its immediate recovery window.
- One rewarded Rush Help claim per shift/rush.
- Shared ad cooldown with other rewarded/interstitial surfaces; never stack offers.
- Dismissal suppresses the offer for the rest of the current shift.
- If no rewarded inventory is available, the normal game remains unchanged.

### 3. Rewarded prototypes, priority order

#### A. Pet Lounge / Play Break — preferred prototype

Theme: two waiting guest/pet pairs can step out of service pressure to relax/play for a short period.

Desired simulation effect:

- Capacity: 2 pairs.
- Eligible only for guests not currently at the payment head.
- While relaxing, their service patience is paused (not reset) and they do not occupy a display/register queue slot.
- They must re-enter through a safe existing navigation target; no teleporting and no new door bottleneck.
- Duration should be short enough that the rush still matters, roughly 12–18 seconds.
- The visual should be subtle: two pet silhouettes/hearts near an existing lounge/terrace-looking space rather than a giant new building.

This is preferable to simply deleting customers because it reinforces the Pet Café fantasy and preserves the people/pets as visible characters.

#### B. Rush Crew

Temporary boost for **hired staff only**, e.g. ~20–25% movement/work speed for the remaining rush or a short bounded duration.

- Does not make permanent upgrades obsolete.
- Does not boost the owner; normal player skill remains valuable.
- Does not stack with itself.
- Must be tested against queue/path stability because changing staff timing can change deterministic mover interactions.

#### C. Roomba

Temporary cleaning helper only if meaningful cleanable dirt exists.

- Roomba should service pet-floor mess / eligible simple floor dirt first, not replace the permanent table cleaner's whole job.
- If there is nothing to clean, do not offer it.
- It should visibly glide along safe floor cells and disappear at rush end; no teleporting.

#### D. Temporary storage/carry boost

Lowest priority. Capacity changes can be useful but are less thematic and can alter deterministic timing. Prototype only after the three options above.

### 4. Pet-specific cleaning

A Pet Café should have a small amount of pet-specific maintenance, but it must read as charm rather than punishment.

Potential low-noise state:

- Rare paw-print patch, shed-fur tuft, tipped water spot or toy scatter after a seated pet interaction.
- Maximum 1–2 active pet messes at a time.
- Owner cleans by short proximity interaction; no separate inventory/tool.
- Cleaning gives a tiny satisfying sparkle/audio response.
- It should not directly remove huge amounts of money or cause instant customer loss.
- A permanent cleaner may gain pet-mess capability at a later upgrade tier, preserving role progression.

Do not add this until the current queue-friction problem is improved; another compulsory chore right now would increase cognitive load during already-busy rushes.

### 5. Micro-gesture coach — immediate high-priority polish

The user should not need persistent instructional prose for common station interactions. Add one reusable projected visual coach:

- Small original inline-SVG hand/finger + soft tap ring.
- Roughly 55–70% opacity at rest; momentary pulse when actionable.
- World-projected beside the target interaction point, not a fixed HUD tutorial banner.
- One gesture cue maximum at any time.
- Show only on first meaningful proximity/use (or after a short period of apparent confusion), then suppress.
- Hide whenever a sheet, pause menu, Journey, Pet Book, Party Order or summary is open.
- Respect `prefers-reduced-motion`: no repeated bob/pulse; static hand/ring only.
- Never cover the floating action button or a wish/patience bubble.

Initial cue set:

- Return crate while carrying an item/supply that can be returned.
- Kiosk / Upgrades.
- Staff Desk / Staff.
- Pantry / Supplies.
- Ripe berry plant / Pick.
- Coffee machine while carrying beans / Refill.
- Blender while carrying fruit / Add fruit.
- Treat bowl while carrying kibble / Refill.

Interaction semantics differ:

- Kiosk, Staff, Pantry and Return are explicit tap actions: cue should point toward the existing 48px floating action button when it exists.
- Harvest/refill/blender/bowl currently use dwell/proximity: cue should indicate `move/hold here`, not falsely imply a tap is required. A hand + soft hold-ring can still be used, but animation should differ from an explicit tap cue.

The existing `G.hintsSeen` Set and `FIRST_HINT` logic can seed suppression, but the new coach should have its own semantic keys so hiding old prose does not accidentally disable visual coaching. Session-only suppression is acceptable for the first implementation; persistent migration is unnecessary until playtests prove repetition is annoying across sessions.

### 6. Extreme-small-screen layout is a permanent QA target

Real browser emulation exposed the playable at 183×416 CSS pixels, narrower than the previous 218×418 publisher fixture. The permanent HUD must remain valid at both.

Required automated fixtures:

- 183×416 portrait with Day 3 Party Order active (all three progression chips visible).
- 218×418 publisher portrait.
- 418×218 publisher landscape.
- Existing 320×568 / 450×800 / 1280×720 production visual states.

A UI change is not complete if only normal phone sizes look good.

## 25-minute implementation slices

Each slice should end with either a deterministic/unit test or a browser screenshot check. Economy slices must not be combined into a large unmeasured commit.

1. **00:00–00:25 — ultra-narrow HUD**: reproduce 183×416 Day 3, fix chip placement without shrinking touch height, add automated overlap/overflow gate and screenshot. Acceptance: all wallet/pause/day/reputation/book/party controls fit; progression chips retain 48px height.
2. **00:25–00:50 — gesture-coach core**: create reusable DOM/SVG coach, projection API, tap vs hold visual states, modal/pause suppression, reduced-motion styling. No station wiring yet.
3. **00:50–01:15 — explicit-action gestures**: wire Return, Kiosk, Staff Desk and Pantry to the existing floating-action candidate. Acceptance: one cue only; disappears after successful action; never competes with a modal.
4. **01:15–01:40 — dwell-action gestures**: wire ripe plant, bean refill, blender fruit and treat refill with a hold/proximity cue instead of misleading tap semantics.
5. **01:40–02:05 — gesture visual QA**: capture 183×416, 218×418 and 418×218 action states; tune opacity/offset so hand never covers buttons, demands or wish bubbles.
6. **02:05–02:30 — payroll what-if model**: pure/report-only calculations for 0/5/8/10% post-week-one operating cost using the deterministic career run; no live save mutation.
7. **02:30–02:55 — economy decision gate**: compare day-by-day net cash, build completion, affordable choices and Day-8 weakness. Either reject payroll or choose one bounded model. Document decision before code.
8. **02:55–03:20 — summary accounting (only if model passes)**: add gross/cost/net presentation and tests; still keep rewarded ads completely separate from mandatory operating cost.
9. **03:20–03:45 — Rush Help classifier v2**: pure function selects `checkout`, `restock`, `dirty`, or `petCrowd` from sustained live evidence. Unit-test precedence and no-offer states.
10. **03:45–04:10 — single Rush Help UI**: adapt existing relief pill/card to one contextual offer; verify dismissal/one-claim/shared-cooldown behavior and ultra-narrow fit.
11. **04:10–04:35 — Pet Lounge pure simulation prototype**: two-slot patience-pausing buffer with no rendering/ad call yet. Run movement/full-house tests before any browser work.
12. **04:35–05:00 — Pet Lounge presentation**: subtle resting/playing pet moment and one rewarded path, if pure simulation remains stable.
13. **05:00–05:25 — Rush Crew pure modifiers**: bounded staff-only boost and tests; reject if it destabilizes the long deterministic movement run.
14. **05:25–05:50 — Roomba/mess feasibility**: prototype maximum-two pet-mess state and safe-floor Roomba targeting without modifying customer navigation.
15. **05:50–06:15 — contextual reward picker**: choose one of Lounge/Crew/Roomba based on actual bottleneck; no irrelevant ad offers.
16. **06:15–06:40 — no-ad 100-minute gate**: all rewards unused; target remains 10–12 Area-1 days, zero stalls/teleports, and ordinary progression must still feel viable.
17. **06:40–07:05 — plausible-ad 100-minute model**: simulate reasonable optional uptake to ensure rewards help but do not explode economy or become required.
18. **07:05–07:30 — monetization UX audit**: verify no rewarded + interstitial stacking, no ad-created tax rescue, explicit voluntary wording, and no clutter on 183px screens.
19. **07:30–07:55 — pet-café charm pass**: only after mechanics are stable, add tiny pet cleanup/relax gestures, audio and effects that strengthen the fantasy without increasing UI density.
20. **07:55–08:20 — final production/certification run**: all Node tests, economy bot, production build, ultra-narrow smoke, portrait/landscape publisher smoke and screenshot review before PR readiness.

## Ship / reject criteria

A proposed mechanic should be rejected or reverted if it does any of the following:

- introduces deterministic stalls/teleports that were absent before;
- pushes Area-1 completion outside the 10–12 day target without a deliberate redesign;
- makes a rewarded ad the obvious way to pay a compulsory cost;
- increases permanent HUD density on narrow phones;
- replaces an earned permanent upgrade with an effectively permanent temporary ad boost;
- makes pets feel like queue tokens rather than café visitors;
- creates more than one simultaneous monetization call-to-action;
- cannot explain its value in one short phrase at the moment it appears.

The goal is not the maximum number of monetizable mechanics. The goal is a café players want to stay in, with occasional rewarded opportunities that feel timely, fair and on-theme.
