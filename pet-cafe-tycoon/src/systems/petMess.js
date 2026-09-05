// Pet pawprint floor-mess runtime. Pawprints are a zero-penalty tactile chore: the owner can wipe
// them by standing over them briefly. Roomba Assist clears/suppresses only these pawprints — dirty
// tables remain the permanent Cleaner's responsibility.
import * as THREE from 'three';
import { part, merge } from '../render/geo.js';
import { C, toonMaterial } from '../render/palette.js';
import {
  PET_MESS_CLEAN_SECONDS, PET_MESS_MAX, ROOMBA_SWEEP_SECONDS,
  shouldSpawnPetMess, petMessOffset,
} from '../sim/petMess.js';

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

function roombaMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(merge([
    part('cyl', [0.34, 0.36, 0.12, 18], C.ink, { y: 0.07 }),
    part('cyl', [0.23, 0.26, 0.035, 16], C.metal, { y: 0.145 }),
    part('cyl', [0.045, 0.045, 0.025, 10], C.coral, { x: 0.13, y: 0.17, z: 0.04 }),
  ]), toonMaterial());
  body.castShadow = true; body.receiveShadow = true; g.add(body);
  g.visible = false;
  return g;
}

export function createPetMess(G, scene) {
  if (!G || !G.world || !scene) return { update() {}, sweep() { return 0; }, get count() { return 0; }, get roombaActive() { return false; }, get roombaRemaining() { return 0; }, destroy() {} };
  const spots = [];
  const roomba = roombaMesh(); scene.add(roomba);
  const events = G.world.events;
  const nativePush = events.push;
  let lastSpawnAt = -Infinity, day = (G.dayState && G.dayState.day) | 0, suppressUntil = -Infinity;

  function consumeRestoredRoomba() {
    const help = G.temporaryHelp;
    const saved = help && help.roomba;
    if (!saved) return;
    // main.js constructs this runtime before G.restore(), so consume the parked canonical state on
    // the first update AFTER restore rather than only during construction. Consume exactly once.
    help.roomba = null;
    const currentDay = (G.dayState && G.dayState.day) | 0;
    // The reward is earned during Rush but promises N active-simulation seconds. A same-day
    // Rush→Afternoon transition must not erase the unused remainder; only a different day is stale.
    if (!G.dayState || saved.day !== currentDay || !(saved.remaining > 0)) return;
    suppressUntil = Math.max(
      suppressUntil,
      (Number(G.time) || 0) + Math.min(ROOMBA_SWEEP_SECONDS, Number(saved.remaining) || 0),
    );
  }

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
    suppressUntil = -Infinity;
  }

  function spawnFromSeat(event) {
    const now = Number(G.time) || 0;
    const currentDay = (G.dayState && G.dayState.day) | 0;
    syncDay(currentDay);
    consumeRestoredRoomba();
    if (now < suppressUntil) return;
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
    return nativePush.apply(this, items);
  };
  events.push = observedPush;

  const api = {
    update(dt) {
      const nextDay = (G.dayState && G.dayState.day) | 0;
      syncDay(nextDay);
      consumeRestoredRoomba();
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
      const active = (Number(G.time) || 0) < suppressUntil;
      roomba.visible = active;
      if (active) {
        const t = Number(G.time) || 0;
        roomba.position.set(-2.2 + Math.sin(t * 0.8) * 4.6, 0.01, 3.8 + Math.sin(t * 1.35) * 0.7);
        roomba.rotation.y = Math.cos(t * 0.8) > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    },
    sweep(seconds = ROOMBA_SWEEP_SECONDS) {
      const cleared = spots.length;
      clearAll();
      suppressUntil = Math.max(suppressUntil, (Number(G.time) || 0) + Math.max(1, Number(seconds) || ROOMBA_SWEEP_SECONDS));
      roomba.visible = true;
      return cleared;
    },
    get count() { return spots.length; },
    get roombaActive() { return (Number(G.time) || 0) < suppressUntil; },
    get roombaRemaining() { return Math.max(0, suppressUntil - (Number(G.time) || 0)); },
    destroy() {
      if (events.push === observedPush) events.push = nativePush;
      clearAll(); scene.remove(roomba);
    },
  };
  G.petMess = api;
  return api;
}
