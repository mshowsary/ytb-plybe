// Five deliberately visible renovation stages plus Task 36's one earned Bestie keepsake.
// All pieces live on walls/edges/overhead so none affect navigation, and primitives keep the
// Playables bundle and draw cost modest.
import * as THREE from 'three';
import { parsePetKey } from '../sim/petBook.js';

const toon = color => new THREE.MeshToonMaterial({ color });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color)); m.castShadow = true; m.receiveShadow = true; return m;
}
function sphere(r, color) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), toon(color)); m.castShadow = true; return m; }
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function smoothstep01(v) { const t = clamp01(v); return t * t * (3 - 2 * t); }

// Exported pure curve so Task 36 can prove the reveal starts at the pet, ends exactly on the wall,
// and never changes gameplay coordinates. The portrait is the only object following this curve.
export function keepsakeRevealPose(progress, from, home) {
  const p = clamp01(progress), e = smoothstep01(p);
  const x = from.x + (home.x - from.x) * e;
  const z = from.z + (home.z - from.z) * e;
  const baseY = from.y + (home.y - from.y) * e;
  return {
    x, y: baseY + Math.sin(p * Math.PI) * 0.72, z,
    scale: 0.58 + 0.42 * e + Math.sin(p * Math.PI) * 0.08,
    rotationZ: Math.sin(p * Math.PI * 2) * 0.08 * (1 - e),
  };
}

function createBestieKeepsake(home) {
  const root = new THREE.Group();
  root.name = 'bestie-keepsake'; root.visible = false;
  root.position.set(home.x, home.y, home.z); root.rotation.y = -Math.PI / 2;

  // A warm wood frame with a fixed set of child meshes. Species changes only toggle/reposition
  // these existing children; earning/reloading the keepsake can never append duplicate geometry.
  const shadow = box(0.92, 0.88, 0.05, '#563D32'); shadow.position.z = -0.035;
  const frame = box(0.84, 0.8, 0.085, '#8A5B3E');
  const paper = box(0.69, 0.64, 0.022, '#FFF4E6'); paper.position.z = 0.055;
  const medallion = sphere(0.235, '#D6A35F'); medallion.scale.set(1.08, 0.92, 0.16); medallion.position.set(0, 0.045, 0.085);
  const muzzle = sphere(0.105, '#FFF0D5'); muzzle.scale.set(1.18, 0.82, 0.13); muzzle.position.set(0, -0.055, 0.12);
  const earA = box(0.13, 0.23, 0.035, '#D6A35F'); earA.position.set(-0.14, 0.25, 0.105);
  const earB = box(0.13, 0.23, 0.035, '#D6A35F'); earB.position.set(0.14, 0.25, 0.105);
  const accent = box(0.48, 0.055, 0.028, '#E0B34F'); accent.position.set(0, -0.275, 0.09);
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), glow('#FF9E9A', 0.96)); heart.scale.set(1.1, 1.0, 0.35); heart.position.set(0.255, -0.225, 0.12);
  root.add(shadow, frame, paper, medallion, muzzle, earA, earB, accent, heart);

  function setMaterialColor(mesh, color) {
    if (mesh?.material?.color) mesh.material.color.set(color);
  }

  function applyKey(key) {
    const parsed = parsePetKey(key); if (!parsed) { root.visible = false; root.userData.key = null; return false; }
    if (root.userData.key === parsed.key && root.visible) return false;
    root.userData.key = parsed.key; root.visible = true;
    const { species, profile } = parsed;
    setMaterialColor(medallion, profile.body); setMaterialColor(muzzle, profile.belly);
    setMaterialColor(earA, profile.body); setMaterialColor(earB, profile.body); setMaterialColor(accent, profile.accent);

    // The fixed portrait pieces form three unmistakable silhouettes without any new object creation.
    if (species === 'bunny') {
      earA.visible = earB.visible = true;
      earA.scale.set(0.68, 1.75, 1); earB.scale.set(0.68, 1.75, 1);
      earA.position.set(-0.115, 0.29, 0.105); earB.position.set(0.115, 0.29, 0.105);
      earA.rotation.z = 0.08; earB.rotation.z = -0.08;
      medallion.scale.set(0.98, 0.9, 0.16);
    } else if (species === 'dog') {
      earA.visible = earB.visible = true;
      earA.scale.set(1.05, 1.1, 1); earB.scale.set(1.05, 1.1, 1);
      earA.position.set(-0.225, 0.115, 0.1); earB.position.set(0.225, 0.115, 0.1);
      earA.rotation.z = 0.48; earB.rotation.z = -0.48;
      medallion.scale.set(1.12, 0.92, 0.16);
    } else {
      earA.visible = earB.visible = true;
      earA.scale.set(0.86, 0.9, 1); earB.scale.set(0.86, 0.9, 1);
      earA.position.set(-0.145, 0.235, 0.105); earB.position.set(0.145, 0.235, 0.105);
      earA.rotation.z = -0.38; earB.rotation.z = 0.38;
      medallion.scale.set(1.08, 0.92, 0.16);
    }
    return true;
  }

  return { root, applyKey, accent, heart };
}

export function createRenovationDecor(area) {
  const W = area.size.w, D = area.size.d;
  const group = new THREE.Group();
  const stages = Array.from({ length: 5 }, () => new THREE.Group());
  for (const s of stages) { s.visible = false; group.add(s); }

  // 1 — Greenhouse Glow: hanging planters + warm wall globes. Large visual change, zero floor blockers.
  const plantPot = new THREE.CylinderGeometry(0.22, 0.17, 0.28, 9);
  const plantMat = toon('#B86F50'), leafMat = toon('#68AD70'), leafMat2 = toon('#86C98A');
  for (const [x, z] of [[-7.2,-6.55],[-3.9,-6.55],[3.9,-6.55],[7.2,-6.55],[9.45,-3.2],[9.45,0],[9.45,3.2]]) {
    const cord = box(0.025, 0.65, 0.025, '#5B4436'); cord.position.set(x, 2.85, z); stages[0].add(cord);
    const pot = new THREE.Mesh(plantPot, plantMat); pot.position.set(x, 2.48, z); pot.castShadow = true; stages[0].add(pot);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.34, 9, 6), leafMat); crown.scale.set(1,0.65,1); crown.position.set(x,2.25,z); stages[0].add(crown);
    const spill = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 5), leafMat2); spill.scale.set(0.65,1.4,0.65); spill.position.set(x+0.18,2.02,z+0.08); stages[0].add(spill);
  }
  for (const x of [-8.2,-5.5,-2.7,2.8,5.5,8.2]) {
    const lamp = sphere(0.09, '#FFE5A9'); lamp.material = glow('#FFE5A9', 0.96); lamp.position.set(x,2.35,-D/2+0.25); stages[0].add(lamp);
  }

  // 2 — Gallery Café: art ledges and collectible pet silhouettes on the service wall.
  const ledge = box(6.2,0.09,0.28,'#704B35'); ledge.position.set(0,1.12,-D/2+0.34); stages[1].add(ledge);
  const frameCols = ['#F29B8A','#88B9D8','#9C82DD','#E4B754','#78B783'];
  for (let i=0;i<5;i++) {
    const x=-2.5+i*1.25;
    const frame=box(0.85,0.72,0.06,'#4C392F'); frame.position.set(x,1.72,-D/2+0.28); stages[1].add(frame);
    const paper=box(0.68,0.55,0.025,'#FFF1DE'); paper.position.set(x,1.72,-D/2+0.325); stages[1].add(paper);
    const pet=sphere(0.16,frameCols[i]); pet.scale.set(1,0.75,0.35); pet.position.set(x,1.69,-D/2+0.36); stages[1].add(pet);
    for (const dx of [-0.15,-0.05,0.07,0.17]) { const toe=sphere(0.05,frameCols[i]); toe.scale.z=0.4; toe.position.set(x+dx,1.88+Math.abs(dx)*0.28,-D/2+0.37); stages[1].add(toe); }
  }

  // 3 — Pet Palace: a grand hanging paw crest and velvet/gold service valance.
  const valance = box(W-2.2,0.15,0.15,'#733B72'); valance.position.set(0,2.72,-D/2+0.36); stages[2].add(valance);
  for (let x=-8;x<=8;x+=1.6) {
    const drop = new THREE.Mesh(new THREE.ConeGeometry(0.13,0.34,3), toon('#E5B950')); drop.position.set(x,2.5,-D/2+0.37); drop.rotation.z=Math.PI; stages[2].add(drop);
  }
  const crest = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.7,32), toon('#5B386F')); plate.position.z=0; crest.add(plate);
  const pad=sphere(0.25,'#F3C458'); pad.scale.set(1.2,0.9,0.25); crest.add(pad);
  for(const [x,y] of [[-.3,.28],[-.1,.43],[.13,.43],[.32,.27]]){const t=sphere(.11,'#F3C458');t.scale.z=.25;t.position.set(x,y,.03);crest.add(t);}
  crest.position.set(6.9,1.75,-D/2+0.34); crest.rotation.y=Math.PI; stages[2].add(crest);

  // 4 — Grand Café: suspended gold canopy lights plus a real trophy presentation strip.
  const gold = toon('#D8A62D');
  for (const z of [-0.2,2.2,4.6]) {
    const rail=box(8.0,0.045,0.045,'#A87920'); rail.position.set(0.5,3.25,z); stages[3].add(rail);
    for(let x=-3.2;x<=4.2;x+=0.92){
      const cord=box(.018,.38,.018,'#6B4C24');cord.position.set(x,3.05,z);stages[3].add(cord);
      const bulb=sphere(.075,'#FFE7A5');bulb.material=glow('#FFE7A5',.96);bulb.position.set(x,2.84,z);stages[3].add(bulb);
    }
  }
  const trophyShelf=box(3.5,.14,.42,'#623F2D'); trophyShelf.position.set(-6.2,1.22,-D/2+.45); stages[3].add(trophyShelf);
  for(let i=0;i<5;i++){
    const cup=new THREE.Mesh(new THREE.CylinderGeometry(.13,.08,.27,10),gold);cup.position.set(-7.45+i*.62,1.45,-D/2+.45);stages[3].add(cup);
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.11,0),glow('#FFE48A'));star.position.set(-7.45+i*.62,1.68,-D/2+.45);stages[3].add(star);
  }

  // 5 — Legendary Finish: gold entrance arch + star canopy + centre medallion.
  const archMat=toon('#D5A52D');
  for(const x of [-9.25,-8.45]){const post=box(.18,2.45,.18,'#D5A52D');post.position.set(x,1.23,area.door.z);stages[4].add(post);}
  const arch=box(1.05,.18,.18,'#D5A52D');arch.position.set(-8.85,2.42,area.door.z);stages[4].add(arch);
  for(let i=0;i<7;i++){
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.11+(i%2)*.035,0),glow('#FFF0A9',.96));
    star.position.set(-7.2+i*2.35,2.55,5.95); stages[4].add(star);
  }
  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,0.025,32), toon('#E4B548'));
  medallion.position.set(0.3,0.065,2.45); stages[4].add(medallion);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.93,0.93,0.03,32), toon('#7C63B7'));
  inner.position.set(0.3,0.082,2.45); stages[4].add(inner);
  const centrePaw=sphere(.27,'#F7D46C');centrePaw.scale.set(1.2,.25,.9);centrePaw.position.set(.3,.105,2.45);stages[4].add(centrePaw);

  // Task 36 — First Bestie Memory. It gets a reserved side-wall spot independent of renovation
  // level, because affection is a relationship milestone rather than a purchasable room tier.
  const keepsakeHome = { x: W / 2 - 0.26, y: 1.78, z: 4.55 };
  const keepsake = createBestieKeepsake(keepsakeHome); group.add(keepsake.root);
  let reveal = null;

  let level=-1, t=0;
  function setLevel(next) {
    next=Math.max(0,Math.min(stages.length,next|0));
    if(next===level)return;level=next;
    for(let i=0;i<stages.length;i++)stages[i].visible=i<next;
  }
  function setKeepsake(key) {
    const changed = keepsake.applyKey(key);
    reveal = null;
    if (keepsake.root.visible) {
      keepsake.root.position.set(keepsakeHome.x, keepsakeHome.y, keepsakeHome.z);
      keepsake.root.scale.setScalar(1); keepsake.root.rotation.z = 0;
    }
    return changed;
  }
  function revealKeepsake(key, from = null, reducedMotion = false) {
    const parsed = parsePetKey(key); if (!parsed) return false;
    const already = keepsake.root.visible && keepsake.root.userData.key === parsed.key;
    if (already) return false;
    keepsake.applyKey(parsed.key);
    if (reducedMotion || !from || !Number.isFinite(from.x) || !Number.isFinite(from.z)) {
      setKeepsake(parsed.key); return true;
    }
    const start = {
      x: from.x,
      y: Number.isFinite(from.y) ? from.y : 1.1,
      z: from.z,
    };
    reveal = { t: 0, duration: 0.92, from: start };
    const pose = keepsakeRevealPose(0, start, keepsakeHome);
    keepsake.root.position.set(pose.x, pose.y, pose.z); keepsake.root.scale.setScalar(pose.scale); keepsake.root.rotation.z = pose.rotationZ;
    return true;
  }
  function update(dt){
    t+=dt;
    if(stages[4].visible){
      for(const child of stages[4].children){
        if(child.material && child.material.isMeshBasicMaterial) child.material.opacity=.82+Math.sin(t*1.8+child.position.x)*.14;
      }
    }
    if (reveal) {
      reveal.t = Math.min(reveal.duration, reveal.t + Math.max(0, dt));
      const p = reveal.duration ? reveal.t / reveal.duration : 1;
      const pose = keepsakeRevealPose(p, reveal.from, keepsakeHome);
      keepsake.root.position.set(pose.x, pose.y, pose.z); keepsake.root.scale.setScalar(pose.scale); keepsake.root.rotation.z = pose.rotationZ;
      keepsake.heart.rotation.z += dt * 4.5;
      if (p >= 1) { reveal = null; keepsake.root.position.set(keepsakeHome.x, keepsakeHome.y, keepsakeHome.z); keepsake.root.scale.setScalar(1); keepsake.root.rotation.z = 0; }
    }
  }
  setLevel(0);
  return {
    group, setLevel, update, setKeepsake, revealKeepsake,
    keepsake: keepsake.root,
    get keepsakeKey() { return keepsake.root.userData.key || null; },
    get keepsakeRevealing() { return !!reveal; },
  };
}
