// Build + serve + browser-smoke the production branch across phone/desktop sizes.
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
const viewports = [
  ['small', 320, 568, 1.5],
  ['portrait', 450, 800, 2],
  ['landscape', 1280, 720, 1],
];

for (const [tag, width, height, dpr] of viewports) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: tag !== 'landscape' });
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

  let buildIntent = null, pauseState = null;
  if (tag === 'small') {
    await page.click('.pause-btn');
    await page.waitForFunction(() => window.__game.userPaused === true && !document.querySelector('.pause-root')?.classList.contains('hidden'));
    const beforePause = await page.evaluate(() => window.__game.dayState.t);
    await page.waitForTimeout(650);
    const afterPause = await page.evaluate(() => window.__game.dayState.t);
    await page.click('[data-setting="music"]');
    const musicOff = await page.evaluate(() => window.__game.settings.music === false && window.__audio.musicEnabled === false && window.__audio.sfxEnabled === true);
    await page.click('[data-setting="music"]');
    await page.click('[data-action="resume"]');
    await page.waitForFunction(() => window.__game.userPaused === false);
    pauseState = { frozen: Math.abs(afterPause - beforePause) < 0.001, musicOff };

    await page.evaluate(() => {
      const g = window.__game, z = g.world.activeZoneList[0];
      g.coins = 500; g.P.x = z.x; g.P.z = z.z; g.P.vx = 0; g.P.vz = 0; g.setMove(1, 0);
    });
    await page.waitForTimeout(180);
    const walkPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0));
    await page.evaluate(() => {
      const g = window.__game, z = g.world.activeZoneList[0];
      g.setMove(0, 0); g.P.x = z.x; g.P.z = z.z; g.P.vx = 0; g.P.vz = 0;
    });
    await page.waitForTimeout(320);
    const earlyPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0));
    await page.waitForTimeout(700);
    const heldPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0));
    buildIntent = { walkPaid, earlyPaid, heldPaid };
    await page.evaluate(() => window.__game.setMove(null));
  }

  await page.evaluate(() => {
    const g = window.__game;
    const s = g.snapshot();
    s.coins = 2400;
    s.builds.a1 = g.world.area.zones.map(z => z.id);
    s.partial = {};
    s.staff = { runner: 2, cashier: 1, cleaner: 1 };
    s.staffLevels = { runner: { speed: 2, carry: 2 }, cashier: { speed: 2 }, cleaner: { speed: 1 } };
    s.machineLevels = { oven: 2, coffee: 2, display: 2 };
    s.intro = { step: 5, active: false, target: null };
    s.meta = {
      completedDays: 12,
      rewardedDays: {}, reputation: 34, perfectShifts: 5, bestServiceStreak: 18,
      shiftRatings: { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3, 6: 2, 7: 3, 8: 2, 9: 3, 10: 2, 11: 3, 12: 3 },
      petBook: { 'cat:0': 1, 'cat:1': 1, 'cat:2': 1, 'dog:0': 1, 'dog:1': 1, 'bunny:0': 1, 'bunny:2': 1 }, petDiscoveries: 7,
    };
    s.dayState = { day: 13, t: 78, phase: 'rush', _ended: false };
    s.dayStats = { served: 14, lost: 1, earned: 420, serviceFees: 0, serviceMisses: 0 };
    g.restore(s);
    for (const [id, product] of [['dispCookie','cookie'], ['dispCupcake','cupcake'], ['barCoffee','coffee'], ['barSmoothie','smoothie']]) {
      const st = g.world.stations.get(id); if (st) { st.stock = 8; st.product = product; }
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
      customers: window.__game.customers.length, staff: window.__game.staffList.length,
      calls: r.calls, triangles: r.triangles, reputation: window.__game.meta.reputation,
      repLabel: document.querySelector('.meta-rep-title')?.textContent || '',
      petCount: document.querySelector('.meta-book-count')?.textContent || '',
      bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth,
    };
  });
  await page.screenshot({ path: path.join(shots, `02-busy-${tag}.png`), fullPage: true });

  let interaction = null;
  if (tag === 'small') {
    const placeAt = async (id, point = 'front') => {
      await page.evaluate(({ id: id2, point: point2 }) => {
        const g = window.__game, st = g.world.stations.get(id2), p = st[point2] || st.front;
        g.setMove(0, 0); g.P.x = p.x; g.P.z = p.z; g.P.vx = 0; g.P.vz = 0;
      }, { id, point });
      await page.waitForTimeout(550);
    };

    await placeAt('kiosk1');
    await page.waitForFunction(() => document.querySelector('.fbtn')?.textContent === 'UPGRADES' && !document.querySelector('.fbtn')?.classList.contains('hidden'));
    await page.click('.fbtn');
    await page.waitForFunction(() => !!document.querySelector('.sheet-root .sheet'));
    await page.evaluate(() => { const g = window.__game; g.P.x = 0; g.P.z = 2.5; g.P.vx = 0; g.P.vz = 0; });
    await page.waitForFunction(() => document.querySelector('.sheet-root')?.classList.contains('hidden'), null, { timeout: 3000 });

    await placeAt('pantry1');
    await page.waitForFunction(() => document.querySelector('.fbtn')?.textContent === 'SUPPLIES' && !document.querySelector('.fbtn')?.classList.contains('hidden'));
    await page.click('.fbtn');
    await page.waitForFunction(() => document.querySelectorAll('.sheet .sbtn').length >= 2);
    await page.click('.sheet .sbtn');
    await page.waitForTimeout(600);
    const pantry = await page.evaluate(() => ({ sack: window.__game.carry.sack, guide: window.__game.contextGuide?.caption || '' }));

    await placeAt('return1');
    await page.waitForFunction(() => document.querySelector('.fbtn')?.textContent === 'RETURN ITEMS' && !document.querySelector('.fbtn')?.classList.contains('hidden'));
    await page.click('.fbtn');
    await page.waitForTimeout(250);
    const returned = await page.evaluate(() => !window.__game.carry.sack);

    await page.evaluate(() => { const g = window.__game; g.carry.fruit = 2; const b = g.world.stations.get('blender1'); b.fruit = 0; b.stock = 0; });
    await placeAt('blender1');
    await page.waitForTimeout(650);
    const blender = await page.evaluate(() => {
      const g = window.__game, b = g.world.stations.get('blender1');
      return { remaining: g.carry.fruit, machineFruit: b.fruit, stock: b.stock };
    });

    const cashBefore = await page.evaluate(() => { const g = window.__game, st = g.world.stations.get('register1'); st.pile = 27; return g.coins; });
    await placeAt('register1', 'cash');
    await page.waitForFunction(() => document.querySelector('.fbtn')?.textContent === 'COLLECT 27' && !document.querySelector('.fbtn')?.classList.contains('hidden'));
    const trayVisible = await page.evaluate(() => !document.querySelector('.cash-tray-badge')?.classList.contains('hidden'));
    await page.click('.fbtn');
    await page.waitForTimeout(250);
    const cash = await page.evaluate(before => ({ pile: window.__game.world.stations.get('register1').pile, gained: window.__game.coins - before }), cashBefore);

    interaction = { pantry, returned, blender, cash: { ...cash, trayVisible } };
    await page.screenshot({ path: path.join(shots, '05-interaction-small.png'), fullPage: true });
    await page.evaluate(() => window.__game.setMove(null));
  }

  await page.click('.meta-pawbook');
  await page.waitForFunction(() => !document.querySelector('.meta-book-root')?.classList.contains('hidden'), null, { timeout: 3000 });
  const book = await page.evaluate(() => ({
    cards: document.querySelectorAll('.meta-pet-card').length,
    found: document.querySelectorAll('.meta-pet-card:not(.locked)').length,
    title: document.querySelector('.meta-book-title')?.textContent || '',
    bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth,
  }));
  await page.screenshot({ path: path.join(shots, `03-book-${tag}.png`), fullPage: true });
  await page.click('.meta-book-close');

  await page.evaluate(() => {
    const g = window.__game;
    g.dayStats = { served: 42, lost: 1, earned: 1180, serviceFees: 9, serviceMisses: 2 }; g.shiftBestStreak = 14;
    const d = g.dayState; d.t = 239.99; d.phase = 'closing'; d._ended = false;
  });
  await page.waitForFunction(() => !!document.querySelector('.sheet-root .card'), null, { timeout: 5000 });
  await page.waitForFunction(() => !!document.querySelector('.meta-rating'), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const meta = await page.evaluate(() => ({
    stars: document.querySelector('.meta-rating-stars')?.textContent || '', reward: !!document.querySelector('.meta-reward-btn'),
    repSummary: !!document.querySelector('.meta-rep-summary'), repTitle: document.querySelector('.meta-rep-summary .meta-kicker')?.textContent || '',
    bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth,
  }));
  await page.screenshot({ path: path.join(shots, `04-summary-${tag}.png`), fullPage: true });

  const overflow = busy.bodyWidth > busy.viewportWidth + 1 || book.bodyWidth > book.viewportWidth + 1 || meta.bodyWidth > meta.viewportWidth + 1;
  const interactionBad = tag === 'small' && (!interaction || interaction.pantry.sack !== 'beans' || interaction.pantry.guide !== 'COFFEE' || !interaction.returned || (interaction.blender.machineFruit + interaction.blender.stock) <= 0 || interaction.cash.pile !== 0 || interaction.cash.gained !== 27 || !interaction.cash.trayVisible);
  const buildBad = tag === 'small' && (!buildIntent || buildIntent.walkPaid !== 0 || buildIntent.earlyPaid !== 0 || !(buildIntent.heldPaid > 0));
  const pauseBad = tag === 'small' && (!pauseState || !pauseState.frozen || !pauseState.musicOff);
  if (!info.platform || info.metaVersion !== 4 || !meta.stars || !meta.reward || !meta.repSummary || !busy.repLabel || !busy.petCount || book.cards !== 12 || book.found < 7 || overflow || interactionBad || buildBad || pauseBad || errors.length) failed = true;
  report.push({ tag, ...info, buildIntent, pauseState, busy, book, interaction, ...meta, overflow, errors });
  await ctx.close();
}

fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
