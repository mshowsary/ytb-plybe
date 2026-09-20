// tools/guidance-policy-smoke.js
//
// What guidance is allowed to draw, and when. systems/objective.js resolves every target to one of
// three modes — walkthrough (trail + beacon + ring), pointer (beacon alone) or nothing — and this
// pins that resolution on a day-4 café whose basics are already proven, with the café held quiet so
// each scenario is the only errand on the floor.
//
// The contract, after the day-18 report ("demos are everywhere every day, including for things I
// learned long ago; inconsistent big arrows"):
//   - nothing pending                          -> nothing drawn
//   - a proven chore, standing still            -> nothing for 6 s, then a POINTER, never a walkthrough
//   - a chore never done before                 -> one walkthrough, at once
//   - a plot the player can suddenly afford     -> nothing (it is an invitation, not an errand)
//   - carrying something, destination known     -> nothing; a pointer only after 4 s of standing still
//   - two errands of equal standing             -> the arrow commits to one instead of trading four
//                                                  times a second (the "fast repetitive arc loop")
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
  const find = n => { let m = null; S.scene.traverse(o => { if (o.name === n) m = o; }); return m; };
  const vis = n => { const m = find(n); return !!m && m.visible; };
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
  run(2);
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

  // A proven chore. Nothing at all while the player could still be on their way; a pointer only
  // once they have genuinely stalled on it; never a walkthrough again.
  const bush = [...G.world.stations.values()].find(s => s.type === 'bush' && s.active);
  bush.stage = 3;
  run(1); out.routine1s = snap(); run(3); out.routine4s = snap(); run(4); out.routine8s = snap();
  quiet(); run(1);

  // Two ripe bushes: two errands of identical standing. Sample where the beacon actually is, every
  // frame, for four seconds, and count how often it jumps to a different place.
  const bushes = [...G.world.stations.values()].filter(s => s.type === 'bush' && s.active).slice(0, 2);
  for (const b of bushes) b.stage = 3;
  run(8); // past STUCK_SECONDS so the pointer is up and its position is readable
  let jumps = 0, last = null;
  const beacon = find('guide-beacon');
  for (let i = 0; i < 4 * 30; i++) {
    G._force = null; G.update(1 / 30);
    if (!beacon || !beacon.visible) continue;
    const p = beacon.position;
    if (last && Math.hypot(p.x - last.x, p.z - last.z) > 1.5) jumps++;
    last = { x: p.x, z: p.z };
  }
  out.targetJumps = jumps;
  out.competing = snap();
  quiet(); run(1);

  // A chore this player has never done: the one lesson.
  const seat = [...G.world.stations.values()].find(s => s.type === 'seat' && s.active);
  seat.dirty = true; run(0.6); out.firstClean = snap();
  quiet(); run(1);

  // Suddenly rich, with nothing urgent. A plot is an invitation; the price pill standing in the
  // room is the whole of the invitation.
  G.coins = 100000; run(0.6); out.affordable = snap();
  run(4); out.affordable5s = snap();
  G.coins = 0; quiet(); run(1.5);

  // Carrying. The destination is known but nothing is drawn for it.
  quiet('dispCookie'); window.__dev.carry(3, 'cookie'); quiet('dispCookie');
  run(1); out.carry1s = snap();
  run(4); out.carry5s = snap();
  out.carryDestination = G.contextGuide ? G.contextGuide.caption : null;

  // ... and if the display fills while the owner is still walking, the guide re-answers rather
  // than pointing at a counter that can no longer take the tray. With the RETURN crates deleted
  // (docs/SHIP-PLAN-2026-09-19.md 1.4) the honest answer is "nowhere": there is no bin to send
  // anyone to, and the load flies home by itself at the next station that needs empty hands.
  for (const st of G.world.stations.values()) if (st.type === 'display') st.stock = st.capacity;
  run(1);
  out.carryWhenFull = G.contextGuide ? G.contextGuide.kind : null;

  // The replacement, driven for real: stop at a machine that cannot take what is in the hands and
  // the hands empty themselves, with no button pressed and no coins moved.
  const pantry = [...G.world.stations.values()].find(s => s.active && s.type === 'pantry');
  const coinsBefore = G.coins;
  G.P.x = pantry.front.x; G.P.z = pantry.front.z; G.P.vx = 0; G.P.vz = 0;
  run(1.5);
  out.autoReturn = {
    items: G.owner.items.length, sack: G.carry.sack, fruit: G.carry.fruit | 0,
    coinDelta: G.coins - coinsBefore,
  };
  G.owner.clearItems(); quiet(); run(1);
  return out;
});
await browser.close();
await new Promise(resolve => server.close(resolve));

const none = s => !s.trail && !s.beacon && !s.ring;
const pointer = s => !s.trail && s.beacon && !s.ring;
const walk = s => s.trail && s.beacon && s.ring;
const mode = s => (walk(s) ? 'walkthrough' : pointer(s) ? 'pointer' : none(s) ? 'nothing' : 'mixed');
const expect = (name, ok, want) => { if (!ok) failures.push(name + ': expected ' + want + ', got ' + JSON.stringify(out[name])); };
expect('idle', none(out.idle), 'nothing');
expect('routine1s', none(out.routine1s), 'nothing');
expect('routine4s', none(out.routine4s), 'still nothing at 4 s');
expect('routine8s', pointer(out.routine8s), 'a pointer once stalled, and only a pointer');
expect('firstClean', walk(out.firstClean), 'a walkthrough for a chore never done');
expect('affordable', none(out.affordable), 'nothing when a plot becomes affordable');
expect('affordable5s', !walk(out.affordable5s), 'never a walkthrough for an affordable plot');
expect('carry1s', none(out.carry1s), 'nothing while carrying to a known destination');
expect('carry5s', pointer(out.carry5s), 'a pointer once the owner has stood still with full hands');
if (!out.carryDestination) failures.push('carryDestination: the carry guide went blank while holding cookies');
if (out.carryWhenFull !== null) failures.push('carryWhenFull: with every crate deleted a full display leaves nowhere to point, got ' + out.carryWhenFull);
if (!out.autoReturn || out.autoReturn.items !== 0 || out.autoReturn.sack || out.autoReturn.fruit) {
  failures.push('autoReturn: stopping at the pantry with a load it cannot take left ' + JSON.stringify(out.autoReturn) + ' in the hands');
} else if (out.autoReturn.coinDelta !== 0) {
  failures.push('autoReturn: putting a load down cost ' + (-out.autoReturn.coinDelta) + ' coins — returning is always free');
}
if (out.targetJumps > 3) failures.push('targetJumps: the arrow changed target ' + out.targetJumps + ' times in 4 s with two equal errands (the arc-loop flicker)');

for (const [k, v] of Object.entries(out)) {
  if (v && typeof v === 'object') console.log(k.padEnd(18) + mode(v).padEnd(12) + ' kind=' + v.kind);
  else console.log(k.padEnd(18) + String(v));
}
if (failures.length) {
  console.error('\nguidance-policy-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nguidance-policy-smoke OK');
