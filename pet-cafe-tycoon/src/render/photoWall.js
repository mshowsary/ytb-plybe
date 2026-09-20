// src/render/photoWall.js — the photo wall (docs/SHIP-PLAN-2026-09-19.md §1.3): the corkboard the
// Pet camera hangs on the café's west wall, and the one place the collection is visible from the
// floor. One frame per pet in the Pet Visitor Book; a frame is blank until that pet has been
// photographed, then it carries the pet's own coat colour. That is the whole purchase: not a
// machine, not a chore — a wall that fills in as the album does.
//
// Cost: TWO draw calls for the whole board. The cork, its frame and all twenty white polaroid
// cards are one merged geometry on the shared toon material (src/render/geo.js's mesh()); the
// twenty photo squares are one InstancedMesh whose per-instance colour is the only thing that ever
// changes — the same instanceColor trick src/render/butterflies.js already uses for its wings.
// Nothing here has a floor footprint: 'wall' stations contribute no collision box anywhere
// (sim/nav.js, sim/ownerReach.js, sim/world.js), so the board cannot narrow the door corridor.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { C } from './palette.js';
import { PET_SPECIES, PET_PROFILES, petKey } from '../sim/petBook.js';

// Slot order is the Pet Book's own: species by species, coat by coat, so the wall reads in the same
// order the collection sheet does and a gap in one is a gap in the other.
export const PHOTO_WALL_SLOTS = Object.freeze(PET_SPECIES.flatMap(
  species => (PET_PROFILES[species] || []).map((profile, variant) => ({
    key: petKey(species, variant), colour: profile.body,
  })),
));

// Four across, five down: 1.5 m of wall is all the board gets (data/area1.js explains why), and a
// 4x5 grid keeps each frame big enough to read a coat colour from the player's wide camera.
const COLS = 4;
const COL_STEP = 0.34, ROW_STEP = 0.29;
const CARD_W = 0.30, CARD_H = 0.25, CARD_T = 0.012;
const PHOTO_W = 0.24, PHOTO_H = 0.16, PHOTO_T = 0.008;
// Where the card's picture sits inside it: up a little, so the wide white margin lands at the
// bottom the way a real polaroid's does.
const PHOTO_DY = 0.028;
// Board centre height: the bottom row clears the staff desk's own top (0.94 m) in front of it.
const BOARD_Y = 1.70;
const CORK = '#C8A06A', CORK_EDGE = '#8C6239';
const EMPTY = '#E4DACB';       // a frame nobody has filled yet: pale, never a hole

function slotOffset(i) {
  const rows = Math.ceil(PHOTO_WALL_SLOTS.length / COLS);
  const col = i % COLS, row = Math.floor(i / COLS);
  return {
    x: (col - (COLS - 1) / 2) * COL_STEP,
    y: BOARD_Y + ((rows - 1) / 2 - row) * ROW_STEP,
  };
}

/**
 * The board, built at the origin facing +z (the engine's rot-0 convention — systems/visuals.js
 * turns it to face into the room). `group.userData.photoWall.setAlbum(album)` recolours the
 * frames; it is a no-op when nothing has changed, so calling it every frame is free.
 */
export function photoWallMesh() {
  const group = new THREE.Group();
  const rows = Math.ceil(PHOTO_WALL_SLOTS.length / COLS);
  const boardW = COLS * COL_STEP + 0.18, boardH = rows * ROW_STEP + 0.16;

  const parts = [
    part('box', [boardW + 0.08, boardH + 0.08, 0.04], CORK_EDGE, { y: BOARD_Y, z: -0.035 }),  // frame
    part('box', [boardW, boardH, 0.03], CORK, { y: BOARD_Y, z: -0.015, tex: 'wood' }),        // cork
  ];
  for (let i = 0; i < PHOTO_WALL_SLOTS.length; i++) {
    const at = slotOffset(i);
    parts.push(part('box', [CARD_W, CARD_H, CARD_T], C.cream, { x: at.x, y: at.y, z: 0.006 }));
    // The pin that holds it up: one tiny cylinder each, merged in with everything else.
    parts.push(part('cyl', [0.012, 0.012, 0.02, 6], C.coral, { x: at.x, y: at.y + CARD_H / 2 - 0.022, z: 0.016, rx: Math.PI / 2 }));
  }
  const board = mesh(parts, { cast: false });
  board.name = 'photoWall:board';
  group.add(board);

  const photoGeo = new THREE.BoxGeometry(PHOTO_W, PHOTO_H, PHOTO_T);
  const photoMat = new THREE.MeshToonMaterial({ color: 0xffffff });
  const photos = new THREE.InstancedMesh(photoGeo, photoMat, PHOTO_WALL_SLOTS.length);
  photos.name = 'photoWall:photos';
  photos.castShadow = false; photos.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < PHOTO_WALL_SLOTS.length; i++) {
    const at = slotOffset(i);
    m.makeTranslation(at.x, at.y + PHOTO_DY, 0.014);
    photos.setMatrixAt(i, m);
  }
  photos.instanceMatrix.needsUpdate = true;
  group.add(photos);

  const colour = new THREE.Color();
  let signature = '';
  function setAlbum(album) {
    // A cheap "has anything changed" key: one character per slot. The album only grows, so this is
    // exact, and it keeps a per-frame call from touching twenty instance colours for nothing.
    let next = '';
    for (const slot of PHOTO_WALL_SLOTS) next += album && album[slot.key] ? '1' : '0';
    if (next === signature) return;
    signature = next;
    for (let i = 0; i < PHOTO_WALL_SLOTS.length; i++) {
      colour.set(next[i] === '1' ? PHOTO_WALL_SLOTS[i].colour : EMPTY);
      photos.setColorAt(i, colour);
    }
    if (photos.instanceColor) photos.instanceColor.needsUpdate = true;
  }
  setAlbum(null);
  group.userData.photoWall = { setAlbum };
  return group;
}

/**
 * The same board as a construction blueprint: translucent lilac, no shadows. src/systems/zones.js
 * draws this where the wall will be while the plot is still unpaid, so the player reads "a photo
 * wall goes here" — src/render/buildPreview.js's semanticBuildGhost only knows floor-standing
 * station types and would otherwise leave a faint slab lying on the floor by the skirting.
 * Materials are REPLACED, never disposed: the board shares geo.js's one toon material with the
 * whole world, and disposing it would take every prop in the café with it.
 */
export function photoWallGhost() {
  const g = photoWallMesh();
  const preview = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#CFC5FF'), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide,
  });
  g.traverse(node => {
    if (!node.isMesh) return;
    node.material = preview;
    node.castShadow = false; node.receiveShadow = false; node.renderOrder = -1;
  });
  g.scale.setScalar(0.94);
  return g;
}
