// Lightweight premium ambience: detail without shipping a large texture payload.
import * as THREE from 'three';

const toon = color => new THREE.MeshToonMaterial({ color });
const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false,
});

export function createAmbience(area) {
  const W = area.size.w, D = area.size.d;
  const group = new THREE.Group();

  // Layered woven rug turns the open centre into a designed focal zone.
  const rugBase = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.025, 3.6), toon('#C96868'));
  rugBase.position.set(0.3, 0.018, 2.45); rugBase.receiveShadow = true; group.add(rugBase);
  const rugInner = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.03, 2.95), toon('#F2C9A8'));
  rugInner.position.set(0.3, 0.035, 2.45); rugInner.receiveShadow = true; group.add(rugInner);
  const stripeGeo = new THREE.BoxGeometry(4.7, 0.016, 0.055), stripeMat = toon('#FFF1DE');
  for (let z = 1.28; z <= 3.62; z += 0.38) {
    const m = new THREE.Mesh(stripeGeo, stripeMat); m.position.set(0.3, 0.055, z); group.add(m);
  }

  // Pendant fixtures. Emissive-looking bulbs use BasicMaterial instead of costly point lights.
  const cordGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.05, 6);
  const shadeGeo = new THREE.CylinderGeometry(0.07, 0.36, 0.34, 12, 1, true);
  const bulbGeo = new THREE.SphereGeometry(0.115, 10, 7);
  const cordMat = toon('#463833'), shadeMat = toon('#7E6AE8'), bulbMat = basic('#FFD9A1');
  for (const x of [-5.2, 0.2, 5.6]) {
    const cord = new THREE.Mesh(cordGeo, cordMat); cord.position.set(x, 3.45, -3.5); group.add(cord);
    const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.set(x, 2.91, -3.5); shade.castShadow = true; group.add(shade);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(x, 2.82, -3.5); group.add(bulb);
  }

  // Framed café art on the two clear north-wall panels.
  const frameMat = toon('#6C4B38'), paperMat = toon('#FFF4E6'), art = ['#FF8A80', '#8B7CF6'];
  for (let i = 0; i < 2; i++) {
    const x = i ? 7.55 : -7.55;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 0.08), frameMat);
    frame.position.set(x, 1.92, -D / 2 + 0.23); frame.castShadow = true; group.add(frame);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.88, 0.025), paperMat);
    paper.position.set(x, 1.92, -D / 2 + 0.285); group.add(paper);
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 8, 18), toon(art[i]));
    mark.rotation.x = Math.PI / 2; mark.position.set(x, 1.94, -D / 2 + 0.31); group.add(mark);
  }

  // Warm string lights along the open fence, instanced into one draw call.
  const bulbs = [];
  for (let z = -5.8; z <= 5.8; z += 1.15) bulbs.push([W / 2 - 0.08, 1.28, z]);
  for (let x = -8.8; x <= 8.8; x += 1.15) bulbs.push([x, 1.28, D / 2 - 0.08]);
  const lightMat = basic('#FFE0A8', 0.96);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 4), lightMat, bulbs.length);
  const mx = new THREE.Matrix4();
  bulbs.forEach((p, i) => { mx.makeTranslation(p[0], p[1], p[2]); lights.setMatrixAt(i, mx); });
  lights.instanceMatrix.needsUpdate = true; group.add(lights);

  // Slow dust motes create constant micro-motion in otherwise static areas.
  const COUNT = 42, pos = new Float32Array(COUNT * 3), speed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * (W - 1.5);
    pos[i * 3 + 1] = 0.35 + Math.random() * 2.8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * (D - 1.5);
    speed[i] = 0.018 + Math.random() * 0.035;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: '#FFF7D6', size: 0.045, transparent: true, opacity: 0.42,
    depthWrite: false, sizeAttenuation: true, toneMapped: false,
  }));
  group.add(dust);

  let t = 0;
  function update(dt) {
    t += dt;
    const a = dustGeo.getAttribute('position');
    for (let i = 0; i < COUNT; i++) {
      let y = a.getY(i) + speed[i] * dt;
      if (y > 3.2) y = 0.28;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t * 0.55 + i * 1.7) * dt * 0.006);
    }
    a.needsUpdate = true;
    lightMat.opacity = 0.9 + Math.sin(t * 1.35) * 0.08;
  }

  return { group, update };
}
