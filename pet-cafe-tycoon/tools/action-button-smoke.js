// tools/action-button-smoke.js
//
// The floating action button must belong to the machine the owner is STANDING AT.
//
// The defect this exists to prevent from coming back (owner report, 2026-09-16 — "when standing on
// the oven cookies to collect the cookies, the upgrade action button appear little bit far from the
// machine"): offerAction() ranked candidates by PRIORITY first and distance only as a tiebreak, and
// every offering station accepted the owner anywhere inside a ~1.35 m front radius. Those radii
// overlap a neighbour's standing spot, so the kiosk's UPGRADE button floated over the kiosk while
// the owner stood at the oven. Measured before the fix: four stations showed a neighbour's button —
// oven1 -> UPGRADE, seat12 -> SUPPLIES, spaSeat3 -> HIRE, and the planters decor -> HIRE.
//
// Assertions, driven against a fully built café so every station is live:
//   1. Standing on any station's own front spot, any button shown belongs to THAT station.
//   2. The stations that do own an action still offer it when stood on (no over-correction into
//      silence), both empty-handed and with the owner's hands full.
//   3. The button is drawn on the machine's front face, near the owner — not past its centre.
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
const PORT = 4191;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`action-button-smoke: port ${PORT} is already in use — an environment problem, not a game regression.`);
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

// The label each station type is allowed to claim. Anything else standing on its front spot means
// the button belongs to a different machine.
const OWNED = {
  pantry: 'SUPPLIES', return: 'RETURN', kiosk: 'UPGRADE', hire: 'HIRE', boutique: 'SHOP',
};

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

async function sweep(carry) {
  return page.evaluate(async held => {
    const G = window.__game;
    if (G.intro) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
    G.coins += 90000;
    // Build the whole café: an unbuilt zone has no stations, and the overlaps only exist once the
    // late unlocks (spa seats, planters, photo desk) are standing next to the early ones.
    for (const z of G.world.area.zones) {
      if (G.world.built.has(z.id)) continue;
      G.P.x = z.x; G.P.z = z.z;
      for (let i = 0; i < 160 && !G.world.built.has(z.id); i++) G.update(0.1);
    }
    if (held) window.__dev.carry(3, 'cupcake'); else window.__dev.carry(0);
    const rows = [];
    for (const st of [...G.world.stations.values()].filter(s => s.active && s.front)) {
      G.P.x = st.front.x; G.P.z = st.front.z;
      for (let i = 0; i < 4; i++) G.update(1 / 30);
      const b = document.querySelector('.fbtn');
      const shown = !!b && !b.classList.contains('hidden');
      const word = shown ? (b.querySelector('.fbtnWord') || {}).textContent : null;
      let btn = null, centre = null, owner = null;
      if (shown) {
        const r = b.getBoundingClientRect();
        btn = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        // Project in THIS frame: the camera follows the owner, so a projection taken after the
        // sweep has moved on measures camera travel, not where the button was drawn.
        const t = { sx: 0, sy: 0, visible: true };
        G.fx.project(st.x, 1.65, st.z, t); centre = { x: t.sx, y: t.sy };
        G.fx.project(G.P.x, 1.65, G.P.z, t); owner = { x: t.sx, y: t.sy };
      }
      rows.push({ id: st.id, type: st.type, word, btn, centre, owner });
    }
    return rows;
  }, carry);
}

for (const held of [false, true]) {
  const tag = held ? 'hands full' : 'empty-handed';
  const rows = await sweep(held);
  check(rows.length > 30, `[${tag}] only ${rows.length} active stations — the café did not finish building`);

  for (const r of rows) {
    if (!r.word) continue;
    const owned = OWNED[r.type];
    check(owned === r.word,
      `[${tag}] standing at ${r.id} (${r.type}) shows ${r.word} — that button belongs to another machine`);
    // The button must land on the machine's front face, i.e. no further from the owner than the
    // station's own centre is. A centre-anchored button on a deep counter fails this.
    if (r.btn) {
      const btnOut = Math.hypot(r.btn.x - r.owner.x, r.btn.y - r.owner.y);
      const centreOut = Math.hypot(r.centre.x - r.owner.x, r.centre.y - r.owner.y);
      check(btnOut <= centreOut + 1,
        `[${tag}] ${r.id}: button is ${btnOut | 0}px from the owner but the station centre is only ` +
        `${centreOut | 0}px — it is anchored past the machine instead of on its front face`);
    }
  }

  // No over-correction: the machines that own an action must still offer it.
  const want = held ? ['pantry', 'return', 'kiosk', 'hire', 'boutique'] : ['pantry', 'kiosk', 'hire', 'boutique'];
  for (const type of want) {
    const any = rows.some(r => r.type === type && r.word === OWNED[type]);
    check(any, `[${tag}] no ${type} station offered its ${OWNED[type]} button when stood on`);
  }
  console.log(`[${tag}] ${rows.length} stations, ${rows.filter(r => r.word).length} offering: ` +
    rows.filter(r => r.word).map(r => `${r.id}->${r.word}`).join(', '));
}

await browser.close();
await new Promise(resolve => server.close(resolve));

if (failures.length) {
  console.error('\naction-button-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\naction-button-smoke OK');
