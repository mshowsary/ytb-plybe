// src/systems/decor.js — puts owned décor into the scene and pops a newly bought piece in.
//
// The scene contents are a pure function of `G.meta.decor`: install() diffs the owned-id list every
// frame-ish call and adds what is missing. That means a restore, an undo, a rebuild or a live
// purchase all converge on the same room without any bespoke "apply save" path, and nothing here
// can drift out of sync with the wallet.
//
// The reveal is a deterministic scale/lift curve driven by dt — no Math.random, no timers, no
// visibility hooks — so screenshots and the headless replay stay stable.
import { DECOR_BY_ID, decorUnlocked } from '../../data/decor.js';
import { decorMesh } from '../render/decor.js';

const POP_SECONDS = 0.55;
// Overshoot then settle: 0 -> ~1.12 -> 1. Cheap, readable, and it never leaves the object scaled.
function popScale(t) {
  if (t >= 1) return 1;
  const e = 1 - Math.pow(1 - t, 3);
  return 0.25 + e * 0.75 + Math.sin(Math.min(1, t) * Math.PI) * 0.12;
}

function ownedList(G) {
  const list = G && G.meta && G.meta.decor;
  return Array.isArray(list) ? list : [];
}

export function install(G, scene, world = null) {
  const live = new Map();   // id -> { obj, t }  (t < POP_SECONDS while still popping in)
  let popping = 0;
  let lastOwnedCount = -1;

  const builtSet = () => (world && world.built) || (G && G.world && G.world.built) || null;

  function add(id, animate) {
    const item = DECOR_BY_ID.get(id);
    // A tampered save, or a terrace piece whose zone does not exist yet, adds nothing at all.
    if (!item || live.has(id) || !decorUnlocked(item, builtSet())) return null;
    const obj = decorMesh(id);
    if (!obj) return null;
    scene.add(obj);
    const entry = { obj, t: animate ? 0 : POP_SECONDS, baseY: obj.position.y };
    if (animate) { obj.scale.setScalar(popScale(0)); popping++; }
    live.set(id, entry);
    return entry;
  }

  function remove(id) {
    const entry = live.get(id);
    if (!entry) return;
    scene.remove(entry.obj);
    if (entry.t < POP_SECONDS) popping--;
    live.delete(id);
  }

  // Adds anything newly owned (with a pop) and drops anything no longer owned. `silent` places the
  // starting set instantly, which is what a restore or the first frame wants.
  function sync(silent = false) {
    const owned = ownedList(G);
    const wanted = new Set();
    for (const id of owned) {
      wanted.add(id);
      if (!live.has(id)) add(id, !silent);
    }
    for (const id of [...live.keys()]) if (!wanted.has(id)) remove(id);
  }

  function update(dt) {
    // Self-driving: the owned list is the only input, so a purchase (or a restore) is picked up
    // here without the buy site having to remember to call reveal(). One integer compare a frame.
    const owned = ownedList(G).length;
    if (owned !== lastOwnedCount) { lastOwnedCount = owned; sync(); }
    if (popping <= 0) return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    for (const entry of live.values()) {
      if (entry.t >= POP_SECONDS) continue;
      entry.t = Math.min(POP_SECONDS, entry.t + step);
      const k = entry.t / POP_SECONDS;
      entry.obj.scale.setScalar(popScale(k));
      entry.obj.position.y = entry.baseY + (1 - k) * 0.12;
      if (entry.t >= POP_SECONDS) {
        entry.obj.scale.setScalar(1);
        entry.obj.position.y = entry.baseY;
        popping--;
      }
    }
  }

  // Called right after economy.buyDecor succeeds: the piece appears with the pop.
  function reveal(id) {
    sync();
    lastOwnedCount = ownedList(G).length;
    return live.has(id);
  }

  function dispose() {
    for (const id of [...live.keys()]) remove(id);
  }

  sync(true);
  lastOwnedCount = ownedList(G).length;

  return {
    update, sync, reveal, dispose,
    has: id => live.has(id),
    get count() { return live.size; },
    get animating() { return popping > 0; },
  };
}

export default install;
