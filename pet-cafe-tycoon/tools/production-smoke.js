// Build + serve + browser-smoke the production branch and capture phone/desktop screenshots.
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

execSync('npm run build', { stdio: 'inherit' });
const dist = path.resolve('dist');
const shots = path.resolve('shots-production');
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b);
  });
}).listen(4174);

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const report = [];
let failed = false;

for (const [tag, width, height, dpr] of [['portrait', 450, 800, 2], ['landscape', 1280, 720, 1]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: tag === 'portrait' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.ytgame={IN_PLAYABLES_ENV:false};' }));
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const r = window.__scene.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles, platform: !!window.__platform, metaVersion: window.__game.snapshot().v };
  });
  await page.screenshot({ path: path.join(shots, `01-boot-${tag}.png`), fullPage: true });

  await page.evaluate(() => {
    const g = window.__game;
    const s = g.snapshot();
    s.coins = 2400;
    s.builds.a1 = g.world.area.zones.map(z => z.id);
    s.staff = { runner: 2, cashier: 1, cleaner: 1 };
    s.staffLevels = { runner: { speed: 2, carry: 2 }, cashier: { speed: 2 }, cleaner: { speed: 1 } };
    s.machineLevels = { oven: 2, coffee: 2, display: 2 };
    s.intro = { step: 5, active: false, target: null };
    s.meta = {
      completedDays: 12,
      rewardedDays: {},
      reputation: 34,
      perfectShifts: 5,
      bestServiceStreak: 18,
      shiftRatings: { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3, 6: 2, 7: 3, 8: 2, 9: 3, 10: 2, 11: 3, 12: 3 },
      petBook: { 'cat:0': 1, 'cat:1': 1, 'cat:2': 1, 'dog:0': 1, 'dog:1': 1, 'bunny:0': 1, 'bunny:2': 1 },
      petDiscoveries: 7,
    };
    s.dayState = { day: 13, t: 78, phase: 'rush', _ended: false };
    s.dayStats = { served: 14, lost: 1, earned: 420 };
    g.restore(s);

    for (const [id, product] of [['dispCookie','cookie'], ['dispCupcake','cupcake'], ['barCoffee','coffee'], ['barSmoothie','smoothie']]) {
      const st = g.world.stations.get(id);
      if (st) { st.stock = 8; st.product = product; }
    }
    const bowl = g.world.stations.get('bowl1'); if (bowl) bowl.stock = 8;
    const oven1 = g.world.stations.get('oven1'); if (oven1) oven1.stock = 8;
    const oven2 = g.world.stations.get('oven2'); if (oven2) oven2.stock = 8;
    const coffee = g.world.stations.get('coffee1'); if (coffee) { coffee.stock = 8; coffee.beans = 12; }
  });
  await page.waitForTimeout(8500);

  const busy = await page.evaluate(() => {
    const r = window.__scene.renderer.info.render;
    return {
      customers: window.__game.customers.length,
      staff: window.__game.staffList.length,
      calls: r.calls,
      triangles: r.triangles,
      reputation: window.__game.meta.reputation,
      repLabel: document.querySelector('.meta-rep-title')?.textContent || '',
      petCount: document.querySelector('.meta-book-count')?.textContent || '',
    };
  });
  await page.screenshot({ path: path.join(shots, `02-busy-${tag}.png`), fullPage: true });

  await page.click('.meta-pawbook');
  await page.waitForFunction(() => !document.querySelector('.meta-book-root')?.classList.contains('hidden'), null, { timeout: 3000 });
  const book = await page.evaluate(() => ({
    cards: document.querySelectorAll('.meta-pet-card').length,
    found: document.querySelectorAll('.meta-pet-card:not(.locked)').length,
    title: document.querySelector('.meta-book-title')?.textContent || '',
  }));
  await page.screenshot({ path: path.join(shots, `03-book-${tag}.png`), fullPage: true });
  await page.click('.meta-book-close');

  await page.evaluate(() => {
    const g = window.__game;
    g.dayStats = { served: 42, lost: 1, earned: 1180 };
    g.shiftBestStreak = 14;
    const d = g.dayState;
    d.t = 239.99; d.phase = 'closing'; d._ended = false;
  });
  await page.waitForFunction(() => !!document.querySelector('.sheet-root .card'), null, { timeout: 5000 });
  await page.waitForFunction(() => !!document.querySelector('.meta-rating'), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const meta = await page.evaluate(() => ({
    stars: document.querySelector('.meta-rating-stars')?.textContent || '',
    reward: !!document.querySelector('.meta-reward-btn'),
    repSummary: !!document.querySelector('.meta-rep-summary'),
    repTitle: document.querySelector('.meta-rep-summary .meta-kicker')?.textContent || '',
  }));
  await page.screenshot({ path: path.join(shots, `04-summary-${tag}.png`), fullPage: true });

  if (!info.platform || info.metaVersion !== 4 || !meta.stars || !meta.reward || !meta.repSummary || !busy.repLabel || !busy.petCount || book.cards !== 12 || book.found < 7 || errors.length) failed = true;
  report.push({ tag, ...info, busy, book, ...meta, errors });
  await ctx.close();
}

fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
