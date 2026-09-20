// test/station-signs.test.js — what a station says it is, without a word.
//
// Batch G replaced the chalkboards. Every station used to carry a small BLACK board on a post,
// standing outside its own footprint, whose only content was a DOM chip that faded in within 5 m:
// from the play camera the room held twenty signs that said nothing (the owner's "what is this"),
// one of them planted in the ★3 resident cat's bed, and each one cost a draw call in the main pass
// and another in the shadow pass.
//
// The replacement has three properties that this file exists to keep true, because each of them is
// a thing a later change could quietly undo:
//
//   1. THE PICTOGRAM IS REAL GEOMETRY. render/grain.js paints each glyph into the shared detail
//      atlas and render/props.js's signParts() points the board face at it. If a glyph name and an
//      atlas tile ever drift apart, the board goes blank and we are back where we started — and
//      nothing on screen would say so, because a missing tile renders as plain cream.
//   2. IT COSTS NO DRAW CALL. signParts() returns GEOMETRY, and geo.js's addParts() folds it into
//      the station's own mesh. A future revision that returns a Mesh instead would put 20 draw
//      calls back into a frame that is 9 under the publisher's limit.
//   3. IT STANDS INSIDE THE STATION'S OWN FOOTPRINT. Ground a station occupies is already ground
//      nobody walks on, so a sign there cannot be in a walkway, a queue slot or a pet's bed — and
//      because the sign contributes no collision, the body box the station hands the navigation
//      grid must be exactly what it was before the sign was merged in.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { signParts, SIGN_GEOMETRY } from '../src/render/props.js';
import { part, merge, mesh, addParts } from '../src/render/geo.js';
import { TILES, SIGN_NAMES } from '../src/render/grain.js';
import { stationSignGlyph, stationSignSpot } from '../src/systems/visuals.js';
import { AREA1 } from '../data/area1.js';

// Every station type that carried a chalkboard, and the glyph it must carry now. This is the list
// the old chalkIconKey() answered for; a type that silently falls off it goes back to being an
// unlabelled box.
// ('return' and 'kiosk' were on this list until Batch C deleted both stations from the game.)
const TYPES_THAT_SPEAK = ['oven', 'display', 'coffee', 'icecream', 'blender', 'pantry',
  'bush', 'bowl', 'checkout', 'hire'];

test('every station type that used to carry a chalkboard now names a sign glyph', () => {
  for (const type of TYPES_THAT_SPEAK) {
    const glyph = stationSignGlyph({ type, product: 'cookie' });
    assert.ok(glyph, `${type} must say what it is`);
    assert.ok(SIGN_NAMES.includes(glyph), `${type} names "${glyph}", which the atlas does not paint`);
    assert.ok(TILES['sign:' + glyph], `no atlas rect for sign:${glyph}`);
  }
});

test('a glyph names a product FAMILY, so a star-tier recipe swap cannot make a sign lie', () => {
  // world.js ALT_PRODUCT swaps a counter's recipe at a star rank. The board is baked once, at build
  // time, so anything that distinguishes the two halves of a swap would go stale on the café's best
  // day. Each pair below is a swap the game actually performs.
  for (const [a, b] of [['cookie', 'brownie'], ['coffee', 'latte'], ['icecream', 'sundae']]) {
    assert.equal(
      stationSignGlyph({ type: 'display', product: a }),
      stationSignGlyph({ type: 'display', product: b }),
      `${a} and ${b} are the same counter at different star ranks and must share a glyph`,
    );
  }
  // And a product nobody has authored a glyph for still says "baked goods" rather than nothing.
  assert.equal(stationSignGlyph({ type: 'display', product: 'nonesuch' }), 'pastry');
  assert.equal(stationSignGlyph({ type: 'seat' }), null, 'a table is not a station that sells');
  assert.equal(stationSignGlyph(null), null);
});

test('signParts returns geometry, never a mesh — that is what makes it free', () => {
  const parts = signParts('cone', 0, 0, 0.6);
  assert.ok(Array.isArray(parts) && parts.length === 3, 'post, frame, face');
  for (const g of parts) {
    assert.ok(g.isBufferGeometry, 'a sign part must be geometry the station can merge, not a Mesh');
    assert.ok(g.getAttribute('uv'), 'every part carries the uv attribute merge() requires');
    assert.ok(g.getAttribute('color'), 'and the baked vertex colour');
  }
  assert.equal(signParts('no-such-glyph', 0, 0, 0), null, 'an unknown glyph draws nothing at all');
});

test('the board face samples its own glyph out of the atlas, and nothing else', () => {
  for (const glyph of SIGN_NAMES) {
    const face = signParts(glyph, 0, 0, 0.6)[2];
    const tile = TILES['sign:' + glyph];
    const uv = face.getAttribute('uv');
    let inside = 0;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u >= tile.u0 - 1e-6 && u <= tile.u0 + tile.du + 1e-6
        && v >= tile.v0 - 1e-6 && v <= tile.v0 + tile.dv + 1e-6) inside++;
    }
    assert.equal(inside, uv.count, `${glyph}: ${uv.count - inside} of ${uv.count} uvs fall outside its own tile`);
    // And it must actually SPAN the tile, not sample one corner of it: geo.js stretches a tile over
    // a part only while the tile's authored world span is smaller than the part.
    let minU = Infinity, maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) { minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i)); }
    assert.ok(maxU - minU > tile.du * 0.9, `${glyph}: the glyph is cropped, not stretched over the board`);
  }
});

test('no two glyphs share an atlas rect, and none overlaps a grain tile', () => {
  const rects = SIGN_NAMES.map(n => ({ n, ...TILES['sign:' + n] }));
  const grain = ['blank', 'wood', 'tile', 'fabric', 'ceramic', 'fur', 'paper', 'metal', 'leaf', 'plaster']
    .map(n => ({ n, ...TILES[n] }));
  const hits = (a, b) => a.u0 < b.u0 + b.du && b.u0 < a.u0 + a.du && a.v0 < b.v0 + b.dv && b.v0 < a.v0 + a.dv;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) assert.equal(hits(rects[i], rects[j]), false, `${rects[i].n} overlaps ${rects[j].n}`);
    for (const g of grain) assert.equal(hits(rects[i], g), false, `${rects[i].n} overlaps the ${g.n} grain tile`);
  }
});

test('a sign stands inside its own station footprint, never beside it', () => {
  // The old board sat at -(fw/2 + 0.15) — OUTSIDE the footprint, which is how bush1's landed in the
  // ★3 resident cat's bed. Every sign must now be within the ground the station already occupies,
  // whatever its size, including the ones too small to hold the inset.
  for (const st of AREA1.stations) {
    if (!stationSignGlyph(st)) continue;
    const { lx, lz } = stationSignSpot(st);
    assert.ok(Math.abs(lx) <= (st.fw || 0) / 2 + 1e-9, `${st.id}: sign post ${lx} is outside its own ${st.fw} m width`);
    assert.ok(Math.abs(lz) <= (st.fd || 0) / 2 + 1e-9, `${st.id}: sign post ${lz} is outside its own ${st.fd} m depth`);
  }
});

test('the board hangs above head height, so a body can never stand in front of it', () => {
  // 2.04 m is render/human.js's own character height. The board's bottom edge clears it.
  assert.ok(SIGN_GEOMETRY.boardY - SIGN_GEOMETRY.h / 2 > 1.6, 'the board must sit above the body band');
  assert.ok(SIGN_GEOMETRY.boardY + SIGN_GEOMETRY.h / 2 < 2.6, 'and under the awning at 2.9 m');
});

test('merging a sign into a station leaves its collision box exactly as it was', () => {
  // The station's body box is what sim/nav.js and world.js block the floor with. The sign is
  // render-only: a post rising through the body band would otherwise grow the box, and on a station
  // too short to have one at all (the pet treat bowl, drawn 0.18 m tall) it would invent one.
  const counter = mesh([
    part('rbox', [2.4, 1.0, 1.0, 0.08], '#ffffff', { y: 0.5 }),
    part('box', [2.5, 0.12, 1.1], '#ffffff', { y: 1.02 }),
  ]);
  const before = { ...counter.geometry.userData.bodyBox };
  const trisBefore = counter.geometry.getAttribute('position').count;
  addParts(counter, signParts('cup', -1.0, -0.28, 0.6));
  assert.deepEqual(counter.geometry.userData.bodyBox, before, 'the sign must not widen the body box');
  assert.ok(counter.geometry.getAttribute('position').count > trisBefore, 'and the sign must actually be in there');

  // The short station: no body box before, and still none after.
  const bowl = mesh([part('cyl', [0.35, 0.3, 0.18, 14], '#ffffff', { y: 0.09 })]);
  assert.equal(bowl.geometry.userData.bodyBox, undefined, 'a 0.18 m bowl has nothing in the body band');
  addParts(bowl, signParts('paw', 0, 0, 0.6));
  assert.equal(bowl.geometry.userData.bodyBox, undefined, 'and a sign must not give it one');
});

test('the chalkboard mesh is gone, not merely unused', () => {
  // The twin of "code nothing calls" is a factory left behind for a caller that no longer exists.
  return import('../src/render/props.js').then(m => {
    assert.equal(m.chalkboardMesh, undefined, 'props.js must not still export a chalkboardMesh');
  });
});

test('three is real here (the geometry assertions above mean nothing otherwise)', () => {
  assert.ok(THREE.REVISION);
  const g = merge(signParts('gear', 0, 0, 0));
  assert.ok(g.getAttribute('position').count > 0);
});
