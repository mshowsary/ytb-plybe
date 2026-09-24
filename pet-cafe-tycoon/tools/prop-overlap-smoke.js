// tools/prop-overlap-smoke.js
//
// Does any piece of scenery stand inside a station — or in the way of one?
//
// The day-18 report included "a chair after building the garden is glitched" and, walking the built
// terrace, a potted tree growing straight up through a table. The station layout has its own test
// (test/layout.test.js: no two FOOTPRINTS overlap) but scenery — trees, planters, fountains, the
// bunting posts, anything environment.js/decor.js scatters for charm — is not a station and has no
// footprint, so nothing ever checked it against the furniture the game actually uses.
//
// This builds the whole café, owns every décor piece at five stars (décor is scenery too, and the
// 2026-09-19 hunt found seven slots clipping registers, queues, the pool and the doorway), then for
// every rendered vertex that is NOT part of a station, a person or a pet, and that stands in the
// body band (above the floor, below head height), tests it against:
//   1. every active station's footprint — scenery occupying a table, a counter or a machine;
//   2. every station front and queue slot — scenery standing where a guest or the owner has to stand;
//   3. every OPEN gate lane and the café door — the fence-row dressing (window boxes, festoon
//      poles, string lights) or a décor piece standing in a gap everybody walks through;
//   4. every resident home — décor parked inside a cat bed or a dog basket.
// Measured per vertex, not per bounding box: environment.js merges its props, so a bounding box
// would be the size of the whole terrace.
//
//   node tools/prop-overlap-smoke.js [--port 4193] [--dist dist]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { DECOR_IDS } from '../data/decor.js';

const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const dist = path.resolve(arg('--dist', 'dist'));
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
const PORT = Number(arg('--port', 4193)) || 4193;
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

await page.evaluate(decorIds => {
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
  // Every décor piece, star sets included: the décor system (stepped by main.js's frame loop)
  // places whatever the owned list names that its gates allow.
  G.meta.pawBest = 5;
  G.meta.decor = [...decorIds];
  for (let i = 0; i < 30; i++) { G._force = null; G.update(1 / 30); }
}, DECOR_IDS);
// Resident homes (systems/residentPets.js) and décor, like the Barista, are stepped by main.js's
// frame loop rather than by G.update. Let real frames run so they catch up with everything built,
// and until every décor piece has finished its pop-in: a piece measured mid-pop is a scaled-down
// copy standing somewhere the real one does not.
await page.waitForTimeout(900);
await page.waitForFunction(n => {
  const pieces = window.__scene.scene.children.filter(o => /^decor:/.test(o.name || ''));
  return pieces.length >= n && pieces.every(o => Math.abs(o.scale.x - 1) < 1e-6);
}, DECOR_IDS.length, { timeout: 60000 }).catch(() => failures.push('décor never finished placing'));
const out = await page.evaluate(() => {
  const G = window.__game, S = window.__scene;

  // The body band: anything a person could walk into. Floor decals, rugs and the deck sit below it;
  // lamp shades, the awning and the bunting hang above it.
  const LO = 0.15, HI = 1.6;
  // A few centimetres of grace at every footprint edge: a chair leg flush with a table's own edge
  // is design, not a clip.
  const EDGE = 0.06;
  // A front or a queue slot is where a body stands: anything within this of it is in the way.
  const SPOT_R = 0.3;
  const stations = [...G.world.stations.values()].filter(st => st.active && st.fw && st.fd && st.type !== 'gate');
  const spots = [];
  for (const st of stations) {
    if (st.front) spots.push({ id: st.id + '.front', station: st.id, x: st.front.x, z: st.front.z });
    (st.queue || []).forEach((q, i) => spots.push({ id: st.id + '.q' + i, station: st.id, x: q.x, z: q.z }));
  }
  // Every OPEN gate: its gap along its fence line (the same rectangle nav.js opens), plus half a
  // metre either side of the line, which is where the fence dressing hangs.
  const area = G.world.area, W = area.size.w, D = area.size.d;
  const lanes = [];
  for (const r of area.regions || []) {
    if (!G.world.built.has(r.builtBy)) continue;
    const half = r.gateHalfW == null ? 1.2 : r.gateHalfW;
    if (r.z0 >= D / 2) lanes.push({ id: r.id, x0: (r.gateX || 0) - half, x1: (r.gateX || 0) + half, z0: D / 2 - 0.5, z1: D / 2 + 0.5 });
    else if (r.x0 >= W / 2) lanes.push({ id: r.id, x0: W / 2 - 0.5, x1: W / 2 + 0.5, z0: (r.gateZ || 0) - half, z1: (r.gateZ || 0) + half });
  }
  // The café's own door: the wall gap nav.js leaves open (door.z ± 1.2), a metre in and out.
  lanes.push({ id: 'door', x0: -W / 2 - 1, x1: -W / 2 + 1, z0: area.door.z - 1.2, z1: area.door.z + 1.2 });

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
  // The terrace umbrellas are table parasols (data/decor.js): the pole stands through the middle of
  // its own table on purpose, so the pole (0.05 m) at a seat's centre is design, not a clip.
  const intendedDecor = (st, x, z, y) => ((st.id === 'fountain1') && (
    (Math.abs(Math.abs(x - st.x) - 1.05) < 0.35 && Math.abs(Math.abs(z - st.z) - 1.05) < 0.35)
    || (y < 0.45 && Math.hypot(x - st.x, z - st.z) < 0.95)))
    || (st.type === 'seat' && Math.hypot(x - st.x, z - st.z) < 0.12);

  const hits = new Map(); // "<target> <- <object>" -> { count, sample }
  const v = new S.camera.position.constructor();
  const m4 = new S.camera.matrixWorld.constructor();
  const inside = (st, x, z) => {
    const dx = x - st.x, dz = z - st.z;
    const c = Math.cos(st.rot || 0), s = Math.sin(st.rot || 0);
    // world -> station-local: undo the station's yaw
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < st.fw / 2 - EDGE && Math.abs(lz) < st.fd / 2 - EDGE;
  };
  const topOf = o => { let top = o; while (top.parent && top.parent !== S.scene) top = top.parent; return top; };
  const describe = o => {
    let n = o, path = [];
    while (n && path.length < 4) { path.push(n.name || n.type); n = n.parent; }
    // An unnamed chain says nothing, so add where its top-level ancestor sits in the world.
    const top = topOf(o);
    const tp = new S.camera.position.constructor(); top.getWorldPosition(tp);
    return path.join(' < ') + (top.name ? '' : ' @(' + tp.x.toFixed(1) + ',' + tp.z.toFixed(1) + ')');
  };
  const record = (kind, target, type, o, x, y, z) => {
    const key = kind + ' ' + target + ' <- ' + describe(o);
    const h = hits.get(key) || { kind, station: target, type, object: describe(o), count: 0, sample: null };
    h.count++;
    if (!h.sample) h.sample = { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) };
    hits.set(key, h);
  };

  S.scene.updateMatrixWorld(true);
  // Resident homes, as world boxes from their furniture's own geometry plus the pet sitting in it
  // (0.9 m of headroom above the furniture), so décor can be held to them.
  const homes = [];
  S.scene.traverse(o => {
    if (o.name !== 'resident-spot' || !o.visible) return;
    const box = new S.camera.position.constructor();   // placeholder to reach THREE via constructors
    const b = { minx: Infinity, maxx: -Infinity, minz: Infinity, maxz: -Infinity, maxy: -Infinity };
    o.traverse(c => {
      const pos = c.isMesh && c.geometry && c.geometry.getAttribute('position');
      if (!pos) return;
      for (let i = 0; i < pos.count; i += 3) {
        box.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld);
        b.minx = Math.min(b.minx, box.x); b.maxx = Math.max(b.maxx, box.x);
        b.minz = Math.min(b.minz, box.z); b.maxz = Math.max(b.maxz, box.z);
        b.maxy = Math.max(b.maxy, box.y);
      }
    });
    if (b.minx < Infinity) homes.push({ id: 'home@(' + o.position.x.toFixed(1) + ',' + o.position.z.toFixed(1) + ')', ...b });
  });

  S.scene.traverse(o => {
    if (!o.isMesh || owned.has(o) || !o.visible) return;
    // Only things that are actually drawn: an invisible ancestor hides the whole subtree.
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    const pos = o.geometry && o.geometry.getAttribute('position');
    if (!pos) return;
    const isDecor = /^decor:/.test(topOf(o).name || '');
    const index = o.geometry.index;
    const corner = (t, c) => (index ? index.getX(t * 3 + c) : t * 3 + c);
    const tris = Math.floor((index ? index.count : pos.count) / 3);
    const instances = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < instances; k++) {
      if (o.isInstancedMesh) { m4.fromArray(o.instanceMatrix.array, k * 16); m4.premultiply(o.matrixWorld); }
      else m4.copy(o.matrixWorld);
      // A zero-scale instance is how an instanced set hides one member (the string lights in an open
      // gate): nothing of it is drawn, so nothing of it is in the way.
      if (Math.abs(m4.determinant()) < 1e-9) continue;
      // Every third vertex is plenty to find a trunk inside a table, and keeps this fast; each
      // triangle's centroid as well, because a pole or a post has vertices only at its two ends and
      // would otherwise pass through a counter without a single sample inside it.
      for (let i = 0; i < pos.count + tris; i += (i < pos.count ? 3 : 1)) {
        if (i < pos.count) v.fromBufferAttribute(pos, i);
        else {
          const t = i - pos.count;
          v.fromBufferAttribute(pos, corner(t, 0));
          const ax = v.x, ay = v.y, az = v.z;
          v.fromBufferAttribute(pos, corner(t, 1)); const bx = v.x, by = v.y, bz = v.z;
          v.fromBufferAttribute(pos, corner(t, 2));
          v.set((ax + bx + v.x) / 3, (ay + by + v.y) / 3, (az + bz + v.z) / 3);
        }
        v.applyMatrix4(m4);
        if (v.y < LO || v.y > HI) continue;
        for (const st of stations) if (inside(st, v.x, v.z) && !intendedDecor(st, v.x, v.z, v.y)) record('body', st.id, st.type, o, v.x, v.y, v.z);
        for (const sp of spots) {
          if (Math.hypot(v.x - sp.x, v.z - sp.z) >= SPOT_R) continue;
          const st = G.world.stations.get(sp.station);
          if (!intendedDecor(st, v.x, v.z, v.y)) record('spot', sp.id, st.type, o, v.x, v.y, v.z);
        }
        for (const l of lanes) if (v.x > l.x0 && v.x < l.x1 && v.z > l.z0 && v.z < l.z1) record('lane', 'gate:' + l.id, 'gate', o, v.x, v.y, v.z);
        if (isDecor) for (const h of homes) if (v.x > h.minx && v.x < h.maxx && v.z > h.minz && v.z < h.maxz && v.y < h.maxy + 0.9) record('home', h.id, 'resident', o, v.x, v.y, v.z);
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
  const decorPlaced = [];
  S.scene.traverse(o => { if (/^decor:/.test(o.name || '') && o.parent === S.scene) decorPlaced.push(o.name); });
  return { hits: [...hits.values()].sort((a, b) => b.count - a.count), sunk, lanes: lanes.map(l => l.id), homes: homes.length, spots: spots.length, decor: decorPlaced.length };
});
await browser.close();
await new Promise(resolve => server.close(resolve));

console.log(`checked ${out.spots} fronts/queue slots, gate lanes [${out.lanes.join(', ')}], ${out.homes} resident homes, ${out.decor} décor pieces placed`);
if (out.decor < DECOR_IDS.length) failures.push(`only ${out.decor} of ${DECOR_IDS.length} décor pieces were placed — the ownership above did not take`);
// A handful of stray vertices is a leaf brushing a counter's edge; dozens is an object inside it.
// Spots, lanes and homes are small targets, so a few vertices there already mean an object.
const SERIOUS = { body: 12, spot: 6, lane: 4, home: 6 };
const serious = out.hits.filter(h => h.count >= SERIOUS[h.kind]);
for (const s of out.sunk) {
  failures.push('a resident home is sunk to lawn height under the built ' + s.region + ' floor at '
    + JSON.stringify(s) + ' — only its roof shows through the boards');
}
for (const h of out.hits) {
  console.log((h.count >= SERIOUS[h.kind] ? 'CLIP ' : 'brush') + '  ' + h.kind.padEnd(5) + h.station.padEnd(16) + ' (' + h.type + ')  '
    + String(h.count).padStart(4) + ' vertices  from ' + h.object + '  e.g. ' + JSON.stringify(h.sample));
}
const WHAT = { body: 'standing inside it', spot: 'standing on it', lane: 'standing in the open gateway', home: 'standing inside the resident home' };
for (const h of serious) {
  failures.push(h.station + ' (' + h.type + ') has ' + h.count + ' vertices of "' + h.object + '" ' + WHAT[h.kind] + ', e.g. at '
    + JSON.stringify(h.sample));
}
if (failures.length) {
  console.error('\nprop-overlap-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nprop-overlap-smoke OK — no scenery inside or in front of any station, in any open gate, or in any resident home');
