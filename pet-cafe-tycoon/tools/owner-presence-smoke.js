// tools/owner-presence-smoke.js
//
// The owner is a body in the room, not a ghost, and serves from behind the till.
//
// Two defects from the day-4 session recordings of 2026-09-17, both measured before they were
// touched: (1) the owner served from the customer's side of the register — on the very spot the
// head of the queue stands — so the two bodies overlapped on every sale; (2) guests walked
// straight through the owner (guest-owner overlaps in ~9% of one-second samples), because the
// player was not in the avoidance roster the guests and staff steer by.
//
// Pins: standing on register1's serve spot, the nearest paying guest stays across the till (well
// over a metre away) and sales still go through; standing IN the entrance for a full minute, guests
// still come in, never overlap the owner, and never stall or teleport past them.
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
const PORT = 4196;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('owner-presence-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 600));

const out = await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;
  for (const id of ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee']) {
    const z = G.world.area.zones.find(z => z.id === id); G.coins = 1e5; G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 200 && !G.world.built.has(id); i++) G.update(0.1);
  }
  G.coins = 0;
  for (const st of G.world.stations.values()) if (st.type === 'display') st.stock = st.capacity;
  const walk = (x, z, maxFrames = 600) => {
    let route = window.__dev.route(x, z);
    for (let i = 0; i < maxFrames; i++) {
      while (route.length && Math.hypot(route[0].x - G.P.x, route[0].z - G.P.z) < 0.35) route.shift();
      if (!route.length) break;
      const dx = route[0].x - G.P.x, dz = route[0].z - G.P.z, d = Math.hypot(dx, dz) || 1;
      G._force = { x: dx / d, z: dz / d }; G.update(1 / 30);
    }
    G._force = null;
  };

  // (a) Serve from behind the till for 45 s.
  const reg = G.world.stations.get('register1');
  walk(reg.serve.x, reg.serve.z);
  const standoff = Math.hypot(G.P.x - reg.serve.x, G.P.z - reg.serve.z);
  const coins0 = G.coins;
  let minGuestDist = Infinity;
  for (let i = 0; i < 45 * 30; i++) {
    G._force = null; G.update(1 / 30);
    for (const c of G.customers) if (!c.done && c.state === 'atRegister' && c.registerId === 'register1') minGuestDist = Math.min(minGuestDist, Math.hypot(c.x - G.P.x, c.z - G.P.z));
  }
  const a = { standoff: +standoff.toFixed(2), earned: G.coins - coins0, minGuestDist: +minGuestDist.toFixed(2) };

  // (b) Stand in the entrance for 60 s.
  const door = G.world.area.door;
  G.P.x = door.x + 0.9; G.P.z = door.z; G.P.vx = 0; G.P.vz = 0;
  for (let i = 0; i < 10; i++) { G._force = null; G.update(1 / 30); }
  let overlaps = 0, samples = 0, stalls = 0, arrivedIn = 0;
  const inside = new Set();
  const tp0 = G.customers.reduce((n, c) => n + (c.mover ? c.mover.teleports : 0), 0);
  for (let i = 0; i < 60 * 30; i++) {
    G._force = null; G.update(1 / 30);
    if (i % 15 === 0) {
      samples++;
      for (const c of G.customers) {
        if (c.done) continue;
        if (Math.hypot(c.x - G.P.x, c.z - G.P.z) < 0.5) overlaps++;
        if (c.state !== 'enter' && c.state !== 'leave' && !inside.has(c)) { inside.add(c); arrivedIn++; }
        if (c.mover && c.mover.stall > 1.5) stalls++;
      }
    }
  }
  let teleports = 0; for (const c of G.customers) if (c.mover) teleports += c.mover.teleports;
  const b = { at: [+G.P.x.toFixed(2), +G.P.z.toFixed(2)], samples, overlaps, arrivedIn, stalls, teleports: teleports - tp0 };
  return { a, b };
});
await browser.close();
await new Promise(resolve => server.close(resolve));

console.log('at the till: standoff ' + out.a.standoff + ' m, earned ' + out.a.earned + ', nearest paying guest ' + out.a.minGuestDist + ' m');
console.log('in the doorway for 60 s: ' + out.b.arrivedIn + ' guests came in, overlaps ' + out.b.overlaps + '/' + out.b.samples + ' samples, stalls ' + out.b.stalls + ', teleports ' + out.b.teleports);
check(out.a.standoff < 0.8, 'the owner could not reach the serve spot behind register1 (stopped ' + out.a.standoff + ' m away)');
check(out.a.earned > 0, 'no sale went through while the owner stood at the serve spot');
check(out.a.minGuestDist >= 1.6, 'a paying guest came within ' + out.a.minGuestDist + ' m of the owner at the till — they should be across it');
check(out.b.arrivedIn >= 6, 'only ' + out.b.arrivedIn + ' guests got past the owner in the doorway in 60 s');
check(out.b.overlaps === 0, out.b.overlaps + ' samples had a guest inside the owner');
check(out.b.teleports === 0, out.b.teleports + ' guests teleported past the owner');
check(out.b.stalls <= 2, out.b.stalls + ' stall samples while the owner stood in the doorway');
if (failures.length) {
  console.error('\nowner-presence-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nowner-presence-smoke OK');
