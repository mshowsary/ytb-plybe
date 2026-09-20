// tools/rewarded-offers-smoke.js — the four rewarded offers, in a real browser (ship plan §1.7).
//
// It replaces tools/rush-help-smoke.js and tools/task38-rewarded-offer-cert.mjs, which drove the
// rush-crew / pet-play-break pill that Batch E2 deleted. What it proves, per offer:
//
//   * the trigger fires from real café state (not a timer);
//   * the bubble is ONE pictogram + ONE value + the AD badge, with a 48 px tap target;
//   * watching grants the reward and marks the placement;
//   * REFUSING LEAVES THE GAME EXACTLY AS IT WAS — coins, stock, partial payment and the Pet Book
//     are all compared before and after, and the offer is not asked again the same day;
//   * nothing surfaces in the first 60 seconds of a session.
//
// A missing import only fails at RUNTIME, which is the whole reason this runs the built bundle.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.OFFERS_SMOKE_PORT || 4702);
const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'rewarded-offers');
fs.mkdirSync(shots, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(dist, 'index.html');
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const mockSdk = `window.__rewardIds=[];window.ytgame={IN_PLAYABLES_ENV:true,game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(){return true}},system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},engagement:{sendScore(){}},ads:{async requestRewardedAd(id){window.__rewardIds.push(id);return true},async requestInterstitialAd(){window.__rewardIds.push('interstitial');return true}}};`;

// The house probe configuration: a real ANGLE/D3D11 GPU context, so what the shots show is what a
// player's machine draws rather than a software rasteriser's approximation of it.
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: GPU_ARGS });
const ctx = await browser.newContext({ viewport: { width: 380, height: 670 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: mockSdk }));
await page.goto(`http://127.0.0.1:${PORT}/?dev=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 40000 });

const results = {};
const fail = (name, detail) => { throw new Error(`${name}: ${JSON.stringify(detail)}`); };
const bubble = () => page.evaluate(() => {
  const root = document.querySelector('.offer-root');
  if (!root || root.classList.contains('hidden')) return null;
  const pill = root.querySelector('.offer-pill');
  const r = pill.getBoundingClientRect();
  return {
    icons: pill.querySelectorAll('svg').length,
    value: (pill.querySelector('.offer-value').textContent || '').trim(),
    ad: (pill.querySelector('.offer-ad').textContent || '').trim(),
    aria: pill.getAttribute('aria-label') || '',
    w: Math.round(r.width), h: Math.round(r.height),
    padVisible: (document.querySelector('.offer-pad') || {}).style?.display !== 'none',
  };
});
// A screenshot of an offer has to show the OFFER, so every shot waits for the moment queue to be
// empty first. A pet-discovery card is a full-screen reveal and the café keeps spawning guests, so
// without this the frame is whichever cat happened to walk in.
const clearScreen = async () => {
  try {
    await page.waitForFunction(() => !document.querySelector('.pet-reveal, .moment.show'), null, { timeout: 15000 });
  } catch (_) { /* a card that will not clear is worth seeing in the shot */ }
  await page.waitForTimeout(150);
};
// The one control loop every case uses: force a state, run real frames, read the bubble.
const settle = (seconds = 2.5) => page.evaluate(async s => {
  const G = window.__game;
  for (let i = 0; i < Math.round(s / 0.05); i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
}, seconds);

// A café with one zone already built and the next pad part-paid, restored through the real save
// boundary so refreshActive/zones.syncAll run and the plot is genuinely live.
const seedCafe = (partialRatio = 0.6, day = 5, phase = 'afternoon', t = 170) => page.evaluate(async ({ partialRatio, day, phase, t }) => {
  const G = window.__game;
  const save = G.snapshot();
  save.builds.a1 = ['z_seats1'];
  const zone = G.world.area.zones.find(z => z.id === 'z_oven2');
  save.partial = { z_oven2: Math.ceil(zone.price * partialRatio) };
  // ZERO coins on purpose: standing on a part-paid pad with money in hand simply FINISHES the
  // build (systems/zones.js pays continuously while the owner stands there), which is the right
  // behaviour and the wrong test. An empty wallet on a 60%-paid pad is exactly the "almost there"
  // moment the Build Boost exists for.
  save.coins = 0;
  save.dayState = { ...save.dayState, day, phase, t, _ended: false };
  G.restore(save);
  G.dayState.day = day; G.dayState.phase = phase; G.dayState.t = t;
  return { built: [...G.world.built], partial: { ...G.world.partial }, coins: G.coins };
}, { partialRatio, day, phase, t });

// ---- 0. nothing may surface in the first 60 seconds -----------------------------------------
{
  const early = await page.evaluate(async () => {
    const G = window.__game;
    // The welcome gift card shows itself once per real day, after the first sale. Take it out of
    // the way before anything else: it is a modal, and a modal legitimately suppresses every
    // in-shift offer. It may not appear at all here (no sale yet), which is the point of the rule.
    for (let i = 0; i < 260; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    const giftRoot = document.querySelector('.gift-root');
    const appeared = !!giftRoot && !giftRoot.classList.contains('hidden');
    if (appeared) document.querySelector('.gift-later').click();
    await new Promise(r => setTimeout(r, 250));
    return { time: G.time, welcomeCardAppeared: appeared };
  });
  await seedCafe(0.8, 3, 'afternoon', 170);
  const quiet = await page.evaluate(async () => {
    const G = window.__game;
    G.time = 5;                                          // rewind the session clock, not the day
    const zone = G.world.area.zones.find(z => z.id === 'z_oven2');
    G.P.x = zone.x; G.P.z = zone.z; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 60; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    const root = document.querySelector('.offer-root');
    return { time: G.time, modal: !!G.userPaused, hidden: !root || root.classList.contains('hidden') };
  });
  if (quiet.modal) fail('first-60s-blocked-by-a-modal', quiet);
  if (!quiet.hidden) fail('first-60s', quiet);
  results.firstMinuteQuiet = { ...early, ...quiet };
}

// ---- 1. BUILD BOOST: a ▶ badge on the pad the owner is standing on ---------------------------
{
  await seedCafe(0.6, 5, 'afternoon', 170);
  const before = await page.evaluate(async () => {
    const G = window.__game;
    G.time = 300;                                   // past the 60 s rule
    const zone = G.world.area.zones.find(z => z.id === 'z_oven2');
    G.P.x = zone.x; G.P.z = zone.z; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 70; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    return { coins: G.coins, paid: G.world.partial[zone.id] || 0, price: zone.price, built: G.world.built.has('z_oven2') };
  });
  const shown = await bubble();
  if (!shown) fail('build-boost-bubble-missing', before);
  if (!shown.padVisible) fail('build-boost-pad-badge-missing', shown);
  if (shown.ad !== 'AD' && shown.ad !== 'DEV · AD') fail('build-boost-ad-badge', shown);
  if (shown.h < 48) fail('build-boost-tap-target', shown);
  if (/[A-Za-z]{2,}/.test(shown.value)) fail('build-boost-value-is-a-word', shown);
  await clearScreen();
  await page.screenshot({ path: path.join(shots, '01-build-boost-380x670.png') });

  // REFUSE: nothing changes, and it is not asked again today.
  await page.locator('.offer-no').click();
  await settle(2.5);
  const afterRefuse = await page.evaluate(() => {
    const G = window.__game, zone = G.world.area.zones.find(z => z.id === 'z_oven2');
    return { coins: G.coins, paid: G.world.partial[zone.id] || 0, built: G.world.built.has('z_oven2'), bubble: !document.querySelector('.offer-root').classList.contains('hidden') };
  });
  if (afterRefuse.coins !== before.coins || afterRefuse.paid !== before.paid || afterRefuse.built) fail('build-boost-refuse-changed-state', { before, afterRefuse });
  if (afterRefuse.bubble) fail('build-boost-asked-twice', afterRefuse);

  // WATCH: the pad is paid, up to half its price, and the wallet is untouched.
  const watched = await page.evaluate(async () => {
    const G = window.__game;
    G.dayState.day = 6;                                   // a new day clears the refusal
    const zone = G.world.area.zones.find(z => z.id === 'z_oven2');
    for (let i = 0; i < 70; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    const coinsBefore = G.coins, paidBefore = G.world.partial[zone.id] || 0;
    document.querySelector('.offer-pill').click();
    await new Promise(r => setTimeout(r, 400));
    for (let i = 0; i < 10; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    return {
      coinsBefore, coinsAfter: G.coins,
      paidBefore, paidAfter: G.world.partial[zone.id] || 0, built: G.world.built.has('z_oven2'),
      price: zone.price, claimed: !!G.meta.rewardedDays['service:6'],
      rewardIds: window.__rewardIds.slice(),
    };
  });
  const gained = watched.built ? watched.price - watched.paidBefore : watched.paidAfter - watched.paidBefore;
  if (gained <= 0) fail('build-boost-paid-nothing', watched);
  if (gained > Math.round(watched.price * 0.5) + 1) fail('build-boost-overpaid', { gained, watched });
  if (watched.coinsAfter !== watched.coinsBefore) fail('build-boost-charged-the-player', watched);
  if (!watched.claimed) fail('build-boost-not-marked', watched);
  if (!watched.rewardIds.includes('pet-cafe-build-boost')) fail('build-boost-reward-id', watched);
  results.buildBoost = { shown, gained, ...watched };
}

// ---- 2. SPECIAL GUEST: a sparkly silhouette at the door in the morning -----------------------
{
  const before = await page.evaluate(async () => {
    const G = window.__game;
    G.dayState.day = 7; G.dayState.phase = 'morning'; G.dayState.t = 20;
    // Stand where the door is in frame: the silhouette is a thing in the WORLD, so the shot has to
    // contain it. Clear of every build pad, so the service slot cannot take the bubble instead.
    G.P.x = -7.4; G.P.z = 4.2; G.P.vx = 0; G.P.vz = 0;
    for (let i = 0; i < 70; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    return { specialGuest: G.specialGuest, coins: G.coins, book: Object.keys(G.meta.petBook).length };
  });
  const shown = await bubble();
  if (!shown) fail('special-guest-bubble-missing', before);
  if (/[A-Za-z]{2,}/.test(shown.value)) fail('special-guest-value-is-a-word', shown);
  // The silhouette itself: a pet group parked just inside the door, added by systems/offers.js.
  const silhouette = await page.evaluate(() => {
    let found = null;
    window.__scene.scene.traverse(n => {
      if (found) return;
      if (n.userData?.petCafeOffer === 'specialGuest') found = { name: n.name, x: n.position.x, z: n.position.z };
    });
    if (!found) return null;
    // ...and it has to be ON SCREEN in the shot, not merely in the scene graph.
    const p = { sx: 0, sy: 0, visible: false };
    window.__game.fx.project(found.x, 0.6, found.z, p);
    return { ...found, sx: Math.round(p.sx), sy: Math.round(p.sy), visible: p.visible, vw: innerWidth, vh: innerHeight };
  });
  if (!silhouette) fail('special-guest-silhouette-missing', shown);
  if (!silhouette.visible || silhouette.sx < 0 || silhouette.sx > silhouette.vw || silhouette.sy < 0 || silhouette.sy > silhouette.vh) {
    fail('special-guest-silhouette-off-screen', silhouette);
  }
  await clearScreen();
  await page.screenshot({ path: path.join(shots, '02-special-guest-380x670.png') });

  // REFUSE.
  await page.locator('.offer-no').click();
  await settle(2.5);
  const afterRefuse = await page.evaluate(() => {
    const G = window.__game;
    let still = false;
    window.__scene.scene.traverse(n => { if (n.name && n.name.startsWith('pet:') && Math.abs(n.position.x - (-8.55)) < 0.2 && Math.abs(n.position.z - 4.2) < 0.2) still = true; });
    return { specialGuest: G.specialGuest, coins: G.coins, silhouette: still, bubble: !document.querySelector('.offer-root').classList.contains('hidden') };
  });
  if (afterRefuse.specialGuest || afterRefuse.coins !== before.coins) fail('special-guest-refuse-changed-state', { before, afterRefuse });
  if (afterRefuse.silhouette) fail('special-guest-silhouette-stayed', afterRefuse);
  if (afterRefuse.bubble) fail('special-guest-asked-twice', afterRefuse);

  // WATCH. The invited pet walks in IMMEDIATELY (systems/customers.js inviteSpecialNow), so the
  // proof is not a pending flag -- it is a pet the book had never seen standing in the café.
  const watched = await page.evaluate(async () => {
    const G = window.__game;
    G.dayState.day = 8; G.dayState.phase = 'morning'; G.dayState.t = 20;
    for (let i = 0; i < 70; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 0)); }
    const metBefore = Object.keys(G.meta.petBook).filter(k => G.meta.petBook[k]);
    document.querySelector('.offer-pill').click();
    await new Promise(r => setTimeout(r, 500));
    const metAfter = Object.keys(G.meta.petBook).filter(k => G.meta.petBook[k]);
    const newlyMet = metAfter.filter(k => !metBefore.includes(k));
    return {
      newlyMet, live: G.customers.filter(c => !c.done).map(c => c.petIdentityKey),
      pending: G.specialGuest, claimed: !!G.meta.rewardedDays['guest:8'],
      rewardIds: window.__rewardIds.slice(),
    };
  });
  if (!watched.claimed) fail('special-guest-not-marked', watched);
  if (!watched.rewardIds.includes('pet-cafe-special-guest')) fail('special-guest-reward-id', watched);
  if (watched.newlyMet.length < 1) fail('special-guest-brought-nobody-new', watched);
  if (!watched.live.includes(watched.newlyMet[0])) fail('special-guest-is-not-in-the-cafe', watched);
  if (watched.pending) fail('special-guest-invitation-left-hanging', watched);
  results.specialGuest = { shown, silhouette, ...watched };
}

// ---- 3. HELPER PUP: a courier with a crate during a rush ---------------------------------------
{
  // A REAL rush, not a hand-set flag: the owner stands still in the middle of the room, every
  // counter and oven is empty, and the sim runs until guests have genuinely queued and waited.
  // sim/customers.js rewrites a customer's state every tick, so a hand-set 'queue' guest would be
  // gone by the next frame and the trigger this proves would not be the one the player meets.
  const runRush = () => page.evaluate(async () => {
    const G = window.__game;
    G.P.x = 1.2; G.P.z = 1.6; G.P.vx = 0; G.P.vz = 0;    // clear of every pad, facing the counters the courier walks to
    for (const st of G.world.stations.values()) {
      if (!st.active) continue;
      if (st.type === 'display' || st.buffer) st.stock = 0;
    }
    for (let i = 0; i < 1400; i++) {
      G.update(0.05);
      if (i % 40 === 0) await new Promise(r => setTimeout(r, 0));
      for (const st of G.world.stations.values()) if (st.active && st.buffer) st.stock = 0; // nothing ever gets baked
      const root = document.querySelector('.offer-root');
      if (root && !root.classList.contains('hidden')) break;
    }
    // Let the courier actually WALK IN before the shot -- it enters at the café door and trots to
    // the emptiest counter, so a frame taken the instant the bubble appears shows an empty room and
    // proves nothing. Any pet-discovery card in the way is waited out for the same reason.
    for (let i = 0; i < 48; i++) { G.update(0.05); await new Promise(r => setTimeout(r, 6)); }
    const waiting = G.customers.filter(c => !c.done && c.mood === 'wait').length;
    const stock = {}; for (const id of G.world.displays) stock[id] = G.world.stations.get(id).stock;
    return { coins: G.coins, stock, waiting, guests: G.customers.length };
  });
  await seedCafe(0, 9, 'rush', 70);
  const before = await runRush();
  const shown = await bubble();
  if (!shown) fail('helper-pup-bubble-missing', before);
  if (/[A-Za-z]{2,}/.test(shown.value)) fail('helper-pup-value-is-a-word', shown);
  // Read the courier AFTER the screen has cleared, not before: the café keeps running while a
  // discovery card plays out, and the pup keeps walking. A position measured a few seconds early is
  // a position it is no longer standing in, which is how the first pass produced a close-up of an
  // empty floor tile.
  await clearScreen();
  const pup = await page.evaluate(() => {
    let found = null;
    window.__scene.scene.traverse(node => {
      if (found || node.userData?.petCafeOffer !== 'helperPup') return;
      const p = { sx: 0, sy: 0, visible: false };
      window.__game.fx.project(node.position.x, 0.5, node.position.z, p);
      found = { x: +node.position.x.toFixed(2), z: +node.position.z.toFixed(2), sx: Math.round(p.sx), sy: Math.round(p.sy), visible: p.visible, vw: innerWidth, vh: innerHeight };
    });
    return found;
  });
  if (!pup) fail('helper-pup-courier-missing', shown);
  if (!pup.visible || pup.sx < 0 || pup.sx > pup.vw || pup.sy < 0 || pup.sy > pup.vh) fail('helper-pup-courier-off-screen', pup);
  await page.screenshot({ path: path.join(shots, '03-helper-pup-380x670.png') });
  // A close crop on the courier itself, so the probe's "it is on screen" claim can be read by eye
  // rather than taken on trust at 380 px.
  await page.screenshot({
    path: path.join(shots, '03b-helper-pup-closeup.png'),
    clip: { x: Math.max(0, pup.sx - 70), y: Math.max(0, pup.sy - 90), width: 140, height: 140 },
  });

  // REFUSE.
  await page.locator('.offer-no').click();
  await settle(2.5);
  const afterRefuse = await page.evaluate(async () => {
    const G = window.__game;
    for (let i = 0; i < 120; i++) { G.update(0.05); if (i % 40 === 0) await new Promise(r => setTimeout(r, 0)); }
    const stock = {}; for (const id of G.world.displays) stock[id] = G.world.stations.get(id).stock;
    return { coins: G.coins, stock, bubble: !document.querySelector('.offer-root').classList.contains('hidden') };
  });
  if (afterRefuse.coins !== before.coins) fail('helper-pup-refuse-changed-coins', { before, afterRefuse });
  for (const id of Object.keys(before.stock)) {
    if (afterRefuse.stock[id] !== before.stock[id]) fail('helper-pup-refuse-restocked-anyway', { before, afterRefuse });
  }
  if (afterRefuse.bubble) fail('helper-pup-asked-twice', afterRefuse);

  // WATCH: every counter, machine and supply fills, and waiting patience comes back.
  await page.evaluate(() => { window.__game.dayState.day = 10; });
  const rushAgain = await runRush();
  if (!(await bubble())) fail('helper-pup-did-not-return-the-next-day', rushAgain);
  const watched = await page.evaluate(async () => {
    const G = window.__game;
    const coinsBefore = G.coins;
    const thirsty = G.customers.filter(c => !c.done && c.mood === 'wait').map(c => ({ id: c.id, patience: c.patience }));
    document.querySelector('.offer-pill').click();
    await new Promise(r => setTimeout(r, 400));
    // The café keeps running while the ad resolves, so a guest may already have taken a cookie off
    // a counter the pup just filled. What must be true is that NOTHING is empty any more and the
    // room is full to within a take or two -- not that a frozen snapshot reads exactly capacity.
    let bare = 0, stocked = 0, capacity = 0;
    for (const id of G.world.displays) {
      const st = G.world.stations.get(id); if (!st.active) continue;
      if ((st.stock | 0) <= 0) bare++;
      stocked += st.stock | 0; capacity += st.capacity | 0;
    }
    const after = thirsty.map(t => { const c = G.customers.find(x => x.id === t.id); return c ? c.patience : null; });
    return {
      coinsBefore, coinsAfter: G.coins, bareCountersAfter: bare, stocked, capacity,
      patienceBefore: thirsty.map(t => t.patience), patienceAfter: after,
      claimed: !!G.meta.rewardedDays['service:10'], rewardIds: window.__rewardIds.slice(),
    };
  });
  if (watched.bareCountersAfter !== 0) fail('helper-pup-left-a-counter-empty', watched);
  if (watched.stocked < watched.capacity - 3) fail('helper-pup-left-the-room-short', watched);
  if (watched.coinsAfter !== watched.coinsBefore) fail('helper-pup-changed-coins', watched);
  const refreshed = watched.patienceBefore.some((p, i) => watched.patienceAfter[i] != null && watched.patienceAfter[i] > p);
  if (watched.patienceBefore.length && !refreshed) fail('helper-pup-did-not-refresh-patience', watched);
  if (!watched.claimed) fail('helper-pup-not-marked', watched);
  if (!watched.rewardIds.includes('pet-cafe-helper-pup')) fail('helper-pup-reward-id', watched);
  results.helperPup = { shown, pup, ...watched };
}

// ---- 4. THE DAY SUMMARY ×2 ----------------------------------------------------------------------
{
  const opened = await page.evaluate(async () => {
    const G = window.__game;
    // `_ended` is what src/sim/day.js's own dayEnd sets, and src/game.js finishDayTransition
    // refuses to run without it — a summary opened with it false has a CONTINUE that does nothing
    // and leaves the sheet (and its modal) up for the rest of the session.
    G.dayState.day = 11; G.dayState.t = 240; G.dayState._ended = true; G.dayStats.earned = 1240;
    G.dev.openDaySummary();
    await new Promise(r => setTimeout(r, 250));
    const btn = document.querySelector('.ds-bonus');
    return {
      present: !!btn,
      text: btn ? (btn.textContent || '').replace(/\s+/g, ' ').trim() : '',
      badge: btn ? (btn.querySelector('.ds-bonus-badge')?.textContent || '').trim() : '',
      x2: btn ? (btn.querySelector('.ds-bonus-x2')?.textContent || '').trim() : '',
      aria: btn ? btn.getAttribute('aria-label') : '',
      h: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
      coins: G.coins,
    };
  });
  if (!opened.present) fail('summary-bonus-missing', opened);
  if (opened.x2 !== '×2') fail('summary-bonus-not-framed-as-double', opened);
  if (opened.h < 48) fail('summary-bonus-tap-target', opened);
  await page.screenshot({ path: path.join(shots, '04-summary-x2-380x670.png') });

  const claimed = await page.evaluate(async () => {
    const G = window.__game, before = G.coins;
    document.querySelector('.ds-bonus').click();
    await new Promise(r => setTimeout(r, 500));
    return { before, after: G.coins, marked: !!G.meta.rewardedDays[11], rewardIds: window.__rewardIds.slice() };
  });
  if (claimed.after <= claimed.before) fail('summary-bonus-paid-nothing', claimed);
  if (!claimed.marked) fail('summary-bonus-not-marked', claimed);
  if (!claimed.rewardIds.includes('pet-cafe-day-bonus-coins')) fail('summary-bonus-reward-id', claimed);
  results.summary = { ...opened, ...claimed };
}

// ---- 5. THE DAILY GIFT: free, with an optional ▶ -------------------------------------------------
{
  const card = await page.evaluate(async () => {
    const G = window.__game;
    // Close the summary first: only one sheet at a time.
    document.querySelector('.ds-card .continue')?.click();
    // CONTINUE may go through an interstitial (day 11 is on the 3, 5, 7 ... cadence), so wait for
    // the sheet to actually leave rather than for a fixed beat.
    for (let i = 0; i < 60 && document.querySelector('.ds-card'); i++) await new Promise(r => setTimeout(r, 100));
    G.meta.rewards.calendar = { lastKey: null, streak: 0 };
    const opened = G.openDailyGiftCard();
    await new Promise(r => setTimeout(r, 250));
    const free = document.querySelector('.gift-free'), dbl = document.querySelector('.gift-double');
    return {
      opened, visible: !document.querySelector('.gift-root').classList.contains('hidden'),
      freeLabel: free ? (free.textContent || '').trim() : '', freeAria: free ? free.getAttribute('aria-label') : '',
      freeH: free ? Math.round(free.getBoundingClientRect().height) : 0,
      doubleHidden: dbl ? dbl.hidden : true, doubleAd: dbl ? (dbl.querySelector('.gift-ad')?.textContent || '').trim() : '',
      pips: document.querySelectorAll('.gift-pip').length,
      coins: G.coins,
    };
  });
  if (!card.visible) fail('gift-card-missing', card);
  if (card.pips !== 7) fail('gift-card-pips', card);
  if (card.doubleHidden) fail('gift-card-double-missing', card);
  if (card.freeH < 48) fail('gift-card-tap-target', card);
  await page.screenshot({ path: path.join(shots, '05-daily-gift-380x670.png') });

  // The FREE claim pays with no ad at all — the whole point of §1.7.4.
  const freeClaim = await page.evaluate(async () => {
    const G = window.__game, before = G.coins, adsBefore = window.__rewardIds.length;
    document.querySelector('.gift-free').click();
    await new Promise(r => setTimeout(r, 500));
    return { before, after: G.coins, adsBefore, adsAfter: window.__rewardIds.length, streak: G.meta.rewards.calendar.streak, cardOpen: !document.querySelector('.gift-root').classList.contains('hidden') };
  });
  if (freeClaim.after - freeClaim.before !== 120) fail('gift-free-claim-amount', freeClaim);
  if (freeClaim.adsAfter !== freeClaim.adsBefore) fail('gift-free-claim-asked-for-an-ad', freeClaim);
  if (freeClaim.streak !== 1) fail('gift-streak', freeClaim);

  // ...and the ▶ doubles the NEXT day's slot.
  const doubled = await page.evaluate(async () => {
    const G = window.__game;
    G.meta.rewards.calendar = { lastKey: '1999-01-01', streak: 1 };
    G.openDailyGiftCard();
    await new Promise(r => setTimeout(r, 200));
    const before = G.coins;
    document.querySelector('.gift-double').click();
    await new Promise(r => setTimeout(r, 600));
    return { before, after: G.coins, rewardIds: window.__rewardIds.slice(), streak: G.meta.rewards.calendar.streak };
  });
  if (doubled.after - doubled.before !== 400) fail('gift-double-amount', doubled);
  if (!doubled.rewardIds.includes('pet-cafe-daily-gift-double')) fail('gift-double-reward-id', doubled);
  // A missed real day PAUSES the streak (it was 1 on 1999-01-01, so today is slot 2 = 200 × 2).
  if (doubled.streak !== 2) fail('gift-streak-reset-after-a-gap', doubled);
  // THE SECOND DOOR: the Café card's gift tile. It is the surface ship plan §1.5 lists ("a Daily-gift
  // tile only when claimable"), and a tile that opens nothing is exactly the defect this batch is
  // about — so it is driven, not assumed.
  const tile = await page.evaluate(async () => {
    const G = window.__game;
    G.meta.rewards.calendar = { lastKey: null, streak: 0 };
    document.querySelector('.pause-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const btn = document.querySelector('.cc-gift');
    const shown = !!btn && !btn.hidden;
    const label = btn ? (btn.textContent || '').trim() : '';
    if (shown) btn.click();
    await new Promise(r => setTimeout(r, 300));
    const giftOpen = !document.querySelector('.gift-root').classList.contains('hidden');
    const cafeOpen = !document.querySelector('.pause-root').classList.contains('hidden');
    return { shown, label, giftOpen, cafeOpen, paused: !!G.userPaused };
  });
  if (!tile.shown) fail('gift-tile-missing-while-claimable', tile);
  if (!tile.giftOpen) fail('gift-tile-opened-nothing', tile);
  if (tile.cafeOpen) fail('gift-tile-left-the-cafe-card-open', tile);
  if (!tile.paused) fail('gift-card-does-not-pause-the-cafe', tile);
  await page.screenshot({ path: path.join(shots, '06-gift-tile-380x670.png') });
  await page.evaluate(() => document.querySelector('.gift-later').click());

  // ...and the tile is GONE once today's gift is taken, rather than offering a slot that pays 0.
  const afterClaim = await page.evaluate(async () => {
    const G = window.__game;
    await G.claimDailyGift(false);
    document.querySelector('.pause-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const btn = document.querySelector('.cc-gift');
    const hidden = !btn || btn.hidden;
    const cardOpen = !document.querySelector('.pause-root').classList.contains('hidden');
    const giftOpen = !document.querySelector('.gift-root').classList.contains('hidden');
    document.querySelector('[data-action="resume"]').click();
    await new Promise(r => setTimeout(r, 200));
    return { hidden, cardOpen, giftOpen, paused: !!G.userPaused, body: document.body.className,
      sheets: [...document.querySelectorAll('.card, .sheet, [role="dialog"]')].map(e => e.className).slice(0, 6),
      state: G.dailyGiftState() };
  });
  if (!afterClaim.hidden || afterClaim.state) fail('gift-tile-still-offers-a-claimed-gift', afterClaim);

  results.dailyGift = { card, freeClaim, doubled, tile, afterClaim };
}

if (errors.length) throw new Error(`page errors: ${JSON.stringify(errors.slice(0, 4))}`);
console.log(JSON.stringify(results, null, 1));
console.log(`OK — four offers driven, each refused and then watched; shots in ${shots}`);
await ctx.close(); await browser.close(); await new Promise(r => server.close(r));
