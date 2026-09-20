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
//   node tools/scene-cost.mjs --peak --gpu                   # ship-plan PEAK: every zone but the spa,
//                                                            # on the real GPU so p95 means something
//   node tools/scene-cost.mjs --dist ../other/dist           # serve a different build
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
const MAX_ACTOR_CALLS = Number(arg('--actor-calls', 0)) || 0;   // draw calls per human or pet, shadow pass included
const JSON_OUT = arg('--json', null);
const EXTERNAL = arg('--url', null);
const PORT = Number(arg('--port', 4207)) || 4207;
// The ship plan's budget (§1.9) is set at PEAK: the whole frame with everything the catalogue sells
// built, not the day-12 chain below. The spa chain is retired by the same plan, so it is skipped
// whether or not the catalogue still carries it.
const PEAK = process.argv.includes('--peak');
// How many characters and pets must be on stage before the sample is taken. The budget in the ship
// plan (§1.9) is set at PEAK — "the busiest state" — and the crowd the deterministic sim happens to
// have standing around at the sample instant is not that: the merged build measured 200 calls with
// TEN actors, so a real rush was never actually measured against the limit. With --actors the run
// keeps stepping (and keeps the shelves full so guests are served and replaced rather than stalling)
// until at least this many actor groups are in the scene, then samples. It reports what it reached.
const WANT_ACTORS = Number(arg('--actors', 0)) || 0;
const RETIRED = ['z_spa', 'z_groom', 'z_bath', 'z_boutique', 'z_photographer'];
// Headless chromium defaults to SwiftShader, which runs this game at a few fps: draw calls and
// triangles are still exact, but frame times are not. --gpu asks ANGLE for the real adapter.
const GPU = process.argv.includes('--gpu');
const DIST = arg('--dist', 'dist');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let srv = null;
if (!EXTERNAL) {
  const dist = path.resolve(DIST);
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
// matters. Everything through the garden tables is the whole catalogue since 2026-09-19.
const CHAIN = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender',
  'z_garden', 'z_seats2', 'z_terrace', 'z_photo', 'z_terraceSeats'];

const browser = await chromium.launch(GPU ? { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
const page = await browser.newPage({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 200)));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

await page.evaluate(({ chain, peak, retired, wantActors }) => {
  const G = window.__game;
  if (peak) {
    // Every zone the catalogue offers, in an order payZone accepts: a zone whose prerequisite is
    // not built yet waits for a later pass.
    chain = [];
    const zones = G.world.area.zones.filter(z => !retired.includes(z.id));
    const have = new Set();
    for (let pass = 0; pass < zones.length && chain.length < zones.length; pass++) {
      for (const z of zones) if (!have.has(z.id) && (!z.requires || have.has(z.requires))) { have.add(z.id); chain.push(z.id); }
    }
  }
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
  // Then keep going until the room is genuinely busy. Every actor group in the scene counts — guests,
  // their pets, staff, the owner and the residents — because that is what the frame actually pays
  // for. Bounded, and the run reports the crowd it reached, so a café that cannot hold that many is
  // visible as a smaller number rather than as a hang.
  if (wantActors > 0) {
    // A LATE café, not a day-12 one. The crowd the economy will allow is a function of the day, the
    // café level and the staff on the floor (sim/economy.js maxCustomers), so a day-12 run simply
    // cannot put sixteen actors on stage however long it is stepped. Day 30 with the whole roster is
    // the state the ship plan calls peak (★5 lands around day 28-35), and it is the honest place to
    // measure a budget that is defined at peak.
    G.dayState.day = 30;
    G.staff.runner = 3; G.staff.cleaner = 2; G.staff.cashier = 2; G.staff.barista = 1;
    if (G.meta) G.meta.followers = Math.max(G.meta.followers | 0, 5000);
    const onStage = () => {
      let n = 0;
      window.__scene.scene.traverse(o => { if (o.parent === window.__scene.scene && /^(human|pet):/.test(o.name || '') && o.visible) n++; });
      return n;
    };
    for (let i = 0; i < 12000 && onStage() < wantActors; i++) {
      if (i % 20 === 0) for (const d of shelves) d.stock = d.capacity;
      G.update(0.05);
    }
  }
}, { chain: CHAIN, peak: PEAK, retired: RETIRED, wantActors: WANT_ACTORS });
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
  // The static scene, measured rather than estimated: hide every human and pet (their main-pass AND
  // shadow-pass draws go with them), render a few frames, count, restore. Subtracting actor meshes
  // from a whole frame left their shadow draws in, so the "static" figure still swung by ~30 calls
  // with whoever happened to be on stage.
  const actors = [];
  S.scene.traverse(o => { if (o.parent === S.scene && /^(human|pet):/.test(o.name || '') && o.visible) actors.push(o); });
  for (const a of actors) a.visible = false;
  let staticCallsMeasured = 0, staticTrisMeasured = 0;
  for (let n = 0; n < 8; n++) {
    R.info.reset();
    await new Promise(r => requestAnimationFrame(() => r()));
    staticCallsMeasured = Math.max(staticCallsMeasured, R.info.render.calls);
    staticTrisMeasured = Math.max(staticTrisMeasured, R.info.render.triangles);
  }
  for (const a of actors) a.visible = true;
  R.info.autoReset = true;
  frames.sort((a, b) => a - b);

  // frameMedian/frameP95 above are rAF-to-rAF, so on any machine that keeps up they both read the
  // display's interval (16.7 ms at 60 Hz) whatever the scene costs — which makes them useless for
  // comparing two builds that both hit the cap. This is the frame's own cost with vsync out of the
  // way: submit the whole post chain back to back and divide. It is not a frame time a player sees,
  // it is the work a frame asks for, and that is the number a budget is about.
  let renderMs = 0;
  {
    S.render();                                  // warm the pipeline, then measure
    const t0 = performance.now();
    const N = 30;
    for (let i = 0; i < N; i++) S.render();
    await new Promise(r => requestAnimationFrame(() => r()));   // let the driver drain
    renderMs = (performance.now() - t0) / N;
  }

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
    frameMedianMs: +frames[30].toFixed(2), frameP95Ms: +frames[57].toFixed(2), renderMs: +renderMs.toFixed(2),
    built: G.world.built.size, customers: G.customers.length, staff: G.staffList ? G.staffList.length : 0,
    actors: actorRoots.size, actorRenderables, actorTris: Math.round(actorTris),
    staticCalls: staticCallsMeasured, staticTris: staticTrisMeasured,
    actorCallsAvg: actorRoots.size ? +(actorRenderables / actorRoots.size).toFixed(1) : 0,
    // What one actor really costs in draw calls, shadow pass included.
    actorDrawCallsEach: actors.length ? +((calls - staticCallsMeasured) / actors.length).toFixed(1) : 0,
    topGroups: [...byRoot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    allGroups: Object.fromEntries([...byRoot.entries()].sort((a, b) => b[1] - a[1])),
    builtZones: [...G.world.built].sort(), camera: [+S.camera.position.x.toFixed(1), +S.camera.position.z.toFixed(1)], owner: [+G.P.x.toFixed(1), +G.P.z.toFixed(1)],
  };
});

await browser.close();
if (srv) srv.close();

if (sample.error) { console.error(sample.error); process.exit(2); }
console.log(`scene cost — fully built (${sample.built} zones), day 12, ${sample.customers} guests, ${sample.staff} staff, 852x393`);
console.log(`  draw calls ${sample.drawCalls}   triangles ${sample.triangles.toLocaleString('en-US')}`);
console.log(`  static (actors hidden): ${sample.staticCalls} calls, ${sample.staticTris.toLocaleString('en-US')} triangles   |   ${sample.actors} actors on stage, ${sample.actorCallsAvg} renderables / ${sample.actorDrawCallsEach} draw calls each`);
console.log(`  renderables ${sample.renderables} (${sample.instancedMeshes} instanced, ${sample.shadowCasters} casting shadow), materials ${sample.distinctMaterials}, geometries ${sample.geometries}`);
console.log(`  frame median ${sample.frameMedianMs} ms, p95 ${sample.frameP95Ms} ms (rAF, so vsync-capped), ${sample.renderMs} ms of render work per frame  (compare runs, not devices)`);
for (const [name, n] of sample.topGroups) console.log(`    ${String(n).padStart(4)}  ${name}`);
if (errors.length) console.error(`  page errors: ${errors.slice(0, 3).join(' | ')}`);

if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(sample, null, 2));

let failed = errors.length > 0;
if (MAX_CALLS && sample.drawCalls > MAX_CALLS) { console.error(`BUDGET: ${sample.drawCalls} draw calls > ${MAX_CALLS}`); failed = true; }
if (MAX_TRIS && sample.triangles > MAX_TRIS) { console.error(`BUDGET: ${sample.triangles} triangles > ${MAX_TRIS}`); failed = true; }
if (MAX_STATIC_CALLS && sample.staticCalls > MAX_STATIC_CALLS) { console.error(`BUDGET: ${sample.staticCalls} static draw calls > ${MAX_STATIC_CALLS}`); failed = true; }
if (MAX_STATIC_TRIS && sample.staticTris > MAX_STATIC_TRIS) { console.error(`BUDGET: ${sample.staticTris} static triangles > ${MAX_STATIC_TRIS}`); failed = true; }
if (MAX_ACTOR_CALLS && sample.actorDrawCallsEach > MAX_ACTOR_CALLS) { console.error(`BUDGET: ${sample.actorDrawCallsEach} draw calls per actor > ${MAX_ACTOR_CALLS}`); failed = true; }
process.exit(failed ? 1 : 0);
