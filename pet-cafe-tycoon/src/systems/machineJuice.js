// Visual-only machine activity layer. Reads sim state but never mutates it.
import * as THREE from 'three';

const glow = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, toneMapped: false,
});

function ovenFx(st) {
  const g = new THREE.Group();
  const mat = glow('#FF9A45', 0.48);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.46, 0.018), mat);
  pane.position.set(0, 0.65, 0.655); g.add(pane);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.78), glow('#FFB35F', 0.11));
  halo.position.set(0, 0.65, 0.67); g.add(halo);
  return { g, update(t, active) {
    g.visible = st.active;
    const working = active && st.stock < (st.buffer || 12);
    mat.opacity = working ? 0.5 + Math.sin(t * 4.2) * 0.12 : 0.2;
    halo.material.opacity = working ? 0.09 + Math.sin(t * 3.1) * 0.035 : 0.025;
  } };
}

function coffeeFx(st) {
  const g = new THREE.Group();
  const status = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), glow('#76E58A', 0.9));
  status.position.set(-0.19, 0.73, 0.345); g.add(status);
  const steamMat = glow('#FFFFFF', 0.34);
  const steam = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.045 + i * 0.014, 7, 5), steamMat.clone());
    p.userData.seed = i * 0.83; g.add(p); steam.push(p);
  }
  return { g, update(t) {
    g.visible = st.active;
    const brewing = st.active && (st.beans | 0) > 0 && st.stock < (st.buffer || 8);
    status.material.color.set(brewing ? '#76E58A' : (st.beans | 0) <= 0 ? '#FF766D' : '#FFD166');
    status.scale.setScalar(0.86 + Math.sin(t * 4) * 0.12);
    for (let i = 0; i < steam.length; i++) {
      const p = steam[i];
      const k = (t * 0.42 + p.userData.seed) % 1;
      p.visible = brewing;
      p.position.set(0.06 + Math.sin(t * 2.2 + i) * 0.055, 0.98 + k * 0.5, 0.12);
      p.scale.setScalar(0.65 + k * 0.85);
      p.material.opacity = Math.sin(k * Math.PI) * 0.35;
    }
  } };
}

function blenderFx(st) {
  const g = new THREE.Group();
  const liquidMat = glow('#C87AF2', 0.46);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.21, 0.24, 12), liquidMat);
  liquid.position.set(0, 0.55, 0); g.add(liquid);
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 5, 14), glow('#EAF5FF', 0.82));
  blade.rotation.x = Math.PI / 2; blade.position.set(0, 0.43, 0); g.add(blade);
  return { g, update(t, dt) {
    g.visible = st.active;
    const working = st.active && (st.fruit | 0) > 0 && st.stock < (st.buffer || 8);
    liquid.visible = (st.fruit | 0) > 0 || working;
    liquid.material.opacity = working ? 0.5 + Math.sin(t * 7) * 0.08 : 0.26;
    if (working) blade.rotation.z += dt * 18;
    blade.visible = working;
  } };
}

function registerFx(st) {
  const g = new THREE.Group();
  const mat = glow('#91F6FF', 0.46);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.32), mat);
  screen.position.set(0.3, 1.32, 0.142); g.add(screen);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 5), glow('#72E59A', 0.9));
  dot.position.set(0.52, 1.48, 0.16); g.add(dot);
  return { g, update(t) {
    g.visible = st.active;
    const q = Array.isArray(st.queue) ? st.queue.length : 0;
    const busy = q > 0 || !!st.serving;
    mat.opacity = busy ? 0.58 + Math.sin(t * 5) * 0.1 : 0.28;
    dot.material.color.set(q >= 3 ? '#FF786D' : busy ? '#FFD166' : '#72E59A');
  } };
}

export function createMachineJuice(world, scene) {
  const fx = [];
  for (const st of world.stations.values()) {
    let rec = null;
    if (st.type === 'oven') rec = ovenFx(st);
    else if (st.type === 'coffee') rec = coffeeFx(st);
    else if (st.type === 'blender') rec = blenderFx(st);
    else if (st.type === 'checkout') rec = registerFx(st);
    if (!rec) continue;
    rec.g.position.set(st.x, 0, st.z);
    rec.g.rotation.y = st.rot || 0;
    scene.add(rec.g);
    fx.push(rec);
  }
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (const rec of fx) rec.update(t, dt, true);
    },
  };
}
