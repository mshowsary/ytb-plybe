# Pet Café v2 — the design contract

One café, designed as a whole. If a change breaks a rule below, the change is wrong.

## The five rules
1. **Every product flows the same way:** pantry shelf → machine → counter → guest → till.
   A machine that needs an ingredient shows how much it has left, and the ingredient is a labelled
   sack/crate you carry from the pantry shelf. No station refills itself by being stood next to.
2. **What you carry is visible**, stacked in your arms. You carry one kind at a time.
3. **Nobody gets stuck holding things.** A counter reserves the slots someone is already carrying
   for, so two carriers never overfill it. Leftovers go back to where they came from (the oven tray,
   the pantry shelf) when you walk to it.
4. **A build pad is the footprint of the thing it builds**, on the spot where it will stand, with a
   see-through preview of it. One pad, one thing.
5. **Everything faces the camera.** Counters show their goods, machines show their trays, guests
   stand on the camera side of the counter, staff work behind it. Tables are cleaned from any side.

## Layout (metres; x right, z toward the camera)
- Room x −7..7, z −5..5. Kitchen along the back wall (z ≈ −4.3), service line at z −1.6
  (staff behind at z −2.6, guests in front at z −0.5), dining floor z 0.5..4.5, door front-right.
- Milestone 1 — the Bakery: pantry (flour), cookie oven, cookie counter, till, 2 tables. Pads: tables,
  Runner, cupcake oven, cupcake counter, Cashier, Cleaner, jukebox.
- Later milestones: coffee corner (beans), pet treat bar (kibble), fruit garden + smoothies, ice cream
  garden, then the Grand Opening and the loop (rushes, parties, pets, themes).

## Staff
- **Runner:** oven → counter (reserving slots), pantry → oven when an oven runs low.
- **Cashier:** stands at the till and serves the queue.
- **Cleaner:** wipes dirty tables and brings the tip in.

## Tone
Never punishing: no fines, no timers that cost you. A guest who waits too long simply leaves.
Pictures, not words, in the play field. Ads are opt-in things in the world (▶ badges), never gates.

## Working rules
Small change → `npm run build` → the owner plays. No test suites, bots or certification runs.
