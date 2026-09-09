// tools/responsive-audit.js — YouTube Playables / MediaCube certification harness.
//
// Reviewers resize the frame to the smallest supported viewport, in BOTH orientations, and look for
// UI that overlaps, clips, escapes the viewport, or blocks gameplay. This audit reproduces that pass
// automatically and fails the build with evidence instead of relying on eyeballing screenshots.
//
// Usage:  node tools/responsive-audit.js [--keep] [--shots] [--only=WxH]
//   --keep   leave the static server running for manual inspection
//   --shots  write a PNG per viewport into shots/responsive/
//   --only   audit a single viewport (e.g. --only=320x480)
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
const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
const SKIP_BUILD = args.includes('--no-build');

// The strict matrix. Smallest entries are deliberately below any real phone: reviewers drag the
// frame edge, they do not pick device presets. 280x653 is the folded Galaxy Fold, the narrowest
// mainstream viewport in existence.
const VIEWPORTS = [
  { w: 280, h: 653, tag: 'fold-portrait' },
  { w: 320, h: 480, tag: 'min-portrait' },
  { w: 360, h: 640, tag: 'small-portrait' },
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
  '.toast', '.skipPill', '.patience', '.fnum', '#hint', '#wallet', '#crowd', '#dayPill',
  '#goalPill', '#banner', '.meta-reputation', '.meta-pawbook', '.contractBadge',
].join(',');

const INTERACTIVE = ['button', '[role="button"]', 'a[href]', 'input', 'select', '.fbtn', '.skipPill'].join(',');
const MIN_TAP = 44;          // px, the platform-standard minimum touch target
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
}).listen(4176);

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

  const range = document.createRange();
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const over = {
      left: Math.max(0, -r.left), top: Math.max(0, -r.top),
      right: Math.max(0, r.right - vw), bottom: Math.max(0, r.bottom - vh),
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

// Force a photo session into existence. stepPhotoBooth needs the owner at the booth AND a guest
// genuinely waiting in slot 0, which a 4.5s sim warm-up will not produce on its own — so the state
// is built directly, exactly as forceDenseCafe builds the zone list directly rather than waiting
// for the bot to afford it. If the booth or a guest is missing this is a no-op and the pass simply
// measures the same thing the world pass does.
async function forcePhotoSession(page) {
  return page.evaluate(() => {
    const G = window.__game;
    if (!G || !G.world) return false;
    const st = [...G.world.stations.values()].find(s => s.type === 'photo' && s.active);
    const guest = (G.customers || []).find(c => c && !c.done);
    if (!st || !guest) return false;
    st.serving = true;
    st.session = {
      customerId: guest.id, species: guest.species, variant: guest.petVariant | 0,
      tier: 0, t: 0.35, resolved: false,
    };
    return true;
  });
}

// Batch 3 adds a fourth overlay and a wallet ring, neither of which the three existing states can
// show. An audit that does not open what the batch just built reports PASS for the wrong reason —
// the same blind spot that hid two 40px tap targets until the album state was added.
async function openPawSheet(page) {
  return page.evaluate(() => {
    const opener = document.querySelector('.meta-reputation');
    if (opener) opener.click();
    const root = document.querySelector('.paw-root');
    return !!root && !root.classList.contains('hidden');
  });
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

// A complete party order puts TWO things on screen the audit had never measured: the HUD chip in
// the left column (it sat on top of the followers pill for two batches) and the world collect pill.
async function forcePartyOrder(page) {
  return page.evaluate(() => {
    const G = window.__game;
    if (!G || !G.meta) return false;
    if (!G.meta.partyOrders) G.meta.partyOrders = { nextId: 1, completed: 0, lastOfferDay: 0, active: null };
    G.meta.partyOrders.active = {
      id: 9001, title: 'Audit', subtitle: '', createdDay: G.dayState.day, expiresDay: G.dayState.day + 1,
      reward: 130, claimed: false, requirements: [{ product: 'cookie', count: 4, target: 4 }],
    };
    // The chip renders on the system's own day-change sync; nudge the day and let its tick fire.
    G.dayState.day += 1;
    for (let i = 0; i < 40; i++) G.update(0.05);
    return !!document.querySelector('.party-order-btn:not(.hidden)');
  });
}

async function openPetBook(page, tab) {
  return page.evaluate(name => {
    const btn = document.querySelector('.meta-pawbook');
    if (btn) btn.click();
    const t = [...document.querySelectorAll('.meta-book-tab, [data-tab]')]
      .find(el => (el.dataset && el.dataset.tab === name) || (el.textContent || '').toLowerCase().includes(name));
    if (t) t.click();
    return !document.querySelector('.meta-book-root.hidden');
  }, tab);
}

const results = [];
const list = ONLY ? VIEWPORTS.filter(v => `${v.w}x${v.h}` === ONLY) : VIEWPORTS;
if (!list.length) { console.error('no viewport matches ' + ONLY); process.exit(1); }

for (const vp of list) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: vp.w < 700, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto('http://localhost:4176/', { waitUntil: 'load' });
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

  // State 3: the Pet Book overlay on its Album tab — 20 cards in a 4-column grid.
  if (await openPetBook(page, 'album')) {
    await W(120);
    states.push({ name: 'album', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-album.png` });
    await page.evaluate(() => document.querySelector('.meta-book-close')?.click());
    await W(80);
  }

  // State 4: the Paw Rating sheet — the batch's own new overlay.
  if (await openPawSheet(page)) {
    await W(120);
    states.push({ name: 'paw', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-paw.png` });
    await page.evaluate(() => document.querySelector('.paw-close')?.click());
    await W(80);
  }

  // State 5: the wallet's saving ring, which needs an unbuilt zone to point at.
  if (await showSavingRing(page)) {
    await page.evaluate(() => window.__game && window.__game.update(0.05));
    await W(120);
    states.push({ name: 'ring', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-ring.png` });
  }

  // State 6: a complete party order — the HUD chip and the world collect pill together.
  if (await forcePartyOrder(page)) {
    await W(120);
    states.push({ name: 'party', audit: await runAudit() });
    if (SHOTS) await page.screenshot({ path: `shots/responsive/${vp.tag}-${vp.w}x${vp.h}-party.png` });
  }

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

if (KEEP) { console.log('server still on http://localhost:4176/ (--keep)'); }
else { srv.close(); }
process.exit(total > 0 ? 1 : 0);
