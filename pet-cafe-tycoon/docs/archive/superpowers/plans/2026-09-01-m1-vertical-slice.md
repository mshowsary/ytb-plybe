# Pet Café Tycoon — Milestone 1 (vertical slice, visuals first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, good-looking slice: café interior, joystick-driven owner, oven → head stack → counter, three pet species that queue, take, pay and leave, a cash pile that flies into the HUD wallet, and one working build zone, verified by GPU screenshots.

**Architecture:** Pure simulation modules (`src/sim/*`, no three.js, unit-tested with `node:test`) drive a Three.js render layer (`src/render/*`) through a single glue file (`src/game.js`). Everything visual is procedural geometry with vertex colors and a toon gradient. No physics engine, no WASM, no workers, no storage APIs, one external script (the ytgame SDK; a no-op outside YouTube).

**Tech Stack:** Vite 8, three.js 0.185, plain ES modules + JSDoc, `node:test`, Playwright (already installed) for screenshots.

**Spec:** `docs/superpowers/specs/2026-09-01-pet-cafe-tycoon-design.md`

## Global Constraints

- Node 24, npm 11. Vite `base: './'`, `build.modulePreload: false`, three.js in its own chunk.
- Output must contain exactly one external `<script src>`: `https://www.youtube.com/game_api/v1`, loaded before game code.
- Forbidden anywhere in built output: `WebAssembly`, `Worker(`, `eval(`, `new Function`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `visibilitychange`, `navigator.language`.
- Renderer: `NeutralToneMapping` (ruled during execution; ACES washed the pastels out), pixel ratio capped at 2, PCF soft shadows, shadow map 2048 (1024 when `innerWidth < 700`).
- Draw calls ≤ 120 for this milestone (ruled during execution; measured 103, mostly pet sub-meshes — merging them is a polish item toward 80), triangles ≤ 150 k. No per-frame allocations in hot loops (reuse Vector3/Matrix4 temporaries).
- World units are meters. +x east, +z south (toward camera), +y up. Area 1 floor is 16 m (x) × 12 m (z), origin at its center.
- Palette (spec): floor `#F3E2C7`, walls `#BFE8D8`, coral `#FF8A80`, cream `#FFF4E6`, wood `#D9A066`, plant `#7BC47F`, coin `#FFD84D`, accent `#8B7CF6`. Pets: cat `#F5A25D`, dog `#E8C39E`, bunny `#FFFFFF`.
- Esc is never `preventDefault`ed. Every interaction is "walk into it"; nothing in the world is tapped.
- Tests are minimal in this milestone (pure sim only). Visual acceptance is by screenshot review.
- Commit after every task (`git init` in Task 1).

---

## File structure (Milestone 1)

```
pet-cafe-tycoon/
  package.json  vite.config.js  index.html
  src/main.js            boot order, loading overlay, starts game
  src/game.js            glue: sim ↔ render ↔ hud, per-frame update
  src/core/rng.js        mulberry32 seeded RNG
  src/core/tween.js      spring + tween helpers (pure)
  src/core/input.js      floating joystick + keyboard → {x,z,active}
  src/sim/economy.js     PRODUCTS, price/speed/carry/income formulas (pure)
  src/sim/world.js       stations, build zones, pay/complete (pure)
  src/sim/customers.js   customer state machine (pure)
  src/render/palette.js  colors, toon gradient map, material factory
  src/render/geo.js      colored-primitive builder + merge helpers
  src/render/scene.js    renderer, lights, camera rig, post, resize
  src/render/props.js    café geometry: floor, walls, awning, counter, oven, checkout, tables, plants
  src/render/owner.js    player mesh + head stack
  src/render/pets.js     cat/dog/bunny builders + procedural animation
  src/render/fx.js       instanced particles, coin arcs, floating numbers
  src/ui/hud.js          wallet, hint, joystick ring
  data/area1.js          station positions, waypoints, build zones (data only)
  test/*.test.js         node:test for sim modules
  tools/postbuild.js     Playables build guard
  tools/shot.js          Playwright GPU screenshots at scripted moments
```

---

### Task 1: Project scaffold and build guard

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/style.css`, `tools/postbuild.js`, `.gitignore`

**Interfaces:**
- Produces: `index.html` DOM ids used by later tasks: `#loading`, `#c` (canvas), `#hud`, `#wallet`, `#walletNum`, `#hint`, `#joy`, `#joyKnob`, `#fx` (floating-number layer).

- [ ] **Step 1: Init project**

```bash
cd C:/Users/show-/Documents/fable5.1-youtube-playables-games/pet-cafe-tycoon
git init
npm init -y
npm i three@0.185.1
npm i -D vite@8
```

- [ ] **Step 2: package.json scripts** — replace `"scripts"` and add `"type"`:

```json
"type": "module",
"scripts": {
  "dev": "vite",
  "build": "vite build && node tools/postbuild.js",
  "preview": "vite preview --port 4173 --strictPort",
  "test": "node --test test/",
  "shot": "node tools/shot.js"
}
```

- [ ] **Step 3: vite.config.js**

```js
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
```

- [ ] **Step 4: index.html** (SDK tag first; loading overlay visible before any JS)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>Pet Café Tycoon</title>
<script src="https://www.youtube.com/game_api/v1"></script>
<link rel="stylesheet" href="./src/style.css">
</head>
<body>
<canvas id="c"></canvas>
<div id="loading"><div class="spin"></div><div class="lbl">LOADING</div></div>
<div id="hud" class="hidden">
  <div id="wallet" class="pill"><span class="coin"></span><span id="walletNum">0</span></div>
  <div id="hint" class="pill hidden"></div>
  <div id="joy" class="hidden"><div id="joyKnob"></div></div>
</div>
<div id="fx"></div>
<script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: src/style.css**

```css
:root{--sat:env(safe-area-inset-top,0px);--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);--sar:env(safe-area-inset-right,0px);
  --cream:#FFF4E6;--coral:#FF8A80;--coin:#FFD84D;--ink:#3B2E2A;--accent:#8B7CF6;}
html,body{margin:0;height:100%;overflow:hidden;background:#BFE8D8;font-family:"Segoe UI",system-ui,sans-serif;-webkit-user-select:none;user-select:none;touch-action:none;}
#c{position:fixed;inset:0;width:100%;height:100%;display:block;}
.hidden{display:none!important}
#loading{position:fixed;inset:0;background:#BFE8D8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:50;color:var(--ink);font-weight:800;letter-spacing:.2em}
#loading .spin{width:44px;height:44px;border-radius:50%;border:5px solid #fff4;border-top-color:var(--coral);animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
#hud{position:fixed;inset:0;pointer-events:none;z-index:10}
.pill{position:absolute;background:#fff;color:var(--ink);border-radius:999px;padding:8px 14px;font-weight:800;font-size:18px;box-shadow:0 4px 0 #0001,0 8px 20px #0002;display:flex;align-items:center;gap:8px;min-height:48px;box-sizing:border-box}
#wallet{left:calc(12px + var(--sal));top:calc(12px + var(--sat))}
#wallet .coin{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6b0,var(--coin) 60%,#e0a800);box-shadow:inset 0 -2px 0 #0002}
#hint{left:50%;transform:translateX(-50%);bottom:calc(120px + var(--sab));font-size:16px;background:#fffd}
#joy{position:absolute;width:120px;height:120px;border-radius:50%;background:#fff3;border:3px solid #fff8;transform:translate(-50%,-50%)}
#joyKnob{position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;background:#fffc;transform:translate(-50%,-50%);box-shadow:0 4px 10px #0002}
#fx{position:fixed;inset:0;pointer-events:none;z-index:9;overflow:hidden}
.fnum{position:absolute;font-weight:900;font-size:22px;color:var(--coin);-webkit-text-stroke:1px #7a5a00;text-shadow:0 2px 0 #0003;transform:translate(-50%,-50%);animation:fn .9s ease-out forwards}
@keyframes fn{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}20%{opacity:1;transform:translate(-50%,-60%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-160%) scale(1)}}
```

- [ ] **Step 6: src/main.js placeholder boot** (real boot in Task 10; this proves the pipeline)

```js
import * as THREE from 'three';
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
r.setSize(innerWidth, innerHeight); r.setClearColor(0xbfe8d8);
r.render(new THREE.Scene(), new THREE.PerspectiveCamera());
document.getElementById('loading').classList.add('hidden');
```

- [ ] **Step 7: tools/postbuild.js** (fails the build on any violation)

```js
import fs from 'node:fs'; import path from 'node:path';
const dist = path.resolve('dist');
const SDK = 'https://www.youtube.com/game_api/v1';
const FORBID = ['new WebAssembly', 'WebAssembly.instantiate', 'new Worker(', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'visibilitychange', 'navigator.language'];
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
const bad = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8'); const rel = path.relative(dist, f).split(path.sep).join('/');
  if (!/^[A-Za-z0-9_.\-\/]+$/.test(rel)) bad.push('bad filename ' + rel);
  for (const t of FORBID) if (s.includes(t)) bad.push(rel + ' contains ' + t);
  const urls = [...s.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[0]).filter(u => u !== SDK && !u.startsWith('http://www.w3.org/'));
  if (urls.length) bad.push(rel + ' external urls ' + [...new Set(urls)].join(','));
  if (s.length > 30 * 1024 * 1024) bad.push(rel + ' over 30 MiB');
  if (s.length > 512 * 1024) console.warn('warn: ' + rel + ' is ' + (s.length / 1024 | 0) + ' KB (>512 KB SHOULD)');
}
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const ext = [...html.matchAll(/<script[^>]*src="(https?:[^"]+)"/g)].map(m => m[1]);
if (ext.length !== 1 || ext[0] !== SDK) bad.push('expected exactly one external script (the SDK), got ' + ext.join(','));
if (html.indexOf(SDK) > html.indexOf('type="module"')) bad.push('SDK script must come before game code');
if (bad.length) { console.error('POSTBUILD FAILED:\n' + bad.join('\n')); process.exit(1); }
const total = files.reduce((a, f) => a + fs.statSync(f).size, 0);
console.log('postbuild OK: ' + files.length + ' files, ' + (total / 1024 | 0) + ' KB total');
```

If the three.js chunk trips a forbidden token through a comment or a feature-detect string (three.js has none of the listed ones in r185, but verify), narrow that one token rather than deleting the check. Three's `fetch` in loaders is not a URL and is fine.

- [ ] **Step 8: .gitignore** → `node_modules`, `dist`, `shots`

- [ ] **Step 9: Build and verify**

Run: `npm run build`
Expected: `postbuild OK: ...` and `dist/index.html` exists with `assets/three-*.js` and `assets/index-*.js`.

- [ ] **Step 10: Commit** `git add -A && git commit -m "chore: scaffold vite+three project with playables build guard"`

---

### Task 2: Core helpers (rng, tween)

**Files:**
- Create: `src/core/rng.js`, `src/core/tween.js`, `test/core.test.js`

**Interfaces:**
- Produces: `makeRng(seed) → { f(), r(a,b), i(a,b), pick(arr), chance(p) }`
- Produces: `clamp(v,a,b)`, `lerp(a,b,t)`, `damp(a,b,lambda,dt)`, `easeOut(t)`, `easeOutBack(t)`, `class Spring { constructor(value=0, stiffness=140, damping=16); value; target; vel; step(dt); kick(v); set(v) }`.

- [ ] **Step 1: Failing tests**

```js
// test/core.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.js';
import { clamp, lerp, damp, easeOutBack, Spring } from '../src/core/tween.js';
test('rng is deterministic and in range', () => {
  const a = makeRng(7), b = makeRng(7);
  const xs = Array.from({ length: 5 }, () => a.f());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b.f()));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  assert.ok([1, 2, 3].includes(a.pick([1, 2, 3])));
  const n = a.i(2, 4); assert.ok(n >= 2 && n <= 4 && Number.isInteger(n));
});
test('helpers', () => {
  assert.equal(clamp(5, 0, 3), 3); assert.equal(lerp(0, 10, .5), 5);
  assert.ok(Math.abs(damp(0, 10, 10, 1) - 10) < 0.01);
  assert.ok(easeOutBack(0.5) > 0.9); assert.equal(easeOutBack(1), 1);
});
test('spring settles to target', () => {
  const s = new Spring(0); s.target = 1;
  for (let i = 0; i < 300; i++) s.step(1 / 60);
  assert.ok(Math.abs(s.value - 1) < 1e-3);
  s.kick(5); assert.equal(s.vel, 5);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (modules missing).

- [ ] **Step 3: Implement**

```js
// src/core/rng.js
export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return { f, r: (lo, hi) => lo + f() * (hi - lo), i: (lo, hi) => Math.floor(lo + f() * (hi - lo + 1)), pick: arr => arr[f() * arr.length | 0], chance: p => f() < p };
}
```

```js
// src/core/tween.js
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = t => { t = clamp(t, 0, 1); const c = 1.70158, k = c + 1; return 1 + k * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export class Spring {
  constructor(value = 0, stiffness = 140, damping = 16) { this.value = value; this.target = value; this.vel = 0; this.k = stiffness; this.d = damping; }
  step(dt) { const a = (this.target - this.value) * this.k - this.vel * this.d; this.vel += a * dt; this.value += this.vel * dt; return this.value; }
  kick(v) { this.vel = v; }
  set(v) { this.value = this.target = v; this.vel = 0; }
}
```

- [ ] **Step 4: Run** `npm test` → 3 pass.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(core): rng and tween helpers"`

---

### Task 3: Economy (pure)

**Files:**
- Create: `src/sim/economy.js`, `test/economy.test.js`

**Interfaces:**
- Produces: `PRODUCTS = { cookie:{price:5,bake:1.2,color:'#D9A066'}, cupcake:{price:9,bake:1.6,color:'#FF8A80'}, smoothie:{price:16,bake:2.0,color:'#8B7CF6'} }`
- `UPGRADES = { speed:{costs:[400,900,1800]}, carry:{costs:[300,700,1500],values:[6,9,12,16]}, income:{costs:[600,1400,3000]} }`
- `playerSpeed(up) → m/s`, `carryCap(up) → int`, `incomeMult(up, boosts, now) → number`, `salePrice(productKey, up, boosts, seated, now) → int`, `upgradeCost(key, up) → int|null`
- `up` shape `{speed:0..3, carry:0..3, income:0..3}`; `boosts` shape `{x2Until: epochMs}`; `now` is passed explicitly for purity.

- [ ] **Step 1: Failing tests**

```js
// test/economy.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { playerSpeed, carryCap, incomeMult, salePrice, upgradeCost } from '../src/sim/economy.js';
const up0 = { speed: 0, carry: 0, income: 0 };
test('base values', () => {
  assert.equal(playerSpeed(up0), 3.6); assert.equal(carryCap(up0), 6);
  assert.equal(incomeMult(up0, {}, 0), 1);
  assert.equal(salePrice('cookie', up0, {}, false, 0), 5);
});
test('upgrades scale', () => {
  assert.ok(Math.abs(playerSpeed({ ...up0, speed: 2 }) - 3.6 * 1.3) < 1e-9);
  assert.equal(carryCap({ ...up0, carry: 3 }), 16);
  assert.equal(salePrice('cupcake', { ...up0, income: 1 }, {}, false, 0), Math.round(9 * 1.2));
  assert.equal(upgradeCost('speed', up0), 400); assert.equal(upgradeCost('speed', { ...up0, speed: 3 }), null);
});
test('boost and seating', () => {
  assert.equal(incomeMult(up0, { x2Until: 1000 }, 500), 2);
  assert.equal(incomeMult(up0, { x2Until: 1000 }, 1500), 1);
  assert.equal(salePrice('cookie', up0, {}, true, 0), 6);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement**

```js
// src/sim/economy.js
export const PRODUCTS = {
  cookie:   { price: 5,  bake: 1.2, color: '#D9A066' },
  cupcake:  { price: 9,  bake: 1.6, color: '#FF8A80' },
  smoothie: { price: 16, bake: 2.0, color: '#8B7CF6' },
};
export const UPGRADES = {
  speed:  { costs: [400, 900, 1800] },
  carry:  { costs: [300, 700, 1500], values: [6, 9, 12, 16] },
  income: { costs: [600, 1400, 3000] },
};
export const BASE_SPEED = 3.6;
export const playerSpeed = up => BASE_SPEED * (1 + 0.15 * (up.speed | 0));
export const carryCap = up => UPGRADES.carry.values[up.carry | 0];
export function incomeMult(up, boosts, now) {
  const x2 = boosts && boosts.x2Until > now ? 2 : 1;
  return (1 + 0.2 * (up.income | 0)) * x2;
}
export function salePrice(key, up, boosts, seated, now) {
  return Math.round(PRODUCTS[key].price * incomeMult(up, boosts, now) * (seated ? 1.2 : 1));
}
export function upgradeCost(key, up) {
  const t = up[key] | 0; const c = UPGRADES[key].costs; return t < c.length ? c[t] : null;
}
```

- [ ] **Step 4: Run** `npm test` → pass.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(sim): economy formulas"`

---

### Task 4: Area data and world state (stations, build zones)

**Files:**
- Create: `data/area1.js`, `src/sim/world.js`, `test/world.test.js`

**Interfaces:**
- `data/area1.js` exports `AREA1` (see code) and helpers `queueSlots(counterStation, n=5) → [{x,z}]`, `checkoutSpot(checkoutStation) → {x,z}`, `cashSpot(checkoutStation) → {x,z}`.
- `src/sim/world.js`:
  - `createWorld(area, save?) → world` where `world = { area, built:Set, partial:{[zoneId]:number}, stations:Map<id,StationState>, events:[] }`.
  - `StationState` common fields `{ id, type, x, z, rot, builtBy, active }`; oven adds `{ product, stock, buffer, timer }`; counter `{ items:[productKey], capacity }`; checkout `{ pile }`; seat `{ occupied }`.
  - `activeZones(world) → zone[]` (unbuilt with prerequisites met).
  - `payZone(world, zoneId, coins, dt) → { spent, done }`.
  - `stepOvens(world, dt, bakeMult=1)`, `takeFromOven(world, id, n) → int`, `putOnCounter(world, id, productKey, n) → int`, `takeFromCounter(world, id) → productKey|null`, `addCash(world, id, amt)`, `collectCash(world, id) → int`, `freeSeat(world) → seatState|null`.
  - `world.events` receives `{type:'built', zoneId}`; the render layer consumes and clears it.

- [ ] **Step 1: data/area1.js**

```js
// data/area1.js — area 1 "Café". Meters, origin at floor center. +x east, +z south (toward the camera).
export const AREA1 = {
  id: 'a1', size: { w: 16, d: 12 },
  door: { x: -7.6, z: 4.2 }, exit: { x: -7.6, z: 4.2 }, spawnStart: { x: -9.5, z: 4.2 },
  stations: [
    { id: 'oven1',     type: 'oven',     x: 5.5,  z: -4.2, rot: 0, product: 'cookie', buffer: 12 },   // rot 0: the tray faces the room (ruled during execution)
    { id: 'counter1',  type: 'counter',  x: 0.0,  z: -1.5, rot: 0, capacity: 12 },
    { id: 'counter2',  type: 'counter',  x: 3.0,  z: -1.5, rot: 0, capacity: 12, builtBy: 'z_counter2' },
    { id: 'checkout1', type: 'checkout', x: -4.0, z: -1.5, rot: 0 },
    { id: 'seat1', type: 'seat', x: -3.0, z: 3.0, rot: 0, builtBy: 'z_seats1' },
    { id: 'seat2', type: 'seat', x:  0.5, z: 3.0, rot: 0, builtBy: 'z_seats1' },
  ],
  zones: [
    { id: 'z_counter2', x: 3.0,  z: 0.6, price: 60,  adds: ['counter2'],       label: 'Counter' },
    { id: 'z_seats1',   x: -1.2, z: 3.0, price: 150, adds: ['seat1', 'seat2'], requires: 'z_counter2', label: 'Tables' },
  ],
};
export function queueSlots(st, n = 5) { return Array.from({ length: n }, (_, i) => ({ x: st.x, z: st.z + 1.3 + i * 0.9 })); }
export function checkoutSpot(st) { return { x: st.x, z: st.z + 1.3 }; }
export function cashSpot(st) { return { x: st.x - 1.2, z: st.z + 0.9 }; }
```

- [ ] **Step 2: Failing tests**

```js
// test/world.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, activeZones, payZone, stepOvens, takeFromOven, putOnCounter, takeFromCounter, addCash, collectCash, freeSeat } from '../src/sim/world.js';
test('initial world has only pre-built stations active', () => {
  const w = createWorld(AREA1);
  assert.equal(w.stations.get('oven1').active, true);
  assert.equal(w.stations.get('counter2').active, false);
  assert.deepEqual(activeZones(w).map(z => z.id), ['z_counter2']);
  assert.equal(freeSeat(w), null);
});
test('paying a zone drains and completes', () => {
  const w = createWorld(AREA1);
  const r1 = payZone(w, 'z_counter2', 1000, 0.5); // rate = max(50, 60/2) = 50/s → 25
  assert.equal(r1.spent, 25); assert.equal(r1.done, false); assert.equal(w.partial.z_counter2, 25);
  const r2 = payZone(w, 'z_counter2', 1000, 10);
  assert.equal(r2.spent, 35); assert.equal(r2.done, true);
  assert.equal(w.stations.get('counter2').active, true);
  assert.deepEqual(activeZones(w).map(z => z.id), ['z_seats1']);
  assert.deepEqual(w.events.pop(), { type: 'built', zoneId: 'z_counter2' });
});
test('pay is capped by coins', () => {
  const w = createWorld(AREA1);
  assert.equal(payZone(w, 'z_counter2', 10, 10).spent, 10);
});
test('ovens bake and counters hold', () => {
  const w = createWorld(AREA1);
  stepOvens(w, 1.2 * 3 + 0.01);
  assert.equal(w.stations.get('oven1').stock, 3);
  assert.equal(takeFromOven(w, 'oven1', 5), 3);
  assert.equal(putOnCounter(w, 'counter1', 'cookie', 3), 3);
  assert.equal(takeFromCounter(w, 'counter1'), 'cookie');
  assert.equal(w.stations.get('counter1').items.length, 2);
  addCash(w, 'checkout1', 12); assert.equal(collectCash(w, 'checkout1'), 12); assert.equal(collectCash(w, 'checkout1'), 0);
});
test('restores from save', () => {
  const w = createWorld(AREA1, { built: ['z_counter2'], partial: { z_seats1: 40 } });
  assert.equal(w.stations.get('counter2').active, true); assert.equal(w.partial.z_seats1, 40);
});
```

- [ ] **Step 3: Run** `npm test` → FAIL.

- [ ] **Step 4: Implement**

```js
// src/sim/world.js
import { PRODUCTS } from './economy.js';
export function createWorld(area, save) {
  const built = new Set(save && save.built || []);
  const partial = Object.assign({}, save && save.partial || {});
  const stations = new Map();
  for (const s of area.stations) {
    const st = { id: s.id, type: s.type, x: s.x, z: s.z, rot: s.rot || 0, builtBy: s.builtBy, active: !s.builtBy || built.has(s.builtBy) };
    if (s.type === 'oven') Object.assign(st, { product: s.product, stock: 0, buffer: s.buffer || 12, timer: 0 });
    if (s.type === 'counter') Object.assign(st, { items: [], capacity: s.capacity || 12 });
    if (s.type === 'checkout') Object.assign(st, { pile: 0 });
    if (s.type === 'seat') Object.assign(st, { occupied: false });
    stations.set(s.id, st);
  }
  return { area, built, partial, stations, events: [] };
}
export function activeZones(w) {
  return w.area.zones.filter(z => !w.built.has(z.id) && (!z.requires || w.built.has(z.requires)));
}
export function payZone(w, zoneId, coins, dt) {
  const z = w.area.zones.find(z => z.id === zoneId);
  if (!z || w.built.has(zoneId)) return { spent: 0, done: false };
  const paid = w.partial[zoneId] || 0;
  const rate = Math.max(50, z.price / 2);
  const spent = Math.max(0, Math.min(coins, z.price - paid, Math.ceil(rate * dt)));
  const total = paid + spent;
  if (total >= z.price) {
    delete w.partial[zoneId]; w.built.add(zoneId);
    for (const id of z.adds) { const st = w.stations.get(id); if (st) st.active = true; }
    w.events.push({ type: 'built', zoneId });
    return { spent, done: true };
  }
  if (spent > 0) w.partial[zoneId] = total;
  return { spent, done: false };
}
export function stepOvens(w, dt, bakeMult = 1) {
  for (const st of w.stations.values()) {
    if (st.type !== 'oven' || !st.active) continue;
    if (st.stock >= st.buffer) { st.timer = 0; continue; }
    st.timer += dt;
    const t = PRODUCTS[st.product].bake / bakeMult;
    while (st.timer >= t && st.stock < st.buffer) { st.timer -= t; st.stock++; }
  }
}
export function takeFromOven(w, id, n) { const st = w.stations.get(id); const k = Math.min(n, st.stock); st.stock -= k; return k; }
export function putOnCounter(w, id, product, n) { const st = w.stations.get(id); const k = Math.min(n, st.capacity - st.items.length); for (let i = 0; i < k; i++) st.items.push(product); return k; }
export function takeFromCounter(w, id) { const st = w.stations.get(id); return st.items.length ? st.items.shift() : null; }
export function addCash(w, id, amt) { w.stations.get(id).pile += amt; }
export function collectCash(w, id) { const st = w.stations.get(id); const p = st.pile; st.pile = 0; return p; }
export function freeSeat(w) { for (const st of w.stations.values()) if (st.type === 'seat' && st.active && !st.occupied) return st; return null; }
```

- [ ] **Step 5: Run** `npm test` → pass.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(sim): area 1 data and world state"`

---
### Task 5: Customer state machine (pure)

**Files:**
- Create: `src/sim/customers.js`, `test/customers.test.js`

**Interfaces:**
- Consumes: `world.js` (`takeFromCounter`, `addCash`, `freeSeat`), `data/area1.js` helpers (`queueSlots`, `checkoutSpot`).
- Produces:
  - `SPECIES = ['cat','dog','bunny']`, `CUSTOMER_SPEED = 1.9`, `WAIT_LIMIT = 12`, `EAT_TIME = 4`.
  - `createCustomer(id, species, area) → c` with `{ id, species, x, z, rot, state:'enter', counterId:null, slot:-1, item:null, wait:0, seat:null, timer:0, done:false, hop:0 }`.
  - `stepCustomers(list, world, price, dt)` mutates each customer; `price(productKey, seated) → int` is injected by game.js (wraps `salePrice`). Pushes to `world.events`: `{type:'took', id, product}`, `{type:'pay', id, amount, x, z, checkoutId}`, `{type:'angry', id}`, `{type:'seated', id}`, `{type:'left', id}`.
  - `moveToward(c, tx, tz, speed, dt) → bool arrived` (also sets `c.rot` to face the direction of travel).
  - Customers with `done === true` are removed by the caller.

- [ ] **Step 1: Failing tests**

```js
// test/customers.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, putOnCounter } from '../src/sim/world.js';
import { createCustomer, stepCustomers, moveToward } from '../src/sim/customers.js';
const price = (k, seated) => seated ? 6 : 5;
function run(list, w, seconds) { for (let t = 0; t < seconds; t += 1 / 30) stepCustomers(list, w, price, 1 / 30); }
test('moveToward arrives and faces direction', () => {
  const c = { x: 0, z: 0, rot: 0 };
  let arrived = false; for (let i = 0; i < 100; i++) arrived = moveToward(c, 2, 0, 2, 0.05) || arrived;
  assert.ok(arrived); assert.ok(Math.abs(c.x - 2) < 1e-6); assert.ok(Math.abs(c.rot - Math.PI / 2) < 1e-6);
});
test('customer buys, pays and leaves when no seat', () => {
  const w = createWorld(AREA1); putOnCounter(w, 'counter1', 'cookie', 5);
  const c = createCustomer(1, 'cat', AREA1); const list = [c];
  run(list, w, 25);
  const types = w.events.map(e => e.type);
  assert.ok(types.includes('took')); assert.ok(types.includes('pay')); assert.ok(types.includes('left'));
  assert.equal(w.stations.get('checkout1').pile, 5);
  assert.equal(c.done, true);
});
test('customer leaves angry after waiting at an empty counter', () => {
  const w = createWorld(AREA1);
  const c = createCustomer(2, 'dog', AREA1); const list = [c];
  run(list, w, 30);
  assert.ok(w.events.some(e => e.type === 'angry'));
  assert.equal(w.stations.get('checkout1').pile, 0); assert.equal(c.done, true);
});
test('queue slots are distinct', () => {
  const w = createWorld(AREA1);
  const list = [createCustomer(1, 'cat', AREA1), createCustomer(2, 'dog', AREA1), createCustomer(3, 'bunny', AREA1)];
  run(list, w, 6);
  const slots = list.map(c => c.slot); assert.deepEqual([...new Set(slots)].sort(), [0, 1, 2]);
});
test('seated customer pays the tip price', () => {
  const w = createWorld(AREA1, { built: ['z_counter2', 'z_seats1'] }); putOnCounter(w, 'counter1', 'cookie', 5);
  const list = [createCustomer(1, 'cat', AREA1)];
  run(list, w, 30);
  assert.ok(w.events.some(e => e.type === 'seated'));
  assert.equal(w.stations.get('checkout1').pile, 6);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement**

```js
// src/sim/customers.js — pure customer state machine. States: enter → queue → toCheckout → (toSeat → eating) → leave → done
import { takeFromCounter, addCash, freeSeat } from './world.js';
import { queueSlots, checkoutSpot } from '../../data/area1.js';
export const SPECIES = ['cat', 'dog', 'bunny'];
export const CUSTOMER_SPEED = 1.9, WAIT_LIMIT = 12, EAT_TIME = 4, SEP = 0.6;
export function createCustomer(id, species, area) {
  return { id, species, x: area.spawnStart.x, z: area.spawnStart.z, rot: 0, state: 'enter', counterId: null, slot: -1, item: null, wait: 0, seat: null, timer: 0, done: false, hop: 0, area };
}
export function moveToward(c, tx, tz, speed, dt) {
  const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return true;
  const step = speed * dt;
  c.rot = Math.atan2(dx, dz);
  if (step >= d) { c.x = tx; c.z = tz; return true; }
  c.x += dx / d * step; c.z += dz / d * step; return false;
}
function pickCounter(w, list) {
  let best = null, bestN = 1e9;
  for (const st of w.stations.values()) {
    if (st.type !== 'counter' || !st.active) continue;
    const n = list.filter(c => c.counterId === st.id && c.state === 'queue').length;
    if (n < bestN) { best = st; bestN = n; }
  }
  return best;
}
function assignSlots(list) {
  const byCounter = new Map();
  for (const c of list) if (c.state === 'queue') { if (!byCounter.has(c.counterId)) byCounter.set(c.counterId, []); byCounter.get(c.counterId).push(c); }
  for (const q of byCounter.values()) { q.sort((a, b) => a.arrived - b.arrived); q.forEach((c, i) => c.slot = i); }
}
function separate(list, dt) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]; if (a.state === 'eating' || b.state === 'eating') continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < SEP) { const p = (SEP - d) * 0.5 * Math.min(1, dt * 8); a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p; }
  }
}
let seq = 0;
export function stepCustomers(list, w, price, dt) {
  const area = list.length ? list[0].area : null; if (!area) return;
  const door = area.door;
  for (const c of list) {
    if (c.done) continue;
    c.hop = Math.max(0, c.hop - dt);
    switch (c.state) {
      case 'enter': {
        if (moveToward(c, door.x, door.z, CUSTOMER_SPEED, dt)) {
          const ct = pickCounter(w, list);
          if (!ct) { c.state = 'leave'; break; }
          c.counterId = ct.id; c.arrived = seq++; c.state = 'queue'; c.wait = 0;
        }
        break;
      }
      case 'queue': {
        const st = w.stations.get(c.counterId); const slot = queueSlots(st)[Math.min(c.slot, 4)];
        const here = moveToward(c, slot.x, slot.z, CUSTOMER_SPEED, dt);
        if (c.slot === 0 && here) {
          const item = takeFromCounter(w, c.counterId);
          if (item) { c.item = item; c.state = 'toCheckout'; c.hop = 0.4; w.events.push({ type: 'took', id: c.id, product: item }); }
          else { c.wait += dt; if (c.wait > WAIT_LIMIT) { c.state = 'leave'; w.events.push({ type: 'angry', id: c.id }); } }
        }
        break;
      }
      case 'toCheckout': {
        const co = [...w.stations.values()].find(s => s.type === 'checkout' && s.active); const spot = checkoutSpot(co);
        if (moveToward(c, spot.x, spot.z, CUSTOMER_SPEED, dt)) {
          const seat = freeSeat(w); const amt = price(c.item, !!seat);
          addCash(w, co.id, amt); w.events.push({ type: 'pay', id: c.id, amount: amt, x: co.x, z: co.z, checkoutId: co.id });
          if (seat) { seat.occupied = true; c.seat = seat; c.state = 'toSeat'; } else { c.state = 'leave'; }
        }
        break;
      }
      case 'toSeat': {
        if (moveToward(c, c.seat.x, c.seat.z + 0.7, CUSTOMER_SPEED, dt)) { c.state = 'eating'; c.timer = 0; c.rot = Math.PI; w.events.push({ type: 'seated', id: c.id }); }
        break;
      }
      case 'eating': {
        c.timer += dt; if (c.timer >= EAT_TIME) { c.seat.occupied = false; c.seat = null; c.item = null; c.state = 'leave'; c.hop = 0.5; }
        break;
      }
      case 'leave': {
        if (moveToward(c, door.x, door.z, CUSTOMER_SPEED, dt) && moveToward(c, area.spawnStart.x, area.spawnStart.z, CUSTOMER_SPEED, dt)) { c.done = true; w.events.push({ type: 'left', id: c.id }); }
        break;
      }
    }
  }
  assignSlots(list); separate(list, dt);
}
```

Correction (ruled during execution): chaining `moveToward(door) && moveToward(spawnStart)` oscillates once the customer has left the door, because the first call pulls it back. Implement `leave` as two phases with a `_doorReached` flag: walk to the door; once reached, walk to `spawnStart`, then set `done` and push `left`.

- [ ] **Step 4: Run** `npm test` → pass. If the "seated" test fails because the seat is assigned before any counter item exists, check `freeSeat` returns seats only when `active`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(sim): customer state machine"`

---

### Task 6: Palette and colored-geometry builder

**Files:**
- Create: `src/render/palette.js`, `src/render/geo.js`

**Interfaces:**
- `palette.js`: `C = { floorA:'#F3E2C7', floorB:'#EAD3B3', wall:'#BFE8D8', wallDark:'#9FD1BE', coral:'#FF8A80', cream:'#FFF4E6', wood:'#D9A066', woodDark:'#B9834A', plant:'#7BC47F', plantDark:'#5EA463', coin:'#FFD84D', accent:'#8B7CF6', ink:'#3B2E2A', street:'#CFCBC4', cash:'#7FD69A', metal:'#B8C4CC', skin:'#FFD9B3', cat:'#F5A25D', dog:'#E8C39E', bunny:'#FFFFFF', white:'#FFFFFF', pink:'#FFB3C1', black:'#2B2B2B' }`
- `toonMaterial() → MeshToonMaterial` (white, `vertexColors:true`, shared 3-step gradient map), `emissiveMaterial(hex) → MeshBasicMaterial`, `gradientMap()`.
- `geo.js`: `part(kind, dims, colorHex, xf)` where `kind ∈ 'box'|'rbox'|'cyl'|'sph'|'cone'`, `dims` per kind (`box`: `[w,h,d]`, `rbox`: `[w,h,d,radius]`, `cyl`: `[rTop,rBottom,h,seg]`, `sph`: `[r,seg]`, `cone`: `[r,h,seg]`), `xf = {x,y,z,rx,ry,rz,sx,sy,sz}`; returns a colored `BufferGeometry` already transformed. `merge(parts[]) → BufferGeometry` (`mergeGeometries`, drops uv to keep only position/normal/color). `mesh(parts[], opts?) → Mesh` with `toonMaterial()`, `castShadow`/`receiveShadow` true.

- [ ] **Step 1: palette.js**

```js
// src/render/palette.js
import * as THREE from 'three';
export const C = { floorA: '#F3E2C7', floorB: '#EAD3B3', wall: '#BFE8D8', wallDark: '#9FD1BE', coral: '#FF8A80', cream: '#FFF4E6', wood: '#D9A066', woodDark: '#B9834A', plant: '#7BC47F', plantDark: '#5EA463', coin: '#FFD84D', accent: '#8B7CF6', ink: '#3B2E2A', street: '#CFCBC4', cash: '#7FD69A', metal: '#B8C4CC', skin: '#FFD9B3', cat: '#F5A25D', dog: '#E8C39E', bunny: '#FFFFFF', white: '#FFFFFF', pink: '#FFB3C1', black: '#2B2B2B' };
let _grad = null;
export function gradientMap() {
  if (_grad) return _grad;
  const data = new Uint8Array([110, 185, 255]);           // 3 steps: shadow, mid, light
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return _grad = t;
}
let _toon = null;
export function toonMaterial() {
  if (_toon) return _toon;
  return _toon = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() });
}
// values above 1.0 with toneMapped:false are what UnrealBloomPass (threshold 0.92) picks up
export function emissiveMaterial(hex) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.6), toneMapped: false }); }
```

- [ ] **Step 2: geo.js**

```js
// src/render/geo.js — colored primitive parts merged into one geometry (one draw call per prop type)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toonMaterial } from './palette.js';
const _c = new THREE.Color();
export function colorize(g, hex) {
  const n = g.getAttribute('position').count; const arr = new Float32Array(n * 3);
  _c.set(hex); for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
export function part(kind, d, hex, xf = {}) {
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(d[0], d[1], d[2]); break;
    case 'rbox': g = new RoundedBoxGeometry(d[0], d[1], d[2], 3, d[3] ?? 0.06); break;
    case 'cyl': g = new THREE.CylinderGeometry(d[0], d[1], d[2], d[3] ?? 16); break;
    case 'sph': g = new THREE.SphereGeometry(d[0], d[1] ?? 14, (d[1] ?? 14) >> 1); break;
    case 'cone': g = new THREE.ConeGeometry(d[0], d[1], d[2] ?? 12); break;
    default: throw new Error('part kind ' + kind);
  }
  g.deleteAttribute('uv');
  if (xf.sx || xf.sy || xf.sz) g.scale(xf.sx ?? 1, xf.sy ?? 1, xf.sz ?? 1);
  if (xf.rx) g.rotateX(xf.rx); if (xf.ry) g.rotateY(xf.ry); if (xf.rz) g.rotateZ(xf.rz);
  g.translate(xf.x ?? 0, xf.y ?? 0, xf.z ?? 0);
  return colorize(g, hex);
}
export function merge(parts) { const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p), false); g.computeBoundingSphere(); return g; }
export function mesh(parts, opts = {}) {
  const m = new THREE.Mesh(merge(parts), opts.material || toonMaterial());
  m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true; return m;
}
```

- [ ] **Step 3: Quick check** — replace `src/main.js` body temporarily with a render of `mesh([part('rbox',[1,1,1,0.1],'#FF8A80')])` under a directional light; `npm run dev`, open the URL, confirm a coral rounded cube. Revert to the Task 1 placeholder afterwards (Task 10 replaces it anyway).
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(render): palette, toon material and colored geometry builder"`

---

### Task 7: Scene: renderer, lights, camera rig, sky, post, resize

**Files:**
- Create: `src/render/scene.js`

**Interfaces:**
- `createScene(canvas) → S` with `S = { renderer, scene, camera, sun, composer, target:Vector3, follow(x, z, dt), resize(), render(), setQuality(q) }`.
- Camera: perspective fov 40; yaw fixed at +35° (camera south-east of the target, looking north-west), pitch 52°; screen-up maps to world `(-sin YAW, -cos YAW)` and screen-right to `(cos YAW, -sin YAW)` (used by input.js); distance computed so the visible width at the target is ≥ 12 m in portrait, ≥ 20 m in landscape (`aspect > 1.25`), else 15 m. `follow` damps the target with λ = 6.
- Sun: `DirectionalLight` warm `#FFF1D6` intensity 2.6, position offset `(6, 12, 4)` from the target, `castShadow`, ortho box ±14, `mapSize` 2048 (1024 under 700 px width), `bias -0.0004`, `normalBias 0.02`. Hemisphere `#FFF7EA` / `#F2C9A8` intensity 0.9. The sun and its target move with the follow target so shadows never leave the frame.
- Sky: inverted sphere radius 90 with vertex gradient (`#CFEFFF` zenith → `#FFF4E6` horizon), `MeshBasicMaterial` `vertexColors`, `side: BackSide`, `fog: false`, `depthWrite: false`.
- Post: none (ruled during execution: three's EffectComposer instantiates `Timer`, whose `visibilitychange` listener the build guard and the spec forbid). `S.render()` calls `renderer.render(scene, camera)`; `S.setQuality(q)` toggles `renderer.shadowMap.enabled`. `renderer.toneMapping = ACESFilmicToneMapping`, `toneMappingExposure 1.05`, `shadowMap.type = PCFSoftShadowMap`, pixel ratio `min(devicePixelRatio, 2)`. A Timer-free mini composer with bloom is a polish-milestone option.

- [ ] **Step 1: Implement**

```js
// src/render/scene.js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { damp } from '../core/tween.js';
const YAW = 35 * Math.PI / 180, PITCH = 52 * Math.PI / 180, FOV = 40;   // camera sits south-east of the target (+x,+z), so the west door wall and north wall are at the back
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;   // variant B, ruled during execution
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
  // sky dome
  { const g = new THREE.SphereGeometry(90, 24, 12); const n = g.getAttribute('position').count; const col = new Float32Array(n * 3);
    const top = new THREE.Color('#CFEFFF'), hor = new THREE.Color('#FFF4E6'), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const y = g.getAttribute('position').getY(i) / 90; c.copy(hor).lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.1))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false })); sky.renderOrder = -1; scene.add(sky); }
  const hemi = new THREE.HemisphereLight('#FFF7EA', '#F2C9A8', 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF1D6', 1.6); sun.castShadow = true;
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.mapSize.set(innerWidth < 700 ? 1024 : 2048, innerWidth < 700 ? 1024 : 2048);
  scene.add(sun); scene.add(sun.target);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 0.92); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const target = new THREE.Vector3(0, 0, 0), goal = new THREE.Vector3();
  const S = { renderer, scene, camera, sun, composer, target, bloom, dist: 20 };
  S.resize = () => {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const want = camera.aspect > 1.25 ? 20 : camera.aspect < 0.8 ? 12 : 15;
    S.dist = want / (2 * Math.tan(FOV * Math.PI / 360) * camera.aspect);
    place();
  };
  function place() {
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    camera.position.set(target.x + Math.sin(YAW) * cp * S.dist, target.y + sp * S.dist, target.z + Math.cos(YAW) * cp * S.dist);
    camera.lookAt(target.x, target.y + 0.4, target.z);
    sun.position.set(target.x + 6, target.y + 12, target.z + 4); sun.target.position.copy(target);
  }
  S.follow = (x, z, dt) => { goal.set(x, 0, z); target.x = damp(target.x, goal.x, 6, dt); target.z = damp(target.z, goal.z, 6, dt); place(); };
  S.snap = (x, z) => { target.set(x, 0, z); place(); };
  S.render = () => composer.render();
  S.setQuality = q => { bloom.enabled = q !== 'low'; };
  addEventListener('resize', S.resize); S.resize();
  return S;
}
```

- [ ] **Step 2: Quick check** — in `src/main.js`, create the scene, add `mesh([part('rbox',[16,0.4,12,0.08],'#F3E2C7'),{y:-0.2}])` (floor) and a coral cube at origin; confirm warm light, a soft shadow under the cube and a sky gradient at the horizon in `npm run dev`.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat(render): scene, lights, camera rig, sky and bloom"`

---

### Task 8: Café props (floor, walls, awning, stations, plants, build ring, cash pile)

**Files:**
- Create: `src/render/props.js`

**Interfaces:**
- `buildStatic(area) → Group` — floor, walls, door gap, street strip, awning, windows, corner plants. One merged mesh for the whole static set (single draw call) plus the awning as a second mesh.
- Station factories, each `→ Group` centered at its own origin with +z as its front: `ovenMesh()`, `counterMesh()`, `checkoutMesh()`, `tableMesh()`.
- `counterMesh().slots` — array of 12 `Vector3` local positions where display items sit (3 × 4 grid on top). `ovenMesh().outSlot` — local `Vector3` where baked items stack.
- `itemMesh(colorHex) → Mesh` small rounded box 0.28 × 0.16 × 0.28 (the carried/displayed treat). Items are cloned from a per-product cache: `itemFor(productKey)`.
- `zoneRing() → Group` with `ring` (flat torus, accent color, emissive), `disc` (accent at 35 % opacity), `fill` (a second disc scaled by progress via `zone.setProgress(t)`), `zone.setProgress(t)`; `zone.pulse` (Spring) exposed for game.js.
- `cashPile(max=60) → InstancedMesh` of small green bills (`0.32 × 0.04 × 0.18`) with `pile.setCount(n)` laying them in a 4 × 4 footprint, stacked, slight random yaw per bill.

- [ ] **Step 1: Implement**

```js
// src/render/props.js
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial } from './palette.js';
import { PRODUCTS } from '../sim/economy.js';
import { Spring } from '../core/tween.js';

export function buildStatic(area) {
  const W = area.size.w, D = area.size.d, P = [];
  // floor tiles (1 m checker) — merged
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++)
    P.push(part('box', [0.98, 0.3, 0.98], (x + z) & 1 ? C.floorA : C.floorB, { x: x - W / 2 + 0.5, y: -0.15, z: z - D / 2 + 0.5 }));
  P.push(part('rbox', [W + 0.6, 0.5, D + 0.6, 0.12], C.wood, { y: -0.45 }));                         // wooden plinth
  P.push(part('box', [W + 8, 0.2, 6], C.street, { y: -0.35, z: -D / 2 - 3 }));                        // street north
  P.push(part('box', [6, 0.2, D + 8], C.street, { x: -W / 2 - 3, y: -0.35 }));                          // street west
  // north wall with three windows, west wall with a door gap
  P.push(part('box', [W, 3, 0.4], C.wall, { y: 1.5, z: -D / 2 }));
  for (const x of [-5, 0, 5]) { P.push(part('box', [1.8, 1.3, 0.5], '#DDF6FF', { x, y: 1.7, z: -D / 2 })); P.push(part('box', [2.0, 0.12, 0.6], C.cream, { x, y: 1.0, z: -D / 2 })); }
  const dz = area.door.z;                                                                                 // door gap is 2.4 m centred on door.z (ruled during execution)
  P.push(part('box', [0.4, 3, (dz - 1.2) + D / 2], C.wall, { x: -W / 2, y: 1.5, z: ((dz - 1.2) + (-D / 2)) / 2 }));   // west wall north part
  P.push(part('box', [0.4, 3, D / 2 - (dz + 1.2)], C.wall, { x: -W / 2, y: 1.5, z: ((dz + 1.2) + D / 2) / 2 }));      // west wall south part
  P.push(part('box', [0.4, 0.6, 2.4], C.wall, { x: -W / 2, y: 2.7, z: area.door.z }));                   // lintel
  P.push(part('box', [0.3, 3.2, 0.3], C.woodDark, { x: -W / 2, y: 1.6, z: area.door.z - 1.3 }));
  P.push(part('box', [0.3, 3.2, 0.3], C.woodDark, { x: -W / 2, y: 1.6, z: area.door.z + 1.3 }));
  P.push(part('box', [0.4, 0.5, (dz - 1.2) + D / 2], C.wallDark, { x: -W / 2, y: 0.25, z: ((dz - 1.2) + (-D / 2)) / 2 }));   // skirting (split at the door)
  P.push(part('box', [0.4, 0.5, D / 2 - (dz + 1.2)], C.wallDark, { x: -W / 2, y: 0.25, z: ((dz + 1.2) + D / 2) / 2 }));
  P.push(part('box', [W, 0.5, 0.4], C.wallDark, { y: 0.25, z: -D / 2 }));
  // low fence on the east and south edges
  for (let z = -D / 2; z <= D / 2; z += 1.5) P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x: W / 2, y: 0.45, z }));
  P.push(part('box', [0.1, 0.12, D], C.cream, { x: W / 2, y: 0.8 }));
  for (let x = -W / 2; x <= W / 2; x += 1.5) P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x, y: 0.45, z: D / 2 }));
  P.push(part('box', [W, 0.12, 0.1], C.cream, { y: 0.8, z: D / 2 }));
  // corner plants
  for (const [x, z] of [[W / 2 - 0.8, -D / 2 + 0.8], [W / 2 - 0.8, D / 2 - 0.8], [-W / 2 + 0.8, D / 2 - 0.8]]) {
    P.push(part('cyl', [0.32, 0.26, 0.5, 10], C.coral, { x, y: 0.25, z }));
    P.push(part('sph', [0.55, 10], C.plant, { x, y: 0.95, z })); P.push(part('sph', [0.38, 10], C.plantDark, { x: x + 0.25, y: 1.25, z: z - 0.1 }));
  }
  const g = new THREE.Group(); g.add(mesh(P));
  // awning over the counters: striped, angled
  const A = [];
  for (let i = 0; i < 10; i++) A.push(part('box', [1.0, 0.06, 2.2], i & 1 ? C.cream : C.coral, { x: -5.5 + i * 1.0 + 0.5, y: 0, z: 0 }));
  A.push(part('box', [10, 0.1, 0.25], C.coral, { y: -0.05, z: 1.1 }));
  const aw = mesh(A); aw.position.set(0.5, 2.9, -D / 2 + 1.2); aw.rotation.x = 0.35; g.add(aw);
  for (const x of [-4.5, 5.5]) { const pole = mesh([part('cyl', [0.06, 0.06, 2.9, 8], C.metal)]); pole.position.set(x, 1.45, -D / 2 + 2.2); g.add(pole); }
  return g;
}

export function counterMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [2.4, 1.0, 1.0, 0.08], C.cream, { y: 0.5 }),
    part('box', [2.5, 0.12, 1.1], C.wood, { y: 1.02 }),
    part('box', [2.2, 0.5, 0.06], C.coral, { y: 0.5, z: 0.52 }),
    part('box', [2.2, 0.55, 0.9], '#DDF6FF', { y: 1.4, z: -0.02 }),        // glass display
    part('box', [2.3, 0.06, 1.0], C.wood, { y: 1.7 }),
  ]));
  g.slots = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.slots.push(new THREE.Vector3(-0.7 + c * 0.7, 1.16 + Math.floor(r / 3) * 0.2, -0.3 + (r % 3) * 0.3));
  return g;
}
export function ovenMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.6, 1.3, 1.2, 0.08], C.metal, { y: 0.65 }),
    part('box', [1.1, 0.6, 0.05], C.ink, { y: 0.65, z: 0.6 }),
    part('box', [1.0, 0.5, 0.02], '#FFB06B', { y: 0.65, z: 0.63 }),        // warm window
    part('box', [1.7, 0.1, 1.3], C.woodDark, { y: 1.35 }),
    part('cyl', [0.12, 0.12, 0.9, 8], C.ink, { x: 0.4, y: 1.85, z: -0.3 }),
    part('box', [0.9, 0.1, 0.5], C.wood, { y: 0.35, z: 0.95 }),            // output tray
  ]));
  g.outSlot = new THREE.Vector3(0, 0.45, 0.95);
  return g;
}
export function checkoutMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.6, 1.0, 0.9, 0.08], C.accent, { y: 0.5 }),
    part('box', [1.7, 0.12, 1.0], C.wood, { y: 1.02 }),
    part('rbox', [0.6, 0.5, 0.4, 0.05], C.ink, { x: 0.3, y: 1.3, z: -0.1 }),
    part('box', [0.5, 0.35, 0.05], '#9BF6FF', { x: 0.3, y: 1.32, z: 0.11 }),
  ]));
  return g;
}
export function tableMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.7, 0.7, 0.08, 16], C.wood, { y: 0.72 }), part('cyl', [0.08, 0.12, 0.7, 8], C.woodDark, { y: 0.36 }),
    part('cyl', [0.45, 0.45, 0.06, 12], C.woodDark, { y: 0.03 }),
    part('rbox', [0.5, 0.1, 0.5, 0.04], C.coral, { y: 0.42, z: 0.75 }), part('box', [0.45, 0.6, 0.08], C.coral, { y: 0.7, z: 0.98 }),
    part('cyl', [0.04, 0.04, 0.4, 6], C.woodDark, { x: 0.18, y: 0.2, z: 0.6 }), part('cyl', [0.04, 0.04, 0.4, 6], C.woodDark, { x: -0.18, y: 0.2, z: 0.6 }),
  ]));
  return g;
}
const _itemGeo = new Map();
export function itemFor(key) {
  if (!_itemGeo.has(key)) _itemGeo.set(key, merge([part('rbox', [0.28, 0.16, 0.28, 0.05], PRODUCTS[key].color), part('sph', [0.07, 8], C.cream, { y: 0.1 })]));
  const m = new THREE.Mesh(_itemGeo.get(key), toonMaterial()); m.castShadow = true; return m;
}
export function zoneRing() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 40), emissiveMaterial(C.accent)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.accent), transparent: true, opacity: 0.35 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; g.add(disc);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.coin), transparent: true, opacity: 0.8 })); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.025; fill.scale.setScalar(0.001); g.add(fill);
  g.ring = ring; g.pulse = new Spring(1, 120, 10);
  g.setProgress = t => fill.scale.setScalar(Math.max(0.001, t));
  return g;
}
export function cashPile(max = 60) {
  const geo = new THREE.BoxGeometry(0.32, 0.04, 0.18); const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(C.cash) });
  const im = new THREE.InstancedMesh(geo, mat, max); im.castShadow = true; im.count = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  im.setCount = n => {
    n = Math.min(max, n | 0);
    for (let i = 0; i < n; i++) { const col = i % 4, row = (i >> 2) % 4, lvl = i >> 4; p.set(-0.55 + col * 0.36, 0.02 + lvl * 0.045, -0.3 + row * 0.2); e.set(0, ((i * 7919) % 17) / 17 * 0.5 - 0.25, 0); q.setFromEuler(e); m.compose(p, q, s); im.setMatrixAt(i, m); }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  };
  return im;
}
```

- [ ] **Step 2: Quick check** — in `main.js` add `buildStatic(AREA1)` plus one of each station at their area positions (`g.position.set(st.x,0,st.z); g.rotation.y = st.rot`), a `zoneRing()` at the first zone, and `cashPile().setCount(30)` at `cashSpot(checkout)`. Take a screenshot via `npm run dev` and eyeball: awning stripes above the counters, windows on the back wall, door gap on the west wall, checker floor, plants in corners.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat(render): café static set and station props"`

---
### Task 9: Input (floating joystick + keyboard) and the owner character

**Files:**
- Create: `src/core/input.js`, `src/render/owner.js`

**Interfaces:**
- `createInput(joyEl, knobEl) → I` with `I.x, I.z` (world-space move vector, length ≤ 1), `I.active`, `I.dispose()`. Pointer events bind on `window`; a pointerdown on a `button` or inside `.pill` is ignored. Keyboard: W/A/S/D and arrows. Esc is never `preventDefault`ed.
- `createOwner() → O` with `O.group` (Group; feet at y=0), `O.items` (array of item meshes), `O.addItem(mesh)`, `O.popItem() → mesh|null`, `O.update(dt, vx, vz)` (walk cycle from speed, facing from velocity, stack sway), `O.headTop` = 1.78.

- [ ] **Step 1: input.js**

```js
// src/core/input.js — floating joystick (touch/mouse) + keyboard → world move vector
const YAW = 35 * Math.PI / 180, DEAD = 8, FULL = 48;
const RX = Math.cos(YAW), RZ = -Math.sin(YAW), FX = -Math.sin(YAW), FZ = -Math.cos(YAW); // screen right / screen up in world xz
export function createInput(joyEl, knobEl) {
  const I = { x: 0, z: 0, active: false };
  let pid = -1, ox = 0, oy = 0, jx = 0, jy = 0; const keys = new Set();
  const isUi = t => t && (t.closest && (t.closest('button') || t.closest('.pill') || t.closest('.sheet') || t.closest('.card')));
  const down = e => { if (pid !== -1 || isUi(e.target)) return; pid = e.pointerId; ox = e.clientX; oy = e.clientY; jx = jy = 0;
    joyEl.style.left = ox + 'px'; joyEl.style.top = oy + 'px'; joyEl.classList.remove('hidden'); knobEl.style.transform = 'translate(-50%,-50%)'; };
  const move = e => { if (e.pointerId !== pid) return; let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
    if (d > FULL) { dx *= FULL / d; dy *= FULL / d; } knobEl.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
    const m = d < DEAD ? 0 : Math.min(1, (d - DEAD) / (FULL - DEAD)); jx = d ? dx / d * m : 0; jy = d ? dy / d * m : 0; };
  const up = e => { if (e.pointerId !== pid) return; pid = -1; jx = jy = 0; joyEl.classList.add('hidden'); };
  addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  const kd = e => { if (!e.repeat) keys.add(e.code); }, ku = e => keys.delete(e.code);
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', () => keys.clear());
  I.update = () => {
    let sx = jx, sy = jy;
    if (pid === -1) { sx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      sy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; } }
    I.x = RX * sx - FX * sy; I.z = RZ * sx - FZ * sy; I.active = (sx || sy) !== 0;
  };
  I.dispose = () => { removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  return I;
}
```

Note: screen up (`sy < 0`) must move the owner "into" the screen: `I.x = RX*sx + FX*(-sy)`, which is what the two lines compute.

- [ ] **Step 2: owner.js**

```js
// src/render/owner.js — blocky café owner with a head stack
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { C } from './palette.js';
import { damp } from '../core/tween.js';
export function createOwner() {
  const group = new THREE.Group();
  const legL = mesh([part('rbox', [0.22, 0.5, 0.26, 0.06], C.ink, { y: 0.25 })]); legL.position.x = -0.16;
  const legR = mesh([part('rbox', [0.22, 0.5, 0.26, 0.06], C.ink, { y: 0.25 })]); legR.position.x = 0.16;
  const body = mesh([
    part('rbox', [0.7, 0.7, 0.5, 0.1], C.coral, { y: 0.85 }),
    part('rbox', [0.5, 0.55, 0.08, 0.04], C.cream, { y: 0.78, z: 0.26 }),      // apron
    part('rbox', [0.18, 0.5, 0.18, 0.06], C.coral, { x: -0.48, y: 0.85 }), part('rbox', [0.18, 0.5, 0.18, 0.06], C.coral, { x: 0.48, y: 0.85 }),
    part('sph', [0.1, 8], C.skin, { x: -0.48, y: 0.56 }), part('sph', [0.1, 8], C.skin, { x: 0.48, y: 0.56 }),
  ]);
  const head = mesh([
    part('rbox', [0.62, 0.58, 0.58, 0.16], C.skin, { y: 0 }),
    part('sph', [0.05, 8], C.ink, { x: -0.13, y: 0.05, z: 0.29 }), part('sph', [0.05, 8], C.ink, { x: 0.13, y: 0.05, z: 0.29 }),
    part('sph', [0.05, 8], C.pink, { x: -0.24, y: -0.06, z: 0.27 }), part('sph', [0.05, 8], C.pink, { x: 0.24, y: -0.06, z: 0.27 }),
    part('cyl', [0.3, 0.32, 0.12, 12], C.cream, { y: 0.33 }), part('sph', [0.3, 12], C.cream, { y: 0.48, sy: 0.7 }),   // chef hat
  ]);
  head.position.y = 1.48;
  group.add(legL, legR, body, head);
  const stack = new THREE.Group(); stack.position.y = 1.85; group.add(stack);
  const O = { group, items: [], headTop: 1.85, _t: 0, _face: 0, _sway: { x: 0, z: 0 }, _bob: 0 };
  O.addItem = m => { m.position.set(0, O.items.length * 0.17, 0); m.scale.setScalar(0.01); stack.add(m); O.items.push(m); O._bob = 1; };
  O.popItem = () => { const m = O.items.pop(); if (m) stack.remove(m); return m; };
  O.update = (dt, vx, vz) => {
    const sp = Math.hypot(vx, vz); const moving = sp > 0.05;
    if (moving) O._face = Math.atan2(vx, vz);
    let d = O._face - group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); group.rotation.y += d * Math.min(1, dt * 14);
    O._t += dt * (moving ? 11 : 0); const sw = Math.sin(O._t) * (moving ? 0.6 : 0);
    legL.rotation.x = sw; legR.rotation.x = -sw; body.position.y = Math.abs(Math.sin(O._t)) * 0.05; head.position.y = 1.48 + body.position.y;
    // stack sway: lags the velocity in the owner's local frame
    const lx = Math.cos(-group.rotation.y) * vx - Math.sin(-group.rotation.y) * vz, lz = Math.sin(-group.rotation.y) * vx + Math.cos(-group.rotation.y) * vz;
    O._sway.x = damp(O._sway.x, -lx * 0.06, 8, dt); O._sway.z = damp(O._sway.z, -lz * 0.06, 8, dt);
    O._bob = Math.max(0, O._bob - dt * 4);
    for (let i = 0; i < O.items.length; i++) { const m = O.items[i]; const k = i + 1;
      m.position.x = O._sway.x * k; m.position.z = O._sway.z * k; m.position.y = i * 0.17 + body.position.y + Math.sin(O._bob * Math.PI) * 0.06 * (i === O.items.length - 1 ? 1 : 0);
      m.rotation.z = O._sway.x * 1.5; m.rotation.x = -O._sway.z * 1.5;
      const s = m.scale.x; if (s < 1) m.scale.setScalar(Math.min(1, s + dt * 8)); }
  };
  return O;
}
```

- [ ] **Step 3: Quick check** — in `main.js` add the owner at origin and move it with the joystick using `createInput` (`pos += I * 3.6 * dt`, then `S.follow`). Confirm: dragging up moves the character away from the camera along the floor's north-west diagonal, legs swing, the camera follows smoothly.
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat: floating joystick input and owner character"`

---

### Task 10: Pets (cat, dog, bunny) with procedural animation

**Files:**
- Create: `src/render/pets.js`

**Interfaces:**
- `createPet(species) → P` with `P.group` (feet at y=0, faces +z), `P.update(dt, moving, hop, waiting)`, `P.setMood(m)` where `m ∈ 'none'|'wait'|'angry'|'happy'` (shows a small bubble above the head: white dots, red mark, or pink heart), `P.height` (head top y) for hearts/labels.
- `P.carry(mesh|null)` puts an item mesh in the pet's mouth position.

- [ ] **Step 1: Implement**

```js
// src/render/pets.js — blocky pets from primitives. All share one toon material.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { C, emissiveMaterial } from './palette.js';
const SPEC = {
  cat:   { body: C.cat,   belly: C.cream, ear: 'cone',  earCol: C.cat,   tail: 'long',  eye: C.ink, w: 0.5, h: 0.42, l: 0.8 },
  dog:   { body: C.dog,   belly: C.cream, ear: 'flop',  earCol: '#C8A078', tail: 'short', eye: C.ink, w: 0.56, h: 0.48, l: 0.9 },
  bunny: { body: C.bunny, belly: C.pink,  ear: 'tall',  earCol: C.pink,  tail: 'puff',  eye: C.ink, w: 0.46, h: 0.4, l: 0.7 },
};
export function createPet(species) {
  const s = SPEC[species] || SPEC.cat; const group = new THREE.Group();
  const legs = [];
  for (const [x, z] of [[-s.w * 0.32, s.l * 0.3], [s.w * 0.32, s.l * 0.3], [-s.w * 0.32, -s.l * 0.3], [s.w * 0.32, -s.l * 0.3]]) {
    const l = mesh([part('rbox', [0.14, 0.3, 0.14, 0.05], s.body, { y: 0.15 })]); l.position.set(x, 0, z); group.add(l); legs.push(l); }
  const body = mesh([
    part('rbox', [s.w, s.h, s.l, 0.12], s.body, { y: 0.3 + s.h / 2 }),
    part('rbox', [s.w * 0.7, s.h * 0.5, s.l * 0.7, 0.08], s.belly, { y: 0.3 + s.h * 0.35, z: 0.02 }),
  ]);
  const headParts = [
    part('rbox', [s.w * 1.1, s.w * 0.95, s.w * 0.95, 0.14], s.body, { y: 0 }),
    part('sph', [0.055, 8], s.eye, { x: -s.w * 0.25, y: 0.06, z: s.w * 0.47 }), part('sph', [0.055, 8], s.eye, { x: s.w * 0.25, y: 0.06, z: s.w * 0.47 }),
    part('sph', [0.045, 8], C.pink, { y: -0.08, z: s.w * 0.5 }),
    part('rbox', [s.w * 0.5, s.w * 0.28, s.w * 0.3, 0.06], s.belly, { y: -0.12, z: s.w * 0.4 }),    // muzzle
  ];
  if (s.ear === 'cone') { headParts.push(part('cone', [0.12, 0.26, 4], s.earCol, { x: -s.w * 0.32, y: s.w * 0.55, ry: Math.PI / 4 }), part('cone', [0.12, 0.26, 4], s.earCol, { x: s.w * 0.32, y: s.w * 0.55, ry: Math.PI / 4 })); }
  if (s.ear === 'tall') { headParts.push(part('rbox', [0.14, 0.55, 0.08, 0.04], s.body, { x: -s.w * 0.25, y: s.w * 0.7, rz: 0.15 }), part('rbox', [0.14, 0.55, 0.08, 0.04], s.body, { x: s.w * 0.25, y: s.w * 0.7, rz: -0.15 }), part('rbox', [0.07, 0.4, 0.03, 0.02], s.earCol, { x: -s.w * 0.25, y: s.w * 0.72, z: 0.04, rz: 0.15 }), part('rbox', [0.07, 0.4, 0.03, 0.02], s.earCol, { x: s.w * 0.25, y: s.w * 0.72, z: 0.04, rz: -0.15 })); }
  const head = mesh(headParts); head.position.set(0, 0.3 + s.h + s.w * 0.35, s.l * 0.45);
  const ears = [];
  if (s.ear === 'flop') for (const sx of [-1, 1]) { const e = mesh([part('rbox', [0.1, 0.36, 0.2, 0.04], s.earCol, { y: -0.16 })]); e.position.set(sx * s.w * 0.58, s.w * 0.4, 0); head.add(e); ears.push(e); }
  let tail;
  if (s.tail === 'long') tail = mesh([part('cyl', [0.05, 0.07, 0.6, 8], s.body, { y: 0.3, rx: 0.5 })]);
  else if (s.tail === 'short') tail = mesh([part('cyl', [0.05, 0.06, 0.3, 8], s.body, { y: 0.15, rx: 0.9 })]);
  else tail = mesh([part('sph', [0.12, 8], C.white)]);
  tail.position.set(0, 0.3 + s.h * 0.6, -s.l * 0.5); group.add(body, head, tail);
  // mood bubble
  const bubble = new THREE.Group(); bubble.position.set(0, head.position.y + s.w * 0.9, 0); bubble.visible = false; group.add(bubble);
  const bWait = mesh([part('sph', [0.06, 8], C.white, { x: -0.15 }), part('sph', [0.06, 8], C.white), part('sph', [0.06, 8], C.white, { x: 0.15 })], { cast: false });
  const bAngry = mesh([part('rbox', [0.08, 0.3, 0.08, 0.03], '#FF3B3B', { y: 0.05 }), part('sph', [0.06, 8], '#FF3B3B', { y: -0.2 })], { cast: false });
  const bHappy = new THREE.Mesh(heartGeo(), emissiveMaterial(C.coral)); bHappy.scale.setScalar(0.5);
  bubble.add(bWait, bAngry, bHappy);
  const mouth = new THREE.Group(); mouth.position.set(0, -0.05, s.w * 0.7); head.add(mouth);
  const P = { group, height: head.position.y + s.w * 0.6, _t: Math.random() * 6, _mood: 'none', _carried: null };
  P.setMood = m => { P._mood = m; bubble.visible = m !== 'none'; bWait.visible = m === 'wait'; bAngry.visible = m === 'angry'; bHappy.visible = m === 'happy'; };
  P.carry = m => { if (P._carried) mouth.remove(P._carried); P._carried = m; if (m) { m.position.set(0, 0, 0); m.scale.setScalar(0.8); mouth.add(m); } };
  P.update = (dt, moving, hop) => {
    P._t += dt * (moving ? 12 : 2);
    const sw = moving ? Math.sin(P._t) * 0.7 : 0;
    legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
    body.position.y = moving ? Math.abs(Math.sin(P._t)) * 0.04 : 0;
    tail.rotation.y = Math.sin(P._t * 1.3) * 0.5; tail.rotation.x = Math.sin(P._t * 0.7) * 0.2;
    for (const e of ears) e.rotation.x = Math.sin(P._t) * 0.25;
    head.rotation.z = Math.sin(P._t * 0.5) * 0.05;
    group.position.y = hop > 0 ? Math.sin(Math.min(1, hop / 0.4) * Math.PI) * 0.35 : 0;
    bubble.rotation.y += dt * 2; bubble.position.y = P.height + 0.25 + Math.sin(P._t * 0.8) * 0.04;
  };
  return P;
}
let _heart = null;
export function heartGeo() {
  if (_heart) return _heart;
  const sh = new THREE.Shape(); sh.moveTo(0, -0.5); sh.bezierCurveTo(-0.9, 0.2, -0.5, 0.9, 0, 0.45); sh.bezierCurveTo(0.5, 0.9, 0.9, 0.2, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }); g.center(); g.deleteAttribute('uv');
  return _heart = g;
}
```

- [ ] **Step 2: Quick check** — place the three pets side by side in `main.js`, call `P.update(dt, true, 0)`. Confirm each species reads at a glance (pointed ears + long tail = cat, floppy ears = dog, tall ears + puff = bunny), legs alternate diagonally, tails wag.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat(render): procedural pets with animation and mood bubbles"`

---

### Task 11: FX (particles, coin arcs, floating numbers) and HUD

**Files:**
- Create: `src/render/fx.js`, `src/ui/hud.js`

**Interfaces:**
- `createFx(scene, camera, fxLayerEl, walletEl) → F`:
  - `F.burst(x, y, z, hex, n=12)` instanced sphere particles with gravity, life 0.6 s, pool 300.
  - `F.hearts(x, y, z, n=3)` rising heart meshes (uses `heartGeo`), life 1.2 s, pool 24.
  - `F.coinArc(x, y, z, n)` DOM coin dots that fly from the projected world point to the wallet element over 0.55 s, staggered 40 ms; calls `onArrive` once when the first lands (game.js uses it to bump the wallet counter).
  - `F.number(x, y, z, text)` DOM floating number at the projected point.
  - `F.update(dt)`; `F.project(x, y, z, out)` → `{sx, sy, visible}`.
- `createHud(root) → H`: `H.setCoins(n)` (rolling counter over 0.35 s, `#walletNum`), `H.bump()` (wallet scale pop), `H.hint(text|null)`, `H.show()`, `H.walletEl`.

- [ ] **Step 1: fx.js**

```js
// src/render/fx.js
import * as THREE from 'three';
import { heartGeo } from './pets.js';
import { emissiveMaterial } from './palette.js';
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
export function createFx(scene, camera, layer, walletEl) {
  const MAXP = 300; const parts = [];
  const pm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), MAXP);
  pm.count = 0; pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3); scene.add(pm);
  const hearts = []; const hg = heartGeo(); const hm = emissiveMaterial('#FF8A80');
  const F = { camera };
  F.project = (x, y, z, out) => { _v.set(x, y, z).project(camera); out.sx = (_v.x * 0.5 + 0.5) * innerWidth; out.sy = (-_v.y * 0.5 + 0.5) * innerHeight; out.visible = _v.z < 1; return out; };
  F.burst = (x, y, z, hex, n = 12) => { const c = new THREE.Color(hex);
    for (let i = 0; i < n && parts.length < MAXP; i++) { const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 2.5, vz: Math.sin(a) * sp, life: 0.6, r: c.r, g: c.g, b: c.b, sz: 0.6 + Math.random() * 0.8 }); } };
  F.hearts = (x, y, z, n = 3) => { for (let i = 0; i < n && hearts.length < 24; i++) { const m = new THREE.Mesh(hg, hm); m.scale.setScalar(0.18); m.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.3); scene.add(m); hearts.push({ m, life: 1.2, vx: (Math.random() - 0.5) * 0.4 }); } };
  const tmp = { sx: 0, sy: 0, visible: true };
  F.coinArc = (x, y, z, n = 6, onArrive) => { F.project(x, y, z, tmp); const r = walletEl.getBoundingClientRect(); const tx = r.left + 24, ty = r.top + r.height / 2; let first = true;
    for (let i = 0; i < Math.min(n, 12); i++) { const d = document.createElement('div'); d.className = 'fcoin';
      const sx = tmp.sx + (Math.random() - 0.5) * 40, sy = tmp.sy + (Math.random() - 0.5) * 40; d.style.left = sx + 'px'; d.style.top = sy + 'px'; layer.appendChild(d);
      setTimeout(() => { d.style.transition = 'left .55s cubic-bezier(.3,-.3,.6,1), top .55s cubic-bezier(.4,.2,.2,1), transform .55s'; d.style.left = tx + 'px'; d.style.top = ty + 'px'; d.style.transform = 'translate(-50%,-50%) scale(.6)'; }, 20 + i * 40);
      setTimeout(() => { d.remove(); if (first && onArrive) { first = false; onArrive(); } }, 600 + i * 40); } };
  F.number = (x, y, z, text) => { F.project(x, y, z, tmp); if (!tmp.visible) return; const d = document.createElement('div'); d.className = 'fnum'; d.textContent = text; d.style.left = tmp.sx + 'px'; d.style.top = tmp.sy + 'px'; layer.appendChild(d); setTimeout(() => d.remove(), 950); };
  F.update = dt => {
    let k = 0;
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      _p.set(p.x, p.y, p.z); _s.setScalar(p.sz * Math.min(1, p.life * 3)); _m.compose(_p, _q, _s); pm.setMatrixAt(k, _m); pm.setColorAt(k, _c.setRGB(p.r, p.g, p.b)); k++; }
    pm.count = k; if (k) { pm.instanceMatrix.needsUpdate = true; pm.instanceColor.needsUpdate = true; }
    for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h.life -= dt; if (h.life <= 0) { scene.remove(h.m); hearts.splice(i, 1); continue; }
      h.m.position.y += dt * 0.9; h.m.position.x += h.vx * dt; h.m.rotation.y += dt * 3; h.m.scale.setScalar(0.18 * Math.min(1, h.life * 2)); h.m.lookAt(camera.position); }
  };
  return F;
}
```

Add to `src/style.css`:

```css
.fcoin{position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6b0,#FFD84D 60%,#e0a800);transform:translate(-50%,-50%);box-shadow:0 2px 4px #0003}
```

- [ ] **Step 2: hud.js**

```js
// src/ui/hud.js
export function createHud() {
  const $ = id => document.getElementById(id);
  const hud = $('hud'), num = $('walletNum'), wallet = $('wallet'), hint = $('hint');
  let shown = 0, target = 0, from = 0, t0 = 0;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const H = { walletEl: wallet, coins: 0 };
  H.setCoins = n => { from = shown; target = n; t0 = performance.now(); };
  H.bump = () => { wallet.style.transform = 'scale(1.12)'; setTimeout(() => wallet.style.transform = '', 120); };
  H.hint = text => { if (!text) { hint.classList.add('hidden'); return; } if (hint.textContent !== text) hint.textContent = text; hint.classList.remove('hidden'); };
  H.show = () => hud.classList.remove('hidden');
  H.update = () => { const k = Math.min(1, (performance.now() - t0) / 350); shown = from + (target - from) * (1 - Math.pow(1 - k, 3)); num.textContent = fmt(shown); };
  wallet.style.transition = 'transform .12s';
  return H;
}
```

- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: particles, coin arcs, floating numbers and HUD"`

---

### Task 12: Game glue and boot

**Files:**
- Create: `src/game.js`; Replace: `src/main.js`

**Interfaces:**
- `createGame(S, area, els) → G` where `els = { fx, wallet, joy, joyKnob }` and `G = { world, coins, owner, customers, update(dt), setMove(x,z) (test hook), state }`. `window.__game = G` is set by `main.js` for the screenshot tool.
- Interaction rules (from the spec): oven front point = station pos + rotated `(0, 0, 1.4)`; player within 1.2 m takes 1 item per 0.35 s while `owner.items.length < carryCap`. Counter front = pos + `(0, 0, 1.3)`; within 1.2 m drops 1 per 0.15 s while the counter has room. Cash: within 1.0 m of `cashSpot(checkout)` and `pile > 0` → collect. Zone: within 1.1 m of the zone center → `payZone` each frame; a coin arc every 0.15 s while paying.
- Customer spawn: every 4 s while `customers.length < 6`, species round-robin over `SPECIES`.
- Counter display: each counter keeps a pool of 12 item meshes at `counterMesh().slots`; visible count = `items.length` (last item scales in). Oven output tray shows `min(stock, 6)` items stacked 0.17 apart at `outSlot`.
- Hints, in order until each first happens: `'Walk to the oven'` → `'Bring the treats to the counter'` → `'Collect the cash'` → `'Stand on the circle to build'`. After the first build, hints are off.

- [ ] **Step 1: game.js**

```js
// src/game.js — binds sim ↔ render ↔ hud. One update(dt) per frame.
import * as THREE from 'three';
import { AREA1, queueSlots, cashSpot } from '../data/area1.js';
import { PRODUCTS, playerSpeed, carryCap, salePrice } from './sim/economy.js';
import { createWorld, activeZones, payZone, stepOvens, takeFromOven, putOnCounter } from './sim/world.js';
import { createCustomer, stepCustomers, SPECIES } from './sim/customers.js';
import { createInput } from './core/input.js';
import { buildStatic, counterMesh, ovenMesh, checkoutMesh, tableMesh, itemFor, zoneRing, cashPile } from './render/props.js';
import { createOwner } from './render/owner.js';
import { createPet } from './render/pets.js';
import { createFx } from './render/fx.js';
import { createHud } from './ui/hud.js';
import { damp } from './core/tween.js';
const front = (st, d) => ({ x: st.x + Math.sin(st.rot) * d, z: st.z + Math.cos(st.rot) * d });
const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
export function createGame(S, area, els) {
  const G = { coins: 0, up: { speed: 0, carry: 0, income: 0 }, boosts: {}, customers: [], time: 0, state: 'play', stats: { served: 0 } };
  const world = createWorld(area); G.world = world;
  const scene = S.scene; scene.add(buildStatic(area));
  const input = createInput(els.joy, els.joyKnob); const hud = createHud(); const fx = createFx(scene, S.camera, els.fx, hud.walletEl);
  const owner = createOwner(); scene.add(owner.group); G.owner = owner;
  const P = { x: 0, z: 2.5, vx: 0, vz: 0 }; owner.group.position.set(P.x, 0, P.z); S.snap(P.x, P.z);
  // station visuals
  const vis = new Map();
  for (const st of world.stations.values()) {
    const g = st.type === 'oven' ? ovenMesh() : st.type === 'counter' ? counterMesh() : st.type === 'checkout' ? checkoutMesh() : tableMesh();
    g.position.set(st.x, 0, st.z); g.rotation.y = st.rot; g.visible = st.active; scene.add(g);
    const v = { g, pop: st.active ? 1 : 0, items: [] };
    if (st.type === 'counter') for (let i = 0; i < 12; i++) { const m = itemFor('cookie'); m.position.copy(g.slots[i]); m.visible = false; g.add(m); v.items.push(m); }
    if (st.type === 'oven') for (let i = 0; i < 6; i++) { const m = itemFor(st.product); m.position.copy(g.outSlot); m.position.y += i * 0.17; m.visible = false; g.add(m); v.items.push(m); }
    if (st.type === 'checkout') { v.pile = cashPile(); const cs = cashSpot(st); v.pile.position.set(cs.x, 0, cs.z); scene.add(v.pile); }
    vis.set(st.id, v);
  }
  const zones = new Map();
  for (const z of area.zones) { const r = zoneRing(); r.position.set(z.x, 0, z.z); r.visible = false; scene.add(r); const lbl = document.createElement('div'); lbl.className = 'zlabel'; els.fx.appendChild(lbl); zones.set(z.id, { r, lbl, z }); }
  const pets = new Map(); let spawnT = 2, seq = 1, speciesIdx = 0;
  let takeT = 0, dropT = 0, arcT = 0; const hints = { oven: 0, counter: 0, cash: 0, zone: 0 };
  const price = (k, seated) => salePrice(k, G.up, G.boosts, seated, Date.now());
  const tmp = { sx: 0, sy: 0, visible: true };
  G.setMove = (x, z) => { G._force = (x == null) ? null : { x, z }; };   // null restores joystick control (ruled during execution)
  hud.show();
  G.update = dt => {
    G.time += dt; input.update();
    const mv = G._force || input; const sp = playerSpeed(G.up);
    P.vx = damp(P.vx, mv.x * sp, 12, dt); P.vz = damp(P.vz, mv.z * sp, 12, dt);
    P.x += P.vx * dt; P.z += P.vz * dt;
    P.x = Math.max(-area.size.w / 2 + 0.5, Math.min(area.size.w / 2 - 0.5, P.x)); P.z = Math.max(-area.size.d / 2 + 0.5, Math.min(area.size.d / 2 - 0.5, P.z));
    owner.group.position.set(P.x, 0, P.z); owner.update(dt, P.vx, P.vz); S.follow(P.x, P.z, dt);
    stepOvens(world, dt);
    // owner ↔ stations
    takeT -= dt; dropT -= dt; arcT -= dt;
    for (const st of world.stations.values()) {
      if (!st.active) continue;
      if (st.type === 'oven' && near(P, front(st, 1.4), 1.2) && takeT <= 0 && owner.items.length < carryCap(G.up) && st.stock > 0) {
        takeFromOven(world, st.id, 1); const im = itemFor(st.product); im.userData.product = st.product; owner.addItem(im); takeT = 0.35; hints.oven = 1;
      }
      if (st.type === 'counter' && near(P, front(st, 1.3), 1.2) && dropT <= 0 && owner.items.length && st.items.length < st.capacity) {
        const m = owner.popItem(); const key = m.userData.product || 'cookie'; putOnCounter(world, st.id, key, 1); dropT = 0.15; hints.counter = 1; fx.burst(st.x, 1.3, st.z, PRODUCTS[key].color, 4);
      }
      if (st.type === 'checkout' && st.pile > 0 && near(P, cashSpot(st), 1.0)) {
        const amt = st.pile; st.pile = 0; const cs = cashSpot(st); hints.cash = 1;
        fx.coinArc(cs.x, 0.3, cs.z, Math.min(10, 2 + amt / 5 | 0), () => { G.coins += amt; hud.setCoins(G.coins); hud.bump(); }); fx.number(cs.x, 0.8, cs.z, '+' + amt);
      }
    }
    // build zones
    for (const z of activeZones(world)) {
      const zv = zones.get(z.id); zv.r.visible = true; const paid = world.partial[z.id] || 0; zv.r.setProgress(paid / z.price);
      zv.r.pulse.target = 1; zv.r.scale.setScalar(zv.r.pulse.step(dt));
      if (near(P, z, 1.1) && G.coins > 0) { const r = payZone(world, z.id, G.coins, dt); G.coins -= r.spent; hud.setCoins(G.coins);
        if (r.spent && arcT <= 0) { arcT = 0.15; zv.r.pulse.kick(1.5); } hints.zone = 1; }
      fx.project(z.x, 0.2, z.z, tmp); zv.lbl.style.left = tmp.sx + 'px'; zv.lbl.style.top = tmp.sy + 'px'; zv.lbl.textContent = z.label + '  ' + Math.max(0, z.price - paid); zv.lbl.style.display = tmp.visible ? '' : 'none';
    }
    // events from sim
    for (const e of world.events) {
      if (e.type === 'built') { const zv = zones.get(e.zoneId); zv.r.visible = false; zv.lbl.remove(); fx.burst(zv.z.x, 0.5, zv.z.z, '#FFF4E6', 30);
        for (const id of zv.z.adds) { const v = vis.get(id); v.g.visible = true; v.pop = 0; } }
      if (e.type === 'pay') { fx.number(e.x, 1.6, e.z, '+' + e.amount); G.stats.served++; }
      if (e.type === 'took') { const p = pets.get(e.id); if (p) { p.carry(itemFor(e.product)); p.setMood('none'); } }
      if (e.type === 'angry') { const p = pets.get(e.id); if (p) p.setMood('angry'); }
      if (e.type === 'seated') { const p = pets.get(e.id); if (p) { p.setMood('happy'); fx.hearts(p.group.position.x, p.height + 0.3, p.group.position.z); } }
    }
    world.events.length = 0;
    // pop-in animation for newly built stations
    for (const v of vis.values()) if (v.pop < 1) { v.pop = Math.min(1, v.pop + dt * 2); const t = v.pop, s = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2); v.g.scale.setScalar(Math.max(0.001, s)); }
    // customers
    spawnT -= dt;
    if (spawnT <= 0 && G.customers.length < 6) { spawnT = 4; const c = createCustomer(seq++, SPECIES[speciesIdx++ % SPECIES.length], area); G.customers.push(c); const p = createPet(c.species); scene.add(p.group); pets.set(c.id, p); }
    stepCustomers(G.customers, world, price, dt);
    for (let i = G.customers.length - 1; i >= 0; i--) { const c = G.customers[i]; const p = pets.get(c.id);
      if (c.done) { scene.remove(p.group); pets.delete(c.id); G.customers.splice(i, 1); continue; }
      p.group.position.x = c.x; p.group.position.z = c.z; p.group.rotation.y = c.rot;
      const moving = c.state !== 'eating' && !(c.state === 'queue' && c.slot === 0 && near(c, queueSlots(world.stations.get(c.counterId))[0], 0.05));
      p.update(dt, moving, c.hop);
      if (c.state === 'queue' && c.slot === 0 && c.wait > 1.5) p.setMood('wait'); else if (c.state === 'queue') p.setMood('none');
      if (c.state === 'leave' && c.item === null && c.seat === null && p._carried) p.carry(null);
    }
    // station visuals
    for (const st of world.stations.values()) { const v = vis.get(st.id);
      if (st.type === 'counter') v.items.forEach((m, i) => { const on = i < st.items.length; if (on && !m.visible) m.scale.setScalar(0.01); m.visible = on; if (on && m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 8)); });
      if (st.type === 'oven') v.items.forEach((m, i) => m.visible = i < Math.min(st.stock, 6));
      if (st.type === 'checkout') v.pile.setCount(Math.ceil(st.pile / 5)); }
    // hints
    hud.hint(!hints.oven ? 'Walk to the oven' : !hints.counter ? 'Bring the treats to the counter' : !hints.cash ? 'Collect the cash' : !hints.zone ? 'Stand on the circle to build' : null);
    fx.update(dt); hud.update();
  };
  return G;
}
```

Add to `src/style.css`:

```css
.zlabel{position:absolute;transform:translate(-50%,-50%);background:#8B7CF6;color:#fff;font-weight:900;font-size:15px;padding:6px 12px;border-radius:999px;box-shadow:0 3px 0 #5f52c7;white-space:nowrap}
```

- [ ] **Step 2: main.js (boot)**

```js
// src/main.js — boot: loading paint → firstFrameReady → world → gameReady
import { createScene } from './render/scene.js';
import { createGame } from './game.js';
import { AREA1 } from '../data/area1.js';
const yt = (typeof ytgame !== 'undefined' && ytgame && ytgame.IN_PLAYABLES_ENV) ? ytgame : null;
const $ = id => document.getElementById(id);
requestAnimationFrame(() => requestAnimationFrame(boot));
function boot() {
  try { if (yt) yt.game.firstFrameReady(); } catch (e) {}
  const S = createScene($('c'));
  const G = createGame(S, AREA1, { fx: $('fx'), wallet: $('wallet'), joy: $('joy'), joyKnob: $('joyKnob') });
  window.__game = G; window.__scene = S;
  let last = performance.now(), first = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    G.update(dt); S.render();
    if (first) { first = false; $('loading').classList.add('hidden'); try { if (yt) yt.game.gameReady(); } catch (e) {} }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

- [ ] **Step 3: Play it** — `npm run dev`, open in Chrome with the device toolbar at 390×844 and at 1280×720. Walk to the oven, watch the stack grow, drop at the counter, watch a cat queue and take a cookie, pay, cash pile grows, collect, pay the ring, the second counter pops in. Fix anything that breaks before continuing.
- [ ] **Step 4: Build** — `npm run build` must print `postbuild OK`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: playable vertical slice"`

---

### Task 13: Screenshot tool (milestone review)

**Files:**
- Create: `tools/shot.js`

**Interfaces:**
- `npm run shot` builds, serves `dist/` on port 4174, drives the game through `window.__game.setMove`, saves `shots/<name>-<ratio>.png` for the moments: `boot`, `oven`, `counter`, `queue`, `cash`, `built`, at 450×800 (dpr 2) and 1280×720 (dpr 1). Prints `renderer.info` (draw calls, triangles) after the `queue` moment and fails if calls > 120 or triangles > 150 000.

- [ ] **Step 1: Implement**

```js
// tools/shot.js — build, serve dist, drive the slice, screenshot key moments on the GPU
import { execSync } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
execSync('npm run build', { stdio: 'inherit' });
const dist = path.resolve('dist'); fs.mkdirSync('shots', { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => { let p = path.join(dist, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); }).listen(4174);
const W = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const AREA = { oven: { x: 5.5, z: -2.6 }, counter: { x: 0, z: -0.1 }, cash: { x: -5.2, z: -0.6 }, zone: { x: 3, z: 0.6 } };
async function walkTo(page, t) {
  for (let i = 0; i < 400; i++) {
    const d = await page.evaluate(t => { const G = window.__game; const p = G.owner.group.position; const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz); G.setMove(d < 0.15 ? 0 : dx / d, d < 0.15 ? 0 : dz / d); return d; }, t);
    if (d < 0.15) break; await W(33);
  }
  await page.evaluate(() => window.__game.setMove(0, 0));
}
let failed = false;
for (const [tag, w, h, dpr] of [['portrait', 450, 800, 2], ['landscape', 1280, 720, 1]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: tag === 'portrait' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4174/'); await page.waitForFunction(() => window.__game && !document.getElementById('loading').offsetParent, null, { timeout: 30000 });
  const shot = n => page.screenshot({ path: `shots/${n}-${tag}.png` });
  await W(500); await shot('boot');
  await page.evaluate(() => { window.__game.coins = 0; });
  await walkTo(page, AREA.oven); await W(2500); await shot('oven');
  await walkTo(page, AREA.counter); await W(1500); await shot('counter');
  await W(9000); await shot('queue');
  const info = await page.evaluate(() => { const r = window.__scene.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  console.log(tag, 'draw calls', info.calls, 'triangles', info.tris); if (info.calls > 120 || info.tris > 150000) { console.error('BUDGET EXCEEDED'); failed = true; }
  await walkTo(page, AREA.cash); await W(1200); await shot('cash');
  await page.evaluate(() => { window.__game.coins = 200; });
  await walkTo(page, AREA.zone); await W(2500); await shot('built');
  if (errors.length) { console.error(tag, 'page errors:\n' + errors.join('\n')); failed = true; }
  await ctx.close();
}
await browser.close(); srv.close(); process.exit(failed ? 1 : 0);
```

`playwright` (full package) must be installed for `import { chromium } from 'playwright'`: `npm i -D playwright@1.62.1` (browsers are already present under `~/AppData/Local/ms-playwright`). If `setMove` returns before the customers have cash, that is fine; the `cash` shot exists for framing.

- [ ] **Step 2: Run** `npm run shot` → 12 PNGs in `shots/`, budget line printed, exit 0.
- [ ] **Step 3: Review** the PNGs by eye (Read tool) against the spec's visual style section: warm light, soft shadows, striped awning, pastel palette, readable pets, stack on the head, cash pile, glowing ring. Note concrete fixes; apply them; re-run.
- [ ] **Step 4: Commit** `git add -A && git commit -m "tools: GPU screenshot review script"`

---

## Milestone 1 exit criteria

- `npm test` passes (core, economy, world, customers).
- `npm run build` prints `postbuild OK` with exactly one external script.
- `npm run shot` produces the 12 screenshots within budget and with no page errors.
- The user reviews `shots/*.png` and approves the look before Milestone 2 planning begins.
