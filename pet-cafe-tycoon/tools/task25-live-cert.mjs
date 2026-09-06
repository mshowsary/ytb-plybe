import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.PET_CAFE_URL || 'http://127.0.0.1:4173';
const outDir = process.env.PET_CAFE_CERT_DIR || 'artifacts/task25-live';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(String(error && (error.stack || error.message) || error)));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

function stageSave(coins = 450) {
  return {
    v: 4,
    coins,
    builds: { a1: ['z_seats1', 'z_oven2'] },
    partial: {},
    upgrades: { speed: 0, carry: 0, income: 0 },
    staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
    intro: { step: 5 },
    stats: {}, settings: { sfx: false, music: false },
  };
}

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

  // Freeze the requestAnimationFrame owner while the certificate advances the exact same live
  // systems deterministically. G.update remains the production update function; no sim purchase
  // helper (payZone/hire) is imported or invoked by this certificate.
  await page.evaluate(save => {
    const G = window.__game;
    G.userPaused = true;
    if (!G.restore(save)) throw new Error('Task 25 stage restore failed');
  }, stageSave());

  let state = await liveState();
  assert.deepEqual(state.activeZones.sort(), ['z_hire', 'z_register2'].sort(), 'Cupcakes must expose Desk and Register 2 in parallel');
  assert.equal(state.built.includes('z_hire'), false);
  assert.equal(state.built.includes('z_register2'), false);

  // Stand on the real Staff Desk construction footprint and let systems/zones.js arm + bill it.
  // 0.1s steps are small enough to exercise the 0.55s hold gate and continuous payment rather than
  // bypassing it. 300 coins / 150 coins-per-second plus arming fits comfortably in 40 steps.
  await page.evaluate(() => {
    const G = window.__game;
    const z = G.world.area.zones.find(zone => zone.id === 'z_hire');
    if (!z) throw new Error('z_hire missing');
    G.P.x = z.x; G.P.z = z.z; G.P.vx = 0; G.P.vz = 0; G._force = { x: 0, z: 0 };
    for (let i = 0; i < 40 && !G.world.built.has('z_hire'); i++) {
      G.update(0.1);
      G.finishActorStep();
    }
  });

  state = await liveState();
  assert.equal(state.built.includes('z_hire'), true, 'Desk must build through live proximity payment');
  assert.equal(state.built.includes('z_register2'), false, 'Desk must not auto-build optional Register 2');
  assert.equal(state.coins, 150, '450 wallet must spend exactly the 300-coin Desk price');
  assert.ok(state.activeZones.includes('z_register2'), 'optional Register 2 must remain available');
  assert.ok(state.activeZones.includes('z_coffee'), 'Coffee must unlock from Desk without Register 2');
  assert.equal(state.adBusy, false);
  await page.screenshot({ path: `${outDir}/01-desk-built-mobile.png`, fullPage: true });

  // Move to the live hire station, open its actual Workers sheet through the floating action, then
  // use the rendered Runner BUY button. This certifies the UI model and production hire action too.
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

  // Sheet refreshes after hire. Its second Runner price must remain the pre-existing 2,800 coins,
  // proving Task 25 discounted only the first relief hire rather than flattening permanent staff.
  const afterHireRow = page.locator('.sheet .srow').filter({ hasText: 'Runner' }).first();
  const secondRunnerText = (await afterHireRow.textContent()) || '';
  assert.match(secondRunnerText, /1\/2/);
  assert.match(secondRunnerText, /2,800/, 'second Runner price must remain 2,800');
  await page.screenshot({ path: `${outDir}/03-runner-hired-mobile.png`, fullPage: true });

  // Production snapshot/restore must retain the new path exactly.
  const roundTrip = await page.evaluate(() => {
    const G = window.__game;
    const snap = G.snapshot();
    const before = JSON.stringify({ built: snap.builds.a1, staff: snap.staff, coins: snap.coins });
    if (!G.restore(snap)) throw new Error('round-trip restore rejected live snapshot');
    const afterSnap = G.snapshot();
    const after = JSON.stringify({ built: afterSnap.builds.a1, staff: afterSnap.staff, coins: afterSnap.coins });
    return { before, after, register2Built: G.world.built.has('z_register2'), activeZones: G.world.activeZoneList.map(z => z.id) };
  });
  assert.equal(roundTrip.after, roundTrip.before, 'live Task 25 snapshot must round-trip');
  assert.equal(roundTrip.register2Built, false, 'optional Register 2 must stay unbuilt across save/load');
  assert.ok(roundTrip.activeZones.includes('z_register2'));

  // Browser-level migration proof for a legitimate old 420/480 Desk partial. The canonical load
  // must promote it to the now-300 Desk with zero wallet mutation and no orphaned partial residue.
  const migrated = await page.evaluate(() => {
    const G = window.__game;
    const legacy = {
      v: 4, coins: 91,
      builds: { a1: ['z_seats1', 'z_oven2', 'z_register2'] },
      partial: { z_hire: 420 }, intro: { step: 5 },
      upgrades: {}, staff: {}, stats: {}, settings: { sfx: false, music: false },
    };
    if (!G.restore(legacy)) throw new Error('legacy Desk migration restore failed');
    return {
      coins: G.coins,
      built: [...G.world.built],
      partial: { ...G.world.partial },
      activeZones: G.world.activeZoneList.map(z => z.id),
    };
  });
  assert.equal(migrated.coins, 91, 'migration may not mint or charge wallet coins');
  assert.ok(migrated.built.includes('z_hire'), 'valid 420/480 legacy Desk partial must be promoted');
  assert.equal(migrated.partial.z_hire, undefined, 'promoted Desk partial must be removed');
  assert.ok(migrated.activeZones.includes('z_coffee'));

  const interstitial = await page.evaluate(async () => {
    const p = window.__platform;
    const shown = await p.requestInterstitialAd(0);
    return { shown, adBusy: p.adBusy, adKind: p.adKind };
  });
  assert.deepEqual(interstitial, { shown: false, adBusy: false, adKind: null }, 'preview progression must remain ad-free');

  // Give queued console/page events one turn to settle before certifying the page clean.
  await page.waitForTimeout(100);
  assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`);
  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join('\n')}`);

  const report = {
    ok: true,
    task: 25,
    viewport: '390x844',
    checks: [
      'production bundle boots without page/console errors',
      'Cupcakes exposes Staff Desk and Register 2 in parallel',
      'live hold-to-build pays exactly 300 for Staff Desk',
      'Coffee unlocks through Staff Desk while Register 2 stays optional',
      'Workers sheet exposes first Runner at 150 and hires through its live button',
      'second Runner remains 2,800',
      'mobile Workers sheet remains inside the viewport',
      'Task 25 snapshot round-trips without auto-building Register 2',
      'legacy 420/480 Desk partial migrates without wallet mutation',
      'no interstitial/ad transaction is required for the certified path',
    ],
  };
  await fs.writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('TASK25_LIVE_CERT_PASS');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
