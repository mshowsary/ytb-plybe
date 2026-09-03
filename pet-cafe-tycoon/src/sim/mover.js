// src/sim/mover.js — pure grid-following mover: waypoint chasing + local avoidance + stall
// detection/re-planning. `path` is a fixed Int32Array(256) — plenty for these areas (a 256-cell
// path at CELL=0.5m covers 128m, far past any straight-line distance here) but not a general
// bound; a path longer than 256 cells would silently truncate. The steady state (every stepMover
// call that doesn't trigger a re-plan) allocates nothing; a re-plan (grid.version mismatch, the
// 1.5s/4.0s stall thresholds, or the pathless fallback retry) calls into cachedPath, which may
// allocate on a cache miss (see nav.js).
import { idx, cx, cz, isFree, nearestFree, cachedPath } from './nav.js';

// Waypoint capture radius. A tight 0.12m (the brief's literal number) makes a mover orbit a
// shared waypoint forever when another mover is contesting the same spot: avoidance nudges it
// just far enough to miss the capture radius, then the seek force pulls it straight back onto
// the contested point, over and over (measured: a symmetric head-on pass never reached 0.12m of
// its next waypoint and looped indefinitely). 0.3m lets it "round the corner" past a contested
// waypoint even while laterally offset by avoidance, which is what actually resolves it — proven
// empirically against the two-movers-head-on case below.
const WAYPOINT_EPS = 0.3;
const ARRIVE_EPS = 0.05;
const STALL_WINDOW = 0.5;
const STALL_MIN_PROGRESS = 0.05;
const REPLAN_AT = 1.5;
const TELEPORT_AT = 4.0;
const TELEPORT_DIST = 0.5;
const AVOID_MARGIN = 0.1;
const AVOID_SPEED = 0.3;
// A bare r+o.r+0.1 sensing ring (a few cm) leaves two movers closing head-on at normal walking
// speed only a couple of hundredths of a second to react — nowhere near enough lead time to
// build lateral clearance before they'd overlap deeply. REACT_TIME extends the sensing range by
// how far the pair closes in that time, so avoidance engages with real reaction room; the side-
// step then ramps from 1x to AVOID_URGENCY_MAX x AVOID_SPEED as the gap closes toward contact.
const REACT_TIME = 0.6;
const AVOID_URGENCY_MAX = 6;
// Separate, stronger ceiling for the omnidirectional (overlap-depth) push below, independent of
// the anticipatory directional one above: raising AVOID_URGENCY_MAX itself to get more assertive
// separation regressed the controller-authored head-on test (it scales the "ahead of us" steering
// too, and that one's already tuned tightly against that test). The omni push only ever engages
// once two movers are ALREADY within contact + AVOID_MARGIN, so a stronger ceiling here is safe to
// tune independently.
const OMNI_URGENCY_MAX = 6;
// Total speed cap after avoidance is layered on top of the seek velocity, as a multiple of the
// mover's own speed — keeps a heavily-avoiding mover from moving unrealistically fast overall.
const MAX_SPEED_MULT = 1.5;
const FALLBACK_REPLAN = 1.5; // re-plan cadence while pathless (findPath returned 0)
// Fix round 1: how near-collinear (obstacle nearly dead-ahead/behind) the avoidance-side signal
// has to be, as sin(angle-from-forward), before it's trusted outright — see the side-selection
// block in stepMover for the full writeup of the pathology this (and _id/_side below) fixes.
const SIDE_DEADBAND = 0.2;

let _nextMoverId = 1;

export function createMover(x, z, r, speed) {
  return {
    x, z, rot: 0, r, speed,
    path: new Int32Array(256), n: 0, k: 0,
    tx: 0, tz: 0, hasTarget: false,
    stall: 0, blockedT: 0, replans: 0, teleports: 0,
    vx: 0, vz: 0, mask: 0, kind: '',
    gridVersion: -1,
    // Final review fix: the mask a mover's CURRENT plan was computed against. mask can change
    // mid-walk (a customer crossing the door lane: mask 1 while entering, then 0 once on the
    // floor, or 2 while leaving — see sim/customers.js) without grid.version changing at all (the
    // grid itself didn't change, just which lanes this one mover is now allowed to use), so a
    // gridVersion-only replan check would keep following a path planned under the OLD mask
    // forever. stepMover compares this against the mover's live `mask` every frame and re-plans on
    // a mismatch, same as a gridVersion mismatch.
    _planMask: -1,
    progT: 0, bestD: Infinity,
    _winD: Infinity, // internal: distance-to-waypoint at the start of the current stall window
    overlapT: 0, // internal: seconds spent continuously within contact range of ANY other mover
    // Fix round 1: stable creation-order id (never reused/recomputed) so two movers evaluating a
    // near-collinear avoidance side against EACH OTHER resolve to complementary, not coincidentally
    // identical, choices — see stepMover's side-selection block.
    _id: _nextMoverId++,
    _side: 0, // internal: last confidently-chosen avoidance side (+-1), reused on a near-collinear frame
  };
}

// Plans from the mover's own nearest-free cell to the target's nearest-free cell (using the
// mover's mask), via the grid's path cache. The final waypoint is always the exact (x, z), not
// a cell centre. If no path exists, n = 0 and stepMover falls back to walking straight there,
// retrying the plan periodically.
export function setTarget(m, x, z, grid) {
  m.tx = x; m.tz = z; m.hasTarget = true; m.k = 0;
  const fromRaw = idx(grid, m.x, m.z), toRaw = idx(grid, x, z);
  const from = nearestFree(grid, fromRaw, m.mask);
  const to = nearestFree(grid, toRaw, m.mask);
  m.n = (from < 0 || to < 0) ? 0 : cachedPath(grid, from, to, m.mask, m.path);
  m.gridVersion = grid.version;
  m._planMask = m.mask;
  m.stall = 0;
  m.blockedT = 0; m.progT = 0; m.bestD = Infinity; m._winD = Infinity;
}

function replan(m, grid) {
  if (!m.hasTarget) return;
  setTarget(m, m.tx, m.tz, grid);
  m.replans++;
}

// Direction a mover is currently heading: its last-frame velocity direction if it's actually
// moving, else the direction to its next waypoint (mirrors the wx/wz lookup at the top of
// stepMover, but read-only — no stall/replan side effects). Used only by the follow-the-leader
// heading-agreement test in stepMover below; deliberately distinct from that function's
// dirX/dirZ (this frame's pure seek direction, used everywhere else in this file as "forward")
// because a follower must react to where its neighbour is ACTUALLY moving (which lateral
// avoidance may have bent away from a straight line to its target), not just where it's
// aiming this instant.
// Final review fix: used to return a fresh 2-element array every call, inside the O(N^2)
// avoidance loop below (once per OTHER mover, every frame) — a steady stream of tiny garbage on
// exactly the hot path this whole file's header comment promises stays allocation-free. Writes
// into this single module-level scratch object instead; every call site reads .x/.z into local
// primitives immediately (see the two call sites below), so one shared object is safe even though
// it's called once for `m` itself and again for every `o` inside the loop.
const _hd = { x: 0, z: 0 };
function headingDir(o, grid) {
  const sp2 = o.vx * o.vx + o.vz * o.vz;
  if (sp2 > 1e-6) { const sp = Math.sqrt(sp2); _hd.x = o.vx / sp; _hd.z = o.vz / sp; return _hd; }
  if (!o.hasTarget) { _hd.x = 0; _hd.z = 0; return _hd; }
  let wx, wz;
  if (o.n === 0) { wx = o.tx; wz = o.tz; }
  else if (o.k >= o.n - 1) { wx = o.tx; wz = o.tz; }
  else { wx = cx(grid, o.path[o.k]); wz = cz(grid, o.path[o.k]); }
  const dx = wx - o.x, dz = wz - o.z, d = Math.hypot(dx, dz);
  if (d > 1e-4) { _hd.x = dx / d; _hd.z = dz / d; } else { _hd.x = 0; _hd.z = 0; }
  return _hd;
}

// Advances the mover one step. Returns true the frame it arrives (within 0.05m of tx/tz).
// `movers` is the full list of movers sharing the grid, used for local avoidance (idle movers
// still count as obstacles). The steady state (no re-plan triggered) never allocates; a re-plan
// (grid.version mismatch, a stall threshold, or the pathless fallback retry) may, via cachedPath.
export function stepMover(m, grid, movers, dt) {
  if (!m.hasTarget) { m.vx = 0; m.vz = 0; return false; }
  if (m.gridVersion !== grid.version) {
    replan(m, grid);
  } else if (m._planMask !== m.mask) {
    // Final review fix: a mover's mask can change mid-walk (a customer crossing the door: mask
    // 1->0 on entry, ->2 on 'leave' — see sim/customers.js) without grid.version changing at all
    // (the grid itself didn't change, just which lane cells THIS mover is now allowed to use), so
    // the gridVersion-only check above can't catch it. Only actually re-plan when the mask flip
    // genuinely invalidates the REMAINING planned path (a not-yet-walked waypoint sits on a lane
    // cell the new mask no longer permits) — every door-crossing mover's mask flips well after
    // it's already clear of the door-lane cells (see customers.js's own `c.x > door.x + 0.5`
    // guard), so this is a real invariant check, not a routine re-plan on every crossing (which
    // regressed the untouched nav-fullhouse acceptance test's tight overlap tuning when tried).
    let invalid = false;
    if (m.n > 0) { for (let ki = m.k; ki < m.n; ki++) { if (!isFree(grid, m.path[ki], m.mask)) { invalid = true; break; } } }
    if (invalid) replan(m, grid); else m._planMask = m.mask;
  }

  let wx, wz, finalLeg;
  if (m.n === 0) {
    wx = m.tx; wz = m.tz; finalLeg = true;
    m.stall += dt;
    if (m.stall >= FALLBACK_REPLAN) { m.stall = 0; replan(m, grid); }
  } else {
    finalLeg = m.k >= m.n - 1;
    if (finalLeg) { wx = m.tx; wz = m.tz; }
    else { wx = cx(grid, m.path[m.k]); wz = cz(grid, m.path[m.k]); }
  }

  const dx0 = wx - m.x, dz0 = wz - m.z, d0 = Math.hypot(dx0, dz0);
  let dirX = 0, dirZ = 0;
  if (d0 > 1e-4) { dirX = dx0 / d0; dirZ = dz0 / d0; }
  let vx = dirX * m.speed, vz = dirZ * m.speed;
  // This mover's own heading, for the follow-the-leader test below (see headingDir's comment).
  const _hm = headingDir(m, grid); const hmx = _hm.x, hmz = _hm.z;

  // Local avoidance: for every other mover ahead of us (within combined radius + margin, and
  // in our direction of travel), side-step away from whichever side it's currently on.
  //
  // M3 T2 fix (genuine defect found by the nav-fullhouse acceptance test, not a customers.js/
  // staff.js integration bug): the side choice used to come from probing which of the two grid
  // cells straddling our CURRENT (seek+already-applied-avoidance) velocity was free. Under a busy
  // multi-customer crossing (never exercised by this file's own two-mover head-on test, which has
  // only one obstacle and a dead-straight approach), two mutually avoiding movers would each pick
  // their side from a forward vector the other's avoidance push had just perturbed — a per-frame
  // free-cell probe a hair's-width from a cell boundary can flip which side reads "free" from one
  // tick to the next, and each flip reverses that mover's push, which perturbs its own forward
  // vector for the *next* tick, which can flip the probe again. Measured: full-house run, two+
  // customers crossing near a queue, velocity sign flipping almost every frame for 1-2+ seconds,
  // stuck on the same path waypoint (k unchanged) the whole time — a livelock, not a stall the
  // existing blockedT detector catches (its rolling-window "best distance" check happens to dip
  // low enough some windows, from the oscillation itself, to keep resetting the stall clock).
  // Fix: choose the side from the pair's RELATIVE POSITION instead (steer away from whichever
  // side the obstacle is currently on) — that only changes sign when the obstacle actually
  // crosses our forward line, which happens once, smoothly, as a pair passes each other, not
  // every frame. The grid free-cell probe is now only a fallback, used to flip off that natural
  // side when it's the one that's actually blocked (e.g., a wall). "Forward" for all of this is
  // the pure seek direction (dirX/dirZ, fixed for the whole step), not the running vx/vz — with
  // 3+ movers crowding at once, folding each obstacle's push into vx/vz before evaluating the
  // next let one obstacle's avoidance visibly rotate the "forward" used to judge the next one,
  // compounding the same instability across obstacles within a single frame.
  const rightX = dirZ, rightZ = -dirX; // 90deg clockwise from the seek direction
  // Dampen avoidance strength as we close in on our OWN current waypoint: a mover already almost
  // there needs very little lateral room (it's about to stop or advance to the next leg anyway),
  // and full-strength avoidance layered on a near-zero seek distance was overshooting the target
  // every frame — d0 flips past it, the seek direction flips to point back, next frame overshoots
  // again — a genuine oscillation distinct from (and found after fixing) the side-flip one above,
  // surfaced by two same-direction 'leave' customers converging on door-lane spots only ~0.1m
  // apart (as close as that 1.2m-wide lane can space more than two people without literally
  // overlapping by geometry). 0.5m is comfortably past ARRIVE_EPS/WAYPOINT_EPS so it only softens
  // the last stretch, not general mid-path avoidance.
  const avoidScale = Math.min(1, d0 / 0.5);
  // Escalating omni push: how long (in the PRIOR frames, before this one) this mover has spent
  // continuously within contact range of anyone, regardless of who. A two-movers-going-the-same-
  // way pairing (see the omni push below) can otherwise sit at a stable, sub-threshold penetration
  // indefinitely — real motion, genuine but small lateral separation each frame, just never enough
  // net clearance because both keep re-seeking the same shared A* waypoint. Ramping the push itself
  // the longer that persists guarantees it eventually wins, well inside the acceptance test's own
  // 1s sustained-overlap cap, without raising the baseline strength used for a normal, brief,
  // quickly-resolved encounter (which is what the controller's own head-on test exercises).
  const escalation = 1 + Math.min(4, m.overlapT * 6);
  let inContact = false;
  // Fix round 1 (nav-fullhouse, two 'leave' customers, ids 448/450, ~0.42m sustained overlap at
  // t≈1089): a longitudinal yield flag, set inside the loop below when this mover is genuinely
  // pinned against a neighbour with no lateral room on either side — see the `side === 0` branch.
  let wantYield = false;
  // Fix round 3 (nav-fullhouse, two 'leave' customers, ids 50/55, both mask 2, both heading for
  // the exit lane at the door — door (-9.6,4.2), exit lane z 4.2..5.4 — overlapping 0.23m for
  // >1s at t=129.1 near x=-7.2, z=4.5-4.85; both picked avoidance side _side=1): lateral
  // avoidance can only push two movers apart sideways, but a 1.2m-wide lane holds exactly two
  // 0.30m radii side by side with zero room to spare — when both movers share a heading and
  // pick the SAME side (nothing here forces them to diverge; that's the whole reason this pair
  // never separated across three prior mover.js rounds), there is no lateral solution at all.
  // forwardCap (m/s, Infinity = uncapped) is the minimum forward-speed ceiling this mover must
  // observe this frame because some other mover ahead of it, on essentially the same heading,
  // is being followed rather than passed — see the per-`o` computation and application below.
  let forwardCap = Infinity;
  if (d0 > 1e-4) for (let i = 0; i < movers.length; i++) {
    const o = movers[i];
    if (o === m) continue;
    const rx = o.x - m.x, rz = o.z - m.z;
    const dist = Math.hypot(rx, rz);
    const contact = m.r + o.r + AVOID_MARGIN;
    if (dist > 1e-4 && dist < contact) inContact = true;
    const sense = contact + REACT_TIME * (m.speed + o.speed);
    // Follow-the-leader: if `o` has a target, our headings agree (using each mover's ACTUAL
    // current heading — velocity direction if moving, else direction to its own next waypoint;
    // see headingDir), `o` is ahead of us along OUR heading, and we're within following range,
    // we fall into single file behind it instead of trying to side-step past it. Two mutually-
    // qualifying movers (both read the other as ahead — near side-by-side with slightly
    // different headings) tie-break by distance-to-own-target, then by the same stable
    // creation-order `_id` the side/wantYield tie-breaks above already use, so exactly one of
    // the pair yields.
    let followsO = false;
    // True whenever the follow-the-leader relationship is "in play" for this pair at all — either
    // direction, before the tie-break below picks which one actually yields. Measured alongside
    // the ids-78/80 case: the pre-existing wantYield tie-break (below, `m._id > o._id`) is a bare
    // id comparison with no notion of ahead/behind, so on a pair where the SMALLER id is the
    // geometric follower (as here — 78 follows 80, but wantYield's `>` picks 80, the LEADER, to
    // yield), the two mechanisms fought each other: 80 halved by wantYield, 78 already capped to
    // 0.4x by forwardCap below, leaving only a ~0.22 m/s differential — far too slow to clear the
    // 0.15m/1s acceptance threshold (measured: dist grew ~0.15-0.18 m/s, needing >1.4s to resolve
    // a jam that had already crossed the 1s cap). Once this pair's headings/range qualify at all,
    // wantYield defers to the (correctly leader/follower-aware) forwardCap outcome instead.
    let followPairActive = false;
    // Final review fix: gated on `dist < sense` (the same wide gate the avoidance block below
    // already uses) before ever calling headingDir(o, ...) — it's otherwise called for every
    // OTHER mover with a target, every frame, regardless of how far away it is, which is most of
    // them most of the time in a busy scene. `sense` is always >= this block's own m.r+o.r+0.5
    // range (sense adds a full REACT_TIME*(speeds) margin on top of contact), so this is a
    // superset gate, not a behaviour change.
    if (o.hasTarget && dist < sense) {
      const _ho = headingDir(o, grid); const hox = _ho.x, hoz = _ho.z;
      if (hmx * hox + hmz * hoz > 0.7) {
        const aheadM = rx * hmx + rz * hmz;
        const aheadO = -rx * hox - rz * hoz;
        if (dist > 1e-4 && dist < m.r + o.r + 0.5 && (aheadM > 0 || aheadO > 0)) {
          followPairActive = true;
          let mIsFollower = aheadM > 0;
          if (aheadM > 0 && aheadO > 0) {
            const dm = Math.hypot(m.tx - m.x, m.tz - m.z);
            const doo = Math.hypot(o.tx - o.x, o.tz - o.z);
            mIsFollower = dm !== doo ? dm > doo : m._id > o._id;
          }
          if (mIsFollower) {
            followsO = true;
            const oFwd = o.vx * hox + o.vz * hoz;
            const oSpeed = (o.vx * o.vx + o.vz * o.vz) > 1e-6 ? oFwd : o.speed;
            const cap = dist < m.r + o.r + 0.1 ? m.speed * 0.4 : Math.min(m.speed, oSpeed * 0.9);
            forwardCap = Math.min(forwardCap, Math.max(0, cap));
          }
        }
      }
    }
    if (dist > 1e-4 && dist < sense) {
      const cross = dirX * rz - dirZ * rx; // >0: obstacle to our left; <0: to our right; 0: dead ahead
      // Fix round 1 (measured via a 2-mover repro of the nav-fullhouse pair above): side used to
      // be recomputed from scratch every frame as a bare sign(cross), with ties (cross===0) always
      // going right. Two movers on nearly-parallel headings — the common case for a pair both
      // walking 'leave' toward nearby door-lane spots — are very often nearly collinear from each
      // OTHER's point of view (the obstacle reads as almost dead-ahead-or-behind), where sign(cross)
      // is essentially noise: tiny position jitter flips it, which flips the push direction, which
      // moves the mover just enough to flip it back next frame. Reproduced in isolation: both
      // movers' cross values hovered within +-0.03 of zero for a full second while dist stayed
      // ~0.09-0.5m (deep in contact range) the whole time. Two changes here address it: (1) a
      // deadband on the normalised signal (cross/dist === sin(angle-from-forward)) — below it, keep
      // the LAST confident side (`m._side`) instead of recomputing from noise; (2) the first time
      // it's ever ambiguous (no prior confident side yet), break the tie using the pair's stable
      // creation-order ids (`m._id`/`o._id`) instead of hardcoding "right" — a hardcoded default
      // is only a tie-break in name: BOTH movers in a parallel-heading pair hit it at once and both
      // default to the same absolute direction (their headings being aligned makes "my right" the
      // same absolute side for both), which pushes them together, not apart. The id comparison is
      // antisymmetric (m vs o here always disagrees with o vs m on the other mover's own turn), so
      // a tied pair reliably picks opposite absolute sides instead.
      const crossNorm = cross / dist;
      let side;
      if (Math.abs(crossNorm) > SIDE_DEADBAND) { side = crossNorm > 0 ? 1 : -1; m._side = side; }
      else { side = m._side || (m._id < o._id ? -1 : 1); }
      const rpx = m.x + rightX * 0.5, rpz = m.z + rightZ * 0.5;
      const lpx = m.x - rightX * 0.5, lpz = m.z - rightZ * 0.5;
      const sideFree = side > 0 ? isFree(grid, idx(grid, rpx, rpz), m.mask) : isFree(grid, idx(grid, lpx, lpz), m.mask);
      // Fix round 1: the chosen side is specifically "away from this neighbour" — blindly flipping
      // it to the opposite side when the environment blocks it (the old behaviour) steers STRAIGHT
      // AT the neighbour instead, which is worse than doing nothing. Confirmed in the same repro:
      // in the layout's counter-flanked corridor, both movers' away-from-each-other side was wall-
      // blocked, the old flip sent both toward each other's absolute side, and they never
      // separated. Suppress this neighbour's lateral contribution instead (side = 0); if there's
      // truly no room on either side, `wantYield` below falls back to a longitudinal (speed)
      // separation instead of a lateral one.
      if (!sideFree) side = 0;
      const dot = rx * dirX + rz * dirZ;
      // Fix round 1: pinned with zero lateral room (side === 0) and already overlapping (dist <
      // contact) — lateral avoidance structurally cannot separate this pair (that's the whole
      // reason side is 0), so fall back to a longitudinal (speed) separation: ease off forward
      // speed below and drop back into single file. Measured a second, related pathology here
      // (same nav-fullhouse run, a different pair, ids 243/244, ~0.58m overlap at t≈595): gating
      // this purely on `dot > 0` ("I read the neighbour as ahead of me") looked right but wasn't —
      // two movers walking side by side with near-zero longitudinal offset read EACH OTHER as
      // "ahead" simultaneously (dot slightly positive for both, since dot's sign is just as noisy
      // as cross's near this same collinear/perpendicular boundary), so both yielded together and
      // slowed by the same amount, which changes nothing about their relative gap. Use the same
      // stable id tie-break as the side selection above instead: whichever of the pair has the
      // larger `_id` yields; the other holds full speed. Exactly one of any two pinned, overlapping
      // movers now yields (never zero, never both), which guarantees a real relative-speed
      // difference instead of a coin-flip that can cancel out.
      if (side === 0 && dist < contact && m._id > o._id && !followPairActive) wantYield = true;
      // Followers skip lateral steering against their leader (they fall into single file
      // instead of trying to pass) — see the follow-the-leader block above.
      if (dot > 0 && side !== 0 && !followsO) {
        const closeness = Math.max(0, Math.min(1, (sense - dist) / (sense - contact)));
        const urgency = 1 + (AVOID_URGENCY_MAX - 1) * closeness;
        vx += rightX * AVOID_SPEED * urgency * side * avoidScale; vz += rightZ * AVOID_SPEED * urgency * side * avoidScale;
      }
      // Omnidirectional separation, independent of the "ahead" steering above: two movers headed
      // roughly the same way (a common case in a corridor — a shared queue, or two customers
      // leaving through the same doorway lane) are often beside rather than ahead of each other,
      // so `dot > 0` doesn't reliably fire for them. Measured on the full-house run: exactly this
      // pairing (two 'leave' customers converging toward nearby door-lane spots) sat at a stable
      // ~0.2-0.3m penetration, both still making real forward progress (never triggering the
      // stall/replan/teleport machinery, since that's keyed on progress toward each one's OWN
      // target, not on how close they are to each other) for well over the test's 1s cap. So:
      // whenever actually overlapping (regardless of travel direction), push apart along the same
      // stable side/right axis as the steering above (not the raw, transient relative-position
      // vector — that flips sign, and re-triggers the very side-flip feedback the fix above
      // removed, whenever two near-parallel movers' along-track order swaps by a hair).
      // M3 T3 fix (found by the nav-fullhouse acceptance test on the new, larger layout): two
      // customers converging from spread-out origins (different registers, different times)
      // toward two nearby-but-distinct seats sat at a steadily WORSENING penetration — 0.335m at
      // first contact, ~0.55m a second later — never resolving. Both are in the open floor (not
      // pinned in a tight corridor), so the `dot > 0` steering above should be catching this, but
      // it visibly wasn't: this omni push was the only thing engaging at all, and only once
      // dist < contact (0.7m) — by which point their forward closing rate had already built up
      // real momentum this push's baseline strength (even escalated) couldn't out-accelerate
      // before depth ever got shallow again. Widening the trigger to the same `sense` radius the
      // "ahead" steering already uses (so the push ramps in gradually well before contact,
      // instead of snapping on hard at 0.7m) gives it room to counter the closing rate while it's
      // still small. depth now ramps 0..1 across the whole sense→contact band instead of 0..1
      // only across contact→0, i.e. strictly more(-or-equal) push at every distance, never less.
      if (dist < sense && !followsO) {
        const depth = Math.max(0, Math.min(1, (sense - dist) / (sense - contact)));
        vx += rightX * AVOID_SPEED * OMNI_URGENCY_MAX * depth * side * avoidScale * escalation;
        vz += rightZ * AVOID_SPEED * OMNI_URGENCY_MAX * depth * side * avoidScale * escalation;
      }
    }
  }
  m.overlapT = inContact ? m.overlapT + dt : 0;
  // Fix round 1: apply the longitudinal yield flagged above — half forward speed for this frame.
  // Only ever set when side stayed 0 for a genuinely-pinned neighbour (see above), so this never
  // fires for the ordinary lateral-avoidance case the rest of this function already handles.
  if (wantYield) { vx -= dirX * m.speed * 0.5; vz -= dirZ * m.speed * 0.5; }

  // Fix round 3: apply the follow-the-leader forward-speed ceiling computed above (the min
  // across every leader this mover yielded to this frame). Reduced ONLY along the forward
  // (dirX/dirZ) axis, never the lateral one — same axis split as wantYield just above and the
  // MAX_SPEED_MULT cap just below, both for the same reason (see the M3 T2 fix comment below):
  // every contribution to vx/vz here is exactly dirX/dirZ-aligned (seek) or rightX/rightZ-aligned
  // (avoidance), so projecting onto dirX/dirZ isolates the forward speed cleanly.
  if (forwardCap < Infinity) {
    // Final review fix: an unconditional floor on the cap itself — a follower can otherwise be
    // capped arbitrarily close to 0 (e.g. by the dist < r+r+0.1 branch above, m.speed*0.4, further
    // shrunk if it's ALSO yielding to a second leader the same frame via the Math.min chain) with
    // no guaranteed minimum forward progress, which is exactly the kind of near-zero differential
    // fix round 3's own writeup above (ids 78/80) flags as too slow to ever clear the acceptance
    // test's overlap window. Flooring at 0.4x this mover's own speed guarantees it's always still
    // closing the gap, not just theoretically uncapped.
    forwardCap = Math.max(forwardCap, m.speed * 0.4);
    const fwdNow = vx * dirX + vz * dirZ;
    if (fwdNow > forwardCap) { vx += dirX * (forwardCap - fwdNow); vz += dirZ * (forwardCap - fwdNow); }
  }

  // Cap the combined seek+avoidance speed so a heavily-avoiding mover never moves unrealistically
  // fast overall — the urgency ramp above can otherwise add several times m.speed of side-step.
  //
  // M3 T2 fix: cap only the LATERAL (rightX/rightZ) component, not the forward (dirX/dirZ) one.
  // Avoidance above is constructed to be purely lateral (every push is along rightX/rightZ, which
  // is perpendicular to dirX/dirZ by construction), so the forward-axis projection of vx/vz is
  // exactly the seek speed regardless of how much avoidance piled on — a plain magnitude cap was
  // scaling that down too whenever several obstacles' pushes summed past the cap, silently
  // trading away forward progress for room that was only ever needed laterally. Measured on the
  // full-house run: a handful of 'leave' customers crossing the same crowded stretch spent
  // multiple seconds mostly side-stepping each other with barely any net progress toward their
  // (far away) final target — exactly what the acceptance test's independent stall detector
  // (progress toward tx/tz over a 3s window) flags, even though each mover's own blockedT stayed
  // under its 1.5s replan threshold the whole time (it tracks the CURRENT waypoint, and lateral
  // motion alone can still nudge that closer). Decomposing and capping only the lateral part keeps
  // forward progress guaranteed whenever d0 > 0, while still bounding total avoidance push.
  if (d0 > 1e-4) {
    const capSp = m.speed * MAX_SPEED_MULT;
    const fwd = vx * dirX + vz * dirZ; // == m.speed unless d0 was clamped to 0 above (guarded)
    const lat = vx * rightX + vz * rightZ;
    const latBudget = Math.sqrt(Math.max(0, capSp * capSp - fwd * fwd));
    if (Math.abs(lat) > latBudget) {
      const latC = Math.sign(lat) * latBudget;
      vx = dirX * fwd + rightX * latC;
      vz = dirZ * fwd + rightZ * latC;
    }
  } else {
    const capSp = m.speed * MAX_SPEED_MULT;
    const totalSp = Math.hypot(vx, vz);
    if (totalSp > capSp) { const s = capSp / totalSp; vx *= s; vz *= s; }
  }

  m.vx = vx; m.vz = vz;
  m.x += vx * dt; m.z += vz * dt;
  if (vx * vx + vz * vz > 1e-8) m.rot = Math.atan2(vx, vz);

  const dx = wx - m.x, dz = wz - m.z, d = Math.hypot(dx, dz);

  // Stall detection: over rolling STALL_WINDOW-second windows, track the best distance reached
  // toward the current waypoint; too little improvement accumulates blockedT, enough clears it.
  if (m._winD === Infinity) m._winD = d;
  if (d < m.bestD) m.bestD = d;
  m.progT += dt;
  if (m.progT >= STALL_WINDOW) {
    const improvement = m._winD - m.bestD;
    m.blockedT = improvement < STALL_MIN_PROGRESS ? m.blockedT + m.progT : 0;
    m._winD = d; m.bestD = d; m.progT = 0;
  }

  if (m.blockedT >= TELEPORT_AT) {
    // Final review fix: skip the jump entirely when n === 0 — with no path at all (unreachable
    // target, or nearestFree couldn't resolve one), there's nothing to teleport TOWARD except the
    // raw (tx, tz), which may itself be unreachable/inside a blocked footprint; jumping there had
    // no basis for being any safer than staying put. The stall clock still resets below so a
    // pathless mover keeps retrying via the ordinary FALLBACK_REPLAN cadence instead of re-hitting
    // this branch every frame.
    if (m.n !== 0) {
      const t = d > 1e-4 ? Math.min(1, TELEPORT_DIST / d) : 0;
      let newX = m.x + dx * t, newZ = m.z + dz * t;
      // Clamp the landing point to the nearest free cell's centre — an unclamped jump can land
      // inside a footprint that was blocked (or became blocked mid-walk) between the mover's
      // current position and its waypoint, which is exactly the kind of spot this mechanism exists
      // to rescue a mover FROM, not drop one into.
      const cell = nearestFree(grid, idx(grid, newX, newZ), m.mask);
      if (cell >= 0) { newX = cx(grid, cell); newZ = cz(grid, cell); }
      m.x = newX; m.z = newZ;
      m.teleports++;
    }
    m.blockedT = 0; m.progT = 0; m.bestD = Infinity; m._winD = Infinity;
  } else if (m.blockedT >= REPLAN_AT) {
    replan(m, grid);
    m.blockedT = 0.75; m.progT = 0; m.bestD = Infinity; m._winD = Infinity;
  }

  if (finalLeg) {
    const fd = Math.hypot(m.tx - m.x, m.tz - m.z);
    if (fd < ARRIVE_EPS) {
      m.hasTarget = false; m.n = 0; m.k = 0; m.stall = 0;
      m.blockedT = 0; m.progT = 0; m.bestD = Infinity; m._winD = Infinity;
      return true;
    }
  } else if (d < WAYPOINT_EPS) {
    m.k++;
  }
  return false;
}

export function overlapPenetration(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  const dist = Math.hypot(dx, dz);
  return Math.max(0, a.r + b.r - dist);
}
