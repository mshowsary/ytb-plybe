// src/render/owner.js — café owner: a human (role 'owner') carrying the stack at chest height, arms forward.
import { createHuman } from './human.js';
import { C } from './palette.js';
import { damp } from '../core/tween.js';
import { sackMesh, fruitMesh } from './props.js';

export function createOwner(shirtHex = C.coral) {
  const H = createHuman({ shirt: shirtHex, hair: 0, skin: 0 }, 'owner');
  const { group, stack } = H;
  const O = { group, items: [], H, headTop: 2.2, _sway: { x: 0, z: 0 }, _bob: 0 };
  O.addItem = m => { m.position.set(0, O.items.length * 0.17, 0); m.scale.setScalar(0.01); stack.add(m); O.items.push(m); O._bob = 1; H.setCarry(O.items.length); };
  O.popItem = () => { const m = O.items.pop(); if (m) stack.remove(m); H.setCarry(O.items.length); return m; };
  // Loop v2 Task 1: the return crate empties the whole product stack at once — pop every mesh off
  // (not just splice the array) so nothing is left orphaned, still parented to the stack, on stage.
  O.clearItems = () => { while (O.items.length) O.popItem(); };
  // Task 4: a sack (beans/kibble) or a fruit basket rides the stack the same as product items —
  // built once each, lazily, and just toggled visible (never both/product items at once, per the
  // carry-slot rules in src/sim/carry.js, so there's never a stacking-order question to solve).
  const sackByKind = { beans: null, kibble: null };
  let fruitM = null;
  O.setCarryProps = (sackKind, fruitN) => {
    for (const kind of ['beans', 'kibble']) {
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
    for (let i = 0; i < O.items.length; i++) { const m = O.items[i]; const k = i + 1;
      m.position.x = O._sway.x * k; m.position.z = O._sway.z * k; m.position.y = i * 0.17 + Math.sin(O._bob * Math.PI) * 0.06 * (i === O.items.length - 1 ? 1 : 0);
      m.rotation.z = O._sway.x * 1.5; m.rotation.x = -O._sway.z * 1.5;
      const s = m.scale.x; if (s < 1) m.scale.setScalar(Math.min(1, s + dt * 8)); }
  };
  return O;
}
