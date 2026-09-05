// Browser acceptance for pet pawprints + Roomba sweep. Proves the pet-floor chore is zero-penalty,
// the sweep visibly activates, and dirty tables remain untouched (Cleaner value is preserved).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'pet-mess');
fs.mkdirSync(shots, { recursive:true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist,'index.html');
  fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(b); });
});
await new Promise(resolve=>server.listen(4187,'127.0.0.1',resolve));

const mockSdk = `window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(){return true}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},engagement:{sendScore(){}},ads:{async requestRewardedAd(){return true},async requestInterstitialAd(){return true}}};`;
const browser = await chromium.launch({ headless:true,args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{width:390,height:700},deviceScaleFactor:1 });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1',route=>route.fulfill({status:200,contentType:'text/javascript',body:mockSdk}));
await page.goto('http://127.0.0.1:4187/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__game&&window.__petMess&&window.__ready&&document.getElementById('loading').classList.contains('hidden'),null,{timeout:30000});

const seeded = await page.evaluate(() => {
  const G=window.__game, save=G.snapshot();
  save.builds.a1=['z_seats1']; save.dayState={...save.dayState,day:3,phase:'rush',t:45}; save.coins=777;
  G.restore(save); G.dayState.phase='rush';
  const seat1=G.world.stations.get('seat1'), seat2=G.world.stations.get('seat2'); seat1.dirty=true;
  // Day 3 deterministic cadence accepts ids divisible by 3. Advance G.time past the 7s spawn
  // cooldown between synthetic seated events, then clear those events before the sim consumes them.
  const push=(id,seatId,t)=>{G.time=t;G.world.events.push({type:'seated',id,seatId});G.world.events.length=0;};
  push(3,'seat1',100); push(6,'seat2',108); push(9,'seat1',116);
  return {count:window.__petMess.count,coins:G.coins,dirty:seat1.dirty,seat1Active:seat1.active,seat2Active:seat2.active};
});
if (seeded.count !== 3 || seeded.coins !== 777 || !seeded.dirty || !seeded.seat1Active || !seeded.seat2Active) throw new Error(`pet mess seed failed: ${JSON.stringify(seeded)}`);
await page.screenshot({path:path.join(shots,'01-pawprints.png')});

const swept = await page.evaluate(() => {
  const G=window.__game, before=G.coins, cleared=window.__petMess.sweep(18);
  return {cleared,count:window.__petMess.count,active:window.__petMess.roombaActive,coinsBefore:before,coinsAfter:G.coins,dirty:G.world.stations.get('seat1').dirty};
});
if (swept.cleared !== 3 || swept.count !== 0 || !swept.active) throw new Error(`Roomba sweep failed: ${JSON.stringify(swept)}`);
if (swept.coinsAfter !== swept.coinsBefore) throw new Error(`Roomba/pawprints changed coins: ${JSON.stringify(swept)}`);
if (!swept.dirty) throw new Error(`Roomba incorrectly cleaned a table: ${JSON.stringify(swept)}`);
await page.waitForTimeout(450);
await page.screenshot({path:path.join(shots,'02-roomba-active.png')});

const expired = await page.evaluate(() => { const G=window.__game; G.time += 19; return {active:window.__petMess.roombaActive,dirty:G.world.stations.get('seat1').dirty,coins:G.coins}; });
if (expired.active || !expired.dirty || expired.coins !== 777) throw new Error(`Roomba expiry/separation failed: ${JSON.stringify(expired)}`);

console.log(JSON.stringify({seeded,swept,expired},null,2));
await ctx.close(); await browser.close(); await new Promise(resolve=>server.close(resolve));
