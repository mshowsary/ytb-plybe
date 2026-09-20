// src/ui/pauseMenu.js — the Café button and the Café card behind it.
//
// The menu used to be a home page of four tiles leading to four sub-pages (one of them a single
// link), a five-line prose Today card, two shops that duplicated the kiosk, a hidden list of ads and
// a calendar two pages deep: Pet Book 5 taps, mute 5 taps, daily gift 6. It is now ONE page:
//
//   RESUME · one speaker switch (music and effects together; reduced motion in a small row)
//   a glyph-only Today row: the phase clock, today's goal and what it pays, the theme of the day
//   three tiles — Pet Book · Shop · Café Stars — and a Daily-gift tile only on a day it can be claimed
//
// Each tile opens its sheet through ui/modal.js like every other door, so the card itself only
// ever pauses and resumes through that one helper.
import { openModal, closeModal, isModalOpen } from './modal.js';
import { cafeDayModel } from './cafeDayModel.js';
import { createGoalRing, GOAL_ICON } from './contractBadge.js';
import { petBookProgress } from '../sim/petBook.js';
import { pawBestStar, PAW_MAX_STAR } from '../sim/pawRating.js';
import { dayKeyFor, calendarSlotIndex, calendarRewardFor, normalizeCalendar } from '../sim/rewards.js';
import {
  sunriseIcon, sunIcon, sunsetIcon, moonIcon, stopwatchIcon, coinIcon, pawIcon, shopIcon, starIcon,
  giftIcon, speakerIcon, speakerOffIcon, motionIcon, checkIcon, catIcon, dogIcon, bunnyIcon,
  coffeeIcon, cupcakeIcon, smoothieIcon, treatIcon, sparkleIcon,
} from './icons.js';

const STYLE_ID = 'pet-cafe-cafe-card-style';
const cafeMark = () => '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 14h16v6a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" fill="#DDB986" stroke="#3E302B" stroke-width="1.8"/><path d="M23 16h2a3 3 0 0 1 0 6h-2" fill="none" stroke="#3E302B" stroke-width="1.8"/><circle cx="11" cy="10" r="2.1" fill="#D98C82"/><circle cx="20" cy="10" r="2.1" fill="#D98C82"/><circle cx="15.5" cy="7" r="2.2" fill="#D98C82"/><path d="M12 13c1-2.7 6-2.7 7 0-1 2.3-6 2.3-7 0z" fill="#D98C82"/></svg>';
const PHASE_ICON = { morning: sunriseIcon, rush: sunIcon, afternoon: sunsetIcon, closing: moonIcon };
const THEME_ICON = { dog: dogIcon, cat: catIcon, bunny: bunnyIcon, coffee: coffeeIcon, cupcake: cupcakeIcon, smoothie: smoothieIcon, treat: treatIcon };
const fmt = n => Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .pause-root{position:fixed;inset:0;z-index:75;display:grid;place-items:center;padding:max(10px,var(--sat)) max(10px,var(--sar)) max(10px,var(--sab)) max(10px,var(--sal));box-sizing:border-box;background:#251d1a66;backdrop-filter:blur(4px);overflow:hidden}
    .pause-root.hidden{display:none}
    .pause-card{width:min(400px,100%);max-height:calc(100svh - 20px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;border-radius:22px;background:#FFF9F1;color:#3E302B;padding:14px;box-shadow:0 20px 60px #0005;border:1px solid #fff;display:flex;flex-direction:column;gap:10px;font-family:ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif}
    .cc-head{display:flex;align-items:center;gap:10px;min-height:48px}
    .cc-mark{width:34px;height:34px;flex:none}.cc-mark svg{display:block;width:100%;height:100%}
    .cc-title{flex:1;min-width:0;font:900 20px/1.05 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cc-title small{display:block;font:800 12px/1.2 system-ui,sans-serif;opacity:.55;margin-top:3px}
    .cc-sound{width:48px;height:48px;flex:none;border:0;border-radius:14px;background:#80977c1f;display:grid;place-items:center;cursor:pointer}
    .cc-sound svg{width:28px;height:28px;display:block}.cc-sound[aria-pressed="false"]{background:#d98c8220}
    .cc-today{display:flex;flex-wrap:wrap;gap:6px}
    .cc-chip{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 10px;border-radius:12px;background:#fff;font:900 14px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
    .cc-chip i{width:20px;height:20px;display:inline-flex;flex:none}.cc-chip i svg{width:100%;height:100%;display:block}
    .cc-chip.met{background:#e9f8ee;color:#2f7a4a}
    .cc-chip .cc-pay{display:inline-flex;align-items:center;gap:3px;margin-left:2px;padding-left:6px;border-left:1px solid #3e302b1f;font-size:12px;opacity:.75}
    .cc-chip .cc-pay i{width:14px;height:14px}
    .cc-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .cc-tile{min-height:92px;border:1px solid #3e302b12;border-radius:16px;background:#fff;color:#3E302B;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:8px 4px;cursor:pointer;font:900 13px/1.1 system-ui,sans-serif;text-align:center}
    .cc-tile i{width:34px;height:34px;display:block}.cc-tile i svg{width:100%;height:100%;display:block}
    .cc-tile small{font:850 12px/1 system-ui,sans-serif;opacity:.6;font-variant-numeric:tabular-nums}
    .cc-tile[data-tile="pets"]{background:#fff1e8}.cc-tile[data-tile="shop"]{background:#f4efe4}.cc-tile[data-tile="stars"]{background:#fff6dc}
    .cc-gift{min-height:56px;border:0;border-radius:16px;background:linear-gradient(135deg,#ffe9a8,#ffd27a);color:#5c3d10;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;font:950 18px/1 system-ui,sans-serif}
    .cc-gift i{width:30px;height:30px;display:block}.cc-gift i svg{width:100%;height:100%;display:block}
    .cc-gift.claimed{background:#e9f8ee;color:#2f7a4a;cursor:default}
    .cc-motion{min-height:48px;border:0;border-radius:14px;background:transparent;color:#3E302B;display:flex;align-items:center;gap:8px;padding:0 6px;cursor:pointer;font:800 13px/1 system-ui,sans-serif;opacity:.75}
    .cc-motion i{width:24px;height:24px;display:block}.cc-motion i svg{width:100%;height:100%;display:block}
    .cc-motion b{margin-left:auto;min-width:44px;padding:5px 8px;border-radius:9px;background:#ddd8d3;color:#615550;font:900 11px/1 system-ui,sans-serif}
    .cc-motion[aria-pressed="true"] b{background:#80977C;color:#fff}
    .pause-action{width:100%;min-height:52px;border:1px solid #c97970;border-radius:15px;background:#D98C82;color:#2f2420;font:900 16px/1 system-ui,sans-serif;letter-spacing:.04em;cursor:pointer}
    .pause-card button:focus-visible{outline:3px solid #80977C;outline-offset:2px}
    @media(max-width:340px){.pause-card{padding:11px;gap:8px}.cc-tile{min-height:84px;font-size:12px}.cc-tile i{width:30px;height:30px}.cc-chip{font-size:13px;padding:0 8px}}
    /* A short landscape: two columns — the day on the left, the tiles on the right, RESUME across. */
    @media(max-height:480px) and (min-aspect-ratio:5/4){
      .pause-card{width:min(640px,100%);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:12px;align-items:start}
      .cc-head{grid-column:1;grid-row:1}.cc-today{grid-column:1;grid-row:2}.cc-motion{grid-column:1;grid-row:3}
      .cc-tiles{grid-column:2;grid-row:1/3}.cc-gift{grid-column:2;grid-row:3}.pause-action{grid-column:1/3;grid-row:4}
      .cc-tile{min-height:78px}
    }
    /* The publisher's extreme frames (218x418, 418x218, 183px wide): every control must fit on screen
       without scrolling, so the card drops its mark, the tiles keep only their picture and count
       (the name moves to the tile's aria-label) and every row shrinks to the 48px floor. */
    @media(max-width:260px),(max-height:260px){
      .pause-root{padding:4px}
      .pause-card{padding:8px;gap:6px;border-radius:16px;max-height:calc(100svh - 8px)}
      .cc-mark{display:none}.cc-title{font-size:16px}.cc-title small{display:none}
      .cc-chip{min-height:28px;font-size:12px;padding:0 7px}.cc-chip i{width:16px;height:16px}
      .cc-tile{min-height:60px;gap:3px;padding:4px 2px}.cc-tile>span{display:none}.cc-tile i{width:26px;height:26px}
      .cc-gift{min-height:48px;font-size:15px}.cc-gift i{width:24px;height:24px}
      .cc-motion>span{display:none}
      .pause-action{min-height:48px;font-size:14px}
    }
    @media(max-height:260px) and (min-aspect-ratio:5/4){
      .pause-card{width:min(420px,100%);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:8px;row-gap:6px;align-items:start}
      .cc-head{grid-column:1;grid-row:1}.cc-today{grid-column:1;grid-row:2}.cc-motion{grid-column:1;grid-row:3}
      .cc-tiles{grid-column:2;grid-row:1/3;align-self:stretch}.cc-tile{min-height:48px;height:100%}.cc-tile small{display:none}
      .cc-gift{grid-column:2;grid-row:3}.pause-action{grid-column:1/3;grid-row:4}
    }
  `;
  document.head.appendChild(s);
}

export function createPauseMenu(G, platform, routes = {}) {
  installStyle();
  const audio = G.audio;
  if (!G.settings || typeof G.settings !== 'object') G.settings = {};
  if (typeof G.settings.sfx !== 'boolean') G.settings.sfx = true;
  if (typeof G.settings.music !== 'boolean') G.settings.music = true;
  if (typeof G.settings.reducedMotion !== 'boolean') G.settings.reducedMotion = false;

  // ---- the Café button: day badge + today's goal ring ------------------------------------------
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pause-btn'; button.innerHTML = cafeMark();
  const badge = document.createElement('span'); badge.className = 'cafe-day-badge'; button.append(badge);
  const goalRing = createGoalRing(button);
  document.body.appendChild(button);

  // ---- the card ---------------------------------------------------------------------------------
  const root = document.createElement('div'); root.className = 'pause-root hidden'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
      <div class="cc-head"><span class="cc-mark">${cafeMark()}</span><div class="cc-title" id="pauseTitle">Pet Café<small></small></div><button type="button" class="cc-sound" data-setting="sound"></button></div>
      <div class="cc-today" role="group" aria-label="Today"></div>
      <div class="cc-tiles">
        <button type="button" class="cc-tile" data-tile="pets"><i>${pawIcon()}</i><span>Pet Book</span><small></small></button>
        <button type="button" class="cc-tile" data-tile="shop" aria-label="Shop"><i>${shopIcon()}</i><span>Shop</span><small></small></button>
        <button type="button" class="cc-tile" data-tile="stars"><i>${starIcon()}</i><span>Café Stars</span><small></small></button>
      </div>
      <button type="button" class="cc-gift" hidden></button>
      <button type="button" class="cc-motion" data-setting="reducedMotion" aria-label="Reduced motion"><i>${motionIcon()}</i><span>Reduced motion</span><b></b></button>
      <button type="button" class="pause-action" data-action="resume">RESUME</button>
    </div>`;
  document.body.appendChild(root);

  const resumeBtn = root.querySelector('[data-action="resume"]');
  const dayLine = root.querySelector('.cc-title small');
  const soundBtn = root.querySelector('.cc-sound');
  const motionBtn = root.querySelector('.cc-motion');
  const today = root.querySelector('.cc-today');
  const giftBtn = root.querySelector('.cc-gift');
  const tile = name => root.querySelector(`[data-tile="${name}"]`);
  const TILE_ROUTE = { pets: 'pets', shop: 'shop', stars: 'paw' };
  let giftBusy = false;

  const isOpen = () => !root.classList.contains('hidden');
  const soundOn = () => G.settings.music !== false || G.settings.sfx !== false;
  function savePrefs() { if (platform && G.snapshot) platform.save(G.snapshot()); }

  // The daily gift, read from the calendar the rewards system keeps. The tile exists only while
  // today's gift can be claimed AND the claim is wired (G.claimDailyGift); otherwise there is no tile
  // at all rather than a button that does nothing.
  function giftState() {
    if (typeof G.claimDailyGift !== 'function') return null;
    const cal = normalizeCalendar(G.meta && G.meta.rewards && G.meta.rewards.calendar);
    const slot = calendarSlotIndex(cal, dayKeyFor(Date.now()));
    return slot == null ? null : { slot, reward: calendarRewardFor(slot) };
  }

  const chip = (cls, html, aria) => `<span class="cc-chip${cls ? ' ' + cls : ''}" role="img" aria-label="${aria}">${html}</span>`;
  function paintToday() {
    const d = cafeDayModel(G);
    const goal = goalRing.update(G.goal, G.dayStats || {}, d.day);
    let html = chip('', `<i>${(PHASE_ICON[d.phase] || sunIcon)()}</i>${d.clock}`, `${d.phase}, ${d.left} seconds left`);
    if (goal) {
      const pay = goal.reward ? `<span class="cc-pay"><i>${coinIcon()}</i>+${fmt(goal.reward)}</span>` : '';
      html += chip(goal.complete ? 'met' : '', `<i>${GOAL_ICON[goal.kind]()}</i>${Math.min(goal.current, goal.target)}/${goal.target}${pay}`,
        `Today's goal ${Math.min(goal.current, goal.target)} of ${goal.target}${goal.reward ? `, pays ${goal.reward} coins` : ''}`);
    }
    if (d.theme) {
      const icon = (THEME_ICON[d.theme.icon] || sparkleIcon)();
      html += chip(d.theme.met ? 'met' : '', `<i>${icon}</i>${d.theme.count}/${d.theme.target}<span class="cc-pay"><i>${coinIcon()}</i>+${fmt(d.theme.reward)}</span>`,
        `Theme of the day ${d.theme.count} of ${d.theme.target}, pays ${d.theme.reward} coins`);
    }
    today.innerHTML = html;
    dayLine.textContent = `Day ${d.day}`;
  }

  function sync() {
    const on = soundOn();
    audio.setSfx(G.settings.sfx !== false); audio.setMusic(G.settings.music !== false);
    soundBtn.innerHTML = on ? speakerIcon() : speakerOffIcon();
    soundBtn.setAttribute('aria-pressed', String(on)); soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    const calm = G.settings.reducedMotion === true;
    motionBtn.setAttribute('aria-pressed', String(calm)); motionBtn.querySelector('b').textContent = calm ? 'ON' : 'OFF';
    document.body.classList.toggle('reduced-motion', calm);
    paintToday();
    const book = petBookProgress(G.meta || {}), stars = pawBestStar(G.meta);
    tile('pets').querySelector('small').textContent = `${book.found}/${book.total}`;
    tile('pets').setAttribute('aria-label', `Pet Book, ${book.found} of ${book.total} pets`);
    tile('stars').querySelector('small').textContent = `${stars}/${PAW_MAX_STAR}`;
    tile('stars').setAttribute('aria-label', `Café Stars, ${stars} of ${PAW_MAX_STAR}`);
    for (const [name, route] of Object.entries(TILE_ROUTE)) tile(name).hidden = typeof routes[route]?.open !== 'function';
    if (!giftBusy) {
      const gift = giftState();
      giftBtn.hidden = !gift;
      giftBtn.classList.remove('claimed');
      if (gift) {
        giftBtn.innerHTML = `<i>${giftIcon()}</i><span>+${fmt(gift.reward)}</span>`;
        giftBtn.setAttribute('aria-label', `Daily gift, ${gift.reward} coins`);
      }
    }
  }

  function open() {
    if (isOpen() || isModalOpen()) return;
    openModal('cafe', { close });
    root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false'); sync();
    resumeBtn.focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen()) return;
    root.classList.add('hidden'); root.setAttribute('aria-hidden', 'true');
    closeModal('cafe');
    button.focus({ preventScroll: true });
  }
  // A tile opens its sheet FIRST and then closes the card, so the modal stack never empties in
  // between and the café does not unpause for a frame on the way.
  function openTile(name) {
    const route = routes[TILE_ROUTE[name]];
    if (typeof route?.open !== 'function') return;
    audio.play('tap');
    root.classList.add('hidden'); root.setAttribute('aria-hidden', 'true');
    route.open();
    closeModal('cafe');
  }
  async function claimGift() {
    if (giftBusy || giftBtn.hidden || giftBtn.classList.contains('claimed')) return;
    giftBusy = true;
    let result = null;
    try { result = await G.claimDailyGift(); } catch (_) { result = null; }
    if (result && result.ok) {
      giftBtn.classList.add('claimed');
      giftBtn.innerHTML = `<i>${checkIcon()}</i><span>+${fmt(result.prize)}</span>`;
      giftBtn.setAttribute('aria-label', `Daily gift claimed, ${result.prize} coins`);
      setTimeout(() => { giftBusy = false; if (isOpen()) sync(); }, 1400);
    } else { giftBusy = false; sync(); }
  }

  button.addEventListener('click', open);
  resumeBtn.addEventListener('click', close);
  soundBtn.addEventListener('click', () => { const on = !soundOn(); G.settings.music = on; G.settings.sfx = on; sync(); audio.play('tap'); savePrefs(); });
  motionBtn.addEventListener('click', () => { G.settings.reducedMotion = !G.settings.reducedMotion; sync(); audio.play('tap'); savePrefs(); });
  for (const name of Object.keys(TILE_ROUTE)) tile(name).addEventListener('click', () => openTile(name));
  giftBtn.addEventListener('click', claimGift);
  root.addEventListener('click', e => { if (e.target === root) close(); });
  document.addEventListener('keydown', e => {
    if (e.code !== 'KeyP' || e.repeat) return;
    if (isOpen()) { e.preventDefault(); close(); }
    else if (!isModalOpen()) { e.preventDefault(); open(); }
  }, true);

  // Every frame (main.js): the button's badge and ring. Cheap — both repaint only on a change.
  let lastBadge = '';
  function update() {
    const d = cafeDayModel(G);
    const rush = d.phase === 'rush';
    const key = rush ? 'rush' : d.soon ? `soon:${d.left}` : `day:${d.day}`;
    if (key !== lastBadge) {
      lastBadge = key;
      badge.classList.toggle('rush', rush);
      if (rush) badge.innerHTML = stopwatchIcon(); else badge.textContent = d.soon ? `${d.left}s` : `D${d.day}`;
      button.classList.toggle('rush-soon', d.soon);
      button.classList.toggle('rush-on', rush);
    }
    const goal = goalRing.update(G.goal, G.dayStats || {}, d.day);
    const label = `Café menu. Day ${d.day}.${rush ? ' Rush hour.' : d.soon ? ` Rush in ${d.left} seconds.` : ''} ${goalRing.label(goal)}`.trim();
    if (button.getAttribute('aria-label') !== label) { button.setAttribute('aria-label', label); button.title = label; }
  }

  sync(); update();
  return { open, close, sync, update, get isOpen() { return isOpen(); } };
}
