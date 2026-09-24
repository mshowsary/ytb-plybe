// src/render/carryTray.js — what a pair of hands in this café is actually holding.
//
// WHY THIS EXISTS
// Three different places stacked carried stock into a vertical column, one item every 0.17 m:
// render/owner.js (the player), render/carriedItems.js (every staff runner) and
// systems/baristaWorker.js. At the 16-item carry tier that is a 2.7 m totem pole of cupcakes
// standing taller than the character holding it, and owner.js compounded it by multiplying the
// sway by each item's INDEX, so the moment the character moved the column smeared into a diagonal
// snake of pastries trailing across the room. Both are in the owner's playtest screenshots.
//
// A café worker carries a tray. One tray, one layout rule, one sway — here, so the player, the
// runners and the barista cannot drift apart again.
import { part, mesh } from './geo.js';
import { C } from './palette.js';

// Three across, two deep, then thin layers. Sixteen items stand 0.3 m tall instead of 2.7 m, and
// the footprint stays inside the tray's own lip so nothing floats off the edge.
const COLS = 3, ROWS = 2, DX = 0.16, DZ = 0.15, LAYER = 0.13, BASE_Y = 0.03;

export function traySlot(i, out = {}) {
  const per = COLS * ROWS;
  const layer = Math.floor(i / per);
  const within = i % per;
  out.x = ((within % COLS) - (COLS - 1) / 2) * DX;
  out.y = layer * LAYER + BASE_Y;
  out.z = (Math.floor(within / COLS) - (ROWS - 1) / 2) * DZ;
  return out;
}

// The board itself. `cast: false` deliberately: it is held at chest height directly above its own
// carrier, so its sun shadow only ever lands on the person holding it.
export function makeTray() {
  const tray = mesh([
    part('rbox', [0.56, 0.025, 0.4, 0.012], C.woodDark, { y: -0.02, tex: 'wood' }),
    part('box', [0.56, 0.035, 0.022], C.wood, { y: 0, z: 0.19 }),
    part('box', [0.56, 0.035, 0.022], C.wood, { y: 0, z: -0.19 }),
    part('box', [0.022, 0.035, 0.4], C.wood, { x: 0.27 }),
    part('box', [0.022, 0.035, 0.4], C.wood, { x: -0.27 }),
  ], { cast: false });
  tray.visible = false;
  tray.name = 'carry-tray';
  return tray;
}

// Lay every mesh in `items` onto its slot. `bob` (0..1) lifts only the item most recently added, so
// a fresh pastry lands with a little weight instead of appearing.
const _slot = { x: 0, y: 0, z: 0 };
export function layoutTray(items, bob = 0) {
  for (let i = 0; i < items.length; i++) {
    traySlot(i, _slot);
    const lift = (bob > 0 && i === items.length - 1) ? Math.sin(bob * Math.PI) * 0.05 : 0;
    items[i].position.set(_slot.x, _slot.y + lift, _slot.z);
  }
}

// One sway for the whole tray, applied to the mount group — never per item. `homeZ` is the mount's
// resting offset in front of the chest (human.js parks it at 0.42).
export function swayTray(stackGroup, sx, sz, homeZ = 0.42) {
  stackGroup.position.x = sx * 1.6;
  stackGroup.position.z = homeZ + sz * 1.6;
  stackGroup.rotation.z = sx * 1.1;
  stackGroup.rotation.x = -sz * 1.1;
}
