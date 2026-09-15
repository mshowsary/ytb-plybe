// Lightweight premium ambience: high visual density without shipping a large texture payload.
//
// DRAW-CALL DIET (2026-09-15, Batch 8 "Ground and grain"): almost everything in this file used to be
// one THREE.Mesh per part, even though the vast majority of it never moves and never changes colour
// after setPrestige() first runs. geo.js bakes every part's colour into a vertex-colour attribute and
// hands out one shared MeshToonMaterial for all of it (see its own header), so any of that static
// content merges into a single draw call with zero visual change. Only the handful of pieces that
// genuinely need their OWN material at runtime — the rug's reputation tint, the pendant shades'
// reputation tint, the pulsing paw-sign glows — keep a dedicated mesh. Measured via
// tools/scene-cost.mjs's topGroups bucket on this file's 'ambience' root: 60-odd draw calls before,
// low teens after, same pixels either way.
import * as THREE from 'three';
import { part, mesh, colorize } from './geo.js';

const toon = color => new THREE.MeshToonMaterial({ color });
const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false,
});

// Matches geo.js part()'s own finish (delete the uv attribute, bake a vertex-colour attribute) for
// the sphere height-segment combinations part() cannot express (it forces heightSegments = width >>
// 1 — see environment.js's identical note above its own petalLobe/dome helpers). Only used so a
// hand-built geometry can sit in the same merge() call as part()-built ones without surprising anyone
// who goes looking for why an attribute set matches.
function finish(g, hex) { g.deleteAttribute('uv'); return colorize(g, hex); }

// One reputation-level-1 pot: geometry only, appended to `parts` rather than meshed on the spot.
// Four placements used to be 4 x 3 = 12 draw calls (pot/crown/leaf never move or re-colour once
// placed); collecting their geometry and meshing it once at the call site below is 1.
// The pot is a plain cylinder (part() handles that fine); the crown and leaf are spheres whose
// authored (width, height) segment pairs — (10, 7) and (9, 6) — are not part()'s forced width>>1, so
// they stay hand-built, finished the same way part() finishes everything else.
function plantParts(parts, x, z, scale = 1) {
  parts.push(part('cyl', [0.28, 0.22, 0.42, 10], '#C9795C', { x, y: 0.21, z, sx: scale, sy: scale, sz: scale }));
  const crown = new THREE.SphereGeometry(0.42, 10, 7);
  crown.scale(scale, 1.25 * scale, 0.78 * scale);
  crown.translate(x, 0.72 * scale, z);
  parts.push(finish(crown, '#5FA66A'));
  const leaf = new THREE.SphereGeometry(0.28, 9, 6);
  leaf.scale(0.8 * scale, 1.45 * scale, 0.62 * scale);
  leaf.translate(x + 0.22 * scale, 0.92 * scale, z - 0.05);
  parts.push(finish(leaf, '#78BD7F'));
}

// `color`/`opacity` are parameters rather than constants because the Golden Paw plaque below is
// the same silhouette in gold: one recognisable mark, two finishes, no second geometry to author.
// Used to be a Group of 5 meshes (a pad plus four toes) sharing one material; since none of them ever
// move relative to each other, they merge into the one mesh that material was always going to draw
// anyway — every one of the 4 call sites below drops from 5 draws to 1. The pad's (12, 8) and each
// toe's (10, 7) segment pairs are not part()'s forced width>>1 height either, so — like plantParts
// above — this stays hand-built and finished the same way part() finishes everything else.
function makePawSign(color = '#FF89A6', opacity = 0.94) {
  const mat = basic(color, opacity);
  const pad = new THREE.SphereGeometry(0.25, 12, 8);
  pad.scale(1.15, 0.85, 0.35);
  const P = [finish(pad, color)];
  for (const [x, y] of [[-0.29, 0.29], [-0.09, 0.42], [0.15, 0.42], [0.34, 0.25]]) {
    const toe = new THREE.SphereGeometry(0.11, 10, 7);
    toe.scale(0.92, 1.15, 0.35);
    toe.translate(x, y, 0);
    P.push(finish(toe, color));
  }
  const m = mesh(P, { cast: false, receive: false, material: mat });
  m.userData.glowMaterial = mat;
  return m;
}

export function createAmbience(area) {
  const W = area.size.w, D = area.size.d;
  const group = new THREE.Group();
  group.name = 'ambience';
  const prestige = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
  for (const g of prestige) { g.visible = false; group.add(g); }

  // geo.js's mesh() defaults to palette.js's shared toonMaterial(), which carries a hard 3-step
  // gradient map (this file's own README elsewhere leans on that fact to make merges free). But every
  // `toon(hex)` material below was authored WITHOUT a gradient map, which puts it on three.js's
  // built-in smoothstep toon ramp instead — a visibly softer band edge. So every merge below that
  // mixes more than one hue into one mesh (and so needs geo.js's vertex-colour baking rather than a
  // single uniform colour) gets ITS OWN vertex-coloured material on the SAME (gradient-less) ramp,
  // instead of silently picking up palette.js's harder one.
  const vcToon = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });

  // Layered woven rug turns the open centre into a designed focal zone. Only the base tints with
  // reputation (setPrestige mutates rugMat.color below), so it alone keeps a private mesh and
  // material; the inner rug, its five stripes and the woven paw medallion below all share the same
  // (cast:false, receive:true) flags and never move or re-colour again, so they merge into ONE mesh —
  // what was 1 (inner) + 7 (stripes) + 1 (medallion, already its own merge) = 9 draws becomes 1.
  const rugMat = toon('#C96868');
  const rugBase = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.025, 3.6), rugMat);
  rugBase.position.set(0.3, 0.018, 2.45); rugBase.receiveShadow = true; group.add(rugBase);

  const rugAndEmblem = [part('box', [5.15, 0.03, 2.95], '#F2C9A8', { x: 0.3, y: 0.035, z: 2.45 })];
  for (let z = 1.28; z <= 3.62; z += 0.38) rugAndEmblem.push(part('box', [4.7, 0.016, 0.055], '#FFF1DE', { x: 0.3, y: 0.055, z }));

  // Large woven paw medallion: readable from the normal play camera, not hidden on a wall.
  rugAndEmblem.push(part('cyl', [1.02, 1.02, .014, 40], '#FFF1DE', { x: .3, y: .074, z: 2.45 }));
  rugAndEmblem.push(part('sph', [.4, 20], '#B96673', { x: .3, y: .091, z: 2.68, sx: 1.25, sy: .025, sz: .8 }));
  for (const [x, z, r] of [[-.2, 2.3, .17], [.12, 2.08, .19], [.5, 2.08, .19], [.8, 2.3, .17]]) {
    rugAndEmblem.push(part('sph', [r, 12], '#B96673', { x, y: .091, z, sy: .06, sz: 1.2 }));
  }
  group.add(mesh(rugAndEmblem, { cast: false, receive: true, material: vcToon }));

  // Pendant fixtures. Emissive-looking bulbs use BasicMaterial instead of costly point lights. Three
  // identical fixtures, none of which ever move: each part type (cord/shade/bulb) merges to its own
  // one mesh instead of three, since each keeps a DIFFERENT (material, cast) combination — the cord
  // never casts a shadow, the shade does and also keeps its own material (setPrestige retints it),
  // and the bulb's unlit material is its own draw call regardless. 9 draws become 3.
  const shadeMat = toon('#7E6AE8'), bulbMat = basic('#FFD9A1');
  const cordParts = [], shadeParts = [], bulbParts = [];
  for (const x of [-5.2, 0.2, 5.6]) {
    cordParts.push(part('cyl', [0.018, 0.018, 1.05, 6], '#463833', { x, y: 3.45, z: -3.5 }));
    shadeParts.push(part('cyl', [0.07, 0.36, 0.34, 12], '#7E6AE8', { x, y: 2.91, z: -3.5 }));
    bulbParts.push(part('sph', [0.115, 10], '#FFD9A1', { x, y: 2.82, z: -3.5 }));
  }
  group.add(mesh(cordParts, { cast: false, receive: false, material: vcToon }));
  group.add(mesh(shadeParts, { cast: true, receive: false, material: shadeMat }));
  group.add(mesh(bulbParts, { cast: false, receive: false, material: bulbMat }));

  // Framed café art on the two clear north-wall panels. Two frames share one material and two papers
  // share another (colour never varies by panel), so each merges to one draw call instead of two;
  // the paw-print marks stay their own mesh each (makePawSign already merges its own 5 parts into 1).
  const frameMat = toon('#6C4B38'), paperMat = toon('#FFF4E6');
  const frameParts = [], paperParts = [];
  for (let i = 0; i < 2; i++) {
    const x = i ? 7.55 : -7.55;
    frameParts.push(part('box', [1.35, 1.15, 0.08], '#6C4B38', { x, y: 1.92, z: -D / 2 + 0.23 }));
    paperParts.push(part('box', [1.08, 0.88, 0.025], '#FFF4E6', { x, y: 1.92, z: -D / 2 + 0.285 }));
    const mark = makePawSign();
    mark.scale.setScalar(.8); mark.position.set(x, 1.82, -D / 2 + 0.34); group.add(mark);
  }
  group.add(mesh(frameParts, { cast: true, receive: false, material: frameMat }));
  group.add(mesh(paperParts, { cast: false, receive: false, material: paperMat }));

  // Warm string lights along the open fence, instanced into one draw call.
  const bulbs = [];
  for (let z = -5.8; z <= 5.8; z += 1.15) bulbs.push([W / 2 - 0.08, 1.28, z]);
  for (let x = -8.8; x <= 8.8; x += 1.15) bulbs.push([x, 1.28, D / 2 - 0.08]);
  const lightMat = basic('#FFE0A8', 0.96);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 4), lightMat, bulbs.length);
  const mx = new THREE.Matrix4();
  bulbs.forEach((p, i) => { mx.makeTranslation(p[0], p[1], p[2]); lights.setMatrixAt(i, mx); });
  lights.instanceMatrix.needsUpdate = true; group.add(lights);

  // Reputation level 1 — greenery makes the room feel owned instead of freshly spawned. Four
  // placements, never touched again: one merged mesh instead of 4 x 3 = 12 draws (see plantParts
  // above).
  const plants = [];
  plantParts(plants, -8.5, -5.4, 0.9);
  plantParts(plants, 8.55, -5.4, 0.9);
  plantParts(plants, -8.55, 5.25, 0.82);
  plantParts(plants, 5.95, 5.65, 0.72);
  prestige[0].add(mesh(plants, { cast: true, receive: false, material: vcToon }));

  // Reputation level 2 — festive bunting around the service wall. Used to be three InstancedMeshes,
  // one per hue, purely because InstancedMesh has no colour-per-instance without extra machinery;
  // geo.js's vertex-colour bake does that for free, so the three hues fold into the one mesh the
  // shared toon material was always going to draw. 3 draws become 1.
  const buntingPoints = [];
  for (let x = -7.2; x <= 7.2; x += 0.9) buntingPoints.push([x, 2.55 + Math.sin(x * 1.35) * 0.08, -D / 2 + 0.32]);
  const buntingHues = ['#FF8A80', '#8B7CF6', '#FFD166'];
  const bunting = buntingPoints.map(([x, y, z], i) =>
    part('cone', [0.16, 0.32, 3], buntingHues[i % 3], { x, y, z, rx: Math.PI }));
  prestige[1].add(mesh(bunting, { cast: false, receive: false, material: vcToon }));

  // Reputation level 3 — trophy shelf makes successful sessions leave a permanent mark. The shelf and
  // its three cups share (cast:true, receive:false); the three balls share an unlit material — two
  // merged meshes instead of seven separate ones.
  const trophyLit = [part('box', [2.7, 0.13, 0.42], '#8B5E3C', { x: -6.4, y: 1.25, z: -D / 2 + 0.45 })];
  const trophyBalls = [];
  for (let i = 0; i < 3; i++) {
    trophyLit.push(part('cyl', [0.15, 0.09, 0.28, 10], '#E9B94A', { x: -7.0 + i * 0.6, y: 1.48, z: -D / 2 + 0.45 }));
    trophyBalls.push(part('sph', [0.12, 10], '#FFE58A', { x: -7.0 + i * 0.6, y: 1.68, z: -D / 2 + 0.45 }));
  }
  prestige[2].add(mesh(trophyLit, { cast: true, receive: false, material: vcToon }));
  prestige[2].add(mesh(trophyBalls, { cast: false, receive: false, material: basic('#FFE58A') }));

  // Reputation level 4 — signature paw sign: a recognizable visual identity, not another generic prop.
  const pawSign = makePawSign();
  pawSign.position.set(6.8, 1.8, -D / 2 + 0.42); pawSign.scale.setScalar(1.15); prestige[3].add(pawSign);
  const signPlate = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.18, 0.08), toon('#3D315F'));
  signPlate.position.set(6.8, 1.82, -D / 2 + 0.36); prestige[3].add(signPlate);
  pawSign.position.z = -D / 2 + 0.42;

  // Reputation level 5 — premium gold trim and lanterns. The three stems and the gold runner share
  // one never-mutated colour and never move, so they merge into one mesh; the octahedron lanterns
  // (a shape part() cannot express) merge into a second, hand-built the same way makePawSign is.
  // 7 draws become 2.
  const goldLit = [part('box', [4.7, 0.014, 0.08], '#D9A62E', { x: 0.3, y: 0.065, z: 2.45 })];
  const lanternGeos = [];
  for (const x of [-4.4, 0.3, 5.0]) {
    goldLit.push(part('cyl', [0.025, 0.025, 0.65, 6], '#D9A62E', { x, y: 2.7, z: 5.85 }));
    const lantern = new THREE.OctahedronGeometry(0.18, 0);
    lantern.translate(x, 2.38, 5.85);
    lanternGeos.push(finish(lantern, '#FFE8A3'));
  }
  prestige[4].add(mesh(goldLit, { cast: false, receive: false, material: vcToon }));
  prestige[4].add(mesh(lanternGeos, { cast: false, receive: false, material: basic('#FFE8A3', 0.92) }));

  // --- the Golden Paw (plan §3.4) ---------------------------------------------------------------
  // The one-time ★5 award. NOT part of the prestige[] ladder: prestige is reputation, which rises
  // and is re-applied on every load; this is a single permanent event that systems/goldenPaw.js
  // switches on once and never off again.
  //
  // PLACEMENT. props.js puts the three north-wall windows at x = -5, 0, 5 (1.8 m wide, y 1.05-2.35),
  // so the panel centred on x = -2.5 is the widest clear stretch of that wall, and it is clear of
  // the framed art (x = ±7.55), the trophy shelf (-6.4) and the prestige paw sign (6.8). The top of
  // the plaque stops below y = 2.39 because reputation level 2's bunting hangs across the whole wall
  // at 2.39-2.71 and would otherwise pass through it once both are visible.
  const GOLDEN_PAW_Y = 1.75;
  const goldenPaw = new THREE.Group();
  goldenPaw.position.set(-2.5, GOLDEN_PAW_Y, -D / 2 + 0.28);
  goldenPaw.visible = false;
  group.add(goldenPaw);
  const plaqueParts = [
    part('rbox', [1.6, 1.15, 0.09, 0.07], '#8A6516'),
    part('rbox', [1.42, 0.97, 0.06, 0.05], '#E8B93C', { z: 0.03 }),
  ];
  // Five marks for the five stars — the rating is a numeral the player already reads as stars, so
  // the plaque carries the same count rather than any words.
  for (let i = 0; i < 5; i++) plaqueParts.push(part('cone', [0.075, 0.13, 4], '#FFF0B8', { x: -0.4 + i * 0.2, y: -0.36, z: 0.06 }));
  goldenPaw.add(mesh(plaqueParts, { cast: false }));
  const goldenPawMark = makePawSign('#FFE27A', 0.95);
  goldenPawMark.scale.setScalar(0.7); goldenPawMark.position.set(0, 0.03, 0.09);
  goldenPaw.add(goldenPawMark);

  // Mount progress, 0 -> 1. Held at exactly 1 whenever the sign is simply THERE, so a restored
  // plaque is identical to an earned one down to its transform (see setGoldenPaw).
  let goldenMount = 1;
  const GOLDEN_MOUNT_SECONDS = 0.85;
  function applyGoldenMount() {
    const u = goldenMount;
    if (u >= 1) { goldenPaw.scale.setScalar(1); goldenPaw.position.y = GOLDEN_PAW_Y; return; }
    const e = 1 - Math.pow(1 - u, 3);
    goldenPaw.scale.setScalar(e * (1 + 0.14 * Math.sin(u * Math.PI)));
    goldenPaw.position.y = GOLDEN_PAW_Y + (1 - e) * 0.2;
  }

  // Slow dust motes create constant micro-motion in otherwise static areas.
  const COUNT = 42, pos = new Float32Array(COUNT * 3), speed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * (W - 1.5);
    pos[i * 3 + 1] = 0.35 + Math.random() * 2.8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * (D - 1.5);
    speed[i] = 0.018 + Math.random() * 0.035;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: '#FFF7D6', size: 0.045, transparent: true, opacity: 0.42,
    depthWrite: false, sizeAttenuation: true, toneMapped: false,
  }));
  group.add(dust);
  // The owner calls these fireflies, and likes them — after dark. By day they read as dust, or as
  // dirt. Driven by daylight's own string-light blend rather than the clock so they come on with
  // the lights; fully out below 2% so the draw is skipped, not merely faint.
  const DUST_OPACITY = 0.42;
  function setNight(k) {
    const v = Math.max(0, Math.min(1, Number(k) || 0));
    dust.material.opacity = DUST_OPACITY * v;
    dust.visible = v > 0.02;
  }
  setNight(0);

  let t = 0, prestigeLevel = -1, celebrateT = 0;
  const LIGHT_BASE = new THREE.Color('#FFE0A8'), LIGHT_GOLD = new THREE.Color('#FFC24A');

  // Mount (or restore) the Golden Paw. `animate` is the CALLER's decision, not this module's:
  // systems/goldenPaw.js passes true exactly once, on the shift the award is earned, and false on
  // every reload afterwards and whenever the player prefers reduced motion.
  function setGoldenPaw(on, opts = {}) {
    goldenPaw.visible = !!on;
    goldenMount = (on && opts.animate) ? 0 : 1;
    applyGoldenMount();
  }

  // A timed pulse of the string lights. No new light source: the instanced bulbs already share one
  // material, so a deeper, faster opacity swing plus a gold tint is the whole effect.
  function celebrate(seconds = 6) {
    celebrateT = Math.max(celebrateT, Math.max(0, Number(seconds) || 0));
  }

  function setPrestige(level) {
    level = Math.max(0, Math.min(5, level | 0));
    if (level === prestigeLevel) return;
    prestigeLevel = level;
    for (let i = 0; i < prestige.length; i++) prestige[i].visible = i < level;
    const rugColors = ['#C96868', '#C96868', '#B96673', '#A85D86', '#8A5FA1', '#B28A36'];
    rugMat.color.set(rugColors[level]);
    const shadeColors = ['#7E6AE8', '#7E6AE8', '#8067DA', '#9A63C7', '#B05DA6', '#C69B35'];
    shadeMat.color.set(shadeColors[level]);
  }

  function update(dt) {
    t += dt;
    const a = dustGeo.getAttribute('position');
    for (let i = 0; i < COUNT; i++) {
      let y = a.getY(i) + speed[i] * dt;
      if (y > 3.2) y = 0.28;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t * 0.55 + i * 1.7) * dt * 0.006);
    }
    a.needsUpdate = true;
    if (celebrateT > 0) {
      celebrateT = Math.max(0, celebrateT - dt);
      lightMat.opacity = 0.66 + Math.sin(t * 7.5) * 0.32;
      lightMat.color.copy(LIGHT_BASE).lerp(LIGHT_GOLD, 0.5 + Math.sin(t * 7.5) * 0.5);
    } else {
      lightMat.opacity = 0.9 + Math.sin(t * 1.35) * 0.08;
      // Restore the resting tint exactly once, not every frame: this runs for the whole session.
      if (!lightMat.color.equals(LIGHT_BASE)) lightMat.color.copy(LIGHT_BASE);
    }
    if (prestige[3].visible && pawSign.userData.glowMaterial) {
      pawSign.userData.glowMaterial.opacity = 0.84 + Math.sin(t * 2.1) * 0.12;
    }
    if (goldenPaw.visible) {
      if (goldenMount < 1) { goldenMount = Math.min(1, goldenMount + dt / GOLDEN_MOUNT_SECONDS); applyGoldenMount(); }
      // The same slow shimmer the prestige paw sign uses, so the gold mark reads as lit rather than
      // as flat plastic. Small amplitude, no position change: safe under reduced motion.
      goldenPawMark.userData.glowMaterial.opacity = 0.88 + Math.sin(t * 1.7) * 0.1;
    }
  }

  setPrestige(0);
  setGoldenPaw(false);
  return {
    setNight, group, update, setPrestige, setGoldenPaw, celebrate };
}
