import * as THREE from 'three';
import { part, mesh } from './geo.js';

// A register's cash tray: the tray and its rim are ONE merged mesh on the shared toon material, and
// only the pulsing glow keeps a material of its own — two draw calls a tray, down from six (a base,
// four rim bars and the glow, the rims each casting a shadow-map pass too). The tray sits on the
// floor and its contact shadow already grounds it, so it casts no sun shadow at all.
function makeTray() {
  const g = new THREE.Group();
  const P = [part('box', [0.92, 0.055, 0.62], '#FFF0B3', { y: 0.035 })];
  for (const [x, y, z, w, h, d] of [
    [0, 0.08, -0.31, 0.96, 0.08, 0.07], [0, 0.08, 0.31, 0.96, 0.08, 0.07],
    [-0.46, 0.08, 0, 0.07, 0.08, 0.62], [0.46, 0.08, 0, 0.07, 0.08, 0.62],
  ]) P.push(part('box', [w, h, d], '#D9A51C', { x, y, z }));
  g.add(mesh(P, { cast: false, receive: true }));
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD84D'), transparent: true, opacity: 0.18, depthWrite: false });
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
    group.name = 'cashTray';
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
