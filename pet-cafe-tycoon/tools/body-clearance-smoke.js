// tools/body-clearance-smoke.js
//
// The owner's body must not sink into the café's furniture.
//
// The defect this exists to prevent from coming back (owner playtest, 2026-09-16 — "the bot merge
// and in the counter when trying to fill it"): the player was pushed out of each station's
// hand-written fw/fd footprint, but the drawn prop is bigger than that footprint — the oven reaches
// 0.60 m past its own, the display counter 0.21 m — so standing on an oven's front spot put the
// owner's torso inside the oven. A second, sharper case: a station whose box straddles the edge of
// the walkable area (the restroom and the photo booth are against the back wall) let clampToArea,
// which runs after the push-out and wins, plant the body right back inside the prop.
//
// Measured on the fix commit: worst front-spot sink 0.065 m (was 0.20 m at the ovens), worst sink
// while ramming a station from eight directions 0.222 m (was 0.293 m). The thresholds below sit
// just above those, so either regression trips this.
//
// Penetration is measured PER VERTEX of the drawn body against the station's drawn body-height
// silhouette. A bounding box around the owner would report its empty corners as solid and invent a
// ~0.4 m clip every time the owner rests against a corner.
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
const PORT = 4192;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`body-clearance-smoke: port ${PORT} is already in use — an environment problem, not a game regression.`);
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const AT_FRONT_MAX = 0.10;   // standing where the game asks you to stand
const RAMMING_MAX = 0.25;    // pinning the joystick into it from any angle

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(() => {
  const G = window.__game;
  if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
  G.coins += 90000;
  // The overlaps only exist once the late unlocks stand next to the early ones, so build it all.
  for (const z of G.world.area.zones) {
    if (G.world.built.has(z.id)) continue;
    G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 160 && !G.world.built.has(z.id); i++) G.update(0.1);
  }
  const V = new (Object.getPrototypeOf(G.owner.group.position).constructor)();
  const inStack = o => { let p = o; while (p) { if (p.name === 'carry-stack') return true; p = p.parent; } return false; };
  // Deepest drawn body vertex inside the station's drawn rectangle, in metres.
  const deepestInside = rect => {
    const g = G.owner.group; g.updateWorldMatrix(true, true);
    let worst = 0;
    g.traverseVisible(o => {
      if (inStack(o)) return;   // what the owner CARRIES is meant to reach over a counter
      const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (V.y < 0.25 || V.y > 1.6) continue;                       // feet and hair are not the body
        if (V.x <= rect.minx || V.x >= rect.maxx || V.z <= rect.minz || V.z >= rect.maxz) continue;
        const d = Math.min(V.x - rect.minx, rect.maxx - V.x, V.z - rect.minz, rect.maxz - V.z);
        if (d > worst) worst = d;
      }
    });
    return worst;
  };
  const drive = (tx, tz, frames) => {
    for (let i = 0; i < frames; i++) {
      const dx = tx - G.P.x, dz = tz - G.P.z, d = Math.hypot(dx, dz) || 1;
      G._force = { x: dx / d, z: dz / d };
      G.update(1 / 30);
    }
    G._force = null;
  };

  const solid = [...G.world.stations.values()].filter(s => s.active && s.body);
  const atFront = [], ramming = [];
  for (const st of solid.filter(s => s.front)) {
    G.P.x = st.front.x; G.P.z = st.front.z; G.P.vx = 0; G.P.vz = 0;
    G.P.rot = Math.atan2(st.x - st.front.x, st.z - st.front.z);
    for (let i = 0; i < 8; i++) G.update(1 / 30);
    atFront.push({ id: st.id, type: st.type, sink: deepestInside(st.body) });
  }
  // A run-up only counts if it STARTS somewhere a player could legally be. Dropping the owner on
  // top of another prop and then driving out of it measures the probe, not the game.
  const startsClear = (x, z) => {
    for (const s of solid) {
      if (x > s.body.minx - 0.5 && x < s.body.maxx + 0.5 && z > s.body.minz - 0.5 && z < s.body.maxz + 0.5) return false;
    }
    return true;
  };
  for (const st of solid) {
    const cx = (st.body.minx + st.body.maxx) / 2, cz = (st.body.minz + st.body.maxz) / 2;
    const out = Math.max(st.body.maxx - cx, st.body.maxz - cz) + 1.6;
    let worst = 0, tried = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sx = cx + Math.sin(a) * out, sz = cz + Math.cos(a) * out;
      if (!startsClear(sx, sz)) continue;
      tried++;
      G.P.x = sx; G.P.z = sz; G.P.vx = 0; G.P.vz = 0;
      drive(cx, cz, 90);
      worst = Math.max(worst, deepestInside(st.body));
    }
    if (tried) ramming.push({ id: st.id, type: st.type, sink: worst, tried });
  }
  return { atFront, ramming };
});

await browser.close();
await new Promise(resolve => server.close(resolve));

const report = (rows, limit, what) => {
  const bad = rows.filter(r => r.sink > limit).sort((a, b) => b.sink - a.sink);
  const worst = rows.reduce((m, r) => Math.max(m, r.sink), 0);
  console.log(`${what}: ${rows.length} stations, worst ${worst.toFixed(3)} m (limit ${limit} m)`);
  // The three deepest, so a change that moves the worst case says WHICH station moved it.
  console.log('    deepest: ' + [...rows].sort((a, b) => b.sink - a.sink).slice(0, 3).map(r => r.id + ' ' + r.sink.toFixed(3)).join(', '));
  for (const r of bad) failures.push(`${what}: the body sinks ${r.sink.toFixed(3)} m into ${r.id} (${r.type})`);
};
report(out.atFront, AT_FRONT_MAX, 'standing on the front spot');
report(out.ramming, RAMMING_MAX, 'ramming from eight directions');

if (!out.atFront.length || !out.ramming.length) failures.push('no stations measured — the café did not build');

if (failures.length) {
  console.error('\nbody-clearance-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nbody-clearance-smoke OK');
