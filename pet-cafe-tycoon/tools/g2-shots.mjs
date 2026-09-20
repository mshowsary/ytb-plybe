// tools/g2-shots.mjs — the frames Batch G2 is judged on, at both viewports the ship plan names.
//
// Five places, each at 380x670 (the phone) and 1280x720 (the desktop):
//   smoothie-corner   the blender, the counter and the bushes, from the play camera
//   fruit-garden      the bed, from where the owner stands to pick bush2
//   kitchen-gap       the tile the RETURN crate left, at (-3.8, -5.2)
//   store-corner      the tile the upgrade kiosk left, at (9.0, -3.5)
//   treat-bar         bowl1, and the kibble bin the simulation always said was under it
//   stars-*           the same production row at ★1 and again at ★4
//
// The BEFORE run points --dist at a build of the tree without this batch, so the pairs are the same
// shot of the same café. Everything is driven through the game's own update loop, so the camera is
// the play camera and nothing here composes a shot the player could not see.
//
//   node tools/g2-shots.mjs --out shots-production/batch-g2/after [--dist dist] [--port 4705]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const dist = path.resolve(arg('--dist', 'dist'));
const out = path.resolve(arg('--out', path.join('shots-production', 'batch-g2', 'after')));
const PORT = Number(arg('--port', 4705)) || 4705;
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/index.html missing in ' + dist); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
}).listen(PORT, '127.0.0.1');

// Where the owner stands for each frame, chosen so the subject is in the middle of the play camera
// (yaw 35 degrees, pitch 52, looking from +x/+z) rather than at its edge.
const STOPS = [
  ['smoothie-corner', 7.6, 1.3],
  ['fruit-garden', 7.2, 4.6],
  ['kitchen-gap', -5.0, -4.2],
  ['store-corner', 8.5, -4.7],
  ['treat-bar', 6.2, 3.2],
];
// The one-at-a-time moment queue (ui/moments.js) puts a pet-discovery card in the middle of the
// screen while the café fills up, and it landed on top of the subject in the first pass of these
// frames. It is hidden for the shot only — nothing about it changed, and it is not what these
// frames are evidence of.
const OVERLAYS = '.pet-reveal, .moment, .banner, [class*="dev"]';
const VIEWPORTS = [[380, 670], [1280, 720]];

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [w, h] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  page.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const G = window.__game;
    if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
    G.coins = 1e7;
    for (let pass = 0; pass < 3; pass++) {
      for (const z of [...G.world.area.zones]) {
        if (G.world.built.has(z.id)) continue;
        if (z.requires && !G.world.built.has(z.requires)) continue;
        G.P.x = z.x; G.P.z = z.z;
        for (let i = 0; i < 400 && !G.world.built.has(z.id); i++) G.update(0.1);
      }
    }
    G.coins = 1e7;
    const shelves = [...G.world.stations.values()].filter(s => (s.type === 'display' || s.type === 'bowl') && s.active);
    for (const d of shelves) d.stock = Math.min(d.capacity, 6);
    for (const b of G.world.stations.values()) if (b.type === 'bush') b.stage = 3;
    for (let i = 0; i < 200; i++) { G._force = null; G.update(0.05); }
    for (const el of document.querySelectorAll('[class*="dev"]')) el.style.display = 'none';
  });
  const hide = () => page.evaluate(sel => {
    for (const el of document.querySelectorAll(sel)) el.style.display = 'none';
  }, OVERLAYS);
  const shoot = async (name) => {
    await page.waitForTimeout(220);
    await hide();
    await page.screenshot({ path: path.join(out, `${name}-${w}x${h}.png`) });
    console.log('shot', `${name}-${w}x${h}`);
  };
  const walkTo = async (x, z) => {
    await page.evaluate(({ x, z }) => {
      const G = window.__game;
      G.P.x = x; G.P.z = z; G.P.vx = 0; G.P.vz = 0;
      for (let i = 0; i < 60; i++) { G._force = null; G.update(1 / 30); }
    }, { x, z });
    await hide();
  };

  for (const [name, x, z] of STOPS) { await walkTo(x, z); await shoot(name); }

  // The production row at ★1 and at ★4, from the same spot, so the pair is the whole point of the
  // coin sink: the same three machines, better.
  await walkTo(3.4, -3.4);
  await shoot('stars-unstarred');
  await page.evaluate(() => {
    const G = window.__game;
    // Through the real ladder, not by writing a number: ui/shop.js's own action, which is what the
    // Shop's buttons call (economy.buyStar). Three purchases takes every machine to the top look.
    G.coins = 1e8;
    G.openShop('shop', 'upgrades');
    for (let pass = 0; pass < 3; pass++) {
      for (const row of document.querySelectorAll('.srow')) {
        const btn = row.querySelector('button.sbtn.buy');
        if (btn && !btn.disabled && row.querySelector('.tier-dots')) btn.click();
      }
    }
    document.querySelector('.sheet .sclose')?.click();
    G.userPaused = false;
    for (let i = 0; i < 40; i++) { G._force = null; G.update(1 / 30); }
    for (const el of document.querySelectorAll('[class*="dev"]')) el.style.display = 'none';
  });
  await page.waitForTimeout(400);
  const tiers = await page.evaluate(() => ({ ...window.__game.stars }));
  console.log('  star tiers for the starred shot:', JSON.stringify(tiers));
  await shoot('stars-starred');
  // And the smoothie corner starred, because the blender's second jug and fruit tower live there.
  await walkTo(7.4, 1.6);
  await shoot('smoothie-corner-starred');
  await page.close();
}
await browser.close();
srv.close();
if (errors.length) { for (const e of errors) console.error('pageerror: ' + e); process.exit(1); }
console.log('shots written to ' + out);
