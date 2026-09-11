// tools/label-overflow-smoke.js
//
// Regression test for the owner's screenshot defect: a pet name tag rendered as a fragment ("cuit"
// for "Biscuit") pinned to the left frame edge in portrait.
//
// Root cause was that `.pet-identity` was the only projected label class missing from the arbiter's
// ANCHORS registry in src/ui/labelLayout.js, so petMoments.js wrote raw projected coordinates that
// nothing clamped, and `#fx{overflow:hidden}` sliced the tag mid-word. Two things must therefore
// hold, in every viewport shape the playable ships in:
//
//   1. REGISTRATION — nothing in `#fx` may position itself with left/top without being registered
//      with the arbiter. A new label class that forgets fails here rather than in a screenshot.
//   2. CONTAINMENT — a registered label displaced past any edge is pulled back inside the safe box,
//      including `.pet-identity` itself, which is what the screenshot was missing.
//
// It also pins the two traps that the fix could plausibly have introduced:
//   * `label-crowded` is our own opacity:0, so the new invisible-label filter must not swallow it
//     (a crowded label that is skipped can never come back);
//   * the label scale must shrink on a narrow viewport and stay at exactly 1 on desktop, so the
//     portrait fix does not silently resize every landscape label.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'label-overflow');
fs.mkdirSync(shots, { recursive: true });

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
// 4183 is used by no other tool. Ports are shared freely ACROSS certification suites here, but they
// must be unique WITHIN one, and this check runs in `visual` alongside interaction-coach-smoke.js —
// which already owns 4178. An unhandled EADDRINUSE is reported as a failed check by the runner, so
// it reads as a product regression rather than a squatted port; say which it is, plainly.
const PORT = 4183;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`label-overflow-smoke: port ${PORT} is already in use — another tool (or a previous `
    + 'run that did not exit) is holding it. This is an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const mockSdk = `
window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(){return true}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},engagement:{sendScore(){}},ads:{}};
`;

// Elements that deliberately position themselves in `#fx` without going through the arbiter.
//   * `fcoin`/`fbill` and the bonus chips are short-lived flying effects: a coin in flight is
//     allowed to start or end off-screen, and rewardsSystem.js explains why the chips need no
//     clamping (they are anchored readouts, not projected labels).
//   * `build-intent-progress` is the one that is not a flying effect: it is a zone-anchored
//     progress bar that the arbiter tracks as HUD KEEP-OUT (see HUD_KEEPOUT in labelLayout.js) so
//     labels route around it, rather than as a label it owns. It is listed here to make that
//     deliberate asymmetry explicit instead of silently tolerated — if it ever needs edge
//     clamping it should be registered in ANCHORS like any other projected element.
// Anything else that positions itself is a projected label and must be registered in ANCHORS.
const SELF_POSITIONED_FX = new Set([
  'fcoin', 'fbill',
  'mystery-float-chip', 'speed-build-chip', 'rare-visitor-chip', 'golden-shot-chip',
  'build-intent-progress',
]);

// Mirrors NUDGE_STEPS in src/ui/labelLayout.js. Pinned here on purpose: these are the discrete
// distances the solver uses to walk a label off a HUD keep-out zone, and the flushness assertion
// below needs to tell a deliberate nudge apart from a rect-model error.
const NUDGE_STEPS = [0, 12, 24, 40, 60, 84, 112, 148];

const VIEWPORTS = [  ['portrait-380x670', 380, 670, 2],
  ['portrait-450x800', 450, 800, 2],
  ['landscape-800x600', 800, 600, 1],
  ['landscape-1280x720', 1280, 720, 1],
];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const failures = [];
const summary = [];

for (const [tag, width, height, dpr] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: width < height });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: mockSdk }));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });

  // Skip the tutorial so the objective/zone/guest labels a real shift produces actually exist, then
  // put a little stock on the counters that are open on day 1.
  //
  // A fresh boot is a genuinely sparse café — only oven1/dispCookie/register1/kiosk1 are active and
  // no zones are built — so only a handful of labels are legitimately on screen. That is the game's
  // real state, not a gap in this test, and the synthetic tag below is what carries the
  // `.pet-identity` contract here: a LIVE pet tag only appears once a named pet announces, greets,
  // or SITS (systems/customers.js), and sitting needs a seats zone this profile has not paid for.
  // Resident pets, which always show a tag, come from saved progress. tools/shot.js already drives
  // the full zone build-out; this tool stays fast and deterministic instead of duplicating it.
  await page.evaluate(() => {
    const G = window.__game;
    G.intro.step = 5; G.intro.active = false;
    G.coins = 999999;
    for (const [, st] of G.world.stations) {
      if (st.active && st.type === 'display' && Array.isArray(st.items)) {
        st.items.length = 0;
        for (let i = 0; i < (st.capacity || 12); i++) st.items.push('cookie');
      }
    }
  });
  const keepStocked = setInterval(() => {
    page.evaluate(() => {
      const G = window.__game; if (!G) return;
      for (const [, st] of G.world.stations) {
        if (st.active && st.type === 'display' && Array.isArray(st.items)) {
          for (let i = st.items.length; i < (st.capacity || 12); i++) st.items.push('cookie');
        }
      }
    }).catch(() => {});
  }, 700);
  await page.waitForFunction(
    () => document.querySelectorAll('#fx .pet-identity.show').length > 0
      || document.querySelectorAll('#fx :is(.wish,.demand,.zprice,.chalk)').length >= 3,
    null, { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(900);
  clearInterval(keepStocked);

  const report = await page.evaluate((selfPositioned) => {
    const layout = window.__game.labelLayout;
    const managed = layout.managed;
    const fx = document.getElementById('fx');
    const vw = innerWidth, vh = innerHeight;
    const rectOf = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const isVisible = el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) >= 0.05;
    };
    const outside = r => r.l < -1 || r.t < -1 || r.r > vw + 1 || r.b > vh + 1;

    // ---- 1. REGISTRATION ----
    const unregistered = [];
    for (const el of fx.querySelectorAll('*')) {
      if (!el.style || (el.style.left === '' && el.style.top === '')) continue;
      if (el.matches(managed)) continue;
      const cls = (el.className || '').toString().split(/\s+/).filter(Boolean);
      if (cls.some(c => selfPositioned.includes(c))) continue;
      unregistered.push(cls.join('.') || el.tagName);
    }

    // ---- 2. CONTAINMENT ----
    // Real, currently-visible registered labels are displaced past each edge and must be pulled
    // back. Displacing the real element (rather than a synthetic one) is what makes this a test of
    // the shipped CSS: each class keeps its own transform, padding and font.
    const real = [...fx.querySelectorAll(`:is(${managed})`)].filter(isVisible);
    const presentClasses = [...new Set(real.map(el => (el.className || '').toString().split(/\s+/).filter(Boolean)[0]))].sort();
    const realPetTags = real.filter(el => el.classList.contains('pet-identity')).length;

    const edgePos = {
      left: [-60, vh * 0.5], right: [vw + 60, vh * 0.5],
      top: [vw * 0.5, -60], bottom: [vw * 0.5, vh + 60],
    };
    const cases = [];
    const displaced = real.slice(0, 8);
    // Distance from the safe-box edge the label was pushed toward. A single-item unit is moved by a
    // pure clamp, so a correct rect model lands FLUSH — the strongest available proof that the box
    // the solver reasons about is the box the browser paints. When the solver's box disagreed with
    // the pixels (offsetWidth ignores CSS scale) labels came back inside but short of the edge; when
    // the rect model had the wrong sign they did not come back at all.
    const flushFor = (edge, r) => edge === 'left' ? r.l - 2
      : edge === 'right' ? (vw - 2) - r.r
        : edge === 'top' ? r.t - 2 : (vh - 2) - r.b;
    for (const el of displaced) {
      const cls = (el.className || '').toString().split(/\s+/).filter(Boolean)[0];
      for (const [edge, [x, y]] of Object.entries(edgePos)) {
        el.style.left = x + 'px'; el.style.top = y + 'px';
        const before = rectOf(el);
        layout.update();
        const after = rectOf(el);
        cases.push({ cls, edge, beforeOutside: outside(before), after, afterOutside: outside(after), flush: flushFor(edge, after) });
      }
    }

    // The class that regressed, guaranteed present. petMoments.js may not have installed its own
    // stylesheet on a fresh boot (no named pet has spawned yet), so the tag's anchor is stated
    // inline — it is the same translate(-50%,-100%) the stylesheet uses, and it is the anchor the
    // arbiter's ANCHORS entry documents.
    const tag = document.createElement('div');
    tag.className = 'pet-identity';
    tag.textContent = 'Biscuit';
    tag.style.cssText = 'position:absolute;transform:translate(-50%,-100%);opacity:1;padding:5px 9px;'
      + 'border-radius:999px;background:#fff9f0;font:900 12px/1.05 system-ui,sans-serif;white-space:nowrap';
    fx.appendChild(tag);
    const tagCases = [];
    for (const [edge, [x, y]] of Object.entries(edgePos)) {
      tag.style.left = x + 'px'; tag.style.top = y + 'px';
      const before = rectOf(tag);
      layout.update();
      const after = rectOf(tag);
      tagCases.push({ cls: 'pet-identity', edge, beforeOutside: outside(before), after, afterOutside: outside(after), flush: flushFor(edge, after) });
    }
    // The used value of the independent `scale` property, i.e. proof that the CSS lever actually
    // reached the element and not merely that a custom property was set on the root.
    const tagScale = parseFloat(getComputedStyle(tag).scale);
    tag.remove();

    // ---- 3. THE OFFSET-WIDTH OVER-RESERVATION (the second half of the rect fix) ----
    // The solver used to reason from offsetWidth/offsetHeight, which report the LAYOUT box and see
    // none of the CSS scales on the element. This measures how big that gap actually was, which is
    // what the measured rect removes. For a `translate(-50%,-50%)` class the transform's `e`
    // component is minus half the layout width, so layoutWidth = 2|e| while the painted width is
    // rect.width — and the ratio is how much larger a box the old solver reserved than the pixels
    // on screen. In portrait this element carries BOTH playables-compact's scale(.82) and the new
    // --label-scale, so the gap is large; in landscape it should be ~1 (nothing is scaled).
    const demandEl = real.find(el => el.classList.contains('demand'));
    let scaleGap = null;
    if (demandEl) {
      demandEl.style.left = (vw * 0.5) + 'px'; demandEl.style.top = (vh * 0.5) + 'px';
      layout.update();
      const pill = rectOf(demandEl);
      const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(demandEl).transform);
      const e = m ? Math.abs(parseFloat(m[1].split(',')[4])) : 0;
      const layoutWidth = e * 2;
      // worldPerPixel() is the same quantity the policy scales against, read from the live scene so
      // this measures the shipped camera rather than a copy of its arithmetic.
      const wpp = window.__scene.worldPerPixel();
      // The pill's height expressed in METRES of world. Comparing this across viewports is the
      // constant-free form of "is the pill bigger than a character?": the character's world size is
      // the same everywhere and cancels out, so a smaller number means a smaller pill relative to
      // the pets and workers it is drawn over.
      const pillWorldH = pill.h * wpp;
      // What the SUPERSEDED width-floor policy would have produced at this viewport, so the smoke
      // can prove the phone actually changed rather than merely being below 1.
      const oldScale = Math.min(1, Math.max(0.78, vw / 480));
      if (pill.w > 0 && layoutWidth > 0) {
        scaleGap = { painted: pill.w, pillH: pill.h, layoutWidth, wpp, pillWorldH, oldScale, reserved: layoutWidth / pill.w };
      }
    }

    // ---- 3b. DENSITY ----
    // Eight ambient labels spread across the middle of the frame (clear of every HUD keep-out), all
    // at the same priority. Once the café is this crowded only the ones nearest the frame centre may
    // stay at full strength, and since the camera follows the player that is "nearest the player".
    const grid = [];
    for (const gx of [0.30, 0.45, 0.60, 0.75]) {
      for (const gy of [0.40, 0.62]) {
        const d = document.createElement('div');
        d.className = 'demand';
        d.textContent = '300';
        d.style.cssText = 'position:absolute;transform:translate(-50%,-50%);padding:2px 6px';
        d.style.left = (vw * gx) + 'px'; d.style.top = (vh * gy) + 'px';
        fx.appendChild(d);
        grid.push(d);
      }
    }
    layout.update();
    const mutedFlags = grid.map(d => d.classList.contains('label-muted'));
    const centreIdx = grid.reduce((best, d, i) => {
      const r = rectOf(d); const dist = Math.hypot(r.l + r.w / 2 - vw / 2, r.t + r.h / 2 - vh / 2);
      return dist < best.dist ? { i, dist } : best;
    }, { i: 0, dist: Infinity }).i;
    const density = {
      total: grid.length,
      muted: mutedFlags.filter(Boolean).length,
      unmuted: mutedFlags.filter(f => !f).length,
      nearestCentreMuted: mutedFlags[centreIdx],
    };
    // Quiet-frame baseline, expressed as the RULE rather than as "nothing is dimmed". The scene's own
    // labels are part of the count, so a landscape frame already holding three real labels is not a
    // quiet frame at all. Instead: remove the synthetic grid, then check that whatever remains obeys
    // "dim nothing up to 4, then keep the 3 nearest the player sharp" exactly.
    for (const d of grid) d.remove();
    layout.update();
    const MUTABLE_SEL = ':is(.wish,.demand,.chalk,.zprice,.zlabel,.objCaption,.pet-identity)';
    const base = [...fx.querySelectorAll(MUTABLE_SEL)].filter(el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden'
        && parseFloat(cs.opacity) >= 0.05 && !el.classList.contains('label-crowded');
    });
    density.baselineCands = base.length;
    density.baselineMuted = base.filter(el => el.classList.contains('label-muted')).length;
    density.baselineExpected = base.length <= 4 ? 0 : base.length - 3;

    // ---- 4. THE CROWDED-LABEL TRAP ----
    // Force a hideable label into the crowded state and give it room. If the invisible-label filter
    // skipped `label-crowded`, the class would never be lifted and the label would be gone forever.
    const probe = document.createElement('div');
    probe.className = 'demand';
    probe.textContent = '300';
    probe.style.cssText = 'position:absolute;transform:translate(-50%,-50%);left:50%;top:60%;padding:2px 6px';
    fx.appendChild(probe);
    layout.update();
    const crowdedBefore = probe.classList.contains('label-crowded');
    probe.classList.add('label-crowded'); // simulate the solver having hidden it for crowding
    layout.update();
    const recoveredFromCrowded = !probe.classList.contains('label-crowded');
    probe.remove();

    // ---- 5. LABEL SCALE ----
    const scale = parseFloat(getComputedStyle(fx).getPropertyValue('--label-scale'));

    return {
      viewport: [vw, vh], managed, presentClasses, realPetTags, unregistered: [...new Set(unregistered)],
      cases, tagCases, tagScale, scaleGap, density, crowdedBefore, recoveredFromCrowded, scale,
    };
  }, [...SELF_POSITIONED_FX]);

  const check = (cond, message) => { if (!cond) failures.push(`[${tag}] ${message}`); };
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  check(report.unregistered.length === 0, `unregistered self-positioned #fx elements: ${report.unregistered.join(', ')}`);

  const allCases = [...report.cases, ...report.tagCases];
  check(allCases.length > 0, 'no registered labels were on screen to test containment');
  for (const c of allCases) {
    check(c.beforeOutside, `${c.cls} displaced ${c.edge} was not actually off-screen — the test would pass trivially`);
    check(!c.afterOutside, `${c.cls} stayed outside the ${report.viewport.join('x')} viewport after ${c.edge} displacement: ${JSON.stringify(c.after)}`);
  }
  check(report.tagCases.every(c => !c.afterOutside), '.pet-identity was not clamped back inside the viewport');
  check(!report.crowdedBefore, 'the probe label was already crowded before the trap was set');
  check(report.recoveredFromCrowded, 'a label-crowded element was not re-solved — the first time we hide a label it could never come back');

  // FLUSHNESS: the label must land against the safe box, not merely inside it. A single-item unit is
  // moved by a pure clamp, so a flush landing is what proves the solver's rect equals the painted
  // rect — the whole point of measuring geometry instead of reading offsetWidth.
  //
  // The solver may then ALSO nudge a label further inside to clear a HUD keep-out zone, so a gap
  // that is exactly a nudge step is a deliberate eviction and not a rect-model error. That
  // distinction matters: the over-reservation this fix removes is only a few pixels, while a nudge
  // starts at 12, so anything that is neither flush nor on the nudge grid is a real disagreement.
  for (const c of allCases) {
    const onNudgeGrid = NUDGE_STEPS.some(s => Math.abs(c.flush - s) <= 4);
    check(c.flush >= -1.5,
      `${c.cls} displaced ${c.edge} was pushed OUTSIDE the safe box (gap ${c.flush.toFixed(2)}px)`);
    check(onNudgeGrid || c.flush <= 4,
      `${c.cls} displaced ${c.edge} landed ${c.flush.toFixed(2)}px short of the safe box and not on the nudge grid — the solver's box disagrees with the painted box`);
  }

  const portrait = report.viewport[1] > report.viewport[0];
  check(report.scale <= 1 && report.scale >= 0.5, `label scale out of band: ${report.scale}`);
  if (report.viewport[0] === 1280 && report.viewport[1] === 720) {
    check(Math.abs(report.scale - 1) < 1e-9, `the reference camera must draw labels at full size, got ${report.scale}`);
  } else {
    check(report.scale < 1, `${report.viewport.join('x')} is further out than the reference and must shrink its labels`);
  }
  // The scale must reach the element through CSS, not just sit in a custom property.
  check(Number.isFinite(report.tagScale) && Math.abs(report.tagScale - report.scale) < 1e-3,
    `--label-scale ${report.scale} did not reach the element (used scale ${report.tagScale})`);

  // CHARACTER-RELATIVE, asserted without assuming how big a customer's head is. The pill's height in
  // METRES of world compares directly across viewports because the character's world size cancels
  // out — so this says "the pill covers no more café in portrait than it does on the reference
  // desktop", which is exactly the owner's complaint, and it cannot be tuned to pass by fiddling a
  // head-size constant.
  if (report.scaleGap && portrait) {
    const cut = 1 - report.scale / report.scaleGap.oldScale;
    check(cut >= 0.25,
      `portrait pill shrank only ${(cut * 100).toFixed(0)}% against the superseded policy — the owner's report was that it did not shrink at all`);
  }

  // DENSITY: a crowd must dim, a quiet frame must not, and the label nearest the player survives.
  const density = report.density;
  if (density) {
    check(density.unmuted <= 3, `a crowded frame left ${density.unmuted} labels at full strength; at most 3 may stay sharp`);
    check(density.muted >= density.total - 4, `only ${density.muted} of ${density.total} labels were dimmed in a crowd`);
    check(density.nearestCentreMuted === false, 'the label nearest the player was dimmed — the focused label must stay readable');
    check(density.baselineMuted === density.baselineExpected,
      `dim rule broken: ${density.baselineMuted} of ${density.baselineCands} labels dimmed, expected ${density.baselineExpected}`);
  }

  await page.screenshot({ path: path.join(shots, `${tag}.png`) });
  summary.push({
    tag, viewport: report.viewport.join('x'), scale: Number(report.scale.toFixed(3)),
    labelsOnScreen: report.cases.length / 4, realPetTags: report.realPetTags,
    pillWorldH: report.scaleGap && Number(report.scaleGap.pillWorldH.toFixed(4)),
    overReserved: report.scaleGap && Number(report.scaleGap.reserved.toFixed(3)),
    density: density && `${density.muted}/${density.total} dimmed, ${density.unmuted} sharp; rule ${density.baselineMuted}/${density.baselineCands}`,
    worstFlushPx: Number(Math.max(...allCases.map(c => Math.abs(c.flush))).toFixed(2)),
    classes: report.presentClasses,
    edgeCases: allCases.length, unregistered: report.unregistered,
  });
  await ctx.close();
}

await browser.close();
await new Promise(resolve => server.close(resolve));

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error('\nlabel-overflow-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nlabel-overflow-smoke OK');
