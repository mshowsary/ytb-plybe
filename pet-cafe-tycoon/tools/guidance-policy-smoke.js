// tools/guidance-policy-smoke.js
//
// The owner's rule for guidance (2026-09-17): a demo the FIRST time, an indicator when you
// hesitate, nothing forever. systems/objective.js resolves every target to a mode — walkthrough
// (trail + beacon + ring), pointer (beacon only) or nothing — and this pins that resolution on a
// day-4 café whose basics are already proven, with the café held quiet so each scenario is the only
// errand on the floor:
//   - nothing pending            -> nothing drawn
//   - a proven chore, standing still -> nothing for ~3 s, a pointer until ~7 s, then a walkthrough
//   - a chore never done before  -> a walkthrough at once
//   - a plot affordable for the first time, nothing urgent -> one walkthrough, then never again
//   - carrying on day 4, destination known -> a pointer; the same carry on day 1 -> a walkthrough
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
const PORT = 4195;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('guidance-policy-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 800));

const out = await page.evaluate(() => {
  const G = window.__game, S = window.__scene;
  const vis = n => { let m = null; S.scene.traverse(o => { if (o.name === n) m = o; }); return !!m && m.visible; };
  const snap = () => ({ trail: vis('guide-trail'), beacon: vis('guide-beacon'), ring: vis('guide-ring'), kind: G.objectiveCueKind });
  const run = sec => { for (let i = 0; i < sec * 30; i++) { G._force = null; G.update(1 / 30); } };
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;
  for (const k of ['move', 'build', 'pickup', 'serve', 'cash', 'pantry', 'harvest']) G.markMechanic(k);
  for (const id of ['z_seats1', 'z_oven2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender']) {
    const z = G.world.area.zones.find(z => z.id === id); G.coins = 1e6; G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 200 && !G.world.built.has(id); i++) G.update(0.1);
  }
  G.dayState.day = 4;
  G.P.x = 0; G.P.z = 0; G.P.vx = 0; G.P.vz = 0; G.coins = 0;
  // Standing up the café walked onto plots, which counts as nudges; let that cooldown lapse.
  for (let i = 0; i < 61 * 30; i++) { G._force = null; G.update(1 / 30); }
  // Shelves full, machines fed, tables clean, bushes green, no guests: no errand but the one staged.
  const quiet = (leaveRoomOn = null) => {
    for (const st of G.world.stations.values()) {
      if (st.type === 'display') st.stock = st.id === leaveRoomOn ? 0 : st.capacity;
      if (st.type === 'coffee') st.beans = 20;
      if (st.type === 'bowl') st.stock = st.capacity;
      if (st.type === 'seat') st.dirty = false;
      if (st.type === 'bush') st.stage = 0;
    }
    G.customers.length = 0;
  };
  const out = {};
  quiet(); run(1.5); out.idle = snap();

  const bush = [...G.world.stations.values()].find(s => s.type === 'bush' && s.active);
  bush.stage = 3;
  run(1); out.routine1s = snap(); run(3); out.routine4s = snap(); run(4); out.routine8s = snap();
  quiet(); run(1);

  const seat = [...G.world.stations.values()].find(s => s.type === 'seat' && s.active);
  seat.dirty = true; run(0.6); out.firstClean = snap();
  quiet(); run(1);

  G.coins = 100000; run(0.6); out.firstAffordable = snap();
  // Let the walkthrough run out, then clear the target so hesitation resets, and offer the plots
  // again: without the cooldown the NEXT plot would get a fresh walkthrough at once.
  run(13); G.coins = 0; quiet(); run(1.5); G.coins = 100000; run(0.6); out.afterNudge = snap();
  G.coins = 0; quiet(); run(1);

  quiet('dispCookie'); window.__dev.carry(3, 'cookie'); quiet('dispCookie'); run(0.6); out.carryDay4 = snap();
  G.owner.clearItems(); quiet(); run(1);
  G.dayState.day = 1;
  quiet('dispCookie'); window.__dev.carry(3, 'cookie'); quiet('dispCookie'); run(0.6); out.carryDay1 = snap();
  return out;
});
await browser.close();
await new Promise(resolve => server.close(resolve));

const none = s => !s.trail && !s.beacon && !s.ring;
const pointer = s => !s.trail && s.beacon && !s.ring;
const walk = s => s.trail && s.beacon && s.ring;
const expect = (name, ok, want) => { if (!ok) failures.push(name + ': expected ' + want + ', got ' + JSON.stringify(out[name])); };
expect('idle', none(out.idle), 'nothing');
expect('routine1s', none(out.routine1s), 'nothing (no hesitation yet)');
expect('routine4s', pointer(out.routine4s), 'a pointer after ~3 s');
expect('routine8s', walk(out.routine8s), 'a walkthrough after ~7 s');
expect('firstClean', walk(out.firstClean), 'a walkthrough for a chore never done');
expect('firstAffordable', walk(out.firstAffordable) && out.firstAffordable.kind === 'build', 'a build walkthrough the first time a plot is affordable');
expect('afterNudge', none(out.afterNudge), 'no build walkthrough for the next plot while the nudge cooldown runs');
expect('carryDay4', pointer(out.carryDay4), 'a pointer for a known carry on day 4');
expect('carryDay1', walk(out.carryDay1), 'a walkthrough for the same carry on day 1');
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(16) + (walk(v) ? 'walkthrough' : pointer(v) ? 'pointer' : none(v) ? 'nothing' : 'mixed').padEnd(12) + ' kind=' + v.kind);
if (failures.length) {
  console.error('\nguidance-policy-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nguidance-policy-smoke OK');
