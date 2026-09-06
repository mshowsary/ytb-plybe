import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const out='artifacts/current-visuals';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const manifest={sha:process.env.GITHUB_SHA||'local',environment:'CI desktop Chromium; not device certification',conditions:{temperature:'unknown',backgroundLoad:'uncontrolled CI runner'},captures:[]};
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const label=`${viewport.width}x${viewport.height}`;
  const context=await browser.newContext({viewport,deviceScaleFactor:1,recordVideo:{dir:`${out}/video`,size:viewport}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.env.PET_CAFE_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__game&&document.querySelector('#loading')?.classList.contains('hidden'));
  const info=await page.evaluate(()=>({userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,dpr:devicePixelRatio}));
  async function shot(state){
   await page.evaluate(()=>window.__performanceCapture.start());
   await page.waitForTimeout(1200);
   const metrics=await page.evaluate(()=>window.__performanceCapture.stop());
   const file=`${state}-${label}.png`;await page.screenshot({path:`${out}/${file}`,fullPage:true});
   manifest.captures.push({state,viewport,file,info,metrics});
  }
  await shot('boot');
  await page.evaluate(()=>{
   const G=window.__game,s=G.snapshot();s.builds.a1=G.world.area.zones.map(z=>z.id);s.partial={};s.coins=25000;
   s.staff={runner:1,cashier:1,cleaner:1,barista:1};s.intro={step:5,active:false};s.dayState={day:4,t:155,phase:'afternoon'};
   if(!G.restore(s))throw new Error('full café fixture rejected');
   G.time=155;G.settings.music=false;G.settings.sfx=false;
  });
  await shot('full-cafe');
  await page.evaluate(()=>{const G=window.__game,p=G.world.stations.get('hire1').front;G.P.x=p.x;G.P.z=p.z;G.setMove(0,0);window.__scene.snap(p.x,p.z);});
  await page.locator('.fbtn',{hasText:'STAFF'}).click();await shot('hire');await page.locator('.sheet .sclose').click();
  await page.evaluate(()=>{const G=window.__game,p=G.world.stations.get('coffee1').front;G.P.x=p.x;G.P.z=p.z;window.__scene.snap(p.x,p.z);for(const id of ['coffee1','barCoffee']){const s=G.world.stations.get(id);s.stock=0;if(id==='coffee1')s.beans=0;}});
  await shot('coffee-empty');
  await page.evaluate(()=>{const G=window.__game;G.dayState.t=75;G.dayState.phase='rush';});await shot('rush');
  await page.evaluate(()=>{const G=window.__game,s=G.snapshot();s.meta.petFriendship={...(s.meta.petFriendship||{}),'cat:0':10};s.meta.career.renovationLevel=5;s.meta.reputation=220;if(!G.restore(s))throw new Error('Bestie fixture rejected');});
  await page.evaluate(()=>{const G=window.__game;G.P.x=8;G.P.z=4.5;window.__scene.snap(8,4.5);});
  await shot('bestie-renovated');
  await page.evaluate(()=>{const G=window.__game,s=G.world.stations.get('oven1');s.stock=12;G.P.x=s.front.x;G.P.z=s.front.z;window.__scene.snap(G.P.x,G.P.z);});
  await page.waitForFunction(()=>window.__game.owner.items.length>0);
  const carried=await page.evaluate(()=>window.__game.owner.items.length);
  await page.evaluate(()=>{const G=window.__game,s=G.world.stations.get('dispCookie');s.stock=0;G.P.x=s.front.x;G.P.z=s.front.z;window.__scene.snap(G.P.x,G.P.z);});
  await page.waitForFunction(n=>window.__game.owner.items.length<n,carried);
  await page.evaluate(()=>window.__game.setMove(null));
  // Actual owner input in the recorded session, rather than teleporting a walking animation.
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(1200);await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(1200);await page.keyboard.up('ArrowLeft');
  await page.evaluate(()=>{const G=window.__game;G.dayState.t=240;G.dayState._ended=false;});
  await page.waitForSelector('.sheet');await shot('summary');
  assert.deepEqual(errors,[],`page errors at ${label}`);
  await context.close();
 }
 await fs.writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
 console.log('CURRENT_VISUAL_CAPTURE_PASS');
}finally{await browser.close();}
