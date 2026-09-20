// tools/supply-lanes-smoke.js
//
// Every machine that drinks a supply must be refillable BY THE PLAYER, and the game must say where
// that supply is kept.
//
// The defect this exists to prevent from coming back (owner playtest, 2026-09-16 — "the garden or
// rooftop or terrace all builds, and interactions also not working as it should", and "the supplies
// for the icecream I guess I get milk or whatever it is, but visually it seem the bot carry on
// something"): the ice cream machine (and the since-retired spa bath) were only half-built for the
// player. refillCream existed in the simulation and the bot used it, the cold pantry sold cream,
// the owner even carried the sack visibly — but nothing in systems/stations.js ever called it, the
// ice cream machine was missing from the machine block entirely so its product could not be
// collected, canDeliverTo did not recognise the sack (so the game routed an owner holding cream to
// the RETURN crate), and the job detector never noticed the machine running dry, so there was no
// arrow and no coach. Every supply lane the café still has is driven below. (The cream lane itself
// was cut on 2026-09-19 — the garden's ice cream machine needs no supply — so what is left to drive
// for it is its product: the owner working the stand moves cones from the machine to the counter.)
//
// Drives the real UI throughout — walks with the movement input, presses the floating action
// button, taps the pantry sheet — so a break anywhere in that chain fails this, not just a sim
// regression.
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
const PORT = 4193;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('supply-lanes-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const G = window.__game;
  if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
  G.coins += 90000;
  for (const z of G.world.area.zones) {
    if (G.world.built.has(z.id)) continue;
    G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 160 && !G.world.built.has(z.id); i++) G.update(0.1);
  }
  const step = n => { for (let i = 0; i < n; i++) { G._force = null; G.update(1 / 30); } };
  // Placed a short walk away rather than steered across the whole cafe: this smoke is about the
  // interaction chain (button -> sheet -> carry -> dwell -> refill), and a straight-line steer with
  // no pathfinding just wedges behind the furniture and tests nothing. The last metre is walked for
  // real through the movement input, and the collision settles the owner legally on arrival.
  const walkTo = (x, z, frames = 120) => {
    G.P.x = x; G.P.z = z + 1.0; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < frames; i++) {
      const dx = x - G.P.x, dz = z - G.P.z, d = Math.hypot(dx, dz);
      if (d < 0.18) break;
      G._force = { x: dx / d, z: dz / d };
      G.update(1 / 30);
    }
    G._force = null;
    return Math.hypot(x - G.P.x, z - G.P.z);
  };
  const press = () => {
    const b = document.querySelector('.fbtn');
    if (!b || b.classList.contains('hidden')) return null;
    const word = (b.querySelector('.fbtnWord') || {}).textContent || null;
    b.click();
    return word;
  };
  const pantryStocking = supply => [...G.world.stations.values()].find(s => {
    if (!s.active || s.type !== 'pantry') return false;
    const data = G.world.area.stations.find(d => d.id === s.id);
    const sup = data && Array.isArray(data.supplies) && data.supplies.length ? data.supplies : ['beans', 'kibble'];
    return sup.indexOf(supply) >= 0;
  });

  const LANES = [
    { type: 'coffee', supply: 'beans', field: 'beans' },
    { type: 'bowl', supply: 'kibble', field: 'stock' },
  ];
  const rows = [];
  for (const lane of LANES) {
    const st = [...G.world.stations.values()].find(s => s.active && s.type === lane.type);
    if (!st) { rows.push(Object.assign({}, lane, { missing: true })); continue; }

    // Run it dry, exactly as a busy day would.
    st[lane.field] = 0;
    G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
    if (G.owner.clearItems) G.owner.clearItems();
    step(6);

    const pantry = pantryStocking(lane.supply);
    if (!pantry) { rows.push(Object.assign({}, lane, { noPantry: true })); continue; }

    // Fetch it through the real UI: walk over, press SUPPLIES, tap the supply.
    const distToPantry = walkTo(pantry.front.x, pantry.front.z);
    step(12);
    // Empty-handed HERE, not before setting off: standing at the previous lane's machine with the
    // dwell already satisfied, the owner helpfully picks its product straight back up, and a pantry
    // answers full hands with a banner instead of its sheet.
    G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
    G.owner.clearItems();
    const word = press();
    await new Promise(r => setTimeout(r, 30));
    const offered = [...document.querySelectorAll('[data-supply]')].map(b => b.dataset.supply);
    const choice = document.querySelector('[data-supply="' + lane.supply + '"]');
    if (choice) choice.click();
    step(6);
    const picked = G.carry.sack;

    // Pour it in: walk to the machine's front spot and stand still long enough to dwell.
    const distToMachine = walkTo(st.front.x, st.front.z);
    step(90);
    rows.push(Object.assign({}, lane, {
      pantryId: pantry.id, word, picked, offered, distToPantry: +distToPantry.toFixed(2),
      distToMachine: +distToMachine.toFixed(2), filled: st[lane.field] | 0,
    }));
  }

  // The ice cream machine must also hand its product over, like every other machine — and because
  // it stands directly behind the garden stand, both worked from one spot, the owner standing there
  // puts each cone straight on the stand's counter.
  const ice = [...G.world.stations.values()].find(s => s.active && s.type === 'icecream');
  const stand = [...G.world.stations.values()].find(s => s.active && s.selfServe);
  let collected = null;
  if (ice && stand) {
    G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
    if (G.owner.clearItems) G.owner.clearItems();
    stand.stock = 0; ice.stock = 6;
    walkTo(ice.front.x, ice.front.z);
    step(90);
    collected = { fromMachine: 6 - ice.stock + 0, onStand: stand.stock, inHand: G.owner.items.length };
  }
  return { rows, collected };
});

await browser.close();
await new Promise(resolve => server.close(resolve));

for (const r of out.rows) {
  if (r.missing) { failures.push('no active ' + r.type + ' station to test'); continue; }
  if (r.noPantry) { failures.push('no pantry stocks ' + r.supply + ', so a dry ' + r.type + ' can never be refilled'); continue; }
  console.log(r.type.padEnd(9) + ' <- ' + r.supply.padEnd(6) + ' from ' + String(r.pantryId).padEnd(12) +
    ' button=' + r.word + '  offered=[' + (r.offered || []).join(',') + ']  picked=' + r.picked + '  filled=' + r.filled);
  if (r.distToPantry > 0.6) failures.push(r.type + ': could not walk to the ' + r.pantryId + ' (stopped ' + r.distToPantry + ' m away)');
  if (r.word !== 'SUPPLIES') failures.push(r.type + ': the ' + r.pantryId + ' offered "' + r.word + '" instead of SUPPLIES');
  if (r.picked !== r.supply) failures.push(r.type + ': tapping ' + r.supply + ' in the pantry sheet left the owner holding ' + r.picked);
  if (r.distToMachine > 0.8) failures.push(r.type + ': could not walk to the machine (stopped ' + r.distToMachine + ' m away)');
  if (!(r.filled > 0)) failures.push(r.type + ': carried ' + r.supply + ' to it and stood there, but it is still empty — no refill happens');
}
console.log('ice cream by hand: ' + JSON.stringify(out.collected));
if (!out.collected || !(out.collected.fromMachine > 0)) failures.push('the ice cream machine will not hand its product to the player');
else if (!(out.collected.onStand > 0)) failures.push('cones taken at the stand never reached its counter');

if (failures.length) {
  console.error('\nsupply-lanes-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nsupply-lanes-smoke OK');
