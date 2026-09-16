// src/render/guidePath.js — the world-space half of the game's guidance: a trail of chevrons on
// the floor from the owner to wherever they are being sent, a beacon above the thing itself, and
// a soft ring on the spot to stand on.
//
// Why this replaced a lone chevron 2.4 m in the air (owner playtest, 2026-09-17, recorded on a
// fresh save in phone portrait): the target was routinely OFF SCREEN, and even when it was on
// screen a small mark in the air says "something is over there" without saying how to get there or
// where to stop. Every polished mobile tycoon draws the route on the ground — the floor is the one
// surface that is always in view under a top-down camera — and marks the destination object itself.
//
// Cost: the trail is one InstancedMesh (32 chevrons, one draw call), the beacon one mesh, the ring
// one mesh. Nothing here casts or receives shadows. All three are hidden when there is no target.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, emissiveMaterial } from './palette.js';

const TRAIL_MAX = 32;          // chevrons in the pool; a 17 m route at 0.55 m spacing
const TRAIL_SPACING = 0.55;
const TRAIL_SPEED = 1.35;      // metres per second the chevrons march toward the target
const TRAIL_Y = 0.035;         // just above the floor, below every rug and decal edge
const FADE_NEAR = 0.9;         // chevrons under the owner's feet fade so the trail starts ahead of them
const BEACON_BOB = 0.14, BEACON_HZ = 1.6;

/** A flat "^" lying on the floor, pointing along +z. Two bars, one merged geometry. */
function chevronFlat() {
  const parts = [
    part('box', [0.34, 0.02, 0.09], C.coin, { x: -0.11, z: -0.06, ry: -0.7 }),
    part('box', [0.34, 0.02, 0.09], C.coin, { x: 0.11, z: -0.06, ry: 0.7 }),
  ];
  return merge(parts);
}

/**
 * A flat, bold, down-pointing arrow plate that always faces the camera. A 3D arrow with a shaft and
 * a two-bar head foreshortened into a pale wishbone under this camera's 52-degree pitch; a 2D plate
 * turned square to the view reads as an arrow from every angle, which is the shape every polished
 * mobile tycoon puts over a target. Toon-shaded (not emissive) so it keeps the game's outline and
 * flat shading rather than blowing out to white.
 */
const CAMERA_PITCH = 52 * Math.PI / 180;
function beaconMesh() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.5, 0.42); sh.lineTo(0, -0.08); sh.lineTo(0.5, 0.42); sh.lineTo(0.2, 0.42);
  sh.lineTo(0.2, 1.05); sh.lineTo(-0.2, 1.05); sh.lineTo(-0.2, 0.42); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
  geo.translate(0, 0, -0.06);
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: new THREE.Color(C.coin) }));
  m.castShadow = false; m.receiveShadow = false;
  m.rotation.order = 'YXZ';
  m.rotation.x = -CAMERA_PITCH;
  return m;
}

export function createGuidePath(scene) {
  const trailMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(C.coin).multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.9,
  });
  const trail = new THREE.InstancedMesh(chevronFlat(), trailMat, TRAIL_MAX);
  trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trail.castShadow = false; trail.receiveShadow = false; trail.frustumCulled = false;
  trail.visible = false; trail.name = 'guide-trail';
  scene.add(trail);

  const beacon = beaconMesh(); beacon.visible = false; beacon.name = 'guide-beacon'; scene.add(beacon);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(C.coin), transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; ring.name = 'guide-ring';
  ring.castShadow = false; ring.receiveShadow = false;
  scene.add(ring);

  const route = [];            // world-space {x, z} waypoints, owner first, stand spot last
  const seg = [];              // cumulative length at each waypoint
  let routeLen = 0, phase = 0, t = 0;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let stand = null, beaconAt = null, ringOn = false;

  function setRoute(points) {
    route.length = 0; seg.length = 0; routeLen = 0;
    for (const p of points) route.push(p);
    for (let i = 0; i < route.length; i++) {
      if (i === 0) { seg.push(0); continue; }
      routeLen += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
      seg.push(routeLen);
    }
  }

  // Point and tangent at arc length d along the route.
  function sample(d, out) {
    let i = 1;
    while (i < seg.length - 1 && seg[i] < d) i++;
    const a = route[i - 1], b = route[i];
    const len = Math.max(1e-4, seg[i] - seg[i - 1]);
    const u = Math.max(0, Math.min(1, (d - seg[i - 1]) / len));
    out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u;
    out.tx = (b.x - a.x) / len; out.tz = (b.z - a.z) / len;
    return out;
  }
  const smp = { x: 0, z: 0, tx: 0, tz: 1 };

  return {
    trail, beacon, ring,
    /**
     * points: world waypoints owner -> stand spot (may be empty to hide the trail).
     * target: {x, z, y} the beacon hovers over, or null. standSpot: {x, z} for the ring, or null.
     */
    show({ points = [], target = null, standSpot = null, showBeacon = true } = {}) {
      setRoute(points);
      beaconAt = target; stand = standSpot;
      trail.visible = route.length >= 2 && routeLen > FADE_NEAR + TRAIL_SPACING;
      beacon.visible = !!target && showBeacon;
      ringOn = !!standSpot;
      ring.visible = ringOn;
    },
    hide() {
      trail.visible = false; beacon.visible = false; ring.visible = false;
      route.length = 0; beaconAt = null; stand = null; ringOn = false;
    },
    update(dt, camera, reducedMotion = false) {
      t += dt;
      if (!reducedMotion) phase = (phase + dt * TRAIL_SPEED) % TRAIL_SPACING;
      if (trail.visible) {
        let n = 0;
        // The trail starts a little ahead of the owner and ends just short of the stand spot.
        for (let d = FADE_NEAR + phase; d < routeLen - 0.35 && n < TRAIL_MAX; d += TRAIL_SPACING, n++) {
          sample(d, smp);
          P.set(smp.x, TRAIL_Y, smp.z);
          Q.setFromAxisAngle(UP, Math.atan2(smp.tx, smp.tz));
          // Fade-in over the first metre, small pulse so the trail reads as alive, not painted on.
          const fade = Math.min(1, (d - FADE_NEAR) / 0.8);
          const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 5 - d * 1.6) * 0.06;
          const s = (0.35 + 0.65 * fade) * 1.18;
          S.set(s * pulse, 1, s * pulse);
          M.compose(P, Q, S);
          trail.setMatrixAt(n, M);
        }
        for (let i = n; i < TRAIL_MAX; i++) { S.set(0, 0, 0); M.compose(P, Q, S); trail.setMatrixAt(i, M); }
        trail.count = TRAIL_MAX;
        trail.instanceMatrix.needsUpdate = true;
      }
      if (beacon.visible && beaconAt) {
        const bob = reducedMotion ? 0 : Math.sin(t * Math.PI * 2 * BEACON_HZ) * BEACON_BOB;
        beacon.position.set(beaconAt.x, (beaconAt.y || 2.4) + bob, beaconAt.z);
        if (camera) beacon.rotation.y = Math.atan2(camera.position.x - beaconAt.x, camera.position.z - beaconAt.z);
      }
      if (ringOn && stand) {
        ring.position.x = stand.x; ring.position.z = stand.z;
        const s = reducedMotion ? 1 : 1 + Math.sin(t * 3.2) * 0.08;
        ring.scale.setScalar(s);
        ring.material.opacity = reducedMotion ? 0.55 : 0.4 + Math.sin(t * 3.2) * 0.15;
      }
    },
    dispose() { scene.remove(trail, beacon, ring); trail.geometry.dispose(); trailMat.dispose(); ring.geometry.dispose(); ring.material.dispose(); },
  };
}
