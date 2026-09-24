// tools/responsive-audit.js — YouTube Playables / MediaCube certification harness.
//
// Reviewers resize the frame to the smallest supported viewport, in BOTH orientations, and look for
// UI that overlaps, clips, escapes the viewport, or blocks gameplay. This audit reproduces that pass
// automatically and fails the build with evidence instead of relying on eyeballing screenshots.
//
// Usage:  node tools/responsive-audit.js [--keep] [--shots] [--only=WxH[,WxH...]] [--port=N]
//   --keep   leave the static server running for manual inspection
//   --shots  write a PNG per viewport into shots/responsive/
//   --only   audit only these viewports (e.g. --only=320x480,380x670)
//   --port   serve on this port (default 4176; parallel worktrees each need their own)
//
// Exit code 0 = certification-clean, 1 = violations found.

import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const SHOTS = args.includes('--shots');
const ONLY = ((args.find(a => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const PORT = Number((args.find(a => a.startsWith('--port=')) || '').split('=')[1]) || 4176;
const SKIP_BUILD = args.includes('--no-build');

// The strict matrix. Smallest entries are deliberately below any real phone: reviewers drag the
// frame edge, they do not pick device presets. 280x653 is the folded Galaxy Fold, the narrowest
// mainstream viewport in existence.
const VIEWPORTS = [
  { w: 280, h: 653, tag: 'fold-portrait' },
  { w: 320, h: 480, tag: 'min-portrait' },
  { w: 360, h: 640, tag: 'small-portrait' },
  // The phone the in-world action button was measured 24 px tall on (menu/HUD research, 2026-09-19).
  { w: 380, h: 670, tag: 'phone-portrait-small' },
  { w: 390, h: 844, tag: 'phone-portrait' },
  { w: 414, h: 896, tag: 'large-portrait' },
  { w: 768, h: 1024, tag: 'tablet-portrait' },
  { w: 480, h: 320, tag: 'min-landscape' },
  { w: 653, h: 280, tag: 'fold-landscape' },
  { w: 640, h: 360, tag: 'small-landscape' },
  { w: 844, h: 390, tag: 'phone-landscape' },
  { w: 896, h: 414, tag: 'large-landscape' },
  { w: 1024, h: 768, tag: 'tablet-landscape' },
  { w: 1280, h: 720, tag: 'desktop' },
];

// Elements that carry meaning. Two of these overlapping is a genuine defect: the player loses
// information. Purely decorative layers are excluded on purpose.
const CONTENT = [
  '.pill', '.demand', '.objCaption', '.wish', '.chalk', '.fbtn', '.zlabel', '.zprice',
  '.toast', '.skipPill', '.patience', '.fnum', '#wallet', '#banner', '.meta-pawbook', '.pause-btn',
].join(',');

const INTERACTIVE = ['button', '[role="button"]', 'a[href]', 'input', 'select', '.fbtn', '.skipPill'].join(',');
// 48, not 44: tools/playables-cert-smoke.js enforces the publisher's 47.5px floor and caught a 44px
// control this audit had passed. One floor, the stricter one, so the two can never disagree again.
const MIN_TAP = 48;
const OVERLAP_TOLERANCE = 4; // px of intersection forgiven (border radii, shadows)

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const W = ms => new Promise(r => setTimeout(r, ms));

if (!SKIP_BUILD) execSync('npm run build', { stdio: 'inherit' });
const dist = path.resolve('dist');
if (!fs.existsSync(dist)) { console.error('no dist/ — run npm run build first'); process.exit(1); }

const srv = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
}).listen(PORT);

if (SHOTS) fs.mkdirSync('shots/responsive', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

// Runs inside the page. Returns every certification violation visible at this instant.
//
// Elements are DISCOVERED, not listed. A hand-maintained selector list is exactly how a defect like
// the pause button colliding with the day pill stays invisible to its own regression test: whatever
// nobody remembered to add simply never gets checked. Anything a player can read or press counts.
function auditInPage(_unusedContent, INTERACTIVE, MIN_TAP, OVERLAP_TOLERANCE) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { overflow: [], overlap: [], truncated: [], tapTarget: [], canvas: null };

  const describe = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`;
  };

  // Visibility must be evaluated through the ANCESTOR CHAIN. A child of an `opacity:0` parent still
  // reports opacity 1 for itself, so checking the element alone reports elements the player cannot
  // see -- which showed up here as false failures against labels the arbiter had already hidden.
  // An element covered by something else — most often the rest of the UI sitting behind an open
  // full-screen modal — is not visible to the player and cannot overlap, clip or block anything.
  // getComputedStyle cannot detect this: occlusion is a stacking-context question, so ask the
  // browser directly. Ancestors and descendants count as "self": elementFromPoint returns the
  // topmost node, which for any container is normally one of its own children.
  const occluded = el => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    if (!top) return false; // outside the viewport entirely; the bounds checks below own that case
    return !(top === el || el.contains(top) || top.contains(el));
  };

  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false; // parked, not broken
    let n = el, op = 1;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const o = parseFloat(s.opacity);
      if (Number.isFinite(o)) op *= o;
      if (op < 0.05) return false;
      n = n.parentElement;
    }
    return !occluded(el);
  };

  // Direct text: text belonging to THIS element rather than a descendant. Prevents a wrapper and
  // its label being reported as two colliding things.
  const directText = el => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.trim();
  };

  const isLayer = el => {
    const r = el.getBoundingClientRect();
    return r.width >= vw * 0.97 && r.height >= vh * 0.97;
  };

  const all = [...document.body.querySelectorAll('*')];
  const els = all.filter(el => {
    if (el.tagName === 'CANVAS' || el.tagName === 'SVG' || el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return false;
    if (el.closest('svg')) return false;
    if (!visible(el)) return false;
    if (isLayer(el)) return false;                       // backdrops / full-screen containers
    return !!directText(el) || el.matches(INTERACTIVE);  // readable or pressable
  });

  // A list that SCROLLS is allowed to be longer than the screen: the twentieth pet card sitting
  // below the fold of the Pet Book's own scroller is how a grid works, not a layout defect. So for
  // anything inside a vertical scroller, the up/down bounds belong to that scroller, and only the
  // left/right bounds are still measured against the viewport. The scroller itself is checked as an
  // element in its own right, so a scroll box that does not fit is still caught.
  const scrollerOf = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  };

  const range = document.createRange();
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const sc = scrollerOf(el);
    const scr = sc && sc.getBoundingClientRect();
    const topLimit = scr ? Math.max(0, scr.top) : 0;
    const bottomLimit = scr ? Math.min(vh, scr.bottom) : vh;
    const over = {
      left: Math.max(0, -r.left), top: sc ? 0 : Math.max(0, topLimit - r.top),
      right: Math.max(0, r.right - vw), bottom: sc ? 0 : Math.max(0, r.bottom - bottomLimit),
    };
    const worst = Math.max(over.left, over.top, over.right, over.bottom);
    if (worst > 1) out.overflow.push({ el: describe(el), by: Math.round(worst), edge: Object.keys(over).find(k => over[k] === worst) });

    // The "estock" defect class. scrollWidth alone misses it: with `overflow: visible` the text
    // paints outside the box and scrollWidth never grows. Measuring the rendered text range does
    // catch it, whatever the overflow mode.
    const txt = directText(el);
    if (txt) {
      let spill = 0;
      try {
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        if (tr.width > 0) spill = Math.max(0, r.left - tr.left, tr.right - r.right);
      } catch (_) { /* ignore unrangeable nodes */ }
      if (el.scrollWidth > el.clientWidth + 1) spill = Math.max(spill, el.scrollWidth - el.clientWidth);
      if (spill > 1) out.truncated.push({ el: describe(el), spill: Math.round(spill) });
    }
  }

  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > OVERLAP_TOLERANCE && oy > OVERLAP_TOLERANCE) {
        out.overlap.push({ a: describe(a), b: describe(b), area: Math.round(ox * oy), ox: Math.round(ox), oy: Math.round(oy) });
      }
    }
  }

  for (const el of [...document.querySelectorAll(INTERACTIVE)].filter(visible)) {
    const r = el.getBoundingClientRect();
    if (r.width < MIN_TAP - 0.5 || r.height < MIN_TAP - 0.5) {
      out.tapTarget.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  const c = document.getElementById('c');
  if (c) {
    const r = c.getBoundingClientRect();
    if (Math.abs(r.width - vw) > 2 || Math.abs(r.height - vh) > 2) {
      out.canvas = { w: Math.round(r.width), h: Math.round(r.height), vw, vh };
    }
  }
  return out;
}

// Drive the café into its densest UI state: every zone built, full staff, a full floor of guests.
// Density is when labels collide, so a sparse opening screen proves nothing.
async function forceDenseCafe(page) {
  await page.evaluate(() => {
    const G = window.__game;
    if (!G) return;
    G.coins = 9999999;
    const w = G.world;
    for (let pass = 0; pass < 40; pass++) {
      let changed = false;
      for (const z of w.area.zones) {
        if (w.built.has(z.id)) continue;
        if (z.requires && !w.built.has(z.requires)) continue;
        w.built.add(z.id);
        for (const id of z.adds) { const st = w.stations.get(id); if (st) st.active = true; }
        changed = true;
      }
      if (!changed) break;
    }
    G.staff = { runner: 2, cashier: 1, cleaner: 1, barista: 1 };
    G.up = { speed: 3, carry: 3, income: 3 };
    if (G.meta) G.meta.reputation = 240;
    for (const st of w.stations.values()) if (st.active && 'stock' in st) st.stock = 0; // empty = max label noise
  });
  // Let the sim run so guests arrive, wishes pop, and every label system is live at once.
  for (let i = 0; i < 90; i++) { await page.evaluate(() => window.__game && window.__game.update(0.05)); await W(12); }
}

// Force a shot into existence. A pose is chosen every 35-50 s from whoever happens to be seated
// (src/sim/petPose.js), which a 4.5 s sim warm-up will not produce on its own — so the state is
// built directly, exactly as forceDenseCafe builds the zone list directly rather than waiting for
// the bot to afford it. With no guest at all this is a no-op and the pass simply measures the same
// thing the world pass does.
async function forcePhotoSession(page) {
  return page.evaluate(() => {
    const G = window.__game;
    if (!G || !G.world) return false;
    const guest = (G.customers || []).find(c => c && !c.done);
    if (!guest) return false;
    const seat = guest.seat || [...G.world.stations.values()].find(s => s.type === 'seat' && s.active);
    if (!seat) return false;
    const spot = seat.pair ? seat.pair.pet : seat;
    G.world.pose = {
      id: seat.id, seatId: seat.id, customerId: guest.id,
      species: guest.species, variant: guest.petVariant | 0,
      x: spot.x, z: spot.z, t: 1, after: 0, serving: false,
      session: {
        customerId: guest.id, species: guest.species, variant: guest.petVariant | 0,
        tier: 0, t: 0.35, resolved: false, quality: null, tip: 0,
      },
    };
    return true;
  });
}

// Batch D: the menu is the Café card and the sheets behind it. Each is opened through its real
// door (the Café button, a tile, the Pet Book chip) and measured as the player sees it, then closed
// the way the player would. An audit that does not open what a batch built reports PASS for the
// wrong reason.
async function openCafeCard(page) {
  return page.evaluate(() => {
    document.querySelector('.pause-btn')?.click();
    const root = document.querySelector('.pause-root');
    return !!root && !root.classList.contains('hidden');
  });
}
async function closeCafeCard(page) {
  await page.evaluate(() => document.querySelector('[data-action="resume"]')?.click());
  await W(80);
}
async function openTile(page, name) {
  const ok = await openCafeCard(page);
  if (!ok) return false;
  return page.evaluate(n => {
    const tile = document.querySelector(`[data-tile="${n}"]`);
    if (!tile || tile.hidden) return false;
    tile.click();
    return true;
  }, name);
}
async function openShopTab(page, tab) {
  return page.evaluate(t => {
    const b = document.querySelector(`.stab[data-tab="${t}"]`);
    if (b) b.click();
    return !!document.querySelector(`.stab.active[data-tab="${t}"]`);
  }, tab);
}
async function closeSheet(page) {
  await page.evaluate(() => document.querySelector('.sheet .sclose')?.click());
  await W(300);
}
async function openPetBook(page, detail) {
  return page.evaluate(d => {
    document.querySelector('.meta-pawbook')?.click();
    if (d) document.querySelector('button.pb-card')?.click();
    return !document.querySelector('.meta-book-root.hidden') && (!d || !document.querySelector('.pb-detail[hidden]'));
  }, detail);
}

// The wallet's saving ring only appears while something is still unbuilt, and forceDenseCafe builds
// EVERYTHING — so without un-building one zone the ring can never be measured in any state.
async function showSavingRing(page) {
  return page.evaluate(() => {
    const G = window.__game;
    if (!G || !G.world) return false;
    const last = [...G.world.area.zones].reverse().find(z => G.world.built.has(z.id));
    if (!last) return false;
    G.world.built.delete(last.id);
    G.coins = Math.max(0, Math.round(last.price * 0.4));
    return true;
  });
}

// The moment sinks: a banner and a toast are queued together; the banner shows first (one at a
// time), and it has to sit clear of the wallet, the Pet Book chip and the Café button.
async function showMoment(page) {
  await page.evaluate(() => {
    const G = window.__game;
    G.hud.banner({ cells: ['+', 88], aria: 'Audit banner' }, 4000);
    G.hud.toast({ cells: ['+', 9], aria: 'Audit toast' });
  });
  // Queued: whatever moment the dense café already had on screen finishes first.
  const shown = await page.waitForFunction(() => !!document.querySelector('#banner.show'), null, { timeout: 12000 }).then(() => true, () => false);
  await W(450); // the banner's entrance transition
  return shown;
}

// The in-world action button (.fbtn) only exists while the owner stands at a station that offers
// one, and no other state put him there — which is how a 24 px button (the label scale shrank its
// 48 px minimum on phones) passed every earlier run. The staff desk is the one station left that
// offers one (Batch C, docs/SHIP-PLAN-2026-09-19.md 1.4), so it is activated and stood at,
// empty-handed, and the arbiter lays the frame out.
async function showActionButton(page) {
  const shown = await page.evaluate(() => {
    const G = window.__game;
    const st = G && G.world && G.world.stations.get('hire1');
    if (!st) return false;
    st.active = true;
    if (window.__dev && window.__dev.carry) window.__dev.carry(0);
    G._force = null; G.P.x = st.front.x; G.P.z = st.front.z; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 6; i++) G.update(1 / 30);
    const b = document.querySelector('.fbtn');
    return !!b && !b.classList.contains('hidden');
  });
  await W(150); // real frames: the label arbiter runs from the render loop
  return shown;
}

// Last, because it ends the day: the day summary.
async function showDaySummary(page) {
  await page.evaluate(() => {
    const G = window.__game;
    G.dayStats.earned = 2471; G.dayStats.served = 36; G.dayStats.photos = 3;
    G.dayState.t = 239.95;
    for (let i = 0; i < 6 && !G.dayState._ended; i++) G.update(0.05);
  });
  await W(1300); // the count-up
  return page.evaluate(() => !!document.querySelector('.ds-card.show'));
}

const results = [];
const list = ONLY.length ? VIEWPORTS.filter(v => ONLY.includes(`${v.w}x${v.h}`)) : VIEWPORTS;
if (!list.length) { console.error('no viewport matches ' + ONLY.join(',')); process.exit(1); }

for (const vp of list) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: vp.w < 700, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 }).catch(() => {});
  await W(600);
  await forceDenseCafe(page);
  await W(250);

  const runAudit = () => page.evaluate(
    ([src, c, i, t, o]) => (0, eval)('(' + src + ')')(c, i, t, o),
    [auditInPage.toString(), CONTENT, INTERACTIVE, MIN_TAP, OVERLAP_TOLERANCE],
  );
  const tally = a => a.overflow.length + a.overlap.length + a.truncated.length + a.tapTarget.length + (a.canvas ? 1 : 0);

  // State 1: the dense world, no menu — the original pass.
  const audit = await runAudit();
  if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}.png` });

  // State 2: a live photo session, so the ring and its 80x80 tap target are on screen.
  const states = [];
  if (await forcePhotoSession(page)) {
    await page.evaluate(() => window.__game && window.__game.update(0.05));
    await W(120);
    states.push({ name: 'photo', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-photo.png` });
  }

  const measure = async (name, open, close) => {
    if (!(await open())) return false;
    await W(420); // sheet entrance transitions
    states.push({ name, audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-${name}.png` });
    if (close) await close();
    return true;
  };

  // State 3: the Café card.
  await measure('cafe', () => openCafeCard(page), () => closeCafeCard(page));
  // State 4-6: the Shop from the Café card, each tab.
  if (await openTile(page, 'shop')) {
    for (const tab of ['staff', 'upgrades', 'decor']) await measure(`shop-${tab}`, () => openShopTab(page, tab), null);
    await closeSheet(page);
  }
  // State 7-8: the Pet Book from its chip — the grid, then a pet.
  await measure('petbook', () => openPetBook(page, false), async () => { await page.evaluate(() => document.querySelector('.meta-book-close')?.click()); await W(80); });
  await measure('petdetail', () => openPetBook(page, true), async () => { await page.evaluate(() => { document.querySelector('.pb-back')?.click(); document.querySelector('.meta-book-close')?.click(); }); await W(80); });
  // State 9: Café Stars from its tile.
  await measure('stars', () => openTile(page, 'stars'), async () => { await page.evaluate(() => document.querySelector('.paw-close')?.click()); await W(80); });

  // State 10: the wallet's saving ring, which needs an unbuilt zone to point at.
  if (await showSavingRing(page)) {
    await page.evaluate(() => window.__game && window.__game.update(0.05));
    await W(120);
    states.push({ name: 'ring', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-ring.png` });
  }

  // State 11: a banner from the moment queue, beside the permanent HUD.
  await measure('moment', () => showMoment(page), null);

  // State 12: the action button at the staff desk, measured by the same tap floor as every control. Not
  // shown at all is itself a violation: this state exists to measure it.
  if (await showActionButton(page)) {
    states.push({ name: 'action', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-action.png` });
  } else {
    states.push({ name: 'action', audit: { overflow: [], overlap: [], truncated: [], canvas: null, tapTarget: [{ el: '.fbtn (not shown at hire1)', w: 0, h: 0 }] } });
  }

  // State 13: the day summary (it ends the day, so it goes last).
  await measure('summary', () => showDaySummary(page), null);

  const count = tally(audit) + states.reduce((s, st) => s + tally(st.audit), 0);
  results.push({ ...vp, audit, states, errors, count });
  const mark = count === 0 && !errors.length ? 'PASS' : 'FAIL';
  const seen = ['world', ...states.map(s => s.name)].join('+');
  console.log(`${mark}  ${String(vp.w + 'x' + vp.h).padEnd(10)} ${vp.tag.padEnd(18)} violations=${count}  states=${seen}${errors.length ? ` pageErrors=${errors.length}` : ''}`);
  await ctx.close();
}

await browser.close();

console.log('\n================ CERTIFICATION REPORT ================');
let total = 0;
for (const r of results) {
  const a = r.audit;
  const n = r.count;
  total += n;
  if (!n && !r.errors.length) continue;
  console.log(`\n--- ${r.w}x${r.h} (${r.tag}) — ${n} violation(s) ---`);
  for (const st of r.states || []) {
    const a2 = st.audit;
    if (a2.canvas) console.log(`  [${st.name}] CANVAS  does not fill viewport`);
    for (const o of a2.overflow.slice(0, 6)) console.log(`  [${st.name}] OVERFLOW  ${o.el} escapes ${o.edge} by ${o.by}px`);
    for (const t of a2.truncated.slice(0, 6)) console.log(`  [${st.name}] CLIPPED   ${t.el} text spills ${t.spill}px past its box`);
    for (const o of a2.overlap.slice(0, 8)) console.log(`  [${st.name}] OVERLAP   ${o.a}  ><  ${o.b}  (${o.ox}x${o.oy}px)`);
    for (const t of a2.tapTarget.slice(0, 5)) console.log(`  [${st.name}] TAPTARGET ${t.el} is ${t.w}x${t.h}, min ${MIN_TAP}`);
  }
  if (a.canvas) console.log(`  CANVAS  does not fill viewport: ${a.canvas.w}x${a.canvas.h} vs ${a.canvas.vw}x${a.canvas.vh}`);
  for (const o of a.overflow.slice(0, 8)) console.log(`  OVERFLOW  ${o.el} escapes ${o.edge} by ${o.by}px`);
  if (a.overflow.length > 8) console.log(`            ...and ${a.overflow.length - 8} more`);
  for (const t of a.truncated.slice(0, 8)) console.log(`  CLIPPED   ${t.el} text spills ${t.spill}px past its box`);
  if (a.truncated.length > 8) console.log(`            ...and ${a.truncated.length - 8} more`);
  for (const o of a.overlap.slice(0, 10)) console.log(`  OVERLAP   ${o.a}  ><  ${o.b}  (${o.ox}x${o.oy}px)`);
  if (a.overlap.length > 10) console.log(`            ...and ${a.overlap.length - 10} more`);
  for (const t of a.tapTarget.slice(0, 6)) console.log(`  TAPTARGET ${t.el} is ${t.w}x${t.h}, min ${MIN_TAP}`);
  if (a.tapTarget.length > 6) console.log(`            ...and ${a.tapTarget.length - 6} more`);
  for (const e of r.errors.slice(0, 3)) console.log(`  PAGEERROR ${e}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  totalViolations: total,
  viewports: results.map(r => ({
    size: `${r.w}x${r.h}`, tag: r.tag, violations: r.count, errors: r.errors.length,
    detail: r.audit, states: (r.states || []).map(s => ({ name: s.name, detail: s.audit })),
  })),
};
fs.mkdirSync('reports-responsive', { recursive: true });
fs.writeFileSync('reports-responsive/audit.json', JSON.stringify(summary, null, 2));

const failed = results.filter(r => r.count || r.errors.length).length;
console.log(`\n${total} total violation(s) across ${failed}/${results.length} viewport(s).`);
console.log('report: reports-responsive/audit.json');

if (KEEP) { console.log(`server still on http://localhost:${PORT}/ (--keep)`); }
else { srv.close(); }
process.exit(total > 0 ? 1 : 0);
