// Seasons, second pass: is the season actually ON SCREEN?
//
// WHY THIS FILE EXISTS SEPARATELY FROM season-look.test.js. That file proves the four palettes are
// distinct and that a season swap re-tints without rearranging. Both were true, and the game still
// looked identical in three of the four seasons once the player bought the terrace: the palette was
// landing on garden geometry (the picket garland at z 17.6, the tree ring at z 20+) that the default
// camera never frames, and on near-band beds that the terrace deck physically replaces.
//
// So these tests are about PLACEMENT, not about colour tables. They pin the three things the fix
// depends on and that a future edit could silently undo:
//   1. the new dressing is on the café fence line (z ~7) and on the deck -- the two anchors the
//      camera actually holds -- and the fence copy is in the ALWAYS-VISIBLE meshes, so buying the
//      terrace cannot delete it the way it deleted the old flower beds;
//   2. nothing new stands in the gate lane, at any height a guest or pet occupies;
//   3. every mesh in the tree -- garden, always-visible, deck floor, deck dressing -- keeps
//      byte-identical vertex POSITIONS across all four seasons, in both terrace states.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildEnvironment, SEASON_IDS, paletteForSeason, GARDEN_PALETTE,
} from '../src/render/environment.js';
import { buildRegion } from '../src/render/props.js';

const AREA = { size: { w: 20, d: 14 }, regions: [{ id: 'terrace', x0: -10, x1: 10, z0: 7.4, z1: 14 }] };
const TERRACE = AREA.regions[0];

const alwaysVisible = g => g.children.filter(c => c !== g.garden && c !== g.deck && c.geometry);

function positionsOf(node) {
  const out = [];
  node.traverse(o => { if (o.geometry) out.push(o.geometry.getAttribute('position')); });
  return out;
}
function colorsOf(node) {
  const out = [];
  node.traverse(o => { if (o.geometry) out.push(o.geometry.getAttribute('color')); });
  return out;
}
// Every vertex in `node` as {x,y,z}, cheap enough at this scale (~26k triangles).
function* verts(node) {
  for (const p of positionsOf(node)) {
    for (let i = 0; i < p.count; i++) yield { x: p.getX(i), y: p.getY(i), z: p.getZ(i) };
  }
}
function colorKey(node) {
  const seen = new Set();
  for (const c of colorsOf(node)) {
    for (let i = 0; i < c.count; i++) {
      seen.add(`${c.getX(i).toFixed(4)},${c.getY(i).toFixed(4)},${c.getZ(i).toFixed(4)}`);
    }
  }
  return [...seen].sort().join('|');
}

// ---- 1. the dressing is where the camera looks -------------------------------------------------

test('the fence festoon and window boxes are on the café fence line, in the ALWAYS-VISIBLE meshes', () => {
  const g = buildEnvironment(AREA, 'blossom');
  // z 6.9 .. 7.45 is the fence's own thickness plus the gate (src/sim/nav.js blocks that whole row
  // except the gate gap), and it is north of the terrace footprint (z0 7.4), so nothing there can
  // be swallowed by the deck.
  let box = 0, festoon = 0;
  for (const node of alwaysVisible(g)) {
    for (const v of verts(node)) {
      if (v.z < 6.9 || v.z > 7.45) continue;
      if (v.y > 0.15 && v.y < 1.1) box++;
      if (v.y >= 1.1 && v.y < 1.95) festoon++;
    }
  }
  assert.ok(box > 200, `expected fence-mounted window boxes and blooms, saw ${box} vertices`);
  assert.ok(festoon > 200, `expected a festoon strung above the fence, saw ${festoon} vertices`);
});

test('buying the terrace does not hide the fence dressing (it is not inside group.garden)', () => {
  const g = buildEnvironment(AREA, 'harvest');
  // y > 1.1 is festoon-only air: the tallest thing the near-band beds can reach is a large bloom at
  // soil -0.12 + stem 0.45 + petal 0.34 = 0.67, and those beds DO overhang z 7.4 slightly, which is
  // why this filters on height rather than on the z band alone.
  const inGarden = [...verts(g.garden)].filter(v => v.z > 6.9 && v.z < 7.45 && v.y > 1.1).length;
  assert.equal(inGarden, 0, 'nothing on the fence line may live in the terrace-footprint garden group');
  g.setTerraceBuilt(true);
  assert.equal(g.garden.visible, false);
  const stillThere = alwaysVisible(g).some(n => [...verts(n)].some(v => v.z > 6.9 && v.z < 7.45 && v.y > 1.1));
  assert.ok(stillThere, 'the festoon must survive the deck replacing the garden');
});

test('the deck carries its own seasonal dressing, and it is all under group.deck', () => {
  const g = buildEnvironment(AREA, 'lights');
  const deckV = [...verts(g.deck)];
  // Litter lies on the planks (tops y 0.045); the fountain pots and their blooms stand on them.
  const litter = deckV.filter(v => v.y > 0.05 && v.y < 0.08).length;
  const pots = deckV.filter(v => v.y > 0.15 && v.y < 0.8 && Math.hypot(v.x, v.z - 10.6) < 1.6).length;
  assert.ok(litter > 300, `expected litter flecks on the planks, saw ${litter} vertices`);
  assert.ok(pots > 100, `expected planted pots around the fountain, saw ${pots} vertices`);
  // Hidden with the deck, so a pre-terrace café is untouched by any of it.
  assert.equal(g.deck.visible, false);
});

// ---- 2. nothing new blocks the gate -------------------------------------------------------------

test('the gate lane stays clear at every height a guest or pet occupies', () => {
  // GATE_HALF_W is 1.2 (props.js buildStatic and src/sim/nav.js both hold that constant). Below
  // y 0.15 is floor (planks, the stone border, flat litter) and above y 1.9 is the gate arch's own
  // crossbar and the swag hung on it — the band between the two is what a body passes through.
  const g = buildEnvironment(AREA, 'splash');
  g.setTerraceBuilt(true);
  const offenders = [];
  for (const node of [...alwaysVisible(g), g.deck]) {
    for (const v of verts(node)) {
      if (Math.abs(v.x) <= 1.2 && v.z > 6.85 && v.z < 7.6 && v.y > 0.15 && v.y < 1.9) {
        offenders.push(v);
        if (offenders.length > 4) break;
      }
    }
  }
  assert.equal(offenders.length, 0,
    `nothing may stand in the gate lane: ${JSON.stringify(offenders.slice(0, 3))}`);
});

test('nothing new stands inside the fountain, the pool that later replaces it, or their walkable ring', () => {
  const g = buildEnvironment(AREA, 'harvest');
  g.setTerraceBuilt(true);
  // fountainMesh's basin is radius 1.15 and splashPoolMesh's is 1.2 (src/render/props.js), and both
  // are only 0.20-0.28 m tall. So the POT — the solid thing that would visibly intersect them — has
  // to sit outside radius 1.2, which is what this checks over the pot's own height band (y 0.12 ..
  // 0.42, body plus rim). The blooms above it are deliberately allowed to lean out past that: they
  // are 0.4 m up, clear of both rims in 3D, and a plant overhanging water is the look.
  for (const v of verts(g.deck)) {
    const d = Math.hypot(v.x, v.z - 10.6);
    if (v.y < 0.12 || v.y > 0.42 || d > 2.0) continue;   // floor litter and the wider deck are fine
    // The one thing allowed inside the basin is the sheet of floating petals, which is flat, sits
    // at exactly y 0.30 (above the fountain's water at 0.28 and splash1's at 0.25) and stays inside
    // radius 0.95 so it never crosses either rim.
    if (Math.abs(v.y - 0.30) < 1e-6) { assert.ok(d < 0.95, `a floating petal crosses the rim at ${d.toFixed(3)}`); continue; }
    assert.ok(d > 1.2, `a pot intersects the fountain basin at radius ${d.toFixed(3)}`);
    // ...and stay inside fountain1's own nav-blocked 2.4 x 2.4 footprint, so no mover can path
    // into the cell the pot stands in.
    assert.ok(Math.abs(v.x) <= 1.35 && Math.abs(v.z - 10.6) <= 1.35,
      `a pot leaves the fountain's blocked footprint at (${v.x.toFixed(2)}, ${v.z.toFixed(2)})`);
  }
});

// ---- 3. colours move, geometry never does --------------------------------------------------------

test('EVERY mesh keeps byte-identical vertex positions across all four seasons, deck up and down', () => {
  for (const built of [false, true]) {
    const g = buildEnvironment(AREA, 'blossom');
    g.setTerraceBuilt(built);
    const snap = () => positionsOf(g).map(p => Array.from(p.array));
    const before = snap();
    for (const id of ['splash', 'harvest', 'lights', 'blossom']) {
      g.setSeason(id);
      const after = snap();
      assert.equal(after.length, before.length, `mesh count changed on ${id} (terraceBuilt=${built})`);
      for (let i = 0; i < before.length; i++) {
        assert.equal(after[i].length, before[i].length, `mesh ${i} vertex count changed on ${id}`);
        for (let j = 0; j < before[i].length; j++) {
          assert.ok(Math.abs(before[i][j] - after[i][j]) < 1e-9,
            `mesh ${i} vertex component ${j} moved on ${id} (terraceBuilt=${built})`);
        }
      }
    }
  }
});

test('the deck itself re-tints: all four seasons give the deck group a different colour signature', () => {
  const seen = new Map();
  for (const id of SEASON_IDS) {
    const g = buildEnvironment(AREA, id);
    const key = colorKey(g.deck);
    for (const [other, k] of seen) assert.notEqual(key, k, `${id}'s deck is identical to ${other}'s`);
    seen.set(id, key);
  }
});

test('the always-visible fence dressing re-tints too, differently in all four seasons', () => {
  const seen = new Map();
  for (const id of SEASON_IDS) {
    const g = buildEnvironment(AREA, id);
    const key = alwaysVisible(g).map(colorKey).join('#');
    for (const [other, k] of seen) assert.notEqual(key, k, `${id} is identical to ${other} above ground`);
    seen.set(id, key);
  }
});

test('setSeason after setTerraceBuilt leaves the deck visible and re-tinted, not rebuilt hidden', () => {
  const g = buildEnvironment(AREA, 'blossom');
  g.setTerraceBuilt(true);
  const before = colorKey(g.deck);
  g.setSeason('lights');
  assert.equal(g.deck.visible, true, 'a re-season must never undo the terrace toggle');
  assert.notEqual(colorKey(g.deck), before);
  g.setTerraceBuilt(false);
  g.setSeason('harvest');
  assert.equal(g.deck.visible, false);
});

// ---- 4. the palette contract the deck depends on -------------------------------------------------

test('every season names a deck tint and a litter set, and no two seasons share either', () => {
  const decks = new Set(), litters = new Set();
  for (const id of SEASON_IDS) {
    const p = paletteForSeason(id);
    for (const key of ['deckPlank', 'deckBase', 'deckBorder']) {
      assert.match(p[key], /^#[0-9A-Fa-f]{6}$/, `${id} needs a ${key}`);
    }
    assert.ok(Array.isArray(p.litter) && p.litter.length >= 3, `${id} needs a litter set`);
    const deckKey = `${p.deckPlank}/${p.deckBase}/${p.deckBorder}`;
    assert.ok(!decks.has(deckKey), `${id}'s deck tint duplicates another season's`);
    assert.ok(!litters.has(p.litter.join(',')), `${id}'s litter set duplicates another season's`);
    decks.add(deckKey); litters.add(p.litter.join(','));
  }
});

test("buildRegion's palette-less fallbacks are exactly Blossom's, so any other caller is unchanged", () => {
  // The seasonal deck values live in environment.js's palette table; props.js only holds fallbacks.
  // If those two ever drift, an un-palettised deck silently stops matching the shipped look.
  const bare = new Set(colorKey(buildRegion(AREA, TERRACE)).split('|'));
  const blossom = new Set(colorKey(buildRegion(AREA, TERRACE, GARDEN_PALETTE)).split('|'));
  for (const c of bare) {
    assert.ok(blossom.has(c), `the palette-less deck uses a colour Blossom does not: ${c}`);
  }
});

test('buildRegion never throws on a partial or empty palette', () => {
  assert.doesNotThrow(() => buildRegion(AREA, TERRACE, {}));
  assert.doesNotThrow(() => buildRegion(AREA, TERRACE, { deckPlank: '#123456', foliage: [] }));
});

// ---- 5. cost ---------------------------------------------------------------------------------------

test('the whole environment stays a rounding error against the 210k triangle budget', () => {
  const g = buildEnvironment(AREA, 'lights');
  let tris = 0, meshes = 0;
  g.traverse(o => {
    if (!o.geometry) return;
    const geo = o.geometry;
    tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    meshes++;
  });
  assert.ok(tris < 30000, `environment is ${tris} triangles`);
  // Four merged garden/fence meshes, the deck floor, and the deck's own lit/unlit dressing pair.
  assert.ok(meshes <= 8, `environment costs ${meshes} draw calls`);
  assert.ok(THREE.REVISION, 'three is loaded');
});
