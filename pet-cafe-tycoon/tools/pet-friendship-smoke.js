// Browser acceptance for persistent pet friendship: successful checkout -> promotion -> book UI -> save round-trip.
//
// Repaired 2026-09-20 (docs/SHIP-PLAN-2026-09-19.md Batch D, "one simple menu"): the Pet Book lost
// its own page-nav chrome and .pet-friendship-* markup. The promotion toast is now queued through
// the shared moment sink ui/moments.js paints as `.toast.toast-friend` (src/systems/petFriendship.js
// still emits the identical cue: the pet's name drawn, "<name> is now a <tier> ♥" as the aria
// sentence). The book itself opens straight from the play field's `.meta-pawbook` chip (src/ui/
// meta.js) -- there is no more pause-menu sub-page to click through -- and a pet's card is
// `.pb-card[data-pet-key="cat:0"]`; its filled hearts are `.pb-marks i:not(.off)` and its tier name
// rides in the card's own aria-label. Visit count and photo stars only ever printed a sentence in
// the OPEN DETAIL view (`.pb-detail-row`'s aria-label: "<tier>, <n> visits, ..."), never on the grid
// card, so this smoke opens the pet's detail to read them. `.meta-book-sub` never existed in this
// UI generation and is not tested.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist missing: run npm run build first');
const shots = path.resolve('shots-production', 'pet-friendship');
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
await new Promise(resolve => server.listen(4501, '127.0.0.1', resolve));

const mockSdk = `
window.__saved=[];
window.ytgame={IN_PLAYABLES_ENV:true,
  game:{firstFrameReady(){},gameReady(){window.__ready=true},async loadData(){return ''},async saveData(raw){window.__saved.push(raw);return true}},
  system:{isAudioEnabled(){return true},onAudioEnabledChange(){},onPause(){},onResume(){},getLanguage(){return 'en'}},
  engagement:{sendScore(){}},ads:{async requestRewardedAd(){return true},async requestInterstitialAd(){return true}}
};
`;

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
await page.route('https://www.youtube.com/game_api/v1', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: mockSdk }));
await page.goto('http://127.0.0.1:4501/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__petFriendship && window.__ready && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 30000 });

// Seed Marmalade as a discovered New Face with one successful visit. A synthetic checkout event is
// intercepted synchronously and removed before the simulation can consume it, so this test isolates
// the relationship observer from the economy and customer state machine.
const promotion = await page.evaluate(() => {
  const G = window.__game;
  G.meta.petBook['cat:0'] = 1;
  G.meta.petDiscoveries = Math.max(G.meta.petDiscoveries | 0, 1);
  G.meta.petFriendship['cat:0'] = 1;
  const coins = G.coins;
  const fake = { id: 991001, species: 'cat', petVariant: 0 };
  G.customers.push(fake);
  // A SETTLED visit — a pet that sat at one of your tables — is what the friendship ladder
  // reads now, not a payment. See the note on the subscription in systems/petFriendship.js.
  G.world.emit({ type: 'settled', id: fake.id, seatId: 'seat1', x: 0, z: 0 });
  G.world.events.length = 0;
  G.customers.pop();
  const save = G.snapshot();
  return {
    coinsBefore: coins, coinsAfter: G.coins,
    visits: G.meta.petFriendship['cat:0'],
    promotionKey: window.__petFriendship.lastPromotionKey,
    savedVisits: save.meta && save.meta.petFriendship && save.meta.petFriendship['cat:0'],
    save,
  };
});
if (promotion.coinsAfter !== promotion.coinsBefore) throw new Error(`friendship changed economy: ${JSON.stringify(promotion)}`);
if (promotion.visits !== 2 || promotion.savedVisits !== 2 || promotion.promotionKey !== 'cat:0') throw new Error(`friendship promotion/save failed: ${JSON.stringify(promotion)}`);

// The shared toast sink (ui/moments.js) draws the pet's name as its visible cue and carries the full
// sentence in aria-label; `.toast-friend` is the tone systems/petFriendship.js's announce() passes.
await page.waitForFunction(() => {
  const el = document.querySelector('.toast.toast-friend');
  return el && el.classList.contains('show') && /Marmalade/.test(el.textContent || '')
    && /Marmalade is now a Regular/i.test(el.getAttribute('aria-label') || '');
}, null, { timeout: 2000 });

// The book opens straight from the play-field chip -- no pause-menu page to click through anymore.
await page.click('.meta-pawbook');
await page.waitForFunction(() => {
  const root = document.querySelector('.meta-book-root');
  const card = document.querySelector('.pb-card[data-pet-key="cat:0"]');
  return root && !root.classList.contains('hidden') && card && /Regular/i.test(card.getAttribute('aria-label') || '');
}, null, { timeout: 3000 });

const book = await page.evaluate(() => {
  const root = document.querySelector('.meta-book-root');
  const card = document.querySelector('.pb-card[data-pet-key="cat:0"]');
  const rr = root.querySelector('.meta-book').getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  return {
    cardAria: card.getAttribute('aria-label') || '',
    filledHearts: card.querySelectorAll('.pb-marks i:not(.off)').length,
    book: { left: rr.left, top: rr.top, right: rr.right, bottom: rr.bottom },
    card: { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom },
    overflow: document.body.scrollWidth > innerWidth + 1,
  };
});
if (!/Regular/i.test(book.cardAria) || book.filledHearts !== 1) {
  throw new Error(`friendship card tier failed: ${JSON.stringify(book)}`);
}
if (book.overflow || book.book.left < -1 || book.book.right > 321 || book.book.bottom > 569 || book.card.left < -1 || book.card.right > 321) {
  throw new Error(`friendship book geometry failed: ${JSON.stringify(book)}`);
}

// Visits and photo stars only ever print inside the open detail view.
await page.click('.pb-card[data-pet-key="cat:0"]');
await page.waitForFunction(() => !document.querySelector('.pb-detail')?.hidden, null, { timeout: 2000 });
const detail = await page.evaluate(() => ({
  aria: document.querySelector('.pb-detail-row')?.getAttribute('aria-label') || '',
}));
if (!/Regular/i.test(detail.aria) || !/2 visits/i.test(detail.aria)) throw new Error(`friendship detail copy failed: ${JSON.stringify(detail)}`);
await page.screenshot({ path: path.join(shots, '01-regular-detail.png') });
await page.click('.pb-back');
await page.click('.meta-book-close');

// Reach Friend, verify progress becomes visible, then save/restore and ensure the exact counter survives.
const friend = await page.evaluate(() => {
  const G = window.__game;
  const emit = () => {
    const fake = { id: 991002, species: 'cat', petVariant: 0 };
    G.customers.push(fake); G.world.emit({ type: 'settled', id: fake.id, seatId: 'seat1', x: 0, z: 0 });
    G.world.events.length = 0; G.customers.pop();
  };
  emit(); emit(); emit(); // 2 -> 5 visits = Friend
  window.__petFriendship.refresh();
  const save = G.snapshot();
  G.meta.petFriendship['cat:0'] = 99;
  G.restore(save);
  window.__petFriendship.refresh();
  return { visits: G.meta.petFriendship['cat:0'], saved: save.meta.petFriendship['cat:0'], promotionKey: window.__petFriendship.lastPromotionKey };
});
if (friend.visits !== 5 || friend.saved !== 5 || friend.promotionKey !== 'cat:0') throw new Error(`Friend save round-trip failed: ${JSON.stringify(friend)}`);

await page.click('.meta-pawbook');
await page.waitForFunction(() => {
  const card = document.querySelector('.pb-card[data-pet-key="cat:0"]');
  return card && /Friend/i.test(card.getAttribute('aria-label') || '');
}, null, { timeout: 2000 });
await page.click('.pb-card[data-pet-key="cat:0"]');
await page.waitForFunction(() => !document.querySelector('.pb-detail')?.hidden, null, { timeout: 2000 });
const restoredBook = await page.evaluate(() => {
  const card = document.querySelector('.pb-card[data-pet-key="cat:0"]');
  return {
    cardAria: card.getAttribute('aria-label') || '',
    filledHearts: card.querySelectorAll('.pb-marks i:not(.off)').length,
    detailAria: document.querySelector('.pb-detail-row')?.getAttribute('aria-label') || '',
  };
});
if (!/Friend/i.test(restoredBook.cardAria) || restoredBook.filledHearts !== 2 || !/5 visits/i.test(restoredBook.detailAria)) {
  throw new Error(`restored friendship UI failed: ${JSON.stringify(restoredBook)}`);
}
await page.screenshot({ path: path.join(shots, '02-friend-restored.png') });
await page.click('.pb-back');
await page.click('.meta-book-close');

// Pre-friendship saves must restore cleanly with no fabricated relationship progress.
const migrated = await page.evaluate(() => {
  const G = window.__game, old = G.snapshot();
  delete old.meta.petFriendship;
  G.restore(old); window.__petFriendship.refresh();
  return { map: { ...G.meta.petFriendship }, snapshot: { ...(G.snapshot().meta.petFriendship || {}) } };
});
if (Object.keys(migrated.map).length || Object.keys(migrated.snapshot).length) throw new Error(`old-save friendship migration failed: ${JSON.stringify(migrated)}`);

console.log(JSON.stringify({ promotion: { ...promotion, save: undefined }, book, detail, friend, restoredBook, migrated }, null, 2));
await ctx.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
