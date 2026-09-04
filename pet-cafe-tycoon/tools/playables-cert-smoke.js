// Publisher/YouTube certification smoke for extreme viewports and host lifecycle behavior.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'cert');
fs.rmSync(shots, { recursive: true, force: true });
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
await new Promise(resolve => server.listen(4176, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const cases = [
  ['publisher-portrait', 218, 418],
  ['publisher-landscape', 418, 218],
];
const report = [];
let failed = false;

function mockSdk() {
  return `
    window.__yt = { paused:false, audio:true };
    window.ytgame = {
      IN_PLAYABLES_ENV:true,
      game:{
        firstFrameReady(){ window.__yt.firstFrame=true; },
        gameReady(){ window.__yt.gameReady=true; },
        async loadData(){ return ''; },
        async saveData(){ return true; }
      },
      system:{
        isAudioEnabled(){ return window.__yt.audio; },
        onAudioEnabledChange(cb){ window.__yt.audioCb=cb; },
        onPause(cb){ window.__yt.pauseCb=cb; },
        onResume(cb){ window.__yt.resumeCb=cb; },
        getLanguage(){ return 'en'; }
      },
      engagement:{ sendScore(){} },
      ads:{}
    };
  `;
}

async function snapshot(page, selector = null) {
  return page.evaluate(sel => {
    const fits = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
      const r = el.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height,
        fits:r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
    };
    const permanent = ['#wallet','.pause-btn','#dayPill','#crowd.urgent','.meta-reputation','.meta-pawbook','.party-order-btn']
      .map(q => [q, fits(document.querySelector(q))]).filter(([,r]) => r);
    const chosen = sel ? fits(document.querySelector(sel)) : null;
    return {
      viewport:[innerWidth,innerHeight], dataset:document.body.dataset.viewport,
      bodyWidth:document.body.scrollWidth, bodyHeight:document.body.scrollHeight,
      overflowX:document.body.scrollWidth > innerWidth + 1,
      permanent, chosen,
    };
  }, selector);
}

function overlap(a, b) {
  return Math.min(a.right,b.right) - Math.max(a.left,b.left) > 2 && Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top) > 2;
}
function validateLayout(s, label) {
  if (s.overflowX) throw new Error(`${label}: horizontal overflow ${s.bodyWidth} > ${s.viewport[0]}`);
  for (const [q,r] of s.permanent) if (!r.fits) throw new Error(`${label}: ${q} is outside viewport ${JSON.stringify(r)}`);
  for (let i=0;i<s.permanent.length;i++) for (let j=i+1;j<s.permanent.length;j++) {
    const [qa,a] = s.permanent[i], [qb,b] = s.permanent[j];
    if (overlap(a,b)) throw new Error(`${label}: permanent controls overlap: ${qa} / ${qb}`);
  }
  if (s.chosen && !s.chosen.fits) throw new Error(`${label}: modal outside viewport ${JSON.stringify(s.chosen)}`);
}

for (const [tag,width,height] of cases) {
  const ctx = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:1, hasTouch:true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk() }));
  await page.goto('http://127.0.0.1:4176/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__platform && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });
  await page.waitForTimeout(400);

  const boot = await snapshot(page); validateLayout(boot, `${tag} boot`);
  await page.screenshot({ path:path.join(shots, `01-${tag}-boot.png`) });

  // User pause: time, global CSS motion and procedural audio all freeze.
  await page.click('.pause-btn');
  await page.waitForFunction(() => window.__game.userPaused === true && document.body.classList.contains('game-paused'));
  const userBefore = await page.evaluate(() => window.__game.dayState.t);
  await page.waitForTimeout(500);
  const userPause = await page.evaluate(before => ({
    dt:window.__game.dayState.t-before,
    audioPaused:window.__audio.paused,
    bodyPaused:document.body.classList.contains('game-paused'),
    music:window.__game.settings.music,
    sfx:window.__game.settings.sfx,
  }), userBefore);
  if (Math.abs(userPause.dt) > 0.001 || !userPause.audioPaused || !userPause.bodyPaused) throw new Error(`${tag}: user pause did not fully freeze ${JSON.stringify(userPause)}`);
  const pauseLayout = await snapshot(page, '.pause-card'); validateLayout(pauseLayout, `${tag} pause`);
  await page.screenshot({ path:path.join(shots, `02-${tag}-pause.png`) });
  await page.click('[data-action="resume"]');
  await page.waitForFunction(() => !window.__game.userPaused && !document.body.classList.contains('game-paused'));

  // Host pause/resume: same freeze path, independent of the in-game pause button.
  await page.evaluate(() => window.__yt.pauseCb());
  await page.waitForFunction(() => window.__platform.paused && document.body.classList.contains('game-paused'));
  const hostBefore = await page.evaluate(() => window.__game.dayState.t);
  await page.waitForTimeout(450);
  const hostPause = await page.evaluate(before => ({ dt:window.__game.dayState.t-before, audioPaused:window.__audio.paused }), hostBefore);
  if (Math.abs(hostPause.dt) > 0.001 || !hostPause.audioPaused) throw new Error(`${tag}: host pause did not fully freeze ${JSON.stringify(hostPause)}`);
  await page.evaluate(() => window.__yt.resumeCb());
  await page.waitForFunction(() => !window.__platform.paused && !document.body.classList.contains('game-paused'));

  // Host audio authority must override local preferences without changing the preferences themselves.
  await page.evaluate(() => window.__yt.audioCb(false));
  const muted = await page.evaluate(() => ({ muted:window.__audio.muted, music:window.__game.settings.music, sfx:window.__game.settings.sfx }));
  if (!muted.muted) throw new Error(`${tag}: host mute not respected`);
  await page.evaluate(() => window.__yt.audioCb(true));

  // Deep menus are allowed to scroll vertically but must never leak outside the tiny viewport.
  await page.click('.meta-reputation');
  await page.waitForFunction(() => !document.querySelector('.career-root').classList.contains('hidden'));
  const journey = await snapshot(page, '.career-card'); validateLayout(journey, `${tag} journey`);
  await page.screenshot({ path:path.join(shots, `03-${tag}-journey.png`) });
  await page.click('.career-close');

  await page.click('.meta-pawbook');
  await page.waitForFunction(() => !document.querySelector('.meta-book-root').classList.contains('hidden'));
  const book = await snapshot(page, '.meta-book'); validateLayout(book, `${tag} book`);
  await page.screenshot({ path:path.join(shots, `04-${tag}-book.png`) });
  await page.click('.meta-book-close');

  // Resize in-place (no reload) and prove state survives orientation/aspect changes.
  const marker = await page.evaluate(() => ({ day:window.__game.dayState.day, coins:window.__game.coins, t:window.__game.dayState.t }));
  await page.setViewportSize({ width:height, height:width });
  await page.waitForTimeout(250);
  const resized = await snapshot(page); validateLayout(resized, `${tag} resized`);
  const stateAfterResize = await page.evaluate(() => ({ day:window.__game.dayState.day, coins:window.__game.coins }));
  if (stateAfterResize.day !== marker.day || stateAfterResize.coins !== marker.coins) throw new Error(`${tag}: game state changed on resize`);

  if (errors.length) throw new Error(`${tag}: browser errors: ${errors.join(' | ')}`);
  report.push({ tag, boot, userPause, hostPause, journey:journey.chosen, book:book.chosen, resized:resized.viewport });
  await ctx.close();
}

fs.writeFileSync(path.join(shots, 'cert-report.json'), JSON.stringify(report, null, 2));
await browser.close();
await new Promise(resolve => server.close(resolve));
console.log(JSON.stringify(report, null, 2));
if (failed) process.exit(1);
