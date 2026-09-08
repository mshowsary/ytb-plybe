import { createContractBadge } from './contractBadge.js';
import {
  sunIcon, moonIcon, sunriseIcon, sunsetIcon, personIcon, coinIcon, streakIcon, heartIcon,
  cupcakeIcon, coffeeIcon, smoothieIcon, treatIcon, icecreamIcon, leafIcon, gearIcon, pawIcon,
} from './icons.js';
// src/ui/hud.js
import { presentationScheduler } from '../core/presentationScheduler.js';

// ---- play-field cues ---------------------------------------------------------------------------
// Program rule 5: no English prose is DRAWN over the 3D world. Banners, toasts, floating buttons
// and the objective caption therefore take a CUE rather than a sentence -- a row of cells the HUD
// draws, plus the sentence itself, which only a screen reader ever receives.
//
// A cell is one of:
//   '<svg …>'      an authored pictogram (src/ui/icons.js), the same glyphs the HUD pills use
//   12             a numeral -- the one notation that reads identically in every language
//   '+' '→' … a single punctuation glyph, from PUNCT below and from nowhere else
//   { swatch }     a pet portrait (src/ui/petPortrait.js), which needs a taller box than an icon
//   'Marmalade'    any other string is a PROPER NOUN, the only kind of word this may draw
//
// The proper-noun door is the one that needs policing, so test/play-field-text.test.js scans every
// call site in the source and fails on a cell that is a lowercase word or a multi-word string. The
// renderer stays deliberately dumb: it classifies and draws, and does not adjudicate.
const PUNCT = new Set(['+', '-', '−', '×', '→', '≤', '≥', '/', '%', '?', '!', '·', '…']);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function cueHtml(cells) {
  let out = '';
  for (const cell of cells || []) {
    if (cell === null || cell === undefined || cell === '' || cell === false) continue;
    if (typeof cell === 'number') {
      if (!Number.isFinite(cell)) continue;
      out += `<span class="cueNum">${Math.round(cell).toLocaleString('en-US')}</span>`; continue;
    }
    // A portrait is 80x88, not 24x24, so it gets its own box rather than being squashed into a
    // pictogram slot. This is the discovery toast's whole message: which pet just walked in.
    if (typeof cell === 'object' && cell.swatch) { out += `<span class="cueSwatch">${cell.swatch}</span>`; continue; }
    const s = String(cell);
    if (s.startsWith('<svg')) { out += `<span class="cueIco">${s}</span>`; continue; }
    if (PUNCT.has(s)) { out += `<span class="cueOp">${esc(s)}</span>`; continue; }
    out += `<span class="cueName">${esc(s)}</span>`;
  }
  return out;
}
// `aria` is the full sentence, and it is the ONLY place a sentence is allowed to live: assistive
// tech gets every word the play field used to print, and the screen gets none of them.
export function cue(cells, aria) {
  return { cells: Array.isArray(cells) ? cells : [cells], aria: String(aria || '') };
}
export function isCue(value) { return !!value && typeof value === 'object' && Array.isArray(value.cells); }
// Paints a cue (or, for anything not yet converted, plain text) into an element. The glyphs are
// aria-hidden inside icons.js already; the words ride along in a visually-hidden span AND in
// aria-label, because a live region is announced from its text on some readers and from its
// accessible name on others.
export function paintCue(el, value) {
  if (!el) return;
  if (isCue(value)) {
    el.classList.add('cueRow');
    el.innerHTML = cueHtml(value.cells) + (value.aria ? `<span class="cueSr">${esc(value.aria)}</span>` : '');
    if (value.aria) el.setAttribute('aria-label', value.aria); else el.removeAttribute('aria-label');
    return;
  }
  el.classList.remove('cueRow');
  el.removeAttribute('aria-label');
  el.textContent = value === null || value === undefined ? '' : String(value);
}

// ---- the "saving for" ring ---------------------------------------------------------------------
// After the first week the wallet is the only number on screen that still moves, and a number going
// up is not progress -- the complaint this answers is that late game you "only get to stack money".
// The ring wraps the wallet's own coin and fills toward the price of the next thing the player can
// actually buy, with that thing's glyph in the middle, so the coins are visibly FOR something.
//
// THE RULE: the cheapest zone that is not built AND whose `requires` prerequisite IS built.
//
//   * "prerequisite built" is the half that matters. data/area1.js's cheapest unbuilt zone is
//     routinely locked behind a far dearer one -- z_restroom is 3500 but sits three zones past
//     z_terrace at 6500 -- so a plain cheapest-unbuilt ring would sit pinned at 100% pointing at a
//     purchase the game refuses to sell. A ring that points at something absurd is worse than no
//     ring, so an unreachable zone is never a target. (src/game.js's `nextUnlock` for the day
//     summary picks cheapest-unbuilt WITHOUT this filter and does show exactly that wrong zone --
//     reported in this task's handoff; that file is not ours to fix.)
//   * CHEAPEST of the reachable ones, not the largest or the next in the story chain: the ring is
//     here to make the next reward feel near. Aimed at the dearest branch it would read as empty
//     for days on end, which is the very feeling it exists to remove.
//   * Zones only -- not staff hires, machine stars or decor. Those are bought inside station menus
//     at prices that move as you buy them, so the target would flicker frame to frame; zones are
//     the one purchase the player physically walks to and already sees marked on the floor.
//   * Nothing reachable left (the cafe is finished) -> no ring at all and the plain coin returns.
//     Better an honest gold coin than a ring aimed at nothing.
//
// Exported pure so the rule can be tested without a DOM, and so a caller can see it.
export function pickSavingTarget(zones, built) {
  if (!Array.isArray(zones) || !built || typeof built.has !== 'function') return null;
  let best = null;
  for (const z of zones) {
    if (!z || built.has(z.id)) continue;
    if (z.requires && !built.has(z.requires)) continue;
    const price = Number(z.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!best || price < best.price) best = { id: z.id, price };
  }
  return best;
}

// The polaroid that flies to the Pet Book (src/ui/photoGame.js's .polaroid). Duplicated from
// src/ui/serviceSummary.js for the reason stated there: src/ui/icons.js belongs to another task in
// this batch, and all copies should collapse into one icons.js export as soon as it is free.
function photoIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<rect x="3.6" y="3.4" width="16.8" height="17.4" rx="1.8" fill="#FFFDF8" stroke="#7A583A" stroke-width="1.4"/>'
    + '<rect x="5.9" y="5.7" width="12.2" height="9.4" rx="1" fill="#E9DFCE"/>'
    + '<circle cx="12" cy="10.4" r="2.7" fill="#C97A3A"/>'
    + '</svg>';
}

// Keyed by zone id -- the only stable handle data/area1.js gives a purchase. An id this table has
// never heard of (Batch 4's spa chain, or anything a designer adds later) falls back to the build
// gear, so a new zone degrades to a vague-but-honest glyph instead of breaking the ring.
const ZONE_ICON = {
  z_seats1: pawIcon, z_oven2: cupcakeIcon, z_register2: coinIcon, z_hire: personIcon,
  z_coffee: coffeeIcon, z_bowl: treatIcon, z_blender: smoothieIcon, z_garden: leafIcon,
  z_seats2: pawIcon, z_terrace: sunIcon, z_icecream: icecreamIcon, z_register3: coinIcon,
  z_photo: photoIcon, z_terraceSeats: pawIcon,
};

const RING_STYLE_ID = 'pet-cafe-wallet-ring';
function ensureRingStyle() {
  if (document.getElementById(RING_STYLE_ID)) return;
  const s = document.createElement('style'); s.id = RING_STYLE_ID;
  // conic-gradient + an inner disc, the same construction src/ui/contractBadge.js's .contract-ring
  // already uses, so the two progress rings in this HUD are visibly the same device.
  //
  // FOOTPRINT: every rule here is position:absolute inside the existing .coin swatch, plus one
  // `position:relative` that changes no geometry. #wallet's border box is byte-for-byte unchanged,
  // which matters twice: src/ui/labelLayout.js keeps world labels out of that exact rect, and
  // src/ui/hudLayout.js parks the crowd pill 102px to the wallet's right below 420px of height --
  // a wallet already close to that at four digits. Growing the box was never an option.
  // inset:-4px on a 22px coin (17px under body.playables-tiny, and this tracks it automatically
  // because it is relative to the coin, not to the pill) leaves ~10px of clearance to the pill's
  // top and bottom edges and stops ~5px short of the wallet numeral.
  s.textContent = `
    #wallet .coin{position:relative}
    .wallet-ring{position:absolute;inset:-4px;border-radius:50%;display:none;place-items:center;
      background:conic-gradient(var(--accent) var(--wallet-progress,0%),#00000021 0)}
    #wallet.saving .wallet-ring{display:grid}
    /* Full ring = you can buy it now. Green rather than the coral used for urgency elsewhere: this
       is an invitation, not a warning. */
    #wallet.saving-ready .wallet-ring{background:#4FB98A}
    /* The tiny shell squeezes the coin to 17px and the pill's gap to 5px, which leaves the ring
       about 1px short of the numeral at inset:-4. One pixel less overhang buys the gap back
       without touching the pill (src/ui/playablesShell.js owns those sizes, not this file). */
    body.playables-tiny .wallet-ring{inset:-3px}
    .wallet-ring-ico{width:74%;height:74%;border-radius:50%;background:var(--cream,#FFF4E6);
      display:grid;place-items:center}
    .wallet-ring-ico svg{width:74%;height:74%;display:block}
  `;
  document.head.appendChild(s);
}

export function createHud() {
  const $ = id => document.getElementById(id);
  const hud = $('hud'), num = $('walletNum'), wallet = $('wallet'), hint = $('hint'), crowd = $('crowd'), crowdNum = $('crowdNum');
  let shown = 0, target = 0, from = 0, t0 = 0;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const H = { walletEl: wallet, coins: 0 };
  // "Hands full · <product>" tag under the crowd pill — shown while the owner dwells at a
  // different product's station with a non-empty single-product carry (systems/stations.js).
  const handsFullEl = document.createElement('div'); handsFullEl.className = 'pill hidden'; handsFullEl.id = 'handsFull'; hud.appendChild(handsFullEl);
  H.setHandsFull = text => { if (!text) { handsFullEl.classList.add('hidden'); return; } if (handsFullEl.textContent !== text) handsFullEl.textContent = text; handsFullEl.classList.remove('hidden'); };

  // Followers pill (plan 3.3): icon + numeral only, no prose. Position comes entirely from
  // hudLayout.js (the tall-column default AND the short-viewport row reflow), so this file only
  // creates the element and its content.
  const followersEl = document.createElement('div'); followersEl.className = 'pill'; followersEl.id = 'followers';
  followersEl.innerHTML = '<span class="picon">' + heartIcon() + '</span><span class="followersNum">0</span>';
  hud.appendChild(followersEl);
  const followersNum = followersEl.querySelector('.followersNum');
  let lastFollowers = -1;
  H.setFollowers = n => {
    const v = Math.max(0, Math.min(1_000_000, Math.trunc(n) || 0));
    if (v !== lastFollowers) { lastFollowers = v; followersNum.textContent = v.toLocaleString('en-US'); }
  };

  // ---- the "saving for" ring (rule and styles at the top of this file) --------------------------
  ensureRingStyle();
  const coinEl = wallet.querySelector('.coin');
  const ringEl = document.createElement('div'); ringEl.className = 'wallet-ring'; ringEl.setAttribute('aria-hidden', 'true');
  const ringIco = document.createElement('span'); ringIco.className = 'wallet-ring-ico';
  ringEl.appendChild(ringIco);
  // If index.html ever loses the coin swatch the ring simply never exists; the wallet keeps working.
  if (coinEl) coinEl.appendChild(ringEl);
  let savingId = null, savingPrice = 0, ringPct = -1, ringSettled = true, lastBuiltSize = -2;
  const paintRing = coins => {
    if (!savingPrice || !coinEl) return;
    const pct = Math.max(0, Math.min(100, Math.round((coins / savingPrice) * 100)));
    if (pct === ringPct) return;
    ringPct = pct;
    ringEl.style.setProperty('--wallet-progress', pct + '%');
    wallet.classList.toggle('saving-ready', pct >= 100);
  };
  // Takes the catalogue and the built set as arguments because hud.js can reach neither: the rule
  // lives here (pickSavingTarget above) so the ring's WHY stays with the ring, and the call site
  // only forwards `world.area.zones` and `world.built`. See this task's wiringNeeded.
  H.setSavingFor = (zones, built) => {
    if (!coinEl) return;
    // The answer can only change when something is built, and this is called from the frame loop --
    // re-deriving it every frame would sort the zone list 60 times a second for one stable answer.
    const size = (built && typeof built.size === 'number') ? built.size : -1;
    if (size === lastBuiltSize) return;
    lastBuiltSize = size;
    const t = pickSavingTarget(zones, built);
    const id = t ? t.id : null;
    if (id === savingId) return;
    savingId = id; savingPrice = t ? t.price : 0; ringPct = -1; ringSettled = false;
    if (t) { ringIco.innerHTML = (ZONE_ICON[t.id] || gearIcon)(); wallet.classList.add('saving'); }
    else { ringIco.innerHTML = ''; wallet.classList.remove('saving', 'saving-ready'); }
  };

  H.setCoins = n => { from = shown; target = n; t0 = performance.now(); ringSettled = false; };
  let bumpT = null;
  H.bump = () => {
    if (bumpT) presentationScheduler.cancel(bumpT);
    wallet.style.transform = 'scale(1.12)';
    bumpT = presentationScheduler.schedule(() => { wallet.style.transform = ''; bumpT = null; }, 120);
  };
  H.hint = text => { if (!text) { hint.classList.add('hidden'); return; } if (hint.textContent !== text) hint.textContent = text; hint.classList.remove('hidden'); };
  let lastN = -1, lastMax = -1, lastUrgent = null;
  // M3 T5: the crowd pill turns coral with a '!' badge while any customer's patience is under 4s.
  const bang = document.createElement('span'); bang.className = 'bang hidden'; bang.textContent = '!'; crowd.appendChild(bang);
  H.setCrowd = (n, max, urgent) => {
    if (n !== lastN || max !== lastMax) { lastN = n; lastMax = max; crowdNum.textContent = `${n}/${max}`; }
    if (urgent !== lastUrgent) { lastUrgent = urgent; crowd.classList.toggle('urgent', !!urgent); bang.classList.toggle('hidden', !urgent); }
  };
  // Loop v2 Task 3: "Day 3 · Rush" pill with a thin phase-progress bar, and a small goal-text pill
  // just below it — both created here (same pattern as handsFullEl above) rather than in
  // index.html, so this file stays the single source of truth for what's actually in the HUD.
  const dayPillEl = document.createElement('div'); dayPillEl.className = 'pill'; dayPillEl.id = 'dayPill';
  const dayTop = document.createElement('div'); dayTop.className = 'dayTop';
  const dayLabel = document.createElement('span'); dayLabel.id = 'dayLabel';
  dayTop.appendChild(dayLabel);
  const dayBar = document.createElement('div'); dayBar.className = 'dayBar';
  const dayBarFill = document.createElement('div'); dayBarFill.className = 'dayBarFill'; dayBarFill.style.width = '0%';
  dayBar.appendChild(dayBarFill);
  dayPillEl.append(dayTop, dayBar); hud.appendChild(dayPillEl);
  const contract = createContractBadge(dayPillEl);
  H.setContract = (goal, stats, day) => contract.update(goal, stats, day);
  const goalPillEl = document.createElement('div'); goalPillEl.className = 'pill'; goalPillEl.id = 'goalPill'; hud.appendChild(goalPillEl);
  // "Day 3 · Rush" was the longest permanently-visible string in the game and the widest thing in
  // the HUD, which is what pushed the day pill into the pause button on short viewports. The phase
  // is a picture of the sky instead, and the day is just its number -- numerals read in every
  // language, so nothing is lost in translation and the pill is roughly a third the width.
  const PHASE_ICON = { morning: sunriseIcon, rush: sunIcon, afternoon: sunsetIcon, closing: moonIcon };
  let lastDayKey = '', lastGoalKey = '', lastFrac = -1;
  H.setDay = (day, phase, frac) => {
    const key = `${day}:${phase}`;
    if (key !== lastDayKey) {
      lastDayKey = key;
      const icon = (PHASE_ICON[phase] || sunIcon)();
      dayLabel.innerHTML = `<span class="dayIcon">${icon}</span><span class="dayNum">${day}</span>`;
    }
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    if (pct !== lastFrac) { lastFrac = pct; dayBarFill.style.width = pct + '%'; }
  };
  // Contracts are one of three verbs, each with a natural picture: guests served, coins earned,
  // service streak. The target is a number, so the whole pill becomes glyph + numeral.
  const GOAL_ICON = { serve: personIcon, earn: coinIcon, streak: streakIcon };
  H.setGoal = (text, goal = null) => {
    if (!text && !goal) { goalPillEl.classList.add('hidden'); return; }
    const kind = goal && goal.kind;
    const key = goal ? `${kind}:${goal.target}:${goal.rival ? 1 : 0}` : text;
    if (key !== lastGoalKey) {
      lastGoalKey = key;
      if (kind && GOAL_ICON[kind]) {
        const rival = goal.rival ? '<span class="goalRival"></span>' : '';
        goalPillEl.innerHTML = `${rival}<span class="goalIcon">${GOAL_ICON[kind]()}</span><span class="goalNum">${goal.target}</span>`;
      } else {
        goalPillEl.textContent = text;
      }
    }
    goalPillEl.classList.remove('hidden');
  };
  // Loop v2 Task 3: a large top-centre banner ("RUSH HOUR" / "WEEKEND" / "HOLIDAY" / "CLOSING") —
  // slides in, holds for `ms` (default 2500), slides out. A later call while one is showing simply
  // replaces the text and restarts the hold (day-start banners can fire two in a row on a
  // weekend-holiday day; each gets its own full visible window rather than being dropped).
  const bannerEl = document.createElement('div'); bannerEl.className = 'pill hidden'; bannerEl.id = 'banner';
  // The banner draws glyphs now, so its words only exist for assistive tech -- which means it has
  // to be a live region or they would never be announced at all.
  bannerEl.setAttribute('role', 'status'); bannerEl.setAttribute('aria-live', 'polite');
  hud.appendChild(bannerEl);
  let bannerT = null;
  H.banner = (text, ms = 2500) => {
    if (bannerT) presentationScheduler.cancel(bannerT);
    paintCue(bannerEl, text);
    bannerEl.classList.remove('hidden');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    bannerT = presentationScheduler.schedule(() => {
      bannerEl.classList.remove('show');
      bannerT = presentationScheduler.schedule(() => { bannerEl.classList.add('hidden'); bannerT = null; }, 400);
    }, ms);
  };
  H.show = () => hud.classList.remove('hidden');
  // I8: only touch the DOM while the roll animation is actually in progress (k < 1) — once it
  // settles, the number is already correct and there's nothing left to (re)format every frame.
  // The ring rides `shown`, not `target`, so it sweeps in step with the numeral rolling up rather
  // than snapping ahead of it. `shown` is never written once the roll settles (that is the I8
  // optimisation above), so the final percentage is painted once from `target` instead.
  H.update = () => {
    const k = Math.min(1, (performance.now() - t0) / 350);
    if (k < 1) { shown = from + (target - from) * (1 - Math.pow(1 - k, 3)); num.textContent = fmt(shown); paintRing(shown); }
    else if (!ringSettled) { ringSettled = true; paintRing(target); }
  };
  wallet.style.transition = 'transform .12s';

  // toast: a fading pill above the hint, shown for ~1.5 s; at most one pending while one is showing.
  // Remaining display time is preserved across both host and user pauses.
  const toastEl = document.createElement('div'); toastEl.className = 'toast hidden';
  toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
  hud.appendChild(toastEl);
  let toastBusy = false, toastPending = null, toastT = null;
  function runToast(text) {
    toastBusy = true;
    paintCue(toastEl, text);
    toastEl.classList.remove('hidden');
    void toastEl.offsetWidth; // restart the transition
    toastEl.classList.add('show');
    toastT = presentationScheduler.schedule(() => {
      toastEl.classList.remove('show');
      toastT = presentationScheduler.schedule(() => {
        toastEl.classList.add('hidden');
        toastBusy = false; toastT = null;
        if (toastPending !== null) { const next = toastPending; toastPending = null; runToast(next); }
      }, 200);
    }, 1300);
  }
  H.toast = text => { if (toastBusy) toastPending = text; else runToast(text); };
  return H;
}
