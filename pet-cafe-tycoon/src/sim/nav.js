// src/sim/nav.js — pure grid navigation: a static walkability grid over an area plus an
// allocation-free A* over it. No imports (mirrors src/sim/collide.js's independence); the
// caller (world.js's stations) is read structurally, not imported.
const CELL = 0.5;
const SQRT2 = Math.SQRT2;

// Active-station footprints, expanded 0.25m on each side, rotated the same way
// src/sim/collide.js's stationBoxes does (swap fw/fd when the station is turned ~90deg).
function footprintBoxes(world) {
  const boxes = [];
  if (!world || !world.stations) return boxes;
  for (const st of world.stations.values()) {
    if (!st.active) continue;
    let fw = st.fw != null ? st.fw : 1;
    let fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
    boxes.push({ x: st.x, z: st.z, hw: fw / 2 + 0.25, hd: fd / 2 + 0.25 });
  }
  return boxes;
}

// Build a static walkability grid for `area` given the current active stations in `world`.
// Origin: ox = -area.size.w/2 - 2 (a 2m street margin west of the wall, for the door lanes),
// oz = -area.size.d/2. A cell is blocked when its centre falls inside an active station's
// expanded footprint, when it's the wall column outside the door gap, or when it lies beyond
// the floor rectangle and isn't a door-lane cell. Door lanes (west margin only): entry cells
// (lane 1) at z in [door.z-1.2, door.z), exit cells (lane 2) at z in [door.z, door.z+1.2).
export function buildGrid(area, world) {
  const halfW = area.size.w / 2, halfD = area.size.d / 2;
  const ox = -halfW - 2, oz = -halfD;
  const w = Math.ceil((area.size.w + 2) / CELL);
  const h = Math.ceil(area.size.d / CELL);
  const n = w * h;
  const blocked = new Uint8Array(n);
  const lane = new Uint8Array(n);
  const doorZ = area.door.z;
  const boxes = footprintBoxes(world);
  // The wall column is keyed by grid-column index, not by distance from x = -halfW: since the
  // margin is always exactly 2m and CELL is 0.5m, two cell centres (margin-side and floor-side)
  // land exactly 0.25m from the wall line — a tie that a distance threshold can't break. margin/
  // CELL columns (index 0..wallGx-1) are always fully inside the margin; column wallGx is the one
  // whose span starts exactly at x = -halfW (same floor-convention idx() uses), so it's the wall.
  const wallGx = Math.round(2 / CELL);

  for (let gz = 0; gz < h; gz++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gz * w + gx;
      const cxv = ox + (gx + 0.5) * CELL;
      const czv = oz + (gz + 0.5) * CELL;
      let isBlocked = false, laneVal = 0;

      for (let bi = 0; bi < boxes.length; bi++) {
        const b = boxes[bi];
        if (Math.abs(cxv - b.x) < b.hw && Math.abs(czv - b.z) < b.hd) { isBlocked = true; break; }
      }
      if (!isBlocked) {
        if (gx === wallGx) {
          // the single wall column: free only inside the full door gap, no lane value
          const inGap = czv >= doorZ - 1.2 && czv <= doorZ + 1.2;
          if (!inGap) isBlocked = true;
        } else if (gx < wallGx) {
          // west margin: free only inside a door lane, blocked otherwise
          if (czv >= doorZ - 1.2 && czv < doorZ) laneVal = 1;
          else if (czv >= doorZ && czv < doorZ + 1.2) laneVal = 2;
          else isBlocked = true;
        } else if (cxv > halfW || czv < -halfD || czv > halfD) {
          isBlocked = true;
        }
      }
      blocked[i] = isBlocked ? 1 : 0;
      lane[i] = laneVal;
    }
  }

  const heapCap = n * 8 + 16; // worst case: each of n cells relaxed at most 8 times (8-connectivity)
  return {
    w, h, cell: CELL, ox, oz,
    blocked, lane,
    frame: 0, version: 0,
    // A* scratch, reused across searches via the stamp trick (never cleared).
    gScore: new Float32Array(n),
    parent: new Int32Array(n),
    stamp: new Int32Array(n),
    closedStamp: new Int32Array(n),
    curStamp: 0,
    heapIdxArr: new Int32Array(heapCap),
    heapG: new Float32Array(heapCap),
    heapF: new Float32Array(heapCap),
    heapSize: 0,
    _poppedG: 0,
    _cache: null, _cacheFrame: -1,
  };
}

export function markDirty(grid) { grid.version++; }

export function idx(grid, x, z) {
  let gx = Math.floor((x - grid.ox) / grid.cell);
  let gz = Math.floor((z - grid.oz) / grid.cell);
  if (gx < 0) gx = 0; else if (gx >= grid.w) gx = grid.w - 1;
  if (gz < 0) gz = 0; else if (gz >= grid.h) gz = grid.h - 1;
  return gz * grid.w + gx;
}
export function cx(grid, i) { return grid.ox + ((i % grid.w) + 0.5) * grid.cell; }
export function cz(grid, i) { return grid.oz + (((i / grid.w) | 0) + 0.5) * grid.cell; }

// mask bit 1 permits lane-1 (entry) cells, bit 2 permits lane-2 (exit) cells; lane 0 cells
// (ordinary floor) are always permitted when not blocked.
export function isFree(grid, i, mask) {
  if (grid.blocked[i]) return false;
  const l = grid.lane[i];
  if (l === 0) return true;
  if (l === 1) return !!(mask & 1);
  if (l === 2) return !!(mask & 2);
  return false;
}

function octile(grid, a, b) {
  const w = grid.w;
  const ax = a % w, az = (a / w) | 0;
  const bx = b % w, bz = (b / w) | 0;
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
}

function heapPush(grid, cell, g, f) {
  let i = grid.heapSize++;
  grid.heapIdxArr[i] = cell; grid.heapG[i] = g; grid.heapF[i] = f;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (grid.heapF[p] <= grid.heapF[i]) break;
    heapSwap(grid, i, p);
    i = p;
  }
}
function heapSwap(grid, i, j) {
  const ti = grid.heapIdxArr[i], tg = grid.heapG[i], tf = grid.heapF[i];
  grid.heapIdxArr[i] = grid.heapIdxArr[j]; grid.heapG[i] = grid.heapG[j]; grid.heapF[i] = grid.heapF[j];
  grid.heapIdxArr[j] = ti; grid.heapG[j] = tg; grid.heapF[j] = tf;
}
// Pops the minimum-f entry; leaves its g-score in grid._poppedG (avoids allocating a
// {cell,g} pair object per pop).
function heapPop(grid) {
  const topCell = grid.heapIdxArr[0];
  grid._poppedG = grid.heapG[0];
  const last = --grid.heapSize;
  grid.heapIdxArr[0] = grid.heapIdxArr[last];
  grid.heapG[0] = grid.heapG[last];
  grid.heapF[0] = grid.heapF[last];
  let i = 0;
  for (;;) {
    const l = 2 * i + 1, r = 2 * i + 2;
    let smallest = i;
    if (l < grid.heapSize && grid.heapF[l] < grid.heapF[smallest]) smallest = l;
    if (r < grid.heapSize && grid.heapF[r] < grid.heapF[smallest]) smallest = r;
    if (smallest === i) break;
    heapSwap(grid, i, smallest);
    i = smallest;
  }
  return topCell;
}

function reconstruct(parent, from, cur, out) {
  let count = 1, p = cur;
  while (p !== from) { p = parent[p]; count++; }
  let w2 = count - 1, q = cur;
  out[w2--] = q;
  while (q !== from) { q = parent[q]; out[w2--] = q; }
  return count;
}

// 8-connected A* with an octile heuristic over a binary heap of preallocated typed arrays.
// No corner cutting: a diagonal move is only allowed when both orthogonal neighbours are free.
// Writes the cell sequence from `from` to `to` (inclusive) into `out`; returns the count, or 0
// when unreachable. Allocates nothing (the closed/visited sets are stamp-gated, never cleared).
export function findPath(grid, from, to, mask, out) {
  if (from === to) { out[0] = from; return 1; }
  grid.curStamp++;
  const cs = grid.curStamp;
  const { gScore, parent, stamp, closedStamp, w, h } = grid;
  grid.heapSize = 0;
  gScore[from] = 0; stamp[from] = cs; parent[from] = -1;
  heapPush(grid, from, 0, octile(grid, from, to));

  while (grid.heapSize > 0) {
    const cur = heapPop(grid);
    const g = grid._poppedG;
    if (closedStamp[cur] === cs) continue; // already finalized (stale duplicate)
    if (stamp[cur] !== cs || gScore[cur] !== g) continue; // superseded by a better g since pushed
    closedStamp[cur] = cs;
    if (cur === to) return reconstruct(parent, from, cur, out);

    const gx = cur % w, gz = (cur / w) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = gx + dx, nz = gz + dz;
        if (nx < 0 || nx >= w || nz < 0 || nz >= h) continue;
        const ni = nz * w + nx;
        if (closedStamp[ni] === cs) continue;
        if (!isFree(grid, ni, mask)) continue;
        if (dx !== 0 && dz !== 0) {
          const o1 = gz * w + nx, o2 = nz * w + gx; // the two orthogonal neighbours of this diagonal
          if (!isFree(grid, o1, mask) || !isFree(grid, o2, mask)) continue; // no corner cutting
        }
        const cost = (dx !== 0 && dz !== 0) ? SQRT2 : 1;
        const tentG = g + cost;
        if (stamp[ni] !== cs || tentG < gScore[ni] - 1e-6) {
          gScore[ni] = tentG; stamp[ni] = cs; parent[ni] = cur;
          heapPush(grid, ni, tentG, tentG + octile(grid, ni, to));
        }
      }
    }
  }
  return 0;
}

// Ring search (Chebyshev distance) up to radius 6 for the nearest free cell; returns `i`
// itself if already free, -1 if none found within range.
export function nearestFree(grid, i, mask) {
  if (i < 0) return -1;
  if (isFree(grid, i, mask)) return i;
  const w = grid.w, h = grid.h;
  const gx0 = i % w, gz0 = (i / w) | 0;
  for (let r = 1; r <= 6; r++) {
    for (let dz = -r; dz <= r; dz++) {
      const onZEdge = dz === -r || dz === r;
      const gz = gz0 + dz;
      if (gz < 0 || gz >= h) continue;
      if (onZEdge) {
        for (let dx = -r; dx <= r; dx++) {
          const gx = gx0 + dx;
          if (gx < 0 || gx >= w) continue;
          const ci = gz * w + gx;
          if (isFree(grid, ci, mask)) return ci;
        }
      } else {
        for (let dx = -r; dx <= r; dx += 2 * r) { // just the two ring columns dx=-r and dx=+r
          const gx = gx0 + dx;
          if (gx < 0 || gx >= w) continue;
          const ci = gz * w + gx;
          if (isFree(grid, ci, mask)) return ci;
        }
      }
    }
  }
  return -1;
}

// Memoises findPath by (from, to, mask) for the current grid.frame; the cache is discarded
// (allocating fresh Maps) the first time it's touched after grid.frame changes. Only a cache
// fill allocates (a copied path array); hits just copy into the caller's `out`.
export function cachedPath(grid, from, to, mask, out) {
  if (grid._cacheFrame !== grid.frame || !grid._cache) {
    grid._cache = [new Map(), new Map(), new Map(), new Map()];
    grid._cacheFrame = grid.frame;
  }
  const N = grid.w * grid.h;
  const key = from * N + to;
  const m = grid._cache[mask & 3];
  const cached = m.get(key);
  if (cached === undefined) {
    const n = findPath(grid, from, to, mask, out);
    m.set(key, n > 0 ? out.slice(0, n) : null);
    return n;
  }
  if (cached === null) return 0;
  out.set(cached);
  return cached.length;
}
