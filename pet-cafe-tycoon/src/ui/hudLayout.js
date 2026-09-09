// src/ui/hudLayout.js — the single authority for where HUD furniture sits.
//
// WHY THIS EXISTS
// HUD placement had accreted across five modules as fixed `top` offsets forming one tall left
// column (#wallet, .meta-reputation, .meta-pawbook, #followers, plus #crowd when urgent). An owner
// playtest on an actual phone called it out directly: "icon soup — the HUD pills stay the same
// size on mobile, and in landscape the HUD is a third of the screen." Two complaints, one root
// cause — five independently-positioned pills, none of them aware of the viewport they're on.
//
// The fix collapses #wallet/#followers/.meta-pawbook/.meta-reputation into ONE resource bar
// (#resourceBar, built by arrangeHud() below) that scales its own type to the viewport instead of
// stacking more rows down the screen. #crowd is left out and left alone on purpose — it is hidden
// unless a customer's patience is critical, so it was never the thing making the column tall or
// the column loud.
//
// This stylesheet is injected last on purpose. The rules it replaces are themselves `!important`,
// so equal-specificity ordering decides the winner and the last sheet in the document must be the
// one that owns layout. Where a rule below targets a class the bar's children carry in from
// elsewhere (.meta-pawbook, .meta-reputation, both meta.js's own fixed-position boxes), it is
// written `#resourceBar > .foo` rather than plain `.foo` — the ID keeps it winning on SPECIFICITY
// too, so it beats src/ui/playablesShell.js's `body.playables-tiny .foo{...!important}` /
// `body.playables-compact .foo{...!important}` rules regardless of which stylesheet loads last.

const ID = 'pet-cafe-hud-layout';

// Below this height the resource bar's own top offset comes down a few px and the day/goal pills
// move up under the pause/calendar buttons — see the media query in the injected stylesheet.
const SHORT_VIEWPORT_BREAK = 420;

// "ONE resource bar, scaled to the viewport." 560 is roughly the shorter side of a small phone in
// portrait; below that the bar would otherwise keep printing 18px pill text into a 393px-wide
// frame. Never below 0.72 — past that a numeral stops being legible faster than it saves room.
function computeHudScale() {
  return Math.max(0.72, Math.min(1, Math.min(window.innerWidth, window.innerHeight) / 560));
}
function applyHudScale() {
  document.documentElement.style.setProperty('--hud', String(computeHudScale()));
}

// The bar's rendered height moves with the viewport (it wraps to a second 48px row on a narrow
// phone) and with --hud (its children's padding scales too), so #handsFull — parked directly
// under it in src/style.css — cannot use one fixed offset. A ResizeObserver is the one primitive
// that reports the bar's real height without re-measuring it on every animation frame.
let observedBar = null;
function observeBarHeight(bar) {
  if (!bar || observedBar === bar || typeof ResizeObserver !== 'function') return;
  observedBar = bar;
  const ro = new ResizeObserver(() => {
    const h = Math.round(bar.getBoundingClientRect().height) || 48;
    document.documentElement.style.setProperty('--bar-h', h + 'px');
  });
  ro.observe(bar);
}

// Builds #resourceBar the first time it runs and re-parents #wallet, #followers, .meta-pawbook and
// .meta-reputation into it in that fixed order. Idempotent on both axes:
//   - an element already inside the bar is left where it is (appendChild on an existing child just
//     reorders it to the end — never a clone — and the parentNode check below skips it entirely
//     when it's already last), so calling this twice never duplicates anything;
//   - an element that doesn't exist YET (module load order at boot is not this file's to control)
//     is simply picked up the next time arrangeHud() runs. installHudLayout() calls it once below;
//     main.js calls it again once every HUD piece exists.
export function arrangeHud() {
  const hud = document.getElementById('hud');
  if (!hud) return null;
  let bar = document.getElementById('resourceBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'resourceBar';
    bar.className = 'pill';
    hud.appendChild(bar);
  }
  const wanted = [
    document.getElementById('wallet'),
    document.getElementById('followers'),
    document.querySelector('.meta-pawbook'),
    document.querySelector('.meta-reputation'),
  ];
  for (const el of wanted) {
    if (el && el.parentNode !== bar) bar.appendChild(el);
  }
  // #handsFull reads as "under the bar" (src/style.css's #handsFull rule), so it needs to sit
  // right after the bar in DOM order too, not just in that rule's `top:` math.
  const handsFull = document.getElementById('handsFull');
  if (handsFull && handsFull.previousElementSibling !== bar) {
    hud.insertBefore(handsFull, bar.nextElementSibling);
  }
  observeBarHeight(bar);
  return bar;
}

export function installHudLayout() {
  if (document.getElementById(ID)) return;
  const s = document.createElement('style');
  s.id = ID;
  s.textContent = `
/* ---------- The resource bar --------------------------------------------------------------------
   One pill instead of four separate ones. Children keep their own ids/classes/click handlers
   (#wallet, #followers, .meta-pawbook opens the Pet Book, .meta-reputation opens the Paw sheet) —
   this only changes where they sit and how they look while sitting there. */
#resourceBar{left:calc(12px + var(--sal));top:calc(12px + var(--sat));display:flex;flex-wrap:wrap;
  align-items:stretch;gap:0;padding:0 6px;box-sizing:border-box;
  /* Leaves the top-right corner free for the pause button (right:12, 48px) and the calendar
     button (right:68, 48px) — src/ui/pauseMenu.js and src/systems/rewardsSystem.js respectively —
     so the bar can never grow into either one. */
  max-width:calc(100vw - 24px - 128px - var(--sal) - var(--sar))}
/* Every re-parented piece arrives with its own position:fixed/absolute and its own drop shadow
   (#wallet/#followers are .pill; .meta-pawbook/.meta-reputation are meta.js's own boxes) — all of
   that has to go once it is a flex child of one shared pill, or it paints twice: once where its
   old rule still puts it, and again inside the bar's flow. The !important plus the ID-scoped
   selector above is what lets this win against meta.js's/playablesShell.js's own !important rules
   for the same classes, in either load order (see this file's header comment).
   Deliberately NOT forcing display:flex here: #wallet/#followers/.meta-pawbook already lay out
   their own icon+numeral as a flex row (.pill's own rule, meta.js's own rule) and stay exactly as
   they were. .meta-reputation is the one exception — it STACKS a title row over a thin progress
   bar, which needs to stay display:block (its own default) or the two rows would become flex
   items side by side and the bar would collapse to almost nothing. The bar's own
   align-items:stretch still gives it the full row height regardless of its own display value. */
#resourceBar>*{position:static!important;top:auto!important;left:auto!important;right:auto!important;
  bottom:auto!important;min-height:48px;padding:0 calc(10px * var(--hud,1));box-shadow:none!important;
  background:transparent!important;border-radius:0;box-sizing:border-box;flex:none}
/* A thin inner seam instead of each child's own shadow — one pill now reads as one control, with
   just enough of a line to separate its readouts. */
#resourceBar>*:not(:last-child){box-shadow:inset -1px 0 #0001!important}
/* .meta-pawbook/.meta-reputation are real tap targets (open the Pet Book / Paw sheet), so the
   certification floor (48x48 CSS px) applies inside the bar exactly as it did outside it, at every
   viewport — including the torture-test body.playables-tiny class, whose own 40-44px overrides
   this beats on specificity regardless of stylesheet order. */
#resourceBar>.meta-pawbook,#resourceBar>.meta-reputation{min-width:48px!important;min-height:48px!important;
  padding:0 calc(10px * var(--hud,1))!important;pointer-events:auto!important;cursor:pointer}
/* #hud is pointer-events:none and the property inherits down to the bar; the two buttons above
   re-arm themselves, the readouts stay inert so a tap between them reaches the café. */
#resourceBar{pointer-events:none}
/* heartIcon()'s raw <svg> carries no width/height of its own (relies on CSS, same convention as
   every other icons.js glyph) — em, not px, so it shrinks in step with the bar's own scaled
   font-size instead of staying a fixed size while the numeral beside it gets smaller. */
#followers .picon{width:1.1em;height:1.1em;flex:none;color:var(--ink)}
/* Under 480px of width the bar cannot hold all four readouts on one row (the top-right corner is
   reserved for the pause and calendar buttons), and a flex wrap leaves the last one alone on a
   second row — a lonely ★ under three readouts, measured at 393x660. A 2x2 grid keeps the block
   square: wallet and ♥ over paws and ★. The seam moves with it: only the left column carries one. */
@media (max-width:479px){
  #resourceBar{display:grid;grid-template-columns:auto auto;grid-auto-rows:48px;row-gap:4px}
  #resourceBar>*:nth-child(2n){box-shadow:none!important}
}
/* The publisher's smallest frames (218x418 in tools/playables-cert-smoke.js, 183x416 in
   tools/ultra-narrow-smoke.js) have no room for the bar beside the day pill at all. Below 330px the
   day pill and the goal pill drop under the bar — its measured height, via --bar-h — the calendar
   button tucks under the pause button so the bar may use the width up to the pause button alone,
   and below 260px the bar is one column, so even a five-digit wallet never reaches the pause button.
   The party chip (top:350/352 in src/systems/partyOrders.js) stays below all of it. */
@media (max-width:329px){
  #resourceBar{max-width:calc(100vw - 24px - 60px - var(--sal) - var(--sar))!important}
  .rewards-cal-btn{right:calc(12px + var(--sar))!important;top:calc(68px + var(--sat))!important}
  #dayPill{top:calc(22px + var(--sat) + var(--bar-h,48px))!important;right:calc(12px + var(--sar))!important}
  #goalPill{top:calc(110px + var(--sat) + var(--bar-h,48px))!important}
}
@media (max-width:259px){
  #resourceBar{grid-template-columns:auto}
  #resourceBar>*{box-shadow:none!important}
  /* certificationPolish.js parks the event banner at top:160px on body.playables-tiny, which is now
     inside the one-column bar. Under the day pill instead (bar + 22px + the pill's ~83px + 8px),
     at the same specificity so this later sheet wins. */
  body.playables-tiny #banner{top:calc(113px + var(--bar-h,48px) + var(--sat))!important}
}

@media (max-height:${SHORT_VIEWPORT_BREAK - 1}px){
  /* Short viewports don't get a different SHAPE any more (the bar already wraps its own rows) —
     just a little more headroom, and the day/goal pills tuck up under the pause/calendar buttons
     instead of sitting on #resourceBar's old row. */
  #resourceBar{top:calc(8px + var(--sat))!important}
  #dayPill{top:calc(66px + var(--sat))!important;min-width:0!important}
  #goalPill{top:calc(120px + var(--sat))!important}
  /* A hint parked 120px above the bottom edge eats a third of a 280px frame. */
  #hint{bottom:calc(12px + var(--sab))!important}
  .skipPill{bottom:calc(12px + var(--sab))!important}
  .toast{bottom:calc(60px + var(--sab))!important}
}

/* ---------- Narrow viewports: keep every pill sized to its own content ----------
   Truncation ("Restock" rendering as "estock") is a certification defect, so pills shrink their
   padding and type rather than clipping the words they exist to show. These flat sizes predate
   --hud (they used to just be a fixed, already-small px value) — kept scaling by var(--hud,1) here
   too, or a narrow-but-tall phone would fall BACK to a flat 15px right where the viewport scale is
   trying hardest to shrink things. #resourceBar itself gets its own padding/gap back afterward: the
   bare .pill rule below would otherwise re-inflate the bar's own padding to 6px 10px and put a
   6px gap between its children on top of their divider line, undoing the "one control" look. */
@media (max-width:360px){
  .pill{padding:6px 10px!important;font-size:calc(15px * var(--hud,1))!important;gap:6px!important}
  #resourceBar{padding:0 6px!important;column-gap:0!important}
  #crowd{font-size:14px!important}
  #dayPill{min-width:0!important;font-size:calc(13px * var(--hud,1))!important}
  #goalPill{font-size:calc(12px * var(--hud,1))!important}
  .meta-reputation{max-width:124px!important}
  #followers{font-size:calc(14px * var(--hud,1))!important}
}

/* Tap targets stay at the platform minimum at every size. */
.fbtn,.meta-pawbook,.skipPill,.meta-book-close{min-height:48px!important}
`;
  document.head.appendChild(s);
  applyHudScale();
  window.addEventListener('resize', applyHudScale, { passive: true });
  window.addEventListener('orientationchange', applyHudScale, { passive: true });
  // Every HUD piece this module re-parents (#wallet, #followers, .meta-pawbook, .meta-reputation)
  // is already created by the time main.js calls this (createGame() runs first) — see this task's
  // handoff for the one extra call main.js adds as a safety net for any future reordering.
  arrangeHud();
}
