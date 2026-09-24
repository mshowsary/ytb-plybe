// src/systems/visuals.js — builds a mesh per station, keeps physical stock props in sync, owns the
// Task-31 glanceable stock truth, and runs Task-32's one-shot construction reveal.
import * as THREE from 'three';
import { ovenMesh, counterMesh, checkoutMesh, tableMesh, hireDeskMesh, bowlMesh, bushMesh, coffeeMesh, pantryMesh, blenderMesh, signParts, stationStarParts, fruitGardenMesh, itemGeoFor, cashPile, dirtyMesh, zoneRing, icecreamMesh, fountainMesh, jukeboxMesh } from '../render/props.js';
import { photoWallMesh } from '../render/photoWall.js';
import { addParts, part, merge } from '../render/geo.js';
import { C, toonMaterial } from '../render/palette.js';
import { buildRevealPhase, buildRevealScale } from '../render/buildReveal.js';
import { broomIcon, kibbleIcon, fruitIcon, beanIcon, cameraIcon, iconFor } from '../ui/icons.js';
import { supplyKind, supplyLevel, supplyCap, supplyRoom, isStarved } from '../sim/supplies.js';
import { PRODUCTS } from '../sim/economyConfig.js';

// DISPLAY_CAP_LEVELS' maximum (economy.js: [12,16,20,24]). props.js's counterMesh authors twelve
// floor positions — 6 columns x 2 rows — and the case grows UPWARD past that: DISPLAY_LAYERS layers
// of twelve. It was 16 with one Mesh per pastry, because every one of them cost a draw call;
// instanced, the extra layer is free, so a starred case actually looks piled high.
const DISPLAY_POOL = 24;
const DISPLAY_LAYERS = 2;
const DEMAND_DETAIL_RADIUS = 1.7;

// ---- instanced shelf/tray contents ---------------------------------------------------------------
// Batch 8 (spec §5, the draw-call diet). A shelf's pastries were one Mesh each: measured on a fully
// built day-12 café, `station:display` was 55 of the frame's 246 draw calls — the single largest
// bucket in the game, spent on identical cookies sitting in fixed slots. That is precisely what
// InstancedMesh is for. One call per shelf now, with the pop-in animation intact.
// How far the second layer sits above the first. Measured from the geometry itself, because every
// product has its own silhouette and a display's recipe gets swapped at star ranks.
//
// A flat product (a cookie, 0.09 m) stacks: a whisker under its full height, so two of them read as
// two of them. A TALL product does not stack, it NESTS — a cone inside a cone, a cup inside a cup,
// which is how they are actually kept behind a counter and the only way a second cone above a first
// one does not read as one cone floating in the air. STACK_LIFT_MAX is where that changes over.
const STACK_LIFT_MAX = 0.17;
function stackLift(product) {
  const g = itemGeoFor(product);
  if (!g.boundingBox) g.computeBoundingBox();
  return Math.min((g.boundingBox.max.y - g.boundingBox.min.y) * 0.94, STACK_LIFT_MAX);
}
function makeItemStack(group, product, slots, layers = 1) {
  const capacity = slots.length * layers;
  const im = new THREE.InstancedMesh(itemGeoFor(product), toonMaterial(), capacity);
  im.castShadow = false; im.receiveShadow = true; im.count = 0;
  // An InstancedMesh derives its bounds from the geometry alone, which for a pastry is a few
  // centimetres at the origin — it would be culled the moment the shelf itself is off-centre. The
  // parent station group is culled as a whole, so nothing is lost by opting this out.
  im.frustumCulled = false;
  group.add(im);
  return { im, slots, layers, lift: stackLift(product), product, scale: new Float32Array(capacity), shown: -1 };
}

const _stackM4 = new THREE.Matrix4(), _stackQ = new THREE.Quaternion(), _stackV = new THREE.Vector3(), _stackS = new THREE.Vector3();
const _flyM = new THREE.Matrix4(), _flyQ = new THREE.Quaternion(), _flyV = new THREE.Vector3(), _flyS = new THREE.Vector3(1, 1, 1);
function updateItemStack(stack, product, stock, dt, pop) {
  if (!stack) return;
  // A star tier can swap a station's recipe (cookie <-> brownie). Geometries are cached by product
  // key in props.js, so this is a pointer swap, not an allocation.
  if (product !== stack.product) {
    stack.product = product; stack.im.geometry = itemGeoFor(product); stack.lift = stackLift(product); stack.shown = -1;
  }
  const n = Math.max(0, Math.min(stock | 0, stack.slots.length * (stack.layers || 1)));
  let dirty = n !== stack.shown;
  for (let i = 0; i < n; i++) {
    if (stack.scale[i] < 1) { stack.scale[i] = pop ? Math.min(1, (stack.scale[i] || 0.01) + dt * 8) : 1; dirty = true; }
  }
  for (let i = n; i < stack.slots.length; i++) if (stack.scale[i] !== 0) { stack.scale[i] = 0; dirty = true; }
  if (!dirty) return;
  const per = stack.slots.length;
  for (let i = 0; i < n; i++) {
    // Fill every floor position first, then start the layer above it.
    _stackV.copy(stack.slots[i % per]);
    _stackV.y += Math.floor(i / per) * stack.lift;
    _stackS.setScalar(stack.scale[i] || 0.01);
    _stackM4.compose(_stackV, _stackQ, _stackS);
    stack.im.setMatrixAt(i, _stackM4);
  }
  stack.im.count = n;
  stack.im.instanceMatrix.needsUpdate = true;
  stack.shown = n;
}

// Batch 1 terrace (plan 3.1/7.2): icecream/photo mirror the type-keyed lookup every other station
// uses, and `decor` covers fountain1 (the only decor station). `gate` renders nothing: it is
// a non-blocking fence-gap marker (props.js's fence arch/gate-open animation is the actual visual),
// so an empty group keeps it out of the generic reveal/pulse machinery's way without a special case.
const MESH_FOR = {
  oven: ovenMesh, display: counterMesh, checkout: checkoutMesh, seat: tableMesh, hire: hireDeskMesh,
  bowl: bowlMesh, bush: bushMesh, coffee: coffeeMesh, pantry: pantryMesh, blender: blenderMesh,
  icecream: icecreamMesh, decor: fountainMesh, wall: photoWallMesh, jukebox: jukeboxMesh,
  gate: () => new THREE.Group(),
};
// ── what a station says it is, without a word (ship plan §1.9) ──────────────────────────────────
// This replaces the chalkboards. Every station used to get a blank black board on a post standing
// OUTSIDE its footprint, whose only content was a DOM chip that faded in within 5 m: from the play
// camera the room was dotted with twenty signs that said nothing (the owner's "what is this"), one
// of them planted in the ★3 resident cat's bed, and each one cost a draw call in the main pass and
// another in the shadow pass.
//
// The pictogram is baked into the board face instead (render/grain.js paints it into the shared
// detail atlas), and render/props.js's signParts() hands back geometry rather than a mesh so it can
// be merged into the station's OWN mesh. The sign now reads at any distance, costs nothing, and
// stands inside the station's own footprint where no walkway, queue slot or pet bed can be.
//
// The glyph names a FAMILY, not a recipe: a star tier can swap a counter's product (cookie ↔
// brownie, coffee ↔ latte, cone ↔ sundae), and a sign baked at build time must not go stale.
// Whether a station is stocked is not on the sign at all — that is what the demand bubble above it
// and the goods piled on it already say, live.
const SIGN_FOR_PRODUCT = {
  cookie: 'pastry', brownie: 'pastry', cupcake: 'cupcake',
  coffee: 'cup', latte: 'cup', smoothie: 'smoothie',
  icecream: 'cone', sundae: 'cone', pupcup: 'cone', treat: 'paw',
};
export function stationSignGlyph(st) {
  if (!st) return null;
  switch (st.type) {
    case 'oven': case 'display': return SIGN_FOR_PRODUCT[st.product] || 'pastry';
    case 'coffee': return 'cup';
    case 'icecream': return 'cone';
    case 'blender': return 'smoothie';
    case 'pantry': return 'sack';
    case 'bush': return 'berry';
    case 'bowl': return 'paw';
    case 'checkout': return 'coin';
    case 'hire': return 'person';
    default: return null;
  }
}
// The world yaw every sign board turns to. scene.js's camera yaw is a constant and the camera never
// rotates, so facing the camera is the only orientation under which every glyph reads: a board that
// faced its own station's front would show the player the back of half of them.
const SIGN_FACE_YAW = 35 * Math.PI / 180;
// Where a sign stands in its station's LOCAL frame: the back-left corner of the station's own
// footprint, pulled in far enough that the post is never outside the ground the station already
// occupies. A station too small to hold the inset gets the sign on its centre line.
const SIGN_INSET = 0.22;
export function stationSignSpot(st) {
  const hw = Math.max(0, (st.fw || 0) / 2 - SIGN_INSET), hd = Math.max(0, (st.fd || 0) / 2 - SIGN_INSET);
  return { lx: -hw, lz: -hd };
}

// ── the star tier, on the machine (ship plan §1.6c item 3) ──────────────────────────────────────
// economy.js keeps a station's tier in state.stars[id] (STAR_IDS: the two ovens, the two pastry
// counters, the coffee machine and its counter, the blender and its counter) and buyStar() is the
// only thing that ever raises one. That is the whole call path: ui/shop.js buyStar -> economy.js
// buyStar -> G.stars[id] -> the compare below, on the next frame, rebuilds that one station's
// geometry with render/props.js's stationStarParts() merged in. Eight integer compares a frame.
//
// A rebuild, not a second mesh: the dressing lands in the station's OWN geometry, so a fully
// starred café costs exactly the draw calls an unstarred one costs. The base geometry (the mesh as
// built, sign already merged) is kept so a tier change always starts from it rather than piling
// tier 2's parts under tier 3's, and the base's bodyBox is carried across unchanged — buying a star
// changes how a machine LOOKS and never where a body can stand (geo.js addParts's rule).
export function starTierOf(G, stationId) {
  const stars = G && G.stars;
  const raw = stars ? Number(stars[stationId]) : NaN;
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 1;
}
export function applyStarLook(st, v, tier) {
  if (!v || !v.base || !v.baseGeo || v.starTier === tier) return false;
  const parts = stationStarParts(st, tier);
  let geo = v.baseGeo;
  if (parts && parts.length) {
    const keep = v.baseGeo.userData && v.baseGeo.userData.bodyBox;
    geo = merge([v.baseGeo, ...parts]);
    if (keep) geo.userData.bodyBox = keep; else delete geo.userData.bodyBox;
  }
  const old = v.base.geometry;
  v.base.geometry = geo;
  if (old && old !== v.baseGeo && old !== geo) old.dispose();
  v.starTier = tier;
  return true;
}

// Program §6.2, Batch 7: the wait-for-a-wipe bubble a paid guest holds up while dirty tables block
// every seat. Batch 6's crossed-table icon is gone (it is now src/ui/icons.js's tableDirtyIcon,
// shared with the day summary's chip) -- Batch 7 draws the owner's own broom instead: the guest is
// not being told the table is dirty (it already knows -- that's why it's standing there), it is
// waiting for the thing that fixes it.
const NO_SEAT_POOL = 4;
const NO_SEAT_BUBBLE_Y = 1.3;
// A pet is much shorter than a guest, so its bubble sits lower than theirs -- high enough to clear
// the table it is sitting at, low enough that it clearly belongs to the animal and not the person.
const POSE_BUBBLE_Y = 1.0;

// Program §6.2 escalation on a seat nobody has wiped. Crumbs land the moment it goes dirty (the
// dirtyMesh below); flies join after DIRTY_FLIES_AT seconds and a stink wisp after DIRTY_STINK_AT,
// so a table left alone through a rush is visibly worse than one left alone for a moment. Both are
// built lazily -- a cafe that is kept clean never allocates them. Batch 7: pushed later (12->20,
// 25->40) now that DIRTY_EVERY=1 (src/sim/customers.js) means every finished meal leaves a full,
// readable "bussed table" prop (props.js's dirtyMesh) the instant it's dirtied -- the escalation is
// for a table that has genuinely been ignored, not for the ordinary look every seat now carries
// between uses.
const DIRTY_FLIES_AT = 20;
const DIRTY_STINK_AT = 40;
// Both used to be a Group of three separate Meshes, so a café with eight tables left over a rush
// carried up to 48 draw calls of flies and stink. They are one InstancedMesh and one merged mesh
// now — the flies still orbit independently (per-instance matrices), and the stink rises and fades
// as one plume, which is what a plume is (ship plan §1.9's budget).
const FLY_N = 3, STINK_N = 3;
function fliesMesh() {
  const im = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.035, 6, 4),
    new THREE.MeshBasicMaterial({ color: '#2E2A26' }),
    FLY_N,
  );
  im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
  return im;
}
function stinkMesh() {
  const parts = [];
  for (let i = 0; i < STINK_N; i++) {
    parts.push(part('sph', [0.09, 6], '#A6BF6A', { x: Math.sin(i * 2.1) * 0.06, y: i * 0.3, z: Math.cos(i * 1.7) * 0.05 }));
  }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({
    color: '#A6BF6A', transparent: true, opacity: 0.3, depthWrite: false,
  }));
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
// Program §6.3. One wipe presentation, shared by the owner and the cleaner. WIPE_MIN_SECONDS is
// the floor on the ring sweep so the owner's instantaneous wipe still reads as a stroke instead of
// a one-frame flash; WIPE_TAIL_SECONDS is how long the full ring is held while the crumbs shrink
// away, and DIRTY_FADE_SECONDS is that shrink. The crumbs cannot cross-fade: render/palette.js's
// toonMaterial() is a shared singleton, so touching its opacity would fade every prop in the café.
const WIPE_MIN_SECONDS = 0.3;
const WIPE_TAIL_SECONDS = 0.25;
const DIRTY_FADE_SECONDS = 0.25;
const CLEAN_POP_SECONDS = 0.26;
const CLEAN_SPARKLE = '#BFEFFF';
// Resting height of the crumb prop on the table top — the fade above lifts it from here.
const DIRTY_PROP_Y = 0.77;
// Where the meal a seated guest is eating sits on the table top, and how long the steam over a hot
// one keeps coming (Batch G item 5: "the ordered food actually on the table while a guest eats and
// crumbs after"). The crumbs already existed — dirtyMesh, switched on the moment the guest leaves —
// so the gap was the half of the story where the food is still there.
const MEAL_Y = 0.78, MEAL_STEAM_EVERY = 0.85;
const MEAL_HOT = new Set(['coffee', 'latte']);
const DEMAND_Y = { display: 2.1, oven: 2.3, coffee: 1.55, blender: 1.55, bowl: 0.85, bush: 1.55, icecream: 1.55 };

// ---- What a station NEEDS, and how full it is ----------------------------------------------------
// The day-18 report asked for "clever indicators, suitable for this kind of game" for coffee refills,
// pet-treat refills, fruit picking — and said of the blender, "the player can't tell what is what".
// What there was: one grey pill per station carrying a state glyph (○ ◌ ● ◆ ×), a count like "3/10"
// and sometimes a row of pips. "3/10" of what? The blender answered two different questions through
// the same pill — fruit loaded, drinks made — and nothing said which.
//
// NEEDS, NOT NUMBERS. A station shows a bubble only when it needs the PLAYER, and the bubble is a
// picture of what to bring: the bean sack's bean over a coffee machine that has run dry, a peach
// over the blender, the kibble sack over an empty pet bowl,
// and — only while a guest is actually waiting at it — the missing product
// over an empty counter. The bubble is always the same shape so the eye learns it once, and every
// icon matches what the player will be holding when they have fixed it. A ripe bush asks to be
// picked only when the blender actually has room for fruit; otherwise the fruit on the branches
// already says everything. A machine a Barista looks after never asks the player for anything.
//
// Standing next to a station swaps the bubble, if there isn't one, for a small gauge: the same supply
// icon and a fill bar, no digits. Machines show what they EAT (beans, fruit) and
// counters show what they HOLD — which is exactly the distinction the blender's pill used to blur.
// The underlying five-state truth (demandVisualState, below) is unchanged and still tested.
const NEED_ICON = {
  beans: () => beanIcon(), fruit: () => fruitIcon(),
  kibble: () => kibbleIcon(),
  // The SAME peach as the blender's "needs fruit": white bubble = needs it, green bubble = has it.
  // The player connects the two at a glance; a hand icon here (the first try) read as nothing much.
  pick: () => fruitIcon(),
};
function needIconHtml(key, st) {
  if (key === 'product') return iconFor(st.product);
  const f = NEED_ICON[key];
  return f ? f() : '';
}

/** What this station needs FROM THE PLAYER right now: a supply key, 'product', 'pick', or null. */
export function stationNeed(st, { waiter = false, baristaOnDuty = false, blenderRoom = 0 } = {}) {
  if (!st || st.active === false) return null;
  switch (st.type) {
    case 'coffee': return isStarved(st) && !baristaOnDuty ? 'beans' : null;
    case 'blender': case 'bowl': return isStarved(st) ? supplyKind(st) : null;
    case 'display': return (st.stock | 0) <= 0 && waiter ? 'product' : null;
    case 'bush': return (st.stage | 0) >= 3 && blenderRoom >= 3 ? 'pick' : null;
    default: return null;
  }
}

/** The up-close gauge: which icon, and how full (0..1). Null where the prop itself is the gauge. */
export function stationGauge(st) {
  if (!st || st.active === false) return null;
  const kind = supplyKind(st);
  if (kind) {
    const cap = supplyCap(st);
    return cap > 0 ? { icon: kind, frac: Math.max(0, Math.min(1, supplyLevel(st) / cap)) } : null;
  }
  if (st.type === 'display') return { icon: 'product', frac: Math.max(0, Math.min(1, (st.stock | 0) / Math.max(1, st.capacity | 0))) };
  return null;
}

const NEED_WORDS = { beans: 'Needs coffee beans', fruit: 'Needs fruit', kibble: 'Needs pet treats', pick: 'Ripe fruit to pick' };
function needLabel(need, st) {
  return need === 'product' ? 'Out of ' + (st.product || 'stock') + ', a guest is waiting' : NEED_WORDS[need] || '';
}

function makeDemandEl() {
  const el = document.createElement('div'); el.className = 'demand hidden';
  const icon = document.createElement('span'); icon.className = 'dicon';
  const bar = document.createElement('span'); bar.className = 'dbar';
  const fill = document.createElement('span'); fill.className = 'dfill'; bar.appendChild(fill);
  el.append(icon, bar);
  return { el, icon, fill, key: null, mode: null, frac: -1, urgent: null, lastVisible: null };
}

function stationHasWaiter(st, customers) {
  if (st.type === 'display') {
    for (const c of customers) if (!c.done && c.state === 'queue' && c.slot === 0 && c.mood === 'wait' && c.counterId === st.id) return true;
  } else if (st.type === 'bowl') {
    for (const c of customers) if (!c.done && c.state === 'atBowl' && c.mood === 'wait') return true;
  }
  return false;
}

function stockAmountAndCap(st) {
  if (!st) return { n: 0, cap: 1 };
  if (st.type === 'display' || st.type === 'bowl') return { n: Math.max(0, st.stock | 0), cap: Math.max(1, st.capacity | 0) };
  if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender' || st.type === 'icecream') return { n: Math.max(0, st.stock | 0), cap: Math.max(1, st.buffer | 0) };
  if (st.type === 'bush') return { n: Math.max(0, st.stage | 0), cap: 3 };
  return { n: 0, cap: 1 };
}

// Exact Task-31 semantic model. Availability outranks production: if something can be taken now it
// reads ready/full, even if the machine is also continuing to produce behind it.
export function demandVisualState(st) {
  if (!st || st.active === false) return 'hidden';
  const { n, cap } = stockAmountAndCap(st);
  if (st.type === 'bush') return n >= 3 ? 'full' : 'producing';
  if (n >= cap) return 'full';
  if (n > 0) return 'ready';
  if (st.type === 'coffee') return (st.beans | 0) > 0 ? 'producing' : 'blocked';
  if (st.type === 'icecream') return 'producing';
  if (st.type === 'blender') return (st.fruit | 0) > 0 ? 'producing' : 'blocked';
  if (st.type === 'oven') return Number(st.timer) > 0 ? 'producing' : 'empty';
  return 'empty';
}

export function demandDetailVisible(st, player = null, waiter = false, state = demandVisualState(st)) {
  if (!st || st.active === false) return false;
  if (waiter || state === 'blocked') return true;
  if (!player || !st.front) return false;
  return (player.x - st.front.x) ** 2 + (player.z - st.front.z) ** 2 <= DEMAND_DETAIL_RADIUS ** 2;
}

function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

// Batch 8 item 4: one static contact shadow per station, sized off its own footprint (st.fw/fd --
// the same fields chalkboard placement already reads) where a type doesn't earn its own tuned
// radius. 'gate' renders an empty group (MESH_FOR.gate above) and 'wall' hangs above the floor --
// neither has anything to anchor a contact shadow to, so neither gets one.
const STATION_SHADOW_RADIUS = {
  seat: 0.82, decor: 0.78, oven: 0.55, display: 0.55, icecream: 0.55,
  checkout: 0.48, coffee: 0.48, pantry: 0.48, blender: 0.48,
  // bowl was 0.3, sized for the pink ring that used to be the whole treat bar; it is a 0.72 m
  // feeding stand with its own kibble bin now (props.js bowlMesh), and a 0.3 m shadow under it left
  // the corners of the stand floating.
  hire: 0.48, bush: 0.38, bowl: 0.42, jukebox: 0.42,
};
function stationShadowRadius(st) {
  const base = STATION_SHADOW_RADIUS[st.type];
  if (base != null) return base;
  return Math.max(0.3, Math.min(0.9, Math.max(st.fw || 1, st.fd || 1) * 0.32));
}

export function createVisuals(G, S, ctx) {
  const { area, world, scene, vis, fx, els } = ctx;
  const audio = ctx.audio;
  const demandTmp = { sx: 0, sy: 0, visible: true };
  // The wipe currently on screen: { seatId, by, t, tail, dur }. One at a time, exactly like the
  // ring it drives (there is a single cleanRing mesh) — with at most two cleaners on the floor the
  // odds of two simultaneous wipes are small, and the loser still gets its sparkle, pop and fade.
  // A POOL, not a slot. With one slot, a second 'cleaning' event overwrote the first, so an owner
  // walking through the seating area cleaned three tables and only the last one showed its wipe —
  // exactly the owner's report that some tables animate and some do not. Four is comfortably more
  // than can genuinely overlap (the player plus at most two cleaners).
  const activeWipes = [];
  const MAX_WIPES = 4;
  const bodyCorner = new THREE.Vector3();
  for (const st of world.stations.values()) {
    const build = MESH_FOR[st.type] || tableMesh;
    // The station itself is handed in: counterMesh dresses the self-serve garden stand differently
    // from an interior display (props.js). Every other builder ignores the argument.
    const g = build(st);
    // Named so tools/scene-cost.mjs can attribute a draw-call regression to the system that caused
    // it. Before this, every station, guest and pet landed in the report as an anonymous
    // "Group(6 children)" bucket and a cost increase could not be traced to anything.
    g.name = 'station:' + st.type;
    g.position.set(st.x, 0, st.z); g.rotation.y = st.rot; g.visible = st.active;
    // The sign goes on BEFORE the body box is measured below, so the merge that folds it into the
    // station's own geometry happens once, at build time, and the box is taken from the geometry
    // that is actually drawn — minus the sign, which addParts() deliberately keeps out of it.
    const glyph = stationSignGlyph(st);
    const signBase = g.children.find(o => o.isMesh && !o.isInstancedMesh) || null;
    if (glyph && signBase) {
      const { lx, lz } = stationSignSpot(st);
      const sp = signParts(glyph, lx, lz, SIGN_FACE_YAW - st.rot);
      if (sp) addParts(signBase, sp);
    }
    scene.add(g);
    // What the player's body can bump into, in world space, taken from the geometry that is
    // actually drawn rather than from the station's hand-written fw/fd. Seats are deliberately
    // excluded — their chairs must stay walk-through so guests can path onto them — and so are
    // gates (doorways) and walls (mounted above the floor, nothing to bump into). See merge() in
    // src/render/geo.js for where bodyBox comes from.
    if (st.type !== 'seat' && st.type !== 'gate' && st.type !== 'wall') {
      g.updateWorldMatrix(true, true);
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      g.traverse(o => {
        const bb = o.geometry && o.geometry.userData && o.geometry.userData.bodyBox;
        if (!bb) return;
        for (const cx of [bb.minx, bb.maxx]) {
          for (const cz of [bb.minz, bb.maxz]) {
            bodyCorner.set(cx, 0, cz).applyMatrix4(o.matrixWorld);
            if (bodyCorner.x < minx) minx = bodyCorner.x;
            if (bodyCorner.x > maxx) maxx = bodyCorner.x;
            if (bodyCorner.z < minz) minz = bodyCorner.z;
            if (bodyCorner.z > maxz) maxz = bodyCorner.z;
          }
        }
      });
      if (minx !== Infinity) st.body = { minx, maxx, minz, maxz };
    }
    // Placed once (`follow: false`): a station's footprint never moves, only its active/visible
    // flag does, which the sync in update() below mirrors onto the shadow handle every frame.
    const shadow = (st.type === 'gate' || st.type === 'wall') ? null : S.contactShadows && S.contactShadows.add(g, {
      radius: stationShadowRadius(st), strength: 0.85, follow: false,
    });
    if (shadow) shadow.visible = !!st.active;
    const v = { g, items: [], reveal: null, shadow, base: signBase, baseGeo: signBase ? signBase.geometry : null, starTier: 1 };
    // Whatever the save already says this machine is worth, before the first frame is drawn: a
    // restored ★4 café must open looking like a ★4 café, not upgrade itself in front of the player.
    applyStarLook(st, v, starTierOf(G, st.id));
    // The photo wall's frames fill in as the album grows (src/render/photoWall.js) — the handle its
    // mesh exposes is the only thing update() below needs to keep it true.
    if (st.type === 'wall' && g.userData.photoWall) v.photoWall = g.userData.photoWall;
    if (st.type === 'display') { v.stack = makeItemStack(g, st.product, g.slots.slice(0, DISPLAY_POOL / DISPLAY_LAYERS), DISPLAY_LAYERS); g.setProduct(st.product); }
    if (st.type === 'oven') {
      // A 3 x 2 tray, not a column. `g.outSlot.y + i * 0.17` built a free-standing totem pole of six
      // cupcakes rising off the oven's output tray — clearly visible in the owner's playtest
      // screenshots, and the same mistake the carried stack made. Baked goods come out onto a tray.
      const slots = [];
      for (let i = 0; i < 6; i++) {
        slots.push(new THREE.Vector3(
          g.outSlot.x + ((i % 3) - 1) * 0.26,
          g.outSlot.y,
          g.outSlot.z + (Math.floor(i / 3) - 0.5) * 0.24,
        ));
      }
      v.stack = makeItemStack(g, st.product, slots);
    }
    if (st.type === 'checkout') { v.pile = cashPile(); v.pile.position.set(st.cash.x, 0, st.cash.z); scene.add(v.pile); }
    if (st.type === 'seat') {
      // A seat mesh may say where its plates go (g.dirtyAnchor); every café table takes the
      // default spot on its top.
      const a = g.dirtyAnchor;
      const d = dirtyMesh(); d.position.set(a ? a.x : 0.15, a ? a.y : DIRTY_PROP_Y, a ? a.z : -0.1); d.visible = false; g.add(d);
      v.dirtyProp = d; v.dirtyY = a ? a.y : DIRTY_PROP_Y;
    }
    if (DEMAND_Y[st.type] != null) { v.demand = makeDemandEl(); els.fx.appendChild(v.demand.el); }
    vis.set(st.id, v);
  }
  // ── the Fruit garden (ship plan §1.4; Batch G2 item 1) ────────────────────────────────────────
  // z_garden's 1400 coins used to add two green spheres to a corner of tiled floor. render/props.js
  // fruitGardenMesh() is the bed they stand in — soil, kerb, clover, a picket along the café side, a
  // watering can and a crate of picked fruit — as ONE merged mesh, so the whole garden is one draw
  // call and none in the shadow pass.
  //
  // It is not a station and it has no build event of its own, so it takes its cue from the station
  // z_garden actually adds: whatever bush2's mesh is doing, the bed is doing. That is the same
  // authority the reveal, the restore and the dev-tool paths already drive, so there is exactly one
  // way for the bed and the bushes to disagree — bush2 not existing at all, which hides the bed.
  const GARDEN_ANCHOR = 'bush2';
  const gardenPatch = world.stations.has(GARDEN_ANCHOR) ? fruitGardenMesh() : null;
  if (gardenPatch) scene.add(gardenPatch);
  function syncGarden() {
    if (!gardenPatch) return;
    const anchor = vis.get(GARDEN_ANCHOR);
    gardenPatch.visible = !!(anchor && anchor.g.visible);
  }
  syncGarden();

  // A guest's meal, on the table, while they eat it (Batch G item 5). One mesh per interior/garden
  // table, created lazily the first time that table is used and hidden the rest of the time: the
  // geometry is itemGeoFor()'s own product mesh, the same object the guest carried to the seat, so
  // what is on the plate is literally what was ordered. The plate and the item are merged per
  // product (MEAL_GEO) so a meal is ONE draw call, not two, and only tables in use pay for it.
  const MEAL_GEO = new Map();
  const mealAt = new Map();   // seat id -> the product its guest is eating, rebuilt every frame
  function mealGeoFor(product) {
    let g = MEAL_GEO.get(product);
    if (!g) {
      g = merge([
        part('cyl', [0.24, 0.24, 0.03, 14], C.cream, { y: 0.015, tex: 'ceramic' }),
        itemGeoFor(product).clone().translate(0, 0.045, 0),
      ]);
      MEAL_GEO.set(product, g);
    }
    return g;
  }
  const cleanRings = [];
  for (let i = 0; i < 4; i++) {
    const r = zoneRing(); r.scale.setScalar(0.6); r.visible = false; scene.add(r); cleanRings.push(r);
  }

  // Program §6.2. A small fixed pool of broom bubbles, kept at its historical size (Batch 7 didn't
  // grow it even though guests in 'waitSeat' now hold for up to WAIT_SEAT_GRACE (12 s) rather than
  // the old 1.2 s 'noSeat' hold -- the owner's "icon soup" batch spent real effort capping how many
  // floating chips can be on screen at once, and a bigger pool would undo exactly that; any waiter
  // beyond the first NO_SEAT_POOL simply goes unbubbled). They carry the .wish class deliberately:
  // that is the class src/ui/labelLayout.js already anchors and arbitrates for guest bubbles, so
  // these are decluttered by the same pass and cannot be the thing that breaks the 0-violation audit.
  const noSeatPool = [];
  function noSeatSlot() {
    const el = document.createElement('div'); el.className = 'wish noseat hidden';
    const icon = document.createElement('span'); icon.className = 'wishIcon'; icon.innerHTML = broomIcon();
    el.appendChild(icon); els.fx.appendChild(el);
    return { el, visible: false };
  }

  // The camera bubble over a posing pet (docs/SHIP-PLAN-2026-09-19.md §1.3). Exactly the shape a
  // station uses to say it needs the player -- .demand.need, the same white bubble with a tail --
  // because it means the same thing: come here. There is only ever ONE pose at a time
  // (src/sim/petPose.js), so this is one element, not a pool. It goes away the moment the shot
  // starts: from then on the ring (src/ui/photoGame.js) is what the player is looking at.
  const poseBubble = document.createElement('div');
  poseBubble.className = 'demand need hidden';
  poseBubble.setAttribute('aria-label', 'A pet is posing for a photo');
  { const i = document.createElement('span'); i.className = 'dicon'; i.innerHTML = cameraIcon(); poseBubble.appendChild(i); }
  els.fx.appendChild(poseBubble);
  let poseBubbleOn = null;

  function syncAll() {
    for (const st of world.stations.values()) {
      const v = vis.get(st.id); if (!v) continue;
      v.reveal = null; v.g.visible = st.active; v.g.scale.setScalar(1);
      // Program §6.3: a restore or a day flip is not a wipe. Drop any pop or crumb fade in flight
      // so a loaded save never plays half of someone else's cleaning animation.
      v.popT = null; v.dirtyFade = null;
      if (v.dirtyProp) { v.dirtyProp.scale.setScalar(1); v.dirtyProp.position.y = v.dirtyY; v.dirtyProp.visible = !!st.dirty; }
      // A restore drops every live customer, so no table has anyone eating at it any more.
      if (v.meal) v.meal.visible = false;
      if (v.photoWall) v.photoWall.setAlbum(G.meta && G.meta.album);
      // A restore can load a café whose machines are starred; the mesh has to say so immediately.
      applyStarLook(st, v, starTierOf(G, st.id));
    }
    syncGarden();
    activeWipes.length = 0;
    // A restore drops every live customer, so whatever was posing is gone with them.
    poseBubble.classList.add('hidden'); poseBubbleOn = false;
  }

  // ── the opening frame (ship plan §1.6: "oven + counter + register framed in portrait") ─────────
  // The publisher's rule is that t = 0 shows the fantasy working, and on a 380x670 phone it did not:
  // the owner starts behind the work row, not between it, so framing 10 m around them left the oven
  // 9.7 m off screen to the right with the first guidance chevrons pointing at it.
  //
  // render/scene.js owns the camera and solves the shot; this is the only place that knows WHAT to
  // frame. It hands over the stations that are active on a fresh save — no coordinate is written
  // here, so the shot follows the stations wherever the simulation lane moves them — plus the owner,
  // so the player is always in their own first frame. A restore releases it (scene.js S.snap), which
  // is right: a returning player is not being introduced to anything.
  //
  // Each station contributes its floor point and its head-height point, so a shot that "fits" the
  // oven fits the whole oven rather than the tile it stands on.
  if (S && typeof S.establish === 'function') {
    const frame = [];
    for (const st of world.stations.values()) {
      if (!st.active || st.type === 'gate' || st.type === 'wall') continue;
      frame.push({ x: st.x, y: 0, z: st.z }, { x: st.x, y: 1.5, z: st.z });
    }
    if (ctx.P) frame.push({ x: ctx.P.x, y: 0, z: ctx.P.z }, { x: ctx.P.x, y: 1.9, z: ctx.P.z });
    if (frame.length) S.establish(frame, { hold: 2.2, glide: 1.4, margin: 0.14 });
  }

  return {
    syncAll,
    update(dt) {
      const still = reducedMotion() || !!(G.settings && G.settings.reducedMotion);
      for (const e of world.events) {
        if (e.type === 'built') {
          const z = area.zones.find(z => z.id === e.zoneId); if (!z) continue;
          // One committed build creates exactly one reveal record per station. Restore/sync never
          // replays it, so a load cannot repeatedly celebrate an old purchase.
          for (const id of z.adds) {
            const v = vis.get(id); if (!v) continue;
            v.reveal = { t: 0, pulsed: false };
            v.g.visible = false; v.g.scale.setScalar(0.001);
          }
        } else if (e.type === 'cleaning') {
          // Program §6.3: whoever is wiping — owner or cleaner — gets the same ring, filled over
          // the duration the simulation actually committed to.
          const wipe = {
            seatId: e.seatId, by: e.by || null, t: 0, tail: 0,
            dur: Math.max(WIPE_MIN_SECONDS, Number(e.seconds) > 0 ? Number(e.seconds) : 0),
          };
          // Re-wiping a table already being wiped restarts that one rather than adding a second.
          const existing = activeWipes.findIndex(x => x.seatId === e.seatId);
          if (existing >= 0) activeWipes[existing] = wipe;
          else { activeWipes.push(wipe); if (activeWipes.length > MAX_WIPES) activeWipes.shift(); }
        } else if (e.type === 'cleaned') {
          const st = world.stations.get(e.seatId);
          if (st) {
            // The finish is one rule for both actors now: sparkle over the table top, a short pop
            // of the table itself, the crumb fade below, and the chime the owner's wipe used to
            // play from systems/stations.js.
            fx.burst(st.x, 0.85, st.z, CLEAN_SPARKLE, 8);
            const v = vis.get(e.seatId);
            if (v && !still) v.popT = 0;
            if (audio && typeof audio.play === 'function') audio.play('clean');
          }
        }
        // 'seatMissed' draws nothing here any more. It used to float a "−1★" over the guest for the
        // reputation point it cost; a missed seat no longer costs anything (sim/serviceQuality.js
        // applySeatMiss), and the guest walking out is the whole consequence.
      }

      // How much fruit the hungriest blender has room for, once per frame: a ripe bush only asks to be
      // picked when that fruit has somewhere to go (stationNeed's 'pick').
      let frameBlenderRoom = 0;
      for (const b of world.stations.values()) if (b.type === 'blender' && b.active) frameBlenderRoom = Math.max(frameBlenderRoom, supplyRoom(b));
      // Which table has a guest eating what, this frame. Read from the live customer list rather
      // than driven by an event, so a restore, a day flip or a guest who simply vanishes can never
      // strand a plate on a table. `c.order` is the array of product keys the guest actually took
      // off the counter (sim/customers.js), so the plate carries what was really bought.
      mealAt.clear();
      if (G.customers) {
        for (const c of G.customers) {
          if (c.done || c.state !== 'eating' || !c.seatId) continue;
          const order = Array.isArray(c.order) ? c.order : null;
          const product = (order && order.find(k => PRODUCTS[k])) || (c.wish && PRODUCTS[c.wish.product] ? c.wish.product : null);
          if (product) mealAt.set(c.seatId, product);
        }
      }
      for (const st of world.stations.values()) {
        const v = vis.get(st.id); if (!v) continue;

        // Eight integer compares a frame; a merge only on the frame a star is actually bought.
        applyStarLook(st, v, starTierOf(G, st.id));

        if (v.reveal) {
          v.reveal.t += Math.max(0, dt);
          const phase = buildRevealPhase(v.reveal.t);
          if (phase === 'anticipation') {
            v.g.visible = false;
          } else {
            v.g.visible = true;
            v.g.scale.setScalar(buildRevealScale(v.reveal.t, reducedMotion()));
          }
          if (phase === 'done') {
            v.g.scale.setScalar(1);
            if (!v.reveal.pulsed) {
              v.reveal.pulsed = true;
              // The pulse lands at the actual interaction/output side of the new station, teaching
              // where future work happens without text, collision changes, or camera control.
              const p = st.front || st;
              fx.burst(p.x, st.type === 'bowl' ? 0.45 : 0.75, p.z, C.accent, 10);
            }
            v.reveal = null;
          }
        }

        // Keeps a station's mesh in step with its active flag outside a reveal (a restore that
        // clears the build set, dev tooling). Skipped while a reveal is in flight, since that
        // already owns visibility/scale for its own duration.
        if (!v.reveal && v.g.visible !== !!st.active) v.g.visible = !!st.active;
        // Mirrors whatever the reveal/active logic above just decided, whichever branch set it.
        if (v.shadow) v.shadow.visible = v.g.visible;

        // Program §6.3: the table acknowledges the wipe with a short squash-and-stretch pop (the
        // group-level twin of render/human.js's H.pop), started by the 'cleaned' event above. The
        // build reveal owns this group's scale while it runs, so the pop always yields to it.
        if (v.popT != null) {
          if (v.reveal) v.popT = null;
          else {
            v.popT += Math.max(0, dt);
            const k = v.popT / CLEAN_POP_SECONDS;
            if (k >= 1) { v.popT = null; v.g.scale.setScalar(1); }
            else { const b = Math.sin(k * Math.PI) * 0.09; v.g.scale.set(1 - b * 0.5, 1 + b, 1 - b * 0.5); }
          }
        }

        // A shelf pops each new pastry in from nothing; an oven's output tray just fills.
        if (st.type === 'display') updateItemStack(v.stack, st.product, st.stock, dt, true);
        if (st.type === 'oven') updateItemStack(v.stack, st.product, Math.min(st.stock, 6), dt, false);
        if (st.type === 'checkout') v.pile.setCount(Math.ceil(st.pile / 5));
        // The collection, made visible in the café: a frame per pet, coloured once it is in the
        // album (systems/photo.js creditShot writes it). A no-op when nothing changed.
        if (v.photoWall) v.photoWall.setAlbum(G.meta && G.meta.album);
        if (st.type === 'bush') v.g.setStage(st.stage);
        if (st.type === 'seat' && v.dirtyProp) {
          // Program §6.3: the crumbs used to be switched off between two frames, which is what
          // made a staff-cleaned table look like a bug rather than an event. They now shrink and
          // lift away over DIRTY_FADE_SECONDS under the sparkle. Scale, not opacity — see the note
          // beside DIRTY_FADE_SECONDS about the shared toon material.
          if (st.dirty) {
            v.dirtyProp.visible = true; v.dirtyProp.scale.setScalar(1);
            v.dirtyProp.position.y = v.dirtyY; v.dirtyFade = 0;
          } else if (v.dirtyFade != null && v.dirtyFade < DIRTY_FADE_SECONDS) {
            v.dirtyFade += Math.max(0, dt);
            const k = Math.min(1, v.dirtyFade / DIRTY_FADE_SECONDS);
            v.dirtyProp.visible = k < 1;
            v.dirtyProp.scale.setScalar(Math.max(0.001, 1 - k));
            v.dirtyProp.position.y = v.dirtyY + (still ? 0 : k * 0.1);
          } else if (v.dirtyProp.visible) {
            v.dirtyProp.visible = false; v.dirtyProp.position.y = v.dirtyY;
          }
          // One clock per seat, render-side only: it never feeds the sim, so it cannot affect the
          // deterministic replay tools/bot.js depends on.
          v.dirtyT = st.dirty ? (v.dirtyT || 0) + Math.max(0, dt) : 0;
          if (st.dirty && v.dirtyT >= DIRTY_FLIES_AT && !v.flies) { v.flies = fliesMesh(); v.g.add(v.flies); }
          if (st.dirty && v.dirtyT >= DIRTY_STINK_AT && !v.stink) { v.stink = stinkMesh(); v.g.add(v.stink); }
          if (v.flies) {
            const on = st.dirty && v.dirtyT >= DIRTY_FLIES_AT;
            v.flies.visible = on;
            // Reduced motion keeps the flies (the information) and drops the orbit (the motion).
            if (on) {
              for (let i = 0; i < FLY_N; i++) {
                const a = still ? i * 2.1 : v.dirtyT * (2.2 + i * 0.45) + i * 2.1;
                _flyV.set(
                  0.15 + Math.cos(a) * (0.24 + i * 0.05),
                  1.04 + (still ? 0 : Math.sin(a * 1.7 + i) * 0.07),
                  -0.1 + Math.sin(a) * (0.22 + i * 0.05),
                );
                _flyM.compose(_flyV, _flyQ, _flyS);
                v.flies.setMatrixAt(i, _flyM);
              }
              v.flies.instanceMatrix.needsUpdate = true;
            }
          }
          if (v.stink) {
            const on = st.dirty && v.dirtyT >= DIRTY_STINK_AT;
            v.stink.visible = on;
            // One plume, rising and thinning as a whole, instead of three spheres each carrying
            // their own material and their own draw call.
            if (on) {
              const p = still ? 0.5 : (v.dirtyT * 0.5) % 1;
              v.stink.position.set(0.15 + Math.sin(p * 5) * 0.06, 0.88 + p * 0.5, -0.1 + Math.cos(p * 4) * 0.05);
              v.stink.scale.setScalar(0.55 + p * 0.85);
              v.stink.material.opacity = 0.3 * (1 - p * 0.85);
            }
          }
          // The meal itself, while the guest is still eating it. mealAt is rebuilt once per frame
          // below from the live customer list, so a seat whose guest has gone puts its plate away on
          // the same frame the crumbs appear.
          const meal = mealAt.get(st.id);
          if (meal && !st.dirty) {
            if (!v.meal) {
              v.meal = new THREE.Mesh(mealGeoFor(meal), toonMaterial());
              v.meal.name = 'meal';   // so tools/batch-g-smoke.js can find it without guessing at y
              v.meal.castShadow = false; v.meal.receiveShadow = true;
              // On the far side of the table top from the guest's chair (south, z +1.05), so the
              // body sitting there never hides the thing it is eating.
              v.meal.position.set(-0.16, MEAL_Y, -0.1);
              v.g.add(v.meal);
              v.mealProduct = meal;
            } else if (v.mealProduct !== meal) {
              v.meal.geometry = mealGeoFor(meal); v.mealProduct = meal;
            }
            v.meal.visible = true;
            if (MEAL_HOT.has(meal) && !still) {
              v._mealSteamT = (v._mealSteamT || 0) + dt;
              if (v._mealSteamT > MEAL_STEAM_EVERY) { v._mealSteamT = 0; fx.steam(st.x - 0.16, MEAL_Y + 0.16, st.z - 0.1, '#FFFFFF', 2); }
            }
          } else if (v.meal && v.meal.visible) v.meal.visible = false;
        }
        if (st.type === 'coffee' && st.active && st.beans > 0 && st.stock < st.buffer) {
          v._steamT = (v._steamT || 0) + dt;
          if (v._steamT > 0.5) { v._steamT = 0; fx.steam(st.x, 1.0, st.z, '#FFFFFF', 2); }
        }
        // Batch G item 5: the oven has had a warm window since Batch 8 (systems/machineJuice.js) but
        // nothing above it, so a baking oven read the same as a cold one from across the room. A
        // wisp off the hood is the cheapest "something is cooking" there is — it rides the shared
        // fx particle pool, so it costs no draw call.
        if (st.type === 'oven' && st.active && !still && Number(st.timer) > 0) {
          v._steamT = (v._steamT || 0) + dt;
          if (v._steamT > 0.7) { v._steamT = 0; fx.steam(st.x, 1.55, st.z, '#FFF0DC', 2); }
        }
        // D2 — fountain particle ring: reuse fx.burst on a timer rather than a new particle system.
        if (st.type === 'decor' && st.active) {
          v._fxT = (v._fxT || 0) + dt;
          if (v._fxT > 1.1) { v._fxT = 0; fx.burst(st.x, 1.0, st.z, '#A8DCEF', 6); }
        }

        if (v.demand) {
          const dv = v.demand;
          if (!st.active) {
            if (dv.lastVisible !== false) { dv.el.classList.add('hidden'); dv.lastVisible = false; }
          } else {
            const waiter = stationHasWaiter(st, G.customers);
            const need = stationNeed(st, { waiter, baristaOnDuty: !!world.baristaOnDuty, blenderRoom: frameBlenderRoom });
            const near = demandDetailVisible(st, G.P, false, 'ready');
            const gauge = !need && near ? stationGauge(st) : null;
            const mode = need ? 'need' : gauge ? 'gauge' : null;
            const iconKey = need || (gauge && gauge.icon) || null;
            const key = iconKey === 'product' ? 'product:' + st.product : iconKey;
            if (key !== dv.key) { dv.key = key; dv.icon.innerHTML = iconKey ? needIconHtml(iconKey, st) : ''; }
            if (mode !== dv.mode) {
              dv.el.classList.toggle('need', mode === 'need');
              dv.el.classList.toggle('gauge', mode === 'gauge');
              dv.el.classList.toggle('pick', need === 'pick');
              // A bubble arriving pops once. Never loops: a need is information, not an alarm.
              if (mode === 'need') { dv.el.classList.remove('pop'); void dv.el.offsetWidth; dv.el.classList.add('pop'); }
              dv.mode = mode;
            }
            // Urgent (coral) only while a guest is actually standing there waiting on it.
            const urgent = mode === 'need' && waiter;
            if (dv.urgent !== urgent) { dv.el.classList.toggle('urgent', urgent); dv.urgent = urgent; }
            if (gauge) {
              const frac = Math.round(gauge.frac * 20) / 20;
              if (frac !== dv.frac) { dv.fill.style.width = (frac * 100) + '%'; dv.el.classList.toggle('low', frac < 0.25); dv.frac = frac; }
            }
            // The bubble's tail points down at the station, so it sits a little above the gauge line.
            fx.project(st.x, DEMAND_Y[st.type] + (mode === 'need' ? 0.3 : 0), st.z, demandTmp);
            dv.el.style.left = demandTmp.sx + 'px'; dv.el.style.top = demandTmp.sy + 'px';
            const visible = demandTmp.visible && !!mode;
            if (dv.lastVisible !== visible) { dv.el.classList.toggle('hidden', !visible); dv.lastVisible = visible; }
            dv.el.setAttribute('aria-label', need ? needLabel(need, st) : '');
          }
        }
      }
      // The bed follows its bushes: the frame z_garden's reveal first shows bush2 is the frame the
      // corner becomes a garden.
      syncGarden();
      // Program §6.2, Batch 7: one broom bubble per guest currently waiting for a wipe.
      let noSeatUsed = 0;
      if (G.customers) for (const c of G.customers) {
        if (c.done || c.state !== 'waitSeat' || noSeatUsed >= NO_SEAT_POOL) continue;
        const slot = noSeatPool[noSeatUsed] || (noSeatPool[noSeatUsed] = noSeatSlot());
        noSeatUsed++;
        fx.project(c.x, NO_SEAT_BUBBLE_Y, c.z, demandTmp);
        slot.el.style.left = demandTmp.sx + 'px'; slot.el.style.top = demandTmp.sy + 'px';
        if (slot.visible !== demandTmp.visible) { slot.el.classList.toggle('hidden', !demandTmp.visible); slot.visible = demandTmp.visible; }
      }
      for (let i = noSeatUsed; i < noSeatPool.length; i++) {
        const slot = noSeatPool[i];
        if (slot.visible) { slot.el.classList.add('hidden'); slot.visible = false; }
      }

      // "Come and take my picture." Up while a pet holds its pose and nobody has started the shot.
      const pose = world.pose;
      const poseUp = !!pose && !pose.session;
      if (poseUp) {
        fx.project(pose.x, POSE_BUBBLE_Y, pose.z, demandTmp);
        poseBubble.style.left = demandTmp.sx + 'px'; poseBubble.style.top = demandTmp.sy + 'px';
      }
      const poseVisible = poseUp && demandTmp.visible;
      if (poseBubbleOn !== poseVisible) {
        poseBubble.classList.toggle('hidden', !poseVisible);
        // Arriving pops once, like every other need bubble. Never loops: an invitation is not an alarm.
        if (poseVisible) { poseBubble.classList.remove('pop'); void poseBubble.offsetWidth; poseBubble.classList.add('pop'); }
        poseBubbleOn = poseVisible;
      }

      // Program §6.3: one ring, either actor. ctx.cleanProg is the owner-hold map systems/
      // stations.js still owns; it wins whenever it has an entry because that is a live,
      // frame-by-frame progress. It is empty in today's build (the owner's wipe is instantaneous),
      // so in practice every ring below is the event-driven one — which is the whole point: the
      // cleaner's 1.6 s finally has a visible clock, drawn by the same code as the owner's.
      const cleanProg = ctx.cleanProg;
      let used = 0;
      // The owner-hold map wins when it has entries: it is live, frame-by-frame progress.
      if (cleanProg && cleanProg.size) {
        for (const [seatId, t] of cleanProg) {
          if (used >= cleanRings.length) break;
          const st = world.stations.get(seatId);
          if (!st) continue;
          const ring = cleanRings[used++];
          ring.position.set(st.x, 0, st.z);
          ring.visible = true; ring.setProgress(Math.min(1, t / 1.0));
        }
      }
      for (let i = activeWipes.length - 1; i >= 0; i--) {
        const wipe = activeWipes[i];
        wipe.t += Math.max(0, dt);
        const seat = world.stations.get(wipe.seatId);
        const finished = !seat || !seat.dirty;   // 'cleaned' already landed (same frame, for the owner)
        if (finished) wipe.tail += Math.max(0, dt);
        // Three ways out, so a ring can never be stranded: the tail elapsed, the seat vanished, or
        // the wipe was abandoned (a cleaner pulled off a seat someone else wiped) and simply ran
        // long. The last is the safety net, never the normal path.
        if (!seat || wipe.tail >= WIPE_TAIL_SECONDS || wipe.t > wipe.dur + 2) { activeWipes.splice(i, 1); continue; }
        if (used >= cleanRings.length) continue;
        const ring = cleanRings[used++];
        ring.position.set(seat.x, 0, seat.z);
        ring.visible = true;
        ring.setProgress(finished ? 1 : Math.min(1, wipe.t / wipe.dur));
      }
      for (let i = used; i < cleanRings.length; i++) cleanRings[i].visible = false;
    },
  };
}
