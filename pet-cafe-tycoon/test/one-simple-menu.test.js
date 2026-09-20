// test/one-simple-menu.test.js — Batch D (ship plan §1.5): the Shop's shelves, the Pet Book's
// "something new" rule, what a Café Star gives, the trimmed day summary, and the wiring that puts
// each of them on a path from normal play. Pure models and source checks; the live proof of every
// door is tools/ux-redesign-smoke.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AREA1 } from '../data/area1.js';
import { ACCESSORIES } from '../data/accessories.js';
import { DECOR_BY_ID, decorSetForStar } from '../data/decor.js';
import { createWorld } from '../src/sim/world.js';
import { buildKioskModel, normalizeShopTab, SHOP_TABS, decorTeaser } from '../src/ui/models.js';
import { shopTitle } from '../src/ui/sheets.js';
import { petCardSignature, newPetKeys } from '../src/ui/meta.js';
import { starRewards } from '../src/ui/pawSheet.js';
import { PAW_MAX_STAR, PAW_LEGENDARY_STAR } from '../src/sim/pawRating.js';
import { contractModel } from '../src/ui/contractBadge.js';

const src = rel => fs.readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
const gameAt = (coins = 999999, day = 30) => ({
  coins, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0, photographer: 0 },
  staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
  staffList: [], meta: { decor: [], pawBest: 0 }, dayState: { day }, stars: {},
});
function buildThrough(w, last) {
  for (const z of w.area.zones) {
    w.built.add(z.id);
    for (const id of z.adds) { const st = w.stations.get(id); if (st) st.active = true; }
    if (z.id === last) break;
  }
}

// ---- the Shop ----------------------------------------------------------------------------------

test('the Shop has three tabs, and the old five tab keys land on the tab that now holds their rows', () => {
  assert.deepEqual([...SHOP_TABS], ['staff', 'upgrades', 'decor']);
  assert.equal(normalizeShopTab('workers'), 'staff');
  assert.equal(normalizeShopTab('player'), 'upgrades');
  assert.equal(normalizeShopTab('machines'), 'upgrades');
  assert.equal(normalizeShopTab('decor'), 'decor');
  assert.equal(normalizeShopTab('boutique'), 'upgrades', 'there is no Boutique tab to land on');
});

test('the Shop is titled by the door that opened it', () => {
  assert.equal(shopTitle('staff'), 'Staff');
  assert.equal(shopTitle('shop'), 'Shop');
  assert.equal(shopTitle(null), 'Shop');
});

test('before the staff desk exists the Staff tab is one teaser pointing at the desk, and nothing to hire', () => {
  const w = createWorld(AREA1);
  const m = buildKioskModel(gameAt(), w, 'staff');
  assert.deepEqual(m.workers, []);
  assert.deepEqual(m.staffTeaser.unlock, { kind: 'zone', zoneId: 'z_hire' });
});

test('each tab lists only what can be bought now, plus at most one locked teaser', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_hire');
  const m = buildKioskModel(gameAt(), w, 'upgrades');
  // Staff: the three roles with a desk and no other gate; the Barista is the teaser (no Coffee bar).
  assert.deepEqual(m.workers.map(r => r.kind), ['runner', 'cashier', 'cleaner']);
  assert.equal(m.staffTeaser.kind, 'barista');
  // Upgrades: only active machines get star rows; the first inactive one is the teaser.
  for (const r of m.machines) assert.equal(w.stations.get(r.key).active, true, `${r.key} is buildable now`);
  assert.ok(m.machineTeaser && w.stations.get(m.machineTeaser.key).active === false);
  assert.equal(m.machineTeaser.unlock.kind, 'zone');
  // Décor: the teaser is the next Café Star's set.
  assert.deepEqual(m.decorTeaser.unlock, { kind: 'star', star: 1 });
  assert.ok(decorSetForStar(1).includes(m.decorTeaser.id));
  assert.equal(m.decorTeaser.icon, DECOR_BY_ID.get(m.decorTeaser.id).icon);
});

test('the décor teaser follows the ratchet and disappears when nothing is locked', () => {
  const w = createWorld(AREA1);
  buildThrough(w, null); // everything
  assert.deepEqual(decorTeaser(w.built, 2).unlock, { kind: 'star', star: 3 });
  assert.equal(decorTeaser(w.built, PAW_MAX_STAR), null);
});

test('the staff desk and the kiosk open the SAME sheet; the Café-menu shop copies are gone', () => {
  assert.equal(fs.existsSync(new URL('../src/ui/cafeJournal.js', import.meta.url)), false, 'no "Make service smoother" / "Pet playground" copies');
  assert.match(src('ui/shop.js'), /s\.open\('kiosk', model\(\), actions\)/, 'the Café card opens the one kiosk sheet');
  assert.match(src('main.js'), /G\.uiRoutes\.shop = \{ open: \(\) => G\.openShop\('shop'\) \}/, 'the Café card route is G.openShop');
  assert.match(src('ui/pauseMenu.js'), /stars: 'paw'/);
  assert.match(src('ui/pauseMenu.js'), /shop: 'shop'/, 'the Shop tile reaches that route');
});

// ---- the Pet Book ------------------------------------------------------------------------------

test('"something new" is a found pet, a friendship level, a photo or a better photo — and nothing else', () => {
  const card = (key, o = {}) => ({ key, found: true, friendship: { level: 1 }, album: { shots: 1, best: 0 }, ...o });
  const seen = new Map([['cat:0', petCardSignature(card('cat:0'))], ['dog:0', petCardSignature({ key: 'dog:0', found: false })]]);
  const fresh = cards => [...newPetKeys(seen, cards)];
  assert.deepEqual(fresh([card('cat:0')]), [], 'unchanged');
  assert.deepEqual(fresh([card('cat:0', { friendship: { level: 2 } })]), ['cat:0'], 'a level-up');
  assert.deepEqual(fresh([card('cat:0', { album: { shots: 2, best: 0 } })]), ['cat:0'], 'a new photo');
  assert.deepEqual(fresh([card('cat:0', { album: { shots: 1, best: 2 } })]), ['cat:0'], 'a better photo');
  assert.deepEqual(fresh([{ key: 'dog:0', found: false }]), [], 'still unmet');
  assert.deepEqual(fresh([card('dog:0')]), ['dog:0'], 'met');
  assert.deepEqual(fresh([card('bun:9', { found: false, friendship: null, album: null })]), [], 'an unseen, unmet card is not news');
  assert.deepEqual([...newPetKeys(null, [card('cat:0')])], [], 'the save as it loaded is never news');
});

test('the outfit picker draws the accessory icon with its NAME as the label — never a raw id — and a "none" chip', () => {
  for (const item of ACCESSORIES) {
    assert.ok(item.icon.startsWith('<svg'), `${item.id} has an icon`);
    assert.ok(item.name && !item.name.startsWith('acc_'), `${item.id} has a name`);
  }
  const meta = src('ui/meta.js');
  assert.match(meta, /chip\(item, item\.icon, item\.name\)/);
  assert.match(meta, /chip\(null, noneIcon\(\), 'No outfit'\)/);
  assert.match(meta, /onEquip\(c\.key, item \? item\.id : null\)/, 'the none chip unequips');
  assert.doesNotMatch(meta, /item\.label \|\| item\.id/);
  assert.match(meta, /<i>\$\{lockIcon\(\)\}<\/i><i>\$\{unlockGlyph\(item\)\}<\/i>/, 'a locked chip shows a padlock and its unlock glyph');
});

test('the Pet Book is ONE grid; Discover and Album no longer show the same twenty pets twice', () => {
  const meta = src('ui/meta.js');
  assert.doesNotMatch(meta, /data-tab="discover"|data-tab="album"/);
  assert.match(meta, /\.pb-card\{position:relative;height:136px;/, 'every card is the same height');
});

// ---- Café Stars --------------------------------------------------------------------------------

test('each star lists the rewards the game actually applies at that star', () => {
  for (let s = 1; s <= PAW_MAX_STAR; s++) {
    const kinds = starRewards(s).map(r => r.kind);
    assert.ok(kinds.includes('guests'), `★${s} brings more guests`);
    assert.equal(kinds.includes('decor'), decorSetForStar(s).length > 0, `★${s} lists its décor set iff it has one`);
    assert.equal(kinds.includes('legendary'), s === PAW_LEGENDARY_STAR);
    assert.equal(kinds.includes('golden'), s === PAW_MAX_STAR);
  }
  assert.deepEqual(starRewards(0), []);
  assert.equal(starRewards(1).find(r => r.kind === 'guests').value, '+10%');
});

test('Café Stars keeps the renovation buy and drops the Journey\'s rank, week, mastery and legendary UI', () => {
  assert.match(src('ui/renovation.js'), /\.paw-root \.stars-reno/);
  // ui/career.js is deleted with the Batch D wiring; until then it is a stub with none of its rows.
  const careerUrl = new URL('../src/ui/career.js', import.meta.url);
  if (fs.existsSync(careerUrl)) {
    const career = fs.readFileSync(careerUrl, 'utf8');
    for (const gone of ['career-week', 'career-mastery', 'LEGENDARY', 'career-rank']) assert.doesNotMatch(career, new RegExp(gone));
  }
});

// ---- the day summary ---------------------------------------------------------------------------

test('the day summary is coins, gain chips, the goal, Café Stars, the bonus and Continue — no scolding', () => {
  const ds = src('ui/daySummary.js');
  assert.doesNotMatch(ds, /A little more stock/, 'the tip sentence is gone');
  assert.doesNotMatch(ds, /ds-chip attn|left`\)\)/, 'the coral "n left" chip is gone');
  assert.doesNotMatch(ds, /reputationRow|weekRow/);
  assert.match(ds, /rows\.append\(contractRow\(model\.contract\)\)/);
  assert.match(ds, /if \(model\.stars\) rows\.append\(starsRow\(model\.stars\)\)/);
  assert.match(ds, /model\.newPets > 0/);
  assert.match(ds, /className = 'ds-bonus'/, 'the rewarded bonus keeps its button');
  assert.match(ds, /cont\.className = 'sbtn continue'/);
});

// ---- the HUD -----------------------------------------------------------------------------------

test('the goal ring reads the day\'s real goal and completes it', () => {
  const m = contractModel({ kind: 'serve', target: 20, reward: 150 }, { served: 20 }, 4);
  assert.equal(m.complete, true);
  assert.equal(m.reward, 150);
});

test('the wallet ring is shown, and tapping the wallet reaches G.pointAtNextBuild from normal play', () => {
  const css = src('style.css');
  assert.doesNotMatch(css, /\.wallet-target\{display:none/);
  assert.match(css, /#wallet\.saving \.wallet-ring\{display:grid\}/);
  assert.match(src('ui/hud.js'), /wallet\.addEventListener\('click', tapWallet\)/);
  assert.match(src('main.js'), /G\.hud\.onWalletTap\(zoneId => G\.pointAtNextBuild\?\.\(zoneId\)\)/);
});

test('nothing else is permanent: the hidden HUD nodes and their stylesheets are gone', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="crowd"|id="hint"/);
  const hud = src('ui/hud.js');
  for (const id of ['dayPill', 'goalPill', 'handsFull', 'followers']) assert.doesNotMatch(hud, new RegExp(`id = '${id}'`));
  const meta = src('ui/meta.js');
  assert.doesNotMatch(meta, /meta-streak'|meta-reputation'/);
  for (const f of ['hudLayout', 'cleanHud', 'playablesShell', 'certificationPolish', 'responsive', 'reliefAttention', 'franchiseSheet']) {
    assert.equal(fs.existsSync(new URL(`../src/ui/${f}.js`, import.meta.url)), false, `${f}.js is deleted`);
  }
  const css = src('style.css');
  for (const sel of ['#crowd', '#dayPill', '#goalPill', '#handsFull', '#hint{', '.franchise-offer', '.fr-root']) assert.equal(css.includes(sel), false, `style.css has no rule for ${sel}`);
});

test('the frame loop steps the café with the real frame time and refreshes the Café button every frame', () => {
  const main = src('main.js');
  assert.match(main, /const dt = Math\.min\(0\.05, frameMs \/ 1000\);/);
  assert.match(main, /G\.update\(dt\);/, 'no offer or moment ever rescales the simulation\'s dt');
  assert.match(main, /pauseMenu\.update\(\);/);
});
