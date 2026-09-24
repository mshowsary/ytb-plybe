// tools/first-minute-smoke.js
//
// A brand-new player, on a phone, held in portrait, who has never seen the game. What do the first
// seconds tell them, and does the guidance keep working once they start following it?
//
// Recorded on a fresh save on 2026-09-17, before this batch: the owner spawned on a rug with
// nothing saying how to move; the only guide was a small chevron 2.4 m in the air, and on a phone
// in portrait it was OFF SCREEN; a completed build was a 150 ms blink. This pins the replacement —
// the floor trail, the beacon over the target, the ring on the spot to stand on, the screen-edge
// arrow toward an off-screen target and the first-touch drag hand — by driving a real fresh save
// through the real movement input and reading the live DOM and scene.
//
// REWRITTEN for Batch F (docs/SHIP-PLAN-2026-09-19.md §1.8). It used to require the opening to
// reach STEP 4 — 'build the Tables plot' — and step 4 was the problem: measured on 2026-09-19 it
// ran from 13 s to 97 s of day 1, chaining bake → stock → serve → cash targets as full walkthroughs
// for as long as the player was short of 90 coins, and the opening then ended WITHOUT marking any
// of it learned, so the objective re-taught serve at 98 s, restock at 119 s and build at 211 s.
// The opening is three steps now — bake, stock, serve — and it marks each mechanic as it goes, so
// this file asserts the shorter shape and the marking instead of the chain: same subject, opposite
// expectation.
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
const PORT = Number(process.env.FIRST_MINUTE_PORT || 4194);
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('first-minute-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const browser = await chromium.launch();

for (const vp of [{ w: 390, h: 844, tag: 'phone portrait' }, { w: 852, h: 393, tag: 'phone landscape' }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', e => failures.push('[' + vp.tag + '] pageerror: ' + String(e.message).slice(0, 200)));
  // ?dev=1 exposes __dev.route (the guests' A*) so this can walk like a person; nothing else here
  // reads the dev panel, and the guidance under test never knows it is there.
  await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
  await page.waitForTimeout(600);

  const state = () => page.evaluate(() => {
    const G = window.__game, S = window.__scene;
    const byName = n => { let m = null; S.scene.traverse(o => { if (o.name === n) m = o; }); return m; };
    const vis = el => !!el && !el.classList.contains('hidden');
    const trail = byName('guide-trail'), beacon = byName('guide-beacon'), ring = byName('guide-ring');
    // How far along the trail is drawn: count instances with a non-zero scale.
    let drawn = 0;
    if (trail && trail.visible) {
      const a = trail.instanceMatrix.array;
      for (let i = 0; i < trail.count; i++) if (a[i * 16] !== 0 || a[i * 16 + 2] !== 0) drawn++;
    }
    return {
      step: G.intro.step, active: G.intro.active, coins: G.coins | 0,
      kind: G.intro.target ? G.intro.target.kind : null,
      proven: ['move', 'pickup', 'deliver', 'serve', 'cash'].filter(k => G.mechanicProven(k)),
      trail: !!trail && trail.visible, drawn, beacon: !!beacon && beacon.visible, ring: !!ring && ring.visible,
      edge: vis(document.querySelector('.edgeArrow')), touch: vis(document.querySelector('.touchHint')),
      target: G.intro.target ? [G.intro.target.x, G.intro.target.z] : null,
      P: [G.P.x, G.P.z],
    };
  });

  // 1. Idle first impression: nothing pressed yet.
  await page.waitForTimeout(2500);
  let s = await state();
  check(s.active && s.step === 0, '[' + vp.tag + '] a fresh save did not start the opening lesson');
  check(s.trail && s.drawn >= 4, '[' + vp.tag + '] no floor trail toward the first target while idle (drawn=' + s.drawn + ')');
  check(s.touch, '[' + vp.tag + '] the first-touch drag hand is not shown to a player who has never moved');
  check(s.ring, '[' + vp.tag + '] no ring on the spot to stand at');
  const beaconOnScreen = await page.evaluate(() => {
    const G = window.__game, t = G.intro.target; if (!t) return true;
    const tmp = { sx: 0, sy: 0, visible: true }; G.fx.project(t.x, 2.6, t.z, tmp); return tmp.visible;
  });
  if (!beaconOnScreen) check(s.edge, '[' + vp.tag + '] the first target is off screen and there is no edge arrow toward it');
  else check(s.beacon, '[' + vp.tag + '] the first target is on screen but has no beacon over it');

  // 2. Follow the game's own guidance through the real movement input, like a person would.
  await page.evaluate(() => {
    const G = window.__game;
    let path = [], key = '', repath = 0;
    window.__fm = setInterval(() => {
      const t = G.intro && G.intro.active ? G.intro.target : (G.contextGuide || G.debugNextTarget());
      if (!t) { G.setMove(null); return; }
      const k = t.kind + ':' + t.x.toFixed(1) + ',' + t.z.toFixed(1);
      repath -= 60;
      if (k !== key || repath <= 0) {
        key = k; repath = 1500;
        let gx = t.x, gz = t.z;
        for (const st of G.world.stations.values()) {
          if (st.front && Math.abs(st.x - t.x) < 0.05 && Math.abs(st.z - t.z) < 0.05) { const sp = st.type === 'checkout' && st.serve ? st.serve : st.front; gx = sp.x; gz = sp.z; break; }
        }
        path = window.__dev.route(gx, gz);
      }
      while (path.length && Math.hypot(path[0].x - G.P.x, path[0].z - G.P.z) < 0.4) path.shift();
      if (!path.length) { G.setMove(null); return; }
      const dx = path[0].x - G.P.x, dz = path[0].z - G.P.z, d = Math.hypot(dx, dz) || 1;
      G.setMove(dx / d, dz / d);
    }, 60);
  });
  await page.waitForTimeout(2500);
  s = await state();
  check(!s.touch, '[' + vp.tag + '] the drag hand is still up after the owner walked off (it must retire on the first real step)');

  // The opening must finish on its own from following the guidance: bake -> stock -> serve, and
  // then get out of the way. Nothing in it may ever point at a build plot.
  const t0 = Date.now();
  let last = s, kinds = new Set([s.kind].filter(Boolean));
  // 120 s, not the 75 s this budget used to be. The opening is SHORTER than it was (three steps
  // rather than five, and no build chain after them) but its last step waits on a real guest
  // reaching the till, which on day 1 is most of the wall clock. What is being bounded here is that
  // the opening ENDS, not how fast the café fills.
  while (Date.now() - t0 < 120000 && last.active) {
    await page.waitForTimeout(500);
    last = await state();
    if (last.kind) kinds.add(last.kind);
  }
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  check(!last.active, '[' + vp.tag + '] the opening was still running after 120 s of following it (step ' + last.step + ')');
  check(!kinds.has('build'), '[' + vp.tag + '] the opening pointed the player at a build plot: ' + [...kinds].join(', '));
  check(!kinds.has('collect'), '[' + vp.tag + '] the opening still has a collect step, which completes itself');
  // The whole point of the rewrite: what the opening taught is marked learned, so nothing re-teaches
  // it two minutes later.
  for (const key of ['move', 'pickup', 'deliver', 'serve', 'cash']) {
    check(last.proven.includes(key),
      '[' + vp.tag + '] the opening finished without marking "' + key + '" learned (proven: ' + last.proven.join(',') + ')');
  }
  console.log('[' + vp.tag + '] the opening finished in ' + seconds + ' s through ' + [...kinds].join(' -> ')
    + '; marked ' + last.proven.join(','));
  await page.evaluate(() => clearInterval(window.__fm));

  // 3. With a routine job pending, the guidance retires once the player is on their way and never
  //    sits on screen forever: no target -> nothing drawn.
  const quiet = await page.evaluate(() => {
    const G = window.__game;
    G.intro.step = 5; G.intro.active = false; G.intro.target = null; G.contextGuide = null;
    for (let i = 0; i < 12; i++) G.update(1 / 30);
    const S = window.__scene; let anyOn = false;
    S.scene.traverse(o => { if ((o.name === 'guide-trail' || o.name === 'guide-beacon' || o.name === 'guide-ring') && o.visible && G.debugNextTarget() === null) anyOn = true; });
    return { anyOn, next: G.debugNextTarget() };
  });
  check(!quiet.anyOn, '[' + vp.tag + '] guidance stayed drawn with no target at all');
  console.log('[' + vp.tag + '] idle guidance: trail=' + s.trail + ' ring=' + s.ring + ' touch-retired=' + !s.touch);
  await page.close();
}

await browser.close();
await new Promise(resolve => server.close(resolve));
if (failures.length) {
  console.error('\nfirst-minute-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nfirst-minute-smoke OK');
