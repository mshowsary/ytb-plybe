// Task 04 hard gate for the complete end-of-shift transition + reload contract.
//
// Continue, Escape, backdrop, close and rapid double input must all converge on exactly one guarded
// terminal -> next-morning mutation. A persisted settled terminal shift must reopen display-only,
// preserve the committed settlement, then use the same guarded transition after Continue.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing; run npm run build first');
const shots = path.resolve('shots-production', 'transition');
const reports = path.resolve('reports-production');
fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(reports, { recursive: true });

const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b);
  });
});
await new Promise(resolve => server.listen(4182, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const harnessErrors = [];

async function makePage() {
  const ctx = await browser.newContext({ viewport:{ width:450, height:800 }, deviceScaleFactor:1.5, hasTouch:true });
  const page = await ctx.newPage();
  page.on('pageerror', e => harnessErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') harnessErrors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ status:200, contentType:'text/javascript', body:'window.ytgame={IN_PLAYABLES_ENV:false};' }));
  await page.goto('http://127.0.0.1:4182/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });
  return { ctx, page };
}

async function forceSettledSummary(page) {
  await page.evaluate(() => {
    const g = window.__game;
    g.coins = 1000;
    g.dayStats = { served: 99, lost: 0, earned: 1180, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 14 };
    g.shiftBestStreak = 14;
    const d = g.dayState; d.day = 1; d.t = 239.99; d.phase = 'closing'; d._ended = false;
  });
  await page.waitForFunction(() => !!document.querySelector('.sheet-root .card .continue'), null, { timeout:5000 });
  await page.waitForTimeout(120);
}

async function state(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const h = g.meta?.career?.history?.[1] || null;
    return {
      day: g.dayState.day,
      t: +g.dayState.t.toFixed(3),
      ended: !!g.dayState._ended,
      phase: g.dayState.phase,
      coins: g.coins,
      completedDays: g.meta.completedDays | 0,
      reputation: g.meta.reputation | 0,
      history: h ? JSON.stringify(h) : null,
      summaryVisible: !!document.querySelector('.sheet-root .card') && !document.querySelector('.sheet-root').classList.contains('hidden'),
      dayStats: { ...g.dayStats },
    };
  });
}

function transitionContract(before, after) {
  const stats = after.dayStats || {};
  return {
    advancedExactlyOne: after.day === before.day + 1,
    // The live render/update loop resumes immediately after the transition. Observe a bounded slice
    // of the new morning instead of requiring an impossible frozen t===0 snapshot 420ms later.
    resetForPlay: after.ended === false && after.phase === 'morning' && after.t >= 0 && after.t <= 0.75,
    dayStatsReset: ['served','lost','earned','serviceFees','serviceMisses','wasteFees','bestStreak'].every(k => (stats[k] | 0) === 0),
    summaryClosed: after.summaryVisible === false,
    noDuplicateSettlement: after.coins === before.coins && after.reputation === before.reputation && after.history === before.history,
  };
}

const actions = {
  continue: page => page.click('.sheet-root .continue'),
  escape: page => page.keyboard.press('Escape'),
  backdrop: page => page.evaluate(() => document.querySelector('.sheet-root .backdrop')?.click()),
  // Dispatch the active summary's real close handler directly so this gate tests transition semantics
  // rather than animation hit-testing. Missing the affordance is itself a hard regression.
  close: page => page.evaluate(() => {
    const b = document.querySelector('.sheet-root .card .sclose');
    if (!b) throw new Error('active summary close affordance missing');
    b.click();
  }),
  doubleContinue: page => page.evaluate(() => { const b = document.querySelector('.sheet-root .continue'); b?.click(); b?.click(); }),
};

const cases = [];
for (const name of Object.keys(actions)) {
  const { ctx, page } = await makePage();
  try {
    await forceSettledSummary(page);
    if (name === 'continue') await page.screenshot({ path:path.join(shots, '00-summary-controls.png') });
    const before = await state(page);
    await actions[name](page);
    await page.waitForTimeout(420);
    const after = await state(page);
    const contract = transitionContract(before, after);
    if (name === 'escape') await page.screenshot({ path:path.join(shots, '01-after-escape.png') });
    cases.push({ name, before, after, contract, passes: Object.values(contract).every(Boolean) });
  } finally { await ctx.close(); }
}

const first = await makePage();
let reloadCase;
try {
  await forceSettledSummary(first.page);
  const before = await state(first.page);
  const save = await first.page.evaluate(() => window.__game.snapshot());
  const second = await makePage();
  try {
    await second.page.evaluate(s => window.__game.restore(s), save);
    await second.page.waitForTimeout(300);
    const restored = await state(second.page);
    await second.page.screenshot({ path:path.join(shots, '02-restored-terminal.png') });
    const preservedSettlement = restored.day === before.day && restored.ended === true && restored.coins === before.coins && restored.reputation === before.reputation && restored.history === before.history;
    const reopenedSummary = restored.summaryVisible === true;
    let afterContinue = null, continueContract = null;
    if (reopenedSummary) {
      await second.page.click('.sheet-root .continue'); await second.page.waitForTimeout(420);
      afterContinue = await state(second.page); continueContract = transitionContract(restored, afterContinue);
    }
    reloadCase = {
      before, restored, preservedSettlement, reopenedSummary, afterContinue, continueContract,
      passes: preservedSettlement && reopenedSummary && !!continueContract && Object.values(continueContract).every(Boolean),
    };
  } finally { await second.ctx.close(); }
} finally { await first.ctx.close(); }

const hardGateRegressions = cases.filter(c => !c.passes).map(c => c.name);
if (!reloadCase.passes) hardGateRegressions.push('reloadSummary');
const report = {
  contract: 'All live summary exits converge on exactly one transition; settled reload reopens display-only without another award and continues through the same transition.',
  task03HardGate: true,
  task04HardGate: true,
  cases,
  hardGateRegressions,
  reloadCase,
  harnessErrors,
};
fs.writeFileSync(path.join(reports, 'shift-transition-regression.json'), JSON.stringify(report, null, 2));

console.log('Pet Café — SHIFT TRANSITION + RELOAD HARD GATE (Task 04)');
for (const c of cases) {
  const failed = Object.entries(c.contract).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(`${c.name.padEnd(14)} ${c.passes ? 'PASS' : 'FAIL'}${failed.length ? ' — ' + failed.join(', ') : ''}`);
}
console.log(`reloadSummary  ${reloadCase.passes ? 'PASS' : 'FAIL'} — preserved=${reloadCase.preservedSettlement} reopened=${reloadCase.reopenedSummary}`);
console.log(`Task 04 hard regressions: ${hardGateRegressions.length ? hardGateRegressions.join(', ') : 'none'}`);
console.log('SHIFT_TRANSITION_JSON ' + JSON.stringify(report));

await browser.close(); await new Promise(resolve => server.close(resolve));
if (harnessErrors.length || hardGateRegressions.length) process.exit(1);