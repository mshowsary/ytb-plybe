// tools/cafe-expansion-smoke.mjs — repaired 2026-09-20.
//
// This used to drive ui/cafeJournal.js (window.__cafeJournal, a multi-page Café menu with its own
// `[data-page="cafe"]` playground shop). cafeJournal is deleted (docs/SHIP-PLAN-2026-09-19.md
// Batch D, "one simple menu"). The surviving surface for "what today is" is the Café card's Today
// row (phase clock, goal, theme glyph — src/ui/pauseMenu.js's `.cc-today`); the surviving surface
// for buying playground décor is the unified Shop's Décor tab (src/ui/sheets.js renderDecorTab,
// reached from the Café card's Shop tile). Both are re-pointed here. `data-project="..."` buttons
// never existed in this generation; the Décor tab's buy buttons are `[data-decor-buy="id"]`.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
await fs.access(path.join(dist, 'index.html')).catch(() => { throw new Error('dist missing: run npm run build first'); });
const out = 'output/playwright/cafe-expansion';
await fs.mkdir(out, { recursive: true });

let baseUrl = process.env.PET_CAFE_URL || null;
let server = null;
if (!baseUrl) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  server = http.createServer((req, res) => {
    let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
    fs.readFile(p).then(b => { res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); })
      .catch(() => { res.writeHead(404); res.end(); });
  });
  await new Promise(resolve => server.listen(4503, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:4503/';
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 30000 });
  await page.evaluate(() => { const g = window.__game; g.intro.active = false; g.intro.step = 5; g.coins = 5000; g.dayState.t = 46; window.__pauseMenu.update(); });

  // ---- the Today row survives cafeJournal: phase, goal, theme, all glyph-only ------------------
  await page.locator('.pause-btn').click();
  await page.waitForFunction(() => !document.querySelector('.pause-root')?.classList.contains('hidden'));
  const todayChips = await page.locator('.cc-today .cc-chip').count();
  assert.ok(todayChips >= 1, `Today row must show at least the phase chip, saw ${todayChips}`);
  const badgeText = (await page.locator('.cafe-day-badge').textContent()) || '';
  assert.ok(badgeText.length > 0, 'the Cafe button badge must show something (a day number or a rush countdown)');
  await page.screenshot({ path: `${out}/today.png` });

  // ---- décor purchases persist and materialize in the scene --------------------------------------
  await page.locator('.cc-tile[data-tile="shop"]').click();
  await page.waitForFunction(() => !!document.querySelector('.sheet-root .sheet'));
  await page.locator('.stab[data-tab="decor"]').click();
  const before = await page.evaluate(() => window.__game.coins);
  for (const id of ['d_play_wand', 'd_play_wheel', 'd_play_fountain']) {
    const buy = page.locator(`[data-decor-buy="${id}"]`);
    await buy.waitFor({ state: 'visible', timeout: 3000 });
    await buy.click();
    await page.waitForFunction(k => !document.querySelector(`[data-decor-buy="${k}"]`), id, { timeout: 3000 });
    const owned = await page.evaluate(k => !!document.querySelector(`.decor-card[data-decor="${k}"]`)?.classList.contains('is-owned'), id);
    assert.equal(owned, true, `${id} must show as owned once bought`);
  }
  assert.equal(await page.evaluate(() => window.__game.coins), before - 1180, 'three playground pieces must cost exactly 180+360+640');
  const saved = await page.evaluate(() => window.__game.snapshot());
  assert.equal(saved.meta.decor.filter(id => id.startsWith('d_play_')).length, 3, 'all three purchases must persist in meta.decor');
  await page.locator('.sheet').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${out}/playground-shop.png` });

  // Closing the Shop is the only sheet on the modal stack (the Café card already closed itself when
  // the tile opened it — src/ui/pauseMenu.js's openTile), so this resumes play on its own.
  await page.locator('.sheet .sclose').click();
  await page.waitForFunction(() => window.__game.userPaused === false);
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => ['d_play_wand', 'd_play_wheel', 'd_play_fountain'].every(id => window.__scene.scene.getObjectByName('decor:' + id))),
    true, 'every bought piece must be placed in the live scene',
  );
  await page.screenshot({ path: `${out}/gameplay.png` });
  const restored = await page.evaluate(s => window.__game.restore(s), saved);
  assert.notEqual(restored, false, 'a genuine post-purchase snapshot must restore');

  // ---- the Cafe card fits every certified extreme viewport ---------------------------------------
  for (const [width, height] of [[183, 416], [218, 418], [320, 480], [480, 320], [1280, 360]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.pause-btn').click();
    await page.waitForFunction(() => !document.querySelector('.pause-root')?.classList.contains('hidden'));
    for (const selector of ['.pause-card', '[data-action="resume"]']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const r = await page.locator(selector).boundingBox();
      assert.ok(r.x >= -1 && r.y >= -1 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1, `${selector} fits ${width}x${height}`);
    }
    const resumeBox = await page.locator('[data-action="resume"]').boundingBox();
    assert.ok(resumeBox.height >= 48 && resumeBox.width >= 48, `RESUME must keep a 48px tap target at ${width}x${height}`);
    await page.locator('[data-action="resume"]').click();
    await page.waitForFunction(() => window.__game.userPaused === false);
    results.push({ width, height, passed: true });
  }
  assert.deepEqual(errors, []);

  await fs.writeFile(`${out}/results.json`, JSON.stringify({ results, savedProjects: 3, errors }, null, 2));
  console.log('CAFE_EXPANSION_SMOKE_PASS');
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
