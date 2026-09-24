// src/sim/ownerReach.js — no pockets: after a build the owner can always walk back to the café.
//
// A new station pops in wherever its plan says, and the owner is usually standing on its build pad
// when it does. Measured 2026-09-19 (playthrough probe, real movement from every reachable cell):
// buying the photo studio from its pad at (-9.0, 8.6) sealed the owner into the terrace's west
// corner — the photo booth behind, seat7 beside, register3 and the fence ahead, every gap narrower than the
// 0.92 m body — with no way out but reloading. The guests' nav grid (sim/nav.js) cannot see this:
// its cells are sized for a 0.30 m guest and its boxes are the sim footprints, while the owner is
// a 0.46 m circle colliding with what is DRAWN.
//
// So reachability is judged on the owner's own terms: the same boxes the owner's collision uses
// (systems/stations.js playerBoxes, which calls ownerBodyBoxes below), the same room/gate shape
// the owner is clamped to (ownerState.clampToArea), and a grid fine enough for a 0.92 m body.
import { areaBounds, clampToArea, OWNER_SPAWN } from './ownerState.js';
import { pushOut } from './collide.js';

export const OWNER_BODY_R = 0.46;
const CELL = 0.25;
// How far from the owner's exact spot a free cell may be and still count as "where the owner
// stands" (the owner can rest closer to a box than the nearest cell centre does).
const STAND_SLACK = 0.5;

// What the owner's body collides with: each active station's footprint (fw/fd, swapped when it is
// turned a quarter) unioned with its DRAWN box (st.body, measured by systems/visuals.js), never
// replaced by it, so a prop drawn smaller than its footprint cannot open a gap the sim still treats
// as solid. Gates are doorways and wall-mounted boards ('wall') stand on no floor: both block nothing.
export function ownerBodyBoxes(world) {
  const out = [];
  for (const st of world.stations.values()) {
    if (!st.active || st.type === 'gate' || st.type === 'wall') continue;
    let fw = st.fw != null ? st.fw : 1, fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
    let minx = st.x - fw / 2, maxx = st.x + fw / 2, minz = st.z - fd / 2, maxz = st.z + fd / 2;
    if (st.body) {
      minx = Math.min(minx, st.body.minx); maxx = Math.max(maxx, st.body.maxx);
      minz = Math.min(minz, st.body.minz); maxz = Math.max(maxz, st.body.maxz);
    }
    out.push({ x: (minx + maxx) / 2, z: (minz + maxz) / 2, hw: (maxx - minx) / 2, hd: (maxz - minz) / 2 });
  }
  return out;
}

// True when a body of radius `r` centred here touches no box — the same circle-vs-box test the
// owner's own collision applies every frame (ownerOverlapDepth below).
function bodyClear(boxes, x, z, r = OWNER_BODY_R) {
  for (const b of boxes) {
    const dx = Math.abs(x - b.x) - b.hw, dz = Math.abs(z - b.z) - b.hd;
    if (dx >= r || dz >= r) continue;
    if (Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) < r) return false;
  }
  return true;
}

// How far into the nearest box a body of OWNER_BODY_R standing here is; 0 when clear.
export function ownerOverlapDepth(boxes, x, z) {
  let worst = 0;
  for (const b of boxes) {
    const dx = Math.abs(x - b.x) - b.hw, dz = Math.abs(z - b.z) - b.hd;
    if (dx >= OWNER_BODY_R || dz >= OWNER_BODY_R) continue;
    const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
    if (d < OWNER_BODY_R && OWNER_BODY_R - d > worst) worst = OWNER_BODY_R - d;
  }
  return worst;
}

// One step of the owner's own movement, exactly as the game applies it every frame
// (systems/stations.js): move to (nx, nz), push out of every box — three passes, because the shove
// out of one box can plant the body inside its neighbour — clamp to the built rooms, and refuse a
// step that ends DEEPER inside a station than it started (a move that digs out is always allowed).
// Returns false when the step was refused. Shared so a headless walk (test/owner-reach.test.js)
// moves by the same rules the player does.
export function moveOwnerBody(P, nx, nz, boxes, area, builtSet) {
  const wasX = P.x, wasZ = P.z, wasDepth = ownerOverlapDepth(boxes, P.x, P.z);
  P.x = nx; P.z = nz;
  for (let i = 0; i < 3; i++) pushOut(P, OWNER_BODY_R, boxes);
  const p = clampToArea(area, builtSet, P.x, P.z); P.x = p.x; P.z = p.z;
  if (ownerOverlapDepth(boxes, P.x, P.z) > wasDepth + 1e-4) { P.x = wasX; P.z = wasZ; return false; }
  return true;
}

// Every cell centre the owner's body may occupy: inside a built room (or its gate seam) exactly as
// clampToArea allows, and clear of every box. `bodyR` defaults to the owner's own radius; a larger
// one asks for a corridor wider than the body (test/layout.test.js's 1.0 m rule).
export function ownerReachGrid(area, builtSet, boxes, bodyR = OWNER_BODY_R) {
  const b = areaBounds(area, builtSet);
  const ox = b.minX, oz = b.minZ;
  const w = Math.floor((b.maxX - b.minX) / CELL + 1e-9) + 1, h = Math.floor((b.maxZ - b.minZ) / CELL + 1e-9) + 1;
  const free = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + i * CELL, z = oz + j * CELL;
      const p = clampToArea(area, builtSet, x, z);
      if (Math.abs(p.x - x) > 1e-9 || Math.abs(p.z - z) > 1e-9) continue;
      if (bodyClear(boxes, x, z, bodyR)) free[j * w + i] = 1;
    }
  }
  return { ox, oz, w, h, cell: CELL, free };
}

function cellAt(g, x, z) {
  const i = Math.round((x - g.ox) / g.cell), j = Math.round((z - g.oz) / g.cell);
  return { i: Math.max(0, Math.min(g.w - 1, i)), j: Math.max(0, Math.min(g.h - 1, j)) };
}
function centre(g, k) { return { x: g.ox + (k % g.w) * g.cell, z: g.oz + ((k / g.w) | 0) * g.cell }; }

// The free cell nearest (x, z) within `radius`, or -1.
function nearestFree(g, x, z, radius) {
  const { i, j } = cellAt(g, x, z);
  const r = Math.ceil(radius / g.cell);
  let best = -1, bestD = Infinity;
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= g.w || c >= g.h || !g.free[c * g.w + a]) continue;
      const p = centre(g, c * g.w + a), d = Math.hypot(p.x - x, p.z - z);
      if (d <= radius && d < bestD) { bestD = d; best = c * g.w + a; }
    }
  }
  return best;
}

// Flood fill from `seed` over free cells; 8-neighbour, but a diagonal step needs both of its
// orthogonal cells free too, so the fill never squeezes a body through a corner.
export function ownerReachComponent(g, seed) { return component(g, seed); }
export function ownerReachCell(g, x, z, radius) { return nearestFree(g, x, z, radius); }
function component(g, seed) {
  const seen = new Uint8Array(g.w * g.h);
  if (seed < 0) return seen;
  const queue = [seed]; seen[seed] = 1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % g.w, j = (k / g.w) | 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= g.w || c >= g.h) continue;
        const n = c * g.w + a;
        if (seen[n] || !g.free[n]) continue;
        if (di && dj && (!g.free[j * g.w + a] || !g.free[c * g.w + i])) continue;
        seen[n] = 1; queue.push(n);
      }
    }
  }
  return seen;
}

/**
 * A route the OWNER'S BODY fits through, from (fx, fz) to (tx, tz), as world-space points.
 *
 * The guidance trail used to be planned on the guests' 0.5 m A* grid (systems/objective.js), whose
 * cells are sized for a 0.30 m guest and whose boxes are the sim footprints. The owner is a 0.46 m
 * circle colliding with what is DRAWN, so on the built café the trail walked into gaps he cannot
 * enter: following it, the 2026-09-19 playthrough failed to reach seat7, register3, coldPantry1 and
 * seat12, and the bot wedged between two deck tables for 105-195 s a day. This plans on the same
 * grid and the same boxes the owner's own collision uses, so a drawn trail is always walkable.
 *
 * Returns [] when either end is off the walkable floor or no route exists. The points are cell
 * centres, first cell included; the caller replaces the ends with the real from/stand spots.
 */
export function ownerPath(grid, fx, fz, tx, tz, slack = 1.0) {
  const from = nearestFree(grid, fx, fz, slack), to = nearestFree(grid, tx, tz, slack);
  if (from < 0 || to < 0) return [];
  if (from === to) return [centre(grid, to)];
  const prev = new Int32Array(grid.w * grid.h).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    if (k === to) break;
    const i = k % grid.w, j = (k / grid.w) | 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= grid.w || c >= grid.h) continue;
        const n = c * grid.w + a;
        if (prev[n] !== -1 || !grid.free[n]) continue;
        // A diagonal needs both of its orthogonal cells free too, or the body clips the corner.
        if (di && dj && (!grid.free[j * grid.w + a] || !grid.free[c * grid.w + i])) continue;
        prev[n] = k; queue.push(n);
      }
    }
  }
  if (prev[to] === -1) return [];
  const out = [];
  for (let k = to; ; k = prev[k]) { out.push(centre(grid, k)); if (k === from) break; }
  out.reverse();
  return out;
}

// Where to put the owner so they are not stuck, or null when they are fine where they stand.
// "Fine" means: the free cell at the owner's feet belongs to the same connected floor as the café
// centre (OWNER_SPAWN, the rug). Otherwise the answer is the connected free cell nearest the owner.
// Null too when the café centre itself has no free floor (nothing sensible to rescue towards).
export function ownerPocketRescue(area, builtSet, boxes, pos, home = OWNER_SPAWN) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const g = ownerReachGrid(area, builtSet, boxes);
  const seed = nearestFree(g, home.x, home.z, 2);
  if (seed < 0) return null;
  const reach = component(g, seed);
  const here = nearestFree(g, pos.x, pos.z, STAND_SLACK);
  if (here >= 0 && reach[here]) return null;
  let best = -1, bestD = Infinity;
  for (let k = 0; k < reach.length; k++) {
    if (!reach[k]) continue;
    const p = centre(g, k), d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best < 0 ? null : centre(g, best);
}
