// Five deliberately visible renovation stages. All pieces live on walls/edges/overhead so none
// affect navigation, and primitives/instances keep the Playables bundle and draw cost modest.
import * as THREE from 'three';

const toon = color => new THREE.MeshToonMaterial({ color });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color)); m.castShadow = true; m.receiveShadow = true; return m;
}
function sphere(r, color) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), toon(color)); m.castShadow = true; return m; }

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

  let level=-1, t=0;
  function setLevel(next) {
    next=Math.max(0,Math.min(stages.length,next|0));
    if(next===level)return;level=next;
    for(let i=0;i<stages.length;i++)stages[i].visible=i<next;
  }
  function update(dt){
    t+=dt;
    if(stages[4].visible){
      for(const child of stages[4].children){
        if(child.material && child.material.isMeshBasicMaterial) child.material.opacity=.82+Math.sin(t*1.8+child.position.x)*.14;
      }
    }
  }
  setLevel(0);
  return { group, setLevel, update };
}
