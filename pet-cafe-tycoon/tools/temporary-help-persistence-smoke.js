// Task 12 acceptance: host pause and legitimate reload preserve earned temporary help without
// consuming active-simulation time, and a completed-but-deferred entitlement is eventually useful.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'temporary-help');
fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e,b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type':types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
await new Promise(resolve => server.listen(4182, '127.0.0.1', resolve));

const base = {
  v:4, coins:1000, builds:{a1:['z_seats1','z_oven2','z_register2','z_hire','z_coffee','z_bowl','z_blender','z_garden','z_seats2']},
  dayState:{day:4,t:70}, meta:{completedDays:3,reputation:6,rewardedDays:{'relief:4':1}},
};
let loadRaw = JSON.stringify({ ...base, temporaryHelp:{ v:1, roomba:{day:4,remaining:12}, pending:null } });

function sdk() { return `
window.__ytHelp={saved:null,gameReady:false,pauseCb:null,resumeCb:null};
window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ytHelp.gameReady=true},async loadData(){return ${JSON.stringify(loadRaw)}},async saveData(v){window.__ytHelp.saved=v}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(cb){window.__ytHelp.pauseCb=cb},onResume(cb){window.__ytHelp.resumeCb=cb},getLanguage(){return'en'}},engagement:{async sendScore(){}},ads:{}};` }

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{width:390,height:700}, hasTouch:true });
const page = await ctx.newPage(); const errors=[]; page.on('pageerror', e => errors.push(String(e)));
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({status:200,contentType:'text/javascript',body:sdk()}));
const ready = () => page.waitForFunction(() => window.__ytHelp && window.__ytHelp.gameReady && window.__game && window.__ytHelp.pauseCb, null, {timeout:9000});

try {
  await page.goto('http://127.0.0.1:4182/', {waitUntil:'domcontentloaded'}); await ready();
  await page.waitForFunction(() => window.__game.petMess && window.__game.petMess.roombaActive, null, {timeout:3000});
  const before = await page.evaluate(() => ({ time:window.__game.time, remaining:window.__game.petMess.roombaRemaining }));
  if (!(before.remaining > 9 && before.remaining <= 12)) throw new Error(`Roomba restore missing: ${JSON.stringify(before)}`);

  await page.evaluate(() => window.__ytHelp.pauseCb());
  await page.waitForFunction(() => !!window.__ytHelp.saved, null, {timeout:5000});
  await page.waitForTimeout(900);
  const paused = await page.evaluate(() => ({ time:window.__game.time, remaining:window.__game.petMess.roombaRemaining, saved:JSON.parse(window.__ytHelp.saved) }));
  if (Math.abs(paused.time - before.time) > 0.08) throw new Error(`host pause advanced simulation time: ${JSON.stringify({before,paused})}`);
  if (Math.abs(paused.remaining - before.remaining) > 0.12) throw new Error(`host pause burned Roomba reward: ${JSON.stringify({before,paused})}`);
  if (!paused.saved.temporaryHelp || !(paused.saved.temporaryHelp.roomba.remaining > 9)) throw new Error(`pause save lost Roomba remainder: ${JSON.stringify(paused.saved.temporaryHelp)}`);
  loadRaw = window === undefined ? loadRaw : loadRaw;
  loadRaw = await page.evaluate(() => window.__ytHelp.saved);
  await page.screenshot({path:path.join(shots,'01-roomba-paused.png')});

  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  await page.waitForFunction(() => window.__game.petMess && window.__game.petMess.roombaActive, null, {timeout:3000});
  const after = await page.evaluate(() => ({ remaining:window.__game.petMess.roombaRemaining, help:window.__game.snapshot().temporaryHelp }));
  if (!(after.remaining > 8.5 && after.remaining <= paused.remaining + 0.1)) throw new Error(`reload did not preserve Roomba remainder: ${JSON.stringify({paused,after})}`);
  await page.screenshot({path:path.join(shots,'02-roomba-reloaded.png')});

  // Separate seed: an earned Crew reward deferred because the world changed. It must activate at a
  // useful rush moment after reload, not become coins and not expose another ad for the same claim.
  loadRaw = JSON.stringify({
    ...base,
    staff:{cashier:1},
    temporaryHelp:{v:1,pending:{kind:'crew',role:'cashier',earnedDay:4},roomba:null,rushCrew:null,petPlayBreak:null},
  });
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  await page.waitForFunction(() => window.__game.boosts && window.__game.boosts.rushCrew && !window.__game.temporaryHelp.pending, null, {timeout:3000});
  const pendingApplied = await page.evaluate(() => ({
    coins:window.__game.coins,
    boost:window.__game.boosts.rushCrew,
    pending:window.__game.temporaryHelp.pending,
    saved:window.__game.snapshot().temporaryHelp,
  }));
  if (pendingApplied.coins !== 1000) throw new Error(`pending help was refunded as coins: ${JSON.stringify(pendingApplied)}`);
  if (!pendingApplied.boost || pendingApplied.boost.role !== 'cashier' || pendingApplied.boost.day !== 4) throw new Error(`pending Crew not activated: ${JSON.stringify(pendingApplied)}`);
  if (pendingApplied.pending != null) throw new Error(`pending entitlement duplicated after activation: ${JSON.stringify(pendingApplied)}`);
  await page.screenshot({path:path.join(shots,'03-pending-crew-activated.png')});

  fs.writeFileSync(path.join(shots,'temporary-help-report.json'), JSON.stringify({before,paused:{time:paused.time,remaining:paused.remaining},after,pendingApplied}, null, 2));
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({roombaPausePreserved:true,roombaReloadPreserved:true,pendingCrewActivated:true,noCoinRefund:true}, null, 2));
} finally {
  await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
