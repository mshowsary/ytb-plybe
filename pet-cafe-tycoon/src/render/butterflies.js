// src/render/butterflies.js — fluttering garden butterflies adding atmospheric charm and life.
import * as THREE from 'three';

const WING_COLORS = ['#FF8A80', '#B7ACFB', '#FFD166'];

function createButterfly(color) {
  const root = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide });
  const bodyMat = new THREE.MeshToonMaterial({ color: '#4A3B32' });

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.015, 0.012, 0.12, 5);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  root.add(body);

  // Wings: triangular shapes
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.12, 0.08);
  wingShape.quadraticCurveTo(0.16, 0.02, 0.14, -0.04);
  wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape);

  const leftWing = new THREE.Mesh(wingGeo, mat);
  leftWing.position.set(-0.01, 0.01, 0);
  leftWing.rotation.x = -Math.PI / 2;

  const rightWing = new THREE.Mesh(wingGeo, mat);
  rightWing.position.set(0.01, 0.01, 0);
  rightWing.rotation.x = -Math.PI / 2;
  rightWing.scale.x = -1;

  root.add(leftWing, rightWing);

  return { root, leftWing, rightWing };
}

export function createButterflies(scene) {
  const group = new THREE.Group();
  group.name = 'butterflies';
  scene.add(group);

  const butterflies = [];
  const basePositions = [
    { x: 7.5, z: 3.5, y: 0.9, radius: 1.2, speed: 0.6, flapSpeed: 20 },
    { x: 8.6, z: 4.8, y: 1.1, radius: 0.9, speed: 0.8, flapSpeed: 24 },
    { x: 7.0, z: 5.6, y: 0.8, radius: 1.1, speed: 0.5, flapSpeed: 18 },
  ];

  for (let i = 0; i < 3; i++) {
    const b = createButterfly(WING_COLORS[i % WING_COLORS.length]);
    const cfg = basePositions[i];
    group.add(b.root);
    butterflies.push({
      ...b,
      cfg,
      phase: i * 2.1,
    });
  }

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      for (const b of butterflies) {
        const p = t * b.cfg.speed + b.phase;
        // Wander in a figure-8 / oval near bushes
        const x = b.cfg.x + Math.sin(p) * b.cfg.radius;
        const z = b.cfg.z + Math.sin(p * 2) * (b.cfg.radius * 0.6);
        const y = b.cfg.y + Math.sin(p * 3) * 0.22 + Math.cos(t * 1.5) * 0.08;

        b.root.position.set(x, y, z);

        // Heading direction
        const dx = Math.cos(p) * b.cfg.radius;
        const dz = 2 * Math.cos(p * 2) * (b.cfg.radius * 0.6);
        b.root.rotation.y = Math.atan2(-dz, dx);
        b.root.rotation.z = Math.sin(t * 3) * 0.15;

        // Wing flapping
        const flap = Math.sin(t * b.cfg.flapSpeed + b.phase) * 0.85;
        b.leftWing.rotation.y = flap;
        b.rightWing.rotation.y = -flap;
      }
    },
  };
}
