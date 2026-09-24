// tools/first-look-smoke.js
//
// Batch F's acceptance, driven in a real browser: every new thing introduces itself EXACTLY ONCE,
// with one camera pan and one glyph bubble, and nothing else is drawn while it does.
//
// What this guards against, measured on 2026-09-19 (research/onboarding): eleven zone purchases in
// a row produced no lesson and no camera look between them — the pet camera, the treat bowl, the
// ice cream stand, the pantry and the staff desk were never introduced at all — while day 1 spent
// 84 seconds replaying the cook-stock-serve loop as a forced walkthrough, and the interaction
// coach's route hand hung clamped to the screen edge pointing at things behind walls. Every one of
// those is a failure of the same missing rule, so they are pinned together here:
//
//   1. each purchase and each first need opens its own lesson, once;
//   2. while a lesson is on screen NOTHING else is: no floor trail, no beacon, no stand ring, no
//      interaction-coach hand, and at most one ghost hand of its own;
//   3. the bubble is 2-3 pictures, never a word, and carries an accessible name;
//   4. doing the thing ends it, and it never plays again with the world put back exactly as it was;
//   5. nothing opens while a sheet is up.
//
// The café is held QUIET between sections (tables wiped, machines fed, bushes green) so each window
// measures the lesson under test and not whichever chore happened to come due — the same technique
// tools/guidance-policy-smoke.js uses. The need-triggered lessons get their own section, where the
// need is created deliberately.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.FIRST_LOOK_PORT || 4703);
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
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('first-look-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const shots = path.resolve('shots-production', 'first-look');
fs.mkdirSync(shots, { recursive: true });

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 380, height: 670 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
page.on('pageerror', e => failures.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto('http://127.0.0.1:' + PORT + '/?dev=1', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game && !!window.__dev, null, { timeout: 60000 });
await page.waitForTimeout(700);

await page.evaluate(() => {
  const S = window.__scene, G = window.__game;
  // S.establish is the render lane's pan helper (src/render/scene.js); a lesson is allowed at most
  // one call to it, and only for a subject that is off screen or more than 6 m away.
  window.__pans = [];
  const base = S.establish.bind(S);
  S.establish = (pts, opts) => { window.__pans.push(pts && pts.length ? { x: pts[0].x, z: pts[0].z } : null); return base(pts, opts); };
  // Skip the opening minute: it is tools/first-minute-smoke.js's subject, not this one.
  G.intro.step = 5; G.intro.active = false; G.intro.target = null;

  // Shelves full, machines fed, tables clean, bushes green, nobody posing: no NEED-triggered lesson
  // can arm, so a purchase window measures the purchase.
  window.__flBase = () => {
    for (const st of G.world.stations.values()) {
      if (st.type === 'seat') st.dirty = false;
      if (st.type === 'bush') st.stage = 0;
      if (st.type === 'coffee') st.beans = 20;
      if (st.type === 'bowl') st.stock = st.capacity || 10;
      if (st.id === 'barIce') st.stock = Math.max(st.stock | 0, 4);
    }
    G.world.pose = null;
    // Hold the shift in its opening phase. A lesson deliberately stands aside during a rush and
    // nothing at all runs while the day summary is up (both are the point of the lane), so a probe
    // that let the clock run would be measuring the calendar rather than the lesson. The rush rule
    // itself is covered by test/first-look.test.js's laneOpen cases.
    G.dayState.t = 20;
  };
  // A section that wants one specific NEED alive sets this instead of rewriting the quiet café.
  window.__flExtra = () => {};
  window.__flHold = () => { window.__flBase(); window.__flExtra(); };
  // Celebrations share the lesson's queue (ui/moments.js). The backlog is emptied at the start of
  // every window so each one measures the lesson rather than a toast mid-animation.
  window.__flQuiet = () => {
    window.__moments.clear();
    for (const el of document.querySelectorAll('.moment')) el.classList.add('hidden');
  };

  // The window is sampled on the REAL frame loop, not by pumping G.update in a synchronous loop.
  // Two reasons, both learned the hard way here: the moment queue's own timers run on wall time
  // (ui/moments.js), so a synchronous pump can leave a celebration mid-animation holding the lane
  // for ever; and a lesson's camera pan, bubble placement and ghost hand are all measured from a
  // real projected frame. This is a live probe, so it runs at the speed the player sees.
  window.__flOut = null;
  window.__flOn = false;
  // The quiet café is held on its own permanent frame loop, so it keeps holding between windows
  // while a lesson finishes retiring.
  (function holdLoop() { window.__flHold(); requestAnimationFrame(holdLoop); })();
  window.__flStart = () => {
    const named = n => { let o = null; S.scene.traverse(x => { if (x.name === n) o = x; }); return o; };
    const trail = named('guide-trail'), beacon = named('guide-beacon'), ring = named('guide-ring');
    const shown = el => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
    window.__flQuiet();
    const out = {
      frames: 0, bubbleFrames: 0, handFrames: 0, conflictFrames: 0,
      maxBubbles: 0, maxHands: 0, cells: 0, lessons: [], aria: '',
    };
    window.__flOut = out;
    window.__flOn = true;
    const tick = () => {
      if (!window.__flOn) return;
      out.frames++;
      const bubbles = [...document.querySelectorAll('.fl-bubble')].filter(shown);
      const hands = [...document.querySelectorAll('.fl-hand')].filter(shown);
      out.maxBubbles = Math.max(out.maxBubbles, bubbles.length);
      out.maxHands = Math.max(out.maxHands, hands.length);
      const guide = (trail && trail.visible) || (beacon && beacon.visible) || (ring && ring.visible);
      const coach = shown(document.querySelector('.interaction-coach'));
      if (bubbles.length) {
        out.bubbleFrames++;
        out.cells = Math.max(out.cells, bubbles[0].children.length);
        out.aria = bubbles[0].getAttribute('aria-label') || out.aria;
        if (guide || coach) out.conflictFrames++;   // a lesson owns the screen while it runs
      }
      if (hands.length) out.handFrames++;
      const id = G.firstLook.activeId;
      if (id && !out.lessons.includes(id)) out.lessons.push(id);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  window.__flStop = () => {
    window.__flOn = false;
    const out = window.__flOut || {};
    out.activeAfter = G.firstLook.activeId;
    return out;
  };

  // Stand on a pad and hold still until it is paid for, exactly as a player does.
  window.__flBuy = id => {
    const z = G.world.area.zones.find(z => z.id === id);
    if (!z) return false;
    G.coins = 1e6;
    G.P.x = z.x; G.P.z = z.z; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 900 && !G.world.built.has(id); i++) { window.__flHold(); G._force = null; G.update(1 / 30); }
    window.__pans.length = 0;
    return G.world.built.has(id);
  };
});

// The window runs on the real frame loop; the screenshot is taken PART WAY THROUGH it, while the
// lesson is still presenting. Shooting at the end photographed a café with nothing in it: the beat
// is about three seconds and the bubble hides again as soon as its subject leaves the frame.
async function sample(sec, shotPath = null) {
  await page.evaluate(() => window.__flStart());
  const shotAt = Math.min(1800, Math.round(sec * 1000) - 200);
  if (shotPath) {
    await page.waitForTimeout(shotAt);
    // ?dev=1 is only here for the panel-free hooks; the panel itself is never shipped to a player
    // and must not stand in a screenshot of the play field.
    await page.evaluate(() => { for (const el of document.querySelectorAll('[class*="dev-"],.dev-panel,#devPanel')) el.style.display = 'none'; }).catch(() => {});
    await page.screenshot({ path: shotPath });
    await page.waitForTimeout(Math.max(0, Math.round(sec * 1000) - shotAt));
  } else {
    await page.waitForTimeout(Math.round(sec * 1000));
  }
  return page.evaluate(() => window.__flStop());
}
const pans = () => page.evaluate(() => { const n = window.__pans.length; window.__pans.length = 0; return n; });
const run = fn => page.evaluate(fn);

const report = [];
let shot = 1;

function assertLesson(name, s, panCount, { hand = false } = {}) {
  check(s.lessons.includes(name), `${name}: never opened (saw ${JSON.stringify(s.lessons)})`);
  check(s.maxBubbles === 1, `${name}: ${s.maxBubbles} bubbles on screen at once, expected exactly 1`);
  check(s.bubbleFrames > 0, `${name}: the bubble was never actually visible`);
  check(s.cells >= 2 && s.cells <= 3, `${name}: bubble has ${s.cells} cells, expected 2-3`);
  check(!!s.aria, `${name}: the bubble carries no accessible name`);
  check(s.conflictFrames === 0, `${name}: something else drew over the lesson on ${s.conflictFrames} frames`);
  check(s.maxHands <= 1, `${name}: ${s.maxHands} ghost hands at once`);
  check(panCount <= 1, `${name}: ${panCount} camera pans, expected at most 1`);
  if (hand) check(s.handFrames > 0, `${name}: the ghost hand never appeared on the control it asks for`);
}

// Wait for the lane to be genuinely free before measuring the next thing, instead of guessing at a
// fixed pause: a lesson runs until the player does it, and the point of the lane is that the next
// one waits.
async function settle(ms = 14000) {
  await page.waitForFunction(() => !window.__game.firstLook.activeId, null, { timeout: ms })
    .catch(() => {});
}

async function lessonWindow(name, { setup = null, complete = null, seconds = 7, hand = false, screenshot = true, settleAfter = true } = {}) {
  const before = await page.evaluate(n => ({ seen: window.__game.firstLook.seen(n), active: window.__game.firstLook.activeId, armed: window.__game.firstLook.armedIds }), name);
  if (setup) await run(setup);
  const mid = await page.evaluate(n => ({ seen: window.__game.firstLook.seen(n), active: window.__game.firstLook.activeId, phase: window.__game.firstLook.activePhase, armed: window.__game.firstLook.armedIds }), name);
  if (process.env.FL_DEBUG) console.log('[' + name + '] before=' + JSON.stringify(before) + ' afterSetup=' + JSON.stringify(mid));
  const shotPath = screenshot ? path.join(shots, String(shot++).padStart(2, '0') + '-' + name + '.png') : null;
  const s = await sample(seconds, shotPath);
  const p = await pans();
  assertLesson(name, s, p, { hand });
  report.push({ name, pans: p, ...s });
  if (complete) await run(complete);
  if (settleAfter) await settle();
  return s;
}

// ---- 0. the first dirty table -----------------------------------------------------------------
// This one comes first because the player meets it first: the café opens with two guests already
// seated (src/sim/opening.js), so a table is dirty before anything has been bought. Measuring it
// after the build lesson, as this smoke used to, found it already taught.
await lessonWindow('clean', {
  setup: () => {
    const G = window.__game;
    // Away from the tables: wiping is a walk-past now (systems/stations.js AUTO_CLEAN_RADIUS), so an
    // owner standing on the seats pad cleans the table before the lesson can point at it.
    const oven = G.world.stations.get('oven1');
    G.P.x = oven.front.x; G.P.z = oven.front.z; G.P.vx = 0; G.P.vz = 0;
    const seat = [...G.world.stations.values()].find(s => s.type === 'seat' && s.active);
    window.__flExtra = () => { G.world.stations.get(seat.id).dirty = true; };
  },
  complete: () => { window.__flExtra = () => {}; },
});


// ---- 1. a sheet holds everything ------------------------------------------------------------------
await run(() => { window.__game.coins = 90; });
await run(() => window.__game.uiRoutes.pets.open());
await page.waitForTimeout(250);
const underSheet = await run(() => {
  const G = window.__game;
  for (let i = 0; i < 150; i++) G.update(1 / 30);   // a paused café is not stepped by the real loop
  return {
    bubbles: [...document.querySelectorAll('.fl-bubble')].filter(el => !el.classList.contains('hidden')).length,
    active: G.firstLook.activeId,
  };
});
check(underSheet.bubbles === 0 && !underSheet.active,
  `a lesson opened over an open sheet (${JSON.stringify(underSheet)})`);
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.body.classList.contains('modal-open'), null, { timeout: 4000 });

// ---- 2. the purchases and the first needs, in the order a player meets them -------------------------
// The build lesson is armed by the 90 coins set above, before any pad is bought.
await lessonWindow('build', { hand: true, complete: () => { window.__flBuy('z_seats1'); } });

await run(() => { window.__flBuy('z_oven2'); });
await lessonWindow('hire', {
  setup: () => {
    const G = window.__game;
    window.__flBuy('z_hire');
    // The ghost tap only ever sits on a control that is actually on screen, so the owner has to be
    // standing at the desk for it — which is where buying the desk leaves them anyway.
    const desk = G.world.stations.get('hire1');
    G.P.x = desk.front.x; G.P.z = desk.front.z; G.P.vx = 0; G.P.vz = 0;
  },
  hand: true,
  complete: () => { window.__game.staff.runner = 1; },
  // No settle: the worker that hire produced arms the next lesson immediately, and that hand-over
  // is the thing being measured.
  settleAfter: false,
});
await lessonWindow('roleRunner', { seconds: 8 });

await lessonWindow('coffee', {
  setup: () => { window.__flBuy('z_coffee'); },
  complete: () => { window.__game.world.stations.get('barCoffee').stock = 1; },
});
// A dry coffee machine, and nothing else out of place: the pantry hand-over.
await lessonWindow('pantry', {
  setup: () => {
    const G = window.__game;
    G.carry.sack = null; G.carry.sackLeft = 0; G.owner.clearItems();
    window.__flExtra = () => { for (const st of G.world.stations.values()) if (st.type === 'coffee') st.beans = 0; };
  },
  hand: true,
  complete: () => {
    window.__flExtra = () => {};
    window.__game.carry.sack = 'beans'; window.__game.carry.sackLeft = 20;
  },
});
await lessonWindow('bowl', {
  setup: () => {
    window.__game.carry.sack = null; window.__game.carry.sackLeft = 0;
    window.__flBuy('z_bowl');
  },
  hand: true,
  complete: () => {
    const G = window.__game, st = G.world.stations.get('bowl1');
    G.P.x = st.front.x; G.P.z = st.front.z; G.P.vx = 0; G.P.vz = 0;
  },
});
await lessonWindow('blend', {
  setup: () => { window.__flBuy('z_blender'); },
  complete: () => { window.__game.world.stations.get('blender1').fruit = 3; },
});
// One ripe bush.
await lessonWindow('harvest', {
  setup: () => {
    const G = window.__game;
    G.carry.fruit = 0;
    window.__flExtra = () => { for (const st of G.world.stations.values()) if (st.type === 'bush') st.stage = 3; };
  },
  hand: true,
  complete: () => { window.__flExtra = () => {}; window.__game.carry.fruit = 2; },
});
await run(() => { window.__flBuy('z_garden'); window.__flBuy('z_seats2'); });
await lessonWindow('photo', { setup: () => { window.__flBuy('z_photo'); } });
await lessonWindow('garden', { setup: () => { window.__flBuy('z_terrace'); } });
// The garden stand out of cones.
await lessonWindow('icestand', {
  setup: () => {
    const G = window.__game;
    window.__flExtra = () => { G.world.stations.get('barIce').stock = 0; };
  },
  complete: () => { window.__flExtra = () => {}; window.__game.world.stations.get('barIce').stock = 4; },
});

// ---- 4. no replay, ever ----------------------------------------------------------------------------
const replay = await run(() => {
  const G = window.__game;
  const alreadyRunning = G.firstLook.activeId;
  G.carry.sack = null; G.carry.sackLeft = 0; G.owner.clearItems(); G.carry.fruit = 0;
  for (const st of G.world.stations.values()) {
    if (st.type === 'coffee') st.beans = 0;          // the pantry lesson's trigger
    if (st.id === 'barIce') st.stock = 0;            // the ice-stand lesson's trigger
    if (st.type === 'seat') st.dirty = true;         // the clean lesson's trigger
    if (st.type === 'bush') st.stage = 3;            // the harvest lesson's trigger
    if (st.type === 'bowl') st.stock = 0;            // the treat-bin lesson's trigger
  }
  const ids = ['build', 'hire', 'roleRunner', 'coffee', 'bowl', 'blend', 'photo', 'garden', 'pantry', 'clean', 'harvest', 'icestand'];
  const seenBefore = Object.fromEntries(ids.map(id => [id, G.firstLook.seen(id)]));
  let bubbleFrames = 0;
  const replayed = [];
  for (let i = 0; i < 60 * 30; i++) {
    G._force = null; G.update(1 / 30);
    const b = document.querySelector('.fl-bubble');
    if (b && !b.classList.contains('hidden')) bubbleFrames++;
    const id = G.firstLook.activeId;
    if (id && id !== alreadyRunning && seenBefore[id] && !replayed.includes(id)) replayed.push(id);
  }
  return { replayed, bubbleFrames, seenBefore, looks: G.firstLook.snapshot() };
});
check(replay.replayed.length === 0, `these lessons played a second time: ${replay.replayed.join(', ')}`);
const never = Object.entries(replay.seenBefore).filter(([, v]) => !v).map(([k]) => k);
check(never.length === 0, `these mechanics were never introduced at all: ${never.join(', ')}`);

// ---- 5. the shown set is in the save ----------------------------------------------------------------
const saved = await run(() => (window.__game.snapshot().learning || {}).looks || []);
check(saved.length >= 10, `the save carries only ${saved.length} shown lessons: ${JSON.stringify(saved)}`);
check(saved.every(id => replay.looks.includes(id)), 'the saved shown-set does not match the live one');

await browser.close();
await new Promise(resolve => server.close(resolve));

for (const r of report) {
  console.log(
    String(r.name).padEnd(12)
    + 'pans=' + String(r.pans).padEnd(3)
    + 'bubbleFrames=' + String(r.bubbleFrames).padEnd(5)
    + 'cells=' + String(r.cells).padEnd(3)
    + 'hand=' + String(r.handFrames).padEnd(5)
    + 'conflict=' + String(r.conflictFrames).padEnd(4)
    + (r.aria ? '"' + r.aria + '"' : ''),
  );
}
console.log('replayed in 60 s: ' + JSON.stringify(replay.replayed) + '  bubbleFrames=' + replay.bubbleFrames);
console.log('shown after the run: ' + JSON.stringify(saved));
if (failures.length) {
  console.error('\nfirst-look-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nfirst-look-smoke OK');
