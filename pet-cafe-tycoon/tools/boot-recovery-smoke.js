// Focused Task 07 smoke: normal boot, delayed cloud recovery, invalid-save retry, renderer failure.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'boot-recovery');
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
await new Promise(resolve => server.listen(4177, '127.0.0.1', resolve));

function mockSdk(mode) {
  return `
    window.__yt = { firstFrame:false, gameReady:false, loadCalls:0, saves:0, mode:${JSON.stringify(mode)} };
    window.ytgame = {
      IN_PLAYABLES_ENV:true,
      game:{
        firstFrameReady(){ window.__yt.firstFrame=true; },
        gameReady(){ window.__yt.gameReady=true; },
        async loadData(){
          window.__yt.loadCalls++;
          if (window.__yt.mode === 'normal') {
            await new Promise(r => setTimeout(r, 400));
            return '';
          }
          if (window.__yt.mode === 'delayed') {
            await new Promise(r => setTimeout(r, 2600));
            return '';
          }
          if (window.__yt.mode === 'invalid-then-empty') {
            return window.__yt.loadCalls === 1 ? '{bad json' : '';
          }
          return '';
        },
        async saveData(){ window.__yt.saves++; }
      },
      system:{
        isAudioEnabled(){ return true; },
        onAudioEnabledChange(cb){ window.__yt.audioCb=cb; },
        onPause(cb){ window.__yt.pauseCb=cb; },
        onResume(cb){ window.__yt.resumeCb=cb; },
        getLanguage(){ return 'en'; }
      },
      engagement:{ async sendScore(){} },
      ads:{}
    };
  `;
}

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const report = {};

async function openCase(mode, { disableWebgl = false } = {}) {
  const ctx = await browser.newContext({ viewport:{ width:390, height:700 }, deviceScaleFactor:1, hasTouch:true });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  if (disableWebgl) {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (String(type).toLowerCase().startsWith('webgl')) return null;
        return original.call(this, type, ...args);
      };
    });
  }
  await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk(mode) }));
  await page.goto('http://127.0.0.1:4177/', { waitUntil:'domcontentloaded' });
  return { ctx, page, pageErrors };
}

try {
  // Normal: loading shell is acknowledged before cloud resolution; gameReady waits for playable state.
  {
    const { ctx, page, pageErrors } = await openCase('normal');
    await page.waitForFunction(() => window.__yt?.firstFrame === true, null, { timeout:3000 });
    const early = await page.evaluate(() => ({
      firstFrame:window.__yt.firstFrame,
      gameReady:window.__yt.gameReady,
      gameExists:!!window.__game,
      state:document.getElementById('loading').dataset.state,
    }));
    if (!early.firstFrame || early.gameReady || early.gameExists) throw new Error(`normal: readiness ordering wrong ${JSON.stringify(early)}`);
    await page.waitForFunction(() => window.__yt.gameReady && window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout:10000 });
    const ready = await page.evaluate(() => ({ state:document.getElementById('loading').dataset.state, loadCalls:window.__yt.loadCalls, saveProtected:window.__platform.saveProtected }));
    if (ready.state !== 'ready' || ready.loadCalls !== 1 || ready.saveProtected) throw new Error(`normal: final boot wrong ${JSON.stringify(ready)}`);
    await page.screenshot({ path:path.join(shots, '01-normal-ready.png') });
    if (pageErrors.length) throw new Error(`normal page errors: ${pageErrors.join(' | ')}`);
    report.normal = { early, ready };
    await ctx.close();
  }

  // Delayed load: no fresh game is created, writes remain blocked, and retry waits on the same SDK call.
  {
    const { ctx, page, pageErrors } = await openCase('delayed');
    await page.waitForFunction(() => document.getElementById('loading').dataset.state === 'load-pending', null, { timeout:6000 });
    const pending = await page.evaluate(async () => ({
      firstFrame:window.__yt.firstFrame,
      gameReady:window.__yt.gameReady,
      gameExists:!!window.__game,
      loadCalls:window.__yt.loadCalls,
      saveProtected:window.__platform.saveProtected,
      saveResult:await window.__platform.save({ coins:999 }),
      saves:window.__yt.saves,
      label:document.querySelector('#loading .lbl')?.textContent,
    }));
    if (!pending.firstFrame || pending.gameReady || pending.gameExists || pending.loadCalls !== 1 || !pending.saveProtected || pending.saveResult !== false || pending.saves !== 0) {
      throw new Error(`delayed: protection failed ${JSON.stringify(pending)}`);
    }
    await page.screenshot({ path:path.join(shots, '02-delayed-retry.png') });
    await page.click('#loading .boot-retry');
    await page.waitForFunction(() => window.__yt.gameReady && window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout:6000 });
    const recovered = await page.evaluate(() => ({ loadCalls:window.__yt.loadCalls, saveProtected:window.__platform.saveProtected, state:document.getElementById('loading').dataset.state }));
    if (recovered.loadCalls !== 1 || recovered.saveProtected || recovered.state !== 'ready') throw new Error(`delayed: retry raced or failed ${JSON.stringify(recovered)}`);
    await page.screenshot({ path:path.join(shots, '03-delayed-recovered.png') });
    if (pageErrors.length) throw new Error(`delayed page errors: ${pageErrors.join(' | ')}`);
    report.delayed = { pending, recovered };
    await ctx.close();
  }

  // Invalid save: show an explicit non-destructive state; only a later clean SDK response may continue.
  {
    const { ctx, page, pageErrors } = await openCase('invalid-then-empty');
    await page.waitForFunction(() => document.getElementById('loading').dataset.state === 'invalid-save', null, { timeout:4000 });
    const invalid = await page.evaluate(async () => ({
      gameExists:!!window.__game,
      gameReady:window.__yt.gameReady,
      loadCalls:window.__yt.loadCalls,
      saveProtected:window.__platform.saveProtected,
      saveResult:await window.__platform.save({ fresh:true }),
      saves:window.__yt.saves,
    }));
    if (invalid.gameExists || invalid.gameReady || invalid.loadCalls !== 1 || !invalid.saveProtected || invalid.saveResult !== false || invalid.saves !== 0) {
      throw new Error(`invalid: unsafe fresh-session fallback ${JSON.stringify(invalid)}`);
    }
    await page.screenshot({ path:path.join(shots, '04-invalid-save.png') });
    await page.click('#loading .boot-retry');
    await page.waitForFunction(() => window.__yt.gameReady && window.__game, null, { timeout:6000 });
    const recovered = await page.evaluate(() => ({ loadCalls:window.__yt.loadCalls, saveProtected:window.__platform.saveProtected }));
    if (recovered.loadCalls !== 2 || recovered.saveProtected) throw new Error(`invalid: explicit retry did not recover ${JSON.stringify(recovered)}`);
    if (pageErrors.length) throw new Error(`invalid page errors: ${pageErrors.join(' | ')}`);
    report.invalid = { invalid, recovered };
    await ctx.close();
  }

  // Renderer unavailable: loader becomes a clear reload state instead of spinning forever.
  {
    const { ctx, page, pageErrors } = await openCase('normal', { disableWebgl:true });
    await page.waitForFunction(() => document.getElementById('loading').dataset.state === 'renderer-unavailable', null, { timeout:5000 });
    const renderer = await page.evaluate(() => ({
      firstFrame:window.__yt.firstFrame,
      gameReady:window.__yt.gameReady,
      gameExists:!!window.__game,
      state:document.getElementById('loading').dataset.state,
      action:document.querySelector('#loading .boot-retry')?.textContent,
      message:document.querySelector('#loading .boot-detail')?.textContent,
    }));
    if (!renderer.firstFrame || renderer.gameReady || renderer.gameExists || renderer.state !== 'renderer-unavailable' || renderer.action !== 'RELOAD') {
      throw new Error(`renderer: fallback state wrong ${JSON.stringify(renderer)}`);
    }
    await page.screenshot({ path:path.join(shots, '05-renderer-unavailable.png') });
    if (pageErrors.length) throw new Error(`renderer page errors: ${pageErrors.join(' | ')}`);
    report.renderer = renderer;
    await ctx.close();
  }

  fs.writeFileSync(path.join(shots, 'boot-recovery-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
