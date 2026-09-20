// tools/trail-reach-smoke.js
//
// Following the trail has to actually get you there.
//
// The defect this exists to prevent from coming back (19-day playthrough, 2026-09-19):
// systems/objective.js planned the floor trail on the GUESTS' 0.5 m A* grid, whose cells are sized
// for a 0.30 m guest and whose obstacles are the sim footprints. The owner is a 0.46 m circle
// colliding with what is DRAWN, so on the built café the trail led into gaps he cannot enter —
// following it failed for seat7, register3, coldPantry1 and seat12, and the bot spent 105-195 s a
// day wedged between two deck tables trying to fetch cream. Batch C plans it on the owner's own
// grid instead (sim/ownerReach.js ownerPath, docs/SHIP-PLAN-2026-09-19.md §1.4).
//
// This drives the REAL game: it builds the whole café in the browser, reads back each station's
// DRAWN body (st.body, measured by systems/visuals.js — the authored fw/fd alone would miss the
// 0.60 m the oven reaches past its own footprint), plans the route here with exactly the function
// objective.js calls, and then walks the owner along it with the movement input, one leg at a
// time. A target counts as reached only when the owner ends up within the objective's own
// ARRIVE_METERS of the spot the trail's last point marks.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { AREA1 } from '../data/area1.js';
import { ownerBodyBoxes, ownerReachGrid, ownerPath } from '../src/sim/ownerReach.js';
import { OWNER_SPAWN } from '../src/sim/ownerState.js';

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
  console.error(`trail-reach-smoke: port ${PORT} is already in use — an environment problem, not a game regression.`);
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

// systems/objective.js's own arrival bar: at this distance the walkthrough marks the errand proven.
const ARRIVE_METERS = 1.6;

const failures = [];
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

// 1. Build the whole café and read back what the owner's body will actually collide with.
const snapshot = await page.evaluate(() => {
  const G = window.__game;
  if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
  G.coins += 90000;
  for (const z of G.world.area.zones) {
    if (G.world.built.has(z.id)) continue;
    G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 160 && !G.world.built.has(z.id); i++) G.update(0.1);
  }
  const rows = [];
  for (const st of G.world.stations.values()) {
    rows.push({
      id: st.id, type: st.type, x: st.x, z: st.z, rot: st.rot || 0, fw: st.fw, fd: st.fd,
      active: !!st.active, front: st.front, serve: st.serve || null,
      body: st.body ? { minx: st.body.minx, maxx: st.body.maxx, minz: st.body.minz, maxz: st.body.maxz } : null,
    });
  }
  return { rows, built: [...G.world.built] };
});

// 2. Plan on the owner's own grid, with the same boxes and the same function objective.js uses.
const fake = { stations: new Map(snapshot.rows.map(r => [r.id, r])) };
const built = new Set(snapshot.built);
const grid = ownerReachGrid(AREA1, built, ownerBodyBoxes(fake));

const spots = [];
for (const st of snapshot.rows) {
  if (!st.active || st.type === 'gate' || st.type === 'decor' || st.type === 'wall') continue;
  // A register is worked from behind, everything else from its front — standSpotFor's own rule.
  const spot = st.type === 'checkout' && st.serve ? st.serve : st.front;
  if (spot) spots.push({ id: st.id, type: st.type, x: spot.x, z: spot.z });
}
if (spots.length < 20) failures.push(`only ${spots.length} active working spots — the café did not finish building`);

// The same circle-vs-box test the owner's own collision applies every frame.
const boxes = ownerBodyBoxes(fake);
const R = 0.46;
function bodyClear(x, z) {
  for (const b of boxes) {
    const dx = Math.abs(x - b.x) - b.hw, dz = Math.abs(z - b.z) - b.hd;
    if (dx >= R || dz >= R) continue;
    if (Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) < R) return false;
  }
  return true;
}

// The two tills stand 0.9 m apart (0.8 m once their drawn tops count), which a 0.30 m guest walks
// through and the 0.92 m owner cannot (data/area1.js register1/register2). It is the sharpest
// difference left between the two grids on the shipped layout, so the trail is asked to cross the
// till row and must be seen going round rather than through.
const CROSSINGS = [
  { id: 'across the till row', from: { x: -6.75, z: 0.6 }, to: { x: -6.75, z: -3.2 } },
];

const plans = [];
for (const s of spots) {
  const route = ownerPath(grid, OWNER_SPAWN.x, OWNER_SPAWN.z, s.x, s.z);
  if (!route.length) { failures.push(`no trail at all from the rug to ${s.id} (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`); continue; }
  // Exactly what objective.js draws: the owner's feet, the middle cells, then the stand spot.
  plans.push({ id: s.id, type: s.type, from: { x: OWNER_SPAWN.x, z: OWNER_SPAWN.z }, points: [...route.slice(1, -1), { x: s.x, z: s.z }] });
}
for (const c of CROSSINGS) {
  const route = ownerPath(grid, c.from.x, c.from.z, c.to.x, c.to.z);
  if (!route.length) { failures.push(`no trail at all ${c.id}`); continue; }
  plans.push({ id: c.id, type: 'crossing', from: c.from, points: [...route.slice(1, -1), c.to] });
}
// Every point the trail draws has to be somewhere the body fits, or the picture is a lie even
// where the walk happens to squeeze through. The LAST point is the stand spot itself, which is
// deliberately close enough to the machine to work it (tools/body-clearance-smoke.js measures that
// contact and owns its own limit), so the route cells are what is judged here.
for (const plan of plans) {
  for (const pt of plan.points.slice(0, -1)) {
    if (!bodyClear(pt.x, pt.z)) {
      failures.push(`the trail to ${plan.id} crosses (${pt.x.toFixed(2)}, ${pt.z.toFixed(2)}), where the owner's body does not fit`);
      break;
    }
  }
}

// 3. Walk each one for real, with the movement input, from the rug.
const walked = await page.evaluate(async ({ plans, arrive }) => {
  const G = window.__game;
  const out = [];
  for (const plan of plans) {
    G.P.x = plan.from.x; G.P.z = plan.from.z; G.P.vx = 0; G.P.vz = 0;
    G._force = null; G.update(1 / 30);
    let stuckAt = null;
    for (const pt of plan.points) {
      let frames = 0;
      while (frames++ < 200) {
        const dx = pt.x - G.P.x, dz = pt.z - G.P.z, d = Math.hypot(dx, dz);
        if (d < 0.28) break;
        G._force = { x: dx / d, z: dz / d };
        G.update(1 / 30);
      }
      if (frames >= 200) { stuckAt = { x: +G.P.x.toFixed(2), z: +G.P.z.toFixed(2), want: { x: +pt.x.toFixed(2), z: +pt.z.toFixed(2) } }; break; }
    }
    G._force = null;
    const last = plan.points[plan.points.length - 1];
    out.push({
      id: plan.id, type: plan.type, legs: plan.points.length, stuckAt,
      arrived: Math.hypot(G.P.x - last.x, G.P.z - last.z) <= arrive,
      at: { x: +G.P.x.toFixed(2), z: +G.P.z.toFixed(2) },
    });
  }
  return out;
}, { plans, arrive: ARRIVE_METERS });

await browser.close();
await new Promise(resolve => server.close(resolve));

for (const r of walked) {
  if (r.arrived) continue;
  failures.push(`following the trail to ${r.id} (${r.type}) stopped at (${r.at.x}, ${r.at.z})` +
    (r.stuckAt ? ` — wedged on leg toward (${r.stuckAt.want.x}, ${r.stuckAt.want.z})` : ''));
}
console.log(`${walked.length} active working spots, ${walked.filter(r => r.arrived).length} reached by following the trail`);

if (failures.length) {
  console.error('\ntrail-reach-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\ntrail-reach-smoke OK');
