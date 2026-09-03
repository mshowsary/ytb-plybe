# Pet Café Tycoon — Loop v2 design (design-only pass, 2026-09-03)

Written by the controller alone after the user's Milestone 3 playtest. Purpose: fix the four design mistakes that made the game playable but not a game, define the rhythm and economy, and give any executor (this session, another model, or a team) a complete, decided design. Nothing here is implemented yet.

## 1. Principles (what the playtest and the reference taught)

1. **Every station says what it is and what it needs.** No mystery objects, ever.
2. **You only do what you mean to do.** No passive pickups, no panels that open because you walked by.
3. **One display per product.** Demand is visible per product; a full cookie shelf never blocks a cupcake customer.
4. **Days, not a flat stream.** Calm, rush, closing; weekends and holidays; a summary with stars and a goal.
5. **Scarcity.** You can afford one or two things per day. Choosing is the game.
6. **Progress is legible.** Star levels on stations, a day counter, a next-goal card.

## 2. Stations and displays (replaces "counters accept everything")

| Station | Produces / holds | Needs | Label + icon on a chalkboard |
|---|---|---|---|
| Oven A | cookies (stock ≤ 8) | nothing | "OVEN · cookies" |
| Oven B | cupcakes (stock ≤ 8) | nothing | "OVEN · cupcakes" |
| Coffee machine | coffee cups (≤ 8) | beans sack (20 cups) | "COFFEE · needs beans" |
| Blender | smoothies (≤ 8) | fruit (3 per harvest) | "BLENDER · needs fruit" |
| Pantry (was "storage") | beans and kibble sacks | nothing | "PANTRY · beans · kibble" — the player picks the sack from a two-button popup, never automatically |
| Garden bushes | fruit, 3 per ripe bush | time (25 s) | "GARDEN · harvest when green" |
| Cookie display, Cupcake display, Coffee bar, Smoothie bar | one product each, cap 8 → 12 → 16 by star level | restocked by the player or a runner assigned to that display | product icon + "n/cap" |
| Treat bowl | pet treats (≤ 10) | kibble sack | "TREATS · for pets" (bone icon) |
| Register ×2 | takes money only while manned | you or a cashier | "REGISTER" |
| Tables | seating; get dirty | cleaning | plate icon when dirty |
| Kiosk | upgrades panel | tap the floating button | "UPGRADES" |
| Hire desk | staff | tap the floating button | "STAFF" |

Customers queue at the display of their wish; if it is empty they wait with patience, and after 6 s they settle for another stocked display. The wish bubble stays the same icons.

## 3. Interaction model (replaces proximity everything)

- **Explicit pickup:** you take from a station only when you are inside its front zone, standing still or nearly (speed < 0.6 m/s) for 0.25 s, and facing it. Then items flow at the usual cadence. Moving through a front zone never picks anything up.
- **One product type in the stack.** Standing at a different product's station with a non-empty stack does nothing except show a small "hands full · cookies" tag under the crowd pill.
- **Drop anywhere useful:** every display accepts its own product; the pantry takes back sacks; the blender takes fruit. A "return" spot next to the pantry (a crate with a down-arrow icon) takes any stack back for zero coins so you are never stuck.
- **Panels open by intent:** when you stand in front of the kiosk or hire desk, a floating button appears above it ("UPGRADES" / "STAFF"); tapping the button opens the panel; walking away removes the button; nothing opens by itself. Esc or the chevron closes.
- **Register:** unchanged (stand there to serve), with a visible "SERVING" tag and the cha-ching.

## 4. Clarity and onboarding

- Chalkboard name + icon on every station (3D board with a DOM label projected at the top edge; the icon is the same SVG set as the wish bubbles).
- First approach to any station shows a one-line hint bubble once ("Stand here to take cookies").
- **Intro (first 60 s):** scripted arrows and locked spawns: 1 bake at Oven A → 2 stock the cookie display → 3 serve at the register → 4 collect the cash → 5 build the cupcake oven → 6 free play. Skippable with a tap after step 3.
- The terrace gate does not exist until area 2 is built; the terrace itself is a later milestone. The fence stays closed.

## 5. Rhythm: days, rush hours, weekends, holidays

A day lasts 4 real minutes, with a clock in the HUD (a sun dial) and a day counter.

| Phase | Length | Spawn | Tips | What it feels like |
|---|---|---|---|---|
| Morning | 60 s | base ×0.7 | ×1.0 | restock, prep sacks, harvest |
| Rush hour | 90 s | base ×2.0, cap +4 | ×1.5 | the register queue and displays under pressure; "RUSH HOUR" banner, faster music |
| Afternoon | 60 s | base ×1.0 | ×1.0 | catch up, buy, hire |
| Closing | 30 s | none | — | tables get cleaned, the day summary card |

- **Weekend** (days 6 and 7 of each week): rush spawn ×1.5 on top, pets ×2, tips ×1.25. Banner "WEEKEND".
- **Holiday** (every 7th day, day 7/14/…): one special wish (holiday cupcake, 2× price) sold from the cupcake display for that day; a bunting decoration; banner "HOLIDAY".
- **Day summary card:** earnings, customers served, lost sales, stars earned; the next day's goal ("Serve 45 customers", "Lose fewer than 4", "Earn 900") with a coin reward, and the "next unlock" preview.
- Save point is the day summary (fits the platform layer: one `saveData` per day plus on pause).

## 6. Levels and stars

- Each station has 1–3 stars bought in its own row of the Machines tab (or by tapping the station's chalkboard, which opens the panel on that row). Star 2 = +50 % speed or capacity; star 3 = a second recipe (Oven A: cookies + brownies; Coffee: coffee + latte) sold at a higher price.
- Workers keep Speed and Carry levels; a runner is **assigned to one display** (the row shows a display picker), so runners stop fighting the player.
- Café level = total stars; every 5 stars unlocks a decoration set (awning colour, plants, music variation) and raises the base customer cap by 1.

## 7. Economy with scarcity (targets, to be verified by the bot with the friction index)

- A day's income is throughput-bound: roughly customers served × average order. Targets: day 1 ≈ 250 coins, day 3 ≈ 600, day 5 ≈ 1 100, day 8 ≈ 2 000.
- Prices are set so that at the end of each day you can afford **one** of the two or three affordable options (build, hire, star). The bot reports "affordable options at closing" (target 2–3) and "days to afford everything in area 1" (target 10–12 days ≈ 45 min of play).
- Unlock chain by day (guideline): D1 cupcake oven, cupcake display → D2 second register, hire desk (cashier 600) → D3 coffee machine + coffee bar, runner (700) → D4 tables set 2, garden → D5 blender + smoothie bar → D6 treat bowl, cleaner → D7 kiosk stars → D8–10 star levels, decorations → area 2 gate (next milestone).
- Friction index: share of customers who waited more than 6 s, target 30–60 % during rush, < 20 % outside rush. Lost sales 5–12 % per day.

## 8. Paper playthrough (first two minutes)

0:00 intro arrow to Oven A; 0:10 six cookies to the cookie display; 0:20 first two customers pay at the register while I stand there (cha-ching ×2, 48 coins); 0:35 collect the pile; 0:45 the cupcake oven outline (60) fills as I walk over it; 1:00 morning ends, rush banner: eight customers, two want cupcakes — the cupcake display shows 0/8 in coral, I bake and stock while the cookie line waits, patience bars drop, one settles for a cookie; 1:40 the register queue is five deep, I serve; 2:30 rush ends, afternoon: 220 coins, options: second register (90) or tables (65) — I take the register; 4:00 day summary: 61 customers, 3 lost, 1 star, goal for day 2, "next: hire a cashier (600)".

## 9. What is removed

Passive pickups; shared counters; the proximity-opening panel; the default beans sack; the terrace gate until area 2 exists; the flat customer stream.

## 10. Execution plan (small tasks, each with a review)

1. **Displays + explicit interaction** (M): dedicated displays, facing-based pickup with the standing rule, return crate, pantry popup, runner assignment; sim tests; the full-house test updated to stock displays.
2. **Clarity** (S): chalkboards, first-approach hints, intro script, floating panel buttons, gate hidden.
3. **Rhythm + economy** (M): day clock and phases, weekend/holiday, summary card with goals, stars per station, price table; bot metrics: friction index, affordable options at closing, days to complete; balance to the day-1..8 targets.

Estimated cost: the three tasks together are about one Milestone-3-sized effort if run tightly (each task reviewed once, screenshots judged from a cold-start strip). Then the platform layer, then polish and playtests.
