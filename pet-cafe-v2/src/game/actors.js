// src/game/actors.js — what guests, staff and the owner share: walking a path, and a visible stack.
import { stackSlot } from '../render/items.js';
import { SUPPLIES } from './layout.js';

// Walk a nav path at `speed`. go() is cheap to call every frame: it only re-plans for a new goal.
export function makeWalker(nav, x, z, speed, mask = 'staff') {
  const w = { x, z, vx: 0, vz: 0, speed, path: [], gx: x, gz: z, face: 0, mask };
  w.go = (tx, tz) => {
    if (Math.hypot(tx - w.gx, tz - w.gz) < 0.05 && (w.path.length || w.at(tx, tz))) return;
    w.gx = tx; w.gz = tz; w.path = nav.path(w.x, w.z, tx, tz, w.mask);
  };
  w.at = (tx = w.gx, tz = w.gz, r = 0.12) => Math.hypot(tx - w.x, tz - w.z) < r;
  w.step = dt => {
    w.vx = 0; w.vz = 0;
    while (w.path.length) {
      const p = w.path[0], dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { w.path.shift(); continue; }
      const s = Math.min(d, w.speed * dt);
      w.x += dx / d * s; w.z += dz / d * s;
      w.vx = dx / d * w.speed; w.vz = dz / d * w.speed;
      break;
    }
    return !w.path.length;
  };
  return w;
}

// Put a human at the walker's position, animate, and keep the carried stack drawn in its arms.
export function syncHuman(H, w, dt, faceOverride = null) {
  H.group.position.x = w.x; H.group.position.z = w.z;
  if (faceOverride != null && Math.hypot(w.vx, w.vz) < 0.05) {
    let d = faceOverride - H.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    H.group.rotation.y += d * Math.min(1, dt * 10); H._face = H.group.rotation.y;
  }
  H.update(dt, w.vx, w.vz);
}

export function drawStack(items, H, carry) {
  if (!carry.kind || carry.n <= 0) return;
  const ry = H.group.rotation.y, s = H.group.scale.y;
  const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
  const bx = H.group.position.x + fx * 0.46, bz = H.group.position.z + fz * 0.46, by = H.group.position.y + 1.02 * s;
  if (!SUPPLIES[carry.kind]) items.add('tray', bx, by - 0.03, bz, ry);
  for (let i = 0; i < carry.n; i++) {
    const o = stackSlot(carry.kind, i);
    items.add(carry.kind, bx + rx * o.x, by + o.y, bz + rz * o.x, ry);
  }
}

export const faceTo = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, toZ - fromZ);
