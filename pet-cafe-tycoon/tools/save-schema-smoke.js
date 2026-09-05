// Task 09 browser acceptance: invalid/future save remains protected; explicit retry migrates a
// legitimate legacy save and the live game/world receive only bounded canonical state.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'save-schema');
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
await new Promise(resolve => server.listen(4179, '127.0.0.1', resolve));

const legacy = {
  coins: 777,
  built: ['z_seats1', 'z_oven2', 'z_register2', 'z_coffee', 'definitely-not-a-zone'],
  partial: { z_hire: 200, z_coffee: 6999, fake: 10 },
  upgrades: { speed: 99, carry: -3, income: 2 },
  staff: { runner: 99, cashier: 9, cleaner: -5 },
  stats: { lifetimeEarned: 5000 },
  settings: { sfx: false },
  dayState: { day: 3, t: 70, phase: 'closing', _ended: true },
  stars: { oven1: 99, coffee1: 3, fakeStation: 3 },
  meta: { completedDays: 2, reputation: 999, perfectShifts: 99, career: { renovationLevel: 5 } },
};

function sdk() {
  return `
    window.__ytSchema = { loadCalls:0, saves:[], gameReady:false };
    const legacy = ${JSON.stringify(legacy)};
    window.ytgame = {
      IN_PLAYABLES_ENV:true,
      game:{
        firstFrameReady(){},
        gameReady(){ window.__ytSchema.gameReady=true; },
        async loadData(){
          window.__ytSchema.loadCalls++;
          return window.__ytSchema.loadCalls === 1
            ? JSON.stringify({ v: 999, coins: 999999 })
            : JSON.stringify(legacy);
        },
        async saveData(raw){ window.__ytSchema.saves.push(raw); }
      },
      system:{
        isAudioEnabled(){ return true; },
        onAudioEnabledChange(cb){ window.__ytSchema.audioCb=cb; },
        onPause(cb){ window.__ytSchema.pauseCb=cb; },
        onResume(cb){ window.__ytSchema.resumeCb=cb; },
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
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:sdk() }));

try {
  await page.goto('http://127.0.0.1:4179/', { waitUntil:'domcontentloaded' });

  // Syntactically valid JSON with an unsupported schema version must NOT start a fresh game or
  // authorize writes. This is the key Task-09 boundary: validation precedes write authorization.
  await page.waitForFunction(() => document.getElementById('loading').dataset.state === 'invalid-save', null, { timeout:7000 });
  const invalid = await page.evaluate(async () => ({
    state:document.getElementById('loading').dataset.state,
    gameExists:!!window.__game,
    gameReady:window.__ytSchema.gameReady,
    loadCalls:window.__ytSchema.loadCalls,
    saveProtected:window.__platform.saveProtected,
    saveResult:await window.__platform.save({ v:4, coins:1 }),
    sdkSaves:window.__ytSchema.saves.length,
  }));
  if (invalid.state !== 'invalid-save' || invalid.gameExists || invalid.gameReady || invalid.loadCalls !== 1 || !invalid.saveProtected || invalid.saveResult !== false || invalid.sdkSaves !== 0) {
    throw new Error(`future schema was not safely rejected: ${JSON.stringify(invalid)}`);
  }
  await page.screenshot({ path:path.join(shots, '01-unsupported-save-protected.png') });

  await page.click('#loading .boot-retry');
  await page.waitForFunction(() => window.__ytSchema.gameReady && window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout:9000 });

  const recovered = await page.evaluate(() => {
    const G = window.__game;
    return {
      loadCalls:window.__ytSchema.loadCalls,
      saveProtected:window.__platform.saveProtected,
      sdkSaves:window.__ytSchema.saves.length,
      coins:G.coins,
      upgrades:{ ...G.up },
      staff:{ ...G.staff },
      dayState:{ ...G.dayState },
      built:[...G.world.built],
      partial:{ ...G.world.partial },
      stars:{ ...G.stars },
      reputation:G.meta.reputation,
      completedDays:G.meta.completedDays,
      perfectShifts:G.meta.perfectShifts,
      renovationLevel:G.meta.career.renovationLevel,
      snapshot:G.snapshot(),
    };
  });

  const expectedBuilt = ['z_seats1', 'z_oven2', 'z_register2'];
  if (recovered.loadCalls !== 2 || recovered.saveProtected || recovered.sdkSaves !== 0) throw new Error(`retry authorization wrong: ${JSON.stringify(recovered)}`);
  if (recovered.coins !== 777) throw new Error(`coins migration wrong: ${JSON.stringify(recovered)}`);
  if (JSON.stringify(recovered.upgrades) !== JSON.stringify({ speed:3, carry:0, income:2 })) throw new Error(`upgrade clamp wrong: ${JSON.stringify(recovered.upgrades)}`);
  if (recovered.staff.runner !== 2 || recovered.staff.cashier !== 1 || recovered.staff.cleaner !== 0 || recovered.staff.barista !== 0) throw new Error(`staff clamp wrong: ${JSON.stringify(recovered.staff)}`);
  if (recovered.dayState.day !== 3 || recovered.dayState.t !== 70 || recovered.dayState.phase !== 'rush' || recovered.dayState._ended) throw new Error(`day migration wrong: ${JSON.stringify(recovered.dayState)}`);
  if (JSON.stringify(recovered.built) !== JSON.stringify(expectedBuilt)) throw new Error(`build dependency validation wrong: ${JSON.stringify(recovered.built)}`);
  if (JSON.stringify(recovered.partial) !== JSON.stringify({ z_hire:200 })) throw new Error(`partial validation wrong: ${JSON.stringify(recovered.partial)}`);
  if (JSON.stringify(recovered.stars) !== JSON.stringify({ oven1:3 })) throw new Error(`star validation wrong: ${JSON.stringify(recovered.stars)}`);
  if (recovered.reputation !== 6 || recovered.completedDays !== 2 || recovered.perfectShifts !== 2 || recovered.renovationLevel !== 0) throw new Error(`meta progression clamp wrong: ${JSON.stringify(recovered)}`);
  if (recovered.snapshot.v !== 4 || recovered.snapshot.coins !== 777) throw new Error(`canonical snapshot wrong: ${JSON.stringify(recovered.snapshot)}`);

  // After recovery, an explicit save must emit the canonical v4 state, not the hostile legacy shape.
  const saved = await page.evaluate(async () => {
    const ok = await window.__platform.save(window.__game.snapshot());
    const raw = window.__ytSchema.saves.at(-1);
    return { ok, count:window.__ytSchema.saves.length, data:raw ? JSON.parse(raw) : null };
  });
  if (!saved.ok || saved.count !== 1 || !saved.data || saved.data.v !== 4) throw new Error(`canonical save dispatch failed: ${JSON.stringify(saved)}`);
  if (JSON.stringify(saved.data.builds.a1) !== JSON.stringify(expectedBuilt) || JSON.stringify(saved.data.partial) !== JSON.stringify({ z_hire:200 })) {
    throw new Error(`canonical world state was not persisted: ${JSON.stringify(saved.data)}`);
  }

  await page.screenshot({ path:path.join(shots, '02-legacy-save-migrated.png') });
  const report = { invalid, recovered, saved:{ ok:saved.ok, count:saved.count, v:saved.data.v, builds:saved.data.builds, partial:saved.data.partial } };
  fs.writeFileSync(path.join(shots, 'save-schema-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
} finally {
  await ctx.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
