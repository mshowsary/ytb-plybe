// tools/batch-g2-smoke.js — does Batch G2's dressing reach the frame the player looks at?
//
// WHY THIS EXISTS
// The failure this codebase keeps producing is correct code nothing calls, and its twin, a caller
// pointing at something that was deleted. Unit tests prove the geometry is right; they cannot prove
// that the station mesh on screen contains it, that the bed appears on the frame the garden is
// bought and not before, that the two freed tiles are dressed in the café's OWN merged mesh rather
// than in two new draw calls, or that buying a star in the real Shop changes the real machine.
//
// So this drives the real build in a real browser and asserts what is in the scene graph:
//
//   1. blender    the machine at (7.8, 0.1) is a dressed station, not a cylinder on bare floor
//   2. freed      both tiles Batch C emptied carry geometry, inside buildStatic's merged mesh
//   3. garden     the bed is absent on a fresh save, present once z_garden is bought, over the
//                 bushes, and is exactly one draw call
//   4. stars      buying a star THROUGH THE SHOP UI makes the coffee machine visibly better, with
//                 no extra draw call and no change to the body box the simulation reads
//   5. budget     the whole frame, fully starred and busy, stays inside the publisher's limits
//
//   node tools/batch-g2-smoke.js [--port 4704]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (flag, dflt = null) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 4704)) || 4704;
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

// SwiftShader runs this game at a few frames a second, which hides everything driven by the rAF
// loop. Ask ANGLE for the real adapter, exactly as the other browser smokes do.
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__scene, null, { timeout: 30000 });
await page.waitForTimeout(1200);

// Helpers installed once, in the page, so every step below measures the same way.
await page.evaluate(() => {
  const S = window.__scene;
  window.__g2 = {
    // The station group standing where `st` stands.
    groupFor(id) {
      const st = window.__game.world.stations.get(id);
      if (!st) return null;
      let found = null;
      S.scene.traverse(o => {
        if (found || !/^station:/.test(o.name || '')) return;
        if (Math.abs(o.position.x - st.x) < 0.01 && Math.abs(o.position.z - st.z) < 0.01) found = o;
      });
      return found;
    },
    stats(obj) {
      if (!obj) return null;
      let verts = 0, meshes = 0;
      const b = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, minz: Infinity, maxz: -Infinity };
      obj.traverse(c => {
        const p = c.isMesh && c.geometry && c.geometry.getAttribute('position');
        if (!p) return;
        meshes++; verts += p.count;
        c.geometry.computeBoundingBox();
        const bb = c.geometry.boundingBox;
        b.minx = Math.min(b.minx, bb.min.x); b.maxx = Math.max(b.maxx, bb.max.x);
        b.miny = Math.min(b.miny, bb.min.y); b.maxy = Math.max(b.maxy, bb.max.y);
        b.minz = Math.min(b.minz, bb.min.z); b.maxz = Math.max(b.maxz, bb.max.z);
      });
      return { verts, meshes, box: b };
    },
    byName(name) { let f = null; S.scene.traverse(o => { if (!f && o.name === name) f = o; }); return f; },
    // How many vertices of `obj` carry a colour, as "#RRGGBB". Vertex colours are how every prop in
    // this game is coloured (geo.js colorize), so this is "is that part of the machine there".
    colourCount(obj, hex) {
      if (!obj) return 0;
      // geo.js colorize() writes THREE.Color(hex) into the buffer, and three's colour management
      // converts sRGB to the linear working space on the way in — so the target is the same
      // transform applied to the same string.
      const lin = v => (v < 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4));
      const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
      let n = 0;
      obj.traverse(c => {
        const a = c.isMesh && c.geometry && c.geometry.getAttribute('color');
        if (!a) return;
        for (let i = 0; i < a.count; i++) {
          if (Math.abs(a.getX(i) - r) < 0.02 && Math.abs(a.getY(i) - g) < 0.02 && Math.abs(a.getZ(i) - b) < 0.02) n++;
        }
      });
      return n;
    },
    // Everything the renderer draws that is NOT an actor: the exact population a star must not grow.
    staticRenderables() {
      let n = 0;
      S.scene.traverse(o => {
        if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
        let top = o;
        while (top.parent && top.parent !== S.scene) top = top.parent;
        if (!top.visible) return;
        if (/^(human|pet|fx):/.test(top.name || '')) return;
        n++;
      });
      return n;
    },
    // World-space vertices of the biggest mesh under `name`, near (x, z) and at body height.
    nearIn(name, x, z, r) {
      const root = this.byName(name);
      if (!root) return -1;
      const V = Object.getPrototypeOf(S.camera.position).constructor;
      const v = new V();
      let best = null, bestN = -1;
      root.traverse(c => {
        const p = c.isMesh && c.geometry && c.geometry.getAttribute('position');
        if (p && p.count > bestN) { bestN = p.count; best = c; }
      });
      if (!best) return -1;
      best.updateWorldMatrix(true, false);
      const p = best.geometry.getAttribute('position');
      let n = 0;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(best.matrixWorld);
        if (v.y > 0.2 && v.y < 2.0 && Math.hypot(v.x - x, v.z - z) < r) n++;
      }
      return n;
    },
    async frameCost() {
      const R = S.renderer;
      R.info.autoReset = false;
      let calls = 0, tris = 0;
      for (let n = 0; n < 30; n++) {
        R.info.reset();
        await new Promise(r => requestAnimationFrame(() => r()));
        calls = Math.max(calls, R.info.render.calls); tris = Math.max(tris, R.info.render.triangles);
      }
      R.info.autoReset = true;
      return { calls, tris };
    },
  };
});

// ── 1. the smoothie corner's machine ────────────────────────────────────────────────────────────
{
  const blender = await page.evaluate(() => {
    const g = window.__g2.groupFor('blender1');
    const st = window.__game.world.stations.get('blender1');
    // st.body is in WORLD metres (systems/visuals.js measures it through the station's matrix), so
    // it is compared against the footprint centred on the station, not on the origin.
    return {
      stats: window.__g2.stats(g), fw: st && st.fw, fd: st && st.fd, x: st && st.x, z: st && st.z,
      body: st && st.body ? { ...st.body } : null,
      juice: window.__g2.colourCount(g, '#8B7CF6'),
    };
  });
  const s = blender.stats;
  check(!!s && s.meshes === 1, 'the blender is one mesh, so the dressing costs no draw call',
    s ? `${s.meshes} mesh(es), ${s.verts} vertices` : 'no station group at (7.8, 0.1)');
  check(!!s && (s.box.maxx - s.box.minx) >= 0.9 && s.box.maxy >= 1.2,
    'the blender is a dressed station, not a cylinder on bare floor',
    s ? `${(s.box.maxx - s.box.minx).toFixed(2)} m wide, ${s.box.maxy.toFixed(2)} m tall` : '');
  check(blender.juice > 20, 'and it carries the smoothie palette the counter beside it uses',
    `${blender.juice} vertices in PRODUCTS.smoothie.color`);
  // The body the simulation bumps into must still be inside the authored footprint, which is what
  // keeps barSmoothie's queue lane at x 8.6 clear (data/area1.js).
  const b = blender.body;
  const fits = !!b
    && b.minx >= blender.x - blender.fw / 2 - 1e-6 && b.maxx <= blender.x + blender.fw / 2 + 1e-6
    && b.minz >= blender.z - blender.fd / 2 - 1e-6 && b.maxz <= blender.z + blender.fd / 2 + 1e-6;
  check(fits && b.maxx <= 8.6 - 0.2, 'its drawn body fits inside its footprint and leaves the queue its lane',
    b ? `x ${b.minx.toFixed(2)}..${b.maxx.toFixed(2)}, z ${b.minz.toFixed(2)}..${b.maxz.toFixed(2)} inside ${(blender.x - blender.fw / 2).toFixed(2)}..${(blender.x + blender.fw / 2).toFixed(2)} / ${(blender.z - blender.fd / 2).toFixed(2)}..${(blender.z + blender.fd / 2).toFixed(2)}` : 'no body box');
}

// ── 2. the ground the kiosk and the RETURN crate left ───────────────────────────────────────────
{
  const freed = await page.evaluate(() => ({
    kiosk: window.__g2.nearIn('static', 9.0, -3.5, 1.3),
    ret: window.__g2.nearIn('static', -3.8, -5.2, 1.3),
  }));
  check(freed.kiosk > 40, 'the upgrade kiosk\'s tile is dressed, inside the café\'s own merged mesh',
    `${freed.kiosk} vertices at (9.0, -3.5)`);
  check(freed.ret > 40, 'the RETURN crate\'s slot is dressed, inside the same mesh',
    `${freed.ret} vertices at (-3.8, -5.2)`);
}

// ── 3. the fruit garden: absent on a fresh save ─────────────────────────────────────────────────
{
  const before = await page.evaluate(() => {
    const g = window.__g2.byName('gardenPatch');
    const G = window.__game;
    return { exists: !!g, visible: !!(g && g.visible), built: G.world.built.has('z_garden') };
  });
  check(before.exists, 'the garden bed is in the scene graph from the first frame');
  check(!before.built && !before.visible, 'and it is not drawn until z_garden is bought',
    `built=${before.built} visible=${before.visible}`);
}

// ── build the whole café, then 3 (continued) and 4 ──────────────────────────────────────────────
await page.evaluate(() => {
  const G = window.__game;
  if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
  G.coins += 400000;
  const zones = G.world.area.zones;
  for (let pass = 0; pass < zones.length; pass++) {
    for (const z of zones) {
      if (G.world.built.has(z.id)) continue;
      if (z.requires && !G.world.built.has(z.requires)) continue;
      G.P.x = z.x; G.P.z = z.z;
      for (let i = 0; i < 120 && !G.world.built.has(z.id); i++) G.update(0.1);
    }
  }
  for (let i = 0; i < 120; i++) G.update(0.05);   // let every build reveal finish
});

{
  const after = await page.evaluate(() => {
    const G = window.__game, S = window.__scene;
    const g = window.__g2.byName('gardenPatch');
    const st = window.__g2.stats(g);
    const bushes = ['bush1', 'bush2', 'bush3'].map(id => {
      const s = G.world.stations.get(id);
      return s ? { id, x: s.x, z: s.z, active: !!s.active } : null;
    }).filter(Boolean);
    // Does the bed's own geometry actually lie under each bush?
    const V = Object.getPrototypeOf(S.camera.position).constructor;
    const v = new V();
    const covered = {};
    if (g) {
      g.updateWorldMatrix(true, true);
      const mesh = g.children.find(c => c.isMesh);
      const p = mesh && mesh.geometry.getAttribute('position');
      for (const b of bushes) covered[b.id] = 0;
      if (p) for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
        if (v.y > 0.1) continue;                    // the soil, not the picket
        for (const b of bushes) if (Math.hypot(v.x - b.x, v.z - b.z) < 0.9) covered[b.id]++;
      }
    }
    return { visible: !!(g && g.visible), meshes: st ? st.meshes : 0, verts: st ? st.verts : 0, covered, bushes: bushes.length };
  });
  check(after.visible, 'buying z_garden puts the bed on screen');
  check(after.meshes === 1, 'and the whole garden is one draw call', `${after.meshes} mesh(es), ${after.verts} vertices`);
  const bare = Object.entries(after.covered).filter(([, n]) => n < 3).map(([id]) => id);
  check(bare.length === 0 && after.bushes === 3, 'every bush is standing in it',
    bare.length ? 'still on bare tile: ' + bare.join(', ') : JSON.stringify(after.covered));
}

// ── 4. a star bought in the Shop makes the machine better ───────────────────────────────────────
async function buyStarInShop(label) {
  return page.evaluate(lbl => {
    const rows = [...document.querySelectorAll('.srow')];
    const row = rows.find(r => {
      const l = r.querySelector('.srow-label');
      return l && l.textContent.trim() === lbl;
    });
    if (!row) return 'no-row';
    const btn = row.querySelector('button.sbtn.buy');
    if (!btn) return 'no-button';
    if (btn.disabled) return 'disabled';
    btn.click();
    return 'ok';
  }, label);
}
{
  const before = await page.evaluate(() => {
    const G = window.__game;
    return {
      stats: window.__g2.stats(window.__g2.groupFor('coffee1')),
      tier: (G.stars && G.stars.coffee1) || 1,
      body: { ...G.world.stations.get('coffee1').body },
      copper: window.__g2.colourCount(window.__g2.groupFor('coffee1'), '#C9793E'),
      gold: window.__g2.colourCount(window.__g2.groupFor('coffee1'), '#FFD84D'),
      // The draw-call population that a star must not grow. Actors are excluded deliberately: the
      // crowd on stage is whatever the deterministic sim happens to have there and re-deals itself
      // on every change of timing, so it cannot be part of a before/after comparison.
      renderables: window.__g2.staticRenderables(),
    };
  });

  await page.evaluate(() => { window.__game.coins = 5e6; window.__game.openShop('shop', 'upgrades'); });
  await page.waitForSelector('.srow', { timeout: 10000 });
  const clicks = [];
  for (let i = 0; i < 3; i++) { clicks.push(await buyStarInShop('Coffee machine')); await page.waitForTimeout(120); }
  // Every other ladder too, so the draw-call comparison below is the whole café starred, not one
  // machine: this is the state a late-game player actually plays in.
  for (const label of ['Oven A', 'Oven B', 'Cookie display', 'Cupcake display', 'Coffee bar', 'Blender', 'Smoothie bar']) {
    for (let i = 0; i < 3; i++) { await buyStarInShop(label); await page.waitForTimeout(90); }
  }
  await page.evaluate(() => { const s = window.__sheets || null; if (s && s.close) s.close(); document.querySelector('.sheet .sclose')?.click(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__game.userPaused = false; for (let i = 0; i < 30; i++) window.__game.update(0.05); });

  const after = await page.evaluate(() => {
    const G = window.__game;
    return {
      stats: window.__g2.stats(window.__g2.groupFor('coffee1')),
      tier: (G.stars && G.stars.coffee1) || 1,
      body: { ...G.world.stations.get('coffee1').body },
      copper: window.__g2.colourCount(window.__g2.groupFor('coffee1'), '#C9793E'),
      gold: window.__g2.colourCount(window.__g2.groupFor('coffee1'), '#FFD84D'),
      renderables: window.__g2.staticRenderables(),
      tiers: Object.fromEntries(Object.entries(G.stars || {})),
    };
  });

  check(clicks.every(c => c === 'ok'), 'the Shop sells a station star to a click on its own row', clicks.join(', '));
  check(after.tier > before.tier, 'and the purchase reaches the star the game stores',
    `coffee1 ★${before.tier} -> ★${after.tier}`);
  check(!!after.stats && !!before.stats && after.stats.verts > before.stats.verts,
    'the starred coffee machine is visibly a different machine',
    after.stats && before.stats ? `${before.stats.verts} -> ${after.stats.verts} vertices` : 'no station group');
  check(before.copper + before.gold === 0 && (after.copper + after.gold) > 0,
    'it wears metal it did not wear before (copper at ★2-3, gold at ★4)',
    `copper ${before.copper} -> ${after.copper}, gold ${before.gold} -> ${after.gold}`);
  check(!!after.stats && after.stats.meshes === before.stats.meshes,
    'and it is still one mesh: no draw call per star',
    after.stats ? `${before.stats.meshes} -> ${after.stats.meshes}` : '');
  const same = ['minx', 'maxx', 'minz', 'maxz'].every(k => Math.abs(after.body[k] - before.body[k]) < 1e-9);
  check(same, 'buying a star never moves the body the simulation walks into',
    JSON.stringify(before.body) + ' -> ' + JSON.stringify(after.body));
  check(after.renderables === before.renderables,
    'a fully starred café draws exactly the renderables an unstarred one draws',
    `${before.renderables} -> ${after.renderables}`);
  notes.push(`      star tiers now: ${JSON.stringify(after.tiers)}`);
}

// ── 5. the whole frame, starred and busy ────────────────────────────────────────────────────────
{
  const cost = await page.evaluate(async () => {
    const G = window.__game;
    G.staff.runner = 2; G.staff.cleaner = 1; G.staff.cashier = 1; G.staff.barista = 1;
    const shelves = [...G.world.stations.values()].filter(s => (s.type === 'display' || s.type === 'bowl') && s.active);
    for (let i = 0; i < 900; i++) { if (i % 40 === 0) for (const d of shelves) d.stock = d.capacity; G.update(0.05); }
    const c = await window.__g2.frameCost();
    let actors = 0;
    window.__scene.scene.traverse(o => { if (o.parent === window.__scene.scene && /^(human|pet):/.test(o.name || '') && o.visible) actors++; });
    return { ...c, actors };
  });
  check(cost.calls <= 200 && cost.tris <= 150000, 'the busy, fully starred frame stays inside the publisher budget',
    `${cost.calls} calls / ${cost.tris.toLocaleString('en-US')} triangles with ${cost.actors} actors`);
}

await browser.close();
srv.close();

for (const n of notes) console.log(n);
for (const f of failures) console.error(f);
if (pageErrors.length) { console.error('page errors:'); for (const e of pageErrors) console.error('  ' + e); }
const bad = failures.length + pageErrors.length;
console.log(bad ? `\nbatch-g2-smoke FAILED (${failures.length} checks, ${pageErrors.length} page errors)` : '\nbatch-g2-smoke OK');
process.exit(bad ? 1 : 0);
