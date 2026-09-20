// Production browser acceptance test. Uses game state instead of assuming 60 FPS wall-clock timing.
//
// Repaired 2026-09-20 against docs/SHIP-PLAN-2026-09-19.md Batches A/B1/B2/D ("the café looks
// finished outdoors", "the spa is gone... pets pose at their tables", "the menu is one page"). This
// tool used to pin the pre-redesign HUD: #dayPill, .meta-reputation, playables-clean/compact body
// classes, a multi-page pause menu (`[data-page=...]`/`[data-route=...]`), the Café Journey page
// (.career-root, .reno-buy living there) and party orders. All of that is deleted. What is kept,
// re-pointed at the shipped surface, and what is dropped (with the reason) is documented inline at
// each check below. tools/production-smoke.js — an older near-duplicate of this file, never wired
// into tools/certification-suites.json — is retired outright rather than repaired twice.
import http from 'node:http';
import { AREA1 } from '../data/area1.js';
import { buildDailyGoal } from '../src/sim/dailyGoal.js';
import { RENOVATIONS } from '../src/sim/career.js';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
// The save version and the pet roster are both moving targets. Compare against the exported
// constants so this gate tracks the bumps instead of going permanently red one commit after each
// one — tools/save-schema-smoke.js already does this.
import { CURRENT_SAVE_VERSION } from '../src/sim/saveSchema.js';
import { PET_SPECIES, PET_PROFILES } from '../src/sim/petBook.js';

const PET_CARD_COUNT = PET_SPECIES.reduce((n, s) => n + PET_PROFILES[s].length, 0);

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing; run npm run build first');
const shots = path.resolve('shots-production');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b);
  });
});
await new Promise(resolve => server.listen(4504, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const cases = [['small', 320, 568, 1.5], ['portrait', 450, 800, 2], ['landscape', 1280, 720, 1]];
const report = [];
let failed = false;

for (const [tag, width, height, dpr] of cases) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: tag !== 'landscape' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.ytgame={IN_PLAYABLES_ENV:false};' }));
  await page.goto('http://127.0.0.1:4504/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__scene && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });
  await page.waitForTimeout(400);

  // ---- boot chrome: the permanent play field is exactly wallet + Pet Book chip + Cafe button ----
  const boot = await page.evaluate(() => {
    const rr = window.__scene.renderer.info.render;
    const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    return {
      calls: rr.calls, triangles: rr.triangles, platform: !!window.__platform, metaVersion: window.__game.snapshot().v,
      overflow: document.body.scrollWidth > innerWidth + 1,
      wallet: rect('#wallet'), pawbook: rect('.meta-pawbook'), pause: rect('.pause-btn'),
      petCount: document.querySelector('.meta-book-count')?.textContent || '',
    };
  });
  await page.screenshot({ path: path.join(shots, `v2-01-boot-${tag}.png`) });

  let smallChecks = null;
  if (tag === 'small') {
    // User pause must freeze simulation. Batch D merged the sound toggles into one control (music
    // and effects together — ship plan §1.5); there is no separate Settings page to navigate to
    // any more, so both are asserted through the one `.cc-sound` button on the Cafe card itself.
    await page.click('.pause-btn');
    await page.waitForFunction(() => window.__game.userPaused && document.body.classList.contains('modal-open'));
    const t0 = await page.evaluate(() => window.__game.dayState.t);
    await page.waitForTimeout(500);
    const pauseFrozen = await page.evaluate(t => Math.abs(window.__game.dayState.t - t) < .001 && window.__audio.paused, t0);
    await page.click('.cc-sound');
    const soundOff = await page.evaluate(() => window.__game.settings.music === false && window.__game.settings.sfx === false && window.__audio.musicEnabled === false && window.__audio.sfxEnabled === false);
    await page.click('.cc-sound');
    const soundOn = await page.evaluate(() => window.__game.settings.music !== false && window.__game.settings.sfx !== false && window.__audio.musicEnabled === true && window.__audio.sfxEnabled === true);
    await page.click('[data-action="resume"]');
    await page.waitForFunction(() => !window.__game.userPaused && !document.body.classList.contains('modal-open'));

    // Crossing does not spend. A short stop does not spend. Then wait for ACTUAL partial construction.
    await page.evaluate(() => { const g = window.__game, z = g.world.activeZoneList[0]; g.coins = 500; g.P.x = z.x; g.P.z = z.z; g.P.vx = 0; g.P.vz = 0; g.setMove(1, 0); });
    await page.waitForTimeout(180);
    const walkPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0));
    await page.evaluate(() => { const g = window.__game, z = g.world.activeZoneList[0]; g.setMove(0, 0); g.P.x = z.x; g.P.z = z.z; g.P.vx = 0; g.P.vz = 0; });
    await page.waitForTimeout(280);
    const earlyPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0));
    await page.waitForFunction(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0) > 0, null, { timeout: 4000 });
    const heldPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a, b) => a + b, 0));
    await page.evaluate(() => window.__game.setMove(null));
    smallChecks = { pauseFrozen, soundOff, soundOn, walkPaid, earlyPaid, heldPaid };
  }

  // Mature café fixture: a genuine same-weekday rival target and every core loop unlocked. Dropped
  // from the old fixture: `meta.partyOrders` (systems/partyOrders.js is deleted this ship).
  await page.evaluate(() => {
    const g = window.__game, s = g.snapshot();
    s.coins = 6000; s.builds.a1 = g.world.area.zones.map(z => z.id); s.partial = {};
    s.staff = { runner: 2, cashier: 1, cleaner: 1 };
    s.staffLevels = { runner: { speed: 2, carry: 2 }, cashier: { speed: 2 }, cleaner: { speed: 1 } };
    s.machineLevels = { oven: 2, coffee: 2, display: 2 }; s.intro = { step: 5, active: false, target: null };
    s.meta = {
      completedDays: 12, rewardedDays: {}, reputation: 72, perfectShifts: 5, bestServiceStreak: 18,
      shiftRatings: { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3, 6: 2, 7: 3, 8: 2, 9: 3, 10: 2, 11: 3, 12: 3 },
      // Batch E1 re-gated the café themes on a Café Star instead of on reputation, so this fixture
      // now has to carry real star evidence or the buy button below is (correctly) locked. Star 3 is
      // the garden + 14 pets met + 5 album shots; every zone is built two lines above.
      petBook: Object.fromEntries(['cat:0','cat:1','cat:2','cat:3','dog:0','dog:1','dog:2','dog:3','bunny:0','bunny:1','bunny:2','bunny:3','hamster:0','hamster:1'].map(k => [k, 1])),
      petDiscoveries: 14,
      pawBest: 3,
      album: { 'cat:0': { shots: 5, best: 1, poseId: null, accessoryId: null } },
      career: {
        history: {
          6: { served: 38, lost: 1, earned: 760, bestStreak: 9, rating: 2, contractMet: true, points: 3 },
          7: { served: 41, lost: 0, earned: 860, bestStreak: 11, rating: 3, contractMet: true, points: 4 },
          8: { served: 43, lost: 1, earned: 910, bestStreak: 12, rating: 3, contractMet: true, points: 4 },
          9: { served: 44, lost: 0, earned: 975, bestStreak: 13, rating: 3, contractMet: true, points: 4 },
          10: { served: 42, lost: 1, earned: 940, bestStreak: 12, rating: 2, contractMet: false, points: 2 },
          11: { served: 46, lost: 0, earned: 1030, bestStreak: 14, rating: 3, contractMet: true, points: 4 },
          12: { served: 47, lost: 0, earned: 1120, bestStreak: 15, rating: 3, contractMet: true, points: 4 },
        },
        weeklyCups: {}, trophies: { bronze: 0, silver: 1, gold: 1 },
        recipeSales: { cookie: 80, cupcake: 42, coffee: 96, smoothie: 31, treat: 45 },
        contractStreak: 2, bestContractStreak: 5, bestWeekPoints: 25, renovationLevel: 0,
      },
    };
    s.dayState = { day: 13, t: 78, phase: 'rush', _ended: false };
    s.dayStats = { served: 14, lost: 1, earned: 420, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 5 };
    g.restore(s);
    for (const [id, product] of [['dispCookie', 'cookie'], ['dispCupcake', 'cupcake'], ['barCoffee', 'coffee'], ['barSmoothie', 'smoothie']]) { const st = g.world.stations.get(id); if (st) { st.stock = 8; st.product = product; } }
    const bowl = g.world.stations.get('bowl1'); if (bowl) bowl.stock = 8;
    const o1 = g.world.stations.get('oven1'); if (o1) o1.stock = 8; const o2 = g.world.stations.get('oven2'); if (o2) o2.stock = 8;
    const coffee = g.world.stations.get('coffee1'); if (coffee) { coffee.stock = 8; coffee.beans = 12; }
    window.__pauseMenu.update(); window.__pauseMenu.sync();
  });
  await page.waitForTimeout(350);
  const goal = await page.evaluate(() => ({ day: window.__game.dayState.day, kind: window.__game.goal?.kind, target: window.__game.goal?.target }));

  // ---- the Cafe card: Today row (goal now lives here, not in a #goalPill on the play field) -------
  await page.click('.pause-btn');
  await page.waitForFunction(() => !document.querySelector('.pause-root')?.classList.contains('hidden'));
  const todayRow = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.cc-today .cc-chip')];
    return { count: chips.length, ariaLabels: chips.map(c => c.getAttribute('aria-label')), overflow: document.body.scrollWidth > innerWidth + 1 };
  });
  await page.screenshot({ path: path.join(shots, `v2-02-cafe-card-${tag}.png`) });

  // ---- Cafe Stars sheet + the café renovation, moved here from the deleted Journey page ----------
  await page.click('.cc-tile[data-tile="stars"]');
  await page.waitForFunction(() => !document.querySelector('.paw-root')?.classList.contains('hidden'));
  const stars = await page.evaluate(() => ({
    pawPips: document.querySelectorAll('.paw-pip').length,
    reqRows: document.querySelectorAll('.stars-rows .paw-req').length,
    hasRenovation: !!document.querySelector('.reno-buy'),
    overflow: document.body.scrollWidth > innerWidth + 1,
  }));
  let renovation = null;
  if (tag === 'small') {
    const before = await page.evaluate(() => window.__game.coins);
    await page.click('.reno-buy');
    await page.waitForFunction(() => window.__game.meta.career.renovationLevel === 1);
    renovation = await page.evaluate(b => ({ level: window.__game.meta.career.renovationLevel, spent: b - window.__game.coins, next: document.querySelector('.reno-name')?.textContent || '' }), before);
  }
  await page.screenshot({ path: path.join(shots, `v2-03-stars-${tag}.png`) });
  // A tile's sheet is the only thing on the modal stack once it opens (src/ui/pauseMenu.js's
  // openTile hides and closes the Cafe card FIRST, before opening the route) -- unlike the deleted
  // cafeJournal, closing it resumes play directly rather than falling back to a pause-menu page.
  await page.click('.paw-close');
  await page.waitForFunction(() => document.querySelector('.paw-root')?.classList.contains('hidden'));
  await page.waitForFunction(() => window.__game.userPaused === false);
  await page.waitForTimeout(1800);

  let interaction = null;
  if (tag === 'small') {
    const place = async (id, point = 'front') => { await page.evaluate(({ id, point }) => { const g = window.__game, st = g.world.stations.get(id), p = st[point] || st.front; g.setMove(0, 0); g.P.x = p.x; g.P.z = p.z; g.P.vx = 0; g.P.vz = 0; }, { id, point }); await page.waitForTimeout(500); };
    const clear = () => page.evaluate(() => { const g = window.__game; g.owner.clearItems(); g.carry.sack = null; g.carry.sackLeft = 0; g.carry.fruit = 0; });

    // The ONE Shop, now opened only by the staff desk in the world (the upgrade kiosk is deleted,
    // docs/SHIP-PLAN-2026-09-19.md 1.4) and by the Cafe card. The desk opens it on Staff, titled
    // "Staff"; the Upgrades tab is one tap away inside it. The Shop is not anchored to a station,
    // so walking away no longer closes it; it closes on its own chevron.
    await clear(); await place('hire1');
    await page.waitForFunction(() => document.querySelector('.fbtn')?.dataset.label === 'STAFF' && !document.querySelector('.fbtn')?.classList.contains('hidden'), null, { timeout: 5000 });
    await page.click('.fbtn');
    await page.waitForFunction(() => !!document.querySelector('.sheet-root .sheet'));
    const shopTitle = await page.evaluate(() => document.querySelector('.stitle')?.textContent || '');
    await page.evaluate(() => { const g = window.__game; g.P.x = 0; g.P.z = 2.5; g.P.vx = g.P.vz = 0; });
    await page.click('.sheet .sclose');
    await page.waitForFunction(() => document.querySelector('.sheet-root').classList.contains('hidden'), null, { timeout: 3000 });

    // Batch C's hands (docs/SHIP-PLAN-2026-09-19.md 1.4). Stopping at the pantry with empty hands
    // hands over the sack the neediest machine wants -- no button, no sheet. Stopping at anything
    // that needs empty hands flies whatever is held back to its source, for free.
    await page.evaluate(() => { const g = window.__game; g.world.stations.get('coffee1').beans = 0; });
    await clear(); await place('pantry1');
    await page.waitForFunction(() => window.__game.carry.sack === 'beans', null, { timeout: 5000 });
    const pantry = await page.evaluate(() => ({
      sack: window.__game.carry.sack,
      guide: window.__game.contextGuide?.caption || '',
      button: !!document.querySelector('.fbtn:not(.hidden)'),
      sheet: !document.querySelector('.sheet-root').classList.contains('hidden'),
    }));

    // A sack with nowhere to go: stop at a bush, which needs a free hand to be picked.
    const supplyBefore = await page.evaluate(() => window.__game.coins);
    await place('bush1');
    await page.waitForFunction(() => !window.__game.carry.sack, null, { timeout: 5000 });
    const supply = await page.evaluate(b => ({ empty: !window.__game.carry.sack, delta: window.__game.coins - b }), supplyBefore);

    // Harvested fruit with the blender full, put down at the pantry: still free, still no crate.
    await clear();
    const wasteBefore = await page.evaluate(() => { const g = window.__game; g.coins = 1000; g.carry.fruit = 2; return g.coins; });
    await place('pantry1');
    await page.waitForFunction(() => (window.__game.carry.fruit | 0) === 0, null, { timeout: 5000 });
    const waste = await page.evaluate(b => ({ fruit: window.__game.carry.fruit, spent: b - window.__game.coins, tracked: window.__game.dayStats.wasteFees | 0 }), wasteBefore);

    // Clear FIRST: a pantry the café still needs beans from hands a sack over the moment the hands
    // come free, and a sack in hand is not fruit — the blender would fly it home instead.
    await clear();
    await page.evaluate(() => { const g = window.__game, b = g.world.stations.get('blender1'); g.carry.fruit = 2; b.fruit = 0; b.stock = 0; });
    await place('blender1');
    await page.waitForFunction(() => { const g = window.__game, b = g.world.stations.get('blender1'); return b.fruit + b.stock > 0; }, null, { timeout: 4000 });
    const blender = await page.evaluate(() => { const g = window.__game, b = g.world.stations.get('blender1'); return { remaining: g.carry.fruit, machine: b.fruit + b.stock }; });

    // Flow chores are proximity-only. No COLLECT/CLEAN button and no permanent cash text may exist.
    await clear();
    const cashBefore = await page.evaluate(() => { const g = window.__game, st = g.world.stations.get('register1'); st.pile = 206; return g.coins; });
    await place('register1', 'cash');
    await page.waitForFunction(() => window.__game.world.stations.get('register1').pile === 0, null, { timeout: 3000 });
    const cash = await page.evaluate(b => ({
      pile: window.__game.world.stations.get('register1').pile, gained: window.__game.coins - b,
      collectVisible: /^COLLECT/.test(document.querySelector('.fbtn')?.textContent || '') && !document.querySelector('.fbtn')?.classList.contains('hidden'),
      cashLabel: !!document.querySelector('.register-money-badge'), legacyCashLabel: !!document.querySelector('.cash-tray-badge'),
    }), cashBefore);

    // No hired cleaner may steal this assertion: temporarily remove staff from the live list.
    const cleanerState = await page.evaluate(() => { const g = window.__game; const saved = g.staffList.slice(); g.staffList.length = 0; const st = g.world.stations.get('seat1'); st.dirty = true; return saved.map(s => ({ kind: s.kind })); });
    await place('seat1');
    await page.waitForFunction(() => window.__game.world.stations.get('seat1').dirty === false, null, { timeout: 3000 });
    const cleaning = await page.evaluate(() => ({ dirty: window.__game.world.stations.get('seat1').dirty, cleanVisible: (document.querySelector('.fbtn')?.textContent || '') === 'CLEAN TABLE' && !document.querySelector('.fbtn')?.classList.contains('hidden') }));

    interaction = { shopTitle, pantry, supply, waste, blender, cash, cleaning, cleanerState };
    await page.evaluate(() => window.__game.setMove(null));
    await page.screenshot({ path: path.join(shots, 'v2-04-clean-gameplay-small.png') });
  }

  // ---- Pet Book, opened straight from its own chip (ship plan §1.5: no page-nav to click through) -
  await page.click('.meta-pawbook');
  await page.waitForFunction(() => !document.querySelector('.meta-book-root')?.classList.contains('hidden'));
  const book = await page.evaluate(() => ({ cards: document.querySelectorAll('.pb-card').length, found: document.querySelectorAll('.pb-card:not(.locked)').length, overflow: document.body.scrollWidth > innerWidth + 1 }));
  await page.screenshot({ path: path.join(shots, `v2-05-book-${tag}.png`) });
  await page.click('.meta-book-close');
  await page.waitForFunction(() => document.querySelector('.meta-book-root')?.classList.contains('hidden'));

  // ---- the day-complete card (src/ui/daySummary.js): hero, contract row, Cafe Stars row, Continue -
  await page.evaluate(() => { const g = window.__game; g.dayStats = { served: 42, lost: 0, earned: 1180, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 14 }; g.shiftBestStreak = 14; const d = g.dayState; d.t = 239.99; d.phase = 'closing'; d._ended = false; });
  await page.waitForFunction(() => !!document.querySelector('.sheet-root .card') && !!document.querySelector('.ds-earned-num'), null, { timeout: 5000 });
  await page.waitForTimeout(1300); // let the hero count-up land
  const summary = await page.evaluate(() => {
    const card = document.querySelector('.sheet-root .card'), r = card.getBoundingClientRect();
    return {
      earned: document.querySelector('.ds-earned-num')?.textContent || '',
      rows: document.querySelectorAll('.ds-row').length,
      contract: !!document.querySelector('.ds-contract'),
      starsRow: !!document.querySelector('.ds-stars'),
      bonus: (document.querySelector('.ds-bonus')?.textContent || '').replace(/\s+/g, ''),
      // Batch E2: the button carries its own "×2" now (ship plan §1.7a), so the coin figure is read
      // from its own span rather than by stripping digits out of the whole label -- "×2 +1,200"
      // flattens to "21200" and would look like a 21,200-coin offer on an 1,180-coin day.
      bonusX2: (document.querySelector('.ds-bonus .ds-bonus-x2')?.textContent || '').trim(),
      bonusCoins: (document.querySelector('.ds-bonus span:last-child')?.textContent || '').trim(),
      continueBtn: !!document.querySelector('.ds-card .continue'),
      fits: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      overflow: document.body.scrollWidth > innerWidth + 1,
    };
  });
  await page.screenshot({ path: path.join(shots, `v2-06-summary-${tag}.png`) });

  // ---- checks ---------------------------------------------------------------------------------
  // Dropped entirely, with reason: #hint/#goalPill/#handsFull/.relief-root-at-boot/.playables-clean/
  // .playables-compact/.meta-rep-title/.meta-rating/.career-* have no element anywhere in the
  // current source (grepped) — asserting their absence would be vacuous, not a real acceptance, so
  // those checks are removed rather than kept as always-true noise.
  // Batch E1: one daily goal (src/sim/dailyGoal.js), five kinds, targets derived from the café's
  // capacity. Derived here rather than hardcoded, so the check stays a real acceptance ("the live
  // goal is the one the sim would choose for this day and this café") instead of a copied literal
  // that has to be re-copied every time the ladder is retuned. The retired 'streak' verb is
  // explicitly refused.
  const expectedGoal = buildDailyGoal(13, { built: new Set(AREA1.zones.map(z => z.id)) });
  const goalBad = goal.day !== 13 || goal.kind !== expectedGoal.kind || goal.target !== expectedGoal.target
    || goal.kind === 'streak';
  const bootBad = !boot.platform || boot.metaVersion !== CURRENT_SAVE_VERSION || boot.overflow || !boot.wallet || !boot.pawbook || !boot.pause || !boot.petCount;
  const todayBad = todayRow.count < 1 || todayRow.overflow;
  const starsBad = stars.pawPips !== 5 || stars.overflow || !stars.hasRenovation;
  const smallBad = tag === 'small' && (
    !smallChecks || !smallChecks.pauseFrozen || !smallChecks.soundOff || !smallChecks.soundOn || smallChecks.walkPaid !== 0 || smallChecks.earlyPaid !== 0 || !(smallChecks.heldPaid > 0) ||
    !renovation || renovation.level !== 1 || renovation.spent !== RENOVATIONS[0].cost || renovation.next !== RENOVATIONS[1].name ||
    !interaction || interaction.shopTitle !== 'Staff' || interaction.pantry.sack !== 'beans' || interaction.pantry.guide !== 'COFFEE' ||
    interaction.pantry.button || interaction.pantry.sheet || !interaction.supply.empty || interaction.supply.delta !== 0 ||
    interaction.waste.fruit !== 0 || interaction.waste.spent !== 0 || interaction.waste.tracked !== 0 || interaction.blender.machine <= 0 ||
    interaction.cash.pile !== 0 || interaction.cash.gained !== 206 || interaction.cash.collectVisible || interaction.cash.cashLabel || interaction.cash.legacyCashLabel ||
    interaction.cleaning.dirty || interaction.cleaning.cleanVisible
  );
  const bookBad = book.cards !== PET_CARD_COUNT || book.found < 7 || book.overflow;
  const bonusCoins = Number(String(summary.bonusCoins).replace(/[^\d]/g, ''));
  // DOUBLE TODAY (Batch E2, ship plan §1.7a): +100% of the day's sales, min 100, and the button
  // says "×2". It was 35%; the band moved with the reward, and the framing is now asserted too.
  const summaryIsBad = summary.earned !== (1180).toLocaleString('en-US') || summary.rows < 1 || !summary.contract || !summary.starsRow
    || !summary.continueBtn || !summary.fits || summary.overflow || summary.bonusX2 !== '×2'
    || !(bonusCoins >= 1180 * 0.97 && bonusCoins <= 1180 * 1.03);

  const bad = bootBad || goalBad || todayBad || starsBad || smallBad || bookBad || summaryIsBad || errors.length;
  if (bad) failed = true;
  report.push({ tag, boot, smallChecks, goal, todayRow, stars, renovation, interaction, book, summary, errors, bad });
  await ctx.close();
}

fs.writeFileSync(path.join(shots, 'report-v2.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
await new Promise(resolve => server.close(resolve));
process.exit(failed ? 1 : 0);
