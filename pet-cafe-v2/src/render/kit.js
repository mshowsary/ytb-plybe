// src/render/kit.js — the KayKit asset kits (CC0, Kay Lousberg): loading, placing, and batching.
//
// Models live in public/kk/<pack>/<name>.gltf and share one texture atlas per pack. Everything static
// is placed with `put()` into a batch, and `bake()` merges each batch by material into a single mesh, so
// a fully dressed café is a handful of draw calls however many props it holds.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

THREE.Cache.enabled = true;              // the shared atlas png is fetched once per pack
const loader = new GLTFLoader();
const models = new Map();                // 'pack/name' -> THREE.Group (the loaded scene)
const packMat = new Map();               // pack -> its one shared material
const BASE = './kk/';

export function loadKit(names) {
  const todo = [...new Set(names)].filter(n => !models.has(n));
  return Promise.all(todo.map(n => new Promise(res => {
    loader.load(BASE + n + '.gltf', g => {
      const pack = n.split('/')[0];
      g.scene.traverse(o => {
        if (o.isMesh && o.material) {
          // one material per pack (every model in a pack shares its atlas), so a batch of a whole
          // pack bakes into a single mesh; a soft, matte response to sit with the characters
          if (!packMat.has(pack)) {
            const m = o.material; m.roughness = 1; m.metalness = 0; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            packMat.set(pack, m);
          }
          o.material = packMat.get(pack);
        }
      });
      models.set(n, g.scene); res();
    }, undefined, () => { console.warn('kit: missing', n); res(); });
  })));
}

export function kitHas(name) { return models.has(name); }

// A fresh copy of a model (for things that move or change).
export function kitClone(name, s = 1) {
  const src = models.get(name);
  const o = src ? src.clone(true) : new THREE.Group();
  o.scale.setScalar(s);
  o.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  return o;
}

// A batch of static props: put() many, bake() once into merged meshes (one per material).
export function createBatch() {
  const items = [];
  return {
    // s: a uniform scale, or [sx, sy, sz] to stretch a piece to fit (walls and floors sized to the room)
    put(name, x, y, z, ry = 0, s = 1) {
      const src = models.get(name); if (!src) return;
      const v = Array.isArray(s) ? new THREE.Vector3(s[0], s[1], s[2]) : new THREE.Vector3(s, s, s);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), v);
      items.push({ src, m });
    },
    bake(parent, { cast = true } = {}) {
      const byMat = new Map();
      for (const { src, m } of items) {
        src.updateMatrixWorld(true);
        src.traverse(o => {
          if (!o.isMesh) return;
          const g = o.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, o.matrixWorld));
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          if (g.index) { /* keep */ }
          const key = o.material.uuid;
          if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [] });
          byMat.get(key).geos.push(g);
        });
      }
      const meshes = [];
      for (const { mat, geos } of byMat.values()) {
        const idx = geos.every(g => g.index), same = geos.map(g => idx ? g : g.toNonIndexed());
        const merged = mergeGeometries(same, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast; mesh.receiveShadow = true;
        parent.add(mesh); meshes.push(mesh);
      }
      items.length = 0;
      return meshes;
    },
  };
}
