// tools/seating-smoke.js
//
// What happens to a guest who has paid and cannot sit down.
//
// Three things the owner reported on day 18, all of them the same knot:
//   "when the 2 tables are not cleaned the customers wait NEAR THE REGISTER, which confuses the
//    player — which one needs payment?"
//   "the customers that paid wait beside the register because no table is clean"
//   "if 6 customers wait for the first 2 tables and I clean them, only 2 sit and the remaining 4
//    LEAVE, not wait"
//
// The last one was the sharpest. A guest waits only while `dirtyTablesBlockingSeats` holds, and that
// needs a free DIRTY seat — so the instant the player wiped both tables and two guests took them,
// the other four were told there was nothing left to wait for. Cleaning the tables threw them out.
//
// The rule this pins:
//   - a guest waits while ANY table could still come free: dirty, or occupied by a meal that will end
//   - they wait BY THE TABLES, not at the till, so the crowd at the register is only people who owe
//     money
//   - cleaning a table never evicts the guests who do not get it
//   - running out of patience for a table is a TAKEAWAY: no refund, the sale stands
//   - and it is only a service failure (a reputation point) when a dirty table was the reason
//   - NOBODY EVER STANDS SOMEWHERE THE FLOOR ISN'T. The first version of the wait spot put guests
//     on a ring 1.35 m from the table at an angle taken from their id; mover.js snaps an
//     unreachable target to the nearest free cell, and the nearest free cell to a point inside the
//     garden fence is a cell in the garden — so the owner photographed guests standing in the
//     flowerbeds, some of them then leaving through the fence instead of by the door. Every live
//     guest is checked against the nav grid on every sample now.
//   - a SETTLED visit (a pet that sat at one of your tables through a whole meal) is what advances
//     the Pet Book; a takeaway does not. That is what a table is for.
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
const PORT = 4194;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('seating-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const shots = path.resolve('shots-production', 'seating');
fs.mkdirSync(shots, { recursive: true });
const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await new Promise(r => setTimeout(r, 800));

const out = await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;
  G.coins = 1e6;
  for (const id of ['z_seats1', 'z_oven2', 'z_hire']) {
    const z = G.world.area.zones.find(z => z.id === id); if (!z || G.world.built.has(id)) continue;
    G.P.x = z.x; G.P.z = z.z;
    for (let i = 0; i < 300 && !G.world.built.has(id); i++) G.update(0.1);
  }
  G.dayState.day = 6;
  G.staff.cashier = 1;            // so the till keeps clearing while we watch the tables
  const seats = [...G.world.stations.values()].filter(s => s.type === 'seat' && s.active);
  const tills = [...G.world.stations.values()].filter(s => s.type === 'checkout' && s.active);
  G.P.x = 0; G.P.z = 4; G.P.vx = 0; G.P.vz = 0;

  const dirtyAll = () => { for (const s of seats) s.dirty = true; };
  // Mirrors sim/nav.js idx()/isFree() — the grid is plain data on the world, so the check the
  // simulation itself uses can be run from here without importing the module into the page.
  const onFloor = c => {
    const g = G.world.grid; if (!g) return true;
    let gx = Math.floor((c.x - g.ox) / g.cell), gz = Math.floor((c.z - g.oz) / g.cell);
    if (gx < 0) gx = 0; else if (gx >= g.w) gx = g.w - 1;
    if (gz < 0) gz = 0; else if (gz >= g.h) gz = g.h - 1;
    // Only "is this cell solid?". The lane bits are a ROUTING permission (which way through the
    // door this mover may go) and sim/customers.js narrows a guest's mask to 0 once it is inside,
    // so testing them here would flag every guest standing in the doorway.
    return !g.blocked[gz * g.w + gx];
  };
  const offFloor = new Map();
  const sampleFloor = () => {
    for (const c of G.customers) {
      if (c.done || onFloor(c)) continue;
      const key = c.state;
      offFloor.set(key, (offFloor.get(key) || 0) + 1);
    }
  };
  const stockAll = () => {
    for (const st of G.world.stations.values()) {
      if (st.type === 'display') st.stock = st.capacity;
      if (st.type === 'coffee') st.beans = 20;
      if (st.type === 'bowl') st.stock = st.capacity;
    }
  };

  // ---- fill the room with guests who have paid and cannot sit -----------------------------
  let waiting = [];
  for (let i = 0; i < 150 * 30; i++) {
    G._force = null; G.update(1 / 30);
    if (i % 30 === 0) { dirtyAll(); stockAll(); }
    if (i % 10 === 0) sampleFloor();
    waiting = G.customers.filter(c => c.state === 'waitSeat');
    if (waiting.length >= 4) break;
  }
  const waitingCount = waiting.length;
  const waitingIds = waiting.map(c => c.id);

  // Give them four seconds to actually walk to wherever they were sent — a guest is still standing
  // at the till for a moment after their payment clears, which is exactly as it should be.
  for (let i = 0; i < 4 * 30; i++) { G._force = null; G.update(1 / 30); if (i % 30 === 0) { dirtyAll(); stockAll(); } if (i % 10 === 0) sampleFloor(); }
  waiting = G.customers.filter(c => waitingIds.includes(c.id) && c.state === 'waitSeat');

  // Where are they standing? Distance to the nearest table vs the nearest till.
  const spots = waiting.map(c => ({
    toTable: Math.min(...seats.map(s => Math.hypot(s.x - c.x, s.z - c.z))),
    toTill: Math.min(...tills.map(s => Math.hypot(s.x - c.x, s.z - c.z))),
  }));

  // ---- now wipe every table, exactly as the player would ----------------------------------
  const before = waiting.map(c => c.id);
  for (const s of seats) s.dirty = false;
  // Six seconds is far longer than it takes the lucky ones to claim a table.
  let evicted = 0;
  const outcome = new Map(before.map(id => [id, 'waiting']));
  for (let i = 0; i < 6 * 30; i++) {
    G._force = null; G.update(1 / 30);
    if (i % 10 === 0) sampleFloor();
    for (const id of before) {
      const c = G.customers.find(cc => cc.id === id);
      if (!c) { if (outcome.get(id) === 'waiting') outcome.set(id, 'vanished'); continue; }
      if (c.state === 'toSeat' || c.state === 'eating') outcome.set(id, 'seated');
      else if (c.state === 'leave' && outcome.get(id) === 'waiting') { outcome.set(id, 'left'); evicted++; }
    }
  }
  const seated = [...outcome.values()].filter(v => v === 'seated').length;
  const stillWaiting = [...outcome.values()].filter(v => v === 'waiting').length;

  // ---- and the accounting when patience finally runs out ----------------------------------
  // A clean but busy room must cost nothing at all.
  G.world.events.length = 0;
  for (const s of seats) { s.dirty = false; }
  // What a table is FOR: a pet that sits through a whole meal advances the Pet Book, and a takeaway
  // does not. Forty seconds with clean tables has to move the collection.
  const friendshipBefore = Object.values(G.meta.petFriendship || {}).reduce((a, b) => a + (b | 0), 0);
  for (let i = 0; i < 40 * 30; i++) {
    G._force = null; G.update(1 / 30);
    if (i % 30 === 0) stockAll();
    if (i % 10 === 0) sampleFloor();
  }
  const cleanRoomEvents = {
    refunds: G.world.events.filter(e => e.type === 'tableRefund').length,
    misses: G.world.events.filter(e => e.type === 'seatMissed').length,
  };

  const friendshipTotal = Object.values(G.meta.petFriendship || {}).reduce((a, b) => a + (b | 0), 0);

  return {
    seats: seats.length, waitingCount, spots, seated, stillWaiting, evicted,
    cleanRoomEvents, friendshipBefore, friendshipTotal,
    offFloor: [...offFloor.entries()].map(([state, n]) => ({ state, n })),
  };
});
await page.screenshot({ path: path.join(shots, 'waiting.png') });
await browser.close();
await new Promise(resolve => server.close(resolve));

if (out.waitingCount < 3) {
  failures.push('only ' + out.waitingCount + ' guests ever reached the waiting state — the fixture did not reproduce the situation');
}
// They wait by the tables, not at the till.
for (const s of out.spots) {
  if (!(s.toTable < s.toTill)) {
    failures.push('a guest waiting for a table stood ' + s.toTable.toFixed(1) + ' m from the nearest table and '
      + s.toTill.toFixed(1) + ' m from the till — it belongs by the tables');
  }
}
// Cleaning the tables must not evict anybody.
if (out.evicted > 0) {
  failures.push(out.evicted + ' guest(s) walked out in the six seconds AFTER the tables were wiped — cleaning threw them out');
}
if (out.seated < 1) failures.push('nobody sat down once the tables were clean');
if (out.cleanRoomEvents.refunds > 0) {
  failures.push(out.cleanRoomEvents.refunds + ' table refund(s): giving up on a table must be a takeaway, not a clawback');
}
if (out.cleanRoomEvents.misses > 0) {
  failures.push(out.cleanRoomEvents.misses + ' seat miss(es) charged in a spotless café — a clean, busy room is not a service failure');
}

if (out.offFloor.length) {
  failures.push('guests stood off the walkable floor: '
    + out.offFloor.map(o => o.n + ' sample(s) in state ' + o.state).join(', ')
    + ' — a wait spot (or a walk target) is being placed somewhere the nav grid calls solid');
}
if (!(out.friendshipTotal > out.friendshipBefore)) {
  failures.push('forty seconds of guests eating at clean tables added nothing to the Pet Book ('
    + out.friendshipBefore + ' -> ' + out.friendshipTotal + ') — a settled visit is what a table is for');
}

console.log(out.seats + ' tables, ' + out.waitingCount + ' guests waiting for one');
console.log('where they wait: ' + out.spots.map(s => s.toTable.toFixed(1) + ' m from a table / ' + s.toTill.toFixed(1) + ' m from the till').join(', '));
console.log('six seconds after wiping: ' + out.seated + ' seated, ' + out.stillWaiting + ' still waiting, ' + out.evicted + ' walked out');
console.log('forty seconds in a spotless café: ' + out.cleanRoomEvents.refunds + ' refunds, ' + out.cleanRoomEvents.misses + ' seat misses');
console.log('Pet Book friendship over the clean-table window: ' + out.friendshipBefore + ' -> ' + out.friendshipTotal);
console.log('guests off the walkable floor: ' + (out.offFloor.length ? JSON.stringify(out.offFloor) : 'none'));
if (failures.length) {
  console.error('\nseating-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nseating-smoke OK');
