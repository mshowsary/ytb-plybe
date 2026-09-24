// Browser regression for the low-noise first-use interaction coach. It must appear only after a
// short linger at an unfamiliar explicit action, fit the phone viewport, disappear when used, and
// remain suppressed for that action for the rest of the session. It also proves the distinct
// "stay here" treatment for a real dwell/refill interaction without changing the refill mechanic.
//
// EXTENDED for Batch F (docs/SHIP-PLAN-2026-09-19.md §1.8): ROUTE MODE IS GONE, and the last
// section proves it. placeAtWorld used to CLAMP an off-screen target into the viewport, so a
// latched refill lesson pinned a hand and a supply glyph to the top border for tens of seconds —
// measured once sitting on the restroom roof while pointing at the cold pantry behind it, beside
// the objective's own edge arrow (research/onboarding, 2026-09-19). A ghost hand is a gesture made
// ON something: with the target off screen there is nothing to gesture at and the coach shows
// nothing at all. The tap and hold sections below are unchanged.
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
await page.evaluate(() => {
  const G = window.__game;
  G.intro.step = 5; G.intro.active = false;
  // First Look owns the screen while it teaches and parks this coach while it does (by design).
  // This file is about the coach, so the lessons are counted as already shown.
  G.firstLook.skipAll();
});

// The staff desk is the one explicit tap action left in the world (the upgrade kiosk went with
// Batch C, docs/SHIP-PLAN-2026-09-19.md 1.4), so it is the station that proves the tap coach.
// It needs its zone built first; nothing else about the opening shift is manufactured.
await page.evaluate(() => {
  const G = window.__game;
  G.world.stations.get('hire1').active = true;
  const st = G.world.stations.get('hire1');
  G.setMove(null, null); G.P.x = st.front.x; G.P.z = st.front.z; G.P.vx = 0; G.P.vz = 0;
  G.owner.group.position.set(G.P.x, 0, G.P.z);
});
await page.waitForFunction(() => {
  const b = document.querySelector('.fbtn');
  // textContent concatenates the screen-reader label and the visible word ('STAFFHIRE'), so this
  // matches rather than compares.
  return b && !b.classList.contains('hidden') && /HIRE/.test(b.textContent);
}, null, { timeout:5000 });

// The coach intentionally does not flash immediately when the player merely crosses the trigger.
await page.waitForTimeout(120);
if (await page.locator('.interaction-coach:not(.hidden)').count()) throw new Error('interaction coach flashed before dwell threshold');
// sim/mechanicLearning.js holds the cue back for COACH_PULSE_AFTER (3 s) of dwell, so 2.5 s was
// never long enough. It went unnoticed because the assertion above this one had been failing
// first ever since the action button gained its screen-reader label span.
await page.waitForFunction(() => document.querySelector('.interaction-coach') && !document.querySelector('.interaction-coach').classList.contains('hidden'), null, { timeout:8000 });

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
await page.screenshot({ path:path.join(shots,'01-desk-first-use.png') });

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
  const G=window.__game, st=G.world.stations.get('hire1'); G.P.x=st.front.x; G.P.z=st.front.z; G.P.vx=0; G.P.vz=0;
});
await page.waitForTimeout(800);
if (await page.locator('.interaction-coach:not(.hidden)').count()) throw new Error('used staff-desk coach returned in the same session');
if (!await page.evaluate(() => window.__interactionCoach.hasSeen('hire'))) throw new Error('hire action was not marked seen');

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

// Batch F: an off-screen refill target draws NOTHING. Put the coffee machine dry with a guest
// waiting on it — the exact state the old lesson latched onto — and stand the owner on the far side
// of the café so the machine is outside the frame. The old code answered that with a hand clamped
// to the border; the new one answers with silence and lets the objective's single edge arrow say
// "over there".
const offScreen = await page.evaluate(async () => {
  const G = window.__game, S = window.__scene;
  const st = G.world.stations.get('coffee1');
  st.active = true; st.beans = 0; st.stock = 0;
  G.carry.sack = null; G.carry.sackLeft = 0; G.owner.clearItems();
  window.__interactionCoach.restoreLearning(null);   // un-prove the refill lesson
  G.firstLook.skipAll();
  // The far corner of the room, away from every station front so no tap or hold cue is in range.
  G.P.x = 8.6; G.P.z = 5.4; G.P.vx = 0; G.P.vz = 0;
  G.owner.group.position.set(G.P.x, 0, G.P.z);
  S.snap(G.P.x, G.P.z);
  for (let i = 0; i < 12 * 30; i++) { G._force = null; G.update(1 / 30); }
  window.__interactionCoach.update(1 / 30);
  const tmp = { sx: 0, sy: 0, visible: true };
  G.fx.project(st.front.x, 1.3, st.front.z, tmp);
  const c = document.querySelector('.interaction-coach');
  const r = c ? c.getBoundingClientRect() : null;
  return {
    machineOnScreen: tmp.visible,
    distance: Math.round(Math.hypot(G.P.x - st.front.x, G.P.z - st.front.z) * 10) / 10,
    beans: st.beans,
    coachVisible: !!c && !c.classList.contains('hidden'),
    mode: c ? c.dataset.mode : null,
    rect: r ? { left: Math.round(r.left), top: Math.round(r.top) } : null,
    routeClassExists: !!c && c.classList.contains('route-mode'),
  };
});
// The room is 20x14 and a phone in portrait frames a tall slice of it, so a station is not reliably
// out of frame from anywhere the owner can stand. What matters is not the projection: it is that a
// dry machine the owner is nowhere near draws NO HAND. That is the whole of route mode's job.
if (!(offScreen.distance > 4)) throw new Error(`the probe did not get the owner away from the machine: ${JSON.stringify(offScreen)}`);
if (offScreen.beans !== 0) throw new Error(`the machine refilled itself, so nothing was being asked for: ${JSON.stringify(offScreen)}`);
if (offScreen.coachVisible) throw new Error(`a coach hand is still drawn for a refill target the owner is ${offScreen.distance} m from: ${JSON.stringify(offScreen)}`);
if (offScreen.routeClassExists) throw new Error('route mode is still applied to the coach element');
await page.screenshot({ path:path.join(shots,'03-distant-refill-no-hand.png') });

console.log(JSON.stringify({ tap:{ shown, suppressedAfterUse:true }, hold:{ beforeRefill, learned:true, suppressedAfterUse:true }, offScreen }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
