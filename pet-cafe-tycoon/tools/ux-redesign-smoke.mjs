import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const out = 'output/playwright/pet-cafe-ux';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

try {
  for (const viewport of [{ width: 320, height: 480 }, { width: 480, height: 320 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.env.PET_CAFE_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && document.querySelector('#loading')?.classList.contains('hidden'));

    const persistent = await page.evaluate(() => {
      const visible = el => {
        if (!el) return false;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      return [...document.querySelectorAll('#wallet,.pause-btn,#dayPill,#crowd,.meta-reputation,.meta-pawbook,.party-order-btn,.rewards-cal-btn')]
        .filter(visible).map(el => el.id ? `#${el.id}` : `.${el.classList[0]}`);
    });
    assert.deepEqual(persistent.sort(), ['#wallet', '.pause-btn'], 'normal play has exactly the two designed HUD containers');

    await page.locator('.pause-btn').click();
    await page.locator('.pause-root:not(.hidden)').waitFor();
    assert.equal(await page.evaluate(() => window.__game.userPaused), true, 'Café menu pauses simulation');
    await page.screenshot({ path: `${out}/menu-${viewport.width}x${viewport.height}.png` });

    await page.getByRole('button', { name: 'Pets', exact: true }).click();
    if (viewport.width === 320) {
      await page.evaluate(() => {
        const G = window.__game, snapshot = G.snapshot();
        snapshot.meta.petBook = Object.fromEntries(['cat', 'dog', 'bunny', 'hamster'].flatMap(species => [0, 1, 2, 3, 4].map(variant => [`${species}:${variant}`, 1])));
        snapshot.meta.petDiscoveries = 20;
        if (!G.restore(snapshot)) throw new Error('pet gallery fixture rejected');
      });
    }
    await page.getByRole('button', { name: /Pet Visitor Book/ }).click();
    await page.locator('.meta-book-root:not(.hidden)').waitFor();
    assert.equal(await page.locator('.pause-root').evaluate(el => el.classList.contains('hidden')), true, 'menu yields to nested destination');
    assert.equal(await page.evaluate(() => window.__game.userPaused), true, 'nested destination keeps simulation paused');
    if (viewport.width === 320) {
      await page.screenshot({ path: `${out}/pets-20-${viewport.width}x${viewport.height}.png` });
      await page.getByRole('button', { name: 'Album', exact: true }).click();
      await page.locator('.meta-album-card').first().click();
      await page.locator('.meta-album-detail:not(.hidden)').waitFor();
      await page.screenshot({ path: `${out}/pet-detail-3d-${viewport.width}x${viewport.height}.png` });
      await page.locator('.meta-album-back').click();
    }
    await page.locator('.meta-book-close').click();
    await page.locator('.pause-root:not(.hidden)').waitFor();

    await page.locator('.pause-view:not(.hidden) .cafe-back').click();
    await page.getByRole('button', { name: 'Journey', exact: true }).click();
    const bonusLink = page.locator('[data-perk="mystery-float-chip"]');
    assert.equal(await bonusLink.isVisible(), false, 'bonus route stays quiet when no contextual offer is waiting');
    await page.evaluate(() => {
      const oldChip = document.querySelector('.mystery-float-chip');
      const chip = oldChip.cloneNode(true);
      chip.classList.remove('hidden');
      chip.addEventListener('click', () => { window.__bonusRouteSmoke = true; });
      oldChip.replaceWith(chip);
      window.__cafeJournal.refresh();
    });
    assert.equal(await bonusLink.isEnabled(), true, 'a waiting contextual offer becomes reachable through Journey');
    await bonusLink.click();
    assert.equal(await page.evaluate(() => window.__bonusRouteSmoke), true, 'bonus route invokes the waiting offer');
    assert.equal(await page.locator('.pause-root').evaluate(el => !el.classList.contains('hidden')), true, 'non-modal bonus returns to the Café menu');
    await page.getByRole('button', { name: /Paw Rating/ }).click();
    await page.locator('.paw-root:not(.hidden)').waitFor();
    await page.locator('.paw-close').click();
    await page.locator('.pause-root:not(.hidden)').waitFor();

    await page.locator('.pause-view:not(.hidden) .cafe-back').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('[data-setting="reducedMotion"]').click();
    assert.equal(await page.evaluate(() => window.__game.settings.reducedMotion && document.body.classList.contains('reduced-motion')), true, 'Reduced motion is applied to saved game settings and presentation');
    await page.locator('[data-setting="reducedMotion"]').click();

    await page.getByRole('button', { name: 'RESUME' }).click();
    assert.equal(await page.evaluate(() => window.__game.userPaused), false, 'Resume returns control to gameplay');
    assert.deepEqual(errors, [], 'browser has no page errors');
    await page.close();
  }
  console.log('UX_REDESIGN_SMOKE_PASS');
} finally {
  await browser.close();
}
