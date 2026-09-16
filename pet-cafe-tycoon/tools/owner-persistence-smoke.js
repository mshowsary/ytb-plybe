// Task 11 browser acceptance: the exact YouTube pause-save payload must restore safe owner
// location, held coffee/supplies, and explicit Runner display assignments without duplication.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'owner-persistence');
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

const ALL_BUILDS = ['z_seats1','z_oven2','z_register2','z_hire','z_coffee','z_bowl','z_blender','z_garden','z_seats2'];
const seed = {
  v: 4,
  coins: 5000,
  builds: { a1: ALL_BUILDS },
  upgrades: { carry: 1 },
  staff: { runner: 1 },
  dayState: { day: 4, t: 70 },
  meta: { completedDays: 3, reputation: 9 },
};
let loadRaw = JSON.stringify(seed);

function sdk(raw) {
  return `
    window.__ytOwner = { saved:null, gameReady:false, pauseCb:null, resumeCb:null };
    const loadRaw = ${JSON.stringify(raw)};
    window.ytgame = {
      IN_PLAYABLES_ENV:true,
      game:{
        firstFrameReady(){},
        gameReady(){ window.__ytOwner.gameReady=true; },
        async loadData(){ return loadRaw; },
        async saveData(value){ window.__ytOwner.saved=value; }
      },
      system:{
        isAudioEnabled(){ return true; },
        onAudioEnabledChange(cb){ window.__ytOwner.audioCb=cb; },
        onPause(cb){ window.__ytOwner.pauseCb=cb; },
        onResume(cb){ window.__ytOwner.resumeCb=cb; },
        getLanguage(){ return 'en'; }
      },
      engagement:{ async sendScore(){} },
      ads:{}
    };
  `;
}

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:390, height:700 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:sdk(loadRaw) }));

async function ready() {
  await page.waitForFunction(() => window.__ytOwner && window.__ytOwner.gameReady && window.__game && window.__ytOwner.pauseCb, null, { timeout:9000 });
  await page.waitForFunction(() => window.__game.staffList.filter(s => s.kind === 'runner').length === 1, null, { timeout:3000 });
}

async function pauseAndCapture() {
  await page.evaluate(() => window.__ytOwner.pauseCb());
  await page.waitForFunction(() => !!window.__ytOwner.saved, null, { timeout:5000 });
  loadRaw = await page.evaluate(() => window.__ytOwner.saved);
  return JSON.parse(loadRaw);
}

async function state() {
  return page.evaluate(() => {
    const G = window.__game;
    return {
      position: { x:G.P.x, z:G.P.z, rot:G.P.rot },
      velocity: { vx:G.P.vx, vz:G.P.vz },
      products: G.owner.items.map(item => item.userData.product),
      scales: G.owner.items.map(item => item.scale.x),
      carry: { sack:G.carry.sack, sackLeft:G.carry.sackLeft, fruit:G.carry.fruit },
      runnerAssignments: G.staffList.filter(s => s.kind === 'runner').map(s => s.assign || null),
      snapshot: G.snapshot(),
    };
  });
}

function near(a, b, eps = 0.03) { return Math.abs(a - b) <= eps; }
function assertPosition(actual, expected, label) {
  if (!near(actual.x, expected.x) || !near(actual.z, expected.z) || !near(actual.rot, expected.rot)) {
    throw new Error(`${label} position mismatch: ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  }
}

try {
  await page.goto('http://127.0.0.1:4181/', { waitUntil:'domcontentloaded' });
  await ready();

  // Use a real Coffee-machine pickup. Keep the Runner on Cupcakes so it cannot race the owner for
  // coffee stock, and persist that player-selected assignment in the same pause transaction.
  await page.evaluate(() => {
    const G = window.__game, coffee = G.world.stations.get('coffee1');
    const runner = G.staffList.find(s => s.kind === 'runner');
    runner.assign = 'dispCupcake';
    coffee.stock = 8; coffee.beans = 0; coffee.timer = 0; coffee.product = 'coffee';
    G.P.x = coffee.front.x; G.P.z = coffee.front.z; G.P.vx = 0; G.P.vz = 0; G._force = null;
  });
  await page.waitForFunction(() => window.__game.owner.items.length === 1, null, { timeout:2500 });
  const productPosition = { x:1.4, z:1.7, rot:0.75 };
  await page.evaluate(pos => {
    const G = window.__game;
    G.P.x = pos.x; G.P.z = pos.z; G.P.rot = pos.rot; G.P.vx = 0; G.P.vz = 0; G._force = null;
  }, productPosition);
  await page.waitForTimeout(120);

  const beforeProduct = await state();
  if (JSON.stringify(beforeProduct.products) !== JSON.stringify(['coffee'])) throw new Error(`live coffee setup failed: ${JSON.stringify(beforeProduct)}`);
  if (JSON.stringify(beforeProduct.runnerAssignments) !== JSON.stringify(['dispCupcake'])) throw new Error(`runner assignment setup failed: ${JSON.stringify(beforeProduct)}`);
  assertPosition(beforeProduct.position, productPosition, 'pre-save coffee');
  const productSave = await pauseAndCapture();
  if (!productSave.ownerState || productSave.ownerState.v !== 1) throw new Error(`owner payload missing: ${JSON.stringify(productSave.ownerState)}`);
  if (JSON.stringify(productSave.ownerState.products) !== JSON.stringify(['coffee'])) throw new Error(`coffee not saved: ${JSON.stringify(productSave.ownerState)}`);
  if (!productSave.staffState || JSON.stringify(productSave.staffState.runnerAssignments) !== JSON.stringify(['dispCupcake'])) {
    throw new Error(`runner assignment not saved: ${JSON.stringify(productSave.staffState)}`);
  }
  assertPosition(productSave.ownerState.position, productPosition, 'saved coffee');
  await page.screenshot({ path:path.join(shots, '01-coffee-before-reload.png') });

  await page.reload({ waitUntil:'domcontentloaded' });
  await ready();
  await page.waitForTimeout(80);
  const afterProduct = await state();
  if (JSON.stringify(afterProduct.products) !== JSON.stringify(['coffee'])) throw new Error(`coffee stack not restored: ${JSON.stringify(afterProduct)}`);
  if (JSON.stringify(afterProduct.runnerAssignments) !== JSON.stringify(['dispCupcake'])) throw new Error(`runner assignment not restored: ${JSON.stringify(afterProduct)}`);
  if (afterProduct.carry.sack !== null || afterProduct.carry.fruit !== 0) throw new Error(`product restore mixed carry modes: ${JSON.stringify(afterProduct.carry)}`);
  if (afterProduct.velocity.vx !== 0 || afterProduct.velocity.vz !== 0) throw new Error(`owner velocity survived reload: ${JSON.stringify(afterProduct.velocity)}`);
  assertPosition(afterProduct.position, productPosition, 'restored coffee');
  await page.screenshot({ path:path.join(shots, '02-coffee-after-reload.png') });

  // Supply sack mode: clear the product stack, retain a partially-used bean sack, and move elsewhere.
  const sackPosition = { x:-1.2, z:0.8, rot:-1.1 };
  await page.evaluate(pos => {
    const G = window.__game;
    G.owner.clearItems();
    G.carry.sack = 'beans'; G.carry.sackLeft = 7; G.carry.fruit = 0; G.owner.setCarryProps('beans', 0);
    G.P.x = pos.x; G.P.z = pos.z; G.P.rot = pos.rot; G.P.vx = 0; G.P.vz = 0; G._force = null;
  }, sackPosition);
  await page.waitForTimeout(80);
  const sackSave = await pauseAndCapture();
  if (JSON.stringify(sackSave.ownerState.carry) !== JSON.stringify({ sack:'beans', sackLeft:7, fruit:0 })) {
    throw new Error(`partial sack not saved: ${JSON.stringify(sackSave.ownerState)}`);
  }
  if (sackSave.ownerState.products.length) throw new Error(`sack save duplicated products: ${JSON.stringify(sackSave.ownerState)}`);

  await page.reload({ waitUntil:'domcontentloaded' });
  await ready();
  const afterSack = await state();
  if (JSON.stringify(afterSack.carry) !== JSON.stringify({ sack:'beans', sackLeft:7, fruit:0 })) throw new Error(`partial sack not restored: ${JSON.stringify(afterSack)}`);
  if (afterSack.products.length) throw new Error(`sack restore duplicated products: ${JSON.stringify(afterSack.products)}`);
  if (JSON.stringify(afterSack.runnerAssignments) !== JSON.stringify(['dispCupcake'])) throw new Error(`runner assignment drifted after second reload: ${JSON.stringify(afterSack)}`);
  assertPosition(afterSack.position, sackPosition, 'restored sack');
  await page.screenshot({ path:path.join(shots, '03-beans-after-reload.png') });

  // Fruit remains a distinct carry representation and gets a regression round-trip too.
  const fruitPosition = { x:-3.1, z:1.25, rot:2.2 };
  await page.evaluate(pos => {
    const G = window.__game;
    G.owner.clearItems();
    G.carry.sack = null; G.carry.sackLeft = 0; G.carry.fruit = 5; G.owner.setCarryProps(null, 5);
    G.P.x = pos.x; G.P.z = pos.z; G.P.rot = pos.rot; G.P.vx = 0; G.P.vz = 0; G._force = null;
  }, fruitPosition);
  await page.waitForTimeout(80);
  const fruitSave = await pauseAndCapture();
  if (JSON.stringify(fruitSave.ownerState.carry) !== JSON.stringify({ sack:null, sackLeft:0, fruit:5 })) throw new Error(`fruit not saved: ${JSON.stringify(fruitSave.ownerState)}`);

  await page.reload({ waitUntil:'domcontentloaded' });
  await ready();
  const afterFruit = await state();
  if (JSON.stringify(afterFruit.carry) !== JSON.stringify({ sack:null, sackLeft:0, fruit:5 })) throw new Error(`fruit not restored: ${JSON.stringify(afterFruit)}`);
  if (afterFruit.products.length) throw new Error(`fruit restore duplicated products: ${JSON.stringify(afterFruit.products)}`);
  assertPosition(afterFruit.position, fruitPosition, 'restored fruit');
  await page.screenshot({ path:path.join(shots, '04-fruit-after-reload.png') });

  const report = {
    ownerVersion: fruitSave.ownerState.v,
    staffVersion: fruitSave.staffState && fruitSave.staffState.v,
    coffee: { before:beforeProduct, after:afterProduct },
    beans: afterSack,
    fruit: afterFruit,
    runnerAssignmentPreserved: afterProduct.runnerAssignments[0] === 'dispCupcake' && afterSack.runnerAssignments[0] === 'dispCupcake',
    noDuplicateModes: afterProduct.carry.sack === null && afterSack.products.length === 0 && afterFruit.products.length === 0,
    zeroVelocityOnRestore: afterProduct.velocity.vx === 0 && afterProduct.velocity.vz === 0,
  };
  delete report.coffee.before.snapshot; delete report.coffee.after.snapshot; delete report.beans.snapshot; delete report.fruit.snapshot;
  fs.writeFileSync(path.join(shots, 'owner-persistence-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
} finally {
  await ctx.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
