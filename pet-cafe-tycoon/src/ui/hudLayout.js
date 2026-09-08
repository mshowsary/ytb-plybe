// src/ui/hudLayout.js — the single authority for where HUD furniture sits.
//
// WHY THIS EXISTS
// HUD placement had accreted across five modules as fixed `top` offsets (12 / 72 / 130 / 184 / 238)
// forming one tall left column. That column needs 282px of vertical room. A reviewer dragging the
// frame to landscape gets as little as 280px total, so the bottom of the stack fell off the screen
// or collided with the badge above it.
//
// Compressing the column is the wrong fix — it only moves the failure to a smaller viewport. Short
// viewports need a genuinely different SHAPE: landscape HUDs belong in rows across the top, not in
// a column down the side. Below 420px of height this reflows the column into two rows.
//
// This stylesheet is injected last on purpose. The rules it replaces are themselves `!important`,
// so equal-specificity ordering decides the winner and the last sheet in the document must be the
// one that owns layout.

const ID = 'pet-cafe-hud-layout';

// Vertical room the tall left column requires (last slot top + its height). Below this the column
// cannot fit, whatever we scale it to.
const COLUMN_MIN_HEIGHT = 420;

export function installHudLayout() {
  if (document.getElementById(ID)) return;
  const s = document.createElement('style');
  s.id = ID;
  s.textContent = `
/* Followers pill (plan 3.3/7.4): icon + numeral, appended below the pawbook in the tall column.
   Content lives in src/ui/hud.js; every position (this default plus both media queries below)
   lives here so hudLayout.js stays the one place that decides where HUD furniture sits. 296px
   clears meta-pawbook's fixed top:238 (see src/ui/meta.js) plus its ~44px height with headroom to
   spare, and the whole column still fits well inside COLUMN_MIN_HEIGHT. */
#followers{left:calc(12px + var(--sal));top:calc(296px + var(--sat));font-size:16px}
#followers .picon{width:20px;height:20px;flex:none;color:var(--ink)}

/* ---------- Short viewports: reflow the left column into three top rows ----------
   Row 1: wallet · crowd · hands-full          (right: day pill)
   Row 2: reputation · paw book                (right: goal pill)
   Row 3: followers
   Every offset is horizontal here, so vertical room stops being the binding constraint. */
@media (max-height:${COLUMN_MIN_HEIGHT - 1}px){
  #wallet{left:calc(10px + var(--sal))!important;top:calc(8px + var(--sat))!important}
  #crowd{left:calc(112px + var(--sal))!important;top:calc(8px + var(--sat))!important}
  #handsFull{left:calc(214px + var(--sal))!important;top:calc(8px + var(--sat))!important}
  .meta-reputation{left:calc(10px + var(--sal))!important;top:calc(62px + var(--sat))!important;
    min-width:0!important;max-width:130px!important}
  .meta-pawbook{left:calc(148px + var(--sal))!important;
    top:calc(62px + var(--sat))!important;min-height:44px!important}
  #followers{left:calc(10px + var(--sal))!important;top:calc(116px + var(--sat))!important;
    font-size:14px!important}
  /* The top-right corner is already owned by the pause (right:12) and calendar (right:68)
     buttons, both 48px tall at top:12. Day and goal pills take the rows BELOW them. */
  #dayPill{top:calc(66px + var(--sat))!important;min-width:0!important}
  #goalPill{top:calc(120px + var(--sat))!important}
  /* A hint parked 120px above the bottom edge eats a third of a 280px frame. */
  #hint{bottom:calc(12px + var(--sab))!important}
  .skipPill{bottom:calc(12px + var(--sab))!important}
  .toast{bottom:calc(60px + var(--sab))!important}
}

/* ---------- Narrow viewports: keep every pill sized to its own content ----------
   Truncation ("Restock" rendering as "estock") is a certification defect, so pills shrink their
   padding and type rather than clipping the words they exist to show. */
@media (max-width:360px){
  .pill{padding:6px 10px!important;font-size:15px!important;gap:6px!important}
  #crowd{font-size:14px!important}
  #dayPill{min-width:0!important;font-size:13px!important}
  #goalPill{font-size:12px!important}
  .meta-reputation{max-width:124px!important}
  #followers{font-size:14px!important}
}

/* Tap targets stay at the platform minimum at every size. */
.fbtn,.meta-pawbook,.skipPill,.meta-book-close{min-height:44px!important}
`;
  document.head.appendChild(s);
}
