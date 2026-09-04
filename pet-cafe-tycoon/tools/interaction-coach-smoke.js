// Browser regression for the low-noise first-use interaction coach. It must appear only after a
// short linger at an unfamiliar explicit action, fit the phone viewport, disappear when used, and
// remain suppressed for that action for the rest of the session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'interaction-coach');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});
await new Promise(resolve => server.listen(4178, '127.0.0.1', resolve));

const mockSdk = `
window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(){return true}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},engagement:{sendScore(){}},ads:{}};
`;
const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:320, height:568 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk }));
await page.goto('http://127.0.0.1:4178/', { waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__ready && window.__interactionCoach, null, { timeout:30000 });
await page.evaluate(() => { window.__game.intro.step = 5; window.__game.intro.active = false; });

// Kiosk exists from the opening shift and is an explicit tap action, so it is the cleanest real
// station to prove the coach without manufacturing inventory or unlock state.
await page.evaluate(() => {
  const G = window.__game, st = G.world.stations.get('kiosk1');
  G.setMove(null, null); G.P.x = st.front.x; G.P.z = st.front.z; G.P.vx = 0; G.P.vz = 0;
  G.owner.group.position.set(G.P.x, 0, G.P.z);
});
await page.waitForFunction(() => {
  const b = document.querySelector('.fbtn');
  return b && !b.classList.contains('hidden') && b.textContent.trim() === 'UPGRADES';
}, null, { timeout:5000 });

// The coach intentionally does not flash immediately when the player merely crosses the trigger.
await page.waitForTimeout(120);
if (await page.locator('.interaction-coach:not(.hidden)').count()) throw new Error('interaction coach flashed before dwell threshold');
await page.waitForFunction(() => document.querySelector('.interaction-coach') && !document.querySelector('.interaction-coach').classList.contains('hidden'), null, { timeout:2500 });

const shown = await page.evaluate(() => {
  const c = document.querySelector('.interaction-coach').getBoundingClientRect();
  const b = document.querySelector('.fbtn').getBoundingClientRect();
  return { coach:{left:c.left,top:c.top,right:c.right,bottom:c.bottom,width:c.width,height:c.height}, button:{left:b.left,top:b.top,right:b.right,bottom:b.bottom} };
});
if (shown.coach.left < -1 || shown.coach.top < -1 || shown.coach.right > 321 || shown.coach.bottom > 569) throw new Error(`coach outside viewport: ${JSON.stringify(shown)}`);
const ix = Math.max(0, Math.min(shown.coach.right,shown.button.right)-Math.max(shown.coach.left,shown.button.left));
const iy = Math.max(0, Math.min(shown.coach.bottom,shown.button.bottom)-Math.max(shown.coach.top,shown.button.top));
if (ix * iy > 40) throw new Error(`coach covers action button: ${JSON.stringify(shown)}`);
await page.screenshot({ path:path.join(shots,'01-kiosk-first-use.png') });

await page.locator('.fbtn').click();
await page.waitForFunction(() => {
  const sheet = document.querySelector('.sheet-root');
  const coach = document.querySelector('.interaction-coach');
  return sheet && !sheet.classList.contains('hidden') && coach && coach.classList.contains('hidden');
}, null, { timeout:3000 });

const close = page.locator('.sheet-root .sclose').first();
if (await close.count()) await close.click();
else await page.keyboard.press('Escape');
await page.waitForTimeout(150);

// Walk away and return. The same station must not nag again after a successful action.
await page.evaluate(() => { const G=window.__game; G.P.x=0; G.P.z=2.5; G.P.vx=0; G.P.vz=0; });
await page.waitForTimeout(250);
await page.evaluate(() => {
  const G=window.__game, st=G.world.stations.get('kiosk1'); G.P.x=st.front.x; G.P.z=st.front.z; G.P.vx=0; G.P.vz=0;
});
await page.waitForTimeout(800);
if (await page.locator('.interaction-coach:not(.hidden)').count()) throw new Error('used kiosk coach returned in the same session');
if (!await page.evaluate(() => window.__interactionCoach.hasSeen('kiosk'))) throw new Error('kiosk action was not marked seen');

console.log(JSON.stringify({ shown, suppressedAfterUse:true }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
