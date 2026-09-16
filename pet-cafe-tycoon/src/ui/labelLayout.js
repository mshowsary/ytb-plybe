// src/ui/labelLayout.js — the single arbiter for every world-projected label on screen.
//
// WHY THIS EXISTS
// Nine independent systems (customers, stations, zones, visuals, objective, partyOrders,
// petMoments, interactionCoach, contractBadge) each projected a world point to screen coordinates
// and wrote `style.left/top` with no knowledge of one another or of the viewport edge. At small
// viewports that produced overlapping pills, labels escaping the frame, and captions clipped to
// fragments ("Restock" rendering as "estock") — the exact defects a Playables/MediaCube reviewer
// hunts for by dragging the frame to its smallest size in both orientations.
//
// DESIGN
// This runs as a post-layout pass once per frame, AFTER the owning systems have positioned their
// elements. It therefore needs no changes in those systems: it reads their intent, then corrects it.
//
//   1. read  — batch-measure every managed label (one layout flush, no interleaved writes)
//   2. solve — clamp into the safe box, evict from HUD keep-out zones, resolve label/label overlap
//   3. write — batch-apply corrected positions
//
// Corrections never accumulate: the intended position is tracked separately from the applied one,
// so a system that repositions its label each frame keeps full authority over where it wants to be.

// The REGISTRY of what the arbiter owns, plus the anchor each class's own CSS transform implies
// (a `.wish` at `translate(-50%,-100%)` is anchored 0.5 across and 1.0 up).
//
// The factors are documentation, not arithmetic: rects are built from measured geometry (see the
// read phase), because a class may additionally carry a scale no factor pair can express.
//
// Registering a class here is what puts it under the solver at all — MANAGED below is derived from
// this table, so a class missing here is not merely mis-anchored, it is invisible to the arbiter
// entirely. That is how `.pet-identity` slipped through: petMoments.js appended its tags to `#fx`
// and wrote raw projected `left/top` like every other label system, but the class was never
// registered, so a pet standing off the left edge rendered its tag clipped to a fragment
// ("Biscuit" -> "cuit") and nothing clamped it. Any new projected label class must be added here.
const ANCHORS = [
  ['.wish', 0.5, 1.0],
  ['.patience', 0.5, 0.0],
  ['.demand', 0.5, 0.5],
  ['.chalk', 0.5, 0.5],
  ['.objCaption', 0.5, 0.5],
  ['.zlabel', 0.5, 0.5],
  ['.zprice', 0.5, 0.5],
  ['.fbtn', 0.5, 0.5],
  ['.polaroid', 0.5, 1.0],
  // Same anchor as a wish bubble: the tag hangs above the pet it names.
  ['.pet-identity', 0.5, 1.0],
];

// Higher wins ties and is placed first. Interactive controls outrank everything: they are tap
// targets, so they may never be nudged or hidden. Decorative menu chalk yields first.
//
// Order matters: classOf() returns the FIRST matching row, so a compound selector must precede the
// bare one it specialises.
const PRIORITY = [
  ['.fbtn', 100],
  ['.wish', 80],
  ['.patience', 78],
  // A pet tag is usually pure flavour and yields to everything informative. Two of its states are
  // not flavour and must outrank the readouts below: a play-break tag is an offer the player is
  // meant to act on, and a regular-greeting tag is the returning-visitor moment. Both carry their
  // own selector so they can be ranked — and, in HIDEABLE, excluded from being hidden — on their
  // own terms while the bare tag stays disposable.
  ['.pet-identity.play-break', 74],
  ['.pet-identity.regular-greeting', 72],
  // The developed photo, on its way to the Pet Book button. Ranked with .zprice: it is a reward
  // readout the player should not lose, but it must yield to a wish bubble and to any tap target.
  ['.polaroid', 60],
  ['.zprice', 60],
  ['.zlabel', 58],
  ['.demand', 55],
  ['.pet-identity', 52],
  ['.objCaption', 50],
  ['.chalk', 20],
];

// Labels that may be hidden outright when no collision-free slot exists. Anything absent from this
// list is always drawn, even if it must overlap, because losing it would cost the player real
// information or a control.
//
// The two gameplay-bearing pet-tag states resolve to their own compound selectors above, so listing
// only the bare class here hides a nameless ambient tag while never hiding an offer.
const HIDEABLE = new Set(['.chalk', '.demand', '.pet-identity']);

// HUD furniture that world labels must not sit under. Measured live so it tracks content changes.
const HUD_KEEPOUT = '#resourceBar,#wallet,#crowd,#dayPill,#goalPill,#hint,#banner,#handsFull,#followers,.meta-reputation,'
  + '.meta-pawbook,.contractBadge,.skipPill,#joy,.pause-btn,.rewards-cal-btn,.meta-toast,'
  + '.coach-caption,.friendship-toast,.golden-indicator,.toast,.build-intent-progress';

const MANAGED = ANCHORS.map(a => a[0]).join(',');
// Every frame, not every 12th: the interaction coach moves continuously, and a stale keep-out
// rect for it let station labels settle exactly where it was about to be. ~15 rect reads sit
// in the same batched-read phase as the labels themselves, so this costs no extra layout flush.
const KEEPOUT_REFRESH_FRAMES = 1;
// The top-right corner can hold the pause button, calendar button and day pill at once, so a
// label displaced from it may need to travel well over 100px before it finds clear space.
const NUDGE_STEPS = [0, 12, 24, 40, 60, 84, 112, 148];
// Vertical displacement first: a label lifted above its anchor still reads as belonging to it.
const NUDGE_DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];

// ---- label scale ----------------------------------------------------------------
// World labels are drawn at a fixed pixel size, but the camera is not at a fixed distance. scene.js
// fits a fixed number of METRES across the viewport: ~16.25 m on a 16:9 desktop (camera ~12.6 m
// away) but only 10 m in portrait, which pushes the camera to ~24 m on a 380x670 phone.
//
// The quantity that actually matters is the ratio of a label to the THINGS IT POINTS AT. A customer
// is a fixed size in the world, so their on-screen height is inversely proportional to
// worldPerPixel() — unlike a label drawn at a fixed pixel size. Resize the window and the characters
// shrink while the bubbles do not, which is the owner's report verbatim: on a phone the price pill
// comes out the size of the customer's head, and during a rush the queue becomes a wall of pills
// with the pets and workers hidden behind them.
//
// So the policy is character-relative and nothing else: `byDistance` is the factor that holds
// (label px / character px) constant. An earlier revision OR-ed in a viewport-width term to stop
// small desktop windows shrinking their labels. That was backwards for this game — a smaller window
// shows smaller characters, so its labels must shrink too — and it is what let a 380px phone sit at
// 0.79 when the character-relative factor was 0.48.
const REF_WORLD_PER_PX = 0.0127; // the shipped 1280x720 look: 2 * 12.55 * tan(20deg) / 720
// An absolute legibility floor only. It bounds how far the character-relative term may compress the
// smallest label this game ships; it binds below ~430 CSS px of width and nowhere else.
const LABEL_SCALE_MIN = 0.5;

export function labelScalePolicy(worldPerPixel) {
  const wpp = Number.isFinite(worldPerPixel) && worldPerPixel > 0 ? worldPerPixel : REF_WORLD_PER_PX;
  // Capped at 1: a camera closer than the reference would scale labels up, but they are already
  // legible there, and growing them would eat the frame the player just zoomed in to see.
  return Math.min(1, Math.max(LABEL_SCALE_MIN, REF_WORLD_PER_PX / wpp));
}

const SCALE_STYLE_ID = 'pet-cafe-label-scale';
const SCALE_ROOT_CLASS = 'label-scale-root';

// ---- density ---------------------------------------------------------------------
// The owner's report: during a rush the queue around a register becomes a wall of pills, and the
// pets and workers behind them stop being visible. That is a different failure from overlap —
// solving overlap only spreads the pills out, it never makes fewer of them. So once the café is
// genuinely crowded, everything except the labels nearest the player is dimmed.
//
// Nothing here moves a label or changes its size: it is opacity only, applied after the solve, so it
// cannot fight the solver or invalidate the rects it measured. Muting on opacity alone also avoids
// a size oscillation — a density-driven SCALE would pulse every time a customer spawned or left.
//
// "Nearest the player" is measured as distance from the viewport centre, which is a faithful proxy
// because the camera follows the owner: the label closest to the middle of the frame is the one
// closest to the player's attention. No new signal has to be plumbed in from the simulation.
const MUTABLE = new Set(['.wish', '.demand', '.chalk', '.zprice', '.zlabel', '.objCaption', '.pet-identity']);
const DENSITY_FULL = 4;   // at or below this many labels, nothing is dimmed at all
const DENSITY_FOCUS = 3;  // how many stay at full strength once the café is crowded
const MUTED_CLASS = 'label-muted';

// The CSS `scale` property, not a `transform` override: it composes with whatever transform each
// class already owns (a wish bubble's translate, `.pet-identity.show`'s -108% entrance, `.demand`'s
// own dense-café scale in responsive.js) instead of clobbering it. Where `scale` is unsupported it
// is simply ignored and labels keep today's size — the correct failure mode for a cosmetic rule.
function installScaleStyle() {
  if (document.getElementById(SCALE_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = SCALE_STYLE_ID;
  s.textContent = `.${SCALE_ROOT_CLASS} :is(${MANAGED}){scale:var(--label-scale,1)}`
    // `!important` for the same reason .label-crowded uses it: a label's own `.show` rule (two
    // classes) outranks a single-class rule, and dimming must win over the entrance state.
    + `.${MUTED_CLASS}{opacity:.45!important;transition:opacity .2s ease}`;
  document.head.appendChild(s);
}

function classOf(el, table, fallback) {
  for (const row of table) if (el.matches(row[0])) return row;
  return fallback;
}

function intersects(a, b, tol) {
  return Math.min(a.r, b.r) - Math.max(a.l, b.l) > tol && Math.min(a.b, b.b) - Math.max(a.t, b.t) > tol;
}

export function createLabelLayout(els, opts = {}) {
  const root = (els && els.fx) || document.getElementById('fx') || document.body;
  const tol = opts.tolerance ?? 3;
  // Metres per CSS pixel at the camera target. Absent in tests and in any host that builds the
  // arbiter without a scene; labelScalePolicy() then falls back to the reference camera.
  const worldPerPixel = typeof opts.worldPerPixel === 'function' ? opts.worldPerPixel : () => REF_WORLD_PER_PX;
  const state = new WeakMap(); // el -> { il, it, al, at }
  let keepout = [];
  let frame = 0;
  let appliedScale = null;
  let insets = { l: 0, t: 0, r: 0, b: 0 };

  root.classList.add(SCALE_ROOT_CLASS);
  installScaleStyle();

  // A custom property holds the unresolved `env(...)` token, so getPropertyValue('--sat') yields a
  // string, not a length. Resolving it requires a real element whose padding uses env() directly.
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
    + 'padding-left:env(safe-area-inset-left,0px);padding-top:env(safe-area-inset-top,0px);'
    + 'padding-right:env(safe-area-inset-right,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
  document.body.appendChild(probe);

  function readInsets() {
    const cs = getComputedStyle(probe);
    const px = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    insets = { l: px(cs.paddingLeft), t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom) };
  }

  function refreshKeepout() {
    keepout = [];
    for (const el of document.querySelectorAll(HUD_KEEPOUT)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // A small margin keeps world labels visually clear of HUD, not merely non-overlapping.
      keepout.push({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 });
    }
  }

  readInsets();
  addEventListener('resize', () => { readInsets(); refreshKeepout(); }, { passive: true });
  addEventListener('orientationchange', () => { readInsets(); refreshKeepout(); }, { passive: true });

  // Only writes when the scale actually changes, so the style recalc this forces costs nothing on
  // the ~99% of frames where the camera has not moved between viewport classes.
  function applyLabelScale() {
    const next = labelScalePolicy(worldPerPixel(), innerWidth);
    if (next === appliedScale) return;
    appliedScale = next;
    root.style.setProperty('--label-scale', String(next));
  }

  function update() {
    const vw = innerWidth, vh = innerHeight;
    // Before the keep-out refresh and the label reads: both measure rendered rects, and the scale
    // is applied through CSS, so they must observe the new value within this same frame.
    applyLabelScale();
    if (frame++ % KEEPOUT_REFRESH_FRAMES === 0) refreshKeepout();

    const box = { l: insets.l + 2, t: insets.t + 2, r: vw - insets.r - 2, b: vh - insets.b - 2 };
    const rootRect = root.getBoundingClientRect();

    // ---- 1. READ (no writes in this loop: one layout flush for the whole pass) ----
    const items = [];
    for (const el of root.querySelectorAll(MANAGED)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // A label that has not been shown yet is opacity:0 but still laid out — a pet tag before
      // `.show`, chalk before its reveal. It must not reserve space, or an invisible tag shoves
      // every real bubble off its anchor. `label-crowded` is our OWN opacity:0 and must keep being
      // solved, otherwise the first time we hid a label it could never come back.
      if (parseFloat(cs.opacity) < 0.05 && !el.classList.contains('label-crowded')) continue;

      let st = state.get(el);
      if (!st) { st = { il: 0, it: 0, al: null, at: null }; state.set(el, st); }

      const curL = parseFloat(el.style.left), curT = parseFloat(el.style.top);
      if (!Number.isFinite(curL) || !Number.isFinite(curT)) continue;
      // If the owning system moved it since our last write, that is the new intent.
      if (st.al === null || Math.abs(curL - st.al) > 0.5 || Math.abs(curT - st.at) > 0.5) {
        st.il = curL; st.it = curT;
      }

      // MEASURED geometry, not offsetWidth/offsetHeight. The rendered box is the only thing the
      // solver may reason about: responsive.js scales `.demand` to .82/.74 in a dense café,
      // --label-scale scales every label on a narrow viewport, and a class may animate its own
      // transform. offsetWidth sees none of that, so the solver used to reserve a box up to 26%
      // larger than the pixels on screen — hiding labels that would have fitted and clamping the
      // rest further from the edge than they needed to be.
      // getBoundingClientRect() is unaffected by `#fx{overflow:hidden}`, so a label hanging off the
      // edge still reports its true rect and can be pulled back into the safe box.
      const r0 = el.getBoundingClientRect();
      if (r0.width < 1 || r0.height < 1) continue;
      // Changing style.left/top translates the element 1:1 (root is not scaled or rotated), so the
      // SIGNED delta from the intended position to the rendered top-left — rect.left === left + ox
      // — is the same for every candidate we will test. Anchoring a `translate(-50%,-100%)` class
      // therefore falls out of the measurement: ox is about -w/2, oy about -h, exactly the offset
      // the old factor table expressed by hand.
      const ox = r0.left - rootRect.left - curL, oy = r0.top - rootRect.top - curT;

      const [sel, prio] = classOf(el, PRIORITY, ['', 40]);
      items.push({
        el, st, w: r0.width, h: r0.height, ox, oy, prio, sel,
        group: el.dataset.labelGroup || null,
      });
    }

    // A wish bubble and its patience bar move as one unit. Solving them separately let the bar
    // land on top of an unrelated label, so a unit is tested against the footprint of EVERY member.
    const leaders = new Map();
    for (const it of items) if (it.group && it.sel === '.wish') leaders.set(it.group, it);

    const units = [];
    const followers = new Map(); // group -> follower items
    for (const it of items) {
      if (it.group && it.sel !== '.wish' && leaders.has(it.group)) {
        if (!followers.has(it.group)) followers.set(it.group, []);
        followers.get(it.group).push(it);
      } else {
        units.push({ lead: it, follow: [], prio: it.prio, sel: it.sel });
      }
    }
    for (const u of units) {
      if (u.lead.group && leaders.get(u.lead.group) === u.lead) u.follow = followers.get(u.lead.group) || [];
    }
    units.sort((a, b) => b.prio - a.prio);

    // ---- 2. SOLVE ----
    const placed = [];
    const results = [];
    // `ox`/`oy` are the measured, SIGNED offset from the element's intended position to its
    // rendered top-left (see the read phase), so this is exact for any anchor, scale or transform
    // a class carries — including ones no factor table could express.
    const rectOf = (it, l, t) => ({ l: l + it.ox, t: t + it.oy, r: l + it.ox + it.w, b: t + it.oy + it.h });

    for (const u of units) {
      const lead = u.lead;
      // Every member's rect for a candidate lead position, preserving their relative offsets.
      const rectsAt = (l, t) => {
        const dl = l - lead.st.il, dt = t - lead.st.it;
        const out = [rectOf(lead, l, t)];
        for (const f of u.follow) out.push(rectOf(f, f.st.il + dl, f.st.it + dt));
        return out;
      };
      // Clamp the whole unit inside the safe box using its union bounds.
      const clamp = (l, t) => {
        const rs = rectsAt(l, t);
        const u0 = rs.reduce((a, r) => ({
          l: Math.min(a.l, r.l), t: Math.min(a.t, r.t), r: Math.max(a.r, r.r), b: Math.max(a.b, r.b),
        }));
        let dl = 0, dt = 0;
        if (u0.l < box.l) dl = box.l - u0.l; else if (u0.r > box.r) dl = box.r - u0.r;
        if (u0.t < box.t) dt = box.t - u0.t; else if (u0.b > box.b) dt = box.b - u0.b;
        return [l + dl, t + dt];
      };

      const [bl, bt] = clamp(lead.st.il, lead.st.it);
      let best = null;

      outer:
      for (const step of NUDGE_STEPS) {
        const dirs = step === 0 ? [[0, 0]] : NUDGE_DIRS;
        for (const [dx, dy] of dirs) {
          const [cl, ct] = clamp(bl + dx * step, bt + dy * step);
          const rs = rectsAt(cl, ct);
          let clash = false;
          for (const r of rs) {
            for (const k of keepout) if (intersects(r, k, tol)) { clash = true; break; }
            if (clash) break;
            for (const p of placed) if (intersects(r, p, tol)) { clash = true; break; }
            if (clash) break;
          }
          if (!clash) { best = [cl, ct, rs]; break outer; }
        }
      }

      let hidden = false;
      if (!best) {
        hidden = HIDEABLE.has(u.sel); // otherwise it must stay visible and accept the overlap
        best = [bl, bt, rectsAt(bl, bt)];
      }
      if (!hidden) for (const r of best[2]) placed.push(r);
      results.push({ u, l: best[0], t: best[1], hidden });
    }

    // ---- 3. WRITE ----
    for (const res of results) {
      const { u } = res;
      const dl = res.l - u.lead.st.il, dt = res.t - u.lead.st.it;
      const apply = (it, l, t) => {
        it.st.al = l; it.st.at = t;
        it.el.style.left = l + 'px';
        it.el.style.top = t + 'px';
        it.el.classList.toggle('label-crowded', res.hidden);
      };
      for (const f of u.follow) apply(f, f.st.il + dl, f.st.it + dt);
      apply(u.lead, res.l, res.t);
    }

    // ---- 4. DENSITY (presentation only: opacity, never position) ----
    updateDensity(results, vw, vh);
  }

  // Tracked so a label is only touched when its dim state actually changes; the class toggle is a
  // style write and there is no reason to issue it 60 times a second per label.
  const muted = new WeakMap();

  function setMuted(el, on) {
    if (muted.get(el) === on) return;
    muted.set(el, on);
    el.classList.toggle(MUTED_CLASS, on);
  }

  function updateDensity(results, vw, vh) {
    const cx = vw / 2, cy = vh / 2;
    const cands = [];
    for (const res of results) {
      const it = res.u.lead;
      // Only labels that are actually drawn, and only classes carrying ambient information. A tap
      // target (.fbtn) is never dimmed — dimming a control the player is meant to press would be a
      // usability regression, not a tidier frame.
      if (res.hidden || !MUTABLE.has(it.sel)) { setMuted(it.el, false); continue; }
      // res.l/res.t is the label's anchor — for a wish bubble that is the customer's head, which is
      // exactly the point whose distance to frame centre tracks distance to the player.
      cands.push({ el: it.el, prio: it.prio, d: Math.hypot(res.l - cx, res.t - cy) });
    }
    if (cands.length <= DENSITY_FULL) {
      for (const c of cands) setMuted(c.el, false);
      return;
    }
    // Highest priority first, then whichever is nearest the player. Ties in priority are the common
    // case (every wish bubble is worth 80), so the centre distance is what actually decides.
    cands.sort((a, b) => (b.prio - a.prio) || (a.d - b.d));
    for (let i = 0; i < cands.length; i++) setMuted(cands[i].el, i >= DENSITY_FOCUS);
  }

  // Shared with any system that positions its own floating UI (the interaction coach, for one).
  // Returns [x, y] moved the smallest distance that clears both the HUD and the viewport edge, for
  // a box of w x h centred on (x, y). Without this each such system reinvents its own clamp and
  // rediscovers the same overlaps.
  function avoid(x, y, w, h) {
    const box = { l: insets.l + 2, t: insets.t + 2, r: innerWidth - insets.r - 2, b: innerHeight - insets.b - 2 };
    let cx = x, cy = y;
    for (let pass = 0; pass < 3; pass++) {
      const r = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
      if (r.l < box.l) { cx += box.l - r.l; } else if (r.r > box.r) { cx += box.r - r.r; }
      if (r.t < box.t) { cy += box.t - r.t; } else if (r.b > box.b) { cy += box.b - r.b; }
      const rr = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
      let hit = null;
      for (const k of keepout) if (intersects(rr, k, 2)) { hit = k; break; }
      if (!hit) break;
      // Escape along whichever axis needs the least travel.
      const down = hit.b - rr.t, up = rr.b - hit.t, right = hit.r - rr.l, left = rr.r - hit.l;
      const m = Math.min(down, up, right, left);
      if (m === up) cy -= up + 2; else if (m === down) cy += down + 2;
      else if (m === left) cx -= left + 2; else cx += right + 2;
    }
    return [cx, cy];
  }

  // `managed` is the selector for everything this arbiter owns. It is exposed so diagnostics (and
  // the overflow smoke test) can assert the invariant that keeps biting: EVERY element in `#fx`
  // that positions itself with left/top must match it. A projected label class that is not
  // registered here is drawn unclamped and un-de-overlapped, which is exactly how a pet tag ended
  // up rendering as "cuit" at the frame edge.
  return { update, refreshKeepout, avoid, managed: MANAGED };
}
