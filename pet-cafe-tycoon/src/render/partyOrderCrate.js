import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial } from './palette.js';
import { itemGeoFor } from './props.js';
import { partyOrderComplete, partyOrderProgress } from '../sim/partyOrders.js';

const FAMILIES = ['cookie', 'cupcake', 'coffee', 'smoothie', 'treat'];
const SLOT_COUNT = 15;

function makeCrateMesh() {
  const parts = [
    part('rbox', [1.65, 0.18, 0.72, 0.05], C.wood, { y: 0.1 }),
    part('box', [1.72, 0.12, 0.08], C.woodDark, { y: 0.27, z: -0.34 }),
    part('box', [1.72, 0.12, 0.08], C.woodDark, { y: 0.27, z: 0.34 }),
    part('box', [0.08, 0.34, 0.72], C.woodDark, { x: -0.82, y: 0.18 }),
    part('box', [0.08, 0.34, 0.72], C.woodDark, { x: 0.82, y: 0.18 }),
    part('rbox', [0.54, 0.28, 0.05, 0.03], C.cream, { x: 0.44, y: 0.55, z: -0.34 }),
    part('box', [0.38, 0.04, 0.055], C.accent, { x: 0.44, y: 0.55, z: -0.375 }),
  ];
  const mesh = new THREE.Mesh(merge(parts), toonMaterial());
  mesh.castShadow = false; mesh.receiveShadow = true;
  return mesh;
}

function matrixForSlot(index, scale = 0.72) {
  const col = index % 5, row = Math.floor(index / 5);
  const p = new THREE.Vector3(-0.62 + col * 0.31, 0.38 + row * 0.03, -0.2 + row * 0.19);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ((index * 37) % 11 - 5) * 0.035, 0));
  const s = new THREE.Vector3(scale, scale, scale);
  return new THREE.Matrix4().compose(p, q, s);
}

export function partyOrderCrateModel(active) {
  if (!active) return { id: null, target: 0, fulfilled: 0, complete: false, byFamily: {} };
  const progress = partyOrderProgress(active);
  const byFamily = {};
  for (const row of active.requirements || []) {
    if (!FAMILIES.includes(row.key)) continue;
    byFamily[row.key] = Math.min(Math.max(0, row.count | 0), Math.max(0, row.target | 0));
  }
  return {
    id: active.id | 0,
    target: progress.target | 0,
    fulfilled: progress.count | 0,
    complete: partyOrderComplete(active),
    byFamily,
  };
}

export function createPartyOrderCrate(area) {
  const group = new THREE.Group();
  group.name = 'party-order-crate';
  group.visible = false;
  // Side-wall shelf: readable from the normal camera, physically out of every navigation lane.
  group.position.set(area.size.w / 2 - 0.42, 1.02, 0.25);
  group.rotation.y = -Math.PI / 2;
  group.add(makeCrateMesh());

  const familyMeshes = new Map();
  for (const key of FAMILIES) {
    const im = new THREE.InstancedMesh(itemGeoFor(key), toonMaterial(), SLOT_COUNT);
    im.count = 0; im.castShadow = false; im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    familyMeshes.set(key, im); group.add(im);
  }

  const cue = new THREE.Group();
  cue.name = 'party-order-ready-cue'; cue.visible = false;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 32), emissiveMaterial(C.coin));
  ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.72, 0);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), emissiveMaterial(C.coin));
  gem.position.set(0, 1.02, 0);
  cue.add(ring, gem); group.add(cue);

  let model = partyOrderCrateModel(null), pulse = 0, readyT = 0;

  function applyModel(next) {
    const previousFulfilled = model.fulfilled;
    model = next;
    group.visible = !!model.id;
    cue.visible = !!model.complete;
    if (!model.id) {
      for (const im of familyMeshes.values()) im.count = 0;
      pulse = 0; readyT = 0;
      return;
    }

    let slot = 0;
    for (const key of FAMILIES) {
      const im = familyMeshes.get(key); const count = model.byFamily[key] || 0;
      im.count = count;
      for (let i = 0; i < count; i++) im.setMatrixAt(i, matrixForSlot(slot++));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
    if (model.fulfilled > previousFulfilled) pulse = 0.34;
    if (model.complete) readyT = Math.max(readyT, 0.001);
  }

  function setOrder(active) { applyModel(partyOrderCrateModel(active)); }
  function bump() { pulse = Math.max(pulse, 0.34); }
  function update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    pulse = Math.max(0, pulse - step);
    const bumpScale = pulse > 0 ? 1 + Math.sin((1 - pulse / 0.34) * Math.PI) * 0.08 : 1;
    group.scale.setScalar(bumpScale);
    if (cue.visible) {
      readyT += step;
      cue.position.y = Math.sin(readyT * 3.2) * 0.045;
      cue.rotation.y += step * 1.2;
      const s = 1 + Math.sin(readyT * 4.5) * 0.08;
      cue.scale.setScalar(s);
    } else {
      readyT = 0; cue.position.y = 0; cue.rotation.y = 0; cue.scale.setScalar(1);
    }
  }

  return {
    group, setOrder, update, bump,
    get activeId() { return model.id; },
    get fulfilled() { return model.fulfilled; },
    get target() { return model.target; },
    get complete() { return model.complete; },
    get visibleFamilyCounts() {
      const out = {}; for (const [key, im] of familyMeshes) out[key] = im.count; return out;
    },
  };
}
