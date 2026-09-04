// Production browser acceptance test. Uses game state instead of assuming 60 FPS wall-clock timing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing; run npm run build first');
const shots = path.resolve('shots-production');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist,'index.html');
  fs.readFile(p,(e,b) => { if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(b); });
});
await new Promise(resolve => server.listen(4174,'127.0.0.1',resolve));

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const cases = [['small',320,568,1.5],['portrait',450,800,2],['landscape',1280,720,1]];
const report = [];
let failed = false;

for (const [tag,width,height,dpr] of cases) {
  const ctx = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:dpr, hasTouch:tag!=='landscape' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ status:200, contentType:'text/javascript', body:'window.ytgame={IN_PLAYABLES_ENV:false};' }));
  await page.goto('http://127.0.0.1:4174/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__scene && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });
  await page.waitForTimeout(400);

  const boot = await page.evaluate(() => {
    const rr = window.__scene.renderer.info.render;
    const rect = el => { if(!el) return null; const r=el.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; };
    const isVisible = sel => { const el=document.querySelector(sel); if(!el)return false; const s=getComputedStyle(el); return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&!el.classList.contains('hidden'); };
    return {
      calls:rr.calls, triangles:rr.triangles, platform:!!window.__platform, metaVersion:window.__game.snapshot().v,
      clean:document.body.classList.contains('playables-clean'), compact:document.body.classList.contains('playables-compact'),
      overflow:document.body.scrollWidth>innerWidth+1, wallet:rect(document.querySelector('#wallet')), pause:rect(document.querySelector('.pause-btn')),
      hint:isVisible('#hint'), hands:isVisible('#handsFull'), goal:isVisible('#goalPill'),
    };
  });
  await page.screenshot({ path:path.join(shots,`v2-01-boot-${tag}.png`) });

  let smallChecks = null;
  if (tag === 'small') {
    // User pause must freeze simulation and keep SFX independent when Music is toggled.
    await page.click('.pause-btn');
    await page.waitForFunction(() => window.__game.userPaused && document.body.classList.contains('game-paused'));
    const t0 = await page.evaluate(() => window.__game.dayState.t);
    await page.waitForTimeout(500);
    const pauseFrozen = await page.evaluate(t => Math.abs(window.__game.dayState.t-t)<.001 && window.__audio.paused, t0);
    await page.click('[data-setting="music"]');
    const musicIndependent = await page.evaluate(() => window.__game.settings.music===false && window.__audio.musicEnabled===false && window.__audio.sfxEnabled===true);
    await page.click('[data-setting="music"]');
    await page.click('[data-action="resume"]');
    await page.waitForFunction(() => !window.__game.userPaused && !document.body.classList.contains('game-paused'));

    // Crossing does not spend. A short stop does not spend. Then wait for ACTUAL partial construction.
    await page.evaluate(() => { const g=window.__game,z=g.world.activeZoneList[0]; g.coins=500; g.P.x=z.x;g.P.z=z.z;g.P.vx=0;g.P.vz=0;g.setMove(1,0); });
    await page.waitForTimeout(180);
    const walkPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a,b)=>a+b,0));
    await page.evaluate(() => { const g=window.__game,z=g.world.activeZoneList[0];g.setMove(0,0);g.P.x=z.x;g.P.z=z.z;g.P.vx=0;g.P.vz=0; });
    await page.waitForTimeout(280);
    const earlyPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a,b)=>a+b,0));
    await page.waitForFunction(() => Object.values(window.__game.world.partial).reduce((a,b)=>a+b,0)>0, null, { timeout:4000 });
    const heldPaid = await page.evaluate(() => Object.values(window.__game.world.partial).reduce((a,b)=>a+b,0));
    await page.evaluate(() => window.__game.setMove(null));
    smallChecks = { pauseFrozen,musicIndependent,walkPaid,earlyPaid,heldPaid };
  }

  // Mature café fixture with a genuine same-weekday rival target and every core loop unlocked.
  await page.evaluate(() => {
    const g=window.__game,s=g.snapshot();
    s.coins=6000;s.builds.a1=g.world.area.zones.map(z=>z.id);s.partial={};
    s.staff={runner:2,cashier:1,cleaner:1};
    s.staffLevels={runner:{speed:2,carry:2},cashier:{speed:2},cleaner:{speed:1}};
    s.machineLevels={oven:2,coffee:2,display:2};s.intro={step:5,active:false,target:null};
    s.meta={completedDays:12,rewardedDays:{},reputation:72,perfectShifts:5,bestServiceStreak:18,
      shiftRatings:{1:2,2:3,3:2,4:3,5:3,6:2,7:3,8:2,9:3,10:2,11:3,12:3},
      petBook:{'cat:0':1,'cat:1':1,'cat:2':1,'dog:0':1,'dog:1':1,'bunny:0':1,'bunny:2':1},petDiscoveries:7,
      partyOrders:{nextId:2,completed:1,lastOfferDay:10,active:null},
      career:{history:{
        6:{served:38,lost:1,earned:760,bestStreak:9,rating:2,contractMet:true,points:3},
        7:{served:41,lost:0,earned:860,bestStreak:11,rating:3,contractMet:true,points:4},
        8:{served:43,lost:1,earned:910,bestStreak:12,rating:3,contractMet:true,points:4},
        9:{served:44,lost:0,earned:975,bestStreak:13,rating:3,contractMet:true,points:4},
        10:{served:42,lost:1,earned:940,bestStreak:12,rating:2,contractMet:false,points:2},
        11:{served:46,lost:0,earned:1030,bestStreak:14,rating:3,contractMet:true,points:4},
        12:{served:47,lost:0,earned:1120,bestStreak:15,rating:3,contractMet:true,points:4}},
        weeklyCups:{},trophies:{bronze:0,silver:1,gold:1},recipeSales:{cookie:80,cupcake:42,coffee:96,smoothie:31,treat:45},contractStreak:2,bestContractStreak:5,bestWeekPoints:25,renovationLevel:0}};
    s.dayState={day:13,t:78,phase:'rush',_ended:false};s.dayStats={served:14,lost:1,earned:420,serviceFees:0,serviceMisses:0,wasteFees:0,bestStreak:5};
    g.restore(s);
    for(const [id,product] of [['dispCookie','cookie'],['dispCupcake','cupcake'],['barCoffee','coffee'],['barSmoothie','smoothie']]){const st=g.world.stations.get(id);if(st){st.stock=8;st.product=product;}}
    const bowl=g.world.stations.get('bowl1');if(bowl)bowl.stock=8;
    const o1=g.world.stations.get('oven1');if(o1)o1.stock=8;const o2=g.world.stations.get('oven2');if(o2)o2.stock=8;
    const coffee=g.world.stations.get('coffee1');if(coffee){coffee.stock=8;coffee.beans=12;}
  });
  await page.waitForTimeout(350);
  const goal = await page.evaluate(() => { const g=window.__game; const p=document.querySelector('#goalPill'); return {day:g.dayState.day,kind:g.goal?.kind,target:g.goal?.target,previous:g.goal?.previous,rival:g.goal?.rival,text:p?.textContent||'',visible:p?getComputedStyle(p).display!=='none':false}; });

  await page.click('.meta-reputation');
  await page.waitForFunction(() => !document.querySelector('.career-root').classList.contains('hidden'));
  const journey = await page.evaluate(() => ({days:document.querySelectorAll('.career-day').length,masteries:document.querySelectorAll('.career-master-row').length,reno:!!document.querySelector('.reno-buy'),overflow:document.body.scrollWidth>innerWidth+1}));
  let renovation=null;
  if(tag==='small'){
    const before=await page.evaluate(()=>window.__game.coins);await page.click('.reno-buy');await page.waitForFunction(()=>window.__game.meta.career.renovationLevel===1);
    renovation=await page.evaluate(b=>({level:window.__game.meta.career.renovationLevel,spent:b-window.__game.coins,next:document.querySelector('.reno-name')?.textContent||''}),before);
  }
  await page.screenshot({path:path.join(shots,`v2-02-journey-${tag}.png`)});
  await page.click('.career-close');
  await page.waitForTimeout(1800);

  let interaction=null;
  if(tag==='small'){
    const place=async(id,point='front')=>{await page.evaluate(({id,point})=>{const g=window.__game,st=g.world.stations.get(id),p=st[point]||st.front;g.setMove(0,0);g.P.x=p.x;g.P.z=p.z;g.P.vx=0;g.P.vz=0;},{id,point});await page.waitForTimeout(500);};
    const clear=()=>page.evaluate(()=>{const g=window.__game;g.owner.clearItems();g.carry.sack=null;g.carry.sackLeft=0;g.carry.fruit=0;});

    // Consequential/menu interactions remain explicit.
    await clear();await place('kiosk1');await page.waitForFunction(()=>document.querySelector('.fbtn')?.textContent==='UPGRADES',null,{timeout:5000});await page.click('.fbtn');await page.waitForFunction(()=>!!document.querySelector('.sheet-root .sheet'));await page.evaluate(()=>{const g=window.__game;g.P.x=0;g.P.z=2.5;g.P.vx=g.P.vz=0;});await page.waitForFunction(()=>document.querySelector('.sheet-root').classList.contains('hidden'),null,{timeout:3000});
    await clear();await place('pantry1');await page.waitForFunction(()=>document.querySelector('.fbtn')?.textContent==='SUPPLIES',null,{timeout:5000});await page.click('.fbtn');await page.waitForFunction(()=>document.querySelectorAll('.sheet .sbtn').length>=2);await page.click('.sheet .sbtn');await page.waitForTimeout(300);
    const pantry=await page.evaluate(()=>({sack:window.__game.carry.sack,guide:window.__game.contextGuide?.caption||''}));
    const supplyBefore=await page.evaluate(()=>window.__game.coins);await place('return1');await page.waitForFunction(()=>document.querySelector('.fbtn')?.textContent==='RETURN',null,{timeout:5000});await page.click('.fbtn');await page.waitForTimeout(150);const supply=await page.evaluate(b=>({empty:!window.__game.carry.sack,delta:window.__game.coins-b}),supplyBefore);
    const wasteBefore=await page.evaluate(()=>{const g=window.__game;g.coins=1000;g.carry.fruit=2;return g.coins;});await place('return1');await page.waitForFunction(()=>document.querySelector('.fbtn')?.textContent==='RETURN',null,{timeout:5000});await page.click('.fbtn');await page.waitForTimeout(150);const waste=await page.evaluate(b=>({fruit:window.__game.carry.fruit,spent:b-window.__game.coins,tracked:window.__game.dayStats.wasteFees|0}),wasteBefore);
    await page.evaluate(()=>{const g=window.__game,b=g.world.stations.get('blender1');g.carry.fruit=2;b.fruit=0;b.stock=0;});await place('blender1');await page.waitForFunction(()=>{const g=window.__game,b=g.world.stations.get('blender1');return b.fruit+b.stock>0;},null,{timeout:4000});const blender=await page.evaluate(()=>{const g=window.__game,b=g.world.stations.get('blender1');return{remaining:g.carry.fruit,machine:b.fruit+b.stock};});

    // Flow chores are proximity-only. No COLLECT/CLEAN button and no permanent cash text may exist.
    await clear();
    const cashBefore=await page.evaluate(()=>{const g=window.__game,st=g.world.stations.get('register1');st.pile=206;return g.coins;});
    await place('register1','cash');
    await page.waitForFunction(()=>window.__game.world.stations.get('register1').pile===0,null,{timeout:3000});
    const cash=await page.evaluate(b=>({
      pile:window.__game.world.stations.get('register1').pile,gained:window.__game.coins-b,
      collectVisible:/^COLLECT/.test(document.querySelector('.fbtn')?.textContent||'')&&!document.querySelector('.fbtn')?.classList.contains('hidden'),
      cashLabel:!!document.querySelector('.register-money-badge'),legacyCashLabel:!!document.querySelector('.cash-tray-badge')
    }),cashBefore);

    // No hired cleaner may steal this assertion: temporarily remove staff from the live list.
    const cleanerState=await page.evaluate(()=>{const g=window.__game;const saved=g.staffList.slice();g.staffList.length=0;const st=g.world.stations.get('seat1');st.dirty=true;return saved.map(s=>({kind:s.kind,x:s.x,z:s.z}));});
    await place('seat1');
    await page.waitForFunction(()=>window.__game.world.stations.get('seat1').dirty===false,null,{timeout:3000});
    const cleaning=await page.evaluate(()=>({dirty:window.__game.world.stations.get('seat1').dirty,cleanVisible:(document.querySelector('.fbtn')?.textContent||'')==='CLEAN TABLE'&&!document.querySelector('.fbtn')?.classList.contains('hidden')}));

    const prose=await page.evaluate(()=>{const v=sel=>{const e=document.querySelector(sel);if(!e)return false;const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&!e.classList.contains('hidden');};return{hint:v('#hint'),hands:v('#handsFull'),goal:v('#goalPill')};});
    interaction={pantry,supply,waste,blender,cash,cleaning,prose,cleanerState};await page.evaluate(()=>window.__game.setMove(null));
    await page.screenshot({path:path.join(shots,'v2-03-clean-gameplay-small.png')});
  }

  await page.click('.meta-pawbook');await page.waitForFunction(()=>!document.querySelector('.meta-book-root').classList.contains('hidden'));
  const book=await page.evaluate(()=>({cards:document.querySelectorAll('.meta-pet-card').length,found:document.querySelectorAll('.meta-pet-card:not(.locked)').length,overflow:document.body.scrollWidth>innerWidth+1}));
  await page.screenshot({path:path.join(shots,`v2-04-book-${tag}.png`)});await page.click('.meta-book-close');

  await page.evaluate(()=>{const g=window.__game;g.dayStats={served:42,lost:0,earned:1180,serviceFees:0,serviceMisses:0,wasteFees:0,bestStreak:14};g.shiftBestStreak=14;const d=g.dayState;d.t=239.99;d.phase='closing';d._ended=false;});
  await page.waitForFunction(()=>!!document.querySelector('.sheet-root .card')&&!!document.querySelector('.career-result')&&!!document.querySelector('.meta-rating'),null,{timeout:5000});await page.waitForTimeout(250);
  const summary=await page.evaluate(()=>{const card=document.querySelector('.sheet-root .card'),r=card.getBoundingClientRect();const next=document.querySelector('.career-next-chase');const details=[...document.querySelectorAll('.card .cbody>.srow-sub')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent);return{stars:document.querySelector('.meta-rating-stars')?.textContent||'',result:document.querySelector('.career-result-score')?.textContent||'',cup:document.querySelector('.career-summary-cup')?.textContent||'',reward:!!document.querySelector('.meta-reward-btn'),details,nextVisible:next?getComputedStyle(next).display!=='none':false,fits:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:document.body.scrollWidth>innerWidth+1};});
  await page.screenshot({path:path.join(shots,`v2-05-summary-${tag}.png`)});

  const ui = await page.evaluate(() => ({
    chalkVisible:[...document.querySelectorAll('.chalk')].filter(e=>getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&Number(getComputedStyle(e).opacity)>0).length,
    viewport:document.body.dataset.viewport, compact:document.body.classList.contains('playables-compact')
  }));

  const goalBad=goal.day!==13||goal.kind!=='streak'||goal.target!==10||goal.previous!==9||goal.rival!==true;
  const cleanBad=(width<=600||height<=520) ? goal.visible || ui.chalkVisible!==0 : !goal.visible || !goal.text;
  const smallBad=tag==='small'&&(
    !smallChecks||!smallChecks.pauseFrozen||!smallChecks.musicIndependent||smallChecks.walkPaid!==0||smallChecks.earlyPaid!==0||!(smallChecks.heldPaid>0)||
    !renovation||renovation.level!==1||renovation.spent!==1800||renovation.next!=='Gallery Café'||
    !interaction||interaction.pantry.sack!=='beans'||interaction.pantry.guide!=='COFFEE'||!interaction.supply.empty||interaction.supply.delta!==0||
    interaction.waste.fruit!==0||interaction.waste.spent<=0||interaction.waste.tracked<=0||interaction.blender.machine<=0||
    interaction.cash.pile!==0||interaction.cash.gained!==206||interaction.cash.collectVisible||interaction.cash.cashLabel||interaction.cash.legacyCashLabel||
    interaction.cleaning.dirty||interaction.cleaning.cleanVisible||interaction.prose.hint||interaction.prose.hands||interaction.prose.goal
  );
  const bad=!boot.platform||boot.metaVersion!==4||!boot.clean||boot.overflow||boot.hint||boot.hands||boot.goal||goalBad||cleanBad||
    journey.days!==7||journey.masteries!==5||!journey.reno||journey.overflow||book.cards!==12||book.found<7||book.overflow||
    summary.stars!=='★★★'||summary.result!=='WON ✓'||!summary.cup||!summary.reward||!summary.fits||summary.overflow||summary.details.length>2||summary.nextVisible||smallBad||errors.length;
  if(bad)failed=true;
  report.push({tag,boot,smallChecks,goal,journey,renovation,interaction,book,summary,ui,errors,bad});
  await ctx.close();
}

fs.writeFileSync(path.join(shots,'report-v2.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();await new Promise(resolve=>server.close(resolve));
process.exit(failed?1:0);
