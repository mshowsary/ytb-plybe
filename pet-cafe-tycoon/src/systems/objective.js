// Objective guidance: the intro lesson first, then what you are carrying, then the next job.
import { jobTarget } from '../sim/jobs.js';
import { refillGuideTarget } from '../sim/refillGuide.js';
import { coachEscalationStage } from '../sim/mechanicLearning.js';
import { createGuidePath } from '../render/guidePath.js';
import { findPath, nearestFree, idx, cx, cz } from '../sim/nav.js';
import {
  registerIcon, displayIcon, beanIcon, sackIcon, broomIcon, leafIcon, gearIcon, bakeIcon,
  coinIcon, handIcon, returnIcon,
} from '../ui/icons.js';

// The chevron's caption used to be a verb -- Bake / Stock / Serve / Cash / Deliver / Return. It is
// a picture of the DESTINATION now, one per job kind, and every one of them is an object already
// standing in the room the arrow is pointing into: the display case that ran empty, the till a guest
// is waiting at, the bean sack, the broom, the ripe bush, the crate. That is the whole reason a
// picture works here where a verb needed English -- the player is about to walk up to the thing the
// glyph draws, so the caption and the world confirm each other on arrival.
//
// Two deliberate reuses: `refill` shows the coffee bean rather than a generic pour, because Task 31
// already made the bean the game's single refill-supply glyph in both the Pantry and on a
// bean-blocked machine; `build` shows the gear, the same fallback src/ui/hud.js's wallet ring uses
// for an unmapped purchase. `deliver` has no fixed destination -- it is wherever what you are
// carrying belongs -- so systems/stations.js hands the concrete station's own glyph across on
// G.contextGuide.captionIcon and the hand here is only the fallback.
const CAPTION_ICON = {
  register: registerIcon, serve: registerIcon, restock: displayIcon, stock: displayIcon,
  refill: beanIcon, supplies: sackIcon, clean: broomIcon, harvest: leafIcon, build: gearIcon,
  bake: bakeIcon, collect: coinIcon, deliver: handIcon, return: returnIcon,
};
// The sentence each glyph replaces, for the caption's aria-label. Nothing draws these.
const CAPTION_LABEL = {
  register: 'Serve at the register', serve: 'Serve at the register', restock: 'Restock the display',
  stock: 'Stock the display', refill: 'Refill supplies', supplies: 'Collect supplies from the pantry',
  clean: 'Clean a table', harvest: 'Pick ripe fruit', build: 'Build here', bake: 'Bake',
  collect: 'Collect the cash', deliver: 'Deliver what you are carrying', return: 'Return what you are carrying',
};
const HOVER_Y = 2.6;
const RECOMPUTE_INTERVAL = 0.25;
const PROGRESS_RESET_METERS = 0.18;
// The floor trail is re-routed when the target changes, when the owner has wandered this far from
// where the last route began, or on this cadence regardless (furniture and guests move).
const ROUTE_REPLAN_METERS = 0.9, ROUTE_REPLAN_SECONDS = 0.6;
// The first-touch hint shows until the owner has actually moved this far from where they spawned.
// A tap alone (the audio unlock) does not count: the point is to teach the drag.
const FIRST_MOVE_METERS = 0.6;
const EDGE_MARGIN = 34;

// ---- How much to show, and when ------------------------------------------------------------
// The day-18 report was "demos are everywhere every day, including for things I learned long ago",
// and it was right: a full walkthrough played after seven seconds of hesitation on ANY errand, a
// metre-high arrow hung over the destination of anything the owner picked up, and every plot that
// became affordable took the lane for a twelve-second walkthrough of its own. Three systems each
// deciding, independently, to draw a trail across the café.
//
// Guidance is a TEACHER here, not a minder. Every target resolves to one of three modes:
//   'full'   trail on the floor + beacon + ring + edge arrow + caption -- a walkthrough, to TEACH
//   'beacon' the arrow over the target alone -- to UN-STICK
//   'none'   nothing at all -- the normal state of the play field
//
// A walkthrough plays once per mechanic, ever (the coach's proven set, persisted with the save),
// plus the opening lesson. After that, a routine job draws nothing until the player has genuinely
// stalled on it -- STUCK_SECONDS with no progress toward it -- and then only the pointer.
// Hesitation never earns a walkthrough again.
//
// Carrying something works the same way. The destination is known the moment you pick the thing up
// and nothing is drawn for it: an owner walking a tray of cookies to the display does not need to
// be shown where their own display is. Standing still with full hands for CARRY_STUCK_SECONDS
// earns the pointer, and nothing more.
//
// The "you can afford this now" walkthrough is gone entirely. A plot that becomes affordable is an
// invitation, not an errand, and the plot's own price pill is already standing in the room saying
// so. Building still gets its one lesson the first time, through the proven set, like everything
// else.
const MECHANIC_OF_KIND = {
  register: 'serve', serve: 'serve', restock: 'pickup', stock: 'pickup', bake: 'pickup',
  refill: 'pantry', supplies: 'pantry', clean: 'clean', harvest: 'harvest', build: 'build',
  // Carrying something to where it belongs is what the opening lesson's "stock the display" step
  // already taught, so it shares that proof rather than re-running a walkthrough on day 3.
  collect: 'cash', deliver: 'pickup', return: 'return',
};
const ARRIVE_METERS = 1.6;
const STUCK_SECONDS = 6;
const CARRY_STUCK_SECONDS = 4;
// A pointer is a NUDGE, and a nudge that never goes away is just a permanent arrow. Measured on a
// fortnight-old cafe with the owner standing still (tools/quiet-field-smoke.js), a pointer with no
// time limit was on screen 85% of a two-minute shift -- which is the owner's "inconsistent big
// arrows" and "demos everywhere" from the other side. It shows for POINTER_SECONDS, then gives up
// and stays quiet for POINTER_REST_SECONDS before offering the same unchanged target again. Moving
// toward the target, or the target changing, resets both (see resetHesitation).
const POINTER_SECONDS = 4;
const POINTER_REST_SECONDS = 20;
// The job the arrow points at is COMMITTED for at least this long once something else wants the
// lane. jobTarget() re-picks from scratch every RECOMPUTE_INTERVAL with no memory of its last
// answer, so two jobs of equal standing -- two displays a step apart, a register that keeps gaining
// and losing the guest standing at it -- traded the lane four times a second. Every trade replanned
// the floor trail, and two routes to two targets curve around the counters in opposite directions:
// that is the owner's "the first-time demo glitches in a fast repetitive arc loop, so fast you
// can't see it until you take a screenshot". A challenger has to hold its claim before it takes
// over, which also means the arrow stops twitching between two counters while you walk to one.
const TARGET_COMMIT_SECONDS = 0.8;

// Where the owner should STAND for a given target: a station's front spot, its cash spot for a
// collect job, or the point itself for a build plot. The beacon hovers over the object; the ring
// and the end of the trail mark the spot.
function standSpotFor(world, target) {
  if (!target) return null;
  if (target.kind === 'collect') return { x: target.x, z: target.z };
  for (const st of world.stations.values()) {
    if (!st.front) continue;
    // A register is worked from behind; every other station from its front.
    const spot = st.type === 'checkout' && st.serve ? st.serve : st.front;
    if (Math.abs(st.x - target.x) < 0.05 && Math.abs(st.z - target.z) < 0.05) return { x: spot.x, z: spot.z };
    if (Math.abs(st.front.x - target.x) < 0.05 && Math.abs(st.front.z - target.z) < 0.05) return { x: st.front.x, z: st.front.z };
  }
  return { x: target.x, z: target.z };
}

function cueKey(target, guided) {
  if (!target) return '';
  return `${guided ? 'g' : 'j'}:${target.id || target.stationId || target.kind || ''}:${Number(target.x).toFixed(2)}:${Number(target.z).toFixed(2)}`;
}
function sameTarget(a, b) {
  return !!a && !!b && a.kind === b.kind && Math.abs(a.x - b.x) < 0.05 && Math.abs(a.z - b.z) < 0.05;
}
function targetDistance(G, target) {
  if (!G?.P || !target) return null;
  return Math.hypot(G.P.x - target.x, G.P.z - target.z);
}
function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function createObjective(G, S, ctx) {
  const { world, scene, fx, els, input } = ctx;
  const guide = createGuidePath(scene);
  // An arrow pinned to the screen edge whenever the beacon is off screen — the phone-portrait
  // camera frames barely 10 m, so the thing the owner is being sent to is often outside it.
  const edge = document.createElement('div'); edge.className = 'edgeArrow hidden'; edge.setAttribute('aria-hidden', 'true');
  edge.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3l8 9h-5v9H9v-9H4z" fill="#FFD84D" stroke="#3B2E2A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  els.fx.appendChild(edge);
  // The one thing a brand-new player is never told anywhere else: that they drag to walk. A hand
  // that drags a short way and springs back, beside the owner, until their first real step.
  const touch = document.createElement('div'); touch.className = 'touchHint hidden';
  touch.setAttribute('role', 'img'); touch.setAttribute('aria-label', 'Drag anywhere to walk');
  touch.innerHTML = '<span class="touchHintHand">' + handIcon() + '</span><span class="touchHintTrack"></span>';
  els.fx.appendChild(touch);
  const spawn = { x: G.P ? G.P.x : 0, z: G.P ? G.P.z : 0 };
  let moved = false;
  const routeCells = new Int32Array(4096);
  const routePts = [];
  let routeKey = '', routeT = 0, routeFromX = 0, routeFromZ = 0;
  const proven = key => !!key && typeof G.mechanicProven === 'function' && G.mechanicProven(key);
  const markProven = key => { if (key && typeof G.markMechanic === 'function') G.markMechanic(key); };
  const caption = document.createElement('div'); caption.className = 'objCaption hidden';
  // The glyph is drawn; the sentence it replaced rides on aria-label, so the caption stays a status
  // announcement rather than an unlabelled decoration.
  caption.setAttribute('role', 'status'); els.fx.appendChild(caption);
  let lastGlyph = '';
  const tmp = { sx: 0, sy: 0, visible: true };
  let t = 0, cd = 0, target = null, guided = false;
  let activeCue = '', hesitateT = 0, bestDistance = null;
  let pointerT = 0, pointerRest = 0;
  // The committed job and whatever is currently trying to take the lane from it.
  let committed = null, challenger = null, challengerT = 0;

  function commitJobTarget(next, dt) {
    if (!next) { committed = null; challenger = null; challengerT = 0; return null; }
    if (!committed || sameTarget(committed, next)) {
      committed = committed && sameTarget(committed, next) ? committed : next;
      challenger = null; challengerT = 0;
      return committed;
    }
    if (challenger && sameTarget(challenger, next)) challengerT += Math.max(0, dt);
    else { challenger = next; challengerT = 0; }
    if (challengerT >= TARGET_COMMIT_SECONDS) { committed = challenger; challenger = null; challengerT = 0; }
    return committed;
  }

  // The stalled-player nudge: nothing until `after` seconds of getting nowhere, then the arrow for
  // POINTER_SECONDS, then quiet again. Never a walkthrough -- that is reserved for teaching.
  function pointerMode(after, dt) {
    if (hesitateT < after) return 'none';
    if (pointerRest > 0) { pointerRest = Math.max(0, pointerRest - dt); return 'none'; }
    pointerT += Math.max(0, dt);
    if (pointerT <= POINTER_SECONDS) return 'beacon';
    pointerT = 0; pointerRest = POINTER_REST_SECONDS;
    return 'none';
  }

  function resetHesitation(nextKey = '', distance = null) {
    activeCue = nextKey;
    hesitateT = 0;
    bestDistance = distance;
    pointerT = 0; pointerRest = 0;
  }

  // The wallet asks (ui/hud.js, wired in main.js): "point me at what I am saving for". The build pad
  // its ring names gets one pointer's worth of arrow — the same arrow a stalled player gets, for
  // POINTER_SECONDS, whatever the lane was doing — and it clears early once the pad is built, the
  // owner reaches it, or the opening lesson takes the lane.
  let asked = null;
  G.pointAtNextBuild = zoneId => {
    const zone = (world.area.zones || []).find(z => z.id === zoneId);
    if (!zone || world.built.has(zone.id)) return false;
    asked = { target: { kind: 'build', id: zone.id, x: zone.x, z: zone.z }, left: POINTER_SECONDS };
    return true;
  };

  return {
    update(dt) {
      t += dt;
      if (G.intro && G.intro.active) {
        target = G.intro.target;
        guided = true;
        committed = null; challenger = null; challengerT = 0;
      } else if (G.contextGuide) {
        target = G.contextGuide;
        guided = true;
        committed = null; challenger = null; challengerT = 0;
      } else {
        guided = false;
        cd -= dt;
        if (cd <= 0) {
          cd = RECOMPUTE_INTERVAL;
          let next = jobTarget(world, G);
          // Refill is a two-step interaction. Sending an empty-handed player to the empty bowl or
          // espresso machine teaches nothing, so route the objective through Pantry first. Once
          // beans/kibble are in hand the arrow switches back to the correct empty station.
          if (next && next.kind === 'refill') next = refillGuideTarget(world, G) || next;
          commitJobTarget(next, RECOMPUTE_INTERVAL);
        }
        target = committed;
      }
      if (asked) {
        const a = asked.target;
        asked.left -= dt;
        if (asked.left <= 0 || world.built.has(a.id) || (G.intro && G.intro.active) || Math.hypot(G.P.x - a.x, G.P.z - a.z) < ARRIVE_METERS) asked = null;
        else { target = a; guided = true; }
      }

      // Publish the actionable world class before deciding which visual owns the lane. Lower-priority
      // contextual hints remain suppressed even during the natural/no-overlay phase.
      G.objectiveCueKind = target ? (guided ? 'guided' : target.kind || null) : null;

      // First-touch hint: only in the opening lesson, only until the owner has taken a real step.
      if (!moved && G.P && Math.hypot(G.P.x - spawn.x, G.P.z - spawn.z) > FIRST_MOVE_METERS) moved = true;
      const wantTouch = !moved && !!(G.intro && G.intro.active) && !(input && input.active);
      if (wantTouch) {
        // Below and beside the owner's feet, never over their body.
        fx.project(G.P.x, 0, G.P.z, tmp);
        touch.style.left = (tmp.sx + 26) + 'px'; touch.style.top = (tmp.sy + 46) + 'px';
      }
      touch.classList.toggle('hidden', !wantTouch);

      guide.update(dt, fx.camera, reducedMotion());

      if (!target) {
        resetHesitation();
        G.objectiveCueStage = 'natural';
        guide.hide(); edge.classList.add('hidden');
        caption.classList.add('hidden');
        return;
      }

      // A first-use interaction hand may replace the beacon, but never coexist with it. The trail
      // on the floor stays: it is where the hand is pointing, drawn on a surface the hand is not on.
      const coachOwnsBeacon = !!G.coachCueVisible;

      // ---- how long has this player been getting nowhere with this target? -------------------
      // Tracked for carry guidance too, not just routine jobs: "hands full, standing still" is the
      // only thing that now earns a carry pointer, so it needs the same progress clock.
      const key = cueKey(target, guided);
      const distance = targetDistance(G, target);
      if (key !== activeCue) resetHesitation(key, distance);
      else if (distance != null && bestDistance != null && distance < bestDistance - PROGRESS_RESET_METERS) {
        // The player is materially closer: useful action is its own feedback, so nothing is drawn.
        resetHesitation(key, distance);
      } else {
        hesitateT += Math.max(0, dt);
        if (distance != null && (bestDistance == null || distance < bestDistance)) bestDistance = distance;
      }
      G.objectiveCueStage = coachEscalationStage(hesitateT, reducedMotion());

      // ---- decide the mode -----------------------------------------------------------------
      const stand = standSpotFor(world, target);
      const mech = MECHANIC_OF_KIND[target.kind] || null;
      const intro = !!(G.intro && G.intro.active);
      let mode;
      if (intro) mode = 'full';
      else if (asked && target === asked.target) mode = 'beacon';   // a pointer, never a lesson
      else if (mech && !proven(mech)) mode = 'full';        // the one lesson, once, ever
      else mode = pointerMode(guided ? CARRY_STUCK_SECONDS : STUCK_SECONDS, dt);

      // Arrival proves the errand: the lesson for this mechanic is over for good.
      if (stand && Math.hypot(G.P.x - stand.x, G.P.z - stand.z) < ARRIVE_METERS) {
        if (!intro && mech) markProven(mech);
      }

      if (mode === 'none') {
        guide.hide(); edge.classList.add('hidden');
        caption.classList.add('hidden');
        return;
      }
      const full = mode === 'full';

      // Route the trail along the same grid the guests walk, so it goes AROUND the counters rather
      // than through them. Replanned only when something material changed.
      routeT -= dt;
      const strayed = Math.hypot(G.P.x - routeFromX, G.P.z - routeFromZ) > ROUTE_REPLAN_METERS;
      const modeKey = key + ':' + mode;
      if (modeKey !== routeKey || routeT <= 0 || strayed) {
        routeKey = modeKey; routeT = ROUTE_REPLAN_SECONDS; routeFromX = G.P.x; routeFromZ = G.P.z;
        routePts.length = 0;
        const g = world.grid;
        if (full && g && stand) {
          const from = nearestFree(g, idx(g, G.P.x, G.P.z), 3), to = nearestFree(g, idx(g, stand.x, stand.z), 3);
          const n = from >= 0 && to >= 0 ? findPath(g, from, to, 3, routeCells) : 0;
          routePts.push({ x: G.P.x, z: G.P.z });
          // Skip the first cell (it is under the owner) and the last (the stand spot replaces it).
          for (let i = 1; i < n - 1; i++) routePts.push({ x: cx(g, routeCells[i]), z: cz(g, routeCells[i]) });
          routePts.push({ x: stand.x, z: stand.z });
        }
        guide.show({
          points: routePts,
          target: { x: target.x, z: target.z, y: HOVER_Y },
          standSpot: full ? stand : null,
          showBeacon: !coachOwnsBeacon,
        });
      } else if (guide.beacon.visible === coachOwnsBeacon) {
        guide.beacon.visible = !coachOwnsBeacon;
      }

      // Off-screen: pin an arrow to the edge of the screen, pointing at the target.
      fx.project(target.x, HOVER_Y, target.z, tmp);
      if (!tmp.visible) {
        const w = innerWidth, h = innerHeight;
        const dx = tmp.nx * (w / 2), dy = -tmp.ny * (h / 2);
        const k = Math.min((w / 2 - EDGE_MARGIN) / Math.max(1e-3, Math.abs(dx)), (h / 2 - EDGE_MARGIN) / Math.max(1e-3, Math.abs(dy)));
        const ex = w / 2 + dx * k, ey = h / 2 + dy * k;
        edge.style.left = ex + 'px'; edge.style.top = ey + 'px';
        edge.style.setProperty('--rot', (Math.atan2(dy, dx) * 180 / Math.PI + 90) + 'deg');
        edge.classList.remove('hidden');
      } else edge.classList.add('hidden');

      if (coachOwnsBeacon) { caption.classList.add('hidden'); return; }

      // The destination glyph rides only with a walkthrough; a pointer is just the arrow.
      if (!full) { caption.classList.add('hidden'); return; }
      const y = HOVER_Y;
      fx.project(target.x, y + 0.75, target.z, tmp);
      // `captionIcon` is the carry system's concrete destination glyph; `kind` is the routine job.
      // The old `target.caption` string is still carried on G.contextGuide (tools/production-smoke.js
      // reads it as diagnostics) but is never drawn any more.
      const glyphFn = CAPTION_ICON[target.kind];
      const glyph = target.captionIcon || (glyphFn ? glyphFn() : '');
      if (glyph && lastGlyph !== glyph) {
        lastGlyph = glyph;
        caption.classList.add('cueRow');
        caption.innerHTML = `<span class="cueIco">${glyph}</span>`;
        const label = target.captionLabel || CAPTION_LABEL[target.kind] || '';
        if (label) caption.setAttribute('aria-label', label); else caption.removeAttribute('aria-label');
      }
      caption.style.left = tmp.sx + 'px'; caption.style.top = tmp.sy + 'px';
      caption.classList.toggle('hidden', !tmp.visible || !glyph);
    },
  };
}
