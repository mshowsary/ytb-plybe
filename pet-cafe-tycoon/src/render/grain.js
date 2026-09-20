// src/render/grain.js — the one texture in the game, drawn at boot onto a canvas.
//
// WHY THIS EXISTS
// Every surface in the café is a flat, untextured vertex-coloured plane: wood, tile, fabric,
// ceramic and fur are told apart only by hue. The project ships ZERO asset bytes (spec §4.4, "no
// new asset classes" — nothing is ever fetched), so the cheapest large jump in perceived quality
// available to us is surface GRAIN generated at runtime. A canvas costs no download, and because
// palette.js hands the whole world ONE MeshToonMaterial, a single atlas on that material's `map`
// gives every prop grain for zero extra draw calls. A second material would cost a draw call per
// prop and is the one thing this module must never do.
//
// WHY IT IS AN ATLAS AND NOT A REPEATING TEXTURE
// One material means one `map`, so all ten surface grains have to live in one image, and each part
// is pointed at the sub-rect it wants (geo.js `part(..., { tex: 'wood' })`). The cost of that is
// that a tile can never REPEAT across a part — UVs are interpolated, and there is no `fract()`
// without a custom shader. geo.js handles it by scaling UVs in world-ish metres and falling back
// to "one tile stretched over the part" only when a part is larger than its tile's authored metre
// span; see projectUV() there.
//
// WHY EVERY TILE IS NEARLY WHITE
// The material multiplies `map` by the baked vertex colour, so this atlas is a DETAIL map, not a
// colour map: 1.0 means "leave the palette alone". The game's palette (palette.js `C`) is the look
// and it must not shift, so every tile is authored as a multiplier in roughly 0.66–1.0 with its
// MEAN held near 0.95 — grain is texture, not tint. Values below are written in LINEAR multiplier
// space and encoded to sRGB bytes by grey(), because the texture is sampled as SRGBColorSpace
// (matching renderer.outputColorSpace in scene.js) and so is decoded back to linear before it
// multiplies anything. Authoring in the space the multiply happens in is the only way the "within
// a couple of percent" promise is checkable by reading the numbers: a mean of 0.95 is a 5 % loss
// in linear light, which is under 2 % once the frame is sRGB-encoded for the screen — and that is
// what was actually measured on the composited frame, not asserted.
//
// The FIRST pass of this file sat at a mean of 0.98 and was invisible at the game's own camera.
// Nothing in this game is ever seen closer than about 10 m, so a tile's grain has to carry
// LOW-FREQUENCY contrast — features spanning a large fraction of the tile — or mipmapping averages
// it away before it reaches a pixel. That is why the wood bands, the grout cross and the weave
// shadow are coarse and the per-pixel speckle is only ever a garnish.
//
// WHY THE PRNG IS OURS
// Math.random would make the atlas different on every load, so a screenshot test could never pin
// it. mulberry32 with a fixed seed per tile gives a byte-identical atlas every run, on every
// machine.
import * as THREE from 'three';

export const ATLAS_PX = 1024;      // 4x4 grid of 256 px tiles
export const GRID = 4;
export const TILE_PX = ATLAS_PX / GRID;
// Bleed margin, in pixels, kept INSIDE each tile and never addressed by a UV. Linear filtering and
// the first few mip levels sample beyond the rect they are told to; without this margin a table
// would show a sliver of the floor's grout along its edge. Deep mips do cross tiles, but every tile
// here averages ~0.95 of white, so a deep-mip blend of two of them is still ~0.95 grey — invisible.
// That tolerance is exactly what buys us an atlas instead of ten textures.
export const BLEED_PX = 6;

// name -> { u0, v0, du, dv, m }. `m` is the tile's authored WORLD SPAN: how many metres of surface
// one copy of the tile is drawn for. It is what keeps a 4 m counter and a 0.2 m plate from showing
// the same number of wood rings — geo.js divides by it. Tiles are laid out with `blank` first, at
// the UV origin, so a geometry that somehow reaches the shader with no uv attribute (WebGL hands
// the shader 0,0) samples pure white and renders exactly as it did before this module existed.
const LAYOUT = [
  ['blank', 1.0], ['wood', 1.6], ['tile', 1.0], ['fabric', 0.55],
  ['ceramic', 0.45], ['fur', 0.5], ['paper', 0.42], ['metal', 0.7],
  ['leaf', 0.8], ['plaster', 2.2],
];
const GRAIN_TILES = LAYOUT.map(([name, m], i) => {
  const col = i % GRID, row = (i / GRID) | 0;
  return [name, Object.freeze({
    u0: (col * TILE_PX + BLEED_PX) / ATLAS_PX,
    v0: (row * TILE_PX + BLEED_PX) / ATLAS_PX,
    du: (TILE_PX - BLEED_PX * 2) / ATLAS_PX,
    dv: (TILE_PX - BLEED_PX * 2) / ATLAS_PX,
    m,
  })];
});

// ── station signs (ship plan §1.9) ──────────────────────────────────────────────────────────────
// WHY THEY LIVE IN THIS ATLAS. Every station used to carry a blank black lollipop board whose only
// content was a DOM chip that appeared within 5 m, so from the play camera the café was dotted with
// 20 signs that said nothing — the owner's "what is this" clutter — and each one was its own mesh
// (20 main-pass draw calls plus 20 more in the shadow pass). Painting the pictogram INTO this atlas
// is what lets the board be merged into the station's own geometry: the whole world already shares
// one MeshToonMaterial whose `map` is this texture, so a sign costs no material, no draw call and no
// asset byte. A second texture would have cost a draw call per station and we would be back where we
// started.
//
// The six 256 px cells the ten grain tiles leave empty are quartered into 24 slots of 128 px, so the
// grain tiles' own UVs are byte-for-byte unchanged. `m` is deliberately tiny: geo.js sizes a tile in
// metres and stretches it when the part is bigger, so a span of 1 mm means "always stretch this tile
// exactly over the face", which is what a sign wants and grain never does.
//
// Every glyph is painted as a MULTIPLIER (dark on white), like every other tile here, so the board's
// own cream vertex colour shows through as the plaque and the glyph reads as ink on it. One colour
// is all a merged, single-material sign can have — and ink-on-cream is already this game's sign
// language (the return crate's plate, the staff desk's board).
const SIGN_LAYOUT = ['pastry', 'cupcake', 'cup', 'smoothie', 'cone', 'paw', 'coin', 'sack',
  'berry', 'gear', 'person', 'crate'];
const SIGN_PX = TILE_PX / 2;
const SIGN_BLEED = 4;
const SIGN_TILES = SIGN_LAYOUT.map((name, i) => {
  const cell = LAYOUT.length + (i >> 2), sub = i & 3;
  const ox = (cell % GRID) * TILE_PX + (sub & 1) * SIGN_PX;
  const oy = ((cell / GRID) | 0) * TILE_PX + ((sub >> 1) & 1) * SIGN_PX;
  return ['sign:' + name, Object.freeze({
    u0: (ox + SIGN_BLEED) / ATLAS_PX,
    v0: (oy + SIGN_BLEED) / ATLAS_PX,
    du: (SIGN_PX - SIGN_BLEED * 2) / ATLAS_PX,
    dv: (SIGN_PX - SIGN_BLEED * 2) / ATLAS_PX,
    m: 0.001,
  })];
});
// One lookup for geo.js's `part(..., { tex })`, so a sign is addressed exactly like a grain tile.
export const TILES = Object.freeze(Object.fromEntries([...GRAIN_TILES, ...SIGN_TILES]));
export const SIGN_NAMES = Object.freeze(SIGN_LAYOUT.slice());
export const BLANK = TILES.blank;

// ── painting helpers ────────────────────────────────────────────────────────────────────────────
// mulberry32: 32 bits of state, one multiply-xorshift round. Fast, and good enough for grain.
function rngFor(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Linear multiplier -> the sRGB byte that decodes back to it. See the header: the whole point is
// that the numbers in the painters below are the numbers the shader multiplies by.
function srgbByte(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}
const grey = v => { const b = srgbByte(v); return `rgb(${b},${b},${b})`; };

// Smooth 1-D value noise across the tile: `cells` random stops, cosine-ish interpolated. Used for
// the broad tonal variation that has to survive being mipped down to a handful of texels.
function bands(rnd, cells, size = TILE_PX) {
  const v = new Float32Array(cells);
  for (let i = 0; i < cells; i++) v[i] = rnd();
  const step = size / cells;
  return p => {
    const t = p / step, i = Math.floor(t), f = t - i;
    const a = v[i % cells], b = v[(i + 1) % cells];
    return a + (b - a) * (f * f * (3 - 2 * f));
  };
}
// The same in 2-D, for mottled surfaces (plaster, paper).
function mottle(rnd, cells, size = TILE_PX) {
  const n = cells + 1, v = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) v[i] = rnd();
  const step = size / cells;
  return (x, y) => {
    const tx = x / step, ty = y / step;
    const ix = Math.min(cells - 1, tx | 0), iy = Math.min(cells - 1, ty | 0);
    const fx = tx - ix, fy = ty - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const top = v[iy * n + ix] + (v[iy * n + ix + 1] - v[iy * n + ix]) * sx;
    const bot = v[(iy + 1) * n + ix] + (v[(iy + 1) * n + ix + 1] - v[(iy + 1) * n + ix]) * sx;
    return top + (bot - top) * sy;
  };
}
const S = TILE_PX;

// ── the ten tiles ───────────────────────────────────────────────────────────────────────────────
// Each painter draws the FULL 256 px cell (the bleed margin included, so filtering at the rect edge
// finds real grain rather than white) into an already-clipped, already-translated context.

// The default. Pure white: an untagged part must render exactly as it did before this batch.
function paintBlank(ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S); }

// Wood: broad heartwood bands (survive mip-down, so a table still reads as wood from the game's
// wide camera) plus fine wandering grain lines and two knots (only readable up close).
function paintWood(ctx, rnd) {
  const lo = bands(rnd, 4), mid = bands(rnd, 13), hi = bands(rnd, 47);
  for (let y = 0; y < S; y++) {
    const t = Math.pow(lo(y) * 0.6 + mid(y) * 0.27 + hi(y) * 0.13, 0.55);
    ctx.fillStyle = grey(0.865 + t * 0.135);
    ctx.fillRect(0, y, S, 1);
  }
  for (let i = 0; i < 18; i++) {
    const y0 = rnd() * S, amp = 1.5 + rnd() * 7.5, freq = (0.5 + rnd() * 1.6) * Math.PI * 2 / S;
    const phase = rnd() * 7;
    ctx.strokeStyle = grey(0.7 + rnd() * 0.12);
    ctx.lineWidth = 0.9 + rnd() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 4) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (const [kx, ky, kr] of [[0.28, 0.62, 9], [0.74, 0.22, 6]]) {
    for (let r = kr; r > 0; r -= 1.6) {
      ctx.strokeStyle = grey(0.74 + (r / kr) * 0.16);
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(kx * S, ky * S, r * 1.7, r, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// Floor tile: a stone speckle, a slight tone shift per quarter so the four sub-tiles are not
// clones, and a grout cross. Authored at m = 1.0 against buildStatic's 1 m floor tiles, so each
// reads as four 0.5 m tiles. The outer joint is drawn too, HALF of it along each edge, so two flush
// neighbours meet in one full joint: the floor used to leave a 2 cm geometric gap for it, which the
// depth-outline pass turned into lines crawling across the room (props.js tileFloor).
function paintTile(ctx, rnd) {
  ctx.fillStyle = grey(0.995); ctx.fillRect(0, 0, S, S);
  for (let q = 0; q < 4; q++) {
    ctx.fillStyle = grey(0.94 + rnd() * 0.06);
    ctx.fillRect((q & 1) * (S / 2), (q >> 1) * (S / 2), S / 2, S / 2);
  }
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = grey(0.89 + rnd() * 0.11);
    ctx.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1);
  }
  ctx.fillStyle = grey(0.88);
  ctx.fillRect(S / 2 - 5, 0, 10, S); ctx.fillRect(0, S / 2 - 5, S, 10);  // grout shoulder
  // 0.78, not 0.66. Judged on a wide capture at the game's real framing: at 0.66 the joints read as
  // graph paper across the whole floor, and on a phone — where the same grid lands in a third of the
  // pixels — that would be worse, not better. At 0.78 the floor still says "tiles this big" without
  // the room turning into a grid.
  ctx.fillStyle = grey(0.78);
  ctx.fillRect(S / 2 - 2, 0, 4, S); ctx.fillRect(0, S / 2 - 2, S, 4);    // the joint itself
  // The outer half-joints, run out across the bleed margin so a sample that strays past the
  // addressed rect still lands on joint colour.
  const E = BLEED_PX;
  ctx.fillStyle = grey(0.88);
  ctx.fillRect(0, 0, S, E + 5); ctx.fillRect(0, S - E - 5, S, E + 5); ctx.fillRect(0, 0, E + 5, S); ctx.fillRect(S - E - 5, 0, E + 5, S);
  ctx.fillStyle = grey(0.78);
  ctx.fillRect(0, 0, S, E + 2); ctx.fillRect(0, S - E - 2, S, E + 2); ctx.fillRect(0, 0, E + 2, S); ctx.fillRect(S - E - 2, 0, E + 2, S);
}

// Fabric: a real plain weave — warp threads under, weft threads over, alternating cell by cell.
// A checker would read as a checker; the over/under is what makes it read as cloth.
function paintFabric(ctx, rnd) {
  ctx.fillStyle = grey(0.995); ctx.fillRect(0, 0, S, S);
  const pitch = 10, th = 8;
  ctx.fillStyle = grey(0.855);                     // the shadowed gaps between threads
  for (let x = 0; x < S; x += pitch) ctx.fillRect(x + th, 0, pitch - th, S);
  for (let y = 0; y < S; y += pitch) ctx.fillRect(0, y + th, S, pitch - th);
  for (let y = 0; y < S; y += pitch) {
    for (let x = 0; x < S; x += pitch) {
      const over = (((x / pitch) | 0) + ((y / pitch) | 0)) & 1;
      ctx.fillStyle = grey(over ? 1.0 : 0.945);    // whichever thread is on top catches the light
      ctx.fillRect(x, y, th, th);
    }
  }
  for (let i = 0; i < 3000; i++) {                 // fuzz, so the weave is not mechanical
    ctx.fillStyle = grey(0.88 + rnd() * 0.12);
    ctx.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1);
  }
}

// Ceramic: near-white with a fine speckle and a few glaze pools. Deliberately the subtlest tile —
// a plate that reads as textured reads as dirty.
function paintCeramic(ctx, rnd) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) {
    const r = 14 + rnd() * 34;
    ctx.fillStyle = grey(0.925 + rnd() * 0.06);
    ctx.beginPath(); ctx.ellipse(rnd() * S, rnd() * S, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = grey(0.82 + rnd() * 0.18);
    ctx.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1);
  }
}

// Fur: soft directional noise. Layers of low-alpha strokes at a common lean, which is what a coat
// looks like at the distance this game is played at; individual hairs never resolve.
function paintFur(ctx, rnd) {
  ctx.fillStyle = grey(0.99); ctx.fillRect(0, 0, S, S);
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * S, y = rnd() * S;
      const a = -0.42 + (rnd() - 0.5) * 0.5, len = 9 + rnd() * 24;
      ctx.strokeStyle = grey(pass ? 1.0 : 0.66 + rnd() * 0.2);
      ctx.lineWidth = 0.9 + rnd() * 2.0;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// Paper: a faint fibre mottle plus short loose fibres. Used for menu cards, sign boards, sacks and
// the counter's tray board.
function paintPaper(ctx, rnd) {
  const m = mottle(rnd, 22);
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = grey(0.915 + m(x, y) * 0.085);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, len = 4 + rnd() * 12;
    ctx.strokeStyle = grey(0.74 + rnd() * 0.16); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Brushed metal: long horizontal scratches over a slow vertical tone drift.
function paintMetal(ctx, rnd) {
  const drift = bands(rnd, 9);
  for (let y = 0; y < S; y++) { ctx.fillStyle = grey(0.935 + drift(y) * 0.065); ctx.fillRect(0, y, S, 1); }
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 1700; i++) {
    const y = (rnd() * S) | 0, x = rnd() * S, len = 30 + rnd() * 220;
    ctx.fillStyle = grey(0.76 + rnd() * 0.24);
    ctx.fillRect(x, y, len, 1);
  }
  ctx.globalAlpha = 1;
}

// Foliage: a scatter of small leaf blades with midribs, not one big leaf. The bushes and tree
// crowns this lands on are spheres, and geo.js box-projects them, so whatever a face shows has to
// read as foliage from any of three directions.
function paintLeaf(ctx, rnd) {
  const m = mottle(rnd, 12);
  for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) {
    ctx.fillStyle = grey(0.925 + m(x, y) * 0.075);
    ctx.fillRect(x, y, 4, 4);
  }
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2, r = 10 + rnd() * 18;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = grey(0.82 + rnd() * 0.12);
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = grey(0.7); ctx.lineWidth = 1.0;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    for (let v = -r + 3; v < r - 2; v += 4) {
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v + 3, r * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v + 3, -r * 0.3); ctx.stroke();
    }
    ctx.restore();
  }
}

// Plaster: a slow, soft mottle with a fine tooth. Authored at m = 2.2 because it goes on walls,
// which are the largest single surfaces in the room.
function paintPlaster(ctx, rnd) {
  const broad = mottle(rnd, 6), fine = mottle(rnd, 40);
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = grey(0.905 + broad(x, y) * 0.075 + fine(x, y) * 0.025);
    ctx.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = grey(0.78 + rnd() * 0.14);
    ctx.fillRect((rnd() * S) | 0, (rnd() * S) | 0, 1, 1);
  }
}

const PAINTERS = {
  blank: paintBlank, wood: paintWood, tile: paintTile, fabric: paintFabric, ceramic: paintCeramic,
  fur: paintFur, paper: paintPaper, metal: paintMetal, leaf: paintLeaf, plaster: paintPlaster,
};

// ── the sign glyphs ─────────────────────────────────────────────────────────────────────────────
// Drawn into a 128 px cell with the y axis flipped, so these coordinates read the way the sign
// stands in the world (+y up) instead of the way a canvas counts rows.
//
// They are BOLD on purpose. A station sign is about 30 px tall at 1280x720 and about 17 px on a
// 380 px phone, and the atlas is mipmapped: a thin outline averages away to nothing two mip levels
// down. So every glyph is a filled silhouette with strokes no thinner than 7 px, tested by looking
// at the frame rather than at the tile.
// Judged on a 4x crop of a real 1280x720 frame, not on the tile: at 0.30/0.52 the cupcake came out
// as a soft grey blob about thirty pixels across. A sign glyph is mipped down hard and then toon-lit
// on a cream board, and both steps eat contrast, so the ink has to start much darker than it looks
// in the atlas.
const INK = 0.17;      // the multiplier the glyph paints — near-black once it hits the cream board
const INK2 = 0.34;     // a second value, for the parts of a glyph that must stay separable
const SP = SIGN_PX;
function signCircle(ctx, x, y, r, v) { ctx.fillStyle = grey(v); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function signPoly(ctx, pts, v) {
  ctx.fillStyle = grey(v); ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath(); ctx.fill();
}
// A white gap knocked out around a shape before it is inked. This is what makes a two-part glyph
// stay two parts: a cupcake's dome sitting straight on its case, or a scoop on a cone, merged into
// one dark lump the moment the tile was mipped down to forty pixels (checked against a rendered
// frame, not the tile). A 6 px moat is invisible at full size and is the whole difference at play
// size. `halo` runs the same path fatter, in the board's own cream, underneath.
function halo(ctx, draw, grow = SP * 0.05) {
  ctx.save();
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = grow * 2;
  draw(ctx, true);
  ctx.restore();
  draw(ctx, false);
}
const SIGN_PAINTERS = {
  // A round cookie with chips — the whole "baked goods" family (a star tier may swap the recipe
  // between cookie and brownie; the sign says the family, so it never goes stale).
  pastry(ctx) {
    signCircle(ctx, SP * 0.5, SP * 0.5, SP * 0.35, INK);
    // Chips knocked out in the board's own cream rather than tinted: a light dot on a dark disc is
    // the only way a chip survives mipping, and it is what tells the disc from the coin glyph.
    for (const [x, y, r] of [[0.40, 0.62, 0.07], [0.60, 0.58, 0.065], [0.50, 0.40, 0.07], [0.66, 0.40, 0.055], [0.35, 0.44, 0.06]]) {
      signCircle(ctx, SP * x, SP * y, SP * r, 1.0);
    }
  },
  // A muffin case with a swirl on top. The two halves are separated by a white moat and the case is
  // fluted with white lines, because at play size a dome drawn straight onto a case reads as one
  // lump — which is exactly what the first pass shipped.
  cupcake(ctx) {
    const casePts = [[SP * 0.30, SP * 0.44], [SP * 0.70, SP * 0.44], [SP * 0.62, SP * 0.10], [SP * 0.38, SP * 0.10]];
    const caseDraw = (c, outline) => {
      c.beginPath();
      casePts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      if (outline) { c.fill(); c.stroke(); return; }
      c.fillStyle = grey(INK); c.fill();
    };
    halo(ctx, caseDraw);
    // Flutes: white gaps, so the case reads as pleated paper rather than as a grey trapezoid.
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = SP * 0.035;
    for (const x of [0.43, 0.57]) { ctx.beginPath(); ctx.moveTo(SP * x, SP * 0.12); ctx.lineTo(SP * x, SP * 0.42); ctx.stroke(); }
    // A full swirl, not a half-dome: an arc drawn on a y-flipped canvas is a trap (the first attempt
    // came out as a bowl), and a round frosting swirl reads better at play size anyway.
    const domeDraw = (c, outline) => {
      c.beginPath(); c.ellipse(SP * 0.5, SP * 0.62, SP * 0.28, SP * 0.2, 0, 0, Math.PI * 2);
      if (outline) { c.fill(); c.stroke(); return; }
      c.fillStyle = grey(INK); c.fill();
    };
    halo(ctx, domeDraw, SP * 0.055);
    halo(ctx, (c, outline) => {
      c.beginPath(); c.arc(SP * 0.5, SP * 0.90, SP * 0.07, 0, Math.PI * 2);
      if (outline) { c.fill(); c.stroke(); return; }
      c.fillStyle = grey(INK); c.fill();
    }, SP * 0.05);
  },
  // A cup with a handle on a saucer: coffee, and anything hot served in one.
  cup(ctx) {
    signPoly(ctx, [[SP * 0.28, SP * 0.7], [SP * 0.68, SP * 0.7], [SP * 0.6, SP * 0.28], [SP * 0.36, SP * 0.28]], INK);
    ctx.strokeStyle = grey(INK); ctx.lineWidth = SP * 0.075;
    ctx.beginPath(); ctx.arc(SP * 0.7, SP * 0.53, SP * 0.13, -1.2, 1.2); ctx.stroke();
    ctx.fillStyle = grey(INK); ctx.fillRect(SP * 0.2, SP * 0.16, SP * 0.6, SP * 0.085);
    ctx.fillStyle = grey(0.78); ctx.fillRect(SP * 0.33, SP * 0.63, SP * 0.3, SP * 0.06);
  },
  // A tall tapered glass with a straw.
  smoothie(ctx) {
    signPoly(ctx, [[SP * 0.33, SP * 0.76], [SP * 0.67, SP * 0.76], [SP * 0.58, SP * 0.14], [SP * 0.42, SP * 0.14]], INK);
    ctx.fillStyle = grey(0.8); ctx.fillRect(SP * 0.3, SP * 0.7, SP * 0.4, SP * 0.075);
    ctx.save(); ctx.translate(SP * 0.6, SP * 0.78); ctx.rotate(0.3);
    ctx.fillStyle = grey(INK); ctx.fillRect(-SP * 0.04, -SP * 0.02, SP * 0.08, SP * 0.3); ctx.restore();
  },
  // A waffle cone with a scoop — the ice cream garden's whole family.
  cone(ctx) {
    // Cone below, scoop above, a white moat between them: drawn touching, the two became a single
    // dark teardrop at play size.
    halo(ctx, (c, outline) => {
      c.beginPath(); c.moveTo(SP * 0.31, SP * 0.46); c.lineTo(SP * 0.69, SP * 0.46); c.lineTo(SP * 0.5, SP * 0.06); c.closePath();
      if (outline) { c.fill(); c.stroke(); return; }
      c.fillStyle = grey(INK); c.fill();
    });
    // No waffle hatching. Two knocked-out lines across a 40 px triangle removed most of the cone
    // instead of texturing it; the silhouette alone is what carries at this size.
    halo(ctx, (c, outline) => {
      c.beginPath(); c.ellipse(SP * 0.5, SP * 0.66, SP * 0.26, SP * 0.2, 0, 0, Math.PI * 2);
      c.ellipse(SP * 0.5, SP * 0.84, SP * 0.16, SP * 0.13, 0, 0, Math.PI * 2);
      if (outline) { c.fill(); c.stroke(); return; }
      c.fillStyle = grey(INK); c.fill();
    }, SP * 0.055);
  },
  // A paw: the pet treat bar.
  paw(ctx) {
    // Pad and toes, each with its own white moat: run together they read as a bumpy blob.
    halo(ctx, (c, outline) => {
      c.beginPath(); c.ellipse(SP * 0.5, SP * 0.36, SP * 0.25, SP * 0.21, 0, 0, Math.PI * 2);
      if (outline) { c.fill(); c.stroke(); return; }
      c.fillStyle = grey(INK); c.fill();
    }, SP * 0.05);
    for (const [x, y, r] of [[0.22, 0.65, 0.11], [0.41, 0.79, 0.115], [0.59, 0.79, 0.115], [0.78, 0.65, 0.11]]) {
      halo(ctx, (c, outline) => {
        c.beginPath(); c.arc(SP * x, SP * y, SP * r, 0, Math.PI * 2);
        if (outline) { c.fill(); c.stroke(); return; }
        c.fillStyle = grey(INK); c.fill();
      }, SP * 0.045);
    }
  },
  // A coin: wherever money changes hands.
  coin(ctx) {
    signCircle(ctx, SP * 0.5, SP * 0.5, SP * 0.34, INK);
    signCircle(ctx, SP * 0.5, SP * 0.5, SP * 0.24, 0.9);
    ctx.fillStyle = grey(INK); ctx.fillRect(SP * 0.455, SP * 0.28, SP * 0.09, SP * 0.44);
    ctx.fillRect(SP * 0.34, SP * 0.46, SP * 0.32, SP * 0.09);
  },
  // A tied sack: the pantry.
  sack(ctx) {
    signPoly(ctx, [[SP * 0.26, SP * 0.16], [SP * 0.74, SP * 0.16], [SP * 0.68, SP * 0.62],
      [SP * 0.58, SP * 0.72], [SP * 0.42, SP * 0.72], [SP * 0.32, SP * 0.62]], INK);
    ctx.fillStyle = grey(0.8); ctx.fillRect(SP * 0.38, SP * 0.66, SP * 0.24, SP * 0.07);
    signPoly(ctx, [[SP * 0.4, SP * 0.74], [SP * 0.6, SP * 0.74], [SP * 0.66, SP * 0.9], [SP * 0.34, SP * 0.9]], INK2);
  },
  // Three berries and a leaf: the fruit bushes and the fruit garden.
  berry(ctx) {
    signCircle(ctx, SP * 0.36, SP * 0.36, SP * 0.16, INK);
    signCircle(ctx, SP * 0.64, SP * 0.36, SP * 0.16, INK);
    signCircle(ctx, SP * 0.5, SP * 0.58, SP * 0.17, INK);
    ctx.save(); ctx.translate(SP * 0.5, SP * 0.78); ctx.rotate(-0.5);
    ctx.fillStyle = grey(INK2); ctx.beginPath(); ctx.ellipse(0, 0, SP * 0.2, SP * 0.085, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // A gear: the upgrade kiosk.
  gear(ctx) {
    ctx.fillStyle = grey(INK);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.save(); ctx.translate(SP * 0.5, SP * 0.5); ctx.rotate(a);
      ctx.fillRect(-SP * 0.075, SP * 0.2, SP * 0.15, SP * 0.16); ctx.restore();
    }
    signCircle(ctx, SP * 0.5, SP * 0.5, SP * 0.28, INK);
    signCircle(ctx, SP * 0.5, SP * 0.5, SP * 0.1, 0.92);
  },
  // A head and shoulders: the staff desk.
  person(ctx) {
    signCircle(ctx, SP * 0.5, SP * 0.7, SP * 0.19, INK);
    signPoly(ctx, [[SP * 0.2, SP * 0.1], [SP * 0.8, SP * 0.1], [SP * 0.72, SP * 0.42],
      [SP * 0.62, SP * 0.5], [SP * 0.38, SP * 0.5], [SP * 0.28, SP * 0.42]], INK);
  },
  // A crate with a down arrow: give it back here.
  crate(ctx) {
    ctx.fillStyle = grey(INK); ctx.fillRect(SP * 0.18, SP * 0.14, SP * 0.64, SP * 0.4);
    ctx.fillStyle = grey(0.86); ctx.fillRect(SP * 0.26, SP * 0.2, SP * 0.48, SP * 0.09);
    ctx.fillStyle = grey(INK2);
    ctx.fillRect(SP * 0.44, SP * 0.6, SP * 0.12, SP * 0.3);
    signPoly(ctx, [[SP * 0.32, SP * 0.64], [SP * 0.68, SP * 0.64], [SP * 0.5, SP * 0.42]], INK2);
  },
};
// The plaque ground plus a hairline inner margin, so the glyph never runs into the board's frame.
function paintSign(ctx, name) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SP, SP);
  ctx.save();
  // +y up, matching the world: the atlas is flipY:false and geo.js takes v straight from world y.
  ctx.translate(0, SP); ctx.scale(1, -1);
  ctx.save();
  ctx.translate(SP * 0.5, SP * 0.5); ctx.scale(0.94, 0.94); ctx.translate(-SP * 0.5, -SP * 0.5);
  SIGN_PAINTERS[name](ctx);
  ctx.restore();
  ctx.restore();
}

// ── the atlas ───────────────────────────────────────────────────────────────────────────────────
let _tex = null, _built = false;
/**
 * The shared detail atlas, built once on first use. Returns null where there is no DOM — the unit
 * tests import the render layer under `node --test` and must not need a canvas; palette.js simply
 * leaves `map` unset there, which is the pre-grain material exactly.
 */
export function grainAtlas() {
  if (_built) return _tex;
  _built = true;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_PX;
  const ctx = canvas.getContext && canvas.getContext('2d');
  // A canvas that cannot actually draw is treated as no canvas at all. test/portrait.test.js
  // injects a deliberately minimal fake `document.createElement('canvas')` (createImageData and
  // putImageData, nothing else), and a texture is never worth throwing from inside a material
  // constructor for: the game must fall back to the flat look, not to a black screen.
  if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.ellipse !== 'function') return null;
  // Cells this layout does not name stay pure white, so a UV that lands on one is a no-op rather
  // than a surprise.
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
  LAYOUT.forEach(([name], i) => {
    const ox = (i % GRID) * TILE_PX, oy = ((i / GRID) | 0) * TILE_PX;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, TILE_PX, TILE_PX); ctx.clip();   // no painter can reach a neighbour
    ctx.translate(ox, oy);
    PAINTERS[name](ctx, rngFor(0x9E3779B1 + i * 0x85EBCA77));
    ctx.restore();
  });
  // The station signs, in the quartered cells the grain tiles leave empty.
  SIGN_LAYOUT.forEach((name, i) => {
    const cell = LAYOUT.length + (i >> 2), sub = i & 3;
    const ox = (cell % GRID) * TILE_PX + (sub & 1) * SIGN_PX;
    const oy = ((cell / GRID) | 0) * TILE_PX + ((sub >> 1) & 1) * SIGN_PX;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, SIGN_PX, SIGN_PX); ctx.clip();
    ctx.translate(ox, oy);
    paintSign(ctx, name);
    ctx.restore();
  });
  const t = new THREE.CanvasTexture(canvas);
  // sRGB: the painters author display-referred bytes and scene.js renders with
  // outputColorSpace = SRGBColorSpace, so three decodes this to linear before multiplying it by
  // the (already linear) vertex colour. gradientMap is NOT sRGB, but that is a ramp LOOKUP, not a
  // colour — the two are configured differently on purpose.
  t.colorSpace = THREE.SRGBColorSpace;
  // The painters draw in canvas coordinates and TILES is laid out in the same coordinates; turning
  // the flip off is what makes `blank` at cell 0 sit at UV (0,0), the value WebGL hands the shader
  // for a geometry with no uv attribute at all.
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // an atlas must never wrap
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  // Anisotropy, requested rather than measured: three clamps this to whatever the GPU actually
  // offers, so 8 means "as sharp as this device will give me, up to 8". Trilinear alone picks its mip
  // off the STEEPEST axis, and almost every surface in this game is seen at a slant from a camera
  // pitched 52° down — the floor and the deck most of all, and the station sign glyphs worst, because
  // a board is short in exactly the direction the camera compresses. Nothing here costs a draw call.
  t.anisotropy = 8;
  t.needsUpdate = true;
  return _tex = t;
}
