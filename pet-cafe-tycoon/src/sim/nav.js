// src/sim/nav.js — pure grid navigation: a static walkability grid over an area plus an
// allocation-free A* over it. No imports (mirrors src/sim/collide.js's independence); the
// caller (world.js's stations) is read structurally, not imported.
const CELL = 0.5;
const SQRT2 = Math.SQRT2;

// Active-station footprints, expanded 0.25m on each side, rotated the same way
// src/sim/collide.js's stationBoxes does (swap fw/fd when the station is turned ~90deg).
// 'gate' is a non-blocking marker (the fence-row gap is handled by grid-row logic below, not by
// a footprint) so it must never contribute a box here, or the terrace gate would be solid.
function footprintBoxes(world) {
  const boxes = [];
  if (!world || !world.stations) return boxes;
  for (const st of world.stations.values()) {
    if (!st.active || st.type === 'gate') continue;
    let fw = st.fw != null ? st.fw : 1;
    let fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
    boxes.push({ x: st.x, z: st.z, hw: fw / 2 + 0.25, hd: fd / 2 + 0.25 });
  }
  return boxes;
}

// Default gate gap half-width, used only by a region that authors no `gateHalfW` of its own.
// Both shipped regions author 2.4, matching their own gate station's fw 4.8 (data/area1.js).
const GATE_HALF_W = 1.2;

// Which edge of the interior rectangle a region hangs off, DERIVED from the region's own
// rectangle rather than authored anywhere. Batch 4b's whole difficulty was that this file knew
// only "south": the fence was a ROW at z = halfD with its gap keyed on |x|, and nothing but a
// region satisfying `z0 > halfD` could exist. The spa is that same idea turned 90 degrees — a
// fence COLUMN at x = halfW with its gap keyed on |z| — so the two are now ONE code path
// parameterised by `axis`, and the plan's fourth space (§3.10) is a row of data, not another
// pass through this file.
//
//   axis      the coordinate the region is displaced ALONG ('z' = the terrace, south past the
//             fence row; 'x' = the spa, east past the fence column)
//   line      the interior boundary coordinate on that axis (halfD or halfW)
//   gapCentre where the gate gap sits on the OTHER axis (`region.gateX` for a south region,
//             `region.gateZ` for an east one) — positioned by its region, never assumed centred,
//             because the seat rows either side of it are a wall with mostly single-cell holes
//   gapHalf   half the gap's width, matching the gate station's own fw / 2
//
// Returns null for a region hung off the NORTH or WEST edge: the café has WALLS there, not
// fences (render/props.js buildStatic), so such a region needs a door lane cut through the wall
// — see the west margin's own door-lane code in buildGrid — which is different work, not this
// rotation. Null leaves that region's cells inert rather than silently half-connected.
export function regionEdge(region, area) {
  if (!region || !area || !area.size) return null;
  const halfW = area.size.w / 2, halfD = area.size.d / 2;
  const gapHalf = region.gateHalfW == null ? GATE_HALF_W : region.gateHalfW;
  // `>=`, not `>`: the terrace starts at z 7.4 (clear of the fence's own thickness) but the spa
  // starts exactly ON x = halfW, so the fence column overlaps its westmost sliver. Harmless,
  // because buildGrid tests the fence line BEFORE region membership.
  if (region.z0 >= halfD) return { axis: 'z', line: halfD, gapCentre: region.gateX == null ? 0 : region.gateX, gapHalf };
  if (region.x0 >= halfW) return { axis: 'x', line: halfW, gapCentre: region.gateZ == null ? 0 : region.gateZ, gapHalf };
  return null;
}

// Build a static walkability grid for `area` given the current active stations in `world`.
//
// Batch 1/4b — the regions engine (plan 7.1). `area.regions` are second physical spaces outside
// the interior rectangle: the terrace (south of the fence row) and the spa (east of the fence
// column). The grid spans the interior UNION every region, so those cells exist in the array at
// all, but a cell out there is only ever WALKABLE when it falls inside a region whose `builtBy`
// is in `world.built` — an unbuilt region's cells stay blocked exactly like solid wall.
//
// Origin: ox = min(-halfW, every region.x0) - 2 (the 2m street margin, for the door lanes),
// oz = min(-halfD, every region.z0). Neither moves for either shipped region (the terrace only
// extends south, the spa only east), so every interior cell keeps the same (gx, gz) AND the same
// blocked/lane value it had before regions existed — proved cell by cell in test/nav-regions.
// The spa DOES widen the array (w 44 -> 59), which necessarily re-strides the linear index
// i = gz * w + gx; nothing persists a linear cell index (grids are rebuilt from scratch by
// refreshActive on every build), so coordinates, not indices, are the invariant that matters.
//
// A cell is blocked when its centre falls inside an active station's expanded footprint, when
// it's the west wall column outside the door gap, when it's on the south fence row or the east
// fence column and outside every BUILT region's gate gap there, or when it lies outside the
// interior and outside every built region.
//
// Door lanes (west margin only): entry cells (lane 1) at z in [door.z-1.2, door.z), exit cells
// (lane 2) at z in [door.z, door.z+1.2).
export function buildGrid(area, world) {
  const halfW = area.size.w / 2, halfD = area.size.d / 2;
  const regions = (area && area.regions) || [];
  let minX = -halfW, maxX = halfW, minZ = -halfD, maxZ = halfD;
  for (const r of regions) {
    if (r.x0 < minX) minX = r.x0;
    if (r.x1 > maxX) maxX = r.x1;
    if (r.z0 < minZ) minZ = r.z0;
    if (r.z1 > maxZ) maxZ = r.z1;
  }
  const ox = minX - 2, oz = minZ;
  const w = Math.ceil((maxX - minX + 2) / CELL);
  const h = Math.ceil((maxZ - minZ) / CELL);
  const n = w * h;
  const blocked = new Uint8Array(n);
  const lane = new Uint8Array(n);
  const doorZ = area.door.z;
  const boxes = footprintBoxes(world);
  const built = (world && world.built) || null;
  // The wall column is keyed by grid-column index, not by distance from x = -halfW: since the
  // margin is always exactly 2m and CELL is 0.5m, two cell centres (margin-side and floor-side)
  // land exactly 0.25m from the wall line — a tie that a distance threshold can't break. margin/
  // CELL columns (index 0..wallGx-1) are always fully inside the margin; column wallGx is the one
  // whose span starts exactly at x = -halfW (same floor-convention idx() uses), so it's the wall.
  const wallGx = Math.round((-halfW - ox) / CELL);
  // Same tie-breaking problem, one axis over: the fence sits exactly at z = halfD, and CELL
  // divides it evenly, so a distance check ties the same way the old wall check did. fenceGz is
  // the single grid ROW whose span starts exactly at z = halfD — the row south of every ordinary
  // interior row, and the row the terrace's gate gap punches through once it is built.
  const fenceGz = Math.round((halfD - oz) / CELL);
  // Batch 4b: the EAST fence is the same line rotated 90 degrees — the single grid COLUMN whose
  // span starts exactly at x = halfW, east of every ordinary interior column, and the column the
  // spa's gate gap punches through. Identical derivation, identical tie-break; note that
  // `cxv > halfW` (the old interior test) is exactly `gx >= fenceGx`, so replacing it below is a
  // rename, not a behaviour change.
  const fenceGx = Math.round((halfW - ox) / CELL);
  // Each region's edge descriptor, resolved once rather than per cell (buildGrid runs over
  // ~2,500 cells per rebuild and rebuilds on every build/star purchase).
  const edges = regions.map(r => regionEdge(r, area));

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
        // Three zones, tested in this order: the interior rectangle and its west margin, then the
        // two fence LINES that bound it (south row, east column), then everything beyond — which
        // is region territory. The fence lines are tested before region membership on purpose:
        // the spa starts exactly on x = halfW, so its westmost sliver of cells IS the fence
        // column and must stay solid except at the gate.
        const onSouthFence = gz === fenceGz && gx < fenceGx;
        const onEastFence = gx === fenceGx && gz < fenceGz;
        if (gz < fenceGz && gx < fenceGx) {
          // Ordinary interior row — verbatim pre-regions logic, so every interior cell's
          // blocked/lane value is unchanged bit-for-bit from before regions existed. (The old
          // `cxv > halfW` arm moved into this branch's own `gx < fenceGx` guard: same cells,
          // since a cell centre exceeds halfW exactly when gx >= fenceGx.)
          if (gx === wallGx) {
            // the single wall column: free only inside the full door gap, no lane value
            const inGap = czv >= doorZ - 1.2 && czv <= doorZ + 1.2;
            if (!inGap) isBlocked = true;
          } else if (gx < wallGx) {
            // west margin: free only inside a door lane, blocked otherwise
            if (czv >= doorZ - 1.2 && czv < doorZ) laneVal = 1;
            else if (czv >= doorZ && czv < doorZ + 1.2) laneVal = 2;
            else isBlocked = true;
          } else if (czv < -halfD) {
            isBlocked = true;
          }
        } else if (onSouthFence || onEastFence) {
          // A fence line: solid everywhere except the gate gap of a region reached through THIS
          // line, and only once that region has actually been built. The gap is positioned by its
          // region, not centred by assumption. Measured (Batch 1): the lounge seat row at z~6 is a
          // wall with mostly SINGLE-CELL (0.5m) holes, so a gate behind one of them deadlocks
          // whatever its own width — the region places its gap against a real corridor instead.
          const wantAxis = onSouthFence ? 'z' : 'x';
          const probe = onSouthFence ? cxv : czv;   // the gap spans the OTHER axis
          let open = false;
          for (let ri = 0; ri < regions.length; ri++) {
            const e = edges[ri];
            if (!e || e.axis !== wantAxis) continue;
            if (!built || !built.has(regions[ri].builtBy)) continue;
            if (Math.abs(probe - e.gapCentre) <= e.gapHalf) { open = true; break; }
          }
          if (!open) isBlocked = true;
        } else {
          // Beyond both fence lines: walkable only inside a BUILT region that actually covers this
          // cell. An unbuilt region's cells — and the dead corner past BOTH fences, which belongs
          // to no region at all — block.
          let free = false;
          for (const r of regions) {
            if (built && built.has(r.builtBy) && cxv >= r.x0 && cxv <= r.x1 && czv >= r.z0 && czv <= r.z1) { free = true; break; }
          }
          if (!free) isBlocked = true;
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
