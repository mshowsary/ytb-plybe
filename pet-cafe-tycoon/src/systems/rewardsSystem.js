// src/systems/rewardsSystem.js — the daily gift and Golden Hour.
//
// Batch D removed this file's old UI (the calendar button and its modal, and the Mystery Gift,
// Speed-Build, Rare Visitor and Golden Shot chips the calm HUD had hidden anyway). Batch E2 fixes
// what was left of the gift itself (ship plan §1.7.4):
//
//   FREE.       The claim used to BE a rewarded ad. It is free now; an optional ▶ doubles it, and
//               refusing the ▶ still pays the gift in full. An ad that GATES a gift is a toll.
//   A CARD.     It was reachable only from the Café card's tile, which a player has to think to
//               open. A welcome card now shows itself once per real day, the first time the café is
//               running and nothing else is on screen.
//   NEVER RESET. sim/rewards.js advanceCalendar no longer sends a missed day back to slot 1.
//
// Both surfaces — the card here and the tile in ui/pauseMenu.js — go through the SAME G.claimDailyGift,
// so there is one place that grants a gift and one place that advances the streak.
import {
  dayKeyFor, calendarSlotIndex, calendarRewardFor, calendarIsFinalSlot, advanceCalendar,
  normalizeCalendar, calendarDoubledReward, CALENDAR_LENGTH,
} from '../sim/rewards.js';
import { goldenHourForDay, stepGoldenHour } from '../sim/specialDays.js';
import { requestCafeReward } from '../platform/cafeReward.js';
import { REWARD_ID } from './offers.js';
import { openModal, closeModal, isModalOpen } from '../ui/modal.js';
import { giftIcon, sunIcon, coinIcon, checkIcon, sparkleIcon, crossIcon, sackIcon } from '../ui/icons.js';
import { cue } from '../ui/hud.js';

// WHEN THE WELCOME CARD SHOWS ITSELF. Two conditions, both real beats rather than a timer:
//
//   * the café has been running for GIFT_CARD_DELAY_SECONDS, so the first thing the player sees is
//     the CAFÉ (ship plan §1.6's first three seconds), never a card over it; and
//   * THEY HAVE MADE A SALE TODAY. A pure 8-second timer put a modal over the tutorial: measured on
//     tools/first-minute-smoke.js, a phone following the game's own guidance got stuck on lesson
//     step 2 of 4 for the whole 75-second window, because the card pauses the café and the lesson
//     with it. "After the first sale" is what the menu/HUD report recommended in the first place,
//     and it is a moment the player just created rather than a clock they did not start.
//
// A lesson in progress (systems/intro.js) also holds it, for the same reason.
export const GIFT_CARD_DELAY_SECONDS = 8;

const STYLE_ID = 'pet-cafe-gift-card-style';
const fmt = n => Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');

function installStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .gift-root{position:fixed;inset:0;z-index:78;display:grid;place-items:center;padding:max(10px,var(--sat)) max(10px,var(--sar)) max(10px,var(--sab)) max(10px,var(--sal));box-sizing:border-box;background:#251d1a66;backdrop-filter:blur(4px)}
    .gift-root.hidden{display:none}
    .gift-card{width:min(360px,100%);max-height:calc(100svh - 20px);overflow:auto;box-sizing:border-box;border-radius:22px;background:#FFF9F1;color:#3E302B;padding:16px;box-shadow:0 20px 60px #0005;border:1px solid #fff;display:flex;flex-direction:column;gap:12px;align-items:center;font-family:ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif}
    .gift-hero{width:74px;height:74px}.gift-hero svg{width:100%;height:100%;display:block}
    .gift-pips{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}
    .gift-pip{width:26px;height:26px;border-radius:9px;background:#0000000f;display:grid;place-items:center;font:900 11px/1 system-ui,sans-serif;color:#7a6a60}
    .gift-pip.done{background:#e9f8ee;color:#2f7a4a}.gift-pip.now{background:linear-gradient(135deg,#ffe9a8,#ffd27a);color:#5c3d10;transform:scale(1.14)}
    .gift-amount{display:flex;align-items:center;gap:8px;font:950 38px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
    .gift-amount i{width:32px;height:32px;display:inline-flex}.gift-amount i svg{width:100%;height:100%;display:block}
    .gift-actions{width:100%;display:flex;flex-direction:column;gap:8px}
    .gift-btn{width:100%;min-height:56px;border:0;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font:950 20px/1 system-ui,sans-serif}
    .gift-btn i{width:24px;height:24px;display:inline-flex}.gift-btn i svg{width:100%;height:100%;display:block}
    .gift-free{background:#7FD69A;color:#1f4a31;box-shadow:0 5px 0 #4f9e6b}
    .gift-double{background:linear-gradient(180deg,#9A8CFA,#6F60DC);color:#fff;box-shadow:0 5px 0 #5145AE}
    .gift-double .gift-ad{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;padding:0 6px;box-sizing:border-box;border-radius:8px;background:#ffffff2e;border:1px solid #ffffff66;font:950 11px/1 system-ui,sans-serif;letter-spacing:.06em}
    .gift-btn:disabled{opacity:.55;box-shadow:none;cursor:default}
    .gift-later{min-height:48px;width:100%;border:0;border-radius:14px;background:transparent;color:#3E302B;opacity:.6;font:900 22px/1 system-ui,sans-serif;cursor:pointer}
    @media(max-height:420px){.gift-card{flex-direction:row;flex-wrap:wrap;max-width:min(560px,100%);width:min(560px,100%)}.gift-hero{width:54px;height:54px}.gift-amount{font-size:30px}.gift-actions{flex:1;min-width:210px}}
    @media(max-width:260px),(max-height:260px){.gift-card{padding:9px;gap:8px}.gift-hero{display:none}.gift-amount{font-size:26px}.gift-btn{min-height:48px;font-size:17px}.gift-pip{width:20px;height:20px;font-size:10px}}
  `;
  document.head.appendChild(s);
}

function createGiftCard() {
  installStyle();
  const root = document.createElement('div');
  root.className = 'gift-root hidden'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="gift-card" role="dialog" aria-modal="true" aria-label="Today's gift">
      <span class="gift-hero" aria-hidden="true">${giftIcon()}</span>
      <div class="gift-pips" aria-hidden="true"></div>
      <div class="gift-amount" aria-hidden="true"><i>${coinIcon()}</i><b></b></div>
      <div class="gift-actions">
        <button type="button" class="gift-btn gift-free"><i>${checkIcon()}</i><span></span></button>
        <button type="button" class="gift-btn gift-double"><span class="gift-ad"></span><span>×2</span></button>
        <button type="button" class="gift-later" aria-label="Not now">×</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return {
    root,
    free: root.querySelector('.gift-free'),
    double: root.querySelector('.gift-double'),
    later: root.querySelector('.gift-later'),
    pips: root.querySelector('.gift-pips'),
    amount: root.querySelector('.gift-amount b'),
    ad: root.querySelector('.gift-ad'),
  };
}

export function createRewardsSystem(G, S, platform) {
  const card = typeof document === 'undefined' ? null : createGiftCard();
  const isDev = !platform || !platform.inPlayables;
  let giftBusy = false, cardShownKey = null, cardOpen = false;

  function calendar() {
    return normalizeCalendar(G.meta && G.meta.rewards && G.meta.rewards.calendar);
  }

  /**
   * Today's gift, or null when it is already claimed. ui/pauseMenu.js's tile and the card here
   * both read this, so the tile can never advertise a slot the card would not pay.
   */
  G.dailyGiftState = () => {
    const key = dayKeyFor(Date.now());
    const slot = calendarSlotIndex(calendar(), key);
    if (slot == null) return null;
    const reward = calendarRewardFor(slot);
    return { key, slot, reward, doubled: calendarDoubledReward(reward), final: calendarIsFinalSlot(slot) };
  };

  /**
   * Claim it. FREE by default; `double` asks for the optional rewarded ad first and pays twice as
   * much if the host grants it. A refused or unavailable ad still pays the gift in full — that is
   * the whole point of making the claim free (ship plan rule 5: skipping never costs anything).
   */
  G.claimDailyGift = async (double = false) => {
    if (giftBusy) return { ok: false };
    const before = G.dailyGiftState();
    if (!before) return { ok: false };
    giftBusy = true;
    let doubled = false;
    if (double) {
      // requestCafeReward returns true in preview (no host), false when the host declines.
      doubled = await requestCafeReward(platform, REWARD_ID.gift);
      if (!doubled) G.hud?.toast?.(cue([giftIcon(), crossIcon()], 'Ad unavailable, here is the gift anyway'));
    }
    // Re-read AFTER the ad: it takes 30 s, and the tile or another tab may have claimed in between.
    const now = G.dailyGiftState();
    if (!now || now.key !== before.key) { giftBusy = false; return { ok: false }; }
    const prize = doubled ? now.doubled : now.reward;
    if (!G.meta.rewards) G.meta.rewards = {};
    G.meta.rewards.calendar = advanceCalendar(calendar(), now.key);
    G.coins += prize;
    G.hud?.setCoins?.(G.coins);
    G.hud?.bump?.();
    G.audio?.play?.('chime');
    // The seventh day's grand-opening restock.
    if (now.final) {
      for (const st of G.world.stations.values()) {
        if (st.active && st.capacity) st.stock = st.capacity;
        if (st.active && st.buffer) st.stock = st.buffer;
      }
      G.hud?.banner?.(cue([sparkleIcon(), sackIcon(), checkIcon()], 'Grand opening restock'), 3000);
    }
    G.requestCheckpoint?.('daily-gift');
    if (platform && G.snapshot) platform.save(G.snapshot());
    G.hud?.toast?.(cue([giftIcon(), coinIcon(), `+${prize}`], `Gift claimed, plus ${prize} coins`));
    giftBusy = false;
    return { ok: true, prize, doubled };
  };

  // ---- the welcome card ------------------------------------------------------------------------
  function paint(state) {
    if (!card || !state) return;
    let pips = '';
    for (let i = 0; i < CALENDAR_LENGTH; i++) {
      const cls = i < state.slot ? 'done' : i === state.slot ? 'now' : '';
      pips += `<span class="gift-pip ${cls}">${i + 1}</span>`;
    }
    card.pips.innerHTML = pips;
    card.amount.textContent = fmt(state.reward);
    card.free.querySelector('span').textContent = `+${fmt(state.reward)}`;
    card.free.setAttribute('aria-label', `Claim today's gift, ${fmt(state.reward)} coins, free`);
    card.ad.textContent = isDev ? 'DEV · AD' : 'AD';
    card.double.setAttribute('aria-label', `Watch an ad to double today's gift to ${fmt(state.doubled)} coins`);
    const adReady = !!platform && (platform.rewardedAvailable || !platform.inPlayables) && platform.canRequestAd?.('rewarded') !== false;
    card.double.hidden = !adReady;
  }

  function openCard() {
    const state = G.dailyGiftState();
    // No isModalOpen() guard here: the Café card's gift tile opens this over itself, exactly the
    // way its other three tiles hand over to their sheets. The AUTOMATIC welcome card in update()
    // does check the stack, so a card never lands on top of a sheet the player opened.
    if (!card || !state || cardOpen) return false;
    paint(state);
    cardOpen = true;
    openModal('gift', { close: closeCard });
    card.root.classList.remove('hidden'); card.root.setAttribute('aria-hidden', 'false');
    card.free.focus?.({ preventScroll: true });
    return true;
  }
  function closeCard() {
    if (!cardOpen) return;
    cardOpen = false;
    card.root.classList.add('hidden'); card.root.setAttribute('aria-hidden', 'true');
    closeModal('gift');
  }
  async function claimFrom(double) {
    if (giftBusy) return;
    card.free.disabled = true; card.double.disabled = true;
    const result = await G.claimDailyGift(double);
    card.free.disabled = false; card.double.disabled = false;
    if (result.ok) closeCard();
    else { const state = G.dailyGiftState(); if (state) paint(state); else closeCard(); }
  }
  if (card) {
    card.free.addEventListener('click', () => claimFrom(false));
    card.double.addEventListener('click', () => claimFrom(true));
    card.later.addEventListener('click', closeCard);
    card.root.addEventListener('click', e => { if (e.target === card.root) closeCard(); });
  }
  // Exposed for the smoke and the live probe: open today's card on demand.
  G.openDailyGiftCard = openCard;

  let goldenLerp = 0;
  return {
    openCard, closeCard,
    get cardOpen() { return cardOpen; },
    update(dt) {
      // ONE welcome card per real day, after the player's first sale of the day, once the café has
      // been running for a moment and nothing else owns the screen. cardShownKey makes it once per
      // real day per session; the calendar itself makes it once per real day across sessions.
      const soldToday = ((G.dayStats && G.dayStats.served) | 0) > 0;
      const teaching = !!(G.intro && G.intro.active) || !!(G.firstLook && G.firstLook.activeId);
      // ...and only when nobody is waiting on the player. A free gift is worth a pause, but not
      // mid-rush with a queue at the till: the card stops the café (every sheet does), and the
      // Café card's own gift tile still has it if this moment never comes.
      const busy = (G.dayState && G.dayState.phase === 'rush')
        || (G.customers || []).some(c => !c.done && (c.counter || c.register));
      if (card && !cardOpen && soldToday && !teaching && !busy && G.time >= GIFT_CARD_DELAY_SECONDS && !isModalOpen()) {
        const state = G.dailyGiftState();
        if (state && cardShownKey !== state.key) { cardShownKey = state.key; openCard(); }
      }
      if (!G.golden) return;
      const started = stepGoldenHour(G.golden, goldenHourForDay(G.dayState.day | 0), G.dayState.t, dt);
      if (started) {
        G.hud?.banner?.(cue([sunIcon(), '×', 2], 'Golden hour, double tips'), 3500);
        G.audio?.play?.('chime');
        if (G.fx && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          G.fx.burst(G.P.x, 1.2, G.P.z, '#FFD700', 25);
        }
      }
      // The café's own light warms while Golden Hour runs: that is its whole on-screen sign.
      goldenLerp += ((G.golden.active ? 1 : 0) - goldenLerp) * Math.min(1, dt * 3);
      if (S.setGoldenHour) S.setGoldenHour(goldenLerp);
    },
  };
}
