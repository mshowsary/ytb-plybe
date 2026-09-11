// src/render/butterflies.js — the café's daytime insects: butterflies and bees on the flower beds.
//
// WHAT WAS WRONG
// This module used to place three butterflies at three hardcoded coordinates
// (x 7.0-8.6, z 3.5-5.6) which happen to be the z_garden bushes — a late, paid unlock. Two
// consequences the owner spotted:
//
//   1. Context. The beds the player can actually see are the fourteen planters along the fence line,
//      built by render/environment.js. For most of the early game the bushes do not exist, so the
//      butterflies fluttered over bare floor while the real planting sat unvisited. The old comment
//      even said "near bushes", so the intent was right and the plumbing was missing.
//   2. Diurnal coherence. `update()` had NO night gate at all, so the butterflies flew at midnight
//      alongside ambience.js's fireflies — the opposite of the intended rule that day insects hand
//      over to fireflies and lamp glow at dusk.
//
// WHAT IT DOES NOW
// Positions come from the beds environment.js actually placed (`environment.bedAnchors`), so the two
// can never drift apart. Insects are distributed across the middle of the bed row deterministically,
// so a reload shows the same café and screenshots stay comparable. The whole group fades out as
// `night` rises and is hidden outright past the cutoff, which also skips the draw. `night` is the
// SAME 0..1 signal game.js already sends to ambience.setNight and environment.setNight — one dusk
// authority for the whole café, rather than each ambience module keeping its own clock.
import * as THREE from 'three';

const WING_COLORS = ['#FF8A80', '#B7ACFB', '#FFD166'];
// Day insects are gone well before full dark: the handover to fireflies should read as a changeover,
// not as two sets of insects sharing the dusk.
const DAY_CUTOFF = 0.45;

function createButterfly(color) {
  const root = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide, transparent: true });
  const bodyMat = new THREE.MeshToonMaterial({ color: '#4A3B32', transparent: true });

  const bodyGeo = new THREE.CylinderGeometry(0.015, 0.012, 0.12, 5);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  root.add(body);

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
  return { root, leftWing, rightWing, mats: [mat, bodyMat] };
}

// A bee reads as a bee at this scale through three things, not through detail: it is smaller than a
// butterfly, it is banded, and it works the bed in a tight low loop instead of touring it.
function createBee() {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshToonMaterial({ color: '#F2C14E', transparent: true });
  const bandMat = new THREE.MeshToonMaterial({ color: '#3B2E28', transparent: true });
  const wingMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), bodyMat);
  body.scale.z = 1.35;
  root.add(body);
  for (const oz of [-0.018, 0.026]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 4, 8), bandMat);
    band.position.z = oz;
    root.add(band);
  }
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), wingMat);
    w.position.set(sx * 0.03, 0.032, 0);
    w.rotation.x = -Math.PI / 2.6;
    root.add(w);
    wings.push(w);
  }
  return { root, wings, mats: [bodyMat, bandMat, wingMat], wingOpacity: 0.5 };
}

export function createButterflies(scene, opts = {}) {
  const group = new THREE.Group();
  group.name = 'butterflies';
  scene.add(group);

  const bedList = () => (Array.isArray(opts.beds) ? opts.beds : (opts.beds && opts.beds.bedAnchors) || []);
  const night = typeof opts.night === 'function' ? opts.night : () => 0;

  // Beds are picked from the interior 70% of the row: its ends sit against the map edge and past the
  // terrace, where insects would read as flying over nothing. Stride and offset are coprime with the
  // bed count so no two insects share a bed and the spread is even rather than clumped.
  // Returns an INDEX, not a position: buildScenery reseeds the beds on every season change, so a
  // cached {x,z} would leave the insects working a layout that no longer exists.
  const pickBedIndex = i => {
    const count = bedList().length;
    if (!count) return -1;
    const span = Math.max(1, Math.floor(count * 0.7));
    const start = Math.floor(count * 0.15);
    return start + ((i * 3 + 1) % span);
  };
  const bedAt = i => {
    const list = bedList();
    return i < 0 || !list.length ? null : list[i % list.length];
  };

  const butterflies = [];
  const bees = [];
  for (let i = 0; i < 4; i++) {
    const b = createButterfly(WING_COLORS[i % WING_COLORS.length]);
    group.add(b.root);
    butterflies.push({
      ...b,
      bedIndex: pickBedIndex(i),
      phase: i * 1.7,
      radius: 0.85 + (i % 3) * 0.22,
      speed: 0.42 + (i % 4) * 0.09,
      height: 0.78 + (i % 3) * 0.16,
      flapSpeed: 17 + i * 2.5,
    });
  }
  for (let i = 0; i < 3; i++) {
    const b = createBee();
    group.add(b.root);
    bees.push({
      ...b,
      bedIndex: pickBedIndex(i + 4),
      phase: i * 2.3 + 0.6,
      radius: 0.3 + (i % 3) * 0.08,
      speed: 1.5 + (i % 3) * 0.35,
      height: 0.4 + (i % 3) * 0.09,
      flapSpeed: 42 + i * 5,
    });
  }

  let t = 0;
  let shownDay = -1;

  // Fade by material opacity, then hide outright past the cutoff: an invisible group costs no draw
  // call, which matters on Playables hardware at dusk when the fireflies have just come on.
  function applyDaylight(day) {
    if (day === shownDay) return;
    shownDay = day;
    group.visible = day > 0.02;
    for (const b of butterflies) {
      for (const m of b.mats) m.opacity = day;
    }
    for (const b of bees) {
      b.mats[0].opacity = day;
      b.mats[1].opacity = day;
      b.mats[2].opacity = b.wingOpacity * day;
    }
  }

  return {
    group,
    // Exposed for the ambience smoke test: how many insects are actually placed on real beds.
    placed: () => butterflies.filter(b => b.bedIndex >= 0).length + bees.filter(b => b.bedIndex >= 0).length,
    update(dt) {
      t += dt;
      const k = Math.max(0, Math.min(1, Number(night()) || 0));
      const day = Math.max(0, Math.min(1, 1 - k / DAY_CUTOFF));
      applyDaylight(day);
      if (!group.visible) return;

      for (const b of butterflies) {
        const bed = bedAt(b.bedIndex); if (!bed) { b.root.visible = false; continue; }
        b.root.visible = true;
        const p = t * b.speed + b.phase;
        const x = bed.x + Math.sin(p) * b.radius;
        const z = bed.z + Math.sin(p * 2) * (b.radius * 0.6);
        // Dips toward the blooms as it goes: a butterfly that only circles at one height reads as a
        // model on a string.
        const y = b.height - 0.16 + Math.sin(p * 3) * 0.14 + Math.cos(t * 1.5) * 0.05;
        b.root.position.set(x, y, z);
        const dx = Math.cos(p) * b.radius;
        const dz = 2 * Math.cos(p * 2) * (b.radius * 0.6);
        b.root.rotation.y = Math.atan2(-dz, dx);
        b.root.rotation.z = Math.sin(t * 3) * 0.15;
        const flap = Math.sin(t * b.flapSpeed + b.phase) * 0.85;
        b.leftWing.rotation.y = flap;
        b.rightWing.rotation.y = -flap;
      }

      for (const b of bees) {
        const bed = bedAt(b.bedIndex); if (!bed) { b.root.visible = false; continue; }
        b.root.visible = true;
        const p = t * b.speed + b.phase;
        const x = bed.x + Math.sin(p) * b.radius;
        const z = bed.z + Math.cos(p * 1.4) * b.radius;
        const y = b.height + Math.sin(p * 7) * 0.05;
        b.root.position.set(x, y, z);
        b.root.rotation.y = Math.atan2(-Math.cos(p), Math.sin(p));
        const buzz = Math.sin(t * b.flapSpeed + b.phase) * 0.5;
        b.wings[0].rotation.z = buzz;
        b.wings[1].rotation.z = -buzz;
      }
    },
  };
}
