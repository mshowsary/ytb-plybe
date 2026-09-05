// Browser proof for the render half of Pet Play Break. The rewarded smoke proves the host ad,
// recipient selection and patience hold; this test proves that the same recipient marker
// (`_petBreakFloor`) maps to two visible, identifiable happy pet moments without touching sim rules.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'pet-play-break');
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
await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve));

const mockSdk = `
window.__saved=[];
window.ytgame={IN_PLAYABLES_ENV:true,
  game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(raw){window.__saved.push(raw);return true}},
  system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},
  engagement:{sendScore(){}},
  ads:{async requestRewardedAd(){return true},async requestInterstitialAd(){return true}}
};
`;

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:320, height:568 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk }));
await page.goto('http://127.0.0.1:4181/', { waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });

await page.evaluate(() => {
  const G = window.__game, s = G.snapshot();
  s.builds.a1 = ['z_seats1','z_oven2','z_register2','z_hire','z_coffee','z_bowl','z_blender','z_garden','z_seats2'];
  s.partial = {};
  s.intro = { step:5, active:false, target:null };
  s.dayState = { day:8, t:72, phase:'rush', _ended:false };
  s.meta.rewardedDays = { ...(s.meta.rewardedDays || {}), 'relief:8':1 };
  G.restore(s);
});

// Two natural visitors are important here: they own real Three.js pet meshes and real identity DOM.
// Waiting on only two keeps this visual regression deterministic even under software WebGL.
await page.waitForFunction(() => window.__game.customers.filter(c => !c.done).length >= 2, null, { timeout:45000 });

const marked = await page.evaluate(() => {
  const G = window.__game, pets = G.customers.filter(c => !c.done).slice(0, 2);
  if (pets.length !== 2) throw new Error('visual fixture did not collect two real pets');
  for (const c of pets) {
    c._petBreakFloor = Math.max(8, Number(c.patience) || 8);
    c.patience = c._petBreakFloor;
  }
  window.__petBreakVisualIds = pets.map(c => c.id);
  return [...window.__petBreakVisualIds];
});

await page.waitForFunction(() => {
  const ids = new Set(window.__petBreakVisualIds || []);
  const active = [...document.querySelectorAll('.pet-identity.play-break')];
  return active.length === 2 && active.every(el => ids.has(Number(el.dataset.customerId)) && /PLAY BREAK/i.test(el.textContent || ''));
}, null, { timeout:5000 });

// Give visible pets time to project into the camera. The play-break class itself is already the
// exact render-state assertion; `show` additionally guarantees the production screenshot captures it.
await page.waitForFunction(() => {
  const ids = new Set(window.__petBreakVisualIds || []);
  return [...document.querySelectorAll('.pet-identity.play-break.show')].filter(el => ids.has(Number(el.dataset.customerId))).length === 2;
}, null, { timeout:45000 });

const visual = await page.evaluate(() => {
  const ids = new Set(window.__petBreakVisualIds || []);
  return [...document.querySelectorAll('.pet-identity.play-break')]
    .filter(el => ids.has(Number(el.dataset.customerId)))
    .map(el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return {
        id:Number(el.dataset.customerId), text:(el.textContent || '').replace(/\s+/g,' ').trim(),
        className:el.className, left:r.left, top:r.top, right:r.right, bottom:r.bottom,
        opacity:Number(cs.opacity), borderColor:cs.borderColor, boxShadow:cs.boxShadow,
      };
    });
});
if (visual.length !== 2 || !visual.every(v => marked.includes(v.id) && /PLAY BREAK/i.test(v.text) && v.opacity > 0.9)) {
  throw new Error(`play-break visual state missing from selected pets: ${JSON.stringify({ marked, visual })}`);
}
if (!visual.every(v => v.right >= 0 && v.left <= 320 && v.bottom >= 0 && v.top <= 568)) {
  throw new Error(`play-break pet identity projected outside viewport: ${JSON.stringify(visual)}`);
}
await page.screenshot({ path:path.join(shots,'03-pet-play-break-active.png') });

// Clearing the same recipient marker must clear the persistent visual state too; no sticky happy
// badge should survive after the 15-second runtime controller removes its floors.
await page.evaluate(() => {
  const ids = new Set(window.__petBreakVisualIds || []);
  for (const c of window.__game.customers) if (ids.has(c.id)) delete c._petBreakFloor;
});
await page.waitForFunction(() => document.querySelectorAll('.pet-identity.play-break').length === 0, null, { timeout:3000 });
const cleared = await page.evaluate(() => ({ active:document.querySelectorAll('.pet-identity.play-break').length }));
if (cleared.active !== 0) throw new Error(`play-break visual state stuck after expiry: ${JSON.stringify(cleared)}`);

console.log(JSON.stringify({ marked, visual, cleared }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
