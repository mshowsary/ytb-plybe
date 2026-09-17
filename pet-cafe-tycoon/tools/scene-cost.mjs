// tools/scene-cost.mjs — what does a frame of the FULLY BUILT, BUSY café actually cost?
//
// WHY THIS EXISTS
// tools/shot.js has budgeted draw calls since milestone 1, but it walks an early café and so has
// never measured the late game. Measured 2026-09-15 on the live build: 290 draw calls and 293,701
// triangles against that gate's own 200/150k limit. A budget nothing measures is not a budget.
//
// This drives the game to a fully built day-12 café with staff on the floor and shelves stocked,
// lets it run, then samples renderer.info with autoReset off so a whole composited frame is counted
// (the post chain renders several passes; reading info after render() alone reports only the last).
// It also buckets the visible renderables so a regression points at the system that caused it.
//
//   node tools/scene-cost.mjs                  # builds nothing; serves ./dist
//   node tools/scene-cost.mjs --url http://localhost:5190/   # measure a running dev server
//   node tools/scene-cost.mjs --calls 170 --tris 180000      # gate (exit 1 when exceeded)
//   node tools/scene-cost.mjs --json out.json                # machine-readable sample
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (flag, dflt = null) => {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const MAX_CALLS = Number(arg('--calls', 0)) || 0;
const MAX_TRIS = Number(arg('--tris', 0)) || 0;
// The crowd on stage at the sample instant is whatever the deterministic sim happens to have there,
// and ANY change to movement or timing re-deals it (2026-09-17: giving guests a body to steer
// around moved the whole-frame count from 250 to 262 without a single new prop). So the budgets
// that matter are the static scene without its actors, and the cost of one actor — those only
// move when a prop or a character actually gets more expensive.
const MAX_STATIC_CALLS = Number(arg('--static-calls', 0)) || 0;
const MAX_STATIC_TRIS = Number(arg('--static-tris', 0)) || 0;
const MAX_ACTOR_CALLS = Number(arg('--actor-calls', 0)) || 0;   // renderables per human or pet
const JSON_OUT = arg('--json', null);
const EXTERNAL = arg('--url', null);
const PORT = 4207;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let srv = null;
if (!EXTERNAL) {
  const dist = path.resolve('dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('dist/index.html missing — run `npm run build` first, or pass --url for a dev server');
    process.exit(2);
  }
  srv = http.createServer((req, res) => {
    let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
    fs.readFile(p, (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(b);
    });
  }).listen(PORT, '127.0.0.1');
}
const base = EXTERNAL || `http://127.0.0.1:${PORT}/`;

// The zone chain in build order — payZone refuses a zone whose prerequisite is unbuilt, so the order
// matters. Everything through the terrace tables is what a player has by day 12.
const CHAIN = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender',
  'z_garden', 'z_seats2', 'z_terrace', 'z_icecream', 'z_photo', 'z_register3', 'z_terraceSeats'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

await page.evaluate(chain => {
  const G = window.__game;
  // The tutorial keeps guests away and the HUD reduced; a cost measurement of the tutorial is a
  // measurement of an empty room.
  if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
  G.coins += 60000;
  for (const id of chain) {
    const z = G.world.area.zones.find(z => z.id === id);
    if (!z || G.world.built.has(id)) continue;
    G.P.x = z.x; G.P.z = z.z;                       // build by standing on the plot, as a player does
    for (let i = 0; i < 120 && !G.world.built.has(id); i++) G.update(0.1);
  }
  G.dayState.day = 12; G.dayState.t = 60;
  G.staff.runner = 2; G.staff.cleaner = 1; G.staff.cashier = 1; G.staff.barista = 1;
  const reg = G.world.stations.get('register1');
  if (reg) { G.P.x = reg.front.x; G.P.z = reg.front.z; }
  const shelves = [...G.world.stations.values()].filter(s => (s.type === 'display' || s.type === 'bowl') && s.active);
  for (let i = 0; i < 2400; i++) {
    if (i % 40 === 0) for (const d of shelves) d.stock = d.capacity;
    G.update(0.05);
  }
}, CHAIN);
await new Promise(r => setTimeout(r, 800));

const sample = await page.evaluate(async () => {
  const S = window.__scene;
  const R = S && S.renderer;
  if (!R) return { error: 'no renderer on window.__scene' };
  R.info.autoReset = false;
  let calls = 0, tris = 0;
  const frames = [];
  for (let n = 0; n < 60; n++) {
    R.info.reset();
    const t0 = performance.now();
    await new Promise(r => requestAnimationFrame(() => r()));
    frames.push(performance.now() - t0);
    calls = Math.max(calls, R.info.render.calls);
    tris = Math.max(tris, R.info.render.triangles);
  }
  R.info.autoReset = true;
  frames.sort((a, b) => a - b);

  // Bucket every VISIBLE renderable by the scene-level group it hangs under, so a regression names
  // the system that caused it rather than just a number going up.
  const scene = S.scene, byRoot = new Map();
  let renderables = 0, casters = 0, instanced = 0;
  let actorRenderables = 0, actorTris = 0;
  const actorRoots = new Set();
  const trisOf = o => {
    const g = o.geometry; if (!g) return 0;
    const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    return (n / 3) * (o.isInstancedMesh ? o.count : 1);
  };
  scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isPoints && !o.isLine) return;
    let p = o, vis = o.visible;
    while (vis && p.parent) { p = p.parent; vis = p.visible; }
    if (!vis) return;
    renderables++;
    if (o.castShadow) casters++;
    if (o.isInstancedMesh) instanced++;
    let n = o, last = o;
    while (n.parent && n.parent !== scene) { n = n.parent; last = n; }
    const key = last.name || `${last.type}(${last.children.length} children)`;
    byRoot.set(key, (byRoot.get(key) || 0) + 1);
    if (/^(human|pet):/.test(last.name || '')) { actorRenderables++; actorTris += trisOf(o); actorRoots.add(last); }
  });
  const mats = new Set();
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m.uuid)); });

  const G = window.__game;
  return {
    drawCalls: calls, triangles: tris,
    geometries: R.info.memory.geometries, textures: R.info.memory.textures,
    programs: R.info.programs ? R.info.programs.length : null,
    renderables, shadowCasters: casters, instancedMeshes: instanced, distinctMaterials: mats.size,
    frameMedianMs: +frames[30].toFixed(2), frameP95Ms: +frames[57].toFixed(2),
    built: G.world.built.size, customers: G.customers.length, staff: G.staffList ? G.staffList.length : 0,
    actors: actorRoots.size, actorRenderables, actorTris: Math.round(actorTris),
    // Shadow-pass draws are per caster, so an actor costs about one call per renderable in the
    // main pass plus one in the shadow pass; the static figure subtracts only the main-pass share,
    // which is the part a whole-frame count is dominated by at this camera.
    staticCalls: calls - actorRenderables, staticTris: Math.round(tris - actorTris),
    actorCallsAvg: actorRoots.size ? +(actorRenderables / actorRoots.size).toFixed(1) : 0,
    topGroups: [...byRoot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
});

await browser.close();
if (srv) srv.close();

if (sample.error) { console.error(sample.error); process.exit(2); }
console.log(`scene cost — fully built (${sample.built} zones), day 12, ${sample.customers} guests, ${sample.staff} staff, 852x393`);
console.log(`  draw calls ${sample.drawCalls}   triangles ${sample.triangles.toLocaleString('en-US')}`);
console.log(`  static (no actors): ${sample.staticCalls} calls, ${sample.staticTris.toLocaleString('en-US')} triangles   |   ${sample.actors} actors on stage, ${sample.actorCallsAvg} renderables each`);
console.log(`  renderables ${sample.renderables} (${sample.instancedMeshes} instanced, ${sample.shadowCasters} casting shadow), materials ${sample.distinctMaterials}, geometries ${sample.geometries}`);
console.log(`  frame median ${sample.frameMedianMs} ms, p95 ${sample.frameP95Ms} ms  (headless software GL — compare runs, not devices)`);
for (const [name, n] of sample.topGroups) console.log(`    ${String(n).padStart(4)}  ${name}`);
if (errors.length) console.error(`  page errors: ${errors.slice(0, 3).join(' | ')}`);

if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(sample, null, 2));

let failed = errors.length > 0;
if (MAX_CALLS && sample.drawCalls > MAX_CALLS) { console.error(`BUDGET: ${sample.drawCalls} draw calls > ${MAX_CALLS}`); failed = true; }
if (MAX_TRIS && sample.triangles > MAX_TRIS) { console.error(`BUDGET: ${sample.triangles} triangles > ${MAX_TRIS}`); failed = true; }
if (MAX_STATIC_CALLS && sample.staticCalls > MAX_STATIC_CALLS) { console.error(`BUDGET: ${sample.staticCalls} static draw calls > ${MAX_STATIC_CALLS}`); failed = true; }
if (MAX_STATIC_TRIS && sample.staticTris > MAX_STATIC_TRIS) { console.error(`BUDGET: ${sample.staticTris} static triangles > ${MAX_STATIC_TRIS}`); failed = true; }
if (MAX_ACTOR_CALLS && sample.actorCallsAvg > MAX_ACTOR_CALLS) { console.error(`BUDGET: ${sample.actorCallsAvg} renderables per actor > ${MAX_ACTOR_CALLS}`); failed = true; }
process.exit(failed ? 1 : 0);
