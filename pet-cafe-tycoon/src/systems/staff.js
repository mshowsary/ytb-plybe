// src/systems/staff.js — spawns runner/cashier renders to mirror G.staff counts, steps the
// pure staff sim, renders carried items, and owns Task 33's one-time first-hire demonstration.
import * as THREE from 'three';
import { stepStaff, createStaff as createStaffSim } from '../sim/staff.js';
import { staffLevelsWithRushCrew } from '../sim/rushCrew.js';
import { snapshotStaffState } from '../sim/staffState.js';
import { nextStaffDemoJob, STAFF_DEMO_SECONDS, STAFF_DEMO_MECHANICS } from '../sim/staffTeaching.js';
import { createHuman } from '../render/human.js';
import { itemFor } from '../render/props.js';
import { C } from '../render/palette.js';

const RUNNER_VARIANT = { shirt: 1, hair: 1, skin: 1 };
const CASHIER_VARIANT = { shirt: 4, hair: 2, skin: 0 };
const CLEANER_VARIANT = { shirt: 3, hair: 3, skin: 2 };
const RUNNER_SPAWN = { x: 4, z: -3 };
const CASHIER_FALLBACK = { x: -4, z: -0.2 };
const CLEANER_SPAWN = { x: -6, z: 4 };

function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

function createStaffDemoVisual(scene) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const ringMat = new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: .68, depthWrite: false, toneMapped: false });
  const dotMat = new THREE.MeshBasicMaterial({ color: C.cream, transparent: true, opacity: .92, depthWrite: false, toneMapped: false });
  const ringGeo = new THREE.RingGeometry(.38, .49, 32);
  const workerRing = new THREE.Mesh(ringGeo, ringMat); workerRing.rotation.x = -Math.PI / 2; workerRing.renderOrder = 7; group.add(workerRing);
  const targetRing = new THREE.Mesh(ringGeo, ringMat.clone()); targetRing.rotation.x = -Math.PI / 2; targetRing.renderOrder = 7; group.add(targetRing);
  const dots = [];
  const dotGeo = new THREE.SphereGeometry(.055, 8, 6);
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat.clone()); dot.renderOrder = 8; group.add(dot); dots.push(dot);
  }
  const beacon = new THREE.Mesh(new THREE.ConeGeometry(.13, .28, 12), ringMat.clone());
  beacon.rotation.z = Math.PI; beacon.renderOrder = 8; group.add(beacon);

  function hide() { group.visible = false; }
  function show(worker, target, elapsed) {
    if (!worker || !target) { hide(); return; }
    group.visible = true;
    const motion = !reducedMotion();
    const pulse = motion ? 1 + Math.sin(elapsed * Math.PI * 4) * .08 : 1;
    workerRing.position.set(worker.x, .025, worker.z); workerRing.scale.setScalar(pulse);
    targetRing.position.set(target.x, .025, target.z); targetRing.scale.setScalar(2 - pulse);
    beacon.position.set(target.x, motion ? .88 + Math.sin(elapsed * Math.PI * 3) * .08 : .88, target.z);
    const dx = target.x - worker.x, dz = target.z - worker.z;
    for (let i = 0; i < dots.length; i++) {
      const phase = ((elapsed * .62) + i / dots.length) % 1;
      const p = motion ? phase : (i + 1) / (dots.length + 1);
      dots[i].position.set(worker.x + dx * p, .16 + (motion ? Math.sin(p * Math.PI) * .16 : .09), worker.z + dz * p);
      dots[i].scale.setScalar(motion ? .76 + Math.sin((elapsed + i * .13) * Math.PI * 3) * .16 : .82);
    }
  }
  return { group, show, hide };
}

export function createStaff(G, S, ctx) {
  const { world, scene, hud, fx, audio } = ctx;
  const rec = new Map(); // sim staff object -> { human, itemMeshes, px, pz }
  const rushLevelScratch = { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };
  const demoVisual = createStaffDemoVisual(scene);
  let activeDemo = null;
  let snapshotWrapped = false;
  let assignmentSignature = null;

  function ensureSnapshotIncludesStaffChoices() {
    if (snapshotWrapped || typeof G.snapshot !== 'function') return;
    const baseSnapshot = G.snapshot;
    G.snapshot = () => {
      const save = baseSnapshot();
      save.staffState = snapshotStaffState(G.staffList, world);
      return save;
    };
    snapshotWrapped = true;
  }

  function assignmentSig() {
    return (G.staffList || []).filter(s => s.kind === 'runner').map(s => s.assign || '').join('|');
  }

  function spawnRunner() {
    let index = 0;
    for (const s of G.staffList) if (s.kind === 'runner') index++;
    const savedAssign = G.staffState && Array.isArray(G.staffState.runnerAssignments)
      ? G.staffState.runnerAssignments[index] || null
      : null;
    const s = createStaffSim('runner', RUNNER_SPAWN, savedAssign); G.staffList.push(s);
    const human = createHuman(RUNNER_VARIANT, 'runner'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z });
  }
  function spawnCashier() {
    const co = world.stations.get('register1');
    const spawn = co ? co.cash : CASHIER_FALLBACK;
    const s = createStaffSim('cashier', spawn); G.staffList.push(s);
    const human = createHuman(CASHIER_VARIANT, 'cashier'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z });
  }
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

  function demonstratedSet() {
    const out = new Set();
    const coach = G.interactionCoach;
    if (!coach) return out;
    for (const key of Object.values(STAFF_DEMO_MECHANICS)) if (coach.hasProven(key)) out.add(key);
    return out;
  }

  function stepFirstHireDemo(dt) {
    const coach = G.interactionCoach;
    if (!coach) { demoVisual.hide(); return; }
    if (!activeDemo) {
      const job = nextStaffDemoJob(G.staffList, world, demonstratedSet());
      if (!job) { demoVisual.hide(); return; }
      // Capture the genuine target only after the simulation assigned this worker the chore. From
      // here on presentation observes; it never writes worker.state/target/items/mover fields.
      activeDemo = { ...job, t: 0 };
      fx.burst(job.worker.x, .7, job.worker.z, C.accent, 7);
    }
    activeDemo.t += Math.max(0, dt);
    const target = world.stations.get(activeDemo.targetId);
    if (!target || !target.active || !rec.has(activeDemo.worker)) {
      activeDemo = null; demoVisual.hide(); return;
    }
    demoVisual.show(activeDemo.worker, activeDemo.targetPoint, activeDemo.t);
    if (activeDemo.t < STAFF_DEMO_SECONDS) return;
    const mechanic = activeDemo.mechanic;
    const p = activeDemo.targetPoint;
    demoVisual.hide(); activeDemo = null;
    fx.burst(p.x, .72, p.z, C.accent, 9);
    coach.mark(mechanic); // proof is written only after the full visible demonstration completed.
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('staff-role-demonstrated');
  }

  function teardown() {
    for (const r of rec.values()) scene.remove(r.human.group);
    rec.clear();
    assignmentSignature = null;
    activeDemo = null; demoVisual.hide();
  }

  ctx.tapCashier = checkoutId => {
    for (const s of G.staffList) if (s.kind === 'cashier' && s.target === checkoutId) { const r = rec.get(s); if (r) r.human.tap(); }
  };

  return {
    teardown,
    prepare() {
      ensureSnapshotIncludesStaffChoices();
      let runners = 0, cashiers = 0, cleaners = 0;
      for (const s of G.staffList) { if (s.kind === 'runner') runners++; else if (s.kind === 'cashier') cashiers++; else if (s.kind === 'cleaner') cleaners++; }
      if (runners < (G.staff.runner | 0)) spawnRunner();
      if (cashiers < (G.staff.cashier | 0)) spawnCashier();
      if (cleaners < (G.staff.cleaner | 0)) spawnCleaner();

      const sig = assignmentSig();
      if (assignmentSignature !== null && sig !== assignmentSignature && typeof G.requestCheckpoint === 'function') {
        G.requestCheckpoint('runner-assignment');
      }
      assignmentSignature = sig;
    },
    update(dt) {
      const effectiveLevels = staffLevelsWithRushCrew(G.staffLevels, G.boosts, G.dayState, rushLevelScratch);
      stepStaff(G.staffList, world, dt, onCollect, effectiveLevels, G.customers);

      for (const s of G.staffList) {
        const r = rec.get(s); if (!r) continue;
        const safeDt = Math.max(dt, 1e-4);
        const vx = (s.x - r.px) / safeDt, vz = (s.z - r.pz) / safeDt;
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
      stepFirstHireDemo(dt);
    },
  };
}
