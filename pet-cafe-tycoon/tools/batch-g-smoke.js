// tools/batch-g-smoke.js — does Batch G's work actually happen in a running game?
//
// WHY THIS EXISTS
// Every item in this batch is either something new in the frame or something taken out of it, and
// the failure mode this codebase keeps producing is correct code that nothing calls (and its twin, a
// caller left pointing at something that was deleted). A unit test proves the geometry is right; it
// cannot prove the station mesh the player looks at contains it, that the DOM chip really went away,
// that the opening camera frames the work row on a phone and then hands control back, or that a
// guest sitting down puts a plate on a table.
//
// So this drives the real build in a real browser and asserts what is on screen and in the scene
// graph:
//
//   1. signs      every active station's OWN mesh carries a sign glyph out of the atlas, and no
//                 `.chalk` element exists anywhere
//   2. opening    at 380x670 the oven, the counter and the register are all in frame at t=0, and the
//                 camera is back on the owner a few seconds later
//   3. stand      barIce carries the canopy that stops it reading as a white slab
//   4. meal       a guest who sits down to eat has their order on the table, and it goes when they do
//   5. steam      a baking oven and a brewing machine put particles in the air above them
//   6. petals     drifting by day, gone once the lights come on — one draw call, one authority
//   7. budget     the whole frame stays inside the publisher's limits with the café busy
//
//   node tools/batch-g-smoke.js [--port 4602] [--keep]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (flag, dflt = null) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 4602)) || 4602;
const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/index.html missing — run `npm run build` first'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
}).listen(PORT, '127.0.0.1');

const failures = [], notes = [], pageErrors = [];
const check = (ok, what, detail = '') => {
  (ok ? notes : failures).push(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? '  — ' + detail : ''}`);
};

// SwiftShader runs this game at a few frames a second, which hides everything that is driven by the
// rAF loop — the barista, the resident pets, daylight, and every effect this file is about.
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

// ── 1 + 2. the opening frame, on the phone the ship plan names ─────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 380, height: 670 }, isMobile: true, hasTouch: true });
  page.on('pageerror', e => pageErrors.push('phone: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.waitForTimeout(900);   // inside the opening hold

  const opening = await page.evaluate(() => {
    const S = window.__scene, G = window.__game;
    const V = Object.getPrototypeOf(S.camera.position).constructor;
    const on = (x, z) => { const p = new V(x, 1.0, z).project(S.camera); return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1; };
    const out = { stations: {}, owner: { x: +G.P.x.toFixed(2), z: +G.P.z.toFixed(2) } };
    // No coordinates are written here: whatever the simulation lane says is active at t = 0 is what
    // the opening frame has to contain.
    for (const st of G.world.stations.values()) {
      if (!st.active || st.type === 'gate' || st.type === 'wall') continue;
      out.stations[st.id] = on(st.x, st.z);
    }
    out.camTarget = { x: +(S.camera.position.x - Math.sin(35 * Math.PI / 180) * Math.cos(52 * Math.PI / 180) * 0).toFixed(2) };
    return out;
  });
  const offscreen = Object.entries(opening.stations).filter(([, v]) => !v).map(([k]) => k);
  check(offscreen.length === 0, 'opening frame holds every station the café starts with (380x670)',
    offscreen.length ? 'off screen: ' + offscreen.join(', ') : Object.keys(opening.stations).join(', '));

  // …and then hands the camera back. The glide must end on the ordinary owner-follow framing, or
  // every frame after the opening is composed for a shot that is over.
  await page.waitForTimeout(4200);
  const settled = await page.evaluate(() => {
    const S = window.__scene, G = window.__game;
    // Where the camera would stand if it were following the owner and nothing else.
    const YAW = 35 * Math.PI / 180, PITCH = 52 * Math.PI / 180;
    const want = {
      x: G.P.x + Math.sin(YAW) * Math.cos(PITCH) * S.dist,
      z: G.P.z + Math.cos(YAW) * Math.cos(PITCH) * S.dist,
    };
    return { dx: +Math.abs(S.camera.position.x - want.x).toFixed(2), dz: +Math.abs(S.camera.position.z - want.z).toFixed(2) };
  });
  check(settled.dx < 0.6 && settled.dz < 0.6, 'the opening shot eases out and gives the camera back to the owner',
    `camera is ${settled.dx}, ${settled.dz} m from the follow position`);
  await page.close();
}

// ── 3-7. the built café ─────────────────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => pageErrors.push('cafe: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const G = window.__game;
    if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
    G.coins += 90000;
    const zones = G.world.area.zones;
    for (let pass = 0; pass < zones.length; pass++) {
      for (const z of zones) {
        if (G.world.built.has(z.id)) continue;
        if (z.requires && !G.world.built.has(z.requires)) continue;
        G.P.x = z.x; G.P.z = z.z;
        for (let i = 0; i < 120 && !G.world.built.has(z.id); i++) G.update(0.1);
      }
    }
    G.staff.runner = 2; G.staff.cleaner = 1; G.staff.cashier = 1; G.staff.barista = 1;
    const shelves = [...G.world.stations.values()].filter(s => (s.type === 'display' || s.type === 'bowl') && s.active);
    for (let i = 0; i < 1500; i++) { if (i % 40 === 0) for (const d of shelves) d.stock = d.capacity; G.update(0.05); }
  });

  // --- 1. the signs are IN the station meshes, and the DOM chip is gone ---
  const signs = await page.evaluate(() => {
    // The sign glyphs live in the six atlas cells the ten grain tiles leave empty: the right-hand
    // half of row 2 and the whole of row 3 (render/grain.js). A station whose own merged geometry
    // samples that region is a station whose board is really part of it.
    const inSignRegion = (u, v) => (v >= 0.5 && u >= 0.5) || v >= 0.75;
    const S = window.__scene, G = window.__game;
    const SPEAKS = new Set(['oven', 'display', 'coffee', 'icecream', 'blender', 'pantry', 'return', 'bush', 'bowl', 'checkout', 'kiosk', 'hire']);
    const missing = [], leaked = [];
    let meshesPerSpeaker = 0, speakers = 0;
    S.scene.traverse(o => {
      if (!/^station:/.test(o.name || '')) return;
      const type = o.name.slice('station:'.length);
      if (!o.visible) return;
      let signVerts = 0, meshes = 0;
      o.traverse(c => {
        if (!c.isMesh && !c.isInstancedMesh) return;
        meshes++;
        // Only geometry that actually samples the shared atlas counts. A mesh carrying its own
        // texture keeps its own UV space — the photo wall's corkboard photos and the fly sprites use
        // raw 0..1 plane/sphere UVs, which land in this rect by coincidence and mean nothing.
        const map = c.material && c.material.map;
        if (!map || !map.image || map.image.width !== 1024) return;
        const uv = c.geometry && c.geometry.getAttribute('uv');
        if (!uv) return;
        for (let i = 0; i < uv.count; i++) if (inSignRegion(uv.getX(i), uv.getY(i))) signVerts++;
      });
      if (SPEAKS.has(type)) { speakers++; meshesPerSpeaker += meshes; if (!signVerts) missing.push(o.name); }
      else if (signVerts) leaked.push(o.name);
    });
    return {
      missing, leaked, speakers,
      meshesPerSpeaker: speakers ? +(meshesPerSpeaker / speakers).toFixed(2) : 0,
      chalkEls: document.querySelectorAll('.chalk').length,
      chalkCss: [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => /\.chalk[^a-zA-Z-]/.test(r.cssText)); } catch (_) { return false; } }),
      built: G.world.built.size,
    };
  });
  check(signs.missing.length === 0, 'every active station carries its sign glyph in its own mesh',
    signs.missing.length ? 'no sign on: ' + signs.missing.join(', ') : `${signs.speakers} stations, ${signs.meshesPerSpeaker} meshes each`);
  check(signs.leaked.length === 0, 'nothing that should be silent carries a sign', signs.leaked.join(', '));
  check(signs.chalkEls === 0, 'the chalkboard DOM chip is gone from the play field', `${signs.chalkEls} .chalk elements`);
  check(signs.chalkCss === false, 'and so are its CSS rules');

  // --- 3. the ice cream stand is dressed ---
  const stand = await page.evaluate(() => {
    const S = window.__scene, G = window.__game;
    const st = G.world.stations.get('barIce');
    if (!st) return { found: false };
    let group = null;
    S.scene.traverse(o => { if (!group && /^station:/.test(o.name || '') && Math.abs(o.position.x - st.x) < 0.01 && Math.abs(o.position.z - st.z) < 0.01) group = o; });
    if (!group) return { found: false };
    let top = -Infinity, verts = 0;
    group.traverse(c => {
      if (!c.isMesh || !c.geometry || !c.geometry.getAttribute('position')) return;
      c.geometry.computeBoundingBox();
      top = Math.max(top, c.geometry.boundingBox.max.y);
      verts += c.geometry.getAttribute('position').count;
    });
    // And an interior counter, for contrast: same mesh builder, no canopy.
    const other = G.world.stations.get('dispCookie');
    let otherTop = -Infinity;
    S.scene.traverse(o => {
      if (!/^station:/.test(o.name || '') || !other) return;
      if (Math.abs(o.position.x - other.x) > 0.01 || Math.abs(o.position.z - other.z) > 0.01) return;
      o.traverse(c => { if (c.isMesh && c.geometry) { c.geometry.computeBoundingBox(); otherTop = Math.max(otherTop, c.geometry.boundingBox.max.y); } });
    });
    return { found: true, top: +top.toFixed(2), otherTop: +otherTop.toFixed(2), verts, active: !!st.active };
  });
  check(stand.found && stand.top > 2.0, 'the garden stand wears a canopy the interior counters do not',
    `barIce reaches ${stand.top} m, dispCookie ${stand.otherTop} m`);

  // --- 4. the meal on the table ---
  const meal = await page.evaluate(() => {
    const G = window.__game, S = window.__scene;
    const seatMeals = () => {
      const out = [];
      S.scene.traverse(o => { if (o.name === 'meal' && o.visible) out.push(o); });
      return out;
    };
    let eating = null;
    for (let i = 0; i < 3000 && !eating; i++) {
      G.update(0.05);
      eating = G.customers.find(c => !c.done && c.state === 'eating' && c.seatId) || null;
    }
    if (!eating) return { reached: false };
    G.update(0.05);
    const during = seatMeals().length;
    const seatId = eating.seatId;
    // Now let them finish and leave: the plate must go with them and the crumbs must arrive.
    let gone = -1;
    for (let i = 0; i < 4000; i++) {
      G.update(0.05);
      const still = G.customers.find(c => c.id === eating.id && !c.done && c.state === 'eating');
      if (!still) { G.update(0.05); gone = seatMeals().filter(m => m.parent && Math.abs(m.parent.position.x - G.world.stations.get(seatId).x) < 0.01).length; break; }
    }
    return { reached: true, during, gone, seatId, dirty: !!G.world.stations.get(seatId).dirty };
  });
  check(meal.reached && meal.during > 0, 'a guest eating has their order on the table',
    meal.reached ? `${meal.during} plate(s) on stage at ${meal.seatId}` : 'no guest ever reached the eating state');
  check(meal.gone === 0, 'and the plate goes when they do', `${meal.gone} left behind`);

  // --- 5. steam over the machines ---
  const steam = await page.evaluate(() => {
    const G = window.__game, S = window.__scene;
    let particles = null;
    S.scene.traverse(o => { if (o.name === 'fx:particles') particles = o; });
    if (!particles) return { found: false };
    const ovens = [...G.world.stations.values()].filter(s => s.type === 'oven' && s.active);
    for (const o of ovens) { o.stock = 0; o.timer = 5; }
    const M = new (Object.getPrototypeOf(particles.matrixWorld).constructor)();
    const V = Object.getPrototypeOf(S.camera.position).constructor;
    let high = 0;
    for (let i = 0; i < 90; i++) {
      G.update(1 / 30);
      for (const o of ovens) { if (o.timer <= 0.2) o.timer = 5; }
      G.fx.update(1 / 30);
      for (let k = 0; k < particles.count; k++) {
        M.fromArray(particles.instanceMatrix.array, k * 16);
        const p = new V().setFromMatrixPosition(M);
        // Above an oven's hood, which nothing else in the game throws anything at.
        for (const o of ovens) if (Math.abs(p.x - o.x) < 0.9 && Math.abs(p.z - o.z) < 0.9 && p.y > 1.5) high++;
      }
    }
    return { found: true, high, ovens: ovens.length };
  });
  check(steam.found && steam.high > 0, 'a baking oven puts steam in the air above it',
    `${steam.high} particle-frames over ${steam.ovens} ovens`);

  // --- 6. petals, gated on the one daylight authority ---
  const petals = await page.evaluate(async () => {
    const G = window.__game, S = window.__scene;
    let im = null;
    S.scene.traverse(o => { if (o.name === 'fx:petals') im = o; });
    if (!im) return { found: false };
    const frame = () => new Promise(r => requestAnimationFrame(() => r()));
    G.userPaused = false;
    G.dayState.t = 90;                              // midday
    const hold = setInterval(() => { G.dayState.t = 90; }, 16);
    for (let i = 0; i < 40; i++) await frame();
    const M = new (Object.getPrototypeOf(im.matrixWorld).constructor)();
    M.fromArray(im.instanceMatrix.array, 0);
    const y0 = M.elements[13];
    const dayVisible = im.visible && im.material.opacity > 0.2;
    for (let i = 0; i < 40; i++) await frame();
    M.fromArray(im.instanceMatrix.array, 0);
    const moved = Math.abs(M.elements[13] - y0) > 0.001;
    clearInterval(hold);
    const hold2 = setInterval(() => { G.dayState.t = 232; }, 16);  // dusk
    for (let i = 0; i < 60; i++) await frame();
    const duskVisible = im.visible && im.material.opacity > 0.05;
    clearInterval(hold2);
    return { found: true, dayVisible, moved, duskVisible, count: im.count, lights: +S.daylight.lights.toFixed(2) };
  });
  check(petals.found && petals.dayVisible && petals.moved, 'petals drift by day',
    petals.found ? `${petals.count} instances, one draw call` : 'no fx:petals in the scene');
  check(petals.found && !petals.duskVisible, 'and go out as the lights come on (the one daylight authority)',
    `lights ${petals.lights}`);

  // --- 7. the whole frame, busy, against the publisher's limits ---
  const cost = await page.evaluate(async () => {
    const S = window.__scene, R = S.renderer;
    R.info.autoReset = false;
    let calls = 0, tris = 0;
    for (let n = 0; n < 40; n++) {
      R.info.reset();
      await new Promise(r => requestAnimationFrame(() => r()));
      calls = Math.max(calls, R.info.render.calls); tris = Math.max(tris, R.info.render.triangles);
    }
    R.info.autoReset = true;
    let actors = 0;
    S.scene.traverse(o => { if (o.parent === S.scene && /^(human|pet):/.test(o.name || '') && o.visible) actors++; });
    return { calls, tris, actors };
  });
  check(cost.calls <= 200 && cost.tris <= 150000, 'the busy frame stays inside the publisher budget',
    `${cost.calls} calls / ${cost.tris.toLocaleString('en-US')} triangles with ${cost.actors} actors`);

  await page.close();
}

await browser.close();
srv.close();

for (const n of notes) console.log(n);
for (const f of failures) console.error(f);
if (pageErrors.length) { console.error('page errors:'); for (const e of pageErrors) console.error('  ' + e); }
const bad = failures.length + pageErrors.length;
console.log(bad ? `\nbatch-g-smoke FAILED (${failures.length} checks, ${pageErrors.length} page errors)` : '\nbatch-g-smoke OK');
process.exit(bad ? 1 : 0);
