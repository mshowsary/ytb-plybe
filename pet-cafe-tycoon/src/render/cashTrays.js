import * as THREE from 'three';

function makeTray() {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#FFF0B3') });
  const rimMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#D9A51C') });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD84D'), transparent: true, opacity: 0.18, depthWrite: false });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.62), baseMat);
  base.position.y = 0.035; base.receiveShadow = true; g.add(base);
  const rim = [
    [0, 0.08, -0.31, 0.96, 0.08, 0.07], [0, 0.08, 0.31, 0.96, 0.08, 0.07],
    [-0.46, 0.08, 0, 0.07, 0.08, 0.62], [0.46, 0.08, 0, 0.07, 0.08, 0.62],
  ];
  for (const [x,y,z,w,h,d] of rim) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), rimMat); m.position.set(x,y,z); m.castShadow = true; g.add(m);
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 28), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.012; glow.scale.set(1.25, 0.82, 1); g.add(glow);
  g.userData.glow = glow;
  return g;
}

export function createCashTrays(world, scene) {
  const trays = [];
  for (const st of world.stations.values()) {
    if (st.type !== 'checkout') continue;
    const group = makeTray();
    group.position.set(st.cash.x, 0, st.cash.z);
    group.rotation.y = st.rot || 0;
    group.visible = st.active;
    scene.add(group);
    trays.push({ st, group, glow: group.userData.glow, t: 0 });
  }
  return {
    update(dt) {
      for (const r of trays) {
        r.group.visible = r.st.active;
        if (!r.st.active) continue;
        r.t += dt;
        const hasCash = r.st.pile > 0;
        r.glow.material.opacity = hasCash ? 0.25 + Math.sin(r.t * 4) * 0.07 : 0.08;
        r.glow.scale.setScalar(hasCash ? 1 + Math.sin(r.t * 4) * 0.05 : 0.9);
      }
    },
  };
}
