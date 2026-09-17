// tools/day-summary-smoke.js
//
// The day-complete card (src/ui/daySummary.js) at every size the publisher certifies.
//
// What it replaced (day-8 phone recording, 2026-09-17): a collage of six modules that showed the
// day's income as its smallest text, "served" twice, three kinds of star, a contract that said WON
// without saying what it paid, a cryptic "W2 4/24", and a 210-coin ad bonus on a 2,300-coin day.
//
// Pins, at 390x844, 852x393 and the certification extremes 218x418, 418x218 and 183x416:
//   - the card sits wholly inside the viewport and does not scroll sideways
//   - the hero counts up to exactly the day's earnings, and every figure appears once
//   - Continue and the bonus are both visible without scrolling and at least 48 px tall
//   - the close chevron overlaps no row
//   - the bonus is about a third of the day (sim/adPacing.js summaryBonusAmount)
//   - Continue actually finishes the day
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
const PORT = 4197;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error('day-summary-smoke: port ' + PORT + ' is already in use — an environment problem, not a game regression.');
  process.exit(2);
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

const shots = path.resolve('shots-production', 'day-summary');
fs.mkdirSync(shots, { recursive: true });
const failures = [];
const browser = await chromium.launch();
const EARNED = 2471, SERVED = 36;

for (const [w, h] of [[390, 844], [852, 393], [218, 418], [418, 218], [183, 416]]) {
  const tag = w + 'x' + h;
  const check = (cond, msg) => { if (!cond) failures.push('[' + tag + '] ' + msg); };
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', e => failures.push('[' + tag + '] pageerror: ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
  await page.evaluate(({ EARNED, SERVED }) => {
    const G = window.__game;
    G.intro.step = 5; G.intro.active = false; G.intro.target = null;
    G.dayStats.earned = EARNED; G.dayStats.served = SERVED;
    G.dayState.t = 239.95;
    for (let i = 0; i < 6 && !G.dayState._ended; i++) G.update(0.05);
  }, { EARNED, SERVED });
  await page.waitForSelector('.ds-card', { timeout: 10000 });
  await page.waitForTimeout(1300); // let the count-up land

  const m = await page.evaluate(() => {
    const card = document.querySelector('.ds-card');
    const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
    const inView = q => q.l >= -0.5 && q.t >= -0.5 && q.r <= innerWidth + 0.5 && q.b <= innerHeight + 0.5;
    const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const cardR = r(card);
    const cont = card.querySelector('.continue'), bonus = card.querySelector('.ds-bonus'), close = card.querySelector('.sclose');
    const rows = [...card.querySelectorAll('.ds-row')].filter(el => getComputedStyle(el).display !== 'none');
    const text = card.innerText;
    return {
      card: cardR, cardInView: inView(cardR),
      // What a player could see poking out past the card's edge. The card clips sideways overflow
      // (overflow-x: hidden) and long row labels ellipsise by design, so scrollWidth alone would
      // flag invisible sub-pixel slack rather than anything on screen.
      poking: [...card.querySelectorAll('*')].filter(el => {
        const q = el.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return false;
        if (getComputedStyle(el).visibility === 'hidden') return false;
        return q.left < cardR.l - 0.5 || q.right > cardR.r + 0.5;
      }).map(el => el.className || el.tagName).slice(0, 5),
      earned: (card.querySelector('.ds-earned-num') || {}).textContent,
      cont: cont && r(cont), contInView: !!cont && inView(r(cont)) && r(cont).b <= cardR.b + 0.5,
      bonus: bonus && r(bonus), bonusInView: !!bonus && inView(r(bonus)) && r(bonus).b <= cardR.b + 0.5,
      bonusText: bonus ? bonus.textContent.replace(/\s+/g, '') : null,
      closeOverRows: close ? rows.reduce((n, row) => n + overlap(r(close), r(row)), 0) : 0,
      // A row the pinned buttons still sit on once the card is scrolled all the way down is a row
      // the player can never read. (Before scrolling, rows below the fold passing under the pinned
      // buttons is simply how a scrolling card works.)
      actionsOverRows: (() => { const top = card.scrollTop; card.scrollTop = card.scrollHeight; const last = rows[rows.length - 1]; const n = last ? overlap(r(card.querySelector('.ds-actions')), r(last)) : 0; card.scrollTop = top; return n; })(),
      contractShown: rows.some(row => row.classList.contains('ds-contract')),
      truncatedLabels: [...card.querySelectorAll('.ds-title')].filter(el => getComputedStyle(el.closest('.ds-row')).display !== 'none' && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
      servedMentions: (text.match(/\b36\b/g) || []).length,
      rows: rows.length,
      scrolled: card.scrollHeight > card.clientHeight + 1,
    };
  });
  await page.screenshot({ path: path.join(shots, tag + '.png') });

  check(m.cardInView, 'the card is not wholly inside the viewport ' + JSON.stringify(m.card));
  check(m.poking.length === 0, 'elements poke out past the card sideways: ' + m.poking.join(', '));
  check(m.earned === EARNED.toLocaleString('en-US'), 'the hero shows ' + m.earned + ', not the day\'s ' + EARNED);
  // Every row is shown except in the tiniest landscape (418x218), where only the contract fits.
  check(m.contractShown, 'the contract row is not shown');
  check(m.rows === (h <= 260 && w / h >= 1.25 ? 1 : 3), 'unexpected number of visible rows: ' + m.rows);
  check(m.actionsOverRows < 1, 'the pinned buttons cover ' + Math.round(m.actionsOverRows) + ' px² of the rows');
  check(m.truncatedLabels.length === 0, 'row titles are cut off: ' + m.truncatedLabels.join(', '));
  check(m.servedMentions === 1, '"36" guests appears ' + m.servedMentions + ' times on the card');
  check(m.contInView, 'Continue is not visible inside the card without scrolling');
  check(m.cont && m.cont.h >= 47.5, 'Continue is ' + (m.cont && m.cont.h) + ' px tall, under the 48 px tap floor');
  check(m.bonusInView, 'the bonus is not visible inside the card without scrolling');
  check(m.bonus && m.bonus.h >= 47.5, 'the bonus is ' + (m.bonus && m.bonus.h) + ' px tall, under the 48 px tap floor');
  check(m.closeOverRows < 1, 'the close chevron covers ' + Math.round(m.closeOverRows) + ' px² of the rows');
  const bonusCoins = Number(String(m.bonusText || '').replace(/[^\d]/g, ''));
  check(bonusCoins >= EARNED * 0.3 && bonusCoins <= EARNED * 0.4, 'the bonus offers ' + bonusCoins + ' coins on a ' + EARNED + '-coin day');

  const before = await page.evaluate(() => window.__game.dayState.day);
  await page.click('.ds-card .continue');
  await page.waitForFunction(d => window.__game.dayState.day === d + 1 && !document.querySelector('.ds-card'), before, { timeout: 15000 }).catch(() => {});
  const after = await page.evaluate(() => ({ day: window.__game.dayState.day, open: !!document.querySelector('.ds-card') }));
  check(after.day === before + 1 && !after.open, 'Continue did not finish the day (day ' + before + ' -> ' + after.day + ', card open ' + after.open + ')');
  console.log('[' + tag + '] card ' + Math.round(m.card.w) + 'x' + Math.round(m.card.h) + ', earned ' + m.earned + ', bonus ' + bonusCoins + ', continue ' + Math.round(m.cont.h) + 'px, scrolls ' + m.scrolled);
  await page.close();
}

await browser.close();
await new Promise(resolve => server.close(resolve));
if (failures.length) {
  console.error('\nday-summary-smoke FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nday-summary-smoke OK');
