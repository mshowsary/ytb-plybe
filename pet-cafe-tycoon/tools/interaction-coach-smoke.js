// Browser regression for the low-noise first-use interaction coach. It must appear only after a
// short linger at an unfamiliar explicit action, fit the phone viewport, disappear when used, and
// remain suppressed for that action for the rest of the session. It also proves the distinct
// "stay here" treatment for a real dwell/refill interaction without changing the refill mechanic.
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
// station to prove the tap coach without manufacturing inventory or unlock state.
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
  return { mode:document.querySelector('.interaction-coach').dataset.mode, coach:{left:c.left,top:c.top,right:c.right,bottom:c.bottom,width:c.width,height:c.height}, button:{left:b.left,top:b.top,right:b.right,bottom:b.bottom} };
});
if (shown.mode !== 'tap') throw new Error(`explicit action coach used wrong mode: ${JSON.stringify(shown)}`);
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

// Dwell-mode proof: activate the real coffee machine, empty its bean tank, give the owner a bean
// sack and stand just OUTSIDE the 1.3m refill trigger but inside the coach's 1.75m teaching ring.
// Nothing is auto-refilled yet, so the cue gets a clean moment to teach "stay here".
await page.evaluate(() => {
  const G = window.__game, st = G.world.stations.get('coffee1');
  st.active = true; st.beans = 0; st.stock = 0;
  G.owner.clearItems(); G.carry.fruit = 0; G.carry.sack = 'beans'; G.carry.sackLeft = 20;
  const dx = st.front.x - st.x, dz = st.front.z - st.z, len = Math.hypot(dx,dz) || 1;
  G.P.x = st.front.x + dx / len * 1.48; G.P.z = st.front.z + dz / len * 1.48; G.P.vx = 0; G.P.vz = 0;
  G.owner.group.position.set(G.P.x, 0, G.P.z);
});
await page.waitForFunction(() => {
  const c = document.querySelector('.interaction-coach');
  return c && !c.classList.contains('hidden') && c.dataset.mode === 'hold';
}, null, { timeout:2500 });
const beforeRefill = await page.evaluate(() => {
  const G=window.__game, st=G.world.stations.get('coffee1'), c=document.querySelector('.interaction-coach').getBoundingClientRect();
  return { beans:st.beans, sackLeft:G.carry.sackLeft, coach:{left:c.left,top:c.top,right:c.right,bottom:c.bottom,width:c.width,height:c.height} };
});
if (beforeRefill.beans !== 0 || beforeRefill.sackLeft !== 20) throw new Error(`hold cue appeared only after refill already happened: ${JSON.stringify(beforeRefill)}`);
if (beforeRefill.coach.left < -1 || beforeRefill.coach.top < -1 || beforeRefill.coach.right > 321 || beforeRefill.coach.bottom > 569) throw new Error(`hold coach outside viewport: ${JSON.stringify(beforeRefill)}`);
await page.screenshot({ path:path.join(shots,'02-coffee-hold-first-use.png') });

// Enter the existing station dwell radius. The game itself performs the refill; the coach merely
// observes that real state transition and then permanently gets out of the way for this session.
await page.evaluate(() => {
  const G=window.__game, st=G.world.stations.get('coffee1');
  G.P.x=st.front.x; G.P.z=st.front.z; G.P.vx=0; G.P.vz=0; G.owner.group.position.set(G.P.x,0,G.P.z);
});
await page.waitForFunction(() => {
  const G=window.__game, st=G.world.stations.get('coffee1'); return st.beans > 0 || G.carry.sackLeft < 20;
}, null, { timeout:3000 });
await page.waitForFunction(() => {
  const c=document.querySelector('.interaction-coach'); return c && c.classList.contains('hidden') && window.__interactionCoach.hasSeen('refillCoffee');
}, null, { timeout:1500 });

// Recreate the exact useful state and return to the teaching ring. Once learned, it stays silent.
await page.evaluate(() => {
  const G=window.__game, st=G.world.stations.get('coffee1');
  st.beans=0; G.carry.sack='beans'; G.carry.sackLeft=20;
  const dx=st.front.x-st.x,dz=st.front.z-st.z,len=Math.hypot(dx,dz)||1;
  G.P.x=st.front.x+dx/len*1.48; G.P.z=st.front.z+dz/len*1.48; G.P.vx=0; G.P.vz=0;
});
await page.waitForTimeout(650);
if (await page.locator('.interaction-coach:not(.hidden)').count()) throw new Error('learned coffee hold coach returned in the same session');

console.log(JSON.stringify({ tap:{ shown, suppressedAfterUse:true }, hold:{ beforeRefill, learned:true, suppressedAfterUse:true } }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
