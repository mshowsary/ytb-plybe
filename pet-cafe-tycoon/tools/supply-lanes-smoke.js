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
// Batch C rewired the supply lanes themselves (docs/SHIP-PLAN-2026-09-19.md 1.4): the pantry's
// SUPPLIES button and the PANTRY sheet behind it are gone -- stopping at the pantry hands over the
// sack the neediest connected machine wants, and one refill uses that sack up completely -- and the
// treat bowl keeps its own kibble bin, so standing at the bowl fills it with no sack trip at all.
// So what is driven below is: walk in, stop, hands full of the right thing; walk to the machine,
// stop, machine full, hands empty.
//
// Drives the real UI throughout -- walks with the movement input and stops where a player would --
// so a break anywhere in that chain fails this, not just a sim regression.
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
  const pantryStocking = supply => [...G.world.stations.values()].find(s => {
    if (!s.active || s.type !== 'pantry') return false;
    const data = G.world.area.stations.find(d => d.id === s.id);
    const sup = data && Array.isArray(data.supplies) && data.supplies.length ? data.supplies : ['beans'];
    return sup.indexOf(supply) >= 0;
  });

  const rows = [];

  // --- the carried lane: beans, from the pantry, in one sack that one refill uses up ------------
  {
    const lane = { type: 'coffee', supply: 'beans', field: 'beans' };
    const st = [...G.world.stations.values()].find(s => s.active && s.type === lane.type);
    const pantry = pantryStocking(lane.supply);
    if (!st) rows.push(Object.assign({}, lane, { missing: true }));
    else if (!pantry) rows.push(Object.assign({}, lane, { noPantry: true }));
    else {
      // Run it dry, exactly as a busy day would.
      st[lane.field] = 0;
      G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
      if (G.owner.clearItems) G.owner.clearItems();
      step(6);

      // Fetch it the way a player does now: walk over and STOP. No button, no sheet.
      const distToPantry = walkTo(pantry.front.x, pantry.front.z);
      G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
      G.owner.clearItems();
      step(30);
      const picked = G.carry.sack;
      const sheet = !document.querySelector('.sheet-root').classList.contains('hidden');
      const button = !!document.querySelector('.fbtn:not(.hidden)');

      // Pour it in: walk to the machine's front spot and stand still.
      const distToMachine = walkTo(st.front.x, st.front.z);
      step(90);
      rows.push(Object.assign({}, lane, {
        pantryId: pantry.id, picked, sheet, button, distToPantry: +distToPantry.toFixed(2),
        distToMachine: +distToMachine.toFixed(2), filled: st[lane.field] | 0,
        leftover: G.carry.sack,
      }));
    }
  }

  // --- the bin lane: the treat bowl fills from its own kibble bin, with no sack trip ------------
  {
    const lane = { type: 'bowl', supply: 'kibble', field: 'stock' };
    const st = [...G.world.stations.values()].find(s => s.active && s.type === lane.type);
    if (!st) rows.push(Object.assign({}, lane, { missing: true }));
    else {
      st[lane.field] = 0;
      G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
      if (G.owner.clearItems) G.owner.clearItems();
      step(6);
      const distToMachine = walkTo(st.front.x, st.front.z);
      G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 0;
      G.owner.clearItems();
      step(60);
      rows.push(Object.assign({}, lane, {
        bin: true, distToMachine: +distToMachine.toFixed(2), filled: st[lane.field] | 0,
        leftover: G.carry.sack, noPantryNeeded: !pantryStocking('kibble'),
      }));
    }
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
  console.log(r.type.padEnd(9) + ' <- ' + r.supply.padEnd(6) + (r.bin ? ' from its own bin' : ' from ' + String(r.pantryId)) +
    '  picked=' + (r.bin ? '-' : r.picked) + '  filled=' + r.filled + '  leftInHand=' + r.leftover);
  if (r.distToMachine > 0.8) failures.push(r.type + ': could not walk to the machine (stopped ' + r.distToMachine + ' m away)');
  if (!(r.filled > 0)) failures.push(r.type + ': stood at it dry and nothing was refilled');
  if (r.leftover) failures.push(r.type + ': a refill left ' + r.leftover + ' in the hands — one refill must use the sack up');
  if (r.bin) {
    if (!r.noPantryNeeded) failures.push(r.type + ': a pantry still stocks ' + r.supply + ', so the sack trip is back');
    continue;
  }
  if (r.distToPantry > 0.6) failures.push(r.type + ': could not walk to the ' + r.pantryId + ' (stopped ' + r.distToPantry + ' m away)');
  if (r.picked !== r.supply) failures.push(r.type + ': stopping at the ' + r.pantryId + ' left the owner holding ' + r.picked);
  if (r.sheet) failures.push(r.type + ': the pantry opened a sheet — the PANTRY sheet is deleted');
  if (r.button) failures.push(r.type + ': the pantry raised an action button — supplies are a walk-up now');
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
