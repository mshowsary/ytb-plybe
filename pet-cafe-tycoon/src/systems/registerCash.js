// Countertop register-cash presentation. Money is represented by the physical till stack only;
// the exact amount appears as a brief +number when collected, not as permanent text over gameplay.
import * as THREE from 'three';

const BILL_MAX = 24;
const COIN_MAX = 12;

// Where a pile sits and how big it is drawn. A register's tray sits on the till top. The garden
// stand's cash jar (a self-serve display, sim/world.js) sits on the counter top at the END of the
// row of cones, at a little over half size so it reads as a tip jar rather than a till. On the END,
// not the back strip behind the cones: there it was real money the camera could not see, tucked
// behind the counter's own glass (probe shot, 2026-09-19). A TABLE's pile is the tip a photographed
// pet leaves (src/sim/petPose.js): a small saucer of coins on the tabletop, on the far side from
// the chair so the guest's own body never hides it.
const STAND_SCALE = 0.55, STAND_TOP_Y = 1.12, STAND_END_X = 1.0;
const SEAT_SCALE = 0.52, SEAT_TOP_Y = 0.77, SEAT_LOCAL_X = -0.24, SEAT_LOCAL_Z = -0.22;
function placement(st) {
  if (st.type === 'checkout') return { x: st.x, y: 1.115, z: st.z, scale: 1 };
  // The stack's own tray is drawn at local (-0.38, 0.04); offset the group so the scaled tray lands
  // on the spot we want in the station's own frame (same rotation convention as sim/world.js).
  const scale = st.type === 'seat' ? SEAT_SCALE : STAND_SCALE;
  const targetX = st.type === 'seat' ? SEAT_LOCAL_X : STAND_END_X;
  const targetZ = st.type === 'seat' ? SEAT_LOCAL_Z : 0;
  const lx = targetX + 0.38 * scale, lz = targetZ - 0.04 * scale;
  const s = Math.sin(st.rot || 0), c = Math.cos(st.rot || 0);
  return { x: st.x + lx * c + lz * s, y: st.type === 'seat' ? SEAT_TOP_Y : STAND_TOP_Y, z: st.z - lx * s + lz * c, scale };
}

// Where the money a station holds is DRAWN, for anything that has to aim at it. The collect spot
// (sim/world.js st.cash) is where the OWNER stands, which for the garden stand is 1.7 m away behind
// the counter: a coin arc from there flew up out of the owner's own feet instead of out of the jar.
export function cashVisualSpot(st) {
  if (!st) return null;
  const at = placement(st);
  return { x: at.x, y: at.y, z: at.z };
}

function makeRegisterStack(st) {
  const group = new THREE.Group();
  group.name = 'registerCash';   // sits ON the till by design; named so audits can tell it from a clip
  const at = placement(st);
  group.position.set(at.x, at.y, at.z);
  group.rotation.y = st.rot || 0;
  group.visible = false;
  const baseScale = at.scale;

  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.045, 0.46),
    new THREE.MeshToonMaterial({ color: new THREE.Color('#D3A348') }),
  );
  // No sun shadow on any of the money: a drawer, a wad of notes and a coin stack on a counter top
  // throw shadows a couple of pixels wide that the counter's own already swallows, and each one is
  // an extra shadow-pass draw per till, per tipped table and per garden jar (Batch G's budget pass).
  tray.position.set(-0.38, 0, 0.04); tray.receiveShadow = true; group.add(tray);
  const trayInset = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.025, 0.36),
    new THREE.MeshToonMaterial({ color: new THREE.Color('#44342C') }),
  );
  trayInset.position.set(-0.38, 0.03, 0.04); trayInset.receiveShadow = true; group.add(trayInset);

  const billGeo = new THREE.BoxGeometry(0.27, 0.018, 0.14);
  const billMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#78C997') });
  const bills = new THREE.InstancedMesh(billGeo, billMat, BILL_MAX); bills.castShadow = false; bills.count = 0; group.add(bills);

  const coinGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.018, 12);
  const coinMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#FFD34E') });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, COIN_MAX); coins.castShadow = false; coins.count = 0; group.add(coins);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const e = new THREE.Euler();
  let lastAmount = -1;

  function setAmount(amount) {
    amount = Math.max(0, Math.round(amount || 0));
    if (amount === lastAmount) return false;
    const grew = amount > lastAmount && lastAmount >= 0;
    lastAmount = amount;
    group.visible = amount > 0;
    if (!amount) { bills.count = 0; coins.count = 0; return grew; }

    // Logarithmic visual growth keeps the stack compact even when a register is very full.
    const billCount = Math.min(BILL_MAX, Math.max(2, Math.ceil(Math.log2(amount + 1) * 2.25)));
    const coinCount = Math.min(COIN_MAX, Math.max(1, Math.ceil(Math.log10(amount + 1) * 2.4)));
    for (let i = 0; i < billCount; i++) {
      const stack = i % 3;
      const layer = Math.floor(i / 3);
      p.set(-0.59 + stack * 0.21, 0.065 + layer * 0.019, -0.005 + (stack & 1) * 0.045);
      e.set(0, ((i * 37) % 9 - 4) * 0.018, 0); q.setFromEuler(e); m.compose(p, q, sc); bills.setMatrixAt(i, m);
    }
    bills.count = billCount; bills.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < coinCount; i++) {
      const col = i % 3, layer = Math.floor(i / 3);
      p.set(-0.18 + col * 0.10, 0.07 + layer * 0.02, 0.11 - (col & 1) * 0.08);
      e.set(Math.PI / 2, 0, 0); q.setFromEuler(e); m.compose(p, q, sc); coins.setMatrixAt(i, m);
    }
    coins.count = coinCount; coins.instanceMatrix.needsUpdate = true;
    return grew;
  }

  group.scale.setScalar(baseScale);
  return { group, setAmount, lastPulse: 0, baseScale };
}

export function createRegisterCash(G, S, ctx) {
  const { world, scene, vis, els } = ctx;
  const records = new Map();

  // The old visuals system still owns a legacy floor pile for compatibility; disable it here.
  for (const st of world.stations.values()) {
    if (st.type !== 'checkout' && st.type !== 'seat' && !st.selfServe) continue;
    const legacy = vis.get(st.id); if (legacy && legacy.pile) legacy.pile.visible = false;
    const rec = makeRegisterStack(st); scene.add(rec.group);
    records.set(st.id, { ...rec, amount: -1, st });
  }

  // No DOM cash labels: the physical money stack is the cue and collection is automatic.
  for (const el of els.fx.querySelectorAll('.cash-tray-badge,.register-money-badge')) el.remove();

  return {
    syncAll() {
      // Restore must make the physical till agree immediately, even if the host pauses on the same
      // frame as load. Waiting for a later update() left restored cash numerically correct but
      // temporarily invisible in the exact resume frame.
      for (const rec of records.values()) {
        rec.amount = rec.st.pile;
        rec.setAmount(rec.st.pile);
        rec.group.visible = rec.st.active && rec.st.pile > 0;
        rec.lastPulse = 0;
        rec.group.scale.setScalar(rec.baseScale);
      }
    },
    update(dt) {
      for (const rec of records.values()) {
        const st = rec.st;
        rec.group.visible = st.active && st.pile > 0;
        if (st.pile !== rec.amount) {
          const grew = rec.setAmount(st.pile); rec.amount = st.pile;
          if (grew && st.pile > 0) rec.lastPulse = 0.22;
        }
        if (!st.active || st.pile <= 0) continue;
        if (rec.lastPulse > 0) {
          rec.lastPulse = Math.max(0, rec.lastPulse - dt);
          const s = 1 + Math.sin((0.22 - rec.lastPulse) * 24) * rec.lastPulse * 0.22;
          rec.group.scale.setScalar(s * rec.baseScale);
        } else rec.group.scale.setScalar(rec.baseScale);
      }
    },
  };
}