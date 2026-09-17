// tools/display-rows-smoke.js
//
// A full display case has to READ as a full display case.
//
// The day-18 report: "the counter presentation for cookies, cupcakes, smoothies and ice cream —
// the second row is squeezed into the first, you can barely tell there are two rows." It was
// literal. render/props.js's counterMesh laid its 24 item slots out 0.14 m apart in depth on a flat
// tray, and the tallest product this game sells is a 0.22 m smoothie: rows 2, 3 and 4 landed inside
// row 1. The case is two deep steps of six now, and the capacity above twelve stacks a second layer
// on those same twelve rather than adding more rows.
//
// This measures, on screen, in the shipped camera:
//   - the pixel gap between an item in the front row and the item directly behind it, against that
//     product's own on-screen height (a row closer together than the items are tall is a row you
//     cannot see as a separate row)
//   - that the second layer sits ON the first rather than inside it or floating above it
// and saves a close-up of every product's full case to shots-production/display-rows/.
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
const PORT = 4198;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('display-rows-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const shots = path.resolve('shots-production', 'display-rows');
fs.mkdirSync(shots, { recursive: true });
const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 800));

const PRODUCTS = ['cookie', 'cupcake', 'coffee', 'smoothie', 'icecream', 'sundae'];
const results = [];
for (const product of PRODUCTS) {
  const m = await page.evaluate(({ product }) => {
    const G = window.__game, S = window.__scene;
    G.intro.step = 5; G.intro.active = false; G.intro.target = null;
    const st = [...G.world.stations.values()].find(s => s.type === 'display' && s.active);
    st.product = product; st.capacity = 24; st.stock = 24;
    G.customers.length = 0;
    // Stand the owner in front of the case so the camera frames it, and let the stack pop in.
    G.P.x = st.front.x; G.P.z = st.front.z + 0.6; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 90; i++) { G._force = null; G.update(1 / 30); }

    // The items are one InstancedMesh under the station's own group.
    let im = null, group = null;
    S.scene.traverse(o => {
      if (im) return;
      if (o.isInstancedMesh && o.count >= 24) {
        // the display we just filled: its world position must sit on the station
        const p = new o.position.constructor(); o.getWorldPosition(p);
        if (Math.hypot(p.x - st.x, p.z - st.z) < 1.6) { im = o; group = o.parent; }
      }
    });
    if (!im) return { error: 'no filled instanced stack found near the display' };
    im.updateWorldMatrix(true, false);

    const cam = S.camera;
    cam.updateMatrixWorld(true);
    const v = new cam.position.constructor();
    const mat = new im.matrixWorld.constructor();
    const pts = [];
    for (let i = 0; i < 24; i++) {
      mat.fromArray(im.instanceMatrix.array, i * 16);
      mat.premultiply(im.matrixWorld);
      v.setFromMatrixPosition(mat);
      const world = { x: v.x, y: v.y, z: v.z };
      v.project(cam);
      pts.push({ i, world, sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight });
    }
    // On-screen height of ONE item of this product: project its geometry's bounding box.
    im.geometry.computeBoundingBox();
    const bb = im.geometry.boundingBox;
    const base = pts[0].world;
    const lo = new cam.position.constructor(base.x, base.y + bb.min.y, base.z);
    const hi = new cam.position.constructor(base.x, base.y + bb.max.y, base.z);
    lo.project(cam); hi.project(cam);
    const itemPx = Math.abs((-lo.y * 0.5 + 0.5) - (-hi.y * 0.5 + 0.5)) * innerHeight;

    // Slot 0 is front-row column 0, slot 6 is the same column one row back (6 columns per row) and
    // slot 12 is the same position one LAYER up (12 floor positions per layer).
    const rowGaps = [];
    for (let c = 0; c < 6; c++) rowGaps.push(Math.hypot(pts[c].sx - pts[c + 6].sx, pts[c].sy - pts[c + 6].sy));
    const layerGaps = [];
    for (let c = 0; c < 6; c++) layerGaps.push(Math.hypot(pts[c].sx - pts[c + 12].sx, pts[c].sy - pts[c + 12].sy));
    // Closest pair of any two items on screen — a full case must not collapse into a heap.
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      closest = Math.min(closest, Math.hypot(pts[i].sx - pts[j].sx, pts[i].sy - pts[j].sy));
    }
    return { itemPx, rowGaps, layerGaps, closest, count: im.count };
  }, { product });
  if (m.error) { failures.push(product + ': ' + m.error); continue; }
  await page.screenshot({ path: path.join(shots, product + '.png') });
  results.push({ product, ...m });

  const minGap = Math.min(...m.rowGaps);
  // A row has to clear the height of what is standing in the row in front of it, with margin.
  if (!(minGap > m.itemPx * 1.15)) {
    failures.push(product + ': rows are ' + minGap.toFixed(1) + ' px apart but one ' + product
      + ' is ' + m.itemPx.toFixed(1) + ' px tall — the rows visually merge');
  }
  // The second layer sits ON the first: a touch under one item's height, never zero (invisible) and
  // never so far it floats.
  const minLayer = Math.min(...m.layerGaps), maxLayer = Math.max(...m.layerGaps);
  if (!(minLayer > m.itemPx * 0.35 && maxLayer < m.itemPx * 1.4)) {
    failures.push(product + ': the stacked layer sits ' + minLayer.toFixed(1) + '-' + maxLayer.toFixed(1)
      + ' px above an item that is ' + m.itemPx.toFixed(1) + ' px tall');
  }
}
await browser.close();
await new Promise(resolve => server.close(resolve));

for (const r of results) {
  console.log(r.product.padEnd(10) + 'item ' + r.itemPx.toFixed(1) + ' px tall, row gap '
    + Math.min(...r.rowGaps).toFixed(1) + ' px, layer lift ' + Math.min(...r.layerGaps).toFixed(1)
    + ' px, closest pair ' + r.closest.toFixed(1) + ' px');
}
if (failures.length) {
  console.error('\ndisplay-rows-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\ndisplay-rows-smoke OK — shots in ' + path.relative(process.cwd(), shots));
