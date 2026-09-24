// src/render/life.js — the small things that make the café feel lived in: the café's own cat asleep on
// the window sill, and a chalkboard on the pavement that shows today's menu (it grows as you build).
import * as THREE from 'three';
import { createPet } from './pets.js';
import { part, mesh } from './geo.js';
import { ROOM, PRODUCTS } from '../game/layout.js';
import * as L from '../game/layout.js';

export function createLife(scene, W) {
  // --- the café cat, on the left window sill, facing into the room ---------------------------
  const beach = L.LOC.theme === 'beach', mall = L.LOC.theme === 'mall';
  const cat = createPet('cat', beach ? 6 : mall ? 11 : 1);
  // town: asleep on the deep window sill; beach: along the top of the left railing; mall: on the velvet pouf
  if (beach) { cat.group.position.set(ROOM.x0, 1.03, 1.9); cat.group.rotation.y = 0; }
  else if (mall) { cat.group.position.set(ROOM.x0 + 0.5, 0.44, 1.25); cat.group.rotation.y = Math.PI / 2; }
  else { cat.group.position.set(ROOM.x0 + 0.24, 1.47, 1.2); cat.group.rotation.y = Math.PI / 2; }
  cat.sit();
  scene.add(cat.group);

  // --- the pavement chalkboard ---------------------------------------------------------------
  const board = new THREE.Group();
  board.position.set(4.3, 0, 6.0); board.rotation.y = -0.25;
  board.add(mesh([
    part('box', [0.06, 1.1, 0.06], '#8E6236', { x: -0.4, y: 0.55, z: -0.18, rx: 0.18 }),
    part('box', [0.06, 1.1, 0.06], '#8E6236', { x: 0.4, y: 0.55, z: -0.18, rx: 0.18 }),
    part('box', [0.06, 1.1, 0.06], '#8E6236', { x: -0.4, y: 0.55, z: 0.18, rx: -0.18 }),
    part('box', [0.06, 1.1, 0.06], '#8E6236', { x: 0.4, y: 0.55, z: 0.18, rx: -0.18 }),
    part('box', [0.9, 0.9, 0.04], '#8E6236', { y: 0.62, z: 0.2, rx: -0.18 }),
  ]));
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 0.62, 0.225); face.rotation.x = -0.18; board.add(face);
  scene.add(board);
  let shown = '';
  function drawBoard() {
    const items = W.built('counter').map(ct => ct.product);
    const key = items.join(',');
    if (key === shown) return; shown = key;
    const g = c.getContext('2d');
    g.fillStyle = '#2F3B36'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#FFFFFF55'; g.lineWidth = 4; g.strokeRect(10, 10, 236, 236);
    g.font = '30px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center';
    g.fillStyle = '#FFFFFF'; g.fillText('🐾', 128, 48);
    items.forEach((p, i) => {
      const y = 92 + i * 44;
      g.font = '32px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'left'; g.fillText(PRODUCTS[p].emoji, 48, y);
      g.font = 'bold 30px ui-rounded, "Arial Rounded MT Bold", sans-serif'; g.fillStyle = '#FFE08A'; g.textAlign = 'right'; g.fillText(String(W.price(p)), 206, y);
      g.fillStyle = '#FFFFFF';
    });
    tex.needsUpdate = true;
  }

  return {
    update(dt) {
      cat.idleLife?.(dt, {});
      cat.update(dt, false, 0);
      drawBoard();
    },
  };
}
