// A walking tour of the built-out café: every expansion area, framed the way the player sees it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
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
await new Promise(r => server.listen(4192, '127.0.0.1', r));
const out = path.resolve('shots-production', 'tour');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1.5 });
page.on('pageerror', e => console.error('pageerror:', e.message));
await page.goto('http://127.0.0.1:4192/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 800));

await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;
  for (const k of ['move', 'build', 'pickup', 'serve', 'cash', 'pantry', 'harvest', 'clean', 'return']) G.markMechanic(k);
  G.coins = 1e7;
  for (let pass = 0; pass < 3; pass++) {
    for (const z of [...G.world.area.zones]) {
      if (G.world.built.has(z.id)) continue;
      if (z.requires && !G.world.built.has(z.requires)) continue;
      G.P.x = z.x; G.P.z = z.z;
      for (let i = 0; i < 400 && !G.world.built.has(z.id); i++) G.update(0.1);
    }
  }
  G.dayState.day = 20; G.coins = 1e7;
  // hide the dev panel so the frames are clean
  const dp = document.querySelector('.dev-panel, #devPanel, [class*="dev"]'); if (dp) dp.style.display = 'none';
});

const stops = JSON.parse(process.argv[2] || '[]');
const defaultStops = [
  ['garden', 7.2, 3.0],
  ['terrace-west', -6.0, 10.5],
  ['terrace-centre', 0.0, 11.0],
  ['terrace-east-icecream', 7.0, 10.0],
  ['terrace-south', 0.0, 13.0],
];
for (const [name, x, z] of (stops.length ? stops : defaultStops)) {
  await page.evaluate(({ x, z }) => {
    const G = window.__game;
    G.P.x = x; G.P.z = z; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 45; i++) { G._force = null; G.update(1 / 30); }
    for (const el of document.querySelectorAll('[class*="dev"]')) el.style.display = 'none';
  }, { x, z });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('shot', name);
}
await browser.close();
server.close();
