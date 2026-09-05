// Gate A lifecycle acceptance: a real browser must not carry held movement, renderer resize, or
// presentation animation time through YouTube host pause. Resume is stationary until fresh input.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const out = path.resolve('shots-production', 'gate-a-lifecycle');
fs.rmSync(out, { recursive:true, force:true });
fs.mkdirSync(out, { recursive:true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type':types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(resolve => server.listen(4184, '127.0.0.1', resolve));

const sdk = `
  window.__gateA = { pauseCb:null, resumeCb:null, saves:[], ready:false };
  window.ytgame = {
    IN_PLAYABLES_ENV:true,
    game:{
      firstFrameReady(){},
      gameReady(){ window.__gateA.ready=true; },
      async loadData(){ return ''; },
      async saveData(raw){ window.__gateA.saves.push(raw); }
    },
    system:{
      isAudioEnabled(){ return true; },
      onAudioEnabledChange(){},
      onPause(cb){ window.__gateA.pauseCb=cb; },
      onResume(cb){ window.__gateA.resumeCb=cb; },
      getLanguage(){ return 'en'; }
    },
    engagement:{ async sendScore(){} },
    ads:{}
  };
`;

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport:{ width:390, height:700 }, deviceScaleFactor:1, hasTouch:true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:sdk }));

function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

try {
  await page.goto('http://127.0.0.1:4184/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__gateA?.ready && window.__game && window.__scene && window.__gateA.pauseCb && window.__gateA.resumeCb, null, { timeout:9000 });

  // Start a genuine CSS transition before pausing. The presentation scheduler should take ownership
  // of that running browser animation and preserve its timeline until the host resumes.
  await page.evaluate(async () => {
    const el = document.createElement('div');
    el.id = 'gate-a-transition';
    Object.assign(el.style, { position:'fixed', left:'0', top:'0', width:'4px', height:'4px', opacity:'0.01', transform:'translateX(0px)', transition:'transform 1s linear' });
    document.body.appendChild(el);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    el.style.transform = 'translateX(100px)';
  });
  await page.waitForTimeout(140);

  // Hold a real pointer drag long enough for the owner to move, then pause WITHOUT releasing it.
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:41, clientX:170, clientY:420, pointerType:'touch' }));
    c.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, pointerId:41, clientX:220, clientY:420, pointerType:'touch' }));
  });
  await page.waitForTimeout(160);
  const moved = await page.evaluate(() => ({ x:window.__game.P.x, z:window.__game.P.z }));
  const aspectBefore = await page.evaluate(() => window.__scene.camera.aspect);
  const animBeforePause = await page.evaluate(() => {
    const a = document.getElementById('gate-a-transition').getAnimations()[0];
    return a ? { state:a.playState, time:Number(a.currentTime) } : null;
  });
  if (!animBeforePause) throw new Error('test transition was not created');

  await page.evaluate(() => window.__gateA.pauseCb());
  await page.waitForFunction(() => window.__platform.paused === true);
  const pausedPosition = await page.evaluate(() => ({ x:window.__game.P.x, z:window.__game.P.z, vx:window.__game.P.vx, vz:window.__game.P.vz }));
  if (pausedPosition.vx !== 0 || pausedPosition.vz !== 0) throw new Error(`owner velocity not cleared on pause: ${JSON.stringify(pausedPosition)}`);

  // Release/move the old pointer while paused. Capture blocking + input ownership reset means these
  // events cannot seed movement that reappears after resume.
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, pointerId:41, clientX:300, clientY:420, pointerType:'touch' }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:41, clientX:300, clientY:420, pointerType:'touch' }));
  });

  // Resize under pause: camera/render resources must remain untouched until resume.
  await page.setViewportSize({ width:700, height:390 });
  await page.waitForTimeout(260);
  const pausedState = await page.evaluate(() => {
    const a = document.getElementById('gate-a-transition').getAnimations()[0];
    return {
      pos:{ x:window.__game.P.x, z:window.__game.P.z },
      aspect:window.__scene.camera.aspect,
      animation:a ? { state:a.playState, time:Number(a.currentTime) } : null,
      paused:window.__platform.paused,
    };
  });
  if (!pausedState.paused) throw new Error('host pause did not remain active');
  if (distance(pausedState.pos, pausedPosition) > 0.002) throw new Error(`owner moved under pause: ${JSON.stringify({ pausedPosition, pausedState })}`);
  if (Math.abs(pausedState.aspect - aspectBefore) > 0.001) throw new Error(`renderer resized under pause: ${aspectBefore} -> ${pausedState.aspect}`);
  if (!pausedState.animation || pausedState.animation.state !== 'paused') throw new Error(`CSS transition not paused: ${JSON.stringify(pausedState.animation)}`);
  if (Math.abs(pausedState.animation.time - animBeforePause.time) > 35) throw new Error(`CSS transition consumed paused wall time: ${JSON.stringify({ animBeforePause, paused:pausedState.animation })}`);
  await page.screenshot({ path:path.join(out, '01-host-paused.png') });

  await page.evaluate(() => window.__gateA.resumeCb());
  await page.waitForFunction(() => window.__platform.paused === false);
  await page.waitForTimeout(140);
  const resumed = await page.evaluate(() => {
    const a = document.getElementById('gate-a-transition').getAnimations()[0];
    return {
      pos:{ x:window.__game.P.x, z:window.__game.P.z },
      velocity:{ vx:window.__game.P.vx, vz:window.__game.P.vz },
      aspect:window.__scene.camera.aspect,
      animation:a ? { state:a.playState, time:Number(a.currentTime) } : null,
    };
  });
  if (distance(resumed.pos, pausedPosition) > 0.025) throw new Error(`stale held input moved owner after resume: ${JSON.stringify({ pausedPosition, resumed })}`);
  if (resumed.velocity.vx !== 0 || resumed.velocity.vz !== 0) throw new Error(`owner resumed with stale velocity: ${JSON.stringify(resumed.velocity)}`);
  if (Math.abs(resumed.aspect - (700 / 390)) > 0.02) throw new Error(`queued resize did not apply after resume: ${resumed.aspect}`);
  if (!resumed.animation || resumed.animation.time <= pausedState.animation.time + 40) throw new Error(`CSS transition did not continue after resume: ${JSON.stringify({ paused:pausedState.animation, resumed:resumed.animation })}`);

  // Only a fresh post-resume press may move the owner again.
  const beforeFresh = resumed.pos;
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:42, clientX:200, clientY:230, pointerType:'touch' }));
    c.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, pointerId:42, clientX:250, clientY:230, pointerType:'touch' }));
  });
  await page.waitForTimeout(180);
  const afterFresh = await page.evaluate(() => ({ x:window.__game.P.x, z:window.__game.P.z }));
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:42, clientX:250, clientY:230, pointerType:'touch' }));
  });
  if (distance(afterFresh, beforeFresh) < 0.03) throw new Error(`fresh post-resume input did not move owner: ${JSON.stringify({ beforeFresh, afterFresh })}`);
  await page.screenshot({ path:path.join(out, '02-resumed-fresh-input.png') });

  const report = {
    heldMovementBeforePause:moved,
    pausedPosition,
    pausedState,
    resumed,
    freshInputDistance:distance(afterFresh, beforeFresh),
    saveCount:(await page.evaluate(() => window.__gateA.saves.length)),
  };
  fs.writeFileSync(path.join(out, 'gate-a-lifecycle-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
