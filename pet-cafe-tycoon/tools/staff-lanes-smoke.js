// tools/staff-lanes-smoke.js
//
// Who works where.
//
// The day-18 report: "the hire logic is a mess — the first Runner I hire, with no assignment, fills
// the cookies, cupcakes, smoothies, coffee, maybe ice cream too; and the Runner and the Barista keep
// alternating on the coffee counter and the coffee machine."
//
// Both were true. A runner hired from the desk started with `assign = null`, which in sim/staff.js
// means "service whichever counter is neediest this instant" — correct, and unreadable from the
// outside. And systems/baristaWorker.js is kept out of the Runner system so the Barista can never
// drift into bakery work, but nothing kept a Runner out of the Barista's lane, so both ranked the
// same espresso machine and both stocked the same coffee counter.
//
// This runs a fully built café with two Runners and a Barista, for four sim minutes, and pins:
//   - every runner holds a lane, and two runners never share one while a free lane exists
//   - while a Barista is on staff, no runner ever targets the coffee machine or the coffee counter
//   - no lane starves: every display is restocked over the run (the assignment is a priority, not
//     a cage — a runner whose own counter is full still helps)
//   - an idle runner waits at its OWN counter, not at the front door
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
const PORT = 4196;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('staff-lanes-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const shots = path.resolve('shots-production', 'staff-lanes');
fs.mkdirSync(shots, { recursive: true });
const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 800));

const out = await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;
  G.coins = 1e6;
  for (const z of [...G.world.area.zones]) {
    if (G.world.built.has(z.id)) continue;
    if (z.requires && !G.world.built.has(z.requires)) continue;
    G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 300 && !G.world.built.has(z.id); i++) G.update(0.1);
  }
  G.dayState.day = 12;
  G.coins = 1e6;
  G.staff.runner = 2; G.staff.barista = 1; G.staff.cashier = 1;
  G.P.x = 0; G.P.z = 3; G.P.vx = 0; G.P.vz = 0;
  // Stand the supply side up: this smoke is about WHO restocks WHAT, not about whether the player
  // remembered to pick fruit. Blenders run on fruit the owner harvests by hand, so without this the
  // smoothie lane simply has nothing to produce and would read as a starved lane.
  const topUpSupplies = () => {
    for (const st of G.world.stations.values()) {
      if (st.type === 'coffee') st.beans = 20;
      if (st.type === 'blender') st.fruit = 9;
    }
  };
  topUpSupplies();
  // The Barista is stepped from main.js's frame loop, NOT from G.update — systems/baristaWorker.js
  // is deliberately outside the generic staff system. A fixture that only drives G.update leaves it
  // frozen at spawn, which looks exactly like a Barista that refuses to work.
  const step = dt => { G._force = null; G.update(dt); window.__baristaWorker.update(dt); };
  for (let i = 0; i < 90; i++) step(1 / 30);

  const coffeeIds = new Set([...G.world.stations.values()]
    .filter(st => st.type === 'coffee' || (st.type === 'display' && /coffee|latte/.test(st.product)))
    .map(st => st.id));
  const displayIds = (G.world.displays || []).slice();
  const restocked = new Set();
  const prevStock = new Map();
  for (const id of displayIds) prevStock.set(id, G.world.stations.get(id).stock);

  const runnerCoffeeTargets = new Set();
  let samples = 0, idleAtOwn = 0, idleSamples = 0, sharedLane = 0;
  for (let i = 0; i < 240 * 30; i++) {
    step(1 / 30);
    if (i % 300 === 0) topUpSupplies();
    if (i % 10 !== 0) continue;
    samples++;
    const runners = G.staffList.filter(s => s.kind === 'runner');
    const lanes = runners.map(s => s.assign || '');
    if (new Set(lanes.filter(Boolean)).size < lanes.filter(Boolean).length) sharedLane++;
    for (const s of runners) {
      if (s.target && coffeeIds.has(s.target)) runnerCoffeeTargets.add(s.target);
      // "Idle" here is the sim's own idle: nothing in hand and no job target.
      if (s.state === 'idle' && !s.items.length && s.assign) {
        const own = G.world.stations.get(s.assign);
        if (own && own.front) {
          idleSamples++;
          if (Math.hypot(s.x - own.front.x, s.z - own.front.z) < 2.6) idleAtOwn++;
        }
      }
    }
    for (const id of displayIds) {
      const st = G.world.stations.get(id);
      if (st.stock > prevStock.get(id)) restocked.add(id);
      prevStock.set(id, st.stock);
    }
  }
  const runners = G.staffList.filter(s => s.kind === 'runner');
  const coffeeDisplay = [...G.world.stations.values()].find(st => st.type === 'display' && /coffee|latte/.test(st.product));
  return {
    samples, sharedLane,
    barista: G.baristaWorker ? { active: G.baristaWorker.active, state: G.baristaWorker.state, debug: G.baristaWorker.debug } : null,
    coffeeMachine: (() => { const m = [...G.world.stations.values()].find(st => st.type === 'coffee'); return m ? { id: m.id, active: m.active, stock: m.stock, beans: m.beans, product: m.product } : null; })(),
    coffeeDisplay: coffeeDisplay
      ? { id: coffeeDisplay.id, stock: coffeeDisplay.stock, capacity: coffeeDisplay.capacity, restocked: restocked.has(coffeeDisplay.id) }
      : null,
    lanes: runners.map(s => ({ assign: s.assign, product: s.assign ? G.world.stations.get(s.assign).product : null })),
    runnerCoffeeTargets: [...runnerCoffeeTargets],
    displays: displayIds.map(id => ({ id, product: G.world.stations.get(id).product, restocked: restocked.has(id) })),
    idleAtOwnShare: idleSamples ? idleAtOwn / idleSamples : null,
    idleSamples,
    baristaOnDuty: !!G.world.baristaOnDuty,
  };
});
await page.screenshot({ path: path.join(shots, 'lanes.png') });
await browser.close();
await new Promise(resolve => server.close(resolve));

if (!out.baristaOnDuty) failures.push('the world never registered a Barista on duty');
if (out.lanes.some(l => !l.assign)) failures.push('a runner was left with no lane: ' + JSON.stringify(out.lanes));
if (out.sharedLane > 0) failures.push('two runners shared a lane on ' + out.sharedLane + ' of ' + out.samples + ' samples while free lanes existed');
if (out.runnerCoffeeTargets.length) failures.push('a runner worked the Barista\'s lane: ' + out.runnerCoffeeTargets.join(', '));
const starved = out.displays.filter(d => !d.restocked && !/coffee|latte/.test(d.product));
if (starved.length) failures.push('these counters were never restocked in four minutes: ' + starved.map(d => d.product).join(', '));
// Banning runners from the coffee lane is only safe because the Barista actually works it. If the
// Barista ever stops stocking, this smoke has to say so rather than quietly pass on an exclusion.
if (!out.coffeeDisplay) failures.push('no coffee counter was found to check');
else if (!out.coffeeDisplay.restocked && out.coffeeDisplay.stock < out.coffeeDisplay.capacity) {
  failures.push('the coffee counter sat at ' + out.coffeeDisplay.stock + '/' + out.coffeeDisplay.capacity
    + ' and the Barista never restocked it — the lane the runners were told to leave alone is unmanned');
}
if (out.idleSamples > 20 && out.idleAtOwnShare < 0.6) {
  failures.push('an idle runner was at its own counter only ' + Math.round(out.idleAtOwnShare * 100) + '% of the time');
}

console.log('lanes: ' + out.lanes.map(l => l.product).join(', '));
console.log('restocked: ' + out.displays.filter(d => d.restocked).map(d => d.product).join(', '));
console.log('never restocked: ' + (out.displays.filter(d => !d.restocked).map(d => d.product).join(', ') || 'none'));
console.log('coffee counter (the Barista lane): ' + (out.coffeeDisplay
  ? out.coffeeDisplay.stock + '/' + out.coffeeDisplay.capacity + (out.coffeeDisplay.restocked ? ', restocked' : ', never restocked')
  : 'missing'));
console.log('barista: ' + JSON.stringify(out.barista && { active: out.barista.active, state: out.barista.state, job: out.barista.debug && out.barista.debug.job }));
console.log('coffee machine: ' + JSON.stringify(out.coffeeMachine));
console.log('runner incursions into the coffee lane: ' + (out.runnerCoffeeTargets.length || 'none'));
console.log('idle runners waiting at their own counter: '
  + (out.idleAtOwnShare == null ? 'n/a' : Math.round(out.idleAtOwnShare * 100) + '% of ' + out.idleSamples + ' samples'));
if (failures.length) {
  console.error('\nstaff-lanes-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nstaff-lanes-smoke OK');
