// src/systems/staff.js — spawns runner/cashier renders to mirror G.staff counts, steps the
// pure staff sim, renders carried items, and owns Task 33's one-time first-hire demonstration.
import * as THREE from 'three';
import { stepStaff, createStaff as createStaffSim } from '../sim/staff.js';
import { snapshotStaffState, photographerSpawnAllowed } from '../sim/staffState.js';
import { nextStaffDemoJob, STAFF_DEMO_SECONDS, STAFF_DEMO_MECHANICS } from '../sim/staffTeaching.js';
import { createHuman } from '../render/human.js';
import { runnerApronMesh } from '../render/barista.js';
import { PRODUCTS } from '../sim/economyConfig.js';
import { familyOf } from '../sim/economy.js';

const COFFEE_FAMILY = familyOf('coffee');
import { syncCarriedItems } from '../render/carriedItems.js';
import { C } from '../render/palette.js';

const RUNNER_VARIANT = { shirt: 1, hair: 1, skin: 1 };
const CASHIER_VARIANT = { shirt: 4, hair: 2, skin: 0 };
const CLEANER_VARIANT = { shirt: 3, hair: 3, skin: 2 };
const PHOTOGRAPHER_VARIANT = { shirt: 2, hair: 0, skin: 1 };
// A new hire ARRIVES. Every role used to appear on the spot it works at — and the cashier's spot is
// the till itself, so hiring one made a full-size person materialise against the register and step
// out of it, which is the owner's playtest report ("the register gets the cashier from the inside to
// outside"). Spawning at the café door and letting them walk to their post costs nothing, reads as
// somebody starting a shift, and removes the pop-in for all three roles at once. Mirrored verbatim
// in tools/bot.js so the headless economy measures the same walk.
const HIRE_SPAWN = { x: -9.0, z: 4.2 };
const RUNNER_SPAWN = HIRE_SPAWN;
const CASHIER_FALLBACK = HIRE_SPAWN;
const CLEANER_SPAWN = HIRE_SPAWN;
// The Photographer is hired at the staff desk like everyone else, so it arrives the same way.
const PHOTOGRAPHER_SPAWN = HIRE_SPAWN;
// Program §6.3: how long one H.wipe call keeps the cleaner's arm sweeping. Refreshed every frame
// the sim says 'cleaning', so this is really the tail after the seat is done, not the stroke
// length — long enough to finish the stroke in progress, short enough that the arm is back at
// rest before the worker has walked anywhere.
const CLEAN_WIPE_WINDOW = 0.35;

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

  // Every runner has a line.
  //
  // A runner hired from the desk used to start with no assignment at all, which in sim/staff.js
  // means "service every counter by whichever is neediest this instant" — correct behaviour, and
  // completely illegible from the outside. The owner's day-18 report: "the first Runner I hire,
  // with no assignment, fills the cookies, cupcakes, smoothies, coffee, maybe ice cream too."
  // Nothing on screen said why it went where it went, so it read as a worker running in circles.
  //
  // Every runner is given a lane now — a different one each, in counter order, so hiring the second
  // runner visibly opens a second lane rather than doubling up on the first. The assignment stays a
  // priority, not a cage (sim/staff.js pickSource): a runner whose own counter is topped up still
  // helps the neediest lane, then walks back to its own counter to wait. What the player gets is a
  // worker wearing their lane's colour, waiting at their own counter.
  //
  // Only ever fills a BLANK or now-impossible assignment. A player who deliberately puts two
  // runners on cupcakes keeps both of them there.
  function reconcileRunnerLanes() {
    const runners = (G.staffList || []).filter(s => s.kind === 'runner');
    if (!runners.length) return;
    const lanes = (world.displays || []).map(id => world.stations.get(id))
      .filter(st => st && st.active && !(world.baristaOnDuty && familyOf(st.product) === COFFEE_FAMILY));
    if (!lanes.length) return;
    const held = new Set();
    for (const s of runners) {
      const cur = s.assign ? world.stations.get(s.assign) : null;
      if (cur && lanes.includes(cur)) held.add(cur.id); else s.assign = null;
    }
    for (const s of runners) {
      if (s.assign) continue;
      const free = lanes.find(d => !held.has(d.id));
      const lane = free || lanes[0];
      s.assign = lane.id; held.add(lane.id);
    }
  }

  // Batch 8 item 4: every worker gets the same following contact shadow a guest's human does.
  function shadowFor(group) {
    return S.contactShadows && S.contactShadows.add(group, { radius: 0.44, strength: 1.0, follow: true });
  }
  function spawnRunner() {
    let index = 0;
    for (const s of G.staffList) if (s.kind === 'runner') index++;
    const savedAssign = G.staffState && Array.isArray(G.staffState.runnerAssignments)
      ? G.staffState.runnerAssignments[index] || null
      : null;
    const s = createStaffSim('runner', RUNNER_SPAWN, savedAssign); G.staffList.push(s);
    const human = createHuman(RUNNER_VARIANT, 'runner'); scene.add(human.group);
    // The line badge: this runner wears the colour of the counter it looks after. See
    // render/barista.js runnerApronMesh.
    const apron = runnerApronMesh(); human.group.add(apron);
    rec.set(s, { human, apron, apronKey: null, itemMeshes: [], px: s.x, pz: s.z, shadow: shadowFor(human.group) });
  }
  function spawnCashier() {
    // Walks in from the door like the others, then stepCashier sends it to its till.
    const spawn = CASHIER_FALLBACK;
    const s = createStaffSim('cashier', spawn); G.staffList.push(s);
    const human = createHuman(CASHIER_VARIANT, 'cashier'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z, shadow: shadowFor(human.group) });
  }
  function spawnCleaner() {
    const s = createStaffSim('cleaner', CLEANER_SPAWN); G.staffList.push(s);
    const human = createHuman(CLEANER_VARIANT, 'cleaner'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z, shadow: shadowFor(human.group) });
  }
  // Walks in from the door and on to the photo booth (sim/staff.js stepPhotographer).
  function spawnPhotographer() {
    const s = createStaffSim('photographer', PHOTOGRAPHER_SPAWN); G.staffList.push(s);
    const human = createHuman(PHOTOGRAPHER_VARIANT, 'photographer'); scene.add(human.group);
    rec.set(s, { human, itemMeshes: [], px: s.x, pz: s.z, shadow: shadowFor(human.group) });
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
    for (const r of rec.values()) { scene.remove(r.human.group); if (S.contactShadows) S.contactShadows.remove(r.shadow); }
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
      let runners = 0, cashiers = 0, cleaners = 0, photographers = 0;
      for (const s of G.staffList) { if (s.kind === 'runner') runners++; else if (s.kind === 'cashier') cashiers++; else if (s.kind === 'cleaner') cleaners++; else if (s.kind === 'photographer') photographers++; }
      if (runners < (G.staff.runner | 0)) spawnRunner();
      if (cashiers < (G.staff.cashier | 0)) spawnCashier();
      if (cleaners < (G.staff.cleaner | 0)) spawnCleaner();
      // photographerSpawnAllowed: a save whose staff.photographer count outruns its own builds
      // (see staffState.js's own comment) never materialises a worker with no home station.
      if (photographers < (G.staff.photographer | 0) && photographerSpawnAllowed(world.built)) spawnPhotographer();

      // The Barista owns the coffee lane while one is on staff (sim/staff.js baristaLane). Read
      // from the payroll rather than from the render worker, so it is true from the frame the hire
      // is paid for, and so a headless caller that never sets it simply has no barista.
      world.baristaOnDuty = (G.staff.barista | 0) > 0;
      reconcileRunnerLanes();

      const sig = assignmentSig();
      if (assignmentSignature !== null && sig !== assignmentSignature && typeof G.requestCheckpoint === 'function') {
        G.requestCheckpoint('runner-assignment');
      }
      assignmentSignature = sig;
    },
    update(dt) {
      // The Rush Crew boost ("your Cashier borrows +1 Speed tier until Rush ends") went with the
      // dead ad placements in Batch E2, so the authored levels ARE the effective levels: one list,
      // no per-frame scratch copy, and a worker's speed is now only ever what the player bought.
      stepStaff(G.staffList, world, dt, onCollect, G.staffLevels, G.customers);

      for (const s of G.staffList) {
        const r = rec.get(s); if (!r) continue;
        const safeDt = Math.max(dt, 1e-4);
        const vx = (s.x - r.px) / safeDt, vz = (s.z - r.pz) / safeDt;
        if (!r.human.onStep) r.human.onStep = pos => fx.dust(pos.x, pos.z, 0.8);
        r.human.group.position.set(s.x, 0, s.z); r.human.update(dt, vx, vz);
        r.px = s.x; r.pz = s.z;
        if (s.kind === 'runner') {
          syncCarriedItems(r.human.stack, r.itemMeshes, s.items);
          r.human.setCarry(r.itemMeshes.length);
          // Recoloured only when the assignment actually changes.
          const assigned = s.assign ? world.stations.get(s.assign) : null;
          const key = assigned && assigned.active ? assigned.product : '';
          if (r.apron && r.apronKey !== key) {
            r.apronKey = key;
            r.apron.setColor(key && PRODUCTS[key] ? PRODUCTS[key].color : '#FFF3E2');
          }
        }
        // Program §6.3: the cleaner's arm actually wipes while the simulation says it is cleaning.
        // Presentation only — it reads s.state and never writes to the worker.
        if (s.kind === 'cleaner' && s.state === 'cleaning' && r.human.wipe) r.human.wipe(CLEAN_WIPE_WINDOW);
      }
      stepFirstHireDemo(dt);
    },
  };
}
