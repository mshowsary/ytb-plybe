import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const out = 'output/playwright/cafe-expansion'; await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(process.env.PET_CAFE_URL || 'http://localhost:4173', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__cafeJournal && document.querySelector('#loading').classList.contains('hidden'));
  await page.evaluate(() => { const g = window.__game; g.intro.active = false; g.intro.step = 5; g.coins = 5000; g.dayState.t = 46; window.__cafeJournal.refresh(); });
  assert.match(await page.locator('.cafe-day-badge').textContent(), /s$/);
  await page.locator('.pause-btn').click();
  await page.screenshot({ path: `${out}/today.png` });
  await page.locator('[data-page="cafe"]').click();
  const before = await page.evaluate(() => window.__game.coins);
  for (const id of ['d_play_wand', 'd_play_wheel', 'd_play_fountain']) {
    await page.locator(`[data-project="${id}"]`).click();
    assert.equal(await page.locator(`[data-project="${id}"]`).isDisabled(), true);
  }
  assert.equal(await page.evaluate(() => window.__game.coins), before - 1180);
  await page.locator('[data-upgrade="carry"]').click();
  assert.equal(await page.evaluate(() => window.__game.up.carry), 1);
  const saved = await page.evaluate(() => window.__game.snapshot());
  assert.equal(saved.meta.decor.filter(id => id.startsWith('d_play_')).length, 3);
  await page.locator('.pause-card').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${out}/playground-shop.png` });
  await page.locator('[data-action="resume"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => ['d_play_wand', 'd_play_wheel', 'd_play_fountain'].every(id => window.__scene.scene.getObjectByName('decor:' + id))), true);
  await page.screenshot({ path: `${out}/gameplay.png` });
  const restored = await page.evaluate(s => window.__game.restore(s), saved); assert.notEqual(restored, false);
  await page.locator('.pause-btn').click();
  for (const [width, height] of [[183,416],[218,418],[320,480],[480,320],[1280,360]]) {
    await page.setViewportSize({ width, height });
    for (const selector of ['[data-page="cafe"]','[data-action="resume"]']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const r = await page.locator(selector).boundingBox();
      assert.ok(r.x >= -1 && r.y >= -1 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1, `${selector} fits ${width}x${height}`);
      assert.ok(r.height >= 48 && r.width >= 48);
    }
    results.push({ width, height, passed: true });
  }
  assert.deepEqual(errors, []);
  await page.locator('[data-action="resume"]').click();
  await page.setViewportSize({ width: 640, height: 640 });
  await page.waitForTimeout(300);
  for (const [tag, x, z] of [['feather-perch', 8.85, 5.8], ['hamster-wheel', -8.9, -1.5]]) {
    await page.evaluate(({ x, z }) => { window.__game.userPaused = true; const s = window.__scene; s.dist = 6; s.snap(x, z); s.render(); }, { x, z });
    await page.screenshot({ path: `${out}/${tag}.png` });
  }
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ results, savedProjects: 3, errors }, null, 2));
  console.log('CAFE_EXPANSION_SMOKE_PASS');
} finally { await browser.close(); }
