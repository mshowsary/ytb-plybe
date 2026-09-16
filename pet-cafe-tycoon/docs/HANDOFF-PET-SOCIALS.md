# Pet Socials — optional developed-café gameplay

Parent: 6ad87ebf6d004579a83c9a57ea896ed6f394cc6f. Branch chatgpt/pet-cafe-production; main unchanged.

From day 8, use **Host a Pet Social** (left HUD) during the first 140 seconds of a shift. Choose Purr & Pour (coffee), Pupcake Picnic (cupcake) or Berry Bunny Club (smoothie), then Cozy/Lively/Grand: sell 6/10/14 featured items in 90 simulation seconds. Menus require an active matching display; latte upgrades remain valid.

New guests favor the theme's species while preserving unique named-pet identity rules, and order its featured menu. Existing guests retain their wishes. No crowd cap, base prices, staff costs or spawn interval change. This makes menu preparation and Runner assignments relevant again. Balloons and bunting appear in the physical café while the social is active.

Success unlocks an explicit Collect action for a persistent per-theme bronze/silver/gold best medal and 100/200/320 coins. One start per shift. Missing the deadline adds no penalty or fee; ordinary service rules continue. Completed unclaimed events survive shift changes. No ads required.

State is meta.socials, normalized through snapshot, saveSchema and applySave. Five focused tests cover admission/expiry, actual product counts including latte, duplicate payout, old-save defaults and active-state canonical round trip, and bounded malformed inputs. Existing exact legacy-meta test adds the new safe default; no assertion removed.

Browser capture extension hosts via real UI, waits for actual sales, checks G.restore(G.snapshot()) mid-event, waits for real completion, and collects twice to assert one payout. Captures invitations, live progress/decor, and medal. Check its SHA-specific result; never call a pending capture passing. Local Chromium unavailable.

This is a new activity to playtest, not proof the game's retention or day-10 balance is solved. Tune targets only from real sessions. Pet animation/interaction depth and overall art-direction acceptance remain open. Full Production and publisher certification are separate release gates; avoid full pipelines per minor edit.
