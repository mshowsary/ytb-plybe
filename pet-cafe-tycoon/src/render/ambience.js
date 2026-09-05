// Lightweight premium ambience: high visual density without shipping a large texture payload.
import * as THREE from 'three';

const toon = color => new THREE.MeshToonMaterial({ color });
const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false,
});

function addPlant(group, x, z, scale = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.42, 10), toon('#C9795C'));
  pot.position.set(x, 0.21, z); pot.scale.setScalar(scale); pot.castShadow = true; group.add(pot);
  const leafMat = toon('#5FA66A');
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 7), leafMat);
  crown.scale.set(1, 1.25, 0.78); crown.position.set(x, 0.72 * scale, z); crown.scale.multiplyScalar(scale); crown.castShadow = true; group.add(crown);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.28, 9, 6), toon('#78BD7F'));
  leaf.scale.set(0.8, 1.45, 0.62); leaf.position.set(x + 0.22 * scale, 0.92 * scale, z - 0.05); leaf.scale.multiplyScalar(scale); leaf.castShadow = true; group.add(leaf);
}

function makePawSign() {
  const g = new THREE.Group();
  const mat = basic('#FF89A6', 0.94);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), mat);
  pad.scale.set(1.15, 0.85, 0.35); g.add(pad);
  for (const [x, y] of [[-0.29, 0.29], [-0.09, 0.42], [0.15, 0.42], [0.34, 0.25]]) {
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), mat);
    toe.scale.set(0.92, 1.15, 0.35); toe.position.set(x, y, 0); g.add(toe);
  }
  g.userData.glowMaterial = mat;
  return g;
}

export function createAmbience(area) {
  const W = area.size.w, D = area.size.d;
  const group = new THREE.Group();
  const prestige = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  for (const g of prestige) { g.visible = false; group.add(g); }

  // Layered woven rug turns the open centre into a designed focal zone.
  const rugMat = toon('#C96868');
  const rugBase = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.025, 3.6), rugMat);
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

  // Reputation level 1 — greenery makes the room feel owned instead of freshly spawned.
  addPlant(prestige[0], -8.5, -5.4, 0.9);
  addPlant(prestige[0], 8.55, -5.4, 0.9);
  addPlant(prestige[0], -8.55, 5.25, 0.82);
  addPlant(prestige[0], 5.95, 5.65, 0.72);

  // Reputation level 2 — festive bunting around the service wall, batched by color.
  const buntingPoints = [];
  for (let x = -7.2; x <= 7.2; x += 0.9) buntingPoints.push([x, 2.55 + Math.sin(x * 1.35) * 0.08, -D / 2 + 0.32]);
  const buntingGeo = new THREE.ConeGeometry(0.16, 0.32, 3);
  const buntingMats = [toon('#FF8A80'), toon('#8B7CF6'), toon('#FFD166')];
  for (let c = 0; c < 3; c++) {
    const points = buntingPoints.filter((_, i) => i % 3 === c);
    const inst = new THREE.InstancedMesh(buntingGeo, buntingMats[c], points.length);
    points.forEach((p, i) => {
      mx.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, mx);
    });
    inst.instanceMatrix.needsUpdate = true; prestige[1].add(inst);
  }

  // Reputation level 3 — trophy shelf makes successful sessions leave a permanent mark.
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.13, 0.42), toon('#8B5E3C'));
  shelf.position.set(-6.4, 1.25, -D / 2 + 0.45); shelf.castShadow = true; prestige[2].add(shelf);
  const trophyMat = toon('#E9B94A');
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.09, 0.28, 10), trophyMat);
    cup.position.set(-7.0 + i * 0.6, 1.48, -D / 2 + 0.45); cup.castShadow = true; prestige[2].add(cup);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 7), basic('#FFE58A'));
    ball.position.set(-7.0 + i * 0.6, 1.68, -D / 2 + 0.45); prestige[2].add(ball);
  }

  // Reputation level 4 — signature paw sign: a recognizable visual identity, not another generic prop.
  const pawSign = makePawSign();
  pawSign.position.set(6.8, 1.8, -D / 2 + 0.42); pawSign.scale.setScalar(1.15); prestige[3].add(pawSign);
  const signPlate = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.18, 0.08), toon('#3D315F'));
  signPlate.position.set(6.8, 1.82, -D / 2 + 0.36); prestige[3].add(signPlate);
  pawSign.position.z = -D / 2 + 0.42;

  // Reputation level 5 — premium gold trim and lanterns, still only a handful of draw calls.
  const gold = toon('#D9A62E');
  for (const x of [-4.4, 0.3, 5.0]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 6), gold);
    stem.position.set(x, 2.7, 5.85); prestige[4].add(stem);
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), basic('#FFE8A3', 0.92));
    lantern.position.set(x, 2.38, 5.85); prestige[4].add(lantern);
  }
  const goldRunner = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.014, 0.08), gold);
  goldRunner.position.set(0.3, 0.065, 2.45); prestige[4].add(goldRunner);

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

  let t = 0, prestigeLevel = -1;
  function setPrestige(level) {
    level = Math.max(0, Math.min(5, level | 0));
    if (level === prestigeLevel) return;
    prestigeLevel = level;
    for (let i = 0; i < prestige.length; i++) prestige[i].visible = i < level;
    const rugColors = ['#C96868', '#C96868', '#B96673', '#A85D86', '#8A5FA1', '#B28A36'];
    rugMat.color.set(rugColors[level]);
    const shadeColors = ['#7E6AE8', '#7E6AE8', '#8067DA', '#9A63C7', '#B05DA6', '#C69B35'];
    shadeMat.color.set(shadeColors[level]);
  }

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
    if (prestige[3].visible && pawSign.userData.glowMaterial) {
      pawSign.userData.glowMaterial.opacity = 0.84 + Math.sin(t * 2.1) * 0.12;
    }
  }

  setPrestige(0);
  return { group, update, setPrestige };
}
