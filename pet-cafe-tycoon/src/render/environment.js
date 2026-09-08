// src/render/environment.js — the world beyond the café walls.
//
// WHY THIS EXISTS
// props.js lays a single 90x90 slab of flat green and notes "sky never in frame at this pitch".
// That holds in landscape. In portrait the camera pitches down over a much taller frame and the
// slab fills the bottom third with dead, untextured colour — the single loudest "unfinished"
// signal in a screenshot, and the first thing that separates this from a studio build.
//
// The café occupies x -10..10, z -7..7, with +z toward the camera. Streets already exist north and
// west, which is the FAR side. Everything the player actually sees below the café — the near side,
// +z and +x — was empty. So that is where the content goes.
//
// LAYOUT RULES
//   near  (z 7.5..14)  low only: grass, beds, path, pond, agility toys. Anything tall here sits
//                      between the camera and the café and would occlude the game.
//   mid   (z 14..24)   trees and hedges, tall enough to read as a world, far enough not to block.
//   far   (z 24..40)   town silhouette, no detail, pure depth cue.
//
// TRIANGLE BUDGET (garden)
// The near band is static, merged and permanently on screen, so it is both the cheapest place to
// spend triangles and the most expensive place to waste them. Every bloom is assembled from 3- and
// 4-segment primitives whose exact cost is written beside it, and the whole near-band population is
// held under the ceiling of 120 blooms at 40 triangles each. What makes a flower read as a flower
// at this scale is the silhouette — a five-lobed rosette instead of one blob — not the facet count,
// which is why a pile of tiny primitives beats a single smooth sphere for a fraction of the cost.
//
// Everything merges into a handful of draw calls via geo.js, and the layout is seeded so it is
// identical on every device and across reloads.

import * as THREE from 'three';
import { part, mesh, colorize } from './geo.js';
import { buildRegion } from './props.js';

// Small deterministic PRNG (mulberry32). A fixed layout matters: screenshots, the visual-reference
// workflow and the responsive audit all compare frames across runs.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Palette ------------------------------------------------------------------------------------
// Exported and kept in one block on purpose: Seasons re-tints the garden by swapping these arrays,
// and that stays cheap only while no garden colour literal lives anywhere else in this file.
// Bloom colours are deliberately saturated. The previous muted set was chosen to sit inside the
// sepia grade; with that grade gone, muted petals read as grey hexagons in a screenshot.
export const GARDEN_PALETTE = {
  grass: ['#BFE0A2', '#B4D998', '#C7E6AC', '#AAD190'],
  foliage: ['#6FB56F', '#5EA463', '#7BC47F', '#549456'],
  trunk: '#9A6B4A',
  town: ['#E8D6C6', '#DCC6BE', '#EFE0CE', '#D6C4C8', '#E3D2BC'],
  townRoof: '#C89187',
  pebble: ['#CFC7BA', '#BEB4A6'],

  // Blooms. Four families, so a bed reads as planted rather than dyed one colour.
  petalPink: ['#FF4D8D', '#FF6FA8', '#F5297A', '#FF89B8', '#E63C86'],
  petalSun: ['#FFC219', '#FFD84A', '#FFA800', '#FFE066'],
  petalViolet: ['#A94BF0', '#8B5CF6', '#C766F2', '#7B45DE'],
  petalWhite: ['#FFFFFF', '#FFF2F8', '#FFF8E8'],
  bloomCore: ['#FFD84A', '#FFC219', '#FF9C33', '#FFE8A0'],
  daisyCore: '#FFC219',

  stem: '#4F9455',
  leaf: ['#57A45C', '#4A8F50', '#68B36A'],

  // Garden garland along the picket line (new for the Seasons pass) -- an unlit bright-pass bulb
  // string, the same construction as the props/ambience string lights but exterior and seasonal.
  // The SAME array also colours the café-fence festoon added by the in-frame pass below, which is
  // the copy the player actually sees (see the IN-FRAME SEASONAL DRESSING block in buildScenery).
  stringLight: ['#FF9EC4', '#FFE29A', '#FFFFFF'],

  // The terrace deck floor (props.js buildRegion). Blossom's three values ARE the literals
  // buildRegion shipped with, so a palette-less buildRegion call still renders exactly today's
  // deck and only this file ever moves them. The deck is the single largest surface in the default
  // camera once the terrace is bought, so a small seasonal shift here changes the colour
  // temperature of most of the frame without ever reading as "the deck was rebuilt".
  deckBorder: '#E6E0D6',
  deckBase: '#C69A6B',
  deckPlank: '#D9B48A',

  // Fallen petals / leaves / frost lying on the deck planks. Toon-lit (not the bright pass) so it
  // sits IN the deck's own shadow instead of glowing off it after dark.
  // MEASURED: an earlier draft put pure white in both this set and Splash's, and side by side the
  // two seasons read as the same pale deck with slightly different specks. Blossom is now all
  // pinks -- no white at all -- so the pair separates on hue and not on brightness alone.
  litter: ['#FF9EC4', '#FFD3E4', '#FFC7DD', '#F7B7D4'],

  planterBody: '#A9764E',
  planterRim: '#D9A066',
  planterPost: '#C08A56',
  soil: '#5A3E2B',

  pathStone: '#D8CFC2',
  pathStoneToe: '#CDC2B3',

  pondRim: '#9CC08A',
  pondDeep: '#79B8D4',
  pondShallow: '#A8DCEF',
  lily: '#6FB56F',
  reedStem: '#4E8F52',
  reedHead: '#8A5A3A',

  hoopPost: '#E8A0A8',
  hoopRing: '#FF8FA8',
  hoopInner: '#BFE0A2',
  ramp: '#D9A066',
  rampLeg: '#B9834A',
  tunnelA: '#8FC8E8',
  tunnelB: '#B4E0F2',
  bowl: '#E88CA6',
  benchSeat: '#C89A6B',
  benchLeg: '#8A6B50',
  picket: '#FBF3E6',
};

// ---- Seasons -------------------------------------------------------------------------------------
// Four named looks, index-matched to src/sim/saveSchema.js's SAVE_LIMITS.maxSeasonIndex (3) and to
// meta.season.index as that module already normalizes it (see normalizeSeason there). GARDEN_PALETTE
// above IS Blossom's palette -- authoring it that way (rather than a separate blossom-only table)
// means the pre-Seasons look is exactly index 0 and no existing caller of GARDEN_PALETTE changes.
//
// WHO CONSUMES seasonId: this module never reads meta.season itself and does not import
// src/sim/seasons.js (parallel work; had not landed yet when this file was first drafted). Now that
// it has, its own SEASON_IDS and SEASON_CONTENT[id].paletteId match this array and these palette
// keys exactly ('blossom'/'splash'/'harvest'/'lights', same order) -- confirmed, not reconciled
// further. Every entry point below (buildEnvironment, group.setSeason) still just takes a season id
// STRING as a plain argument; the caller (game.js, not owned here) is expected to pass
// seasons.seasonForDay(day).id straight through. See this task's wiringNeeded for the exact glue.
export const SEASON_IDS = Object.freeze(['blossom', 'splash', 'harvest', 'lights']);

// Only the fields that change; everything else falls back to GARDEN_PALETTE (Blossom). Values are
// chosen to sit at similar saturation/lightness to the family they replace -- see the readability
// note above buildEnvironment for why that matters against the daylight grade.
const SEASON_PALETTE_OVERRIDES = {
  blossom: null, // GARDEN_PALETTE as authored.

  // Splash -- bright tropical summer: warm sun-bleached lawn, teal-green foliage, hibiscus/plumbago
  // blooms, aqua garland.
  splash: {
    grass: ['#D8EFB0', '#CFEAA0', '#E2F3C0', '#C6E293'],
    foliage: ['#2FAE8C', '#3FBF8F', '#57D1A0', '#26A07E'],
    petalPink: ['#FF5A5F', '#FF7A85', '#FF3D57', '#FF9AA6', '#E8404F'],
    petalSun: ['#FFB627', '#FFD166', '#FF8C42', '#FFCB55'],
    petalViolet: ['#2EC4E0', '#38B6D6', '#1AA6C9', '#5FD4E8'],
    bloomCore: ['#FFD166', '#FFB627', '#FF8C42', '#FFE08A'],
    daisyCore: '#FFB627',
    stem: '#2E8F6E', leaf: ['#2FAE8C', '#26A07E', '#3FBF8F'],
    stringLight: ['#5FE0E8', '#FFFFFF', '#2EC4E0'],
    // Deck: sun-bleached. Lighter and a touch cooler than Blossom's honey, which is what a timber
    // deck actually does in high summer, and it pushes the whole frame away from Harvest's amber.
    deckBorder: '#F4F1E8', deckBase: '#D4B389', deckPlank: '#EAD4AE',
    // Aqua-dominant with one coral and one gold: reads as pool spray, and the two cyans against
    // Blossom's all-pink set are what tell the two pale-deck seasons apart at a glance.
    litter: ['#5FE0E8', '#2EC4E0', '#FFD166', '#FF7A85', '#38B6D6'],
  },

  // Harvest -- autumn: golden dry lawn, orange/red tree crowns, mum/pumpkin blooms, lantern garland.
  harvest: {
    grass: ['#E0C98A', '#D4BC7A', '#E8D49A', '#CBAF6E'],
    foliage: ['#D97B3F', '#C2622E', '#E0954E', '#B85A2A'],
    petalPink: ['#C13E3E', '#A62F2F', '#D65454', '#8F2A2A'],
    petalSun: ['#F2994A', '#E07B1E', '#F4B860', '#D9660B'],
    petalViolet: ['#7A3B5E', '#8C4A6B', '#5E2A45', '#9C5A7A'],
    petalWhite: ['#FFF3D6', '#FFE9B8', '#FFF8E8'],
    bloomCore: ['#E0954E', '#C2622E', '#F2C078', '#D9660B'],
    daisyCore: '#E0954E',
    stem: '#8A7A3E', leaf: ['#9C8A4A', '#8A7A3E', '#7A6A32'],
    stringLight: ['#FFA94D', '#FF7B25', '#FFD08A'],
    // Deck: the deepest, most saturated amber of the four. Harvest and Lights are the pair most at
    // risk of reading alike (both lean warm-red), so Harvest takes the warm deck and Lights the
    // cool one -- that single difference separates them across most of the frame's area.
    deckBorder: '#E2D5BE', deckBase: '#AE7A4B', deckPlank: '#C58F5F',
    // Four browns/oranges/reds only: a monochrome warm scatter, so the eye reads "leaves".
    litter: ['#D9660B', '#C2622E', '#E0954E', '#8F2A2A'],
  },

  // Lights -- winter holiday: frosted lawn, deep evergreen crowns, poinsettia/holly/ornament blooms,
  // classic multicolour garland.
  lights: {
    grass: ['#D8E8D0', '#E4F0E0', '#CFE3C8', '#DCEAD4'],
    foliage: ['#2E6B4F', '#255A42', '#357860', '#1F4F3A'],
    petalPink: ['#E23B4E', '#C92A3D', '#F2596A', '#D6314A'],
    petalSun: ['#F2C744', '#E0B02E', '#F7D96B', '#EABE3C'],
    petalViolet: ['#7FB3E0', '#9CC9EA', '#5A96C9', '#8FC0E8'],
    petalWhite: ['#FFFFFF', '#F0F8FF', '#E8F4FF'],
    bloomCore: ['#F2C744', '#E0B02E', '#FFDE7A', '#EABE3C'],
    daisyCore: '#F2C744',
    stem: '#255A42', leaf: ['#2E6B4F', '#357860', '#255A42'],
    stringLight: ['#E23B4E', '#2E6B4F', '#F2C744', '#7FB3E0', '#FFFFFF'],
    // Deck: cool grey-brown under a near-white stone border. Timber under frost, and the deliberate
    // opposite of Harvest's amber (see Harvest's own note) so the two never share a frame tone.
    deckBorder: '#EFF4F8', deckBase: '#AB9184', deckPlank: '#C0A99F',
    // Snow + holly + one berry: the only litter set that mixes near-white with a dark green, which
    // is the read that separates it from Harvest's flat warm scatter even in a thumbnail. White is
    // listed three times because the pick is uniform over the array -- a 3:1:1:1 weighting makes it
    // a dusting of frost with holly in it rather than an even confetti of four equal colours.
    litter: ['#FFFFFF', '#F2F8FF', '#E8F4FF', '#2E6B4F', '#E23B4E', '#FFFFFF'],
  },
};

// A fresh palette object for `id` (falls back to Blossom for an unknown id, never throws). Shallow
// merge is safe here: every overridden field is a whole array or string, never mutated in place, so
// there is nothing partially-Blossom/partially-seasonal inside one field.
export function paletteForSeason(id) {
  const overrides = SEASON_PALETTE_OVERRIDES[id];
  return overrides ? { ...GARDEN_PALETTE, ...overrides } : GARDEN_PALETTE;
}

// Three size classes, exactly as the garden spec calls for.
const BLOOM_SCALES = [0.78, 1.0, 1.26];

// Keeps scenery clear of the café slab, its plinth and the pavements already drawn by props.js.
function insideCafe(x, z) { return x > -14 && x < 13 && z > -11 && z < 7.4; }

// ---- Bloom primitives ---------------------------------------------------------------------------
// geo.js `part()` cannot express the two shapes the flower budget depends on:
//   * an open-ended cone — half the triangles of a closed one, and on a stem or a leaf the missing
//     cap always faces the soil or the flower centre, so it is never visible;
//   * a sphere whose height segments are not width>>1 — `part('sph', [r, 3])` would build a
//     degenerate zero-triangle sphere, while a real 3x2 sphere is a usable 6-triangle petal.
// Both still produce plain merged geometry, so neither costs an extra draw call.
function finish(g, hex) { g.deleteAttribute('uv'); return colorize(g, hex); }

// A stem or a reed: 3 triangles. Tapers upward, which reads as a stalk and hides the open base.
function stalk(out, hex, r0, h, x, y, z, lean = 0) {
  const g = new THREE.ConeGeometry(r0, h, 3, 1, true);
  g.translate(0, h / 2, 0);
  if (lean) g.rotateZ(lean);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// A leaf: 3 triangles. A narrow open cone laid out and up from the base of the stem.
function leafBlade(out, hex, s, x, y, z, ang, lean = 1.12) {
  const g = new THREE.ConeGeometry(0.075 * s, 0.34 * s, 3, 1, true);
  g.scale(1, 1, 0.5);
  g.translate(0, 0.17 * s, 0);
  g.rotateZ(lean);
  g.rotateY(ang);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// A petal: a flattened sphere pushed out along the flower's radius and tilted up at the tip.
// `seg` 3 costs 6 triangles, `seg` 4 costs 8 — the only knob that matters at this size.
function petalLobe(out, hex, r, seg, cx, cy, cz, ang, tilt, len, flat, wide) {
  const g = new THREE.SphereGeometry(r, seg, 2);
  g.scale(len, flat, wide);
  g.translate(r * len * 0.92, 0, 0);
  g.rotateZ(tilt);
  g.rotateY(ang);
  g.translate(cx, cy, cz);
  out.push(finish(g, hex));
}

// A dome: a flower's centre, and the cattail on a reed. 6 triangles at seg 3, 8 at seg 4.
function dome(out, hex, r, seg, x, y, z, flat = 0.8) {
  const g = new THREE.SphereGeometry(r, seg, 2);
  g.scale(1, flat, 1);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// ---- Festoon / litter primitives (the in-frame pass) --------------------------------------------
// Same rule as the bloom primitives above: geo.js `part()` cannot express any of these at the cost
// they need, and every one of them merges into an existing draw call rather than adding one.

// A bunting pennant: an open 3-sided cone hanging point-down off a wire. 3 triangles. The missing
// cap faces straight up into the wire, so it is never visible; the z-squash turns a party hat into
// a piece of cloth, and the y-spin puts a flat face toward the camera rather than an edge.
function pennant(out, hex, r, h, x, y, z) {
  const g = new THREE.ConeGeometry(r, h, 3, 1, true);
  g.rotateX(Math.PI);            // apex down, open base ring up against the wire
  g.scale(1, 1, 0.34);
  g.rotateY(0.52);
  g.translate(x, y - h / 2, z);
  out.push(finish(g, hex));
}

// One straight chord of a festoon wire, drawn in the xy plane at a fixed z. 8 triangles: a 4-sided
// open cylinder, whose two open ends are always buried in the next chord or in a pole.
function wireSeg(out, hex, x0, y0, x1, y1, z) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const g = new THREE.CylinderGeometry(0.014, 0.014, len, 4, 1, true);
  g.rotateZ(Math.atan2(-dx, dy));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  out.push(finish(g, hex));
}

// A flat scrap of litter lying on the deck: 4 triangles, single-sided, facing up. The camera is
// always above it (PITCH 52 degrees), so the back face is never needed.
// A squashed 4-gon, not a quad: measured on screen, an axis-aligned rectangle at this size reads
// as a scrap of PAPER (confetti, or the game's own dirty-table debris) no matter what colour it
// is, while a pointed diamond reads as a leaf or a petal. Same triangle order of magnitude.
function litterFleck(out, hex, len, wide, x, y, z, yaw) {
  const g = new THREE.CircleGeometry(len * 0.5, 4);
  g.scale(1, wide / len, 1);
  g.rotateX(-Math.PI / 2);
  g.rotateY(yaw);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// The sag of a hung string: 0 at both poles, `amp` at mid-span. Deterministic, no rng, so a season
// swap can never move a bulb.
function sagY(top, amp, t) { return top - amp * Math.sin(Math.PI * t); }

// ---- One plant ----------------------------------------------------------------------------------
// Three species, so a bed varies in silhouette and not only in hue, and so the average cost lands
// under the 40-triangle ceiling: the tulip is very cheap and pays for the cluster, which is not.
// Every petal is a 3x2 sphere (6 triangles) and every stem and leaf an open 3-sided cone (3), so
// the bloom head — petals plus centre — is 36 or 38 triangles for a cluster or a daisy and 18 for a
// tulip, all inside the 40-triangle ceiling. Whole plants, stem and leaves included:
//   cluster  42 / 47 / 47   (small / mid / large)
//   tulip    27             (any size)
//   daisy    42 / 44 / 44
// Stems and leaves go to the toon-lit pass; petals go to the unlit bright pass so the saturation
// survives the shadow ramp instead of sinking into it.
function addPlant(P, petalSets, solid, bright, r, x, z, soilY) {
  const s = BLOOM_SCALES[(r() * 3) | 0];
  const small = s < 0.9;
  const coreSeg = small ? 3 : 4;                  // centre dome: 6 or 8 triangles
  const h = (0.2 + r() * 0.16) * s;               // stem height
  const cy = soilY + h;
  const spin = r() * Math.PI * 2;
  const kind = r();
  const leafCol = P.leaf[(r() * P.leaf.length) | 0];
  const family = petalSets[(r() * petalSets.length) | 0];
  const petalCol = family[(r() * family.length) | 0];

  stalk(solid, P.stem, 0.028 * s, h, x, soilY - 0.01, z);                       // 3

  if (kind < 0.36) {
    // Layered petal cluster: five petals in a ring with alternating tilt, so the ring reads as two
    // overlapping layers rather than a flat pinwheel, capped by a contrasting centre dome.
    for (let i = 0; i < 5; i++) {
      const a = spin + i * (Math.PI * 2 / 5);
      const tilt = (i & 1) ? 0.62 : 0.34;
      petalLobe(bright, petalCol, 0.105 * s, 3, x, cy, z, a, tilt, 1.35, 0.38, 0.98);
    }                                                                          // 30
    dome(bright, P.bloomCore[(r() * P.bloomCore.length) | 0], 0.072 * s, coreSeg,
      x, cy + 0.035 * s, z);                                                   // 6 or 8
    leafBlade(solid, leafCol, s, x, soilY + 0.01, z, spin + 1.1);              // 3
    if (!small) leafBlade(solid, leafCol, s, x, soilY + 0.01, z, spin + 4.0);  // 3
  } else if (kind < 0.71) {
    // Tulip: three tall petals leaned in until they close into a cup. An inverted cone would be
    // cheaper still, but its flat cap points straight at a camera that looks down, and a coloured
    // polygon facing the player is the exact thing this rework exists to remove.
    const lean = 1.02 + r() * 0.2;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * (Math.PI * 2 / 3);
      petalLobe(bright, petalCol, 0.085 * s, 3, x, cy + 0.02 * s, z, a, lean, 1.9, 0.42, 0.9);
    }                                                                          // 18
    leafBlade(solid, leafCol, s * 1.15, x, soilY + 0.01, z, spin + 0.6, 1.3);  // 3
    leafBlade(solid, leafCol, s * 1.15, x, soilY + 0.01, z, spin + 3.7, 1.3);  // 3
  } else {
    // Daisy: long thin white petals around a saturated yellow eye. The one bloom allowed to be
    // white, which is what makes the pinks and violets beside it look saturated.
    const white = P.petalWhite[(r() * P.petalWhite.length) | 0];
    for (let i = 0; i < 5; i++) {
      const a = spin + i * (Math.PI * 2 / 5);
      petalLobe(bright, white, 0.072 * s, 3, x, cy, z, a, 0.28, 2.1, 0.26, 0.62);
    }                                                                          // 30
    dome(bright, P.daisyCore, 0.062 * s, coreSeg, x, cy + 0.012 * s, z, 0.7);   // 6 or 8
    leafBlade(solid, leafCol, s, x, soilY + 0.01, z, spin + 2.3);              // 3
  }
}

// Builds one season's worth of scenery data (no THREE.Group, no meshes) from `area` and a palette
// resolved from `seasonId`. Pure with respect to colour: the rng is re-seeded identically every
// call, so two calls with different seasonId but the same area produce byte-identical vertex
// POSITIONS (every random draw is consumed in the same order regardless of which hex a palette
// array resolves an index to) and only the `color` attribute differs — this is what lets a season
// change re-colour the garden instead of rearranging it, exactly as the plan requires.
function buildScenery(area, seasonId) {
  const P = paletteForSeason(seasonId);
  // The four petal families, picked as a set so every bloom commits to one hue instead of speckling.
  const PETAL_SETS = [P.petalPink, P.petalSun, P.petalViolet, P.petalWhite];
  const W = area.size.w, D = area.size.d;
  const south = D / 2;   // +7, the near fence line
  const east = W / 2;    // +10
  const r = rng(0x9E3779B9);
  const solid = [];      // merged toon geometry — ALWAYS visible (mid/far rings, and any near-band
                          // content that falls outside the terrace's own footprint)
  const bright = [];     // merged unlit geometry (flowers, water sparkle) — always visible
  // Batch 1 — the regions engine (plan 7.1/3.1). Content whose footprint the terrace physically
  // occupies (x -10..10, z 7.4..14) goes here instead of `solid`/`bright`: it is the GARDEN that
  // gets replaced by the deck, so it must be possible to hide as one group without touching the
  // always-visible content above. Everything else (the broader lawn outside that footprint, the
  // mid ring of hedges/trees, the far town ring) is unaffected by buying the terrace and stays in
  // `solid`/`bright` exactly as before.
  const terrace = (area.regions || []).find(reg => reg.id === 'terrace') || null;
  const gSolid = [], gBright = [];
  const inTerrace = (x, z) => !!terrace && x >= terrace.x0 && x <= terrace.x1 && z >= terrace.z0 && z <= terrace.z1;

  const pick = arr => arr[(r() * arr.length) | 0];

  // ---- Ground cover -----------------------------------------------------------------------------
  // Broad, slightly varied patches instead of one flat colour. Overlapping quads at tiny height
  // offsets read as mown grass without a texture or a single extra draw call.
  for (let i = 0; i < 170; i++) {
    const x = -34 + r() * 68, z = -20 + r() * 58;
    if (insideCafe(x, z)) continue;
    const w = 2 + r() * 6, d = 2 + r() * 6;
    const arr = inTerrace(x, z) ? gSolid : solid;
    arr.push(part('box', [w, 0.12, d], pick(P.grass), { x, y: -0.48 + r() * 0.05, z }));
  }

  // Grass tufts and pebbles. Small vertical detail is what stops a lawn reading as a painted plane;
  // they are concentrated in the near band because that is the only part at legible scale.
  for (let i = 0; i < 150; i++) {
    const x = -22 + r() * 44, z = south + 0.6 + r() * 13;
    if (insideCafe(x, z)) continue;
    const h = 0.16 + r() * 0.22;
    const arr = inTerrace(x, z) ? gSolid : solid;
    arr.push(part('cone', [0.09 + r() * 0.05, h, 4], pick(P.foliage), { x, y: -0.5 + h / 2, z }));
  }
  for (let i = 0; i < 46; i++) {
    const x = -20 + r() * 40, z = south + 1.0 + r() * 12;
    if (insideCafe(x, z)) continue;
    const s0 = 0.12 + r() * 0.16;
    const arr = inTerrace(x, z) ? gSolid : solid;
    arr.push(part('sph', [s0, 5], r() < 0.5 ? P.pebble[0] : P.pebble[1], { x, y: -0.48, z, sy: 0.55 }));
  }

  // ---- Near garden: the foreground the player stares at all game (until the terrace is bought) --
  // A paw-print path curving away from the café gate, so the eye has somewhere to travel. Half as
  // many prints as before, smaller and a shade darker: at 26 near-white discs the path competed
  // with the flower beds for attention, and the beds should win.
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = -6 + t * 15 + Math.sin(t * 4.2) * 1.7;
    const z = south + 1.1 + t * 9.5;
    const arr = inTerrace(x, z) ? gSolid : solid;
    arr.push(part('cyl', [0.27, 0.27, 0.07, 9], P.pathStone, { x, y: -0.44, z, sz: 0.78 }));
    for (const [ox, oz] of [[-0.17, 0.23], [0.0, 0.27], [0.17, 0.23]]) {
      arr.push(part('cyl', [0.082, 0.082, 0.06, 6], P.pathStoneToe, { x: x + ox, y: -0.44, z: z + oz }));
    }
  }

  // Flower beds hugging the fence line: the strongest colour in the frame, closest to the player.
  // The trough is a plain box with a wooden rim and four corner posts rather than a rounded box —
  // it reads as carpentry instead of a lozenge, and RoundedBoxGeometry at 3 segments costs 588
  // triangles against 12 for a box, which is the entire flower budget spent on a planter.
  const soilY = -0.12;   // top of the soil; every stem starts here
  let blooms = 0;
  for (let i = 0; i < 14; i++) {
    const bx = -13 + i * 2.15 + r() * 0.5;
    const bz = south + 0.9 + r() * 0.5;
    const garden = inTerrace(bx, bz);
    const sArr = garden ? gSolid : solid, bArr = garden ? gBright : bright;
    sArr.push(part('box', [2.0, 0.34, 1.15], P.planterBody, { x: bx, y: -0.36, z: bz }));
    sArr.push(part('box', [1.75, 0.16, 0.92], P.soil, { x: bx, y: -0.2, z: bz }));
    // Wooden edge: two long boards, two short boards, four corner posts standing slightly proud.
    for (const oz of [-0.505, 0.505]) {
      sArr.push(part('box', [2.08, 0.13, 0.14], P.planterRim, { x: bx, y: -0.16, z: bz + oz }));
    }
    for (const ox of [-0.97, 0.97]) {
      sArr.push(part('box', [0.14, 0.13, 1.2], P.planterRim, { x: bx + ox, y: -0.16, z: bz }));
    }
    for (const ox of [-0.965, 0.965]) {
      for (const oz of [-0.49, 0.49]) {
        sArr.push(part('box', [0.17, 0.46, 0.17], P.planterPost, { x: bx + ox, y: -0.30, z: bz + oz }));
      }
    }
    for (let f = 0; f < 8; f++) {
      const fx = bx - 0.72 + r() * 1.44, fz = bz - 0.32 + r() * 0.64;
      addPlant(P, PETAL_SETS, sArr, bArr, r, fx, fz, soilY);
      blooms++;
    }
  }

  // A pond. Water is the cheapest way to break a field of green, and ducks aside, pets drink here.
  // Its footprint sits inside the terrace, so it is exactly what the deck (and the ice cream lane
  // built on it) replaces — garden content.
  {
    const px = 9.5, pz = south + 6.2;
    const sArr = inTerrace(px, pz) ? gSolid : solid, bArr = inTerrace(px, pz) ? gBright : bright;
    sArr.push(part('cyl', [3.1, 3.1, 0.18, 14], P.pondRim, { x: px, y: -0.5, z: pz, sz: 0.72 }));
    sArr.push(part('cyl', [2.72, 2.72, 0.16, 14], P.pondDeep, { x: px, y: -0.45, z: pz, sz: 0.72 }));
    bArr.push(part('cyl', [2.3, 2.3, 0.05, 14], P.pondShallow, { x: px, y: -0.4, z: pz, sz: 0.72 }));
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, rad = 0.5 + r() * 1.5;
      sArr.push(part('cyl', [0.3 + r() * 0.16, 0.3, 0.045, 7], P.lily,
        { x: px + Math.cos(a) * rad, y: -0.37, z: pz + Math.sin(a) * rad * 0.72, sz: 0.8 }));
    }
    // Three reeds on the far lip: vertical accents against a horizontal disc of water, which is the
    // only thing the pond was missing. 17 triangles each.
    for (const [rx, rz] of [[-2.35, -0.55], [-2.05, -1.05], [2.5, -0.5]]) {
      const rh = 0.85 + r() * 0.45;
      const bxr = px + rx, bzr = pz + rz * 0.72;
      stalk(sArr, P.reedStem, 0.035, rh, bxr, -0.46, bzr, (r() - 0.5) * 0.16);
      dome(bArr, P.reedHead, 0.055, 4, bxr, -0.46 + rh + 0.08, bzr, 2.6);
      leafBlade(sArr, P.reedStem, 1.5, bxr, -0.46, bzr, r() * 6.28, 0.9);
      leafBlade(sArr, P.reedStem, 1.5, bxr, -0.46, bzr, r() * 6.28, 1.25);
    }
  }

  // Pet agility course. Pure theme: the café's garden is a place pets visibly play in. Its anchor
  // sits inside the terrace footprint, so the whole course is garden content.
  {
    const gx = -6.5, gz = south + 5.4;
    const arr = inTerrace(gx, gz) ? gSolid : solid;
    // hoop
    arr.push(part('cyl', [0.09, 0.09, 1.5, 8], P.hoopPost, { x: gx - 0.85, y: 0.25, z: gz }));
    arr.push(part('cyl', [0.09, 0.09, 1.5, 8], P.hoopPost, { x: gx + 0.85, y: 0.25, z: gz }));
    arr.push(part('cyl', [0.86, 0.86, 0.13, 20], P.hoopRing, { x: gx, y: 0.78, z: gz, rx: Math.PI / 2, sz: 1 }));
    arr.push(part('cyl', [0.72, 0.72, 0.15, 20], P.hoopInner, { x: gx, y: 0.78, z: gz, rx: Math.PI / 2, sz: 1 }));
    // low ramp
    arr.push(part('box', [2.3, 0.14, 1.3], P.ramp, { x: gx + 4.4, y: 0.0, z: gz + 0.6, rz: 0.2 }));
    arr.push(part('box', [0.16, 0.5, 1.3], P.rampLeg, { x: gx + 5.4, y: -0.2, z: gz + 0.6 }));
    // tunnel
    for (let i = 0; i < 5; i++) {
      arr.push(part('cyl', [0.62, 0.62, 0.22, 14], i % 2 ? P.tunnelA : P.tunnelB,
        { x: gx + 8.6, y: 0.12, z: gz - 0.9 + i * 0.5, rx: Math.PI / 2 }));
    }
    // two bowls
    for (const ox of [10.6, 11.3]) {
      arr.push(part('cyl', [0.26, 0.2, 0.16, 12], P.bowl, { x: gx + ox, y: -0.32, z: gz + 1.4 }));
    }
  }

  // Benches facing the café, so the garden reads as somewhere people sit rather than empty lawn.
  for (const [bx, bz] of [[2.2, south + 3.0], [-10.5, south + 2.4]]) {
    const arr = inTerrace(bx, bz) ? gSolid : solid;
    arr.push(part('rbox', [1.9, 0.14, 0.6, 0.05], P.benchSeat, { x: bx, y: 0.05, z: bz }));
    arr.push(part('rbox', [1.9, 0.5, 0.13, 0.05], P.benchSeat, { x: bx, y: 0.3, z: bz - 0.24 }));
    for (const ox of [-0.75, 0.75]) arr.push(part('box', [0.13, 0.42, 0.5], P.benchLeg, { x: bx + ox, y: -0.16, z: bz }));
  }

  // ---- Mid ring: hedges and trees (always visible — outside the terrace footprint) --------------
  const treeAt = (x, z, scale) => {
    const h = (1.5 + r() * 1.3) * scale;
    solid.push(part('cyl', [0.17 * scale, 0.23 * scale, h, 5], P.trunk, { x, y: -0.5 + h / 2, z }));
    const crown = pick(P.foliage);
    solid.push(part('sph', [0.95 * scale, 7], crown, { x, y: -0.5 + h + 0.5 * scale, z, sy: 1.12 }));
    solid.push(part('sph', [0.66 * scale, 6], crown, { x: x + 0.42 * scale, y: -0.5 + h + 1.05 * scale, z: z - 0.2 * scale }));
    solid.push(part('sph', [0.55 * scale, 6], pick(P.foliage), { x: x - 0.46 * scale, y: -0.5 + h + 0.85 * scale, z: z + 0.22 * scale }));
  };

  // White picket line at the garden edge: a bright horizontal that separates near garden from the
  // tree ring behind it, and reads instantly as "this is a kept garden" rather than open field.
  for (let x = -20; x <= 22; x += 0.85) {
    if (x > -1.8 && x < 3.8) continue; // gap on the paw path
    solid.push(part('box', [0.13, 0.78, 0.13], P.picket, { x, y: -0.12, z: south + 10.6 }));
  }
  for (const yy of [0.06, -0.22]) {
    solid.push(part('box', [18.4, 0.1, 0.08], P.picket, { x: -11, y: yy, z: south + 10.6 }));
    solid.push(part('box', [18.4, 0.1, 0.08], P.picket, { x: 12.8, y: yy, z: south + 10.6 }));
  }

  // Seasonal garland strung above the picket line: an unlit bulb string (bright pass, folds into
  // the existing draw call) whose colour family is the clearest single tell of which season is
  // active, since it sits right at the player's eye line and — unlike the flower beds — is never
  // hidden behind the terrace deck. A gentle sine sag between posts reads as hung, not floating.
  for (let x = -19.5; x <= 21.5; x += 1.7) {
    if (x > -2.2 && x < 4.2) continue; // gap on the paw path, mirrors the picket gap
    const sag = 0.1 * Math.sin((x + 19.5) * 1.85);
    bright.push(part('sph', [0.065, 5], pick(P.stringLight), { x, y: 0.58 - sag, z: south + 10.55 }));
  }

  // Hedge line marking the garden's far boundary — a clean horizontal that stops the eye.
  for (let x = -18; x <= 20; x += 1.5) {
    if (x > -1.5 && x < 3.5) continue; // gap where the paw path leads out
    solid.push(part('box', [1.5, 1.0, 1.1], pick(P.foliage), { x, y: 0.0, z: south + 12.5 }));
  }

  for (let i = 0; i < 22; i++) {
    const x = -30 + r() * 62, z = south + 13.5 + r() * 10;
    treeAt(x, z, 0.85 + r() * 0.6);
  }
  // East flank: fills the right edge in landscape, where the café stops at x = 10.
  for (let i = 0; i < 12; i++) treeAt(east + 4 + r() * 14, -14 + r() * 26, 0.8 + r() * 0.55);
  // A few behind the north wall so the roofline is not the last thing in the frame.
  for (let i = 0; i < 10; i++) treeAt(-30 + r() * 60, -18 - r() * 8, 0.9 + r() * 0.6);

  // ---- Far ring: town silhouette ----------------------------------------------------------------
  // No detail at all, only massing and pale colour. Depth, not scenery.
  for (let i = 0; i < 26; i++) {
    const x = -46 + r() * 96;
    const z = i % 2 === 0 ? south + 26 + r() * 12 : -30 - r() * 12;
    const w = 3.5 + r() * 5, h = 3.5 + r() * 7;
    const col = pick(P.town);
    solid.push(part('box', [w, h, 4 + r() * 3], col, { x, y: -0.5 + h / 2, z }));
    solid.push(part('box', [w * 1.08, 0.5, 4.4], P.townRoof, { x, y: -0.5 + h + 0.25, z }));
  }

  // ================= IN-FRAME SEASONAL DRESSING ===================================================
  // MEASURED, NOT ASSUMED. Everything above this line lives in the garden bands at z >= 7.9, and
  // once the terrace is bought (~day 14) the deck replaces the near band and the camera sits south
  // of most of the rest. Projecting the world through the real play camera (scene.js: YAW 35 deg,
  // PITCH 52 deg, FOV 40, landscape distance 16.25 / (2 tan(FOV/2) aspect)) with the owner standing
  // at the deck centre (0, 10.6) at 844x390:
  //   café south fence (z = 7)   in frame for x -3.5 .. +6.3   <- crosses the middle of the screen
  //   gate arch top (0, 2.5, 7.2) in frame, upper middle
  //   deck floor                 in frame for roughly x -9 .. +6, z 8 .. 14  <- most of the frame
  //   fountain (0, 10.6)         dead centre
  //   garden picket + garland (z 17.6)  BEHIND the camera; a corner sliver only, and only when the
  //                                     owner walks to the deck's south edge
  //   tree ring (z >= 20), town ring    never in frame from the deck at all
  // Portrait (390x844) sees a wider slice of the fence and less of the deck, and the same three
  // anchors -- fence, gate arch, deck floor -- are still the ones on screen.
  //
  // So the entire seasonal read is put on those anchors. Nothing new goes into the far garden: it
  // would be as invisible as the garland already there. This block is APPENDED after every existing
  // draw from `r` on purpose -- inserting it earlier would shift the whole seeded garden layout.

  const FENCE_Z = south;                    // 7 -- props.js buildStatic's south fence line
  const FESTOON_Z = FENCE_Z + 0.12;         // the fence's SOUTH face (posts are 0.14 thick, z 6.93
                                            // .. 7.07), i.e. the side the camera is on.
  // MEASURED: at 2.02 (my first pass) the whole string sat off the TOP of the landscape frame with
  // the owner at the deck centre and only survived behind the HUD chips. 1.72 puts the wire and the
  // pennants inside the frame for x -2.3 .. +5.5, which is exactly the stretch of fence the camera
  // holds, and still leaves a clear band above ambience.js's own cream string (y 1.28 at z 6.92)
  // and above the window boxes' blooms below, so the fence reads as three stacked bands rather than
  // one clotted one.
  const FESTOON_TOP = 1.72;
  // The fence posts stand every 1.5 m from x = -10, so the festoon poles land ON six of them and
  // the string reads as tied to the fence rather than floating. The gate lane is left empty: guests
  // walk through |x| < 1.2 and the gate arch already occupies that airspace.
  const FESTOON_POLES = [-8.5, -5.5, -2.5, 2, 5, 8];
  const FESTOON_SPANS = [[-9.7, -8.5], [-8.5, -5.5], [-5.5, -2.5], [2, 5], [5, 8], [8, 9.7]];
  // Bunting hues: one per petal family plus the season's foliage, so the four seasons get four
  // genuinely different four-colour sets rather than four shades of one hue --
  //   blossom pink/yellow/violet/leaf-green · splash coral/amber/cyan/teal ·
  //   harvest red/orange/plum/burnt-orange  · lights red/gold/ice-blue/evergreen.
  const BUNTING = [P.petalPink[0], P.petalSun[0], P.petalViolet[0], P.foliage[0]];

  for (const px of FESTOON_POLES) {
    // Pole runs from below ground so it plants in the lawn before the terrace and hides inside
    // buildRegion's stone border (y -0.45 .. -0.03, z 7.05 .. 14.35) after it. 12 triangles.
    const g = new THREE.CylinderGeometry(0.05, 0.055, 2.22, 6, 1, true);
    g.translate(px, 0.61, FESTOON_Z);
    solid.push(finish(g, P.planterPost));
  }

  let bulbI = 0, pennantI = 0;
  for (const [x0, x1] of FESTOON_SPANS) {
    const len = x1 - x0;
    const amp = 0.18 * Math.min(1, len / 3);   // short end spans sag proportionally less
    const at = t => sagY(FESTOON_TOP, amp, t);
    // Wire in four chords: enough to read as a curve at this scale, 32 triangles a span.
    for (let s = 0; s < 4; s++) {
      const t0 = s / 4, t1 = (s + 1) / 4;
      wireSeg(solid, P.trunk, x0 + len * t0, at(t0), x0 + len * t1, at(t1), FESTOON_Z);
    }
    // Bulbs go to the UNLIT bright pass, which is the whole point of the festoon: after dark the
    // toon-lit world drops into daylight.js's blue dusk keyframe and these keep their hue, so the
    // season is still legible at t 228 with no extra light source and no per-frame hook.
    for (let x = x0 + 0.15; x <= x1 - 0.05; x += 0.3, bulbI++) {
      const t = (x - x0) / len;
      // Every fourth bulb is the season's own white, so the string has some near-white energy for
      // post.js's bright pass (threshold 0.72 luminance) to bloom on after dark.
      const hex = (bulbI & 3) === 3 ? P.petalWhite[0] : P.stringLight[bulbI % P.stringLight.length];
      bright.push(part('sph', [0.062, 5], hex, { x, y: at(t) - 0.055, z: FESTOON_Z }));
    }
    for (let x = x0 + 0.42; x <= x1 - 0.2; x += 0.78, pennantI++) {
      pennant(bright, BUNTING[pennantI % BUNTING.length], 0.155, 0.36, x, sagY(FESTOON_TOP, amp, (x - x0) / len) - 0.055, FESTOON_Z + 0.01);
    }
  }

  // Window boxes bolted to the south face of the fence. WHY HERE: this strip (z 7.09 .. 7.39) is
  // the fence's own thickness plus the gate -- src/sim/nav.js blocks that whole row except the gate
  // gap -- so nothing can ever walk through them, they are in frame in both orientations, and they
  // are the one place a planter can go that the terrace does NOT delete (the Blossom-era beds at
  // z 7.9+ are inside the terrace footprint and vanish with the deck). Box tops stop at y ~1.0,
  // below the pennants at 1.42, so the fence line reads as three clean bands.
  const BOX_Z = FENCE_Z + 0.24;
  const BOX_SOIL = 0.50;
  // Symmetric, 1.7 m apart, and the innermost pair starts at |x| = 2.4 so a 1.5 m box still leaves
  // 1.65 m of clearance from the gate centreline and clears buildRegion's arch posts at |x| = 1.35.
  for (const bx of [-9.2, -7.5, -5.8, -4.1, -2.4, 2.4, 4.1, 5.8, 7.5, 9.2]) {
    solid.push(part('box', [1.5, 0.28, 0.30], P.planterBody, { x: bx, y: 0.34, z: BOX_Z }));
    solid.push(part('box', [1.34, 0.10, 0.22], P.soil, { x: bx, y: 0.45, z: BOX_Z }));
    solid.push(part('box', [1.58, 0.07, 0.36], P.planterRim, { x: bx, y: 0.485, z: BOX_Z }));
    // Two brackets under the box, not behind it: they have to be visible for the box to read as
    // bolted to the fence rather than balanced on thin air before the deck exists.
    for (const ox of [-0.62, 0.62]) {
      solid.push(part('box', [0.07, 0.22, 0.28], P.planterPost, { x: bx + ox, y: 0.11, z: BOX_Z - 0.03 }));
    }
    // Three blooms, not the beds' eight: a box is 0.3 m deep and the silhouette has to stay legible
    // against the café behind it rather than turning into a hedge.
    for (let f = 0; f < 3; f++) {
      addPlant(P, PETAL_SETS, solid, bright, r, bx - 0.5 + f * 0.5 + (r() - 0.5) * 0.16, BOX_Z + (r() - 0.5) * 0.1, BOX_SOIL);
      blooms++;
    }
  }

  // ---- Deck dressing: only exists while the terrace is built ------------------------------------
  // Kept in its own pair of arrays (dSolid/dBright) so buildEnvironment can park it under the same
  // `deck` group the floor lives in -- one visibility flag, no second toggle for game.js to drive.
  const dSolid = [], dBright = [];
  if (terrace) {
    const cx0 = terrace.x0, cx1 = terrace.x1, cz0 = terrace.z0, cz1 = terrace.z1;
    const DECK_Y = 0.06;      // plank tops are y 0.045
    const litter = P.litter;

    // Fallen petals / leaves / frost. WHY THESE BANDS: the deck is the biggest thing in frame and a
    // flat plank field is where a season has the most room to speak, but the MIDDLE of it is where
    // guests, pets and the owner walk and where the game already draws debris for dirty tables --
    // litter there would read as mess, not as autumn. So the scatter is pushed to the north strip
    // under the window boxes (where petals would actually fall), the two side rims, and a ring
    // around the fountain, all of which are floor the camera sees and feet mostly do not.
    //
    // MEASURED, second pass: my first attempt scattered 136 flecks EVENLY over the whole deck and
    // the screenshot read as a littered floor rather than as a season -- the eye needs the gaps to
    // know the marks are deliberate. So the scatter is now DRIFTED: sixteen anchors along the north
    // strip and the two rims, each with a small huddle around it, plus a thin sprinkle everywhere
    // else. Fleck sizes are ~35% smaller than the first pass for the same reason.
    const fleck = (x, z, scale = 1) => {
      const len = (0.14 + r() * 0.12) * scale;
      litterFleck(dSolid, litter[(r() * litter.length) | 0], len, len * (0.42 + r() * 0.26),
        x, DECK_Y, z, r() * Math.PI);
    };
    const drift = (x, z, n) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, rad = r() * 0.66;
        fleck(x + Math.cos(a) * rad, z + Math.sin(a) * rad * 0.7);
      }
    };
    // North strip, directly under the fence window boxes: where petals/leaves would actually land.
    for (let i = 0; i < 7; i++) drift(cx0 + 1.2 + i * 2.6 + (r() - 0.5) * 0.7, cz0 + 0.45 + r() * 0.75, 6 + ((r() * 4) | 0));
    // The west half of the deck, x -8.5..-4.5: measured off the frame, this is the largest patch of
    // BARE plank the default camera holds and the only big empty area left once the HUD chips are
    // accounted for, so it is where a season has the most room to speak. Guests cut across it on
    // the way to the west tables, but drifted patches read as leaves blown against the boards
    // rather than as the debris the game draws for a dirty table.
    for (let i = 0; i < 5; i++) drift(-8.4 + r() * 3.9, cz0 + 2.1 + i * 1.15 + r() * 0.5, 6 + ((r() * 4) | 0));
    // West and east rims: floor the camera sees and feet mostly do not.
    for (let i = 0; i < 4; i++) drift(-9.2 + (r() - 0.5) * 0.7, cz0 + 0.9 + i * 1.6, 5 + ((r() * 4) | 0));
    for (let i = 0; i < 3; i++) drift(9.2 + (r() - 0.5) * 0.7, cz0 + 1.2 + i * 2.0, 5 + ((r() * 4) | 0));
    // Three drifts caught against the fountain's stone base, which is dead centre of frame.
    for (let i = 0; i < 3; i++) { const a = 2.1 + i * 1.9; drift(Math.cos(a) * 1.75, 10.6 + Math.sin(a) * 1.75, 5); }
    // A thin sprinkle everywhere else: enough to say the whole deck is under the same sky, sparse
    // enough that the walking lanes never read as unswept.
    for (let i = 0; i < 26; i++) fleck(-8.6 + r() * 17.2, cz0 + 1.5 + r() * (cz1 - cz0 - 2.0), 0.85);

    // Four planted pots on the fountain's diagonals. WHY HERE: the fountain sits dead centre of the
    // default frame and is the one prop the player looks straight at, and fountain1's own station
    // footprint (2.4 x 2.4 at 0, 10.6) is nav-blocked, so a pot inside it cannot be walked through.
    // At 1.05 m diagonal offset the pot rim clears the fountain basin (outer radius 1.15) by 5 cm
    // and pokes at most 13 cm past the blocked box -- a third of a 0.5 m nav cell, which no mover
    // can path into anyway. The same offsets also clear splash1, the pool that replaces the
    // fountain in this spot later (outer radius 1.2).
    for (const [ox, oz] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]]) {
      const px = ox, pz = 10.6 + oz;
      dSolid.push(part('cyl', [0.24, 0.19, 0.32, 8], P.planterBody, { x: px, y: 0.21, z: pz }));
      dSolid.push(part('cyl', [0.27, 0.27, 0.06, 8], P.planterRim, { x: px, y: 0.375, z: pz }));
      for (let f = 0; f < 3; f++) {
        const a = f * 2.1 + 0.4;
        addPlant(P, PETAL_SETS, dSolid, dBright, r, px + Math.cos(a) * 0.11, pz + Math.sin(a) * 0.11, 0.40);
        blooms++;
      }
    }

    // Floating petals on the water. y 0.30 sits above the fountain's pool surface (0.28) and above
    // splash1's water (0.25) and its centre disc (0.275) -- one placement correct for both props.
    // Centre radius 0.62 .. 0.84 plus at most 0.085 of half-length keeps every petal inside the
    // fountain's 0.95 water disc and outside its 0.6 centre column, so none of them ever hangs over
    // the basin gap or clips the column.
    for (let i = 0; i < 11; i++) {
      const a = r() * Math.PI * 2, rad = 0.62 + r() * 0.22;
      litterFleck(dBright, litter[(r() * litter.length) | 0], 0.1 + r() * 0.07, 0.07 + r() * 0.05,
        Math.cos(a) * rad, 0.30, 10.6 + Math.sin(a) * rad, r() * Math.PI);
    }

    // A swag over the gate arch (buildRegion draws the arch at x 0, z z0 - 0.2, crossbar y 2.4).
    // The arch is the highest thing on the deck and lands in the upper middle of the default frame,
    // so this is the one seasonal cue that is legible even when the owner is standing at the deck's
    // far south edge and the fence festoon has slid off the top of the screen.
    const archZ = cz0 - 0.2;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, x = -1.5 + t * 3.0, y = sagY(2.34, 0.22, t);
      dSolid.push(part('sph', [0.115, 5], P.foliage[i % P.foliage.length], { x, y: y - 0.05, z: archZ, sy: 0.8 }));
      dBright.push(part('sph', [0.06, 5], P.stringLight[i % P.stringLight.length], { x, y: y + 0.06, z: archZ + 0.06 }));
    }
  }

  return { solid, bright, gSolid, gBright, dSolid, dBright, blooms, terrace };
}

// Wraps `parts` (or a single-item placeholder for an empty array — mergeGeometries cannot merge
// zero geometries, and an empty `terrace`-less area can otherwise leave gSolid/gBright empty) in a
// Mesh the same way the old inline code did.
function meshOrEmpty(parts, opts) {
  if (!parts.length) parts = [part('box', [0.0001, 0.0001, 0.0001], '#000000', { y: -999 })];
  return mesh(parts, opts);
}

function brightMaterial() {
  // Unlit pieces stay vivid under the toon ramp: flowers and garland lights should pop, not sit in
  // shadow. A fresh material every build (rather than a shared singleton) because group.setSeason
  // disposes it on every re-season and toonMaterial()'s sharing trick would break every other user.
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
}

// area -> a live THREE.Group of the world beyond the café walls, tinted for `seasonId` (one of
// SEASON_IDS; an unrecognised id falls back to Blossom rather than throwing, so a stale or not-yet
// -migrated save never crashes the render). The seeded LAYOUT never changes across a season swap — only
// group.setSeason(id) is ever called again; buildEnvironment itself only runs once per load.
//
// READABILITY vs the daylight system (src/render/daylight.js), reasoned through rather than
// screenshotted (no build in this task):
//   - `bright` / `gBright` (flowers, garland) use MeshBasicMaterial, so they ignore sun/hemi colour
//     entirely and are only affected by the post grade's exposure (1.05-1.30 across the keyframe
//     table) and warmth (-0.02..+0.06) and by scene fog at distance. Every seasonal petal/garland
//     hex above was chosen at the same saturation/lightness band as the family it replaces (mid-high
//     chroma, never near-black, only the existing white families go near-white), so it should sit
//     inside the same exposure/warmth envelope the shipped Blossom palette already holds up under.
//   - `solid` / `gSolid` (grass, tree crowns, trunks) are toon-lit and DO pick up sun colour, hemi
//     colour and shadowTint, which swing from neutral white (dawn/midday) to warm (#FFE9B8 sunset
//     sun) to cool blue-violet (#5E6FB8 dusk sun, #DDE5FF shadowTint). Seasonal grass/foliage hexes
//     were kept at comparable value/chroma to the shipped greens they replace for the same reason.
//   - Two specific combinations I could NOT verify without a screenshot and want to flag explicitly:
//     Harvest's orange/gold foliage against the warm #FF9E6A sunset sun could push toward an overly
//     saturated red rather than reading as autumn leaves; Lights' icy-blue petal family against the
//     cool #5E6FB8/blue-violet dusk sky could lose contrast (blue-on-blue) right at dusk. Both are
//     the low-sun keyframes only (t>=215/240 of DAY_LENGTH=240) — daytime hours are the safer case.
export function buildEnvironment(area, seasonId = SEASON_IDS[0]) {
  const group = new THREE.Group();
  group.name = 'environment';

  const garden = new THREE.Group();
  garden.name = 'garden';
  group.add(garden);
  group.garden = garden;

  // ---- The terrace deck (plan 3.1/7.1) -----------------------------------------------------------
  // `garden` is every near-band piece generated above whose footprint the terrace occupies — shown
  // until the terrace is bought. `deck` is the built terrace floor (props.js buildRegion) PLUS the
  // seasonal deck dressing, hidden until then. Both groups exist unconditionally (even pre-Batch-1
  // saves need something to flip), and the caller (game.js owns the frame loop and the 'built'
  // event) drives the swap by calling group.setTerraceBuilt(world.built.has('z_terrace')) once at
  // load and again on every 'built' event — refreshActive-style, not a per-frame poll.
  //
  // It is created HERE, before the first applySeason, because the deck floor is now palette-driven
  // (buildRegion takes the season's palette so its planks, border, corner planters and gate arch
  // re-tint with everything else) and applySeason rebuilds its contents in place. Only
  // setTerraceBuilt ever touches deck.visible, so a re-season can never undo the terrace toggle.
  const terrace = (area.regions || []).find(reg => reg.id === 'terrace') || null;
  const deck = new THREE.Group();
  deck.name = 'terraceDeck';
  deck.visible = false;
  group.add(deck);
  group.deck = deck;

  let solidNode = null, brightNode = null, gSolidNode = null, gBrightNode = null;
  let deckFloorNode = null, dSolidNode = null, dBrightNode = null;
  let currentSeason = null;

  function disposeLit(node) { if (node) node.geometry.dispose(); } // shares toonMaterial() — never dispose that
  function disposeBright(node) { if (node) { node.geometry.dispose(); node.material.dispose(); } }
  // buildRegion hands back a Group wrapping one merged toon mesh; free the geometry, keep the
  // shared toonMaterial() alive for every other user of it.
  function disposeFloor(node) { if (node) node.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }

  // (Re)builds solid/bright/gSolid/gBright for `id` and swaps them into `group`/`garden` in place.
  // A no-op if `id` is already the active season, so callers can call this every frame/tick without
  // guarding it themselves.
  function applySeason(id) {
    const resolved = SEASON_IDS.includes(id) ? id : SEASON_IDS[0];
    if (resolved === currentSeason) return;
    currentSeason = resolved;
    const data = buildScenery(area, resolved);
    group.userData.blooms = data.blooms;   // near-band bloom count, for the triangle-budget check

    disposeLit(solidNode); disposeBright(brightNode);
    disposeLit(gSolidNode); disposeBright(gBrightNode);
    disposeLit(dSolidNode); disposeBright(dBrightNode);
    disposeFloor(deckFloorNode);
    if (solidNode) group.remove(solidNode);
    if (brightNode) group.remove(brightNode);
    if (gSolidNode) garden.remove(gSolidNode);
    if (gBrightNode) garden.remove(gBrightNode);
    if (dSolidNode) deck.remove(dSolidNode);
    if (dBrightNode) deck.remove(dBrightNode);
    if (deckFloorNode) deck.remove(deckFloorNode);

    solidNode = meshOrEmpty(data.solid, { cast: true, receive: true });
    brightNode = meshOrEmpty(data.bright, { cast: false, receive: false, material: brightMaterial() });
    gSolidNode = meshOrEmpty(data.gSolid, { cast: true, receive: true });
    gBrightNode = meshOrEmpty(data.gBright, { cast: false, receive: false, material: brightMaterial() });

    group.add(solidNode);
    group.add(brightNode);
    garden.add(gSolidNode);
    garden.add(gBrightNode);

    if (terrace) {
      // The floor takes the season's palette; buildRegion falls back to its shipped literals when
      // called without one, so nothing else that ever calls it changes.
      deckFloorNode = buildRegion(area, terrace, paletteForSeason(resolved));
      deck.add(deckFloorNode);
      // Litter is toon-LIT on purpose: it lies flat on the planks and must sit inside the deck's
      // own shadow, not glow off it at dusk. The blooms and the arch's bulbs are unlit, which is
      // what carries the season after dark.
      dSolidNode = meshOrEmpty(data.dSolid, { cast: false, receive: true });
      dBrightNode = meshOrEmpty(data.dBright, { cast: false, receive: false, material: brightMaterial() });
      deck.add(dSolidNode);
      deck.add(dBrightNode);
    }
  }
  applySeason(seasonId);
  // Consumed by whoever owns src/sim/seasons.js's day->season mapping (see this task's
  // wiringNeeded) once per day rollover. Cheap to over-call: no-ops when the id hasn't changed.
  group.setSeason = applySeason;

  // For the same visual "pop" every other station build gets, animate deck.scale with
  // src/render/buildReveal.js's buildRevealScale the way systems/visuals.js already does; that
  // per-frame hookup lives outside this file.
  let terraceBuilt = false;
  group.setTerraceBuilt = built => {
    built = !!built;
    if (built === terraceBuilt) return;
    terraceBuilt = built;
    garden.visible = !built;
    deck.visible = built;
  };
  return group;
}
