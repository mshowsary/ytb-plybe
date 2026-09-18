// tools/quiet-field-smoke.js
//
// How much furniture is on the play field during ordinary play?
//
// The day-18 report, with screenshots: nine pet name tags at once, several of them faded and sitting
// on empty floor far from any animal ("name labels that stay after the customer has gone"). They
// were live tags — ui/labelLayout.js dims a label to 45% and nudges it up to 148 px when it cannot
// find clear space, which is the right behaviour for nine overlapping labels and the wrong number of
// labels to hand it. Plus a metre-high arrow and a floor trail on screen most of the time.
//
// This runs a built-out café at full house, with the owner standing in the busiest part of it, and
// counts what is actually drawn:
//   - how many pet name tags are showing at once
//   - whether the declutter solver had to dim or hide ANY label to fit them
//   - how much of the time the guidance trail / beacon / ring is on screen during normal play
//   - THE GHOST TEST: stand in the middle of a rush until the solver starts dimming labels, then
//     walk away, and check that every tag still on screen belongs to a pet that is really there and
//     really close. This is the one that matters. The first version of the proximity fix passed
//     every count above and the owner still photographed four faded names floating over an empty
//     floor, because `.label-muted` was `opacity:.45!important`: it outranked the base `opacity:0`,
//     so a tag dimmed during a rush stayed visible after petMoments.js had hidden it, and — still
//     measuring as a live 0.45 label — stayed a solver candidate forever while nothing updated its
//     position. Counting tags could never have caught that. Asking "is there a pet under this?" can.
// and saves the frame to shots-production/quiet-field/.
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
const PORT = 4199;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('quiet-field-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const shots = path.resolve('shots-production', 'quiet-field');
fs.mkdirSync(shots, { recursive: true });
const failures = [];
const browser = await chromium.launch();
const results = [];

for (const [tag, w, h] of [['phone-portrait', 390, 844], ['phone-landscape', 852, 393]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', e => failures.push('[' + tag + '] pageerror: ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));

  const m = await page.evaluate(() => {
    const G = window.__game, S = window.__scene;
    G.intro.step = 5; G.intro.active = false; G.intro.target = null;
    // A café the player has been running for a fortnight: everything affordable built, every
    // mechanic long since proven, staff hired.
    for (const k of ['move', 'build', 'pickup', 'serve', 'cash', 'pantry', 'harvest', 'clean', 'return']) G.markMechanic(k);
    G.coins = 1e6;
    for (const z of [...G.world.area.zones]) {
      if (G.world.built.has(z.id)) continue;
      if (z.requires && !G.world.built.has(z.requires)) continue;
      G.P.x = z.x; G.P.z = z.z;
      for (let i = 0; i < 300 && !G.world.built.has(z.id); i++) G.update(0.1);
    }
    G.dayState.day = 14;
    // Stand where the guests are: the middle of the seating floor.
    const seats = [...G.world.stations.values()].filter(s => s.type === 'seat' && s.active);
    const cx = seats.reduce((a, s) => a + s.x, 0) / Math.max(1, seats.length);
    const cz = seats.reduce((a, s) => a + s.z, 0) / Math.max(1, seats.length);
    G.P.x = cx; G.P.z = cz; G.P.vx = 0; G.P.vz = 0;

    const vis = n => { let o = null; S.scene.traverse(x => { if (x.name === n) o = x; }); return !!o && o.visible; };
    const shown = sel => [...document.querySelectorAll(sel)].filter(el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
    });

    // Two minutes of ordinary play: let the café fill, and sample every half second.
    let frames = 0, guided = 0, maxTags = 0, muted = 0, crowded = 0, maxCustomers = 0;
    for (let i = 0; i < 120 * 30; i++) {
      G._force = null; G.update(1 / 30);
      if (i % 15 !== 0) continue;
      frames++;
      if (vis('guide-trail') || vis('guide-beacon') || vis('guide-ring')) guided++;
      maxTags = Math.max(maxTags, shown('.pet-identity').length);
      muted = Math.max(muted, document.querySelectorAll('.label-muted').length);
      crowded = Math.max(crowded, document.querySelectorAll('.label-crowded').length);
      maxCustomers = Math.max(maxCustomers, G.customers.filter(c => !c.done).length);
    }
    // ---- the ghost test -------------------------------------------------------------------
    // Effective visibility, not `opacity` alone: ui/labelLayout.js dims and hides with a FILTER so
    // that it composes with the owning system's opacity instead of overriding it, and a reader that
    // looked at only one of the two would miss half the cases.
    const seen = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      const f = /opacity\(([\d.]+)\)/.exec(cs.filter || '');
      return parseFloat(cs.opacity) * (f ? parseFloat(f[1]) : 1);
    };
    // Stand in the thick of it until the solver is genuinely dimming things.
    const queue = G.customers.filter(c => !c.done);
    if (queue.length) {
      const q = queue[0];
      G.P.x = q.x; G.P.z = q.z + 0.8; G.P.vx = 0; G.P.vz = 0;
    }
    let dimmedDuringRush = 0;
    for (let i = 0; i < 20 * 30; i++) {
      G._force = null; G.update(1 / 30);
      dimmedDuringRush = Math.max(dimmedDuringRush, document.querySelectorAll('.label-muted').length);
    }
    // Now walk away, to the emptiest corner of the room, and let everything settle.
    const far = [...G.world.stations.values()].find(st => st.active && st.type === 'return')
      || [...G.world.stations.values()].find(st => st.active && st.front);
    if (far) { G.P.x = far.front.x; G.P.z = far.front.z; G.P.vx = 0; G.P.vz = 0; }
    for (let i = 0; i < 8 * 30; i++) { G._force = null; G.update(1 / 30); }

    const ghosts = [];
    for (const el of document.querySelectorAll('.pet-identity')) {
      if (seen(el) <= 0.05) continue;
      const id = el.dataset.customerId != null ? Number(el.dataset.customerId) : null;
      const c = id != null ? G.customers.find(cc => cc.id === id && !cc.done) : null;
      const d = c ? Math.hypot(c.x - G.P.x, c.z - G.P.z) : null;
      // A tag is legitimate only while its pet is alive and within arm's reach of the owner, plus a
      // metre of slack for the gap between the guest's own position and their pet on its leash.
      if (!c || d > 3.8) {
        ghosts.push({
          name: el.textContent.trim().slice(0, 20),
          gone: !c,
          dist: d == null ? null : Math.round(d * 10) / 10,
          alpha: Math.round(seen(el) * 100) / 100,
          muted: el.classList.contains('label-muted'),
        });
      }
    }
    // ---- and the rule underneath it ---------------------------------------------------------
    // The emergent test above only fires when the café happens to crowd enough for the solver to
    // start dimming. THIS one always fires: it states the contract directly. The label arbiter's own
    // presentation states must COMPOSE with the owning system's visibility, never override it — so a
    // tag the arbiter has dimmed, or hidden, and that its owner then puts away, is gone.
    const compose = (() => {
      const el = document.querySelector('.pet-identity');
      if (!el) return null;
      const was = el.className, wasStyle = el.style.transition;
      // Both opacity and filter are transitioned on these classes, and getComputedStyle reports the
      // value mid-flight. Freeze them so each line below reads the RULE, not an animation frame.
      el.style.transition = 'none';
      const read = () => { void el.offsetWidth; return seen(el); };
      el.className = 'pet-identity show';                       const shown1 = read();
      el.className = 'pet-identity show label-muted';           const dimmed = read();
      el.className = 'pet-identity label-muted';                const hiddenDim = read();
      el.className = 'pet-identity label-crowded';              const hiddenCrowd = read();
      el.className = 'pet-identity show label-crowded';         const shownCrowd = read();
      el.className = was; el.style.transition = wasStyle;
      return { shown1, dimmed, hiddenDim, hiddenCrowd, shownCrowd };
    })();
    return {
      frames, guidedShare: guided / Math.max(1, frames), maxTags, muted, crowded, maxCustomers,
      built: G.world.built.size, dimmedDuringRush, ghosts, compose,
      liveCustomers: G.customers.filter(c => !c.done).length,
    };
  });
  await page.screenshot({ path: path.join(shots, tag + '.png') });
  results.push({ tag, ...m });
  await page.close();

  // At most a couple of names at once: the tags you are standing next to.
  if (m.maxTags > 3) failures.push('[' + tag + '] ' + m.maxTags + ' pet name tags were on screen at once');
  // If nothing has to be dimmed or hidden, every label on screen is legible and over its own subject.
  if (m.muted > 0) failures.push('[' + tag + '] the declutter solver had to dim ' + m.muted + ' label(s)');
  if (m.crowded > 0) failures.push('[' + tag + '] the declutter solver had to hide ' + m.crowded + ' label(s)');
  // Guidance is for teaching and un-sticking. On a fortnight-old café it should be rare.
  if (m.guidedShare > 0.25) failures.push('[' + tag + '] guidance was on screen ' + Math.round(m.guidedShare * 100) + '% of a two-minute shift');
  // The contract the ghost came from: dimming and hiding compose with the owner's visibility.
  const c = m.compose;
  if (!c) failures.push('[' + tag + '] no pet tag existed to check the dim/hide rules against');
  else {
    if (!(c.shown1 > 0.9)) failures.push('[' + tag + '] a shown tag is only ' + c.shown1 + ' opaque');
    if (!(c.dimmed > 0.2 && c.dimmed < 0.8)) failures.push('[' + tag + '] a dimmed-but-shown tag reads ' + c.dimmed + ', expected about .45');
    if (c.hiddenDim > 0.01) failures.push('[' + tag + '] a tag its owner HID still shows at ' + c.hiddenDim + ' once the solver has dimmed it — this is the ghost');
    if (c.hiddenCrowd > 0.01) failures.push('[' + tag + '] a tag its owner hid still shows at ' + c.hiddenCrowd + ' once the solver has hidden it');
    if (c.shownCrowd > 0.01) failures.push('[' + tag + '] a tag the solver hid still shows at ' + c.shownCrowd);
  }
  // The ghost test. A tag on screen must have a pet under it.
  if (m.ghosts.length) {
    failures.push('[' + tag + '] ' + m.ghosts.length + ' name tag(s) left on screen with no pet under them: '
      + m.ghosts.map(g => g.name + (g.gone ? ' (customer gone)' : ' (' + g.dist + ' m away)')
        + ' at ' + g.alpha + ' alpha' + (g.muted ? ', dimmed' : '')).join('; '));
  }
}

await browser.close();
await new Promise(resolve => server.close(resolve));
for (const r of results) {
  console.log(r.tag.padEnd(18) + r.built + ' zones built, up to ' + r.maxCustomers + ' guests, '
    + r.maxTags + ' name tag(s) at once, ' + r.muted + ' dimmed, ' + r.crowded + ' hidden, guidance on screen '
    + Math.round(r.guidedShare * 100) + '% of the shift');
  console.log(' '.repeat(18) + 'ghost test: ' + r.dimmedDuringRush + ' label(s) dimmed standing in the rush, '
    + r.liveCustomers + ' guests live after walking away, ' + r.ghosts.length + ' tag(s) left behind');
}
if (failures.length) {
  console.error('\nquiet-field-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nquiet-field-smoke OK — shots in ' + path.relative(process.cwd(), shots));
