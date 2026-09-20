import { subscribeWorld } from '../sim/events.js';
// Pet pawprint floor-mess runtime. Pawprints are a zero-penalty tactile chore: the owner can wipe
// them by standing over them briefly.
//
// ROOMBA ASSIST IS GONE (Batch E2, ship plan §1.7 "Cut: ... roomba"). It was a rewarded offer that
// sim/relief.js had already stopped nominating in 2026-09-17 ("an offer with no value does worse
// than waste the slot"), which left a disc mesh, a suppression window and a save field that only
// the offer could ever set — correct code nothing called. The pawprints themselves, which are
// alive-detail and cost nothing, are unchanged.
import * as THREE from 'three';
import { part, merge } from '../render/geo.js';
import { C, toonMaterial } from '../render/palette.js';
import { PET_MESS_CLEAN_SECONDS, PET_MESS_MAX, shouldSpawnPetMess, petMessOffset } from '../sim/petMess.js';

function pawMesh() {
  const parts = [
    part('sph', [0.14, 8], C.woodDark, { y: 0.018, sy: 0.10, sx: 1.05, sz: 0.92 }),
    part('sph', [0.055, 7], C.woodDark, { x: -0.11, y: 0.019, z: -0.12, sy: 0.10 }),
    part('sph', [0.055, 7], C.woodDark, { x: 0, y: 0.019, z: -0.16, sy: 0.10 }),
    part('sph', [0.055, 7], C.woodDark, { x: 0.11, y: 0.019, z: -0.12, sy: 0.10 }),
  ];
  const m = new THREE.Mesh(merge(parts), toonMaterial());
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

export function createPetMess(G, scene) {
  if (!G || !G.world || !scene) return { update() {}, get count() { return 0; }, destroy() {} };
  const spots = [];
  let lastSpawnAt = -Infinity, day = (G.dayState && G.dayState.day) | 0;

  function removeAt(index) {
    const spot = spots[index]; if (!spot) return;
    scene.remove(spot.mesh); spots.splice(index, 1);
  }
  function clearAll() { for (let i = spots.length - 1; i >= 0; i--) removeAt(i); }
  function syncDay(currentDay) {
    if (currentDay === day) return;
    day = currentDay;
    clearAll();
    lastSpawnAt = -Infinity;
  }

  function spawnFromSeat(event) {
    const now = Number(G.time) || 0;
    const currentDay = (G.dayState && G.dayState.day) | 0;
    syncDay(currentDay);
    if (!shouldSpawnPetMess(currentDay, event.id, spots.length, now - lastSpawnAt)) return;
    const seat = event.seatId && G.world.stations.get(event.seatId);
    if (!seat || !seat.active || !seat.pair || !seat.pair.pet) return;
    const off = petMessOffset(event.id);
    const mesh = pawMesh();
    mesh.position.set(seat.pair.pet.x + off.x, 0, seat.pair.pet.z + off.z);
    mesh.rotation.y = ((event.id | 0) * 1.37) % (Math.PI * 2);
    scene.add(mesh);
    spots.push({ mesh, x: mesh.position.x, z: mesh.position.z, cleanT: 0 });
    lastSpawnAt = now;
    if (spots.length > PET_MESS_MAX) removeAt(0);
  }

  const observedPush = function petMessObservedPush(...items) {
    for (const event of items) if (event && event.type === 'seated' && event.id != null) spawnFromSeat(event);
  };
  const unsubscribe = subscribeWorld(G.world, event => observedPush(event), 30);

  const api = {
    update(dt) {
      const nextDay = (G.dayState && G.dayState.day) | 0;
      syncDay(nextDay);
      const P = G.P;
      if (P) {
        for (let i = spots.length - 1; i >= 0; i--) {
          const s = spots[i], d = Math.hypot(P.x - s.x, P.z - s.z);
          s.cleanT = d < 0.72 ? s.cleanT + dt : Math.max(0, s.cleanT - dt * 2);
          const frac = Math.max(0.25, 1 - 0.55 * (s.cleanT / PET_MESS_CLEAN_SECONDS));
          s.mesh.scale.setScalar(frac);
          if (s.cleanT >= PET_MESS_CLEAN_SECONDS) removeAt(i);
        }
      }
    },
    get count() { return spots.length; },
    destroy() {
      unsubscribe();
      clearAll();
    },
  };
  G.petMess = api;
  return api;
}
