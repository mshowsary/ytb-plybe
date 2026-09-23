// src/render/cityView.js — the café city map: a picture rendered offline in Blender (art/build_city.py)
// with the town's life drawn live on top of it.
//
// The picture sits at the back of an orthographic camera that matches Blender's exactly (city.json).
// Invisible stand-ins for the buildings and trees (occluders.glb) are written into the depth buffer
// only, so the cars, walkers and pets drawn afterwards slip behind houses as if they were in the render.
// Panning and zooming move the camera's window over the picture; nothing is ever re-rendered offline.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadKit, kitClone } from './kit.js';
import { createHuman } from './human.js';
import { createPet } from './pets.js';

const BASE = './map/';
const CARS = ['city/car_sedan', 'city/car_hatchback', 'city/car_stationwagon', 'city/car_taxi'];

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(20,30,40,0.55)'); gr.addColorStop(0.6, 'rgba(20,30,40,0.25)'); gr.addColorStop(1, 'rgba(20,30,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function glintTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(15, 2, 2, 28); g.fillRect(2, 15, 28, 2);
  return new THREE.CanvasTexture(c);
}

// a little sailboat: white hull, a coral stripe, a mast and a sail
function sailboat() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#FFFFFF' }), coral = new THREE.MeshLambertMaterial({ color: '#F06A55' });
  const hullShape = new THREE.Shape(); hullShape.moveTo(0, 1.6); hullShape.quadraticCurveTo(0.7, 0.4, 0.55, -1.2); hullShape.lineTo(-0.55, -1.2); hullShape.quadraticCurveTo(-0.7, 0.4, 0, 1.6);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 0.45, bevelEnabled: false }), white);
  hull.rotation.x = -Math.PI / 2; hull.position.y = 0.05; g.add(hull);
  const stripe = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 0.1, bevelEnabled: false }), coral);
  stripe.rotation.x = -Math.PI / 2; stripe.scale.set(1.03, 1.03, 1); stripe.position.y = 0.3; g.add(stripe);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), new THREE.MeshLambertMaterial({ color: '#8A5B3C' }));
  mast.position.set(0, 2.0, 0.2); g.add(mast);
  // the bow points to -z: the mainsail swings aft (+z), the jib runs forward to the bow
  const sailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, 0.25), new THREE.Vector3(0, 3.4, 0.25), new THREE.Vector3(0, 0.6, 1.3)]);
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: '#FFF8EC', side: THREE.DoubleSide })); g.add(sail);
  const jibGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, 0.1), new THREE.Vector3(0, 2.9, 0.15), new THREE.Vector3(0, 0.5, -1.45)]);
  jibGeo.computeVertexNormals();
  g.add(new THREE.Mesh(jibGeo, new THREE.MeshLambertMaterial({ color: '#F06A55', side: THREE.DoubleSide })));
  return g;
}

// a polyline path: position and heading at any distance along it (closed loops wrap)
function makePath(pts, closed) {
  const P = pts.map(p => new THREE.Vector3(...p)); if (closed) P.push(P[0].clone());
  const acc = [0]; for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + P[i].distanceTo(P[i - 1]));
  const len = acc[acc.length - 1];
  const at = (s, out) => {
    s = closed ? ((s % len) + len) % len : Math.max(0, Math.min(len, s));
    let i = 1; while (i < acc.length - 1 && acc[i] < s) i++;
    const k = (s - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
    return out.copy(P[i - 1]).lerp(P[i], k);
  };
  return { len, at, closed };
}

export function createCityView(S) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  scene.add(cam);
  let L = null, ready = false, loading = null, t = 0;
  const view = { x: 0, y: 0, h: 30 }, goal = { x: 0, y: 0, h: 30 };
  let diving = false;          // the dive into a café may zoom past the picture's comfortable resolution
  const movers = [], glints = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  let sunOff = new THREE.Vector3(0.25, 0, 0.25);

  function blob(parent, w, d) {
    const m = new THREE.Mesh(blobGeo, blobMat); m.scale.set(w, 1, d); m.renderOrder = 1; parent.add(m); return m;
  }

  async function load() {
    const [layout, tex, occ] = await Promise.all([
      fetch(BASE + 'city.json').then(r => r.json()),
      new THREE.TextureLoader().loadAsync(BASE + 'city.webp'),
      new GLTFLoader().loadAsync(BASE + 'occluders.glb'),
      loadKit(CARS),
    ]);
    L = layout;
    const C = L.camera;
    cam.near = C.near; cam.far = C.far;
    cam.position.set(...C.pos); cam.up.set(...C.up);
    cam.lookAt(tmp.set(...C.pos).add(tmp2.set(...C.fwd)));
    cam.updateMatrixWorld(true);
    // the picture, glued to the back of the camera's frame
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = S.renderer.capabilities.getMaxAnisotropy();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(C.halfW * 2, C.halfH * 2),
      new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false }));
    bg.position.z = -(C.far - 4); bg.renderOrder = -10; bg.frustumCulled = false; cam.add(bg);
    // the stand-ins: depth only
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    occ.scene.traverse(o => { if (o.isMesh) { o.material = occMat; o.renderOrder = -5; } });
    scene.add(occ.scene);
    // light for the live things, from where Blender's sun shone
    scene.add(new THREE.HemisphereLight('#FFF6E8', '#9AA88A', 1.25));
    const sun = new THREE.DirectionalLight('#FFF0DA', 1.7); sun.position.set(...L.sun).multiplyScalar(50); scene.add(sun);
    sunOff = new THREE.Vector3(-L.sun[0], 0, -L.sun[2]).normalize().multiplyScalar(0.3);
    populate();
    ready = true;
  }

  // ---- the town's life -----------------------------------------------------------------------------
  function populate() {
    // cars: round the block loops, and both ways along the coast road
    const loops = L.lanes.map(p => makePath(p, true)), coast = L.coast.map(p => makePath(p, false));
    const routes = [...loops, ...coast, ...coast];
    routes.forEach((path, i) => {
      const car = kitClone(CARS[i % CARS.length], 3.3);
      car.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      const holder = new THREE.Group(); holder.add(car); blob(holder, 1.9, 3.6).position.set(sunOff.x, 0.03, sunOff.z);
      scene.add(holder);
      movers.push({ kind: 'car', obj: holder, path, s: (i * 37.3) % path.len, v: 5.5 + (i % 3) * 0.8, head: 0 });
    });
    // walkers on the pavements and the promenade, one with a dog
    const walks = L.walks.map(p => makePath(p, true));
    const promenade = makePath(L.promenade, false), beach = makePath(L.beach, false);
    const people = [...walks.map((p, i) => ({ p, s: i * 11 })), ...walks.map((p, i) => ({ p, s: i * 11 + p.len / 2, back: true })),
      { p: promenade, s: 20 }, { p: promenade, s: 90, back: true }, { p: promenade, s: 140 }, { p: beach, s: 30 }, { p: beach, s: 80, back: true }];
    people.forEach((w, i) => {
      const H = createHuman({ shirt: i % 5, hair: (i * 3) % 4, skin: (i * 5) % 3 }, 'customer');
      H.setBaseScale(0.85);
      const holder = new THREE.Group(); holder.add(H.group); blob(holder, 1.1, 1.1).position.set(sunOff.x, 0.02, sunOff.z);
      scene.add(holder);
      const m = { kind: 'walker', obj: holder, H, path: w.p, s: w.s, v: (w.back ? -1 : 1) * (1.2 + (i % 4) * 0.12), last: new THREE.Vector3() };
      movers.push(m);
      if (i === 2 || i === 9) {        // walking a dog
        const P = createPet('dog', i === 2 ? 1 : 6); P.setBaseScale(1.0);
        const ph = new THREE.Group(); ph.add(P.group); blob(ph, 0.6, 0.8).position.set(sunOff.x * 0.6, 0.02, sunOff.z * 0.6);
        scene.add(ph); movers.push({ kind: 'dogwalk', obj: ph, P, lead: m, last: new THREE.Vector3() });
      }
    });
    // pets out front of every café
    const petsAt = { town: [['cat', 0], ['dog', 1], ['bunny', 2]], mall: [['dog', 3], ['cat', 2]], beach: [['dog', 6], ['cat', 5], ['hamster', 8]] };
    for (const id in L.patios) {
      L.patios[id].forEach((p, i) => {
        const def = (petsAt[id] || [])[i]; if (!def) return;
        const P = createPet(def[0], def[1]); P.setBaseScale(1.05); P.sit();
        const holder = new THREE.Group(); holder.add(P.group); holder.position.set(...p); holder.rotation.y = 0.6 + i;
        blob(holder, 0.55, 0.7).position.set(sunOff.x * 0.5, 0.02, sunOff.z * 0.5);
        scene.add(holder); movers.push({ kind: 'sitter', obj: holder, P, phase: i * 1.7 });
      });
    }
    // two dogs chasing round the fountain, one doing laps of the dog run
    const pc = new THREE.Vector3(...L.park.centre);
    [['dog', 0, 0], ['dog', 2, Math.PI], ['cat', 1, 1.2]].forEach(([sp, v, a0], i) => {
      const P = createPet(sp, v); P.setBaseScale(1.05);
      const holder = new THREE.Group(); holder.add(P.group); blob(holder, 0.6, 0.8).position.set(sunOff.x * 0.5, 0.02, sunOff.z * 0.5);
      scene.add(holder);
      movers.push({ kind: 'runner', obj: holder, P, c: i < 2 ? pc : new THREE.Vector3(...L.park.dogrun), r: i < 2 ? L.park.ring : 1.3, a: a0, v: i < 2 ? 0.5 : -0.9, last: new THREE.Vector3() });
    });
    // a sailboat tacking along the coast
    const boat = sailboat(); boat.scale.setScalar(1.1); scene.add(boat);
    movers.push({ kind: 'boat', obj: boat, path: makePath(L.sea.boat, false), s: 0, v: 1.6, dir: 1 });
    // glints twinkling on the open sea
    const gm = new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const o = new THREE.Vector3(...L.sea.origin), along = new THREE.Vector3(...L.sea.along), out = new THREE.Vector3(...L.sea.out);
    for (let i = 0; i < 46; i++) {
      const sp = new THREE.Sprite(gm.clone());
      sp.position.copy(o).addScaledVector(along, -70 + Math.random() * 150).addScaledVector(out, L.sea.shore + 5 + Math.random() * 45);
      sp.position.y = L.sea.z + 0.05; sp.renderOrder = 2;
      scene.add(sp); glints.push({ sp, ph: Math.random() * 6.28, sp0: 0.6 + Math.random() * 0.8 });
    }
  }

  function step(dt) {
    for (const m of movers) {
      if (m.kind === 'car') {
        m.s += m.v * dt;
        if (!m.path.closed && m.s > m.path.len) m.s = 0;
        m.path.at(m.s, m.obj.position);
        m.path.at(m.s + 2.2, tmp); m.path.at(m.s - 2.2, tmp2);
        const want = Math.atan2(tmp.x - tmp2.x, tmp.z - tmp2.z);
        let d = want - m.head; d = Math.atan2(Math.sin(d), Math.cos(d)); m.head += d * Math.min(1, dt * 6);
        m.obj.rotation.y = m.head;
      } else if (m.kind === 'walker') {
        m.last.copy(m.obj.position);
        m.s += m.v * dt;
        if (!m.path.closed && (m.s > m.path.len || m.s < 0)) { m.v = -m.v; m.s = Math.max(0, Math.min(m.path.len, m.s)); }
        m.path.at(m.s, m.obj.position);
        m.H.update(dt, (m.obj.position.x - m.last.x) / dt, (m.obj.position.z - m.last.z) / dt);
      } else if (m.kind === 'dogwalk') {
        m.last.copy(m.obj.position);
        const lp = m.lead.obj.position, face = m.lead.H.group.rotation.y;
        tmp.set(lp.x + Math.cos(face) * 0.7 + Math.sin(face) * 0.9, lp.y, lp.z - Math.sin(face) * 0.7 + Math.cos(face) * 0.9);
        m.obj.position.lerp(tmp, Math.min(1, dt * 5));
        const vx = m.obj.position.x - m.last.x, vz = m.obj.position.z - m.last.z;
        if (vx * vx + vz * vz > 1e-6) m.obj.rotation.y = Math.atan2(vx, vz);
        m.P.update(dt, true);
      } else if (m.kind === 'runner') {
        m.last.copy(m.obj.position);
        m.a += m.v * dt;
        const wob = Math.sin(t * 0.7 + m.r) * 0.4;
        m.obj.position.set(m.c.x + Math.cos(m.a) * (m.r + wob), m.c.y, m.c.z + Math.sin(m.a) * (m.r + wob));
        const vx = m.obj.position.x - m.last.x, vz = m.obj.position.z - m.last.z;
        if (vx * vx + vz * vz > 1e-7) m.obj.rotation.y = Math.atan2(vx, vz);
        m.P.update(dt, true, Math.abs(Math.sin(t * 9 + m.a)) * 0.12);
      } else if (m.kind === 'sitter') {
        m.P.idleLife(dt); m.P.update(dt, false);
      } else if (m.kind === 'boat') {
        m.s += m.v * m.dir * dt;
        if (m.s > m.path.len || m.s < 0) { m.dir = -m.dir; m.s = Math.max(0, Math.min(m.path.len, m.s)); }
        m.path.at(m.s, m.obj.position);
        m.obj.position.y += Math.sin(t * 1.6) * 0.06;
        const a = Math.atan2(L.sea.along[0], L.sea.along[2]) + Math.PI;     // the bow is the model's -z
        m.obj.rotation.y = a + (m.dir < 0 ? Math.PI : 0);
        m.obj.rotation.z = Math.sin(t * 1.3) * 0.06;
      }
    }
    for (const g of glints) {
      const k = Math.max(0, Math.sin(t * g.sp0 * 1.7 + g.ph));
      g.sp.material.opacity = k * k * 0.9; g.sp.scale.setScalar(0.4 + k * 0.9);
    }
  }

  // ---- the window over the picture -------------------------------------------------------------------
  const aspect = () => innerWidth / Math.max(1, innerHeight);
  function limits() {
    const C = L.camera, a = aspect();
    const maxH = Math.min(C.halfH, C.halfW / a);
    // never blow the picture up much past its own resolution
    const pxPerUnit = L.image[0] / (C.halfW * 2);
    const minH = Math.min(maxH, Math.max(12, (innerHeight * (devicePixelRatio || 1)) / (2 * pxPerUnit * 1.35)));
    return { maxH, minH };
  }
  function clampView(v) {
    const C = L.camera, a = aspect(), { maxH, minH } = limits();
    v.h = Math.max(diving ? 4 : minH, Math.min(maxH, v.h));
    const hw = v.h * a;
    v.x = Math.max(-C.halfW + hw, Math.min(C.halfW - hw, v.x));
    v.y = Math.max(-C.halfH + v.h, Math.min(C.halfH - v.h, v.y));
  }
  function frameOf(p) { return tmp.set(...p).applyMatrix4(cam.matrixWorldInverse); }
  function applyView() {
    const a = aspect();
    cam.left = view.x - view.h * a; cam.right = view.x + view.h * a; cam.top = view.y + view.h; cam.bottom = view.y - view.h;
    cam.updateProjectionMatrix();
  }
  const defaultH = () => { const { maxH } = limits(); return aspect() < 1 ? maxH : maxH; };

  return {
    scene, camera: cam,
    load() { diving = false; return loading || (loading = load()); },
    get ready() { return ready; },
    get layout() { return L; },
    // glide to a café, leaving room below it for the cards
    focus(id, instant = false) {
      if (!L || !L.sites[id]) return;
      const f = frameOf(L.sites[id]);
      goal.h = aspect() < 1 ? limits().maxH : defaultH();
      goal.x = f.x; goal.y = f.y - goal.h * (aspect() < 1 ? 0.12 : 0.05);
      clampView(goal); if (instant) Object.assign(view, goal);
    },
    // the way in: glide and zoom right down onto a café's pin, then the game fades in
    dive(id) {
      if (!L || !L.sites[id]) return;
      const f = frameOf(L.sites[id]);
      diving = true; goal.h = Math.max(5, view.h * 0.28); goal.x = f.x; goal.y = f.y - goal.h * 0.2;
    },
    wide(instant = false) {
      if (!L) return;
      goal.h = defaultH(); goal.x = 0; goal.y = 0; clampView(goal); if (instant) Object.assign(view, goal);
    },
    pan(dxPx, dyPx) {
      const k = (view.h * 2) / innerHeight;
      goal.x = view.x - dxPx * k; goal.y = view.y + dyPx * k; clampView(goal); Object.assign(view, goal);
    },
    zoom(f, cxPx = innerWidth / 2, cyPx = innerHeight / 2) {
      // keep the point under the fingers still while zooming
      const a = aspect(), px = view.x + ((cxPx / innerWidth) * 2 - 1) * view.h * a, py = view.y - ((cyPx / innerHeight) * 2 - 1) * view.h;
      const nh = view.h * f; const g = { x: px - (px - view.x) * (nh / view.h), y: py - (py - view.y) * (nh / view.h), h: nh };
      clampView(g); Object.assign(goal, g); Object.assign(view, g);
    },
    screenOf(id, out) {
      if (!L || !L.sites[id]) return null;
      tmp.set(...L.sites[id]).project(cam);
      out.x = (tmp.x * 0.5 + 0.5) * innerWidth; out.y = (-tmp.y * 0.5 + 0.5) * innerHeight; return out;
    },
    frame(dt) {
      if (!ready) return;
      t += dt;
      const k = 1 - Math.exp(-4 * dt);
      clampView(goal);
      view.x += (goal.x - view.x) * k; view.y += (goal.y - view.y) * k; view.h += (goal.h - view.h) * k;
      applyView();
      step(dt);
      S.renderPlain(scene, cam);
    },
  };
}
