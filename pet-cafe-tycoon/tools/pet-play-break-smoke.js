// End-to-end rewarded Pet Play Break regression. Uses a real browser game and seven real spawned
// guests; only the YouTube ad host is mocked. The fixture converts four real guests into a stable
// empty-bowl pressure group so this smoke tests the reward surface/effect rather than re-testing
// doorway navigation or the bowl's already-covered give-up rule.
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
await new Promise(resolve => server.listen(4180, '127.0.0.1', resolve));

const mockSdk = `
window.__rewardIds=[]; window.__saved=[];
window.ytgame={IN_PLAYABLES_ENV:true,
  game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(raw){window.__saved.push(raw);return true}},
  system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},
  engagement:{sendScore(){}},
  ads:{async requestRewardedAd(id){window.__rewardIds.push(id);return true},async requestInterstitialAd(){return true}}
};
`;

const browser = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{ width:320, height:568 }, deviceScaleFactor:1, hasTouch:true });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status:200, contentType:'text/javascript', body:mockSdk }));
await page.goto('http://127.0.0.1:4180/', { waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout:30000 });

// Fully built café gives Rush enough population capacity for the broad-overload path. Keep the
// once-per-day Rush Help claim temporarily consumed while seven genuine browser-system guests spawn,
// so pre-fixture queue noise cannot start the monetization dwell early.
await page.evaluate(() => {
  const G = window.__game, s = G.snapshot();
  s.coins = 5000;
  s.builds.a1 = ['z_seats1','z_oven2','z_register2','z_hire','z_coffee','z_bowl','z_blender','z_garden','z_seats2'];
  s.partial = {};
  s.staff = { runner:0, cashier:0, cleaner:0 };
  s.staffLevels = { runner:{ speed:0, carry:0 }, cashier:{ speed:0 }, cleaner:{ speed:0 } };
  s.intro = { step:5, active:false, target:null };
  s.dayState = { day:8, t:72, phase:'rush', _ended:false };
  s.dayStats = { served:0, lost:0, earned:0, serviceFees:0, serviceMisses:0, wasteFees:0, bestStreak:0 };
  s.meta.rewardedDays = { ...(s.meta.rewardedDays || {}), 'relief:8':1 };
  G.restore(s);
  const bowl = G.world.stations.get('bowl1'); if (bowl) bowl.stock = 0;
  // Empty shelves keep early guests around long enough to reach seven; the claimed gate above
  // prevents those temporary empty-shelf signals from surfacing Rush Help during setup.
  for (const id of G.world.displays) { const st = G.world.stations.get(id); if (st) st.stock = 0; }
});

await page.waitForFunction(() => window.__game.customers.filter(c => !c.done).length >= 7, null, { timeout:45000 });

const fixture = await page.evaluate(() => {
  const G = window.__game;
  const active = G.customers.filter(c => !c.done).slice(0, 7);
  if (active.length < 7) throw new Error('Pet Play Break fixture failed to collect seven real guests');
  const seats = ['seat1','seat2','seat3'];

  // Four real pet guests now wait at the empty bowl. `_treatGivenUp=true` deliberately disables
  // the separate six-second give-up branch for this targeted monetization smoke; the guests still
  // go through the ordinary atBowl patience drain every simulation tick.
  for (let i = 0; i < 4; i++) {
    const c = active[i];
    c.state = 'atBowl'; c.mood = 'none'; c.wish = { product:'cookie', treat:true }; c.order = ['cookie'];
    c.patience = 14 + i; c._patQ = c.patience * 4; c._treatGivenUp = true; c._bowlSlot = i;
    c.mover.hasTarget = false; c.mover.n = 0; c.mover.k = 0; c.mover.vx = 0; c.mover.vz = 0;
  }
  // Keep three other real guests active but non-waiting for the whole fixture without manufacturing
  // extra entities or letting unrelated service bottlenecks take over the classifier.
  for (let i = 4; i < 7; i++) {
    const c = active[i], seat = G.world.stations.get(seats[i - 4]);
    if (!seat) throw new Error('Pet Play Break fixture missing lounge seat');
    seat.occupied = true; seat.dirty = false;
    c.state = 'eating'; c.mood = 'none'; c.timer = -100; c.seat = seat; c.seatId = seat.id;
    c.mover.hasTarget = false; c.mover.n = 0; c.mover.k = 0; c.mover.vx = 0; c.mover.vz = 0;
  }
  G.meta.rewardedDays['relief:8'] = 0;
  window.__petBreakFixtureStart = G.time;
  window.__petBreakIds = active.slice(0,4).map(c => c.id);
  return { ids:[...window.__petBreakIds], start:G.time };
});

await page.waitForFunction(() => {
  const G = window.__game, ids = new Set(window.__petBreakIds || []);
  return G.customers.filter(c => ids.has(c.id) && c.state === 'atBowl' && c.mood === 'wait').length === 4;
}, null, { timeout:3000 });

// Same clock as production logic: do not equate headless-WebGL wall time with simulation time.
await page.waitForFunction(() => {
  const G = window.__game;
  return G && Number.isFinite(window.__petBreakFixtureStart) && G.time - window.__petBreakFixtureStart >= 6;
}, null, { timeout:18000 });

const surfaceState = await page.evaluate(() => {
  const G = window.__game, ids = new Set(window.__petBreakIds || []);
  const root = document.querySelector('.relief-root'), pill = document.querySelector('.relief-pill');
  return {
    fixtureElapsed:G.time - window.__petBreakFixtureStart,
    day:{ day:G.dayState.day, phase:G.dayState.phase, t:G.dayState.t },
    claim:G.meta.rewardedDays['relief:8'] || 0,
    guests:G.customers.filter(c => ids.has(c.id)).map(c => ({ id:c.id, state:c.state, mood:c.mood, patience:c.patience })),
    rootClass:root && root.className,
    pillClass:pill && pill.className,
    pillText:pill && pill.textContent.replace(/\s+/g,' ').trim(),
  };
});
const visible = surfaceState.rootClass && !surfaceState.rootClass.split(/\s+/).includes('hidden') &&
  surfaceState.pillClass && !surfaceState.pillClass.split(/\s+/).includes('hidden') && /Pet Play Break/i.test(surfaceState.pillText || '');
if (!visible) throw new Error(`Pet Play Break surface did not stabilize: ${JSON.stringify(surfaceState)}`);

const pillGeometry = await page.evaluate(() => {
  const el = document.querySelector('.relief-pill'), r = el.getBoundingClientRect();
  return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, height:r.height, text:el.textContent.replace(/\s+/g,' ').trim() };
});
if (pillGeometry.left < -1 || pillGeometry.right > 321 || pillGeometry.bottom > 569 || pillGeometry.height < 47.5) {
  throw new Error(`Pet Play Break pill geometry failed: ${JSON.stringify(pillGeometry)}`);
}
await page.screenshot({ path:path.join(shots,'01-pet-play-break-pill.png') });

await page.locator('.relief-pill').click();
await page.waitForFunction(() => {
  const el = document.querySelector('.relief-card');
  return el && !el.classList.contains('hidden') && /15s BREAK/i.test(el.textContent || '');
}, null, { timeout:3000 });
const cardGeometry = await page.evaluate(() => {
  const el = document.querySelector('.relief-card'), r = el.getBoundingClientRect();
  const button = el.querySelector('.relief-watch').getBoundingClientRect();
  return { card:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}, watchHeight:button.height, text:el.textContent.replace(/\s+/g,' ').trim() };
});
if (cardGeometry.card.left < -1 || cardGeometry.card.right > 321 || cardGeometry.card.bottom > 569 || cardGeometry.watchHeight < 47.5) {
  throw new Error(`Pet Play Break card geometry failed: ${JSON.stringify(cardGeometry)}`);
}
if (!/2 stressed pet guests/i.test(cardGeometry.text) || !/patience cannot fall/i.test(cardGeometry.text) || !/Queues keep moving/i.test(cardGeometry.text) || !/permanent stats are unchanged/i.test(cardGeometry.text)) {
  throw new Error(`Pet Play Break card did not explain bounded semantics: ${cardGeometry.text}`);
}
await page.screenshot({ path:path.join(shots,'02-pet-play-break-card.png') });

await page.locator('.relief-watch').click();
await page.waitForFunction(() => {
  const G = window.__game, b = G.boosts && G.boosts.petPlayBreak;
  return b && b.recipientIds && b.recipientIds.length === 2 && G.meta.rewardedDays['relief:8'] && window.__rewardIds.includes('pet-cafe-pet-play-break');
}, null, { timeout:5000 });

const awarded = await page.evaluate(() => {
  const G = window.__game, b = G.boosts.petPlayBreak, save = G.snapshot();
  const ids = new Set(window.__petBreakIds || []);
  return {
    rewardIds:[...window.__rewardIds],
    boost:{ day:b.day, remaining:b.remaining, slots:b.slots, recipientIds:[...b.recipientIds] },
    savedBoost:save.boosts && save.boosts.petPlayBreak ? {...save.boosts.petPlayBreak} : null,
    claim:G.meta.rewardedDays['relief:8'],
    patience:Object.fromEntries(G.customers.filter(c => ids.has(c.id)).map(c => [c.id, c.patience])),
  };
});
if (awarded.rewardIds.filter(x => x === 'pet-cafe-pet-play-break').length !== 1) throw new Error(`Pet Play Break ad called wrong number of times: ${JSON.stringify(awarded)}`);
if (!awarded.savedBoost || awarded.savedBoost.day !== 8 || awarded.savedBoost.slots !== 2 || !(awarded.savedBoost.remaining > 0)) throw new Error(`active Pet Play Break missing from snapshot: ${JSON.stringify(awarded)}`);

await page.evaluate(() => {
  const G = window.__game, b = G.boosts.petPlayBreak;
  window.__petBreakObserveStart = G.time;
  window.__petBreakSelected = [...b.recipientIds];
  window.__petBreakPatienceAtAward = Object.fromEntries((window.__petBreakIds || []).map(id => {
    const c = G.customers.find(x => x.id === id); return [id, c && c.patience];
  }));
});
await page.waitForFunction(() => window.__game.time - window.__petBreakObserveStart >= 2, null, { timeout:9000 });
const held = await page.evaluate(() => {
  const G = window.__game, selected = new Set(window.__petBreakSelected || []), before = window.__petBreakPatienceAtAward || {};
  return (window.__petBreakIds || []).map(id => {
    const c = G.customers.find(x => x.id === id);
    return { id, selected:selected.has(id), before:before[id], after:c && c.patience };
  });
});
for (const row of held.filter(x => x.selected)) {
  if (Math.abs(row.after - row.before) > 0.05) throw new Error(`selected guest patience fell during Pet Play Break: ${JSON.stringify(held)}`);
}
if (!held.some(x => !x.selected && x.after < x.before - 1)) throw new Error(`unselected waiting guests did not continue normal patience drain: ${JSON.stringify(held)}`);

// Round-trip through the game's real save/restore. Customers are intentionally not persisted, so
// the benefit must remain as unassigned remaining time rather than disappearing with stale ids.
const restored = await page.evaluate(() => {
  const G = window.__game, save = G.snapshot(), before = save.boosts.petPlayBreak.remaining;
  G.restore(save);
  const b = G.boosts.petPlayBreak;
  return { customerCount:G.customers.length, before, boost:b ? { day:b.day, remaining:b.remaining, slots:b.slots, needsRecipients:b.needsRecipients, recipientIds:[...(b.recipientIds || [])] } : null };
});
if (restored.customerCount !== 0 || !restored.boost || !restored.boost.needsRecipients || restored.boost.recipientIds.length !== 0 || Math.abs(restored.boost.remaining - restored.before) > 0.05) {
  throw new Error(`Pet Play Break did not restore as unassigned remaining benefit: ${JSON.stringify(restored)}`);
}

await page.evaluate(() => { window.__game.dayState.phase = 'afternoon'; window.__game.dayState.t = 151; });
await page.waitForFunction(() => !window.__game.boosts.petPlayBreak, null, { timeout:3000 });
const expired = await page.evaluate(() => {
  const save = window.__game.snapshot();
  return { live:window.__game.boosts.petPlayBreak || null, saved:save.boosts && save.boosts.petPlayBreak || null };
});
if (expired.live || expired.saved) throw new Error(`Pet Play Break leaked beyond Rush: ${JSON.stringify(expired)}`);

console.log(JSON.stringify({ fixture, surfaceState, pillGeometry, cardGeometry, awarded, held, restored, expired }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
