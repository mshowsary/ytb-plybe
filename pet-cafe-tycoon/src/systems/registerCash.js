// Countertop register-cash presentation. Money is represented by the physical till stack only;
// the exact amount appears as a brief +number when collected, not as permanent text over gameplay.
import * as THREE from 'three';

const BILL_MAX = 24;
const COIN_MAX = 12;

function makeRegisterStack(st) {
  const group = new THREE.Group();
  group.position.set(st.x, 1.115, st.z);
  group.rotation.y = st.rot || 0;
  group.visible = false;

  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.045, 0.46),
    new THREE.MeshToonMaterial({ color: new THREE.Color('#D3A348') }),
  );
  tray.position.set(-0.38, 0, 0.04); tray.castShadow = true; tray.receiveShadow = true; group.add(tray);
  const trayInset = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.025, 0.36),
    new THREE.MeshToonMaterial({ color: new THREE.Color('#44342C') }),
  );
  trayInset.position.set(-0.38, 0.03, 0.04); trayInset.receiveShadow = true; group.add(trayInset);

  const billGeo = new THREE.BoxGeometry(0.27, 0.018, 0.14);
  const billMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#78C997') });
  const bills = new THREE.InstancedMesh(billGeo, billMat, BILL_MAX); bills.castShadow = true; bills.count = 0; group.add(bills);

  const coinGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.018, 12);
  const coinMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#FFD34E') });
  const coins = new THREE.InstancedMesh(coinGeo, coinMat, COIN_MAX); coins.castShadow = true; coins.count = 0; group.add(coins);

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

  return { group, setAmount, lastPulse: 0 };
}

export function createRegisterCash(G, S, ctx) {
  const { world, scene, vis, els } = ctx;
  const records = new Map();

  // The old visuals system still owns a legacy floor pile for compatibility; disable it here.
  for (const st of world.stations.values()) {
    if (st.type !== 'checkout') continue;
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
        rec.group.scale.setScalar(1);
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
          rec.group.scale.setScalar(s);
        } else rec.group.scale.setScalar(1);
      }
    },
  };
}