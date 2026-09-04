// Real-world ultra-narrow portrait regression test. The 218px publisher fixture is useful, but
// browser/device emulation can expose the playable at ~183 CSS px wide. Keep both permanent HUD
// controls and temporary celebrations non-overlapping there, including the real Day-3 Party Order.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
// Keep this outside cert/: playables-cert-smoke intentionally recreates its own cert screenshot dir.
const shots = path.resolve('shots-production', 'ultra-narrow');
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
await new Promise(resolve => server.listen(4177, '127.0.0.1', resolve));

const mockSdk = `
window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(){return true}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},engagement:{sendScore(){}},ads:{}};
`;

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:183, height:416 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk }));
await page.goto('http://127.0.0.1:4177/', { waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });

// Match the screenshot that exposed the bug: Day 3 is when Party Orders first become active. Let
// the real party-order system create its chip AND its temporary "NEW PET PARTY ORDER" celebration.
await page.evaluate(() => {
  window.__game.intro.step = 5; window.__game.intro.active = false;
  window.__game.dayState.day = 3; window.__game.dayState.t = 8; window.__game.dayState.phase = 'morning';
});
await page.waitForFunction(() => {
  const el = document.querySelector('.party-order-btn');
  return el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
}, null, { timeout:5000 });
await page.waitForFunction(() => {
  const el = document.querySelector('#banner');
  return el && el.classList.contains('show') && el.textContent.includes('PET PARTY ORDER');
}, null, { timeout:5000 });
// Let the banner finish its 350ms entrance transition before measuring final geometry.
await page.waitForTimeout(420);

const layout = await page.evaluate(() => {
  const permanentSelectors = ['#wallet','.pause-btn','#dayPill','.meta-reputation','.meta-pawbook','.party-order-btn'];
  const rectFor = sel => {
    const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    return { left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height };
  };
  const permanent = permanentSelectors.map(sel => [sel,rectFor(sel)]).filter(([,r]) => r);
  const banner = rectFor('#banner');
  return { viewport:[innerWidth,innerHeight], bodyWidth:document.body.scrollWidth, permanent, banner, bannerText:document.querySelector('#banner')?.textContent || '' };
});

const required = new Set(['#wallet','.pause-btn','#dayPill','.meta-reputation','.meta-pawbook','.party-order-btn']);
for (const [sel] of layout.permanent) required.delete(sel);
if (required.size) throw new Error(`183x416 expected visible controls missing: ${[...required].join(', ')}`);
if (!layout.banner || !layout.bannerText.includes('PET PARTY ORDER')) throw new Error('183x416 Party Order celebration banner was not measurable');

function overlap(a,b) {
  return Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
}
if (layout.bodyWidth > layout.viewport[0] + 1) throw new Error(`183x416 horizontal overflow: ${layout.bodyWidth}`);
for (const [sel,r] of layout.permanent) {
  if (r.left < -1 || r.top < -1 || r.right > layout.viewport[0]+1 || r.bottom > layout.viewport[1]+1) throw new Error(`${sel} outside 183x416 viewport: ${JSON.stringify(r)}`);
  if (/meta-reputation|meta-pawbook|party-order-btn/.test(sel) && r.height < 47.5) throw new Error(`${sel} lost 48px touch height`);
}
for (let i=0;i<layout.permanent.length;i++) for (let j=i+1;j<layout.permanent.length;j++) {
  const [aSel,a]=layout.permanent[i], [bSel,b]=layout.permanent[j];
  if (overlap(a,b)) throw new Error(`183x416 permanent HUD overlap: ${aSel} / ${bSel}`);
}
const b = layout.banner;
if (b.left < -1 || b.top < -1 || b.right > layout.viewport[0]+1 || b.bottom > layout.viewport[1]+1) throw new Error(`183x416 banner outside viewport: ${JSON.stringify(b)}`);
for (const [sel,r] of layout.permanent) {
  if (overlap(b,r)) throw new Error(`183x416 celebration overlaps ${sel}: ${JSON.stringify({banner:b,control:r})}`);
}
if (b.height > 42) throw new Error(`183x416 celebration is still visually oversized: ${JSON.stringify(b)}`);

await page.screenshot({ path:path.join(shots,'00-day3-183x416.png') });
console.log(JSON.stringify(layout,null,2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
