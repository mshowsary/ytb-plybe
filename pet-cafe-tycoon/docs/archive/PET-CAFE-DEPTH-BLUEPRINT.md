# Pet Café: depth, consequence and a reason to keep playing

Implementation blueprint • 7 September 2026 • SIX delivery batches

Design baseline: `6ebd13bab5abecdda0f7bce4abdd4e0420496858`, repository `mshowsary/ytb-plybe`, branch `chatgpt/pet-cafe-production`.

Status: PLAN ONLY. Nothing below is implemented merely because this document exists. The owner requested this handoff after finding that a fully upgraded café becomes passive money accumulation. Their playtest is the acceptance standard. Technical gates cannot establish fun or studio-level quality.

## The outcome

Make the player the host of a place with a personality: choose what kind of café to run, prepare for identifiable visitors, intervene when service slips, invest profits in visible facilities, and host increasingly demanding gatherings. Staff handle routine transport; the owner handles priorities and hospitality.

The complete loop:

**Choose today's focus → prepare the room/menu → serve and recover → see why profit and guest satisfaction changed → invest in a visible improvement → attempt a more demanding booking.**

Three decisions should remain after buying every worker: which service capability to equip; which visitors/booking to prepare for; which bottleneck to address during a rush. More taps, larger prices and more passive counters do not satisfy those decisions.

## What exists and must be reused

| Existing system | Current evidence / problem | Direction |
|---|---|---|
| Service quality | `src/sim/serviceQuality.js`: `serviceRecoveryCost()` returns 0; this was an explicit Task-23 policy | Introduce the mature-café policy below; preserve the protected opening |
| Staff | Affordable first Runner/Desk; product-specific Runner assignments | Keep accepted core prices and assignments; add priorities and owner decisions |
| Career | Cups, recipe mastery, adaptive contracts | Reuse history and milestones; do not create competing progress meters |
| Renovations | Five levels, costs 1,800/3,600/6,500/10,500/16,000; reputation gates | Keep ownership and artwork; add useful choices and visible projects |
| Pet book | Named visitors, traits, friendship, portraits and keepsakes | Turn relationships into authored requests and activities |
| Pet Socials | Day-8 optional themed demand, three targets, medals, saved state | Extend into prepared bookings; preserve existing medals |
| Completion | `src/sim/completion.js` describes old authored content | Update its definition when new content ships; never imply a nonexistent second area |

### Scope boundaries

One café, three existing pet species, existing product families, existing controls and currency. No second map, prestige reset, multiplayer, breeding, employee payroll simulation, free-placement construction, equipment breakdowns, offline penalties or new premium currency in this release. No random gacha and no ad-dependent recovery. These would expand the schedule without proving the core loop.

The old blueprint's implementation sequence is superseded for this depth expansion. Preserve unrelated accepted behavior. This owner-requested service consequence design explicitly replaces the blanket mature-game no-fee policy; it is not permission to remove genuine safety or payout tests.

## Shared economy rules

All numbers here are **initial tuning proposals**, not measured balance results. Put them in one config module and report any changes with observed evidence.

Define baseline **B** as the median gross product-sales revenue of the last five completed ordinary shifts, excluding ads, claims, gifts and event payouts. Until there are three ordinary shifts, use 700 coins. Clamp B to 400–2,000 initially. Record the chosen B when generating a quote; never change a displayed price because the wallet or current shift changes. Event shifts do not feed B. Existing rewards must be audited for uncapped growth; for example, career.js currently contains week-scaled coin rewards. Cap repeatable contract payouts initially at 0.3B and award any further distinction through cups/history, not ever-larger coin bonuses.

Use one transaction function for all NEW debits, refunds and payouts. Every operation has a stable ID, source, amount, shift and status. UI displays the committed outcome. Save the wallet and committed ID together through the material checkpoint. Never charge on render/update loops or pay again on reopening a panel. Keep a bounded deduplication record sufficient for every unresolved transaction; do not prune still-claimable IDs.

Show a coherent shift reconciliation:

`closing wallet = opening wallet + product sales + separately listed bonuses − service recovery − purchases − booking costs + any explicit booking refund`.

Do not subtract unpaid abandoned orders: that sale never entered the wallet. Their estimated value may appear separately as **missed sales**, never as another debit. Never create negative coins or retroactive debt. Protect earlier saves and owned upgrades.

Example, not a promised average: start 6,000; product sales +700; contract +100; recovery −24; project −1,200 → finish 5,576. The recap must explain every term.

## Batch 1 — Make service matter, and explain every coin

**Player outcome:** dirty tables and excessive waiting have visible, recoverable financial consequences. The player understands the cause before and after an incident.

### Rules

Days 1–3: teach patience/cleaning, no direct service debit. Days 4–7: missed sales and lost service quality remain the consequences. From day 8: activate the mature service policy after a one-time clear notice. Migrated day-8+ saves receive the notice before the first affected shift; never charge historical incidents.

One recoverable warning precedes a failure. An unpaid guest exhausting the existing patience limit at a shelf, register or bowl triggers one **service-recovery voucher expense**; label it as recovery, not a refund for an unpaid order. Initial amount: 25% of the posted base value of that guest's requested order, rounded up and clamped to 4–18 coins. Use the quote frozen when the order forms, not later mastery/ad multipliers.

For a guest who has already paid and wants a table: occupied clean tables mean normal capacity waiting, not a cleaning failure. A dirty-table incident requires an eligible dirty unoccupied table, no eligible clean free table, and at least eight simulation seconds of continuous dirty-table blockage. Cleaning in time avoids the incident. Once the guest abandons seating for that reason, issue a **25% partial refund of their actual receipt**, rounded down, maximum 18 coins. Record it as the same kind of once-per-visit service incident; do not also charge a voucher.

At most one financial service incident per visit. Aggregate direct recovery/refunds per shift capped at 8% of frozen B and at the current available wallet. At the cap, operational consequences and complaints continue, but the UI says the recovery cap is reached. No escalating anger loops, persistent daily penalties or debt.

Give each visit a durable unique sequence ID at spawn; current customer IDs may restart on restore and must not be financial IDs. Persist the next sequence and committed incident IDs. Existing serviceMisses and serviceFees fields should be extended or reused consistently, not double-counted by both the old observer and the new ledger.

### What the player sees

Above the relevant table: plates, crumbs, subdued dirty tint and “Clean to seat guests”. During actual dirty-table blockage: a small amber warning anchored to that table. Queue complaints appear at the real bottleneck: “Waiting to pay” / “No coffee ready”. Show the remaining opportunity to recover; avoid simultaneous giant labels over every guest.

At payment/abandonment, one short anchored outcome: “Recovery −8” or “Table refund −4”. In the shift summary, show the top service cause and an actionable suggestion (“Two refunds came from dirty tables. Assign your cleaner to tables.”). Do not call the financial cap an immunity upgrade.

### Acceptance

Compare the same seeded developed shift under attentive play and neglect. The attentive player avoids the recovery debit; actual unattended dirty-table and patience failures cause bounded debits. Verify no clean-occupied-table fee, no duplicate incident, no per-frame charge, no lost-sale double debit, no negative wallet, no fee after pause, and no duplicate after restore. Update the old no-fee certificate to assert the protected early game AND bounded mature consequences. Preserve its protections; its old all-days-zero expectation is obsolete under this instruction.

## Batch 2 — Give the owner service decisions that staff cannot finish alone

**Player outcome:** a fully staffed café has meaningful interventions without making workers deliberately incompetent.

Add three owner actions using proximity and the existing contextual interaction button. Each has a 44px minimum touch target, a short progress ring, explicit verb and immediate visual result. No extra permanent bottom toolbar.

| Action | Initial behavior | Cost / tradeoff |
|---|---|---|
| Reassure a waiting guest | 1.25-second interaction restores up to 20% of original patience, never above original maximum; once per guest | Owner leaves another job; cannot revive an already completed/lost visit |
| Welcome a seated pet | 1.5-second greeting; a small species-specific reaction; contributes to an active compatible pet request | Once per visit; normal friendship remains checkout-based, so greetings cannot farm friendship indefinitely |
| Clear a table promptly | Existing cleaning remains the action; make completion and seating recovery immediate and legible | Requires owner attention when cleaner is occupied |

A worker priority control changes what existing staff do: Runner assignments remain per product; cleaner can prioritize tables or general cleanup (if the implementation has no other genuine cleaner work, ship only “Tables first” and omit a fake choice). Show each worker's current job in the Workers panel. Do not invent automatic bowl/mess jobs unsupported by the current simulation.

Add **two service equipment slots**, separate from permanent renovation ownership. Three initially purchasable modules, each one-time cost 1.5B; selection changes only between shifts:

- Quick tray: +20% Runner transfer rate; −15% maximum carried quantity, with a floor of one. No hidden movement-speed effect.
- Comfort service: +20% initial guest patience; −10% guest arrival rate. Crowd cap unchanged.
- Express register: +20% register processing rate; −10% per-item sale value. Receipts disclose the price modifier.

Effects use a single derived configuration; never mutate saved base upgrade levels. Equip at most two distinct modules. Display exact benefits AND tradeoffs before confirmation. Already wealthy players can buy all three, but still choose only two. Swapping is free between shifts. Provide a clear “No modules” state and no mid-shift exploit.

### Acceptance

Run the same seed with different loadouts; the documented rates change and unequipping restores the exact base values. No combination bypasses crowd caps or produces negative values. Show one seeded bottleneck where reassurance/cleaning prevents a genuine failure. Demonstrate every action through normal controls at mobile size. A disabled/available action is never represented by an unexplained glowing ring.

## Batch 3 — Make the pets the reason to return

**Player outcome:** visitors become characters with recognizable needs and visible relationships.

Author **three compact story arcs**, three visits each, using existing named profiles; select a real cat, dog and bunny from petBook.js and retain their exact identity/colors. No new collection currency. These nine beats are CONTENT rows in one system, not nine implementation tasks.

- Cat arc: a hesitant first welcome → a calmly completed café visit → a small regulars' coffee gathering for human companions. Reward: cat-window perch and a portrait memory.
- Dog arc: a seated greeting → a successful pet-treat visit with a clean seat → Pupcake Picnic. Reward: toy basket and a short play reaction.
- Bunny arc: a quiet greeting → a smoothie visit for the human companion plus a stocked pet bowl → Berry Bunny Club. Reward: miniature garden planter and a curious sniff reaction.

Implement the smallest set of generic objectives: greet a named pet; complete a visit satisfying a specific service condition; complete a themed Social at an indicated tier. Avoid a general quest scripting language.

Select one active story in the pet book. Guarantee an eligible active-story pet is scheduled once in the next ordinary shift, respecting the unique-name system; if it could not spawn, retain the invitation for the next shift. Never demand a species/product combination that random traffic might not supply. Only actual fulfilled objectives advance a beat. Failed visits offer another attempt, no reset of prior completed beats. Three stories may progress independently, but only one receives the guaranteed spotlight slot per shift.

Show one short readable request on that pet's card, a portrait, progress and reward preview. In-world, display an actionable greeting marker only near the appropriate pet. On success, animate the actual pet and unlock the actual room prop. Coffee/cupcakes are for human companions; pet food remains appropriate treats.

### Acceptance

Complete an arc using real guest events and interaction buttons. A missing pet is scheduled later instead of soft-locking progress. Reload between beats; no skipped beat, duplicate prop reward or duplicate named pet. All three rewards appear physically in the room at the normal camera zoom. Pet reactions differ by species and honor reduced motion.

## Batch 4 — Turn Socials into prepared bookings with meaningful spending

**Player outcome:** the player invests profits in a gathering, chooses a preparation strategy and accepts a disclosed challenge.

Keep today's free Cozy/Lively/Grand Socials and their medals as practice. Add **one optional premium booking choice per shift** from day 10. It shares the existing once-per-shift event reservation with Socials; players cannot stack the two to farm attendance or payouts. Booking ownership, rules and styling belong in the existing event panel, not a competing HUD button.

Three templates reuse the existing themes, now with two available human-menu product families and a pet-hospitality requirement. Derive the menu only from active stations. If fewer than two families are available, offer practice Socials instead. Suggested templates: Cat Club tasting, Puppy Birthday, Bunny Garden afternoon.

A booking has a fixed quote, stated objective, target attendance, duration and decorative preview. Show Bronze/Silver/Gold requirements before payment; no hidden tolerance changes during the event. Initial standard quote: 1.0B. Festival quote, unlocked by the corresponding existing Gold Social medal: 1.5B. Costs purchase visible flowers, table settings, favors and catering preparation, not an unexplained entry toll.

The full quote is spent once on confirmation; double-click and reload cannot spend twice. No additional random charges. No automatic booking purchase. The primary reward is a lasting themed decoration variant, story progress, recorded best grade and showcase qualification. Completion coin reimbursement is at most 40% of the quote, paid once; it is not another escalating money faucet. Ordinary sales still pay normally. This is intentional reinvestment: never promise guaranteed net profit.

Start with two optional preparation packages INCLUDED in the quote, choose one:

- Catering prep: reserve a finite, disclosed set of featured products, delivered through the real stock-capacity/overflow rules. No duplication, negative stock or infinite refill.
- Hospitality prep: reserve one existing table for booking guests during the event and extend their initial patience 15%; ordinary guests have one fewer table while the event runs. Eligibility requires at least two tables; release the reservation on finish/abort/restore expiry.

Booking guests must be identifiable and their objectives must count tagged real visits, not unrelated ordinary sales. Spread arrivals through the event; count them inside existing crowd caps. Show waiting-to-arrive guests rather than silently losing promised attendance. Do not raise crowd caps for spectacle. Avoid event targets requiring more throughput than the capped venue can physically deliver.

Use one event state machine: offered → purchased/preparing → running → completed/failed → settled. Persist quote, objective, duration, package and outcome. Pause uses simulation time. On reload, unfulfilled booked guests are rescheduled once; do not count discarded in-flight visitors as permanently lost. Restocking/reservations and already claimed rewards cannot replay.

### Acceptance

A purchase materially changes the room and guest mix. Two preparation packages have distinct, observable effects. Wallet reconciliation is exact after buy, failure, success and restore. No ghost table reservation, duplicate stock grant, over-cap spawn or impossible missing-guest objective. A rich migrated player gets challenge from service requirements and choices, not an inflated wealth-based price.

## Batch 5 — Give large savings a visible destination and define completion

**Player outcome:** accumulated money builds a distinctive café and unlocks a satisfying finale.

Create three authored improvement projects within the existing footprint. Projects enrich or replace corresponding renovation props; never duplicate them or sell an already-owned renovation again. Use a small project catalogue accessed through the existing renovation/career panel. Show a locked preview in the real room or a faithful thumbnail, exact placement, effect, total price and eligibility.

| Project | Initial quote | Non-cash requirement | Visible result |
|---|---:|---|---|
| Cat Window Lounge | 3B | Finish cat arc | Perch, cushion, scratching post, visiting-cat rest pose |
| Puppy Party Corner | 4B | Finish dog arc + Silver Pupcake medal | Toy basket, party banner, framed visitor photo |
| Bunny Conservatory | 5B | Finish bunny arc + Silver Berry medal | Planter, pet-safe garden dressing, bunny sniff spot |

Sell authored cosmetic variants for these projects through completed premium bookings. Variants are selectable, not cumulative stat multipliers. Match each project's palette, silhouette and species behavior; a recolored box is not an accepted prop.

Do not price against the player's wallet or confiscate savings. Freeze quotes when first offered. A wealthy player may fund construction immediately once eligible; they still earn the story/hosting requirements through play. Give owners of legacy renovations appropriate shared-prop credit or retain their owned art—record the mapping explicitly before migration.

Once all three projects and a Gold premium-booking grade are earned, unlock a **Grand Opening Showcase**: one authored multi-phase shift using the existing room. Announce three phases before entry: prepared service, pet welcome, final rush. Reuse event objectives and guest reservation logic. Reward a permanent entrance plaque, a room-wide celebration and a recap featuring the actual regulars. No reset, no forced bankruptcy, no promise of an unbuilt city.

Afterward, clearly say the authored campaign is complete. Offer repeat bookings with best-grade records and cosmetic variants. A finite game can remain enjoyable after completion; do not disguise exhaustion of content as infinite progression. Money may eventually accumulate again. The release must give it meaningful uses during the intended campaign, not guarantee that every possible lifetime balance stays small forever.

### Acceptance

Before/after images from the same camera show unmistakably different rooms. Each project has an actual pet interaction/reaction. A rich day-12 migration keeps its wallet and possessions and can begin the new loop immediately. Showcase requirements derive from durable progress and cannot be skipped by wallet size alone. Completion text and optional next activities are truthful.

## Batch 6 — Prove the whole experience and finish the presentation

Deliver one integrated tuning/polish pass, not an open-ended list of extras.

**Use three fixtures:** fresh start; representative day-12 fully staffed café; fully upgraded/renovated rich save. Preserve original copies. Use the owner's actual save if accessible with authorization; otherwise label fixtures synthetic. Never invent owner-save measurements.

Compare attentive, passive and deliberately neglectful play on identical seeds and equal simulated duration. Test a handful of ordinary shifts and each booking template; no thousands-of-run search without a specific question. Report gross sales, missed sales, direct recovery, spending, net change, event outcomes, interventions and frame cost. Show the distributions or ranges, not one convenient run.

Initial acceptance targets to evaluate and tune:

- A mature player encounters at least two opportunities per shift to improve an outcome; ignoring them affects service/events, not just an invisible score.
- Attentive and neglectful runs have a noticeable service/net-profit gap. Target approximately 15–30% in ordinary mature shifts as a tuning hypothesis; service debits themselves still respect the 8%B cap. Never falsify the target through forced random failures.
- With all workers, ordinary play remains comfortable; advanced booking Gold requires preparation or intervention. Passive completion of every advanced event fails this goal.
- At least two loadouts/preparation choices are useful under different templates. No single option dominates every measured case.
- The player can explain what caused a complaint, what they could have done, what the event costs and what its reward buys.
- Booking quotes are covered by approximately one to two representative ordinary shifts at their tier. Adjust B-derived pricing only from measured ordinary earnings.
- Every new menu works at 320px, portrait 390×844 and landscape 844×390. Panels scroll; primary actions remain reachable; no joystick/input leaks underneath them. Test keyboard focus and Escape, pause/ad overlays and reduced motion.
- No new per-frame geometry creation. Reuse meshes/materials, cap simultaneous decorative effects, render mostly static decor in merged/instanced batches. Compare the same developed scene before/after; target under 10% frame-time regression in the same harness, and label CI results as CI rather than phone certification.

## Delivery cadence: six batches, TWO browser checkpoints

| Delivery | Contents | Verification and release boundary |
|---|---|---|
| A: batches 1–3 | Financial consequence, operating choices, pet story loop | Focused tests per change; full fast suite/build once for the integrated batch; one shared browser check of incidents, actions, story reward, migration |
| B: batches 4–6 | Paid bookings, projects, showcase, tuning/polish | Full fast suite/build; one shared browser check of purchase → play → settle → restore plus mobile visual comparison; full required release gate once on final code |

A “batch” is a coherent implementation milestone, not a promise of one commit or one short model turn. No honest plan can promise major new art and mechanics in a fixed few minutes. Minimize repeated setup and pipelines; do not minimize the actual work or claim six batches are complete because six files exist.

Start each batch with a bounded inspection of its named files. Implement while independent verification runs. A failure blocks the dependent certification/release claim, not unrelated development. Correct its demonstrated cause and rerun the smallest relevant gate. Preserve genuine assertions. Use deterministic production simulation steps for long browser gameplay; retain actual UI interactions and actual sale/guest events. Record fixtures and any acceleration. Do not wait through minutes of unreliable wall-clock time repeatedly.

Preview deploy at the two integrated delivery checkpoints, not after every minor edit. Deployment is a playtest preview until the required final gates and owner visual acceptance pass. Publisher certification is external; no implementation agent can declare it complete from unit tests.

## Code and persistence guide

- `src/sim/serviceQuality.js`, customer/register event paths: incident qualification, grace windows, economic outcome.
- `src/sim/economy.js`, `src/sim/career.js`: derived loadout effects, frozen quotes, capped repeatable rewards.
- `src/sim/petBook.js`, `src/systems/petFriendship.js`, regular-visitor scheduler: story identity and progression.
- `src/sim/petSocials.js`, `src/systems/petSocials.js`: evolve the event system; do not bolt on a competing one. Existing party orders remain distinct and must not accidentally settle a booking.
- `src/render/renovation.js`, ambience/pet renderers: project art, authored pet reactions and limited event decoration.
- `src/game.js`, `src/sim/save.js`, `src/sim/saveSchema.js`, material checkpoint: canonical new state and atomic economic outcomes.
- `src/ui/*`, `src/core/input.js`: contextual actions, existing panel extensions, dialog input shielding.
- `src/sim/completion.js`: new truthful completion requirements.

Suggested durable groups: operations (owned/equipped modules and policy onboarding); hospitality (active story and per-pet beats); events (purchased bookings and settlement); projects (ownership and variants); finance (frozen baseline/quotes and bounded transaction IDs). Choose final names after reading current structures. Avoid rewriting the whole save schema: add validated optional groups with defaults, then bump/migrate version once if required by the repository's versioning contract. Old saves must self-round-trip; discard malformed optional content safely without losing the base café.

Persist each limited interaction that could otherwise be repeated for economic/story advantage. Decide explicitly how re-created guests resume bookings before shipping. Save/reload must not charge an event twice, grant prepared stock again, replay a completed story or keep a reserved table forever.

## Handoff instruction to the implementation model

Implement this document in the six batches above, beginning with batches 1–3 as Delivery A. Work on `mshowsary/ytb-plybe`, branch `chatgpt/pet-cafe-production`; check current remote state and preserve newer changes. Follow AGENTS.md and the owner's batched workflow. Do not reopen the old 40-task roadmap. Do not create a new 40-task roadmap from these paragraphs. Use a short checklist of the six deliveries and their actual status.

For every handoff give: exact SHA; implemented player-visible behavior; test/browser evidence; unresolved issues; next batch. Link a playable preview at integrated checkpoints. Show actual visual evidence, not rendered imagination presented as gameplay. If screenshots cannot be retrieved, say so. Never call retention proven without playtest data, art approved without visual review, or publisher certification passed without that result.

**Definition of done:** The owner can load their developed café, see a next investment worth wanting, make a preparation choice, recognize and help a particular pet, recover a service problem, understand a financial consequence, and work toward a visible finale. All of those must exist in the playable game.
