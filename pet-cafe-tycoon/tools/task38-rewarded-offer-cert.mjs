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

async function seedRush() {
await page.evaluate(() => {
  const G = window.__game, s = G.snapshot();
  s.coins = 5000;
  s.builds.a1 = ['z_seats1','z_oven2','z_register2','z_hire'];
  s.partial = {};
  s.staff = { runner:1, cashier:0, cleaner:0 };
  s.staffLevels = { runner:{ speed:0, carry:0 }, cashier:{ speed:0 }, cleaner:{ speed:0 } };
  s.intro = { step:5, active:false, target:null };
  s.dayState = { day:4, t:72, phase:'rush', _ended:false };
  s.dayStats = { served:0, lost:0, earned:0, serviceFees:0, serviceMisses:0, wasteFees:0, bestStreak:0 };
  s.meta.rewardedDays = { ...(s.meta.rewardedDays || {}), 'relief:4':0 };
  if (!G.restore(s)) throw new Error('Rush fixture restore failed');
  G.time = 61;

  const oven1 = G.world.stations.get('oven1');
  const oven2 = G.world.stations.get('oven2');
  const cookie = G.world.stations.get('dispCookie');
  const cupcake = G.world.stations.get('dispCupcake');
  if (oven1) oven1.stock = 12;      // ready matching work: Rush Runner can genuinely help
  if (oven2) oven2.stock = 0;
  if (cookie) cookie.stock = 0;
  if (cupcake) cupcake.stock = 0;   // second real low display gives stable stock-pressure evidence
});

await page.waitForFunction(() => window.__game.staffList.some(s => s.kind === 'runner'), null, { timeout:5000 });
await page.evaluate(() => {
  const r = window.__game.staffList.find(s => s.kind === 'runner');
  r.state = 'frozen-fixture'; r.mover.hasTarget = false; r.items.length = 0;
});

// Wait for a genuine browser-system spawn so render records, identity UI and the sim entity all
// exist normally. Then place that SAME sim customer at the real cookie queue head. assignSlots()
// will rebuild the queue map from this live state on the next sim tick; the normal queue branch
// then attempts the empty shelf, drains patience and sets mood='wait' itself.
await page.waitForFunction(() => window.__game.customers.some(c => !c.done), null, { timeout:7000 });
await page.evaluate(() => {
  const G = window.__game, c = G.customers.find(x => !x.done), st = G.world.stations.get('dispCookie');
  if (!c || !st || !st.queue || !st.queue[0]) throw new Error('Rush Help fixture missing real guest/cookie queue');
  const q = st.queue[0], m = c.mover;
  c.state = 'queue'; c.counterId = st.id; c.slot = 0; c.arrived = G.world.seq = (G.world.seq || 0) + 1;
  c.wish = { product:'cookie', treat:false }; c.order = null; c.mood = 'none'; c.patience = 120; c._patQ = 140;
  // This smoke is testing the rewarded surface, not the already-unit-tested settle-for branch.
  // Keep the real guest committed to the real empty shelf for the controller's 5s sustained-pressure window.
  c._settled = true;
  c.x = q.x; c.z = q.z;
  m.x = q.x; m.z = q.z; m.tx = q.x; m.tz = q.z; m.hasTarget = false; m.n = 0; m.k = 0; m.vx = 0; m.vz = 0; m.mask = 0;
  m.stall = 0; m.blockedT = 0; m.bestD = Infinity; m._winD = Infinity; m.gridVersion = G.world.grid.version; m._planMask = 0;
  window.__rushFixtureStart = G.time;
});

}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game && !!window.__platform, null, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 20_000 });

  await page.evaluate(() => { window.__game.time = 20; });

  // Even sustained useful pressure is not allowed to monetize the first minute.
  await page.waitForTimeout(1_200);
  assert.equal(await page.locator('.relief-root').evaluate(el => !el.classList.contains('hidden')), false,
    'rewarded surface must remain hidden in the first minute');

  await seedRush();
  const compact = page.locator('.relief-root:not(.hidden) .relief-pill:not(.hidden)');
  await compact.waitFor({ state: 'visible', timeout: 25_000 });

  assert.equal(await page.locator('.relief-card').evaluate(el => el.classList.contains('hidden')), true,
    'eligible offer must remain collapsed until explicit tap');
  assert.equal((await page.locator('.relief-pill-ad').textContent())?.includes('AD'), true,
    'AD disclosure must be visible on the collapsed surface');
  assert.match((await page.locator('.relief-pill-value').textContent()) || '', /^\+1 TIER$/,
    'collapsed Runner offer must communicate the concrete benefit amount');
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
  await seedRush();
  const compactLandscape = page.locator('.relief-root:not(.hidden) .relief-pill:not(.hidden)');
  await compactLandscape.waitFor({ state: 'visible', timeout: 25_000 });
  g = await geometry('.relief-pill');
  assert.equal(inside(g), true, `short-landscape collapsed offer must fit: ${JSON.stringify(g)}`);
  await page.screenshot({ path: `${outDir}/03-compact-568x320.png`, fullPage: true });
  await compactLandscape.click();
  await page.locator('.relief-card:not(.hidden)').waitFor({ state: 'visible', timeout: 2_000 });
  g = await geometry('.relief-card');
  assert.equal(inside(g), true, `short-landscape expanded offer must fit: ${JSON.stringify(g)}`);
  await page.screenshot({ path: `${outDir}/04-expanded-568x320.png`, fullPage: true });

  await page.locator('.relief-watch').click();
  await page.waitForFunction(() => window.__game.meta.rewardedDays['relief:4'] === 1);
  assert.equal(await page.evaluate(() => window.__platform.getAdReport().rewarded.earned), 1);
  assert.equal(await page.evaluate(() => !!window.__game.boosts.rushCrew), true, 'earned Runner benefit must be delivered');

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
