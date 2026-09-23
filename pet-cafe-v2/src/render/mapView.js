// src/render/mapView.js — the journey map in 3D: the Blender island diorama (art/build_map.py) under the
// same light and finishing pass as the cafés, with bobbing pins, drifting clouds and boats, and a camera
// that glides to whichever café you pick. Rendered only while the map is open.
import * as THREE from 'three';
import { loadKit, kitClone, createBatch } from './kit.js';

export const SITES = {
  town:  { x: -6, z: 4, y: 1.0, art: '🏡' },
  beach: { x: 9, z: 7.2, y: 0.6, art: '🏖️' },
  lodge: { x: 7, z: -5, y: 1.0, art: '🏔️' },
  night: { x: -7, z: -5, y: 1.0, art: '🏮' },
};
const MAP_KIT = ['map/m_island', 'map/m_mountains', 'map/m_towncafe', 'map/m_beachshack', 'map/m_lodge', 'map/m_market', 'map/m_lighthouse',
  'map/m_boat', 'map/m_cloud', 'map/m_pin', 'map/m_road', 'town/t_tree_a', 'town/t_tree_b', 'town/t_tree_c', 'beach/b_palm_a', 'beach/b_palm_b',
  'beach/b_parasol_coral', 'beach/b_parasol_navy', 'city/building_A', 'city/building_B', 'city/building_E'];
const PIN_COL = { done: '#FFC940', here: '#FF8A3D', open: '#3DBA78', buy: '#3DBA78', locked: '#AEB6BD', soon: '#B9AEDB' };

function emojiSprite(e) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '92px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(e, 64, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, toneMapped: false }));
  s.scale.set(0.95, 0.95, 1); s.renderOrder = 5;
  return s;
}

export function createMapView(S) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7FCBE8');
  scene.fog = new THREE.Fog('#9DD7EE', 45, 90);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 120);
  scene.add(new THREE.HemisphereLight('#FFF4E2', '#6A9FB5', 1.0));
  const sun = new THREE.DirectionalLight('#FFE9C9', 1.9); sun.position.set(12, 22, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0004; scene.add(sun);
  let ready = false, loading = null, t = 0;
  const pins = {}, boats = [], clouds = [];
  const target = new THREE.Vector3(0, 0, 1), goal = new THREE.Vector3(0, 0, 1);
  let dist = 34, goalDist = 34;

  // the sea: a wide toon plane, a shallow ring round the island, a slowly swaying foam line
  const sea = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshToonMaterial({ color: '#4FB3D6' }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.3; sea.receiveShadow = true; scene.add(sea);
  const shallow = new THREE.Mesh(new THREE.CircleGeometry(19, 64), new THREE.MeshBasicMaterial({ color: '#8FDCEB', transparent: true, opacity: 0.8, depthWrite: false }));
  shallow.rotation.x = -Math.PI / 2; shallow.scale.set(1, 0.8, 1); shallow.position.y = -0.28; scene.add(shallow);
  const foam = new THREE.Mesh(new THREE.RingGeometry(18.4, 19.2, 64), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.7, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.scale.set(1, 0.8, 1); foam.position.y = -0.27; scene.add(foam);

  function build() {
    const B = createBatch();
    for (const n of ['m_island', 'm_mountains', 'm_road']) B.put('map/' + n, 0, 0, 0, 0, 1);
    B.put('map/m_towncafe', SITES.town.x, 0, SITES.town.z, 0, 1);
    B.put('map/m_beachshack', SITES.beach.x, 0, SITES.beach.z, 0, 1);
    B.put('map/m_lodge', SITES.lodge.x, 0, SITES.lodge.z, 0, 1);
    B.put('map/m_market', SITES.night.x, 0, SITES.night.z, 0, 1);
    B.put('map/m_lighthouse', -14.5, -0.3, 9.5, 0, 1);
    // town: little houses round the café, trees everywhere, palms and parasols on the cove
    for (const [n, x, z, r] of [['building_A', -9.2, 5.6, 0.3], ['building_B', -3.2, 6.2, -0.2], ['building_E', -8.6, 1.4, 0.8], ['building_B', -3.6, 2.2, 0.1]]) B.put('city/' + n, x, 1.0, z, r, 0.9);
    const trees = [[-11, -1], [-12, 3.5], [-2, -3], [0, 7.5], [3, 3], [4.5, -2.5], [-3.5, -8.5], [-10.5, -7.5], [1, -8.8], [12.5, 1], [10.5, -1.5], [-0.5, 3.2], [-6.5, 8.5], [6.5, 1.5]];
    trees.forEach(([x, z], i) => B.put('town/' + ['t_tree_a', 't_tree_b', 't_tree_c'][i % 3], x, 1.0, z, i, 0.75 + (i % 3) * 0.1));
    for (const [x, z, n] of [[11.5, 9.0, 'b_palm_a'], [6.8, 9.6, 'b_palm_b'], [12.5, 5.5, 'b_palm_b'], [8, 4.2, 'b_palm_a']]) B.put('beach/' + n, x, 0.55, z, x, 0.7);
    B.put('beach/b_parasol_coral', 10.8, 0.55, 8.4, 0, 0.55); B.put('beach/b_parasol_navy', 7.4, 0.55, 8.7, 0, 0.55);
    B.bake(scene);
    for (let i = 0; i < 2; i++) { const b = kitClone('map/m_boat', 1); b.userData = { r: 22 + i * 3, a: i * 2.6, s: 0.05 + i * 0.02 }; scene.add(b); boats.push(b); }
    for (let i = 0; i < 4; i++) { const c = kitClone('map/m_cloud', 1.2 + (i % 2) * 0.4); c.traverse(o => { if (o.isMesh) o.castShadow = false; }); c.userData = { x: -25 + i * 14, z: -10 + (i * 7) % 18, y: 9 + (i % 3), v: 0.4 + i * 0.1 }; scene.add(c); clouds.push(c); }
    for (const id of Object.keys(SITES)) {
      const s = SITES[id], g = new THREE.Group();
      const p = kitClone('map/m_pin', 1); const mat = new THREE.MeshToonMaterial({ color: PIN_COL.locked });
      p.traverse(o => { if (o.isMesh) o.material = mat; });
      const icon = emojiSprite(s.art); icon.position.set(0, 1.25, 0.46);
      g.add(p, icon); g.position.set(s.x, s.y + 2.6, s.z); scene.add(g);
      pins[id] = { g, mat, base: s.y + 2.6 };
    }
    ready = true;
  }

  return {
    scene, camera,
    load() { return loading || (loading = loadKit(MAP_KIT).then(build)); },
    get ready() { return ready; },
    setPin(id, state) { if (pins[id]) pins[id].mat.color.set(PIN_COL[state] || PIN_COL.locked); },
    focus(id, instant = false, near = false) {
      const s = SITES[id] || { x: 0, z: 1 };
      goal.set(s.x * 0.45, 0, s.z * 0.45 + 2); goalDist = near ? 22 : 30;
      if (instant) { target.copy(goal); dist = goalDist; }
    },
    wide(instant = false) { goal.set(0, 0, 1); goalDist = 40; if (instant) { target.copy(goal); dist = goalDist; } },
    screenOf(id, out) {
      const s = SITES[id]; if (!s || !pins[id]) return null;
      const v = new THREE.Vector3(s.x, pins[id].g.position.y - 0.2, s.z).project(camera);
      out.x = (v.x * 0.5 + 0.5) * innerWidth; out.y = (-v.y * 0.5 + 0.5) * innerHeight; return out;
    },
    frame(dt) {
      t += dt;
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      // a portrait phone sees less across: stand further back so the whole island fits
      const fit = camera.aspect < 1 ? Math.min(1.9, 0.8 / Math.max(0.42, camera.aspect)) : 1;
      target.lerp(goal, 1 - Math.exp(-3 * dt)); dist += (goalDist * fit - dist) * (1 - Math.exp(-3 * dt));
      const sway = Math.sin(t * 0.25) * 0.08, pitch = 0.95;
      camera.position.set(target.x + Math.sin(sway) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, target.z + Math.cos(sway) * Math.cos(pitch) * dist);
      camera.lookAt(target.x, 0.8, target.z);
      for (const id in pins) { const p = pins[id]; p.g.position.y = p.base + Math.sin(t * 2 + p.base * 3) * 0.18; p.g.rotation.y = Math.sin(t * 0.8 + p.base) * 0.25; }
      for (const b of boats) { const u = b.userData, a = u.a + t * u.s; b.position.set(Math.cos(a) * u.r, -0.3 + Math.sin(t * 1.5 + u.a) * 0.05, Math.sin(a) * u.r * 0.75); b.rotation.y = -a; }
      for (const c of clouds) { const u = c.userData; c.position.set(((u.x + t * u.v + 30) % 60) - 30, u.y, u.z); }
      foam.material.opacity = 0.55 + Math.sin(t * 1.2) * 0.2; foam.scale.set(1 + Math.sin(t * 0.9) * 0.01, 0.8, 1);
      S.renderWith(scene, camera);
    },
  };
}
