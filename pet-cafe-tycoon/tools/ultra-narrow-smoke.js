// Real-world ultra-narrow portrait regression test. The 218px publisher fixture is useful, but
// browser/device emulation can expose the playable at ~183 CSS px wide. Keep the permanent HUD
// non-overlapping there too, and save a screenshot for remote QA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'cert');
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
await page.waitForTimeout(300);

const layout = await page.evaluate(() => {
  const selectors = ['#wallet','.pause-btn','#dayPill','.meta-reputation','.meta-pawbook','.party-order-btn'];
  const rects = selectors.map(sel => {
    const el = document.querySelector(sel); if (!el) return [sel,null];
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return [sel,null];
    const r = el.getBoundingClientRect();
    return [sel,{ left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height }];
  }).filter(([,r]) => r);
  return { viewport:[innerWidth,innerHeight], bodyWidth:document.body.scrollWidth, rects };
});

function overlap(a,b) {
  return Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
}
if (layout.bodyWidth > layout.viewport[0] + 1) throw new Error(`183x416 horizontal overflow: ${layout.bodyWidth}`);
for (const [sel,r] of layout.rects) {
  if (r.left < -1 || r.top < -1 || r.right > layout.viewport[0]+1 || r.bottom > layout.viewport[1]+1) throw new Error(`${sel} outside 183x416 viewport: ${JSON.stringify(r)}`);
  if (/meta-reputation|meta-pawbook|party-order-btn/.test(sel) && r.height < 47.5) throw new Error(`${sel} lost 48px touch height`);
}
for (let i=0;i<layout.rects.length;i++) for (let j=i+1;j<layout.rects.length;j++) {
  const [aSel,a]=layout.rects[i], [bSel,b]=layout.rects[j];
  if (overlap(a,b)) throw new Error(`183x416 permanent HUD overlap: ${aSel} / ${bSel}`);
}

await page.screenshot({ path:path.join(shots,'00-ultra-narrow-183x416.png') });
console.log(JSON.stringify(layout,null,2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
