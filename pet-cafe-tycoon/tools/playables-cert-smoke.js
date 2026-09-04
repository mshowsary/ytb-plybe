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

function mockSdk() {
  return `
    window.__yt = { paused:false, audio:true, saves:0 };
    window.ytgame = {
      IN_PLAYABLES_ENV:true,
      game:{
        firstFrameReady(){ window.__yt.firstFrame=true; },
        gameReady(){ window.__yt.gameReady=true; },
        async loadData(){ window.__yt.loaded=true; return ''; },
        async saveData(){ window.__yt.saves++; return true; }
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

async function visibleTargets(page, rootSelector = 'body') {
  return page.evaluate(rootSel => {
    const root = document.querySelector(rootSel) || document.body;
    const out = [];
    for (const el of root.querySelectorAll('button,[role="button"]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push({ cls:el.className || el.id || el.tagName, text:(el.textContent || '').trim().slice(0,40), width:r.width, height:r.height,
        fits:r.left>=-1 && r.top>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1 });
    }
    return out;
  }, rootSelector);
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
function validateTargets(targets, label) {
  for (const t of targets) {
    if (!t.fits) throw new Error(`${label}: interactive control outside viewport ${JSON.stringify(t)}`);
    if (t.height < 47.5) throw new Error(`${label}: touch target under 48px high ${JSON.stringify(t)}`);
  }
}

for (const [tag,width,height] of cases) {
  const ctx = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:1, hasTouch:true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk() }));
  await page.goto('http://127.0.0.1:4176/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__platform && window.__yt.gameReady && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });
  await page.waitForTimeout(300);

  const boot = await snapshot(page); validateLayout(boot, `${tag} boot`);
  const bootTargets = (await visibleTargets(page)).filter(t => /pause-btn|meta-reputation|meta-pawbook|party-order-btn|skipPill|fbtn/.test(String(t.cls)));
  validateTargets(bootTargets, `${tag} boot`);
  await page.screenshot({ path:path.join(shots, `01-${tag}-boot.png`) });

  // User pause: time, rendering, global CSS motion and procedural audio all freeze.
  await page.click('.pause-btn');
  await page.waitForFunction(() => window.__game.userPaused === true && document.body.classList.contains('game-paused'));
  const userBefore = await page.evaluate(() => ({ t:window.__game.dayState.t, frame:window.__scene.renderer.info.render.frame || 0 }));
  await page.waitForTimeout(500);
  const userPause = await page.evaluate(before => ({
    dt:window.__game.dayState.t-before.t,
    renderDelta:(window.__scene.renderer.info.render.frame || 0)-before.frame,
    audioPaused:window.__audio.paused,
    bodyPaused:document.body.classList.contains('game-paused'),
    music:window.__game.settings.music,
    sfx:window.__game.settings.sfx,
  }), userBefore);
  if (Math.abs(userPause.dt) > 0.001 || userPause.renderDelta !== 0 || !userPause.audioPaused || !userPause.bodyPaused) throw new Error(`${tag}: user pause did not fully freeze ${JSON.stringify(userPause)}`);
  const pauseLayout = await snapshot(page, '.pause-card'); validateLayout(pauseLayout, `${tag} pause`);
  validateTargets(await visibleTargets(page, '.pause-card'), `${tag} pause`);
  await page.screenshot({ path:path.join(shots, `02-${tag}-pause.png`) });
  await page.click('[data-action="resume"]');
  await page.waitForFunction(() => !window.__game.userPaused && !document.body.classList.contains('game-paused'));

  // Host pause: no simulation, rendering, audio OR game control interaction may continue.
  await page.evaluate(() => window.__yt.pauseCb());
  await page.waitForFunction(() => window.__platform.paused && document.body.classList.contains('game-paused') && document.body.classList.contains('host-paused'));
  const hostBefore = await page.evaluate(() => ({ t:window.__game.dayState.t, frame:window.__scene.renderer.info.render.frame || 0, userPaused:window.__game.userPaused, saves:window.__yt.saves }));
  await page.evaluate(() => document.querySelector('.pause-btn').click());
  await page.waitForTimeout(450);
  const hostPause = await page.evaluate(before => ({
    dt:window.__game.dayState.t-before.t,
    renderDelta:(window.__scene.renderer.info.render.frame || 0)-before.frame,
    audioPaused:window.__audio.paused,
    userPauseChanged:window.__game.userPaused!==before.userPaused,
    saved:window.__yt.saves>=before.saves,
  }), hostBefore);
  if (Math.abs(hostPause.dt) > 0.001 || hostPause.renderDelta !== 0 || !hostPause.audioPaused || hostPause.userPauseChanged) throw new Error(`${tag}: host pause did not fully freeze ${JSON.stringify(hostPause)}`);
  await page.evaluate(() => window.__yt.resumeCb());
  await page.waitForFunction(() => !window.__platform.paused && !document.body.classList.contains('game-paused') && !document.body.classList.contains('host-paused'));

  // Host audio authority must override local preferences without changing the preferences themselves.
  await page.evaluate(() => window.__yt.audioCb(false));
  const muted = await page.evaluate(() => ({ muted:window.__audio.muted, music:window.__game.settings.music, sfx:window.__game.settings.sfx }));
  if (!muted.muted) throw new Error(`${tag}: host mute not respected`);
  await page.evaluate(() => window.__yt.audioCb(true));

  // Deep menus may scroll vertically but must remain inside the tiny viewport with tappable controls.
  await page.click('.meta-reputation');
  await page.waitForFunction(() => !document.querySelector('.career-root').classList.contains('hidden'));
  const journey = await snapshot(page, '.career-card'); validateLayout(journey, `${tag} journey`);
  validateTargets(await visibleTargets(page, '.career-card'), `${tag} journey`);
  await page.screenshot({ path:path.join(shots, `03-${tag}-journey.png`) });
  await page.click('.career-close');

  await page.click('.meta-pawbook');
  await page.waitForFunction(() => !document.querySelector('.meta-book-root').classList.contains('hidden'));
  const book = await snapshot(page, '.meta-book'); validateLayout(book, `${tag} book`);
  validateTargets(await visibleTargets(page, '.meta-book'), `${tag} book`);
  await page.screenshot({ path:path.join(shots, `04-${tag}-book.png`) });
  await page.click('.meta-book-close');

  // Resize in-place (no reload) and prove state survives orientation/aspect changes.
  const marker = await page.evaluate(() => ({ day:window.__game.dayState.day, coins:window.__game.coins }));
  await page.setViewportSize({ width:height, height:width });
  await page.waitForTimeout(250);
  const resized = await snapshot(page); validateLayout(resized, `${tag} resized`);
  const stateAfterResize = await page.evaluate(() => ({ day:window.__game.dayState.day, coins:window.__game.coins }));
  if (stateAfterResize.day !== marker.day || stateAfterResize.coins !== marker.coins) throw new Error(`${tag}: game state changed on resize`);

  if (errors.length) throw new Error(`${tag}: browser errors: ${errors.join(' | ')}`);
  report.push({ tag, boot, bootTargets, userPause, hostPause, journey:journey.chosen, book:book.chosen, resized:resized.viewport });
  await ctx.close();
}

fs.writeFileSync(path.join(shots, 'cert-report.json'), JSON.stringify(report, null, 2));
await browser.close();
await new Promise(resolve => server.close(resolve));
console.log(JSON.stringify(report, null, 2));
