// tools/prop-overlap-smoke.js
//
// Does any piece of scenery stand inside a station?
//
// The day-18 report included "a chair after building the garden is glitched" and, walking the built
// terrace, a potted tree growing straight up through a table. The station layout has its own test
// (test/layout.test.js: no two FOOTPRINTS overlap) but scenery — trees, planters, fountains, the
// bunting posts, anything environment.js/decor.js scatters for charm — is not a station and has no
// footprint, so nothing ever checked it against the furniture the game actually uses.
//
// This builds the whole café, then for every rendered vertex that is NOT part of a station, a
// person or a pet, and that stands in the body band (above the floor, below head height), tests it
// against every active station's footprint. A vertex inside a footprint is scenery occupying a
// table, a counter or a machine. Measured per vertex, not per bounding box: environment.js merges
// its props, so a bounding box would be the size of the whole terrace.
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
  console.error('prop-overlap-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 800));

await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;
  G.coins = 1e7;
  for (let pass = 0; pass < 3; pass++) {
    for (const z of [...G.world.area.zones]) {
      if (G.world.built.has(z.id)) continue;
      if (z.requires && !G.world.built.has(z.requires)) continue;
      G.P.x = z.x; G.P.z = z.z;
      for (let i = 0; i < 400 && !G.world.built.has(z.id); i++) G.update(0.1);
    }
  }
  G.customers.length = 0;
  for (let i = 0; i < 30; i++) { G._force = null; G.update(1 / 30); }
});
// Resident homes (systems/residentPets.js), like the Barista, are stepped by main.js's frame loop
// rather than by G.update. Let real frames run so they catch up with everything just built.
await page.waitForTimeout(600);
const out = await page.evaluate(() => {
  const G = window.__game, S = window.__scene;

  // The body band: anything a person could walk into. Floor decals, rugs and the deck sit below it;
  // lamp shades, the awning and the bunting hang above it.
  const LO = 0.15, HI = 1.6;
  // A few centimetres of grace at every footprint edge: a chair leg flush with a table's own edge
  // is design, not a clip.
  const EDGE = 0.06;
  const stations = [...G.world.stations.values()].filter(st => st.active && st.fw && st.fd && st.type !== 'gate');

  // Everything a station, a person or a pet owns is excluded by walking its subtree.
  // Butterflies are weightless and fly through everything by design; the register's cash pile is
  // parented to the scene root but sits ON the till on purpose.
  const owned = new Set();
  S.scene.traverse(o => {
    if (!o.name) return;
    if (/^(station:|human:|pet:|butterflies|cashPile|registerCash|cashTray|machineJuice:|coffeePolish|fx:|guide-)/.test(o.name)) o.traverse(c => owned.add(c));
  });
  // The fountain's four planted pots stand in the corners of its square footprint around a ROUND
  // basin, deliberately (environment.js: "Four planted pots on the fountain's diagonals"), and stay
  // for the splash pool that later takes the same spot. Excluded by position, not by object.
  // Likewise the petals environment.js floats on the water (y 0.30, radius 0.62-0.84 from centre),
  // which it places for both the fountain and the splash pool.
  const intendedDecor = (st, x, z, y) => st.id === 'fountain1' && (
    (Math.abs(Math.abs(x - st.x) - 1.05) < 0.35 && Math.abs(Math.abs(z - st.z) - 1.05) < 0.35)
    || (y < 0.45 && Math.hypot(x - st.x, z - st.z) < 0.95));

  const hits = new Map(); // "<station> <- <object>" -> { count, sample }
  const v = new S.camera.position.constructor();
  const m4 = new S.camera.matrixWorld.constructor();
  const inside = (st, x, z) => {
    const dx = x - st.x, dz = z - st.z;
    const c = Math.cos(st.rot || 0), s = Math.sin(st.rot || 0);
    // world -> station-local: undo the station's yaw
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < st.fw / 2 - EDGE && Math.abs(lz) < st.fd / 2 - EDGE;
  };
  const describe = o => {
    let n = o, path = [];
    while (n && path.length < 4) { path.push(n.name || n.type); n = n.parent; }
    // An unnamed chain says nothing, so add where its top-level ancestor sits in the world.
    let top = o; while (top.parent && top.parent !== S.scene) top = top.parent;
    const tp = new S.camera.position.constructor(); top.getWorldPosition(tp);
    return path.join(' < ') + (top.name ? '' : ' @(' + tp.x.toFixed(1) + ',' + tp.z.toFixed(1) + ')');
  };
  const record = (st, o, x, y, z) => {
    const key = st.id + ' <- ' + describe(o);
    const h = hits.get(key) || { station: st.id, type: st.type, object: describe(o), count: 0, sample: null };
    h.count++;
    if (!h.sample) h.sample = { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) };
    hits.set(key, h);
  };

  S.scene.updateMatrixWorld(true);
  S.scene.traverse(o => {
    if (!o.isMesh || owned.has(o) || !o.visible) return;
    // Only things that are actually drawn: an invisible ancestor hides the whole subtree.
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    const pos = o.geometry && o.geometry.getAttribute('position');
    if (!pos) return;
    const instances = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < instances; k++) {
      if (o.isInstancedMesh) { m4.fromArray(o.instanceMatrix.array, k * 16); m4.premultiply(o.matrixWorld); }
      else m4.copy(o.matrixWorld);
      // Every third vertex is plenty to find a trunk inside a table, and keeps this fast.
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m4);
        if (v.y < LO || v.y > HI) continue;
        for (const st of stations) if (inside(st, v.x, v.z) && !intendedDecor(st, v.x, v.z, v.y)) record(st, o, v.x, v.y, v.z);
      }
    }
  });
  // Second class of the same bug: scenery placed on open LAWN that a later build paves over. The
  // bunny hutch was authored at lawn height (y -0.44) in what became the terrace; once the deck was
  // built only its roof came up through the boards, reading as a stray bench beside the terrace
  // till. Any resident home still sunk to lawn height inside a BUILT region is that bug again.
  const sunk = [];
  const regions = (G.world.area.regions || []).filter(r => G.world.built.has(r.builtBy));
  S.scene.traverse(o => {
    if (o.name !== 'resident-spot' || !o.visible) return;
    const p = o.position;
    if (p.y > -0.1) return;
    const r = regions.find(r => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
    if (r) sunk.push({ region: r.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
  });
  return { hits: [...hits.values()].sort((a, b) => b.count - a.count), sunk };
});
await browser.close();
await new Promise(resolve => server.close(resolve));

// A handful of stray vertices is a leaf brushing a counter's edge; dozens is an object inside it.
const SERIOUS = 12;
const serious = out.hits.filter(h => h.count >= SERIOUS);
for (const s of out.sunk) {
  failures.push('a resident home is sunk to lawn height under the built ' + s.region + ' floor at '
    + JSON.stringify(s) + ' — only its roof shows through the boards');
}
for (const h of out.hits) {
  console.log((h.count >= SERIOUS ? 'CLIP ' : 'brush') + '  ' + h.station.padEnd(12) + ' (' + h.type + ')  '
    + String(h.count).padStart(4) + ' vertices  from ' + h.object + '  e.g. ' + JSON.stringify(h.sample));
}
for (const h of serious) {
  failures.push(h.station + ' (' + h.type + ') has ' + h.count + ' vertices of "' + h.object + '" standing inside it, e.g. at '
    + JSON.stringify(h.sample));
}
if (failures.length) {
  console.error('\nprop-overlap-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nprop-overlap-smoke OK — no scenery inside any station');
