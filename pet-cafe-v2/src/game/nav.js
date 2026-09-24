// src/game/nav.js — a 0.5 m walk grid and A* for guests and staff.
// The owner does not path-find (they are steered by the player) but collides with the same boxes.
import { ROOM } from './layout.js';

const CELL = 0.5, X0 = -8, Z0 = -6, W = 44, H = 32;   // covers x -8..14, z -6..10
const KITCHEN_Z = -2.05;                               // guests never go behind the counters

export function createNav() {
  const blocked = new Uint8Array(W * H);
  const boxes = [];                                      // solid rectangles, for the owner's collision

  const idx = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    return (i < 0 || j < 0 || i >= W || j >= H) ? -1 : j * W + i;
  };
  const cx = i => X0 + ((i % W) + 0.5) * CELL;
  const cz = i => Z0 + (((i / W) | 0) + 0.5) * CELL;

  function walls() {
    const t = 0.3, r = ROOM;
    return [
      { x0: r.x0 - t, x1: r.x1 + t, z0: r.z0 - t, z1: r.z0 },               // back
      { x0: r.x0 - t, x1: r.x0, z0: r.z0, z1: r.z1 },                       // left
      { x0: r.x1, x1: r.x1 + t, z0: r.z0, z1: r.z1 },                       // right
      { x0: r.x0 - t, x1: r.doorX0, z0: r.z1 - 0.12, z1: r.z1 + 0.25 },     // front, left of door
      { x0: r.doorX1, x1: r.x1 + t, z0: r.z1 - 0.12, z1: r.z1 + 0.25 },     // front, right of door
      { x0: r.x0, x1: -6.3, z0: -2.0, z1: -1.2 },                           // bar end left of the till
      { x0: 2.4, x1: 3.5, z0: r.z0, z1: r.z0 + 0.85 },                      // kitchen sink
      { x0: 3.13, x1: r.x1, z0: -0.45, z1: 0.65 },                          // delivery hatch
    ];
  }

  function rebuild(stations) {
    blocked.fill(0);
    boxes.length = 0;
    for (const w of walls()) boxes.push(w);
    for (const st of stations) {
      if (!st.built) continue;
      const rot = st.rot || 0, swap = Math.abs(Math.sin(rot)) > 0.5;
      const fw = swap ? st.fd : st.fw, fd = swap ? st.fw : st.fd;
      if (st.type === 'table') {
        // the table top is solid; its chairs are where guests sit, so they stay walkable
        boxes.push({ x0: st.x - 0.45, x1: st.x + 0.45, z0: st.z - 0.45, z1: st.z + 0.45 });
      } else {
        boxes.push({ x0: st.x - fw / 2, x1: st.x + fw / 2, z0: st.z - fd / 2, z1: st.z + fd / 2 });
      }
    }
    for (let i = 0; i < W * H; i++) {
      const x = cx(i), z = cz(i);
      for (const b of boxes) {
        if (x > b.x0 - 0.22 && x < b.x1 + 0.22 && z > b.z0 - 0.22 && z < b.z1 + 0.22) { blocked[i] = 1; break; }
      }
    }
  }

  // mask: 'guest' may not enter the kitchen; 'staff' may go anywhere inside or out.
  function free(i, mask) {
    if (i < 0 || blocked[i]) return false;
    if (mask === 'guest') {
      const x = cx(i), z = cz(i);
      if (z < KITCHEN_Z && x > ROOM.x0 && x < ROOM.x1) return false;
    }
    return true;
  }

  function nearestFree(i, mask) {
    if (free(i, mask)) return i;
    for (let r = 1; r < 6; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i % W + di, jj = ((i / W) | 0) + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const k = jj * W + ii; if (free(k, mask)) return k;
      }
    }
    return -1;
  }

  const g = new Float32Array(W * H), from = new Int32Array(W * H), closed = new Uint8Array(W * H);
  // A* with 8-way moves (no corner cutting). Returns a list of {x, z} ending exactly at the goal.
  function path(ax, az, bx, bz, mask = 'staff') {
    let s = nearestFree(idx(ax, az), mask), t = nearestFree(idx(bx, bz), mask);
    if (s < 0 || t < 0) return [{ x: bx, z: bz }];
    g.fill(Infinity); from.fill(-1); closed.fill(0);
    const open = [s]; g[s] = 0;
    const hx = cx(t), hz = cz(t);
    const f = i => g[i] + Math.hypot(cx(i) - hx, cz(i) - hz);
    let found = false, guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (f(open[k]) < f(open[bi])) bi = k;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === t) { found = true; break; }
      if (closed[cur]) continue; closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (!free(n, mask) || closed[n]) continue;
        if (di && dj && (!free(cj * W + ni, mask) || !free(nj * W + ci, mask))) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1) * CELL;
        if (ng < g[n]) { g[n] = ng; from[n] = cur; open.push(n); }
      }
    }
    if (!found) return [{ x: bx, z: bz }];
    const cells = []; for (let c = t; c !== -1 && c !== s; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: cx(c), z: cz(c) }));
    pts.pop(); pts.push({ x: bx, z: bz });
    return smooth(pts, ax, az, mask);
  }

  // Drop waypoints that a straight walk can skip, so people do not zig-zag along the grid.
  function smooth(pts, ax, az, mask) {
    const out = []; let px = ax, pz = az, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (clear(px, pz, pts[m].x, pts[m].z, mask)) { far = m; break; }
      out.push(pts[far]); px = pts[far].x; pz = pts[far].z; k = far + 1;
    }
    return out;
  }
  function clear(ax, az, bx, bz, mask) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let s = 1; s < n; s++) { const t = s / n; if (!free(idx(ax + (bx - ax) * t, az + (bz - az) * t), mask)) return false; }
    return true;
  }

  // Circle-vs-box slide for the owner. Returns the corrected position.
  function collide(x, z, r = 0.3) {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of boxes) {
        const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1));
        const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (r - d) / d; x += dx * p; z += dz * p; }
          else { // centre inside the box: push out along the shortest axis
            const l = x - b.x0, rr = b.x1 - x, u = z - b.z0, dd = b.z1 - z, m = Math.min(l, rr, u, dd);
            if (m === l) x = b.x0 - r; else if (m === rr) x = b.x1 + r; else if (m === u) z = b.z0 - r; else z = b.z1 + r;
          }
        }
      }
    }
    // the owner stays inside the café
    x = Math.max(ROOM.x0 + r, Math.min(ROOM.x1 - r, x));
    z = Math.max(ROOM.z0 + r, Math.min(ROOM.z1 - 0.15 - r, z));
    return { x, z };
  }

  // Is a body of radius r overlapping anything solid? And if it is, the nearest open floor to step to.
  // (A station built on top of the owner can wedge them into a gap narrower than their body, where two
  // boxes keep pushing them back and forth; the owner must never be left stuck like that.)
  const overlaps = (x, z, r = 0.24) => boxes.some(b => { const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1)); return (x - nx) ** 2 + (z - nz) ** 2 < r * r; });
  // the closest floor inside the café that a whole body fits on (in front of a new machine, usually)
  function escape(x, z) {
    const i0 = Math.floor((x - X0) / CELL), j0 = Math.floor((z - Z0) / CELL);
    let best = null, bd = Infinity;
    for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const k = j * W + i, px = cx(k), pz = cz(k);
      if (blocked[k] || px < ROOM.x0 + 0.3 || px > ROOM.x1 - 0.3 || pz < ROOM.z0 + 0.3 || pz > ROOM.z1 - 0.45 || overlaps(px, pz, 0.3)) continue;
      const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = { x: px, z: pz }; }
    }
    return best;
  }

  // For pets: not inside furniture or walls (a small margin), anywhere else is fine.
  const walkable = (x, z) => {
    for (const b of boxes) if (x > b.x0 - 0.12 && x < b.x1 + 0.12 && z > b.z0 - 0.12 && z < b.z1 + 0.12) return false;
    return true;
  };

  return { rebuild, path, collide, walkable, boxes, overlaps, escape };
}
