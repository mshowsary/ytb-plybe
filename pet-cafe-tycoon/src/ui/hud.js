// src/ui/hud.js — the play field's permanent HUD: the wallet and its saving ring. The Pet Book chip
// is ui/meta.js's, the Café button ui/pauseMenu.js's, and every banner and toast is a moment in
// ui/moments.js's queue. Nothing else is permanent (ship plan §1.5).
import {
  sunIcon, personIcon, coinIcon, cupcakeIcon, coffeeIcon, smoothieIcon, treatIcon, icecreamIcon,
  leafIcon, gearIcon, pawIcon, waterIcon, photoIcon,
} from './icons.js';
import { showBanner, showToast } from './moments.js';

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

// The wallet numeral's roll-up, as a clock-driven state with no DOM so it can be tested. frame(now)
// returns the value to draw this frame, or null once there is nothing left to draw (the I8 rule:
// a settled numeral is not re-formatted every frame). The frame that ends a roll ALWAYS returns the
// target itself: a frame gap longer than the roll (a host pause, a background tab, a GC hitch) used
// to skip straight past the in-progress branch, and the wallet kept the old number until the next
// coin change — 9,731,169 on the HUD against 4,210 in the pause card, measured.
export const WALLET_ROLL_MS = 350;
export function createWalletRoll() {
  let shown = 0, target = 0, from = 0, t0 = 0, settled = true;
  return {
    set(n, now) { from = shown; target = n; t0 = now; settled = false; },
    frame(now) {
      if (settled) return null;
      const k = Math.min(1, (now - t0) / WALLET_ROLL_MS);
      if (k < 1) shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
      else { shown = target; settled = true; }
      return shown;
    },
    get shown() { return shown; },
  };
}

// Keyed by zone id -- the only stable handle data/area1.js gives a purchase. An id this table has
// never heard of (anything a designer adds later) falls back to the build
// gear, so a new zone degrades to a vague-but-honest glyph instead of breaking the ring.
const ZONE_ICON = {
  z_seats1: pawIcon, z_oven2: cupcakeIcon, z_register2: coinIcon, z_hire: personIcon,
  z_coffee: coffeeIcon, z_bowl: treatIcon, z_blender: smoothieIcon, z_garden: leafIcon,
  // The garden IS the ice cream stand now (docs/SHIP-PLAN-2026-09-19.md §1.2), so the ring shows a
  // cone rather than a sun; the camera hangs the photo wall, and the deck tables are more tables.
  z_seats2: pawIcon, z_terrace: icecreamIcon, z_photo: photoIcon, z_terraceSeats: pawIcon,
};
// The glyph that stands for a build, wherever a build is the answer: the wallet's ring here, and the
// Shop's locked teasers (ui/sheets.js), which say "this opens with that build" as its picture.
export function zoneGlyph(id) { return (ZONE_ICON[id] || gearIcon)(); }


export function createHud() {
  const hud = document.getElementById('hud'), num = document.getElementById('walletNum'), wallet = document.getElementById('wallet');
  const roll = createWalletRoll();
  const exact = n => Math.round(n).toLocaleString('en-US');
  const fmt = n => {
    const value = Math.max(0, Math.round(n));
    if (innerWidth >= 360 || value < 10000) return exact(value);
    if (value < 1_000_000) return `${(value / 1000).toFixed(value < 100000 ? 1 : 0).replace(/\.0$/, '')}k`;
    return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}m`;
  };
  const H = { walletEl: wallet, coins: 0 };

  // ---- the "saving for" ring (rule at the top of this file, styles in style.css's HUD section) --
  // Its own slot AFTER the numeral, not on the coin: on a phone a four-digit balance sits close
  // enough to the coin that a ring around it reads as circling the NUMBER. Starts hidden: "nothing
  // reachable left" and "no target computed yet" both look like an honest plain wallet.
  const targetEl = document.createElement('span'); targetEl.className = 'wallet-target hidden';
  const ringEl = document.createElement('div'); ringEl.className = 'wallet-ring'; ringEl.setAttribute('aria-hidden', 'true');
  const ringIco = document.createElement('span'); ringIco.className = 'wallet-ring-ico';
  ringEl.appendChild(ringIco); targetEl.appendChild(ringEl);
  num.after(targetEl);
  let savingId = null, savingPrice = 0, ringPct = -1, ringSettled = true, lastBuiltSize = -2;
  const paintRing = coins => {
    if (!savingPrice) return;
    const pct = Math.max(0, Math.min(100, Math.round((coins / savingPrice) * 100)));
    if (pct === ringPct) return;
    ringPct = pct;
    ringEl.style.setProperty('--wallet-progress', pct + '%');
    wallet.classList.toggle('saving-ready', pct >= 100);
  };
  // Takes the catalogue and the built set as arguments because hud.js can reach neither: the rule
  // lives here (pickSavingTarget above) and game.js only forwards `world.area.zones`/`world.built`.
  H.setSavingFor = (zones, built) => {
    // Called every frame; the answer can only change when something is built.
    const size = (built && typeof built.size === 'number') ? built.size : -1;
    if (size === lastBuiltSize) return;
    lastBuiltSize = size;
    const t = pickSavingTarget(zones, built);
    const id = t ? t.id : null;
    if (id === savingId) return;
    savingId = id; savingPrice = t ? t.price : 0; ringPct = -1; ringSettled = false;
    if (t) { ringIco.innerHTML = zoneGlyph(t.id); wallet.classList.add('saving'); targetEl.classList.remove('hidden'); }
    else { ringIco.innerHTML = ''; wallet.classList.remove('saving', 'saving-ready'); targetEl.classList.add('hidden'); }
  };

  // ---- tap the wallet: "point me at what I am saving for" -----------------------------------
  // The wallet is the only number on screen that moves, and the ring says what it is FOR; tapping
  // it asks the game to point at that build pad (G.pointAtNextBuild, wired by main.js). A wallet
  // with no ring (the café is finished) has nothing to point at, so it does nothing.
  let walletAction = null;
  wallet.setAttribute('role', 'button'); wallet.tabIndex = 0;
  const tapWallet = () => { if (walletAction && savingId) walletAction(savingId); };
  wallet.addEventListener('click', tapWallet);
  wallet.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapWallet(); } });
  H.onWalletTap = fn => { walletAction = typeof fn === 'function' ? fn : null; };

  H.setCoins = n => {
    roll.set(n, performance.now()); ringSettled = false;
    const label = `${exact(n)} coins`;
    wallet.title = label; wallet.setAttribute('aria-label', label);
  };
  // Coin changes already roll numerically. A second scale bounce competes with gameplay.
  H.bump = () => {};
  H.show = () => hud.classList.remove('hidden');
  // I8: only touch the DOM while the roll has something to draw (createWalletRoll above) — once it
  // settles, the number is already correct and there's nothing left to (re)format every frame.
  // The ring rides the rolled value, not the target, so it sweeps in step with the numeral.
  H.update = () => {
    const v = roll.frame(performance.now());
    if (v != null) { num.textContent = fmt(v); paintRing(v); }
    else if (!ringSettled) { ringSettled = true; paintRing(roll.shown); }
  };

  // Both sinks are moments now: queued one at a time and held while a sheet is open.
  H.banner = showBanner;
  H.toast = showToast;
  return H;
}
