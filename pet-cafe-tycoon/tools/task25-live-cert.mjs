import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.PET_CAFE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.PET_CAFE_CERT_DIR || 'artifacts/task25-live';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error && (error.stack || error.message) || error)));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

async function liveState() {
  return page.evaluate(() => {
    const G = window.__game;
    return {
      coins: G.coins,
      built: [...G.world.built],
      partial: { ...G.world.partial },
      activeZones: G.world.activeZoneList.map(z => z.id),
      staff: { ...G.staff },
      staffList: G.staffList.map(s => s.kind),
      adBusy: window.__platform.adBusy,
    };
  });
}

async function liveBuild(zoneId, maxSteps = 80) {
  return page.evaluate(({ zoneId, maxSteps }) => {
    const G = window.__game;
    const z = G.world.area.zones.find(zone => zone.id === zoneId);
    if (!z) throw new Error(`missing zone ${zoneId}`);
    if (!G.world.activeZoneList.some(zone => zone.id === zoneId) && !G.world.built.has(zoneId)) {
      throw new Error(`zone ${zoneId} is not active`);
    }
    G.P.x = z.x; G.P.z = z.z; G.P.vx = 0; G.P.vz = 0; G._force = { x: 0, z: 0 };
    for (let i = 0; i < maxSteps && !G.world.built.has(zoneId); i++) {
      G.update(0.1);
      G.finishActorStep();
    }
    return { built: G.world.built.has(zoneId), coins: G.coins, partial: G.world.partial[zoneId] || 0 };
  }, { zoneId, maxSteps });
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__game && !!window.__platform, null, { timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 20_000 });

  const platform = await page.evaluate(() => ({
    inPlayables: window.__platform.inPlayables,
    rewardedAvailable: window.__platform.rewardedAvailable,
    interstitialAvailable: window.__platform.interstitialAvailable,
    adBusy: window.__platform.adBusy,
  }));
  assert.deepEqual(platform, {
    inPlayables: false,
    rewardedAvailable: false,
    interstitialAvailable: false,
    adBusy: false,
  }, 'CI preview must be an explicitly ad-free host boundary');

  await page.evaluate(() => {
    const G = window.__game;
    G.userPaused = true;
    G.coins = 760;
    G.intro.step = 5;
    G.intro.active = false;
    G.settings.sfx = false;
    G.settings.music = false;
  });

  const tables = await liveBuild('z_seats1');
  assert.equal(tables.built, true, 'Tables must build through live proximity payment');
  assert.equal(tables.coins, 670, 'Tables must cost exactly 90');
  const cupcakes = await liveBuild('z_oven2');
  assert.equal(cupcakes.built, true, 'Cupcakes must build through live proximity payment');
  assert.equal(cupcakes.coins, 450, 'Cupcakes must cost exactly 220 and leave the Task 25 entry wallet');

  let state = await liveState();
  assert.deepEqual(state.activeZones.sort(), ['z_hire', 'z_register2'].sort(), 'Cupcakes must expose Desk and Register 2 in parallel');
  assert.equal(state.built.includes('z_hire'), false);
  assert.equal(state.built.includes('z_register2'), false);

  const deskBuild = await liveBuild('z_hire');
  assert.equal(deskBuild.built, true, 'Desk must build through live proximity payment');
  state = await liveState();
  assert.equal(state.built.includes('z_hire'), true);
  assert.equal(state.built.includes('z_register2'), false, 'Desk must not auto-build optional Register 2');
  assert.equal(state.coins, 150, '450 wallet must spend exactly the 300-coin Desk price');
  assert.ok(state.activeZones.includes('z_register2'), 'optional Register 2 must remain available');
  assert.ok(state.activeZones.includes('z_coffee'), 'Coffee must unlock from Desk without Register 2');
  assert.equal(state.adBusy, false);
  await page.screenshot({ path: `${outDir}/01-desk-built-mobile.png`, fullPage: true });

  await page.evaluate(() => {
    const G = window.__game;
    const desk = G.world.stations.get('hire1');
    G.P.x = desk.front.x; G.P.z = desk.front.z; G.P.vx = 0; G.P.vz = 0; G._force = { x: 0, z: 0 };
    G.update(0.1); G.finishActorStep();
  });
  const staffAction = page.locator('.fbtn', { hasText: 'STAFF' });
  await staffAction.waitFor({ state: 'visible', timeout: 5_000 });
  await staffAction.click();
  const runnerRow = page.locator('.sheet .srow').filter({ hasText: 'Runner' }).first();
  await runnerRow.waitFor({ state: 'visible', timeout: 5_000 });
  const firstRunnerText = (await runnerRow.textContent()) || '';
  assert.match(firstRunnerText, /Runner/);
  assert.match(firstRunnerText, /150/, 'first Runner UI must show the measured 150-coin price');

  // The sheet uses a deliberate translateY entrance. Wait for the final geometry, not merely DOM
  // visibility, so the mobile assertion cannot race the 220ms slide-in animation.
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.sheet');
    if (!sheet || !sheet.classList.contains('show')) return false;
    const r = sheet.getBoundingClientRect();
    return r.top < innerHeight - 1 && r.bottom <= innerHeight + 1;
  }, null, { timeout: 2_000 });
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    const r = sheet?.getBoundingClientRect();
    return {
      viewportW: innerWidth, viewportH: innerHeight,
      docW: document.documentElement.scrollWidth,
      left: r?.left ?? -1, right: r?.right ?? -1, top: r?.top ?? -1, bottom: r?.bottom ?? -1,
    };
  });
  assert.ok(geometry.docW <= geometry.viewportW + 1, `mobile UI overflows horizontally: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.left >= -1 && geometry.right <= geometry.viewportW + 1, `Workers sheet exceeds mobile viewport: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.top >= -1 && geometry.bottom <= geometry.viewportH + 1, `Workers sheet exceeds mobile viewport: ${JSON.stringify(geometry)}`);
  await page.screenshot({ path: `${outDir}/02-runner-150-sheet-mobile.png`, fullPage: true });

  await runnerRow.locator('button.sbtn.buy').click();
  state = await liveState();
  assert.equal(state.staff.runner, 1, 'Runner button must hire one live Runner');
  assert.equal(state.coins, 0, 'first Runner must consume the remaining 150 coins');
  assert.equal(state.adBusy, false, 'Desk→Runner progression must require no ad transaction');

  const afterHireRow = page.locator('.sheet .srow').filter({ hasText: 'Runner' }).first();
  const secondRunnerText = (await afterHireRow.textContent()) || '';
  assert.match(secondRunnerText, /1\/2/);
  assert.match(secondRunnerText, /2,800/, 'second Runner price must remain 2,800');
  await page.screenshot({ path: `${outDir}/03-runner-hired-mobile.png`, fullPage: true });

  const roundTrip = await page.evaluate(() => {
    const G = window.__game;
    const snap = G.snapshot();
    const before = JSON.stringify({ built: snap.builds.a1, staff: snap.staff, coins: snap.coins, contract: G.goal });
    if (!G.restore(snap)) throw new Error('round-trip restore rejected genuine live snapshot');
    const afterSnap = G.snapshot();
    const after = JSON.stringify({ built: afterSnap.builds.a1, staff: afterSnap.staff, coins: afterSnap.coins, contract: G.goal });
    return { before, after, register2Built: G.world.built.has('z_register2'), activeZones: G.world.activeZoneList.map(z => z.id) };
  });
  assert.equal(roundTrip.after, roundTrip.before, 'live Task 25 snapshot must round-trip');
  assert.equal(roundTrip.register2Built, false, 'optional Register 2 must stay unbuilt across save/load');
  assert.ok(roundTrip.activeZones.includes('z_register2'));

  // Exercise the production HUD with deterministic contract progress while paused.
  await page.locator('.sheet .sclose').click();
  const contractFixture = await page.evaluate(() => {
    const G = window.__game;
    const original = { goal: G.goal, stats: { ...G.dayStats } };
    G.goal = { kind: 'serve', target: 24, reward: 0 };
    G.dayStats.served = 6;
    G.update(0);
    return original;
  });
  const badge = page.locator('#dayPill .contract-badge');
  assert.equal(await badge.getAttribute('aria-valuenow'), '6');
  assert.equal(await badge.getAttribute('aria-valuemax'), '24');
  assert.equal(await badge.locator('.contract-count').textContent(), '6/24');
  await page.screenshot({ path: `${outDir}/04-contract-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  const compact = await badge.boundingBox();
  assert.ok(compact && compact.x >= 0 && compact.x + compact.width <= 320, 'contract must fit at 320px');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px HUD must not overflow');
  await page.screenshot({ path: `${outDir}/05-contract-320.png`, fullPage: true });
  await page.evaluate(() => { window.__game.dayStats.served = 24; window.__game.update(0); });
  assert.match(await badge.getAttribute('class'), /celebrate/, 'completion must pulse');
  assert.equal(await badge.getAttribute('aria-valuenow'), '24');
  await page.evaluate(original => {
    const G = window.__game;
    G.goal = original.goal;
    Object.assign(G.dayStats, original.stats);
    G.update(0);
  }, contractFixture);
  await page.setViewportSize({ width: 390, height: 844 });

  const interstitial = await page.evaluate(async () => {
    const p = window.__platform;
    const shown = await p.requestInterstitialAd(0);
    return { shown, adBusy: p.adBusy, adKind: p.adKind };
  });
  assert.deepEqual(interstitial, { shown: false, adBusy: false, adKind: null }, 'preview progression must remain ad-free');

  await page.waitForTimeout(100);
  assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join('\n')}`);

  const report = {
    ok: true,
    task: 25,
    viewport: '390x844',
    checks: [
      'production bundle boots without page/console errors',
      'Tables and Cupcakes are purchased through the live zone system',
      'Cupcakes exposes Staff Desk and Register 2 in parallel',
      'live hold-to-build pays exactly 300 for Staff Desk',
      'Coffee unlocks through Staff Desk while Register 2 stays optional',
      'Workers sheet exposes first Runner at 150 and hires through its live button',
      'second Runner remains 2,800',
      'mobile Workers sheet remains inside the viewport after its entrance transition',
      'genuine Task 25 snapshot round-trips without auto-building Register 2',
      'Task 26 pictogram/counter renders live progress and pulses on completion',
      'Task 26 contract fits the compact 320px viewport without page overflow',
      'no interstitial/ad transaction is required for the certified path',
    ],
  };
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('TASK25_LIVE_CERT_PASS');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
