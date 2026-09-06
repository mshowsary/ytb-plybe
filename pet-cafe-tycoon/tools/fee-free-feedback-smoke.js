// Task 23 browser acceptance: exercise the composed production runtime, not isolated helpers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing; run npm run build first');
const shots = path.resolve('shots-production');
fs.mkdirSync(shots, { recursive:true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type':types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
await new Promise(resolve => server.listen(4176, '127.0.0.1', resolve));

let browser;
try {
  browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport:{ width:320, height:568 }, deviceScaleFactor:1.5, hasTouch:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ status:200, contentType:'text/javascript', body:'window.ytgame={IN_PLAYABLES_ENV:false};' }));
  await page.goto('http://127.0.0.1:4176/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });

  const result = await page.evaluate(async () => {
    const g = window.__game;
    g.coins = 777;
    g.dayStats.serviceFees = 0;
    g.dayStats.wasteFees = 0;
    g.dayStats.serviceMisses = 0;
    g.dayStats.returnActions = 0;
    const before = g.coins;

    // RETURN callback is installed by the composed Task-23 runtime after the old economy callback.
    g.carry.onReturn({ fruit:3, sack:null });
    await new Promise(r => setTimeout(r, 40));
    const afterReturn = {
      coins:g.coins,
      returns:g.dayStats.returnActions | 0,
      text:document.querySelector('.service-friction-toast')?.textContent || '',
    };

    // Explicit event subscriber path for successful-but-poor service.
    g.world.emit({ type:'settled', id:424242 });
    await new Promise(r => setTimeout(r, 40));
    const afterSubstitute = {
      coins:g.coins,
      misses:g.dayStats.serviceMisses | 0,
      text:document.querySelector('.service-friction-toast')?.textContent || '',
    };

    // Customer system reads queued world events during the next simulation step. This exercises
    // the former lost-sale recovery debit path even though the synthetic id has no renderer record.
    g.world.emit({ type:'lost', id:424243, reason:'register' });
    g.update(1 / 30);
    await new Promise(r => setTimeout(r, 40));
    const ledger = g.economicLedger.report();
    const afterLost = {
      coins:g.coins,
      misses:g.dayStats.serviceMisses | 0,
      lost:g.dayStats.lost | 0,
      deduction:ledger.deduction,
    };
    return { before, afterReturn, afterSubstitute, afterLost };
  });

  await page.screenshot({ path:path.join(shots, 'task23-fee-free-320.png'), fullPage:true });

  const negativeMoney = text => /[-−]\s*\d/.test(String(text || ''));
  const failures = [];
  if (result.afterReturn.coins !== result.before || result.afterReturn.returns !== 1) failures.push('RETURN changed wallet or failed to record action');
  if (!/Items returned/i.test(result.afterReturn.text) || negativeMoney(result.afterReturn.text)) failures.push('RETURN feedback is missing or still money-negative');
  if (result.afterSubstitute.coins !== result.before || result.afterSubstitute.misses < 1) failures.push('service-friction event changed wallet or was not recorded');
  if (negativeMoney(result.afterSubstitute.text)) failures.push('service-friction feedback still presents a negative wallet amount');
  if (result.afterLost.coins !== result.before || result.afterLost.misses < 2 || result.afterLost.lost < 1) failures.push('lost-sale recovery changed wallet or lost outcome disappeared');
  if (result.afterLost.deduction !== 0) failures.push(`economic ledger recorded ${result.afterLost.deduction} coins of Task-23 deductions`);
  if (errors.length) failures.push(`browser errors: ${errors.join(' | ')}`);

  console.log('TASK23_FEE_FREE_BROWSER ' + JSON.stringify({ result, errors, screenshot:'shots-production/task23-fee-free-320.png' }));
  if (failures.length) {
    for (const failure of failures) console.error('FAIL: ' + failure);
    process.exitCode = 1;
  } else {
    console.log('PASS: return, service-friction and lost-sale recovery preserve banked wallet with non-money feedback at 320x568');
  }
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
