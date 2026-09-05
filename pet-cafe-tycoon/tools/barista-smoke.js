// Browser acceptance for the live Barista: restored hire -> Pantry bean refill -> Coffee Bar restock
// -> bakery untouched -> save/restore. This catches the runtime/navigation/persistence failures that
// the pure role-contract tests cannot see.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'barista');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b);
  });
});
await new Promise(resolve => server.listen(4186, '127.0.0.1', resolve));

const mockSdk = `
window.__saved=[];
window.ytgame={IN_PLAYABLES_ENV:true,
 game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(raw){window.__saved.push(raw);return true}},
 system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},
 engagement:{sendScore(){}},ads:{async requestRewardedAd(){return true},async requestInterstitialAd(){return true}}
};`;

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:390, height:700 }, deviceScaleFactor:1 });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk }));
await page.goto('http://127.0.0.1:4186/', { waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__baristaWorker && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });

async function baristaDiagnostic(label) {
  const live = await page.evaluate(() => {
    const G = window.__game, w = G && G.world;
    const coffee = w && w.stations.get('coffee1'), pantry = w && w.stations.get('pantry1'), bar = w && w.stations.get('barCoffee');
    return {
      time:G && G.time, day:G && G.dayState, paused:G && G.userPaused,
      staff:G && {...G.staff}, stats:G && {...G.stats},
      worker:{ active:!!window.__baristaWorker?.active, state:window.__baristaWorker?.state || null },
      coffee:coffee && { active:coffee.active, beans:coffee.beans, stock:coffee.stock, front:coffee.front },
      pantry:pantry && { active:pantry.active, front:pantry.front },
      bar:bar && { active:bar.active, stock:bar.stock, front:bar.front },
      movers:w && w._movers && w._movers.map(m => ({kind:m.kind,x:m.x,z:m.z,tx:m.tx,tz:m.tz,hasTarget:m.hasTarget,n:m.n,k:m.k,stall:m.stall,replans:m.replans,teleports:m.teleports})),
    };
  });
  await page.screenshot({ path:path.join(shots, `debug-${label}.png`) });
  return { live, pageErrors:[...pageErrors] };
}

// Browser software rendering can run far below real-time in CI. Worker acceptance therefore uses
// GAME time, not wall-clock time: the Barista still gets a strict 10 simulated seconds to complete
// each simple lane operation, while Playwright's larger timeout merely gives a slow renderer enough
// wall time to execute those same simulation seconds. This prevents CI hardware speed from changing
// the gameplay contract being tested.
async function waitSimulationBudget(successFn, startTime, budget = 10, wallTimeout = 45000) {
  await page.waitForFunction(
    ({ startTime, budget, successFnSource }) => {
      const success = (0, eval)(`(${successFnSource})`);
      return success() || ((window.__game?.time || 0) - startTime >= budget);
    },
    { startTime, budget, successFnSource:successFn.toString() },
    { timeout:wallTimeout },
  );
  return page.evaluate(({ successFnSource }) => {
    const success = (0, eval)(`(${successFnSource})`);
    return !!success();
  }, { successFnSource:successFn.toString() });
}

// Restore a legal Day-5 coffee shop with a purchased Barista. Earlier prerequisites are included so
// the world/grid mirrors a real progression save rather than force-enabling an isolated station.
const seed = await page.evaluate(() => {
  const G = window.__game, save = G.snapshot();
  save.coins = 2700;
  save.builds.a1 = ['z_seats1','z_oven2','z_register2','z_hire','z_coffee'];
  save.staff = { ...(save.staff || {}), barista:1 };
  save.dayState = { ...save.dayState, day:5, phase:'afternoon', t:120 };
  G.restore(save);
  const coffee = G.world.stations.get('coffee1'), bar = G.world.stations.get('barCoffee');
  coffee.beans = 0; coffee.stock = 0; coffee.timer = 0; bar.stock = 0;
  const oven = G.world.stations.get('oven1'), cookie = G.world.stations.get('dispCookie');
  oven.stock = 5; cookie.stock = 0;
  return { staff:{...G.staff}, coffeeActive:coffee.active, pantryActive:G.world.stations.get('pantry1').active, barActive:bar.active, startTime:G.time };
});
if (seed.staff.barista !== 1 || !seed.coffeeActive || !seed.pantryActive || !seed.barActive) throw new Error(`Barista seed/restore failed: ${JSON.stringify(seed)}`);

let refillOk = false;
try {
  refillOk = await waitSimulationBudget(
    () => window.__baristaWorker.active && (window.__game.stats.baristaBeanRefills | 0) >= 1 && window.__game.world.stations.get('coffee1').beans > 0,
    seed.startTime,
  );
} catch (error) {
  const diagnostic = await baristaDiagnostic('refill-wall-timeout');
  throw new Error(`Barista refill wall-timeout before simulation budget elapsed: ${JSON.stringify(diagnostic)}\n${error}`);
}
if (!refillOk) {
  const diagnostic = await baristaDiagnostic('refill-sim-budget');
  throw new Error(`Barista exceeded 10 simulated seconds to refill beans: ${JSON.stringify(diagnostic)}`);
}
const refill = await page.evaluate(() => {
  const G = window.__game, coffee = G.world.stations.get('coffee1');
  return { beans:coffee.beans, refills:G.stats.baristaBeanRefills|0, workerState:window.__baristaWorker.state, time:G.time };
});
if (refill.beans <= 0 || refill.refills < 1) throw new Error(`Barista did not refill beans: ${JSON.stringify(refill)}`);

// Give the machine a ready batch so this test measures Barista transport rather than brew timing.
const transportStart = await page.evaluate(() => {
  const G = window.__game, coffee = G.world.stations.get('coffee1'), bar = G.world.stations.get('barCoffee');
  coffee.beans = 18; coffee.stock = 4; coffee.product = 'coffee'; bar.stock = 0; bar.product = 'coffee';
  return G.time;
});
let transportOk = false;
try {
  transportOk = await waitSimulationBudget(
    () => (window.__game.stats.baristaCupsMoved | 0) >= 1 && window.__game.world.stations.get('barCoffee').stock >= 1,
    transportStart,
  );
} catch (error) {
  const diagnostic = await baristaDiagnostic('transport-wall-timeout');
  throw new Error(`Barista transport wall-timeout before simulation budget elapsed: ${JSON.stringify(diagnostic)}\n${error}`);
}
if (!transportOk) {
  const diagnostic = await baristaDiagnostic('transport-sim-budget');
  throw new Error(`Barista exceeded 10 simulated seconds to restock Coffee Bar: ${JSON.stringify(diagnostic)}`);
}

const transport = await page.evaluate(() => {
  const G = window.__game;
  return {
    moved:G.stats.baristaCupsMoved|0,
    barStock:G.world.stations.get('barCoffee').stock,
    machineStock:G.world.stations.get('coffee1').stock,
    cookieStock:G.world.stations.get('dispCookie').stock,
    ovenStock:G.world.stations.get('oven1').stock,
    active:window.__baristaWorker.active,
    time:G.time,
  };
});
if (transport.moved < 1 || transport.barStock < 1) throw new Error(`Barista did not restock Coffee Bar: ${JSON.stringify(transport)}`);
if (transport.cookieStock !== 0 || transport.ovenStock !== 5) throw new Error(`Barista touched Runner bakery work: ${JSON.stringify(transport)}`);

await page.screenshot({ path:path.join(shots, '01-barista-live.png') });

const persistence = await page.evaluate(() => {
  const G = window.__game, save = G.snapshot();
  const savedCount = save.staff && save.staff.barista;
  G.staff.barista = 0;
  G.restore(save);
  return { savedCount, restoredCount:G.staff.barista|0, coins:G.coins };
});
if (persistence.savedCount !== 1 || persistence.restoredCount !== 1) throw new Error(`Barista save round-trip failed: ${JSON.stringify(persistence)}`);
await page.waitForFunction(() => window.__baristaWorker.active, null, { timeout:10000 });

const geometry = await page.evaluate(() => ({
  bodyOverflow:document.body.scrollWidth > innerWidth + 1,
  count:window.__game.staff.barista|0,
  active:window.__baristaWorker.active,
  state:window.__baristaWorker.state,
}));
if (geometry.bodyOverflow || geometry.count !== 1 || !geometry.active) throw new Error(`Barista post-restore/browser geometry failed: ${JSON.stringify(geometry)}`);
await page.screenshot({ path:path.join(shots, '02-barista-restored.png') });

console.log(JSON.stringify({ seed, refill, transport, persistence, geometry }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));