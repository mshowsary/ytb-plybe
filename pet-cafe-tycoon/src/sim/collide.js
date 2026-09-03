// src/sim/collide.js — pure circle-vs-axis-aligned-box push-out. No imports (must not import world.js).

// Push circle {x,z} radius r out of every overlapping box {x,z,hw,hd} (centre + half extents).
// Mutates p.x/p.z. Returns true if p was moved.
export function pushOut(p, r, boxes) {
  let moved = false;
  for (const b of boxes) {
    const dx = p.x - b.x, dz = p.z - b.z;
    const ax = Math.abs(dx), az = Math.abs(dz);
    if (ax < b.hw && az < b.hd) {
      // Circle centre is inside the box: resolve along the axis of minimum penetration.
      const penX = b.hw - ax, penZ = b.hd - az;
      if (penX < penZ) p.x = b.x + Math.sign(dx || 1) * (b.hw + r);
      else p.z = b.z + Math.sign(dz || 1) * (b.hd + r);
      moved = true;
      continue;
    }
    // Centre is outside (or on) the box: push away from the closest point on its surface.
    const cx = Math.max(-b.hw, Math.min(b.hw, dx));
    const cz = Math.max(-b.hd, Math.min(b.hd, dz));
    const closestX = b.x + cx, closestZ = b.z + cz;
    const ddx = p.x - closestX, ddz = p.z - closestZ;
    const distSq = ddx * ddx + ddz * ddz;
    if (distSq >= r * r) continue;
    const dist = Math.sqrt(distSq) || 1e-4;
    p.x = closestX + ddx / dist * r;
    p.z = closestZ + ddz / dist * r;
    moved = true;
  }
  return moved;
}

// Build axis-aligned boxes for every active station in world `w`. Stations without fw/fd
// default to 1x1. A station rotated by ±90° swaps its half extents.
export function stationBoxes(w) {
  const boxes = [];
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    let fw = st.fw != null ? st.fw : 1;
    let fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot)) > 0.5) { const t = fw; fw = fd; fd = t; }
    boxes.push({ x: st.x, z: st.z, hw: fw / 2, hd: fd / 2 });
  }
  return boxes;
}
