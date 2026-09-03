// tools/shot.js — build, serve dist, drive the slice, screenshot key moments on the GPU
import { execSync } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
execSync('npm run build', { stdio: 'inherit' });
const dist = path.resolve('dist'); fs.mkdirSync('shots', { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => { let p = path.join(dist, decodeURIComponent(req.url.split('?')[0])); if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }); }).listen(4174);
const W = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
// M3 T3: new 20x14 layout (data/area1.js) — oven1 front, counter1 front and the first zone
// (z_counter2) per the controller's ruling; register1's front (for the manned-register shot) is
// the same default-forward-1.3m spot every station gets in world.js. register1's CASH spot is
// fetched live from st.cash below instead of hardcoded, per the ruling.
// M3 T3 fix round 2 (controller ruling): kiosk1 moved to (9.0,-3.5) rot -pi/2 (its default front
// is now (7.7,-3.5), replacing the old rot-pi kiosk's (4.5,4.7) front).
const AREA = { oven: { x: 6.5, z: -3.6 }, counter: { x: 2.0, z: -0.6 }, registerFront: { x: -5.5, z: -0.7 }, zone: { x: 5.0, z: -0.5 }, kioskFront: { x: 7.7, z: -3.5 } };
// zone build-circle positions from data/area1.js, in chain order (each requires the previous)
const ZONE_POS = {
  z_counter2: { x: 5.0, z: -0.6 }, z_seats1: { x: -6.75, z: 4.3 }, z_oven2: { x: 3.5, z: -3.6 },
  z_register2: { x: -8.0, z: -0.6 }, z_coffee: { x: 0.5, z: -3.6 }, z_hire: { x: -7.2, z: 1.0 },
  z_bowl: { x: 5.3, z: 2.5 }, z_garden: { x: 6.0, z: 4.2 }, z_blender: { x: -3.5, z: -3.6 },
  z_counter3: { x: -1.0, z: -0.6 }, z_kiosk: { x: 7.4, z: -3.5 }, z_seats2: { x: 0.8, z: 4.3 },
  z_gate: { x: 8.3, z: -1.0 },
};
async function walkTo(page, t) {
  for (let i = 0; i < 400; i++) {
    const d = await page.evaluate(t => { const G = window.__game; const p = G.owner.group.position; const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz); G.setMove(d < 0.15 ? 0 : dx / d, d < 0.15 ? 0 : dz / d); return d; }, t);
    if (d < 0.15) break; await W(33);
  }
  await page.evaluate(() => window.__game.setMove(0, 0));
}
// fast-forward one zone build: top up coins, walk to its circle, wait for the `built` event via payZone
// (called every frame by the running game loop while the owner stands on the circle).
async function buildZone(page, id) {
  await page.evaluate(() => { window.__game.coins = 999999; });
  await walkTo(page, ZONE_POS[id]);
  for (let i = 0; i < 200; i++) {
    const built = await page.evaluate(id => window.__game.world.built.has(id), id);
    if (built) break;
    await W(33);
  }
}
// the full zone chain, in order — buildZone(id) requires everything before it already built.
const CHAIN = ['z_counter2', 'z_seats1', 'z_oven2', 'z_register2', 'z_coffee', 'z_hire', 'z_bowl', 'z_garden', 'z_blender', 'z_counter3', 'z_kiosk', 'z_seats2', 'z_gate'];
async function buildUpTo(page, id) {
  for (const z of CHAIN) { await buildZone(page, z); if (z === id) break; }
}
// I9: force every remaining zone open (via the same in-page payZone-through-the-running-game-loop
// path buildZone already uses), keep both counters topped up, and wait for a full house of
// customers so the draw-call sample after 'staff' isn't the best case in the whole run.
async function fullHouse(page) {
  await page.evaluate(() => { window.__game.coins = 999999; });
  await buildUpTo(page, 'z_gate');
  await page.evaluate(() => {
    const w = window.__game.world;
    for (const id of ['counter1', 'counter2', 'counter3']) {
      const st = w.stations.get(id);
      if (st) { st.items.length = 0; for (let i = 0; i < st.capacity; i++) st.items.push('cookie'); }
    }
  });
  for (let i = 0; i < 300; i++) {
    await page.evaluate(() => {
      const w = window.__game.world;
      for (const id of ['counter1', 'counter2', 'counter3']) {
        const st = w.stations.get(id);
        if (st) for (let j = st.items.length; j < st.capacity; j++) st.items.push('cookie');
      }
    });
    const n = await page.evaluate(() => window.__game.customers.length);
    if (n >= 8) break;
    await W(100);
  }
}
let failed = false;
let maxCalls = 0, maxTris = 0;
const allSamples = [];
async function sample(page, tag, label) {
  const info = await page.evaluate(() => { const r = window.__scene.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  maxCalls = Math.max(maxCalls, info.calls); maxTris = Math.max(maxTris, info.tris);
  allSamples.push({ tag, label, calls: info.calls, tris: info.tris });
  console.log(tag, label, 'draw calls', info.calls, 'triangles', info.tris);
  return info;
}
for (const [tag, w, h, dpr] of [['portrait', 450, 800, 2], ['landscape', 1280, 720, 1]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: tag === 'portrait' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4174/'); await page.waitForFunction(() => window.__game && !document.getElementById('loading').offsetParent, null, { timeout: 30000 });
  const shot = n => page.screenshot({ path: `shots/${n}-${tag}.png` });
  await W(500); await shot('boot'); await sample(page, tag, 'boot');
  await page.evaluate(() => { window.__game.coins = 0; });
  await walkTo(page, AREA.oven); await W(2500); await shot('oven'); await sample(page, tag, 'oven');
  await walkTo(page, AREA.counter); await W(1500); await shot('counter'); await sample(page, tag, 'counter');
  await W(9000); await shot('queue'); await sample(page, tag, 'queue');

  // register: a queue has built up at register1 unmanned (nobody has paid yet — money is only
  // taken while someone stands at the register, M3 T3); walk the owner into its front circle and
  // let stepRegisters start clearing the queue for the shot.
  await walkTo(page, AREA.registerFront); await W(2000); await shot('register'); await sample(page, tag, 'register');

  // cash: walk to the register's cash spot (fetched live, not hardcoded) and collect the pile
  // stepRegisters has been crediting while the owner mans the register.
  const regCash = await page.evaluate(() => { const st = window.__game.world.stations.get('register1'); return { x: st.cash.x, z: st.cash.z }; });
  await walkTo(page, regCash); await W(1200); await shot('cash'); await sample(page, tag, 'cash');
  await page.evaluate(() => { window.__game.coins = 200; });
  await walkTo(page, AREA.zone); await W(2500); await shot('built'); await sample(page, tag, 'built');

  // seated: build the tables zone too, restock counter1 to full, give customers time to queue, pay and sit
  await buildZone(page, 'z_seats1');
  await page.evaluate(() => { const st = window.__game.world.stations.get('counter1'); st.items.length = 0; for (let i = 0; i < 12; i++) st.items.push('cookie'); });
  await W(25000); await shot('seated'); await sample(page, tag, 'seated');

  // chains (Task 4): build up through z_blender (coffee/garden/blender all online), give the
  // owner a beans sack directly (matching the sack-carry shape systems/stations.js drives from
  // storage1 — natural pickup would pick whichever of beans/kibble is neediest, which isn't
  // deterministic in a fresh scene) and park it just outside the coffee machine's 1.3m refill
  // trigger radius (front is at z -3.9) so the sack is visibly still on the stack for the shot
  // instead of being consumed the instant the frame updates.
  await buildUpTo(page, 'z_blender');
  // z_hire (earlier in the chain) parks the owner right next to hire1's front, which auto-opens
  // the HIRE sheet — same gotcha the 'kiosk' step below already works around. Close it before
  // walking to the coffee machine so the sheet doesn't cover the shot.
  await W(500); await page.keyboard.press('Escape'); await W(300);
  await walkTo(page, { x: 0.5, z: -2.5 });
  await page.evaluate(() => { const G = window.__game; G.carry.sack = 'beans'; G.carry.sackLeft = 20; G.carry.fruit = 0; });
  await W(500); await shot('chains'); await sample(page, tag, 'chains');
  // Reset the forced carry state right after the shot — otherwise the sack mesh (an extra draw
  // call) rides the owner through every later sample (kiosk/staff/fullHouse) in this run, which
  // a real player's carry never would this artificially (it's this script's own direct
  // page.evaluate poke, not anything the sim/UI would do on its own).
  await page.evaluate(() => { const G = window.__game; G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0; });

  // kiosk: fast-forward the rest of the chain up to the upgrades kiosk, walk to its front, sheet opens on arrival.
  // Building z_hire parks the owner right next to hire1's front, which auto-opens the HIRE sheet
  // (once a sheet is open, stations.js won't open a different one on top of it) — close it first so
  // the kiosk's own arrival trigger gets a chance to open the UPGRADES sheet instead.
  await buildUpTo(page, 'z_counter3');
  await W(500); // the hire-desk proximity trigger fires a frame after `built`, not necessarily within it — let it settle
  await page.keyboard.press('Escape'); await W(300);
  await buildZone(page, 'z_kiosk');
  await walkTo(page, AREA.kioskFront); await W(1000); await shot('kiosk'); await sample(page, tag, 'kiosk');

  // staff: close the kiosk sheet left open from the previous moment, then hire a runner and a cashier
  // directly on G (the render-side systems/staff.js mirror spawns them into the world).
  await page.keyboard.press('Escape'); await W(300);
  await page.evaluate(() => { window.__game.staff.runner = (window.__game.staff.runner | 0) + 1; window.__game.staff.cashier = (window.__game.staff.cashier | 0) + 1; });
  await W(8000); await shot('staff'); await sample(page, tag, 'staff');

  // I9: full house — force the whole zone chain open, keep all counters stocked, and wait for
  // 8+ concurrent customers so the gate is checked against the busiest scene the game can produce,
  // not just the hand-picked moments above.
  await fullHouse(page);
  await sample(page, tag, 'fullHouse');

  await page.evaluate(() => window.__game.setMove(null));
  if (errors.length) { console.error(tag, 'page errors:\n' + errors.join('\n')); failed = true; }
  await ctx.close();
}
console.log('samples:', allSamples.length);
console.log('MAX draw calls', maxCalls, 'MAX triangles', maxTris);
if (maxCalls > 200 || maxTris > 150000) { console.error('BUDGET EXCEEDED (max across the run)'); failed = true; }
await browser.close(); srv.close(); process.exit(failed ? 1 : 0);
