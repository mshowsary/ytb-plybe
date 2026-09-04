// src/systems/staff.js — spawns runner/cashier renders to mirror G.staff counts, steps the
// pure staff sim, and renders a runner's chest-carried items by reusing the human stack.
import { stepStaff, createStaff as createStaffSim } from '../sim/staff.js';
import { staffLevelsWithRushCrew } from '../sim/rushCrew.js';
import { createHuman } from '../render/human.js';
import { itemFor } from '../render/props.js';

const RUNNER_VARIANT = { shirt: 1, hair: 1, skin: 1 };
const CASHIER_VARIANT = { shirt: 4, hair: 2, skin: 0 };
const CLEANER_VARIANT = { shirt: 3, hair: 3, skin: 2 };
const RUNNER_SPAWN = { x: 4, z: -3 };
const CASHIER_FALLBACK = { x: -4, z: -0.2 };
// Task 4: near the seat row (data/area1.js's z 6.0 row) — the cleaner's actual work zone —
// matching test/nav-fullhouse.test.js's own choice of cleaner spawn point.
const CLEANER_SPAWN = { x: -6, z: 4 };

export function createStaff(G, S, ctx) {
  const { world, scene, hud, fx, audio } = ctx;
  const rec = new Map(); // sim staff object -> { human, itemMeshes, px, pz }
  // Reused only while a rush boost is active. `staffLevelsWithRushCrew` returns G.staffLevels
  // directly on the normal path, so this adds no per-frame object churn to ordinary play.
  const rushLevelScratch = { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };

  function spawnRunner() {
    const s = createStaffSim('runner', RUNNER_SPAWN); G.staffList.push(s);
    const human = createHuman(RUNNER_VARIANT, 'runner'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z });
  }
  function spawnCashier() {
    const co = world.stations.get('register1');
    const spawn = co ? co.cash : CASHIER_FALLBACK; // I11: stand at the cash spot, not the pay-front
    const s = createStaffSim('cashier', spawn); G.staffList.push(s);
    const human = createHuman(CASHIER_VARIANT, 'cashier'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z });
  }
  // Task 4: mirrors spawnRunner/spawnCashier — without this a hired cleaner would spend the
  // player's coins but never actually exist as a sim entity (G.staffList is only ever populated
  // here) or have a body on screen.
  function spawnCleaner() {
    const s = createStaffSim('cleaner', CLEANER_SPAWN); G.staffList.push(s);
    const human = createHuman(CLEANER_VARIANT, 'cleaner'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z });
  }
  function onCollect(amount, x, z) {
    G.coins += amount; G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amount; hud.setCoins(G.coins);
    fx.coinArc(x, 0.3, z, Math.min(10, 2 + amount / 5 | 0), () => hud.bump());
    audio.play('coin');
  }

  // C2: called from G.restore to clear every runner/cashier mesh before staff counts are re-derived.
  function teardown() {
    for (const r of rec.values()) scene.remove(r.human.group);
    rec.clear();
  }

  // M3 T3: the register "cha-ching" arm-tap for a cashier — systems/customers.js calls this
  // (via ctx.tapCashier) on a 'processed' event whose `by` is 'cashier', matching the checkout
  // the sim credited to whichever cashier mover is actually stationed there.
  ctx.tapCashier = checkoutId => {
    for (const s of G.staffList) if (s.kind === 'cashier' && s.target === checkoutId) { const r = rec.get(s); if (r) r.human.tap(); }
  };

  return {
    teardown,
    update(dt) {
      let runners = 0, cashiers = 0, cleaners = 0;
      for (const s of G.staffList) { if (s.kind === 'runner') runners++; else if (s.kind === 'cashier') cashiers++; else if (s.kind === 'cleaner') cleaners++; }
      if (runners < (G.staff.runner | 0)) spawnRunner();
      if (cashiers < (G.staff.cashier | 0)) spawnCashier();
      if (cleaners < (G.staff.cleaner | 0)) spawnCleaner();

      // M3 T6: pass G.customers so a hired runner prefers restocking whatever a genuinely stuck
      // customer is waiting on. A future rewarded Rush Crew activation may lend the selected role
      // one EXISTING upgrade tier for this rush only; no active boost means this is G.staffLevels
      // itself and simulation behaviour remains exactly the permanent-upgrade path.
      const effectiveLevels = staffLevelsWithRushCrew(G.staffLevels, G.boosts, G.dayState, rushLevelScratch);
      stepStaff(G.staffList, world, dt, onCollect, effectiveLevels, G.customers);
      // M3 T2: staff now walk the grid — no push-out here, the sim already resolves positions.

      for (const s of G.staffList) {
        const r = rec.get(s); if (!r) continue;
        const vx = (s.x - r.px) / dt, vz = (s.z - r.pz) / dt;
        r.human.group.position.set(s.x, 0, s.z); r.human.update(dt, vx, vz);
        r.px = s.x; r.pz = s.z;
        if (s.kind === 'runner') {
          while (r.itemMeshes.length < s.items.length) {
            const key = s.items[r.itemMeshes.length]; const m = itemFor(key);
            m.position.set(0, r.itemMeshes.length * 0.17, 0); r.human.stack.add(m); r.itemMeshes.push(m);
          }
          while (r.itemMeshes.length > s.items.length) { const m = r.itemMeshes.pop(); r.human.stack.remove(m); }
          r.human.setCarry(r.itemMeshes.length);
        }
      }
    },
  };
}
