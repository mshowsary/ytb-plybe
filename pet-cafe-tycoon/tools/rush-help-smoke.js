// End-to-end rewarded Rush Crew regression. Uses the real browser game, real customer pressure and
// the real single Rush Help surface; only the YouTube ad host is mocked. The runner is deliberately
// frozen after spawning so the fixture can hold a deterministic bottleneck long enough to inspect.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'rush-help');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
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

const mockSdk = `
window.__rewardIds=[]; window.__saved=[];
window.ytgame={IN_PLAYABLES_ENV:true,
  game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(raw){window.__saved.push(raw);return true}},
  system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},
  engagement:{sendScore(){}},
  ads:{async requestRewardedAd(id){window.__rewardIds.push(id);return true},async requestInterstitialAd(){return true}}
};
`;

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:320, height:568 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk }));
await page.goto('http://127.0.0.1:4179/', { waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });

await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false;
  G.dayState.day = 4; G.dayState.t = 72; G.dayState.phase = 'rush';
  G.coins = 5000;
  G.staff.runner = 1;
  G.staffLevels.runner.speed = 0; G.staffLevels.runner.carry = 0;
  G.meta.rewardedDays['relief:4'] = 0;
  const oven = G.world.stations.get('oven1');
  const display = G.world.stations.get('dispCookie');
  const secondDisplay = G.world.stations.get('dispCupcake');
  if (oven) oven.stock = 12;
  if (display) display.stock = 0;
  // The second low display is classifier evidence only; it keeps the single genuine waiting guest
  // from needing to reach the last four seconds of patience before the deterministic offer appears.
  if (secondDisplay) { secondDisplay.active = true; secondDisplay.stock = 0; }
});

await page.waitForFunction(() => window.__game.staffList.some(s => s.kind === 'runner'), null, { timeout:5000 });
await page.evaluate(() => {
  const r = window.__game.staffList.find(s => s.kind === 'runner');
  r.state = 'frozen-fixture'; r.mover.hasTarget = false; r.items.length = 0;
});

// A real spawned guest must actually become stuck at the empty cookie shelf. We do not manufacture
// a fake customer record because that would bypass the customer/nav system this feature responds to.
await page.waitForFunction(() => window.__game.customers.some(c => !c.done && c.state === 'queue' && c.mood === 'wait'), null, { timeout:22000 });
await page.waitForFunction(() => {
  const el = document.querySelector('.relief-pill');
  return el && !el.classList.contains('hidden') && /Rush Runner/i.test(el.textContent || '');
}, null, { timeout:9000 });

const pillGeometry = await page.evaluate(() => {
  const el = document.querySelector('.relief-pill'); const r = el.getBoundingClientRect();
  return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, text:el.textContent.trim() };
});
if (pillGeometry.left < -1 || pillGeometry.right > 321 || pillGeometry.bottom > 569 || pillGeometry.height < 47.5) {
  throw new Error(`Rush Help pill geometry failed: ${JSON.stringify(pillGeometry)}`);
}
await page.screenshot({ path:path.join(shots,'01-rush-runner-pill.png') });

await page.locator('.relief-pill').click();
await page.waitForFunction(() => {
  const el = document.querySelector('.relief-card');
  return el && !el.classList.contains('hidden') && /\+1 TIER/i.test(el.textContent || '');
}, null, { timeout:3000 });
const cardGeometry = await page.evaluate(() => {
  const el = document.querySelector('.relief-card'); const r = el.getBoundingClientRect();
  const button = el.querySelector('.relief-watch').getBoundingClientRect();
  return { card:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}, watchHeight:button.height, text:el.textContent.replace(/\s+/g,' ').trim() };
});
if (cardGeometry.card.left < -1 || cardGeometry.card.right > 321 || cardGeometry.card.bottom > 569 || cardGeometry.watchHeight < 47.5) {
  throw new Error(`Rush Help card geometry failed: ${JSON.stringify(cardGeometry)}`);
}
if (!/existing Runner/i.test(cardGeometry.text) || !/Permanent upgrades are unchanged/i.test(cardGeometry.text)) {
  throw new Error(`Rush Help card did not explain temporary semantics: ${cardGeometry.text}`);
}
await page.screenshot({ path:path.join(shots,'02-rush-runner-card.png') });

await page.locator('.relief-watch').click();
await page.waitForFunction(() => {
  const G = window.__game;
  return G.boosts && G.boosts.rushCrew && G.boosts.rushCrew.role === 'runner' &&
    G.meta.rewardedDays['relief:4'] && window.__rewardIds.includes('pet-cafe-rush-crew');
}, null, { timeout:5000 });

const awarded = await page.evaluate(() => {
  const G = window.__game;
  const snap = G.snapshot();
  return {
    rewardIds:[...window.__rewardIds],
    boost:{...G.boosts.rushCrew},
    savedBoost:snap.boosts && snap.boosts.rushCrew ? {...snap.boosts.rushCrew} : null,
    claim:G.meta.rewardedDays['relief:4'],
    permanent:{...G.staffLevels.runner},
  };
});
if (awarded.rewardIds.filter(x => x === 'pet-cafe-rush-crew').length !== 1) throw new Error(`rewarded ad called wrong number of times: ${JSON.stringify(awarded)}`);
if (!awarded.savedBoost || awarded.savedBoost.role !== 'runner' || awarded.savedBoost.day !== 4) throw new Error(`active Rush Crew missing from snapshot: ${JSON.stringify(awarded)}`);
if (awarded.permanent.speed !== 0 || awarded.permanent.carry !== 0) throw new Error(`temporary reward mutated permanent runner upgrades: ${JSON.stringify(awarded)}`);

// Round-trip through the game's own restore path while the same rush is still active.
await page.evaluate(() => { const G=window.__game; const save=G.snapshot(); G.restore(save); });
await page.waitForFunction(() => window.__game.boosts && window.__game.boosts.rushCrew && window.__game.boosts.rushCrew.role === 'runner', null, { timeout:3000 });

// The first economy-experience tick after Rush ends must remove the live transient state. The next
// snapshot must therefore not carry it into afternoon or any future reload.
await page.evaluate(() => { window.__game.dayState.phase = 'afternoon'; window.__game.dayState.t = 151; });
await page.waitForFunction(() => !window.__game.boosts.rushCrew, null, { timeout:3000 });
const expired = await page.evaluate(() => {
  const snap = window.__game.snapshot();
  return { live:window.__game.boosts.rushCrew || null, saved:snap.boosts && snap.boosts.rushCrew || null };
});
if (expired.live || expired.saved) throw new Error(`Rush Crew leaked beyond rush: ${JSON.stringify(expired)}`);

console.log(JSON.stringify({ pillGeometry, cardGeometry, awarded, expired }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
