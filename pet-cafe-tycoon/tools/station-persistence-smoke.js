// Task 10 browser acceptance: a host-pause save must preserve the durable station economy across
// a real reload — especially uncollected register cash and an EMPTY coffee bean input.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'station-persistence');
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});
await new Promise(resolve => server.listen(4180, '127.0.0.1', resolve));

const ALL_BUILDS = ['z_seats1','z_oven2','z_register2','z_hire','z_coffee','z_bowl','z_blender','z_garden','z_seats2'];
const seed = {
  v: 4,
  coins: 5000,
  builds: { a1: ALL_BUILDS },
  dayState: { day: 4, t: 70 },
  stars: { oven1: 3, dispCookie: 3, coffee1: 3, barCoffee: 3 },
  meta: { completedDays: 3, reputation: 9 },
};
let loadRaw = JSON.stringify(seed);

function sdk(raw) {
  return `
    window.__ytStation = { saved:null, gameReady:false, pauseCb:null, resumeCb:null };
    const loadRaw = ${JSON.stringify(raw)};
    window.ytgame = {
      IN_PLAYABLES_ENV:true,
      game:{
        firstFrameReady(){},
        gameReady(){ window.__ytStation.gameReady=true; },
        async loadData(){ return loadRaw; },
        async saveData(value){ window.__ytStation.saved=value; }
      },
      system:{
        isAudioEnabled(){ return true; },
        onAudioEnabledChange(cb){ window.__ytStation.audioCb=cb; },
        onPause(cb){ window.__ytStation.pauseCb=cb; },
        onResume(cb){ window.__ytStation.resumeCb=cb; },
        getLanguage(){ return 'en'; }
      },
      engagement:{ async sendScore(){} },
      ads:{}
    };
  `;
}

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:390, height:700 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:sdk(loadRaw) }));

const expected = {
  register1: { pile:137 },
  register2: { pile:52 },
  oven1: { stock:12, product:'brownie' },
  oven2: { stock:12, product:'cupcake' },
  dispCookie: { stock:14, product:'brownie' },
  dispCupcake: { stock:2, product:'cupcake' },
  coffee1: { beans:0, stock:3, product:'latte' },
  barCoffee: { stock:4, product:'latte' },
  blender1: { fruit:0, stock:5 },
  barSmoothie: { stock:3, product:'smoothie' },
  bowl1: { stock:1 },
  seat1: { dirty:true },
};

function selectState(G) {
  const out = {};
  for (const id of Object.keys(expected)) {
    const st = G.world.stations.get(id);
    if (!st) continue;
    const row = {};
    for (const key of Object.keys(expected[id])) row[key] = st[key];
    out[id] = row;
  }
  out.dispCookieCapacity = G.world.stations.get('dispCookie').capacity;
  return out;
}

try {
  await page.goto('http://127.0.0.1:4180/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__ytStation.gameReady && window.__game && window.__ytStation.pauseCb, null, { timeout:9000 });

  // Set one coherent mid-shift state. Machines that could autonomously advance are either full or
  // have zero input, so the short visual-sync wait cannot alter the acceptance values.
  await page.evaluate(() => {
    const G = window.__game, w = G.world;
    w.stations.get('register1').pile = 137;
    w.stations.get('register2').pile = 52;
    Object.assign(w.stations.get('oven1'), { stock:12, product:'brownie' });
    Object.assign(w.stations.get('oven2'), { stock:12, product:'cupcake' });
    Object.assign(w.stations.get('dispCookie'), { stock:14, capacity:16, product:'brownie' });
    Object.assign(w.stations.get('dispCupcake'), { stock:2, product:'cupcake' });
    Object.assign(w.stations.get('coffee1'), { beans:0, stock:3, product:'latte' });
    Object.assign(w.stations.get('barCoffee'), { stock:4, capacity:16, product:'latte' });
    Object.assign(w.stations.get('blender1'), { fruit:0, stock:5 });
    Object.assign(w.stations.get('barSmoothie'), { stock:3, product:'smoothie' });
    w.stations.get('bowl1').stock = 1;
    w.stations.get('seat1').dirty = true;
  });
  await page.waitForTimeout(120); // let stock/cash meshes reflect the state before host pause freezes rendering

  const beforeState = await page.evaluate(() => {
    const G = window.__game;
    return { state:(window.__selectState || (() => null))(G), snapshot:G.snapshot() };
  }).catch(() => null);
  // Keep the browser helper self-contained instead of injecting functions into the page realm.
  const before = await page.evaluate(expectedIds => {
    const G = window.__game, out = {};
    for (const [id, keys] of Object.entries(expectedIds)) {
      const st = G.world.stations.get(id), row = {};
      for (const key of keys) row[key] = st[key];
      out[id] = row;
    }
    out.dispCookieCapacity = G.world.stations.get('dispCookie').capacity;
    return { state:out, snapshot:G.snapshot() };
  }, Object.fromEntries(Object.entries(expected).map(([id,row]) => [id,Object.keys(row)])));

  if (JSON.stringify(Object.fromEntries(Object.keys(expected).map(id => [id,before.state[id]]))) !== JSON.stringify(expected)) {
    throw new Error(`pre-save station setup drifted: ${JSON.stringify(before.state)}`);
  }
  if (before.state.dispCookieCapacity !== 16) throw new Error(`star capacity missing before save: ${JSON.stringify(before.state)}`);

  // Real YouTube lifecycle path: onPause snapshots first, then freezes the host runtime.
  await page.evaluate(() => window.__ytStation.pauseCb());
  await page.waitForFunction(() => !!window.__ytStation.saved, null, { timeout:5000 });
  loadRaw = await page.evaluate(() => window.__ytStation.saved);
  const saved = JSON.parse(loadRaw);
  if (!saved.stationState || saved.stationState.v !== 1) throw new Error(`station payload missing from pause save: ${loadRaw}`);
  for (const [id,row] of Object.entries(expected)) {
    if (JSON.stringify(saved.stationState.byId[id]) !== JSON.stringify(row)) {
      throw new Error(`pause save station mismatch ${id}: ${JSON.stringify(saved.stationState.byId[id])}`);
    }
  }
  await page.screenshot({ path:path.join(shots, '01-before-reload.png') });

  // Reload against the exact SDK payload produced by the pause save.
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__ytStation.gameReady && window.__game && window.__ytStation.pauseCb, null, { timeout:9000 });
  await page.evaluate(() => window.__ytStation.pauseCb());
  await page.waitForFunction(() => !!window.__ytStation.saved, null, { timeout:5000 });

  const after = await page.evaluate(expectedIds => {
    const G = window.__game, out = {};
    for (const [id, keys] of Object.entries(expectedIds)) {
      const st = G.world.stations.get(id), row = {};
      for (const key of keys) row[key] = st[key];
      out[id] = row;
    }
    out.dispCookieCapacity = G.world.stations.get('dispCookie').capacity;
    return { state:out, snapshot:G.snapshot(), saved:JSON.parse(window.__ytStation.saved) };
  }, Object.fromEntries(Object.entries(expected).map(([id,row]) => [id,Object.keys(row)])));

  for (const [id,row] of Object.entries(expected)) {
    if (JSON.stringify(after.state[id]) !== JSON.stringify(row)) throw new Error(`restored station mismatch ${id}: ${JSON.stringify(after.state[id])}`);
  }
  if (after.state.dispCookieCapacity !== 16) throw new Error(`restored star capacity wrong: ${after.state.dispCookieCapacity}`);
  if (after.state.coffee1.beans !== 0) throw new Error(`empty coffee input refilled for free: ${after.state.coffee1.beans}`);
  if (after.state.register1.pile !== 137) throw new Error(`uncollected register cash lost: ${after.state.register1.pile}`);
  if (after.state.seat1.dirty !== true) throw new Error('dirty seat was cleaned by reload');
  if (JSON.stringify(after.snapshot.stationState.byId.coffee1) !== JSON.stringify(expected.coffee1)) throw new Error(`post-reload snapshot drifted: ${JSON.stringify(after.snapshot.stationState.byId.coffee1)}`);

  await page.screenshot({ path:path.join(shots, '02-after-reload.png') });
  const report = {
    savedVersion:saved.v,
    stationVersion:saved.stationState.v,
    before:before.state,
    after:after.state,
    noFreeRefill:after.state.coffee1.beans === 0,
    cashPreserved:after.state.register1.pile === 137,
    seatDirtPreserved:after.state.seat1.dirty === true,
  };
  fs.writeFileSync(path.join(shots, 'station-persistence-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
} finally {
  await ctx.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}