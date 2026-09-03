// tools/strip.js — Task 6's visual review vehicle: builds, serves dist/ on 4174, drives the owner
// headlessly through the SAME competent-player priority loop tools/bot.js runs (window.__game.
// setMove steered toward window.__game.botDecide()'s {x,z} — src/game.js's thin bridge onto
// src/sim/botDecide.js's decide(w, G), which also hires/upgrades opportunistically as a side
// effect) for 3 minutes of real/game time, capturing 12 frames at 15s intervals (450x800) and
// tiling them 2 cols x 6 rows (each tile 225x400) into shots/strip.png. Also captures
// shots/panel-portrait.png (Workers tab open, a runner already hired so the Speed/Carry sub-rows
// show) and shots/build-portrait.png (a build outline mid-pay, cash bills flying) on a separate
// fresh context, staged deterministically like tools/shot.js already does (coins forced, walked
// to an exact spot) rather than left to chance.
//
// Loop v2 Task 1: `--cold` runs ONLY the 3-minute play strip, starting from a genuine fresh save
// (0 coins, forced to 0 every driven tick so nothing is ever affordable — no zone ever gets
// built), tiled at full 450x800 per frame (not the warm run's half-scale 225x400) into
// shots/strip-cold.png. The staged Phase 2 shots (build-portrait/panel-portrait) are skipped in
// --cold mode — they're about a mid-progression café, not a cold start.
//
// Loop v2 Task 3: `--day` runs ONLY a single full day (240 real/game seconds — src/sim/day.js's
// DAY_LENGTH) at a moderate starting bankroll (so zones/hires/stars actually happen, same as the
// warm run), capturing 16 frames at 15s intervals (one whole day, exactly 16 * 15 = 240s) tiled
// 2 cols x 8 rows into shots/strip-day.png. Unlike the warm/--cold driveStep, an open CARD sheet
// (the day summary — sheets.js's 'summary'/'end' kind, class .card) is deliberately left alone
// instead of Escaped every tick, so the final frame(s) can actually show it once dayEnd fires.
import { execSync } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const COLD = process.argv.includes('--cold');
const DAY = process.argv.includes('--day');

execSync('npm run build', { stdio: 'inherit' });
const dist = path.resolve('dist'); fs.mkdirSync('shots', { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
}).listen(4174);
const W = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

// Straight-line walk helper shared by both phases below — mirrors tools/shot.js's own walkTo.
async function walkTo(page, t) {
  for (let i = 0; i < 400; i++) {
    const d = await page.evaluate(t => {
      const G = window.__game; const p = G.owner.group.position;
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      G.setMove(d < 0.15 ? 0 : dx / d, d < 0.15 ? 0 : dz / d);
      return d;
    }, t);
    if (d < 0.15) break;
    await W(33);
  }
  await page.evaluate(() => window.__game.setMove(0, 0));
}

let failed = false;
const errorsFor = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); return errs; };

// ---------------------------------------------------------------------------------------------
// Phase 1: the 3-minute play strip. A fresh context, a modest starting bankroll (this tool's job
// is to exercise the M3 readability UI over a natural, competent session — tools/bot.js proves
// economic pacing headlessly, without rendering). Every ~33ms tick, steer the owner toward
// botDecide()'s {x,z}; idle once nothing is pending. Proximity-only jobs (register, clean,
// harvest, build, restock/refill pickup-and-drop) all resolve automatically once the owner is
// standing in the right spot — src/systems/stations.js, untouched by this task, already does the
// actual taking/dropping/harvesting/refilling on proximity, exactly like a real player walking
// there; botDecide() only ever has to say where to walk next and grab hires/upgrades as they
// become affordable.
{
  const ctx = await browser.newContext({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = errorsFor(page);
  await page.goto('http://localhost:4174/');
  await page.waitForFunction(() => window.__game && !document.getElementById('loading').offsetParent, null, { timeout: 30000 });
  // Loop v2 Task 1: --cold starts (and stays) at 0 coins — driveStep re-zeroes it every tick below
  // so nothing is ever affordable and no zone gets built, a genuine cold-start session.
  await page.evaluate(cold => { window.__game.coins = cold ? 0 : 3000; }, COLD);

  async function driveStep() {
    await page.evaluate(({ cold, day }) => {
      // M3 T6: nothing in the base game ever auto-closes the UPGRADES sheet once proximity opens
      // it (src/systems/stations.js only re-arms the trigger on walking away — the sheet itself
      // only closes on a backdrop click or Escape, both real-player gestures) — and reaching the
      // hire desk is now routine for a competent botDecide()-driven owner, not the rare event the
      // original debugNextTarget()-driven strip (which never got that far in 3 minutes) saw. A
      // player who glances at a panel that just auto-opened and gets back to work would dismiss
      // it, so simulate that Escape keypress before steering each tick — otherwise the sheet
      // blocks the whole café view (wish bubbles, patience bars, the arrow) for the rest of the run.
      // Loop v2 Task 3 (--day): the day-summary card (sheets.js's 'summary'/'end' kind, the only
      // sheet rendered with class .card) is the ONE exception — leave it open once dayEnd fires so
      // the strip's later frames can actually show it, instead of Escaping it away every tick.
      const cardOpen = day && document.querySelector('.card');
      if (!document.querySelector('.sheet-root.hidden') && !cardOpen) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
      const G = window.__game;
      if (cold) G.coins = 0; // --cold: never let a stray register collection make a zone affordable
      const t = G.botDecide();
      if (!t) { G.setMove(0, 0); return; }
      const p = G.owner.group.position;
      // Arrival is judged against the station's waypoint (botDecide()'s {x,z} — a front point, or
      // a cash spot for 'cash'). A station errand stops within a generous radius (0.7m — well
      // inside every dwell/proximity check in systems/stations.js, 1.0-1.3m) rather than homing in
      // on the exact point: the final centimetres of closing in on an exact point are jittery
      // (damp() lag, tiny back-and-forth corrections) and can leave the owner facing an arbitrary
      // direction right as it stops. systems/stations.js's dwelling() auto-faces the owner toward
      // the station once the zone+speed dwell timer is otherwise satisfied, so precise final
      // heading here doesn't matter — just get close and stop. Non-station targets (cash/build
      // zones) keep the tight 0.15m; they're plain-proximity, no facing/dwell involved at all.
      const arriveR = t.stationId ? 0.7 : 0.15;
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < arriveR) { G.setMove(0, 0); return; }
      G.setMove(dx / d, dz / d);
    }, { cold: COLD, day: DAY });
  }

  const FRAME_INTERVAL_MS = 15000, FRAMES = DAY ? 16 : 12;
  const frameFiles = [];
  for (let i = 0; i < FRAMES; i++) {
    const until = Date.now() + FRAME_INTERVAL_MS;
    while (Date.now() < until) { await driveStep(); await W(33); }
    const file = path.resolve('shots', `_strip-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    frameFiles.push(file);
  }
  await page.evaluate(() => window.__game.setMove(0, 0));
  if (errors.length) { console.error('strip phase page errors:\n' + errors.join('\n')); failed = true; }
  await ctx.close();

  // Tile 2 cols x N rows via a tiny generated HTML page — no image library, Playwright just
  // screenshots the layout. Warm run: each tile half-scale (225x400) of the captured 450x800
  // frame, 6 rows (12 frames). --cold: full-size (450x800) tiles per the Task 1 spec, 6 rows,
  // into shots/strip-cold.png. --day: full-size tiles, 8 rows (16 frames), into shots/strip-day.png.
  const rows = DAY ? 8 : 6;
  const tileW = (COLD || DAY) ? 450 : 225, tileH = (COLD || DAY) ? 800 : 400;
  const tileHtmlPath = path.resolve('shots', '_tile.html');
  const imgs = frameFiles.map(f => `<img src="${path.basename(f)}">`).join('');
  fs.writeFileSync(tileHtmlPath,
    '<!doctype html><html><head><style>' +
    'html,body{margin:0;padding:0;background:#111}' +
    `.grid{display:grid;grid-template-columns:repeat(2,${tileW}px);grid-template-rows:repeat(${rows},${tileH}px);width:${tileW * 2}px;height:${tileH * rows}px}` +
    `.grid img{width:${tileW}px;height:${tileH}px;display:block;object-fit:cover}` +
    '</style></head><body><div class="grid">' + imgs + '</div></body></html>');
  const tileCtx = await browser.newContext({ viewport: { width: tileW * 2, height: tileH * rows }, deviceScaleFactor: 1 });
  const tilePage = await tileCtx.newPage();
  await tilePage.goto('file://' + tileHtmlPath.replace(/\\/g, '/'));
  await tilePage.waitForTimeout(300);
  const outFile = DAY ? 'shots/strip-day.png' : COLD ? 'shots/strip-cold.png' : 'shots/strip.png';
  await tilePage.screenshot({ path: outFile });
  await tileCtx.close();
  for (const f of frameFiles) fs.unlinkSync(f);
  fs.unlinkSync(tileHtmlPath);
  console.log(`wrote ${outFile} (${FRAMES} frames, 2x${rows}, ${tileW * 2}x${tileH * rows})`);
}

// ---------------------------------------------------------------------------------------------
// Phase 2: two deterministic, staged shots on a fresh context — build-portrait.png (a build
// outline mid-pay) and panel-portrait.png (the upgrade panel's Workers tab, opened via the HUD
// "UPGRADES" button — Loop v2 Task 1 removed the old hire-desk proximity auto-open). Zone
// build-circle positions mirror data/area1.js's geometry. Skipped entirely in --cold/--day mode:
// neither of those deliverables asks for these two staged shots.
if (!COLD && !DAY) {
  const ctx = await browser.newContext({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = errorsFor(page);
  await page.goto('http://localhost:4174/');
  await page.waitForFunction(() => window.__game && !document.getElementById('loading').offsetParent, null, { timeout: 30000 });

  // build-portrait / panel-portrait share one zone chain (data/area1.js's dependency order, up to
  // z_hire — Loop v2 Task 1's nine-zone chain starts at z_seats1, not the old z_counter2).
  const ZONE_POS = {
    z_seats1: { x: -6.75, z: 4.3 }, z_oven2: { x: 3.5, z: -3.6 },
    z_register2: { x: -8.0, z: -0.6 }, z_hire: { x: -7.2, z: 1.0 },
  };
  const CHAIN = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire'];

  // build-portrait: fully pay off the chain up to (but not including) z_hire — a rotated station
  // (hire1: fw 1.0 x fd 1.6, rot pi/2) — so its outline/ghost is still the one open zone, then park
  // a small bankroll (well under z_hire's M3 T6 price of 210 — see data/area1.js) near it so the
  // outline, price bubble and mid-flight cash bills are all in frame while it reads as 1.0m wide x
  // 1.6m deep along the wall.
  const PRE_HIRE_CHAIN = CHAIN.slice(0, CHAIN.indexOf('z_hire'));
  for (const id of PRE_HIRE_CHAIN) {
    await page.evaluate(() => { window.__game.coins = 999999; });
    await walkTo(page, ZONE_POS[id]);
    for (let i = 0; i < 200; i++) {
      const built = await page.evaluate(id => window.__game.world.built.has(id), id);
      if (built) break;
      await W(33);
    }
  }
  await page.evaluate(() => { window.__game.coins = 24; });
  await walkTo(page, { x: -6.5, z: 1.0 });
  await W(1200);
  await page.screenshot({ path: 'shots/build-portrait.png' });
  console.log('wrote shots/build-portrait.png');

  // panel-portrait: finish the chain through z_hire, hire a runner directly (same as tools/bot.js's
  // headless economy does — no UI click needed) so the panel shows a worker already on staff and
  // its Speed/Carry level sub-rows render (ui/sheets.js's levelSubrow, gated on count >= 1 — see
  // ui/models.js), then walk to the hire desk's own front point and tap the floating ".fbtn" button
  // (Loop v2 Task 2 replaced the old HUD "UPGRADES" pill with this) and the Workers tab.
  await page.evaluate(() => { window.__game.coins = 999999; });
  await walkTo(page, ZONE_POS.z_hire);
  for (let i = 0; i < 200; i++) {
    const built = await page.evaluate(() => window.__game.world.built.has('z_hire'));
    if (built) break;
    await W(33);
  }
  await page.evaluate(() => { window.__game.staff.runner = 1; });
  const hireFront = await page.evaluate(() => { const st = window.__game.world.stations.get('hire1'); return { x: st.front.x, z: st.front.z }; });
  await walkTo(page, hireFront);
  await page.waitForSelector('.fbtn:not(.hidden)', { timeout: 5000 });
  await page.click('.fbtn');
  await page.click('.stab:has-text("Workers")');
  await W(1200);
  await page.screenshot({ path: 'shots/panel-portrait.png' });
  console.log('wrote shots/panel-portrait.png');

  await page.evaluate(() => window.__game.setMove(0, 0));
  if (errors.length) { console.error('staged-shots phase page errors:\n' + errors.join('\n')); failed = true; }
  await ctx.close();
}

await browser.close(); srv.close(); process.exit(failed ? 1 : 0);
