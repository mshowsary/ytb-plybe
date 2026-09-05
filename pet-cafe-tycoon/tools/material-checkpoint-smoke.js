// Integration smoke for Task 08 material checkpoints against the built Playables bundle.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
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
await new Promise(resolve => server.listen(4177, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({
  status: 200,
  contentType: 'text/javascript',
  body: `
    window.__yt = { saves: [] };
    window.ytgame = {
      IN_PLAYABLES_ENV: true,
      game: {
        firstFrameReady(){ window.__yt.firstFrame = true; },
        gameReady(){ window.__yt.gameReady = true; },
        async loadData(){ return ''; },
        async saveData(raw){ window.__yt.saves.push(raw); }
      },
      system: {
        isAudioEnabled(){ return true; }, onAudioEnabledChange(){}, onPause(){}, onResume(){}, getLanguage(){ return 'en'; }
      },
      engagement: { async sendScore(){} }, ads: {}
    };
  `,
}));

await page.goto('http://127.0.0.1:4177/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__yt.gameReady, null, { timeout: 30000 });
await page.waitForTimeout(100);

// Two material marks made before one update boundary must produce exactly one latest snapshot.
const coalesceBefore = await page.evaluate(() => window.__yt.saves.length);
await page.evaluate(() => {
  const g = window.__game;
  g.requestCheckpoint('test-upgrade');
  g.coins += 3;
  g.requestCheckpoint('test-hire');
  g.update(0);
});
await page.waitForTimeout(20);
const coalesceAfter = await page.evaluate(() => window.__yt.saves.length);
if (coalesceAfter !== coalesceBefore + 1) {
  throw new Error(`checkpoint marks did not coalesce: ${coalesceBefore} -> ${coalesceAfter}`);
}

// Real register collection must request a coherent save containing both wallet and lifetime earnings.
const cashResult = await page.evaluate(() => {
  const g = window.__game, st = g.world.stations.get('register1');
  g.intro.step = 5; g.intro.active = false; g.intro.target = null; g.setMove(0, 0);
  st.pile = 125;
  g.P.x = st.cash.x; g.P.z = st.cash.z; g.P.vx = 0; g.P.vz = 0;
  return { saves: window.__yt.saves.length, coins: g.coins, lifetime: g.stats.lifetimeEarned | 0 };
});
await page.waitForFunction(before => {
  const g = window.__game, st = g.world.stations.get('register1');
  return st.pile === 0 && window.__yt.saves.length > before.saves;
}, cashResult, { timeout: 3000 });
const cashSaved = await page.evaluate(before => {
  const g = window.__game;
  const snapshots = window.__yt.saves.slice(before.saves).map(raw => JSON.parse(raw));
  return { currentCoins: g.coins, currentLifetime: g.stats.lifetimeEarned | 0, snapshots };
}, cashResult);
const cashSnapshot = cashSaved.snapshots.at(-1);
if (!cashSnapshot || cashSnapshot.coins !== cashSaved.currentCoins || cashSnapshot.lifetimeEarned !== cashSaved.currentLifetime) {
  throw new Error(`cash checkpoint was not coherent: ${JSON.stringify(cashSaved)}`);
}
if (cashSaved.currentCoins - cashResult.coins !== 125 || cashSaved.currentLifetime - cashResult.lifetime !== 125) {
  throw new Error(`cash collection mutation mismatch: ${JSON.stringify({ before: cashResult, after: cashSaved })}`);
}

// Continuous stand-to-build spending should checkpoint milestones, not request one save per frame.
const buildStart = await page.evaluate(() => {
  const g = window.__game, z = g.world.activeZoneList[0];
  if (!z) throw new Error('no active build zone');
  g.coins = Math.max(g.coins, z.price + 50);
  g.P.x = z.x; g.P.z = z.z; g.P.vx = 0; g.P.vz = 0; g.setMove(0, 0);
  return { zoneId: z.id, price: z.price, saves: window.__yt.saves.length };
});
await page.waitForFunction(({ zoneId }) => window.__game.world.built.has(zoneId), buildStart, { timeout: 7000 });
await page.waitForTimeout(80);
const buildResult = await page.evaluate(start => {
  const g = window.__game;
  const snapshots = window.__yt.saves.slice(start.saves).map(raw => JSON.parse(raw));
  return { saves: snapshots.length, snapshots, coins: g.coins, built: g.world.built.has(start.zoneId) };
}, buildStart);
if (!buildResult.built || buildResult.saves < 1 || buildResult.saves > 7) {
  throw new Error(`build checkpoint cadence invalid: ${JSON.stringify(buildResult)}`);
}
const buildSnapshot = buildResult.snapshots.at(-1);
if (!buildSnapshot || !buildSnapshot.builds?.a1?.includes(buildStart.zoneId) || buildSnapshot.coins !== buildResult.coins) {
  throw new Error(`completed build missing from final checkpoint: ${JSON.stringify(buildResult)}`);
}

if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ coalescedWrites: coalesceAfter - coalesceBefore, cashWrites: cashSaved.snapshots.length, buildWrites: buildResult.saves, zone: buildStart.zoneId }, null, 2));
await browser.close();
await new Promise(resolve => server.close(resolve));
