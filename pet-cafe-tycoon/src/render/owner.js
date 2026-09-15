// src/render/owner.js — café owner: a human (role 'owner') carrying the stack at chest height, arms forward.
import { createHuman } from './human.js';
import { C } from './palette.js';
import { damp } from '../core/tween.js';
import { sackMesh, fruitMesh } from './props.js';
import { makeTray, layoutTray, swayTray, traySlot } from './carryTray.js';
import { currentContactShadows } from './contactShadows.js';

// game.js constructs the owner with zero arguments (`createOwner()`) and this program does not
// touch game.js, so there is no parameter path to hand this the render/scene.js bundle. The
// contact-shadow system is instead read from its own module-level singleton (see
// contactShadows.js's `currentContactShadows`), which main.js constructs before createGame() runs
// -- so it already exists by the time this call happens. `contactShadows` stays an explicit,
// optional second argument too, for a future caller that wants to hand one in directly.
export function createOwner(shirtHex = C.coral, contactShadows = currentContactShadows()) {
  const H = createHuman({ shirt: shirtHex, hair: 0, skin: 0 }, 'owner');
  const { group, stack } = H;
  const O = { group, items: [], H, headTop: 2.2, _sway: { x: 0, z: 0 }, _bob: 0 };
  if (contactShadows) contactShadows.add(group, { radius: 0.44, strength: 1.05, follow: true });
  // ---- the tray -------------------------------------------------------------------------------
  // Carried stock used to be a single vertical column, one item every 0.17 m, with the sway
  // MULTIPLIED by each item's index. Two consequences the owner photographed: a runner at the
  // 16-item carry tier grew a 2.7 m totem pole of cupcakes taller than itself, and the moment it
  // moved, the per-index sway smeared that column into a diagonal snake of pastries trailing across
  // the café. A café worker carries a TRAY, so this is a tray: a shallow board in both hands, items
  // laid out in a 3 x 2 grid and stacked in thin layers once the grid is full, and the sway applied
  // once to the whole tray instead of per item. Sixteen cupcakes now stand 0.3 m tall on a board
  // rather than 2.7 m in the air.
  const tray = makeTray();
  stack.add(tray);

  O.addItem = m => { const p = traySlot(O.items.length); m.position.set(p.x, p.y, p.z); m.scale.setScalar(0.01); stack.add(m); O.items.push(m); O._bob = 1; H.setCarry(O.items.length); };
  O.popItem = () => { const m = O.items.pop(); if (m) stack.remove(m); H.setCarry(O.items.length); return m; };
  // Loop v2 Task 1: the return crate empties the whole product stack at once — pop every mesh off
  // (not just splice the array) so nothing is left orphaned, still parented to the stack, on stage.
  O.clearItems = () => { while (O.items.length) O.popItem(); };
  // Task 4: a sack (beans/kibble) or a fruit basket rides the stack the same as product items —
  // built once each, lazily, and just toggled visible (never both/product items at once, per the
  // carry-slot rules in src/sim/carry.js, so there's never a stacking-order question to solve).
  // 'cream' (coldPantry1) and 'water' (waterTank1) are real supply kinds in data/area1.js and were
  // missing here, so fetching milk for the ice-cream machine or water for the bath showed an
  // empty-handed character walking back across the café.
  const sackByKind = { beans: null, kibble: null, cream: null, water: null };
  let fruitM = null;
  O.setCarryProps = (sackKind, fruitN) => {
    for (const kind of ['beans', 'kibble', 'cream', 'water']) {
      const on = sackKind === kind;
      if (on && !sackByKind[kind]) { sackByKind[kind] = sackMesh(kind); sackByKind[kind].position.set(0, 0.1, 0); stack.add(sackByKind[kind]); }
      if (sackByKind[kind]) sackByKind[kind].visible = on;
    }
    const hasFruit = fruitN > 0;
    if (hasFruit && !fruitM) { fruitM = fruitMesh(); fruitM.position.set(0, 0.1, 0); stack.add(fruitM); }
    if (fruitM) fruitM.visible = hasFruit;
    H.setCarry(O.items.length > 0 || sackKind != null || hasFruit ? Math.max(1, O.items.length) : 0);
  };
  O.tap = () => H.tap(); // M3 T3: the register "cha-ching" arm bump — see human.js's H.tap
  O.update = (dt, vx, vz) => {
    H.update(dt, vx, vz);
    // stack sway: lags the velocity in the owner's local frame
    const lx = Math.cos(-group.rotation.y) * vx - Math.sin(-group.rotation.y) * vz, lz = Math.sin(-group.rotation.y) * vx + Math.cos(-group.rotation.y) * vz;
    O._sway.x = damp(O._sway.x, -lx * 0.06, 8, dt); O._sway.z = damp(O._sway.z, -lz * 0.06, 8, dt);
    O._bob = Math.max(0, O._bob - dt * 4);
    // ONE sway, on the tray, not one per item multiplied by its index. The tray tilts into the turn
    // the way a held board does; the things on it stay where they were put.
    tray.visible = O.items.length > 0;
    swayTray(stack, O._sway.x, O._sway.z);
    layoutTray(O.items, O._bob);
    for (const m of O.items) { const s = m.scale.x; if (s < 1) m.scale.setScalar(Math.min(1, s + dt * 8)); }
  };
  return O;
}
