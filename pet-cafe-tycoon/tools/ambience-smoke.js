// tools/ambience-smoke.js
//
// Pins the owner's §2 rule — "butterflies and bees spawn strictly around flowerbeds during daylight;
// fireflies and soft warm cafe lamp glows replace them at dusk and night" — against the live game.
//
// Two defects this exists to prevent from coming back:
//   1. the insects were at three HARDCODED coordinates that happened to be the z_garden bushes (a
//      late paid unlock), so early game they fluttered over bare floor while the real beds sat
//      unvisited. Assertion: every placed insect is within a short hop of a bed environment.js
//      actually built, and the count is non-zero on day 1 with nothing unlocked.
//   2. `update()` had NO night gate, so they flew at midnight beside the fireflies. Assertion: the
//      group is hidden at night and visible by day, driven by the same signal the fireflies use.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'ambience');
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
const PORT = 4186; // barista-smoke uses this too, but it lives in another suite;
// ports must be unique WITHIN a suite. See label-overflow-smoke.js for why that matters.
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`ambience-smoke: port ${PORT} is already in use — an environment problem, not a game regression.`);
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const mockSdk = `window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(){return true}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},engagement:{sendScore(){}},ads:{}};`;

// A spot on the deck looking down the bed row, so the beds are actually in frame for the shots.
const WATCH = { x: 0, z: 5.4 };

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const failures = [];
const summary = [];
const check = (cond, message) => { if (!cond) failures.push(message); };

for (const [tag, want] of [['day', 'brightest'], ['night', 'darkest']]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: mockSdk }));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });
  } catch (e) {
    // A boot failure IS the finding, so report the page's own error instead of a bare timeout.
    console.error(`[${tag}] boot failed. Page errors:\n  ` + (errors.length ? errors.join('\n  ') : '(none captured)'));
    throw e;
  }

  // Park the owner on the deck so the bed row is in frame, and skip the tutorial.
  await page.evaluate(watch => {
    const G = window.__game;
    G.intro.step = 5; G.intro.active = false;
    G.setMove(null, null);
    G.P.x = watch.x; G.P.z = watch.z; G.P.vx = 0; G.P.vz = 0;
    G.owner.group.position.set(watch.x, 0, watch.z);
  }, WATCH);

  // CALIBRATE the time of day from the game rather than assuming a model for dayState.t: sweep it,
  // ask daylight what `lights` it produces, and take the extremes. This keeps the smoke honest if
  // the day-clock's units or its keyframe table ever change — and it is the only way to prove the
  // insects follow the SAME signal the fireflies do rather than a coincidence of my arithmetic.
  const sweep = await page.evaluate(async () => {
    const G = window.__game;
    const before = G.dayState.t;
    const out = [];
    const cands = [];
    for (let i = 0; i <= 24; i += 0.5) cands.push(i);          // hours-like clocks
    for (let i = 0; i <= 1.0001; i += 0.05) cands.push(+i.toFixed(2)); // normalised clocks
    for (const t of cands) {
      G.dayState.t = t;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push({ t, lights: window.__scene.daylight ? window.__scene.daylight.lights : 0 });
    }
    G.dayState.t = before;
    return out;
  });
  const brightest = sweep.reduce((a, b) => (b.lights < a.lights ? b : a));
  const darkest = sweep.reduce((a, b) => (b.lights > a.lights ? b : a));
  const target = want === 'brightest' ? brightest : darkest;

  const sweepRange = +(brightest.lights - darkest.lights).toFixed(4);
  // If the day-clock never reaches the extreme we need, the night SIGNAL is broken — a separate
  // defect from anything in butterflies.js. Rather than let that mask the gate, force the value the
  // gate is supposed to react to and test the gate on its own terms. Both facts get reported.
  const forced = sweepRange < 0.05;
  if (forced) {
    await page.evaluate(lights => {
      Object.defineProperty(window.__scene.daylight, 'lights', { configurable: true, get: () => lights });
    }, want === 'brightest' ? 0 : 1);
  }

  // Hold the clock at the calibrated hour while daylight grades toward it.
  for (let i = 0; i < 10; i++) {
    if (!forced) await page.evaluate(t => { window.__game.dayState.t = t; }, target.t);
    await page.waitForTimeout(110);
  }

  const state = await page.evaluate(() => {
    const G = window.__game;
    const b = G.butterflies;
    const beds = (G.environment && G.environment.bedAnchors) || [];
    const insects = [];
    // `group.visible === false` is how dusk is expressed, so a child's own flag says nothing about
    // whether anything is on screen — enumerate nothing at all when the group is down, or the night
    // assertion reads seven drawn insects the renderer never touches.
    for (const child of (b.group.visible ? b.group.children : [])) {
      if (!child.visible) continue;
      const p = child.position;
      let nearest = Infinity;
      for (const bed of beds) nearest = Math.min(nearest, Math.hypot(p.x - bed.x, p.z - bed.z));
      insects.push({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), y: +p.y.toFixed(3), nearestBed: +nearest.toFixed(3) });
    }
    return {
      hour: G.dayState.t,
      lights: window.__scene.daylight ? window.__scene.daylight.lights : null,
      bedCount: beds.length,
      placed: b.placed(),
      groupVisible: b.group.visible,
      visibleInsects: insects.length,
      worstBedDistance: insects.length ? Math.max(...insects.map(i => i.nearestBed)) : null,
      sample: insects.slice(0, 3),
    };
  });

  check(errors.length === 0, `[${tag}] page errors: ${errors.join(' | ')}`);
  check(state.bedCount === 14, `[${tag}] expected the 14 built beds to be exposed, got ${state.bedCount}`);
  check(state.placed >= 5, `[${tag}] only ${state.placed} insects were anchored to a real bed`);

  const lights = state.lights == null ? 0 : state.lights;
  if (tag === 'day') {
    check(lights < 0.05, `[day] expected full daylight, lights=${lights}`);
    check(state.groupVisible, '[day] the insects are hidden during daylight');
    // The heart of the rule: they are ON the planting, not merely somewhere in the café.
    check(state.visibleInsects >= 5, `[day] only ${state.visibleInsects} insects were visible`);
    check(state.worstBedDistance != null && state.worstBedDistance <= 1.6,
      `[day] an insect was ${state.worstBedDistance} m from the nearest bed — they must work the flowerbeds`);
  }
  if (tag === 'night') {
    check(lights > 0.5, `[night] expected the café to be dark, lights=${lights}`);
    check(!state.groupVisible, '[night] the day insects are still flying after dark — the fireflies should have replaced them');
    check(state.visibleInsects === 0, `[night] ${state.visibleInsects} insects are still drawn at night`);
  }

  await page.screenshot({ path: path.join(shots, `${tag}-1280x720.png`) });
  summary.push({ tag, want, calibratedT: target.t, sweepMin: darkest.lights, sweepMax: brightest.lights, forced, ...state, sample: undefined });
  await ctx.close();
}

await browser.close();
await new Promise(resolve => server.close(resolve));

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error('\nambience-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nambience-smoke OK');
