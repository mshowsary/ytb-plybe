// tools/ux-redesign-smoke.mjs — the one simple menu, driven the way a player drives it (ship plan §1.5).
//
// What it pins, at a small portrait and a small landscape:
//   * the play field carries exactly three permanent controls: the wallet, the Pet Book chip and the
//     Café button — and none of the retired pills exist at all
//   * the Café card is ONE page: a speaker switch, a glyph Today row, three tiles, reduced motion, RESUME
//   * every door pauses through ui/modal.js — the Café card, the Shop, the Pet Book from its own chip
//     on the play field, Café Stars — and closing any of them gives play back
//   * the Pet Book is one grid of uniform cards, and its outfit picker draws icons, never raw ids
//   * nothing celebrates over an open sheet: a toast raised while a sheet is open waits for it
//
// Serves dist itself: node tools/ux-redesign-smoke.mjs  (SMOKE_PORT=nnnn to move the port)
import assert from 'node:assert/strict';
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
const PORT = Number(process.env.SMOKE_PORT) || 4173;
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const out = 'output/playwright/pet-cafe-ux';
await fs.promises.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const paused = page => page.evaluate(() => window.__game.userPaused === true);

try {
  for (const viewport of [{ width: 320, height: 480 }, { width: 480, height: 320 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && document.querySelector('#loading')?.classList.contains('hidden'));
    await page.evaluate(() => { const G = window.__game; G.intro.step = 5; G.intro.active = false; G.intro.target = null; });

    // ---- the play field ------------------------------------------------------------------------
    const permanent = await page.evaluate(() => {
      const visible = el => {
        if (!el) return false;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      return [...document.querySelectorAll('#wallet,.meta-pawbook,.pause-btn,#dayPill,#crowd,#hint,#handsFull,#goalPill,.meta-reputation,.meta-streak,.party-order-btn,.rewards-cal-btn,.social-launch')]
        .filter(visible).map(el => el.id ? `#${el.id}` : `.${el.classList[0]}`);
    });
    assert.deepEqual(permanent.sort(), ['#wallet', '.meta-pawbook', '.pause-btn'], `${tag}: the play field carries exactly the three designed controls`);
    const ring = await page.evaluate(() => !!document.querySelector('#wallet.saving .wallet-ring'));
    assert.equal(ring, true, `${tag}: the wallet shows what it is saving for`);

    // ---- the Café card -------------------------------------------------------------------------
    await page.locator('.pause-btn').click();
    await page.locator('.pause-root:not(.hidden)').waitFor();
    assert.equal(await paused(page), true, `${tag}: the Café card pauses the café`);
    const card = await page.evaluate(() => ({
      pages: document.querySelectorAll('.pause-view').length,
      tiles: [...document.querySelectorAll('.cc-tile')].filter(t => !t.hidden).map(t => t.dataset.tile),
      chips: document.querySelectorAll('.cc-today .cc-chip').length,
      sound: document.querySelector('.cc-sound')?.getAttribute('aria-pressed'),
    }));
    assert.equal(card.pages, 0, `${tag}: the card has no sub-pages`);
    assert.deepEqual(card.tiles, ['pets', 'shop', 'stars'], `${tag}: three tiles`);
    assert.ok(card.chips >= 2, `${tag}: the Today row is glyph chips (phase, goal, and the theme when there is one)`);
    await page.screenshot({ path: `${out}/cafe-card-${tag}.png` });

    // One switch for music and effects together.
    await page.locator('.cc-sound').click();
    assert.deepEqual(await page.evaluate(() => [window.__game.settings.music, window.__game.settings.sfx]), [false, false], `${tag}: the speaker turns both off`);
    await page.locator('.cc-sound').click();
    assert.deepEqual(await page.evaluate(() => [window.__game.settings.music, window.__game.settings.sfx]), [true, true], `${tag}: and back on`);
    await page.locator('.cc-motion').click();
    assert.equal(await page.evaluate(() => window.__game.settings.reducedMotion && document.body.classList.contains('reduced-motion')), true, `${tag}: reduced motion is applied and saved`);
    await page.locator('.cc-motion').click();

    // ---- the Shop, through the card --------------------------------------------------------------
    await page.locator('[data-tile="shop"]').click();
    await page.locator('.sheet').waitFor();
    assert.equal(await paused(page), true, `${tag}: the Shop pauses`);
    assert.equal(await page.locator('.sheet .stitle').textContent(), 'Shop', `${tag}: titled by the door that opened it`);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.stab')].map(b => b.dataset.tab)), ['staff', 'upgrades', 'decor'], `${tag}: three tabs`);
    await page.locator('.stab[data-tab="decor"]').click();
    await page.screenshot({ path: `${out}/shop-decor-${tag}.png` });
    await page.locator('.sheet .sclose').click();
    await page.waitForFunction(() => !window.__game.userPaused);

    // ---- the Pet Book, through its own chip on the play field ------------------------------------
    await page.locator('.meta-pawbook').click();
    await page.locator('.meta-book-root:not(.hidden)').waitFor();
    assert.equal(await paused(page), true, `${tag}: the Pet Book pauses from the HUD chip too`);
    const grid = await page.evaluate(() => ({
      cards: document.querySelectorAll('.pb-card').length,
      heights: [...new Set([...document.querySelectorAll('.pb-card')].map(c => Math.round(c.getBoundingClientRect().height)))],
      found: document.querySelectorAll('button.pb-card').length,
    }));
    assert.equal(grid.cards, 20, `${tag}: one grid of every pet`);
    assert.equal(grid.heights.length, 1, `${tag}: uniform card heights, got ${grid.heights}`);
    await page.screenshot({ path: `${out}/pet-book-${tag}.png` });
    if (grid.found) {
      await page.locator('button.pb-card').first().click();
      await page.locator('.pb-detail:not([hidden])').waitFor();
      const outfits = await page.evaluate(() => [...document.querySelectorAll('.pb-outfit')].map(b => ({ label: b.getAttribute('aria-label'), text: b.textContent.trim(), svg: !!b.querySelector('svg') })));
      assert.ok(outfits.length > 1, `${tag}: the outfit picker is there`);
      assert.equal(outfits.filter(o => /acc_/.test(o.label) || /acc_/.test(o.text)).length, 0, `${tag}: no raw accessory ids`);
      assert.equal(outfits[0].label, 'No outfit', `${tag}: a none chip comes first`);
      assert.ok(outfits.every(o => o.svg), `${tag}: every chip draws its icon`);
      await page.screenshot({ path: `${out}/pet-detail-${tag}.png` });
      await page.locator('.pb-back').click();
    }
    await page.locator('.meta-book-close').click();
    await page.waitForFunction(() => !window.__game.userPaused);

    // ---- Café Stars ------------------------------------------------------------------------------
    await page.locator('.pause-btn').click();
    await page.locator('[data-tile="stars"]').click();
    await page.locator('.paw-root:not(.hidden)').waitFor();
    assert.equal(await paused(page), true, `${tag}: Café Stars pauses`);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.paw-stars .paw-pip').length), 5, `${tag}: five stars`);
    await page.screenshot({ path: `${out}/cafe-stars-${tag}.png` });

    // ---- a moment raised while a sheet is open waits for it ----------------------------------------
    await page.evaluate(() => window.__game.hud.toast({ cells: ['+', 1], aria: 'Smoke toast' }));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => { const t = document.querySelector('.toast'); return !!t && t.classList.contains('show') && getComputedStyle(t).visibility !== 'hidden'; }), false, `${tag}: nothing celebrates over a sheet`);
    await page.locator('.paw-close').click();
    await page.waitForFunction(() => { const t = document.querySelector('.toast'); return !window.__game.userPaused && !!t && t.classList.contains('show'); }, null, { timeout: 5000 });

    assert.deepEqual(errors, [], `${tag}: browser has no page errors`);
    await page.close();
  }
  console.log('UX_REDESIGN_SMOKE_PASS');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
