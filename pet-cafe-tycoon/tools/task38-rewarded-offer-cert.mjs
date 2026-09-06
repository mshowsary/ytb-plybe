import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.PET_CAFE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.PET_CAFE_CERT_DIR || 'artifacts/task38-rewarded';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

async function geometry(selector) {
  return page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight };
  });
}
function inside(g, pad = 1) {
  return g.left >= -pad && g.top >= -pad && g.right <= g.vw + pad && g.bottom <= g.vh + pad;
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game && !!window.__platform, null, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 20_000 });

  // Create a real smart-relief recommendation using existing live state only: three empty active
  // displays make Carry the useful permanent purchase, while 150/300 coins places the player in the
  // intended "almost there" band. No offer/reward helper is invoked directly by this certificate.
  await page.evaluate(() => {
    const G = window.__game;
    G.intro.step = 5; G.intro.active = false;
    G.coins = 150;
    G.up.carry = 0;
    G.dayState.day = 2;
    G.dayState.phase = 'afternoon';
    G.dayState.t = 150;
    G.time = 20;
    for (const id of ['dispCookie', 'dispCupcake', 'barCoffee']) {
      const st = G.world.stations.get(id);
      if (!st) throw new Error(`missing display ${id}`);
      st.active = true; st.stock = 0; st.capacity = Math.max(8, st.capacity || 8);
    }
  });

  // Even sustained useful pressure is not allowed to monetize the first minute.
  await page.waitForTimeout(1_200);
  assert.equal(await page.locator('.relief-root').evaluate(el => !el.classList.contains('hidden')), false,
    'rewarded surface must remain hidden in the first minute');

  await page.evaluate(() => { window.__game.time = 61; });
  const compact = page.locator('.relief-root:not(.hidden) .relief-pill:not(.hidden)');
  await compact.waitFor({ state: 'visible', timeout: 8_000 });

  assert.equal(await page.locator('.relief-card').evaluate(el => el.classList.contains('hidden')), true,
    'eligible offer must remain collapsed until explicit tap');
  assert.equal((await page.locator('.relief-pill-ad').textContent())?.includes('AD'), true,
    'AD disclosure must be visible on the collapsed surface');
  assert.match((await page.locator('.relief-pill-value').textContent()) || '', /^\+\d+$/,
    'collapsed coin offer must communicate the concrete benefit amount');
  assert.equal(await page.locator('.relief-benefit-icon svg').count(), 1, 'collapsed offer must use one authored pictogram');

  let g = await geometry('.relief-pill');
  assert.equal(inside(g), true, `320px collapsed offer must fit viewport: ${JSON.stringify(g)}`);
  assert.ok(g.left >= 118, `collapsed offer must reserve the left floating-joystick lane: ${JSON.stringify(g)}`);
  assert.equal(await page.evaluate(() => window.__platform.adBusy), false, 'collapsed/visible offer cannot start an ad');
  await page.screenshot({ path: `${outDir}/01-compact-320x568.png`, fullPage: true });

  await compact.click();
  const card = page.locator('.relief-card:not(.hidden)');
  await card.waitFor({ state: 'visible', timeout: 2_000 });
  g = await geometry('.relief-card');
  assert.equal(inside(g), true, `320px expanded offer must fit viewport: ${JSON.stringify(g)}`);
  assert.equal(await page.evaluate(() => window.__platform.adBusy), false, 'expanding must not activate the reward');
  await page.screenshot({ path: `${outDir}/02-expanded-320x568.png`, fullPage: true });

  // Drag on non-button explanatory copy. The whole rewarded root is UI-owned; the floating joystick
  // must stay hidden instead of appearing under the card.
  const whyBox = await page.locator('.relief-why').boundingBox();
  assert.ok(whyBox);
  await page.mouse.move(whyBox.x + whyBox.width / 2, whyBox.y + whyBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(whyBox.x + whyBox.width / 2 + 28, whyBox.y + whyBox.height / 2 + 4);
  assert.equal(await page.locator('#joy').evaluate(el => el.classList.contains('hidden')), true,
    'dragging rewarded-card copy must not spawn the floating joystick');
  await page.mouse.up();

  await page.locator('.relief-close').click();
  await page.waitForFunction(() => document.querySelector('.relief-root')?.classList.contains('hidden'));

  // Dismissal is intentionally per-shift/day, so reload the runtime for independent short-landscape
  // layout evidence rather than mutating the dismissal contract.
  await page.setViewportSize({ width: 568, height: 320 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game && document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 20_000 });
  await page.evaluate(() => {
    const G = window.__game;
    G.intro.step = 5; G.intro.active = false; G.coins = 150; G.up.carry = 0;
    G.dayState.day = 2; G.dayState.phase = 'afternoon'; G.dayState.t = 150; G.time = 61;
    for (const id of ['dispCookie', 'dispCupcake', 'barCoffee']) {
      const st = G.world.stations.get(id); st.active = true; st.stock = 0; st.capacity = Math.max(8, st.capacity || 8);
    }
  });
  const compactLandscape = page.locator('.relief-root:not(.hidden) .relief-pill:not(.hidden)');
  await compactLandscape.waitFor({ state: 'visible', timeout: 8_000 });
  g = await geometry('.relief-pill');
  assert.equal(inside(g), true, `short-landscape collapsed offer must fit: ${JSON.stringify(g)}`);
  await page.screenshot({ path: `${outDir}/03-compact-568x320.png`, fullPage: true });
  await compactLandscape.click();
  await page.locator('.relief-card:not(.hidden)').waitFor({ state: 'visible', timeout: 2_000 });
  g = await geometry('.relief-card');
  assert.equal(inside(g), true, `short-landscape expanded offer must fit: ${JSON.stringify(g)}`);
  await page.screenshot({ path: `${outDir}/04-expanded-568x320.png`, fullPage: true });

  assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join('\n')}`);
  const report = {
    ok: true,
    task: 38,
    checks: [
      'no rewarded offer during first 60 seconds',
      'collapsed offer shows authored benefit pictogram, concrete amount and visible AD badge',
      'offer expands only after tap and does not activate an ad on expansion',
      '320x568 compact and expanded surfaces fit viewport and reserve left joystick lane',
      'dragging explanatory card copy cannot spawn joystick underneath UI',
      '568x320 short-landscape compact and expanded surfaces fit viewport',
    ],
  };
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('TASK38_REWARDED_OFFER_CERT_PASS');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
