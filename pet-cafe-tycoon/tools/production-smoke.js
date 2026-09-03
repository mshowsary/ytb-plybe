// Build + serve + browser-smoke the production branch and capture phone/desktop screenshots.
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

execSync('npm run build', { stdio: 'inherit' });
const dist = path.resolve('dist');
const shots = path.resolve('shots-production');
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b);
  });
}).listen(4174);

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const report = [];
let failed = false;

for (const [tag, width, height, dpr] of [['portrait', 450, 800, 2], ['landscape', 1280, 720, 1]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: tag === 'portrait' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // Deterministic local mode: don't depend on the external SDK network request in CI.
  await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.ytgame={IN_PLAYABLES_ENV:false};' }));
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const r = window.__scene.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles, platform: !!window.__platform, metaVersion: window.__game.snapshot().v };
  });
  await page.screenshot({ path: path.join(shots, `01-boot-${tag}.png`), fullPage: true });

  // Force the natural day-end path to exercise the rating + rewarded summary presentation.
  await page.evaluate(() => {
    const d = window.__game.dayState;
    d.t = 239.99; d.phase = 'closing'; d._ended = false;
  });
  await page.waitForFunction(() => !!document.querySelector('.sheet-root .card'), null, { timeout: 5000 });
  await page.waitForFunction(() => !!document.querySelector('.meta-rating'), null, { timeout: 5000 });
  await page.waitForTimeout(250);
  const meta = await page.evaluate(() => ({
    stars: document.querySelector('.meta-rating-stars')?.textContent || '',
    reward: !!document.querySelector('.meta-reward-btn'),
  }));
  await page.screenshot({ path: path.join(shots, `02-summary-${tag}.png`), fullPage: true });

  if (!info.platform || info.metaVersion !== 2 || !meta.stars || !meta.reward || errors.length) failed = true;
  report.push({ tag, ...info, ...meta, errors });
  await ctx.close();
}

fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
