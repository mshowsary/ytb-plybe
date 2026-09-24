// src/render/butterflies.js — the café's daytime insects: butterflies and bees on the flower beds.
//
// WHAT WAS WRONG (before the anchoring fix)
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
// Positions come from the beds environment.js actually placed (`environment.bedAnchors`), so the two
// can never drift apart. Insects are distributed across the middle of the bed row deterministically,
// so a reload shows the same café and screenshots stay comparable. The whole group fades out as
// `night` rises and is hidden outright past the cutoff, which also skips the draw. `night` is the
// SAME 0..1 signal game.js already sends to ambience.setNight and environment.setNight — one dusk
// authority for the whole café, rather than each ambience module keeping its own clock.
//
// DRAW-CALL DIET (2026-09-15, Batch 8 "Ground and grain"): this used to be one THREE.Group per
// creature — 4 butterflies x 3 meshes (body + 2 wings) + 3 bees x 5 meshes (body + 2 abdomen bands +
// 2 wings) = 27 draw calls for seven small, mostly-static insects (measured via
// tools/scene-cost.mjs's topGroups bucket on the 'butterflies' root). Only the wings (and, for bees,
// the buzzing wings) ever need a transform independent of their creature's own flight path; a body
// never moves relative to its own root, and a bee's two abdomen bands never move at all relative to
// each other or the body. So every part is now one InstancedMesh per (creature-type, part) pair, and
// each instance's matrix is composed every frame as (that creature's flight-path transform) x (that
// part's fixed local offset/animation) — see `composeInstance` below.
//
// The one thing that does NOT survive instancing is a MIRRORED (negative-determinant) per-instance
// SCALE: three.js's instancing shader transforms normals with the instance matrix's 3x3 part
// directly rather than its inverse-transpose (a shortcut that is exact for rotation + uniform scale,
// and wrong for a mirror), so the old `rightWing.scale.x = -1` trick would relight the right wing
// incorrectly if it rode in the per-frame instance matrix. It is baked into the RIGHT WING'S OWN
// GEOMETRY instead (once, at creation, via BufferGeometry.scale — which DOES recompute normals
// correctly), so the left and right wing instance matrices only ever carry rotation and translation.
// That costs one extra draw call (a separate InstancedMesh per wing side) in exchange for provably
// correct lighting.
//
// Total: 6 draw calls for all seven insects combined (butterflies: body, left wing, right wing; bees:
// body, abdomen bands, wings) — comfortably inside the "1-2 draw calls per creature" target.
import * as THREE from 'three';
import { part, merge, colorize } from './geo.js';

const WING_COLORS = ['#FF8A80', '#B7ACFB', '#FFD166'];
// Day insects are gone well before full dark: the handover to fireflies should read as a changeover,
// not as two sets of insects sharing the dusk.
const DAY_CUTOFF = 0.45;
const BUTTERFLY_COUNT = 4;
const BEE_COUNT = 3;

// Matches geo.js part()'s own finish (delete the uv attribute, bake a vertex-colour attribute) for
// the shapes part() cannot express at all (a custom Shape, a torus, a circle) — none of these are
// vertex-coloured in practice (every material below is a uniform colour, and none of these geometries
// are ever merged with anything outside this file), but keeping the attribute footprint consistent
// with part()'s own output costs nothing and matches environment.js's identical `finish()` helper.
function finish(g, hex) { g.deleteAttribute('uv'); return colorize(g, hex); }

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

  // ---- geometry ------------------------------------------------------------------------------------
  // Butterfly body: a thin cylinder lying flat. The old code set this tilt on the mesh
  // (`body.rotation.x = Math.PI/2`); baked into the geometry via part()'s own rx transform instead,
  // so a body's per-frame instance matrix is exactly the root's flight-path transform — nothing else
  // to compose.
  const butterflyBodyGeo = part('cyl', [0.015, 0.012, 0.12, 5], '#4A3B32', { rx: Math.PI / 2 });

  // Butterfly wing: a hand-drawn Shape (part() has no 'shape' primitive). The right wing is a second,
  // pre-mirrored copy of the same geometry (see the file header on why the mirror lives here and not
  // in the instance matrix) — both still share one material and one instance colour per butterfly.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.12, 0.08);
  wingShape.quadraticCurveTo(0.16, 0.02, 0.14, -0.04);
  wingShape.lineTo(0, 0);
  const butterflyWingGeoL = new THREE.ShapeGeometry(wingShape);
  const butterflyWingGeoR = butterflyWingGeoL.clone();
  butterflyWingGeoR.scale(-1, 1, 1);

  // Bee body: a squashed sphere. part('sph', [r, seg]) forces heightSegments = seg >> 1 (geo.js:18),
  // which cannot reproduce the original's independently-chosen (6, 5) — see environment.js's own note
  // above `petalLobe`/`dome` for the same limit — so this stays hand-built, finished like everything
  // part() cannot make. The z-squash (scale.z = 1.35) is baked in too, for the same reason bodies
  // never need a local transform composed onto the root each frame.
  const beeBodyGeo = finish(new THREE.SphereGeometry(0.042, 6, 5).scale(1, 1, 1.35), '#F2C14E');

  // Bee abdomen bands: two rings at fixed offsets (z -0.018 and +0.026 — exactly where createBee()
  // used to place its two separate ring meshes) pre-merged into ONE static geometry, so a bee's bands
  // cost one instance instead of two: they never move relative to the bee or to each other, which is
  // geo.js's whole "any two static props can be merged" rule applied one level down from a mesh.
  const ring = () => new THREE.TorusGeometry(0.04, 0.011, 4, 8);
  const beeBandsGeo = merge([
    finish(ring().translate(0, 0, -0.018), '#3B2E28'),
    finish(ring().translate(0, 0, 0.026), '#3B2E28'),
  ]);

  // Bee wing: a flat disc, shared by both of a bee's wings (mirrored only by POSITION and by the sign
  // of the buzz rotation — never by scale — so, unlike the butterfly wing, no separate geometry is
  // needed for correct lighting).
  const beeWingGeo = finish(new THREE.CircleGeometry(0.045, 6), '#FFFFFF');

  // ---- materials -----------------------------------------------------------------------------------
  const butterflyWingMat = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true });
  const butterflyBodyMat = new THREE.MeshToonMaterial({ color: '#4A3B32', transparent: true });
  const beeBodyMat = new THREE.MeshToonMaterial({ color: '#F2C14E', transparent: true });
  const beeBandMat = new THREE.MeshToonMaterial({ color: '#3B2E28', transparent: true });
  const beeWingMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

  // ---- instanced meshes ------------------------------------------------------------------------------
  const butterflyBodyIM = new THREE.InstancedMesh(butterflyBodyGeo, butterflyBodyMat, BUTTERFLY_COUNT);
  const butterflyWingLeftIM = new THREE.InstancedMesh(butterflyWingGeoL, butterflyWingMat, BUTTERFLY_COUNT);
  const butterflyWingRightIM = new THREE.InstancedMesh(butterflyWingGeoR, butterflyWingMat, BUTTERFLY_COUNT);
  const beeBodyIM = new THREE.InstancedMesh(beeBodyGeo, beeBodyMat, BEE_COUNT);
  const beeBandsIM = new THREE.InstancedMesh(beeBandsGeo, beeBandMat, BEE_COUNT);
  const beeWingIM = new THREE.InstancedMesh(beeWingGeo, beeWingMat, BEE_COUNT * 2);
  const instancedMeshes = [butterflyBodyIM, butterflyWingLeftIM, butterflyWingRightIM, beeBodyIM, beeBandsIM, beeWingIM];
  for (const im of instancedMeshes) {
    // Insects roam the whole bed row every frame; a bounding sphere computed once at creation (or
    // stale from a previous frame) must never be the reason a wing clips out of frame.
    im.frustumCulled = false;
    group.add(im);
  }

  // Wing hue varies per butterfly (3 colours over 4 insects, same as the old WING_COLORS cycle) via
  // instanceColor — geometry and material stay shared; only the tint differs, so the visual variety
  // survives the merge into one draw call per wing side.
  const _col = new THREE.Color();
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    _col.set(WING_COLORS[i % WING_COLORS.length]);
    butterflyWingLeftIM.setColorAt(i, _col);
    butterflyWingRightIM.setColorAt(i, _col);
  }
  butterflyWingLeftIM.instanceColor.needsUpdate = true;
  butterflyWingRightIM.instanceColor.needsUpdate = true;

  const butterflies = [];
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    butterflies.push({
      bedIndex: pickBedIndex(i),
      phase: i * 1.7,
      radius: 0.85 + (i % 3) * 0.22,
      speed: 0.42 + (i % 4) * 0.09,
      height: 0.78 + (i % 3) * 0.16,
      flapSpeed: 17 + i * 2.5,
    });
  }
  const bees = [];
  for (let i = 0; i < BEE_COUNT; i++) {
    bees.push({
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
  // call, which matters on Playables hardware at dusk when the fireflies have just come on. Every
  // creature of a kind used to fade via its OWN copy of the same material with the SAME opacity value
  // (day), so sharing one material per part now is not a behaviour change, just fewer objects to set
  // it on.
  function applyDaylight(day) {
    if (day === shownDay) return;
    shownDay = day;
    group.visible = day > 0.02;
    butterflyWingMat.opacity = day;
    butterflyBodyMat.opacity = day;
    beeBodyMat.opacity = day;
    beeBandMat.opacity = day;
    beeWingMat.opacity = 0.5 * day;
  }

  // Scratch Object3Ds reused every frame so the flight loop allocates nothing. Using Object3D's own
  // position/rotation/updateMatrix (rather than hand-composing quaternions) keeps the per-part local
  // transforms exactly as legible as the original per-mesh code they replace.
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const rootObj = new THREE.Object3D();
  const wingL = new THREE.Object3D(); wingL.position.set(-0.01, 0.01, 0); wingL.rotation.x = -Math.PI / 2;
  const wingR = new THREE.Object3D(); wingR.position.set(0.01, 0.01, 0); wingR.rotation.x = -Math.PI / 2;
  const beeWing0 = new THREE.Object3D(); beeWing0.position.set(-0.03, 0.032, 0); beeWing0.rotation.x = -Math.PI / 2.6;
  const beeWing1 = new THREE.Object3D(); beeWing1.position.set(0.03, 0.032, 0); beeWing1.rotation.x = -Math.PI / 2.6;
  const out = new THREE.Matrix4();

  // Where each insect actually is this frame. Batch 8 instanced these creatures, and an
  // InstancedMesh sits at the origin however far its instances roam — so tools/ambience-smoke.js,
  // which read `group.children[i].position` to check every insect was working a flowerbed, started
  // measuring the origin instead and reported an 8.2 m miss that never happened. The positions are
  // authoritative here, so they are published from here rather than inferred from the scene graph.
  const live = [];

  return {
    group,
    // Exposed for the ambience smoke test: how many insects are actually placed on real beds.
    placed: () => butterflies.filter(b => b.bedIndex >= 0).length + bees.filter(b => b.bedIndex >= 0).length,
    // The drawn position of every insect on screen right now; empty while the group is down at dusk.
    positions: () => (group.visible ? live : []),
    update(dt) {
      t += dt;
      live.length = 0;
      const k = Math.max(0, Math.min(1, Number(night()) || 0));
      const day = Math.max(0, Math.min(1, 1 - k / DAY_CUTOFF));
      applyDaylight(day);
      if (!group.visible) return;

      for (let i = 0; i < butterflies.length; i++) {
        const b = butterflies[i];
        const bed = bedAt(b.bedIndex);
        if (!bed) {
          butterflyBodyIM.setMatrixAt(i, HIDDEN);
          butterflyWingLeftIM.setMatrixAt(i, HIDDEN);
          butterflyWingRightIM.setMatrixAt(i, HIDDEN);
          continue;
        }
        const p = t * b.speed + b.phase;
        const x = bed.x + Math.sin(p) * b.radius;
        const z = bed.z + Math.sin(p * 2) * (b.radius * 0.6);
        // Dips toward the blooms as it goes: a butterfly that only circles at one height reads as a
        // model on a string.
        const y = b.height - 0.16 + Math.sin(p * 3) * 0.14 + Math.cos(t * 1.5) * 0.05;
        const dx = Math.cos(p) * b.radius;
        const dz = 2 * Math.cos(p * 2) * (b.radius * 0.6);

        live.push({ x, y, z });

        rootObj.position.set(x, y, z);
        rootObj.rotation.set(0, Math.atan2(-dz, dx), Math.sin(t * 3) * 0.15);
        rootObj.updateMatrix();
        butterflyBodyIM.setMatrixAt(i, rootObj.matrix);

        const flap = Math.sin(t * b.flapSpeed + b.phase) * 0.85;
        wingL.rotation.y = flap; wingL.updateMatrix();
        out.multiplyMatrices(rootObj.matrix, wingL.matrix);
        butterflyWingLeftIM.setMatrixAt(i, out);
        wingR.rotation.y = -flap; wingR.updateMatrix();
        out.multiplyMatrices(rootObj.matrix, wingR.matrix);
        butterflyWingRightIM.setMatrixAt(i, out);
      }
      butterflyBodyIM.instanceMatrix.needsUpdate = true;
      butterflyWingLeftIM.instanceMatrix.needsUpdate = true;
      butterflyWingRightIM.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < bees.length; i++) {
        const b = bees[i];
        const bed = bedAt(b.bedIndex);
        if (!bed) {
          beeBodyIM.setMatrixAt(i, HIDDEN);
          beeBandsIM.setMatrixAt(i, HIDDEN);
          beeWingIM.setMatrixAt(i * 2, HIDDEN);
          beeWingIM.setMatrixAt(i * 2 + 1, HIDDEN);
          continue;
        }
        const p = t * b.speed + b.phase;
        const x = bed.x + Math.sin(p) * b.radius;
        const z = bed.z + Math.cos(p * 1.4) * b.radius;
        const y = b.height + Math.sin(p * 7) * 0.05;

        live.push({ x, y, z });

        rootObj.position.set(x, y, z);
        rootObj.rotation.set(0, Math.atan2(-Math.cos(p), Math.sin(p)), 0);
        rootObj.updateMatrix();
        beeBodyIM.setMatrixAt(i, rootObj.matrix);
        beeBandsIM.setMatrixAt(i, rootObj.matrix);

        const buzz = Math.sin(t * b.flapSpeed + b.phase) * 0.5;
        beeWing0.rotation.z = buzz; beeWing0.updateMatrix();
        out.multiplyMatrices(rootObj.matrix, beeWing0.matrix);
        beeWingIM.setMatrixAt(i * 2, out);
        beeWing1.rotation.z = -buzz; beeWing1.updateMatrix();
        out.multiplyMatrices(rootObj.matrix, beeWing1.matrix);
        beeWingIM.setMatrixAt(i * 2 + 1, out);
      }
      beeBodyIM.instanceMatrix.needsUpdate = true;
      beeBandsIM.instanceMatrix.needsUpdate = true;
      beeWingIM.instanceMatrix.needsUpdate = true;
    },
  };
}
