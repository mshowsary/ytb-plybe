// src/ui/labelLayout.js — the single arbiter for every world-projected label on screen.
//
// WHY THIS EXISTS
// Ten independent systems (customers, stations, zones, visuals, objective, guestCare, partyOrders,
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

// Anchor factors per label class: rect.left = left - ax*w, rect.top = top - ay*h.
// These mirror the `transform: translate(...)` rules in style.css.
const ANCHORS = [
  ['.wish', 0.5, 1.0],
  ['.patience', 0.5, 0.0],
  ['.demand', 0.5, 0.5],
  ['.chalk', 0.5, 0.5],
  ['.objCaption', 0.5, 0.5],
  ['.zlabel', 0.5, 0.5],
  ['.zprice', 0.5, 0.5],
  ['.fbtn', 0.5, 0.5],
];

// Higher wins ties and is placed first. Interactive controls outrank everything: they are tap
// targets, so they may never be nudged or hidden. Decorative menu chalk yields first.
const PRIORITY = [
  ['.fbtn', 100],
  ['.wish', 80],
  ['.patience', 78],
  ['.zprice', 60],
  ['.zlabel', 58],
  ['.demand', 55],
  ['.objCaption', 50],
  ['.chalk', 20],
];

// Labels that may be hidden outright when no collision-free slot exists. Anything absent from this
// list is always drawn, even if it must overlap, because losing it would cost the player real
// information or a control.
const HIDEABLE = new Set(['.chalk', '.demand']);

// HUD furniture that world labels must not sit under. Measured live so it tracks content changes.
const HUD_KEEPOUT = '#wallet,#crowd,#dayPill,#goalPill,#hint,#banner,#handsFull,.meta-reputation,'
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
  const state = new WeakMap(); // el -> { il, it, al, at }
  let keepout = [];
  let frame = 0;
  let insets = { l: 0, t: 0, r: 0, b: 0 };

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

  function update() {
    const vw = innerWidth, vh = innerHeight;
    if (frame++ % KEEPOUT_REFRESH_FRAMES === 0) refreshKeepout();

    const box = { l: insets.l + 2, t: insets.t + 2, r: vw - insets.r - 2, b: vh - insets.b - 2 };

    // ---- 1. READ (no writes in this loop: one layout flush for the whole pass) ----
    const items = [];
    for (const el of root.querySelectorAll(MANAGED)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const w = el.offsetWidth, h = el.offsetHeight;
      if (w < 1 || h < 1) continue;

      let st = state.get(el);
      if (!st) { st = { il: 0, it: 0, al: null, at: null }; state.set(el, st); }

      const curL = parseFloat(el.style.left), curT = parseFloat(el.style.top);
      if (!Number.isFinite(curL) || !Number.isFinite(curT)) continue;
      // If the owning system moved it since our last write, that is the new intent.
      if (st.al === null || Math.abs(curL - st.al) > 0.5 || Math.abs(curT - st.at) > 0.5) {
        st.il = curL; st.it = curT;
      }

      const [, ax, ay] = classOf(el, ANCHORS, ['', 0.5, 0.5]);
      const [sel, prio] = classOf(el, PRIORITY, ['', 40]);
      items.push({ el, st, w, h, ax, ay, prio, sel, group: el.dataset.labelGroup || null });
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
    const rectOf = (it, l, t) => {
      const x = l - it.w * it.ax, y = t - it.h * it.ay;
      return { l: x, t: y, r: x + it.w, b: y + it.h };
    };

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

  return { update, refreshKeepout, avoid };
}
