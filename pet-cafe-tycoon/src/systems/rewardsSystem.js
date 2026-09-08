// src/systems/rewardsSystem.js — manages the Pawsome Gift Calendar, Mystery Paw Gift, and Golden Hour atmosphere.
import { cafeLevel } from '../sim/economy.js';
import {
  dayKeyFor, calendarSlotIndex, calendarRewardFor, calendarIsFinalSlot,
  advanceCalendar, CALENDAR_LENGTH, CALENDAR_REWARDS,
  mysteryForDay, mysteryCoinsForDay, mysteryRewardKindForDay,
} from '../sim/rewards.js';
import {
  specialForDay, saleMatchesTheme, specialProgress, specialReward,
  goldenHourForDay, createGoldenHourState, stepGoldenHour, goldenHourMult,
} from '../sim/specialDays.js';
import { inShiftClaimedForShift, markRewardedClaim } from '../sim/adPacing.js';
import {
  calendarIcon, giftIcon, sunIcon, pawIcon, coinIcon, checkIcon,
  sparkleIcon, catIcon, dogIcon, bunnyIcon, coffeeIcon, cupcakeIcon, smoothieIcon, treatIcon,
} from '../ui/icons.js';

const STYLE_ID = 'pet-cafe-rewards-style';

function injectRewardsStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .rewards-cal-btn {
      position: fixed;
      right: calc(68px + env(safe-area-inset-right, 0px));
      top: calc(12px + env(safe-area-inset-top, 0px));
      z-index: 15;
      width: 48px;
      height: 48px;
      min-height: 48px;
      padding: 0;
      border: 0;
      border-radius: 16px;
      background: #FFF9F1EE;
      color: #5C3D28;
      font: 900 12px/1 system-ui, sans-serif;
      box-shadow: 0 3px 0 #00000012, 0 6px 14px #00000018;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      transition: transform .14s ease;
    }
    @media(max-width: 520px) {
      .rewards-cal-btn { display: none !important; }
    }
    .rewards-cal-btn:active { transform: scale(0.94); }
    .rewards-cal-btn.ready { animation: calPulse 2s infinite ease-in-out; }
    @keyframes calPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 3px 0 #00000012, 0 6px 14px #FF9A4533; }
      50% { transform: scale(1.06); box-shadow: 0 3px 0 #00000012, 0 8px 18px #FF9A4566; }
    }
    .rewards-cal-icon { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
    .rewards-cal-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #FF4757;
      box-shadow: 0 0 0 2px #FFF; position: absolute; top: 7px; right: 7px;
    }
    .rewards-cal-dot.hidden { display: none; }

    /* Calendar Modal */
    .cal-modal-root {
      position: fixed; inset: 0; z-index: 75;
      display: flex; align-items: center; justify-content: center;
      padding: 16px; box-sizing: border-box;
    }
    .cal-modal-root.hidden { display: none; }
    .cal-backdrop { position: absolute; inset: 0; background: #251D1A88; backdrop-filter: blur(4px); }
    .cal-sheet {
      position: relative; width: min(440px, calc(100vw - 16px)); max-height: min(620px, 86vh);
      box-sizing: border-box; overflow: auto; border-radius: 24px;
      background: #FFF5EA; color: #3B2E2A; padding: 20px;
      box-shadow: 0 20px 60px #00000055; font-family: system-ui, sans-serif;
    }
    .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .cal-title-row { display: flex; align-items: center; gap: 8px; font: 950 20px/1 system-ui, sans-serif; }
    .cal-close {
      width: 48px; height: 48px; min-width: 48px; min-height: 48px; border: 0; border-radius: 50%;
      background: #0000000C; color: #3B2E2A; font-size: 22px; cursor: pointer;
      display: grid; place-items: center;
    }
    .cal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .cal-card {
      min-height: 80px; border-radius: 14px; padding: 8px 4px;
      background: #FFFFFFC8; border: 1px solid #0000000A;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; gap: 4px; position: relative;
    }
    .cal-card.final { grid-column: span 2; background: linear-gradient(135deg, #FFF9D6, #FFE29A); border-color: #FFB30044; }
    .cal-card.claimed { background: #EADFD3; opacity: 0.75; }
    .cal-card.today { border: 2px solid #FF8A80; box-shadow: 0 4px 12px #FF8A8033; }
    .cal-day-num { font: 900 11px/1 system-ui; opacity: 0.55; }
    .cal-reward-row { display: flex; align-items: center; gap: 3px; font: 950 13px/1 system-ui; color: #B37D00; }
    .cal-reward-row svg { width: 14px; height: 14px; }
    .cal-status-icon { width: 18px; height: 18px; }
    .cal-claim-btn {
      width: 100%; min-height: 48px; height: 48px; border: 0; border-radius: 14px;
      background: linear-gradient(135deg, #FF7675, #D63031);
      color: #FFF; font: 950 14px/1 system-ui; letter-spacing: 0.04em;
      box-shadow: 0 4px 0 #A82021, 0 8px 18px #D6303133;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .cal-claim-btn:disabled { opacity: 0.55; cursor: default; background: #C8C2BE; box-shadow: none; }

    /* Mystery Gift Floating Chip */
    .mystery-float-chip {
      position: fixed;
      right: calc(12px + env(safe-area-inset-right, 0px));
      bottom: calc(90px + env(safe-area-inset-bottom, 0px));
      z-index: 18;
      min-height: 48px;
      height: 48px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(135deg, #FFF6D5, #FFD980);
      color: #5C3A10;
      font: 950 13px/1 system-ui;
      box-shadow: 0 4px 0 #C98A0044, 0 8px 22px #FFB30055;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 7px;
      animation: giftBounce 1.8s infinite ease-in-out;
      backdrop-filter: blur(4px);
    }
    .mystery-float-chip.hidden { display: none; }
    @media(max-width: 240px) {
      .mystery-float-chip {
        font-size: 10px !important;
        padding: 0 8px !important;
        max-width: calc(100vw - 20px) !important;
      }
    }
    @keyframes giftBounce {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-6px) scale(1.05); }
    }

    /* Speed-Build Floating Chip (Task 1.7): offered only while the owner stands on a build
       circle that is already >= 40% paid. Shares the mystery chip's fixed-corner convention
       (icon + numeral, no prose) rather than a projected label, so it needs no labelLayout
       registration — same precedent as .mystery-float-chip above. Sits one slot higher so the
       two can never occupy the same pixels if both happen to be eligible at once. */
    .speed-build-chip {
      position: fixed;
      right: calc(12px + env(safe-area-inset-right, 0px));
      bottom: calc(148px + env(safe-area-inset-bottom, 0px));
      z-index: 18;
      min-height: 48px;
      height: 48px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(135deg, #D2F8E0, #6EE7A8);
      color: #123D28;
      font: 950 13px/1 system-ui;
      box-shadow: 0 4px 0 #1B7A4A44, 0 8px 22px #34D17A55;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      animation: speedBuildPulse 1.6s infinite ease-in-out;
      backdrop-filter: blur(4px);
    }
    .speed-build-chip.hidden { display: none; }
    @media(max-width: 240px) {
      .speed-build-chip {
        font-size: 10px !important;
        padding: 0 8px !important;
        max-width: calc(100vw - 20px) !important;
      }
    }
    @keyframes speedBuildPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    /* Golden Hour HUD Indicator */
    .golden-indicator {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 999px;
      background: linear-gradient(135deg, #FFE89C, #FFC107);
      color: #4A3300; font: 950 11px/1 system-ui;
      box-shadow: 0 2px 6px #FFC10744;
      animation: goldenGlow 1.5s infinite alternate ease-in-out;
    }
    .golden-indicator.hidden { display: none; }
    @keyframes goldenGlow {
      from { box-shadow: 0 0 6px #FFD54F66; }
      to { box-shadow: 0 0 16px #FFD54FBB; }
    }
    .golden-indicator svg { width: 14px; height: 14px; }

    /* Special Theme Chip */
    .special-indicator {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 999px;
      background: #FFFFFFD8; border: 1px solid #00000010;
      color: #5C3D28; font: 900 11px/1 system-ui;
    }
    .special-indicator.hidden { display: none; }
    .special-indicator svg { width: 13px; height: 13px; }
  `;
  document.head.appendChild(s);
}

const THEME_ICON_FN = {
  dog: dogIcon,
  cat: catIcon,
  bunny: bunnyIcon,
  coffee: coffeeIcon,
  cupcake: cupcakeIcon,
  smoothie: smoothieIcon,
  treat: treatIcon,
};

export function createRewardsSystem(G, S, platform) {
  injectRewardsStyle();

  // 1. Calendar HUD button
  const calBtn = document.createElement('button');
  calBtn.type = 'button';
  calBtn.className = 'rewards-cal-btn';
  calBtn.setAttribute('aria-label', 'Daily Gift Calendar');
  calBtn.innerHTML = `
    <span class="rewards-cal-icon">${calendarIcon()}</span>
    <span class="rewards-cal-dot hidden"></span>
  `;
  document.body.appendChild(calBtn);
  const calDot = calBtn.querySelector('.rewards-cal-dot');

  // 2. Calendar Modal
  const calRoot = document.createElement('div');
  calRoot.className = 'cal-modal-root hidden';
  calRoot.innerHTML = `
    <div class="cal-backdrop"></div>
    <div class="cal-sheet">
      <div class="cal-head">
        <div class="cal-title-row">
          <span style="width:24px;height:24px;display:inline-block">${giftIcon()}</span>
          <span>PAWSOME CALENDAR</span>
        </div>
        <button class="cal-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="cal-grid"></div>
      <button class="cal-claim-btn" type="button">
        <span style="width:20px;height:20px;display:inline-block">${sparkleIcon()}</span>
        <span>CLAIM TODAY'S GIFT</span>
      </button>
    </div>
  `;
  document.body.appendChild(calRoot);

  const calGrid = calRoot.querySelector('.cal-grid');
  const calClaimBtn = calRoot.querySelector('.cal-claim-btn');
  const closeCal = () => calRoot.classList.add('hidden');
  const openCal = () => { renderCalendar(); calRoot.classList.remove('hidden'); };
  calBtn.addEventListener('click', openCal);
  calRoot.querySelector('.cal-close').addEventListener('click', closeCal);
  calRoot.querySelector('.cal-backdrop').addEventListener('click', closeCal);
  G.openCalendar = openCal;

  // 3. Mystery Gift Floating Chip
  const mysteryChip = document.createElement('button');
  mysteryChip.type = 'button';
  mysteryChip.className = 'mystery-float-chip hidden';
  mysteryChip.innerHTML = `
    <span style="width:18px;height:18px;display:inline-block">${giftIcon()}</span>
    <span>MYSTERY GIFT</span>
  `;
  document.body.appendChild(mysteryChip);

  // 3b. Speed-Build Floating Chip (Task 1.7). Icon + numeral only, no prose on the play field:
  // a bolt (finish now) + a coin (the remaining build cost this ad skips) + that remaining
  // amount. `G.speedBuildOffer` is written every frame by the build-circle owner (zones.js/
  // stations.js — see the wiring contract at the bottom of this file) as either `null` or
  // `{ zoneId, price, paid }` once the owner stands inside an unbuilt zone's footprint that is
  // already speedBuildEligible(paid, price). This file never computes that footprint itself.
  const speedBuildChip = document.createElement('button');
  speedBuildChip.type = 'button';
  speedBuildChip.className = 'speed-build-chip hidden';
  speedBuildChip.setAttribute('aria-label', 'Finish build now');
  speedBuildChip.innerHTML = `
    <span style="width:18px;height:18px;display:inline-block">${boltIcon()}</span>
    <span style="width:15px;height:15px;display:inline-block">${coinIcon()}</span>
    <span class="speed-build-num">0</span>
  `;
  document.body.appendChild(speedBuildChip);
  const speedBuildNum = speedBuildChip.querySelector('.speed-build-num');

  // 4. Special and Golden chips in day top pill
  const dayTop = document.querySelector('.dayTop');
  const specialChip = document.createElement('div');
  specialChip.className = 'special-indicator hidden';
  const goldenChip = document.createElement('div');
  goldenChip.className = 'golden-indicator hidden';
  goldenChip.innerHTML = `${sunIcon()}<span>2x</span>`;

  if (dayTop) {
    dayTop.appendChild(specialChip);
    dayTop.appendChild(goldenChip);
  }

  let goldenLerp = 0;
  let mysteryOffered = false;
  let lastDayEvaluated = -1;

  function refreshCalendarDot() {
    const todayKey = dayKeyFor(Date.now());
    const cal = (G.meta && G.meta.rewards && G.meta.rewards.calendar) || { lastKey: null, streak: 0 };
    const claimableSlot = calendarSlotIndex(cal, todayKey);
    const hasReward = claimableSlot !== null;
    calDot.classList.toggle('hidden', !hasReward);
    calBtn.classList.toggle('ready', hasReward);
  }

  function renderCalendar() {
    const todayKey = dayKeyFor(Date.now());
    const cal = (G.meta && G.meta.rewards && G.meta.rewards.calendar) || { lastKey: null, streak: 0 };
    const claimableSlot = calendarSlotIndex(cal, todayKey);
    const activeStreak = cal.lastKey === todayKey ? cal.streak : (claimableSlot === null ? 0 : claimableSlot);

    calGrid.innerHTML = '';
    for (let i = 0; i < CALENDAR_LENGTH; i++) {
      const isClaimed = i < activeStreak;
      const isToday = i === claimableSlot;
      const isFinal = i === CALENDAR_LENGTH - 1;
      const reward = calendarRewardFor(i);

      const card = document.createElement('div');
      card.className = `cal-card${isFinal ? ' final' : ''}${isClaimed ? ' claimed' : ''}${isToday ? ' today' : ''}`;
      card.innerHTML = `
        <span class="cal-day-num">DAY ${i + 1}</span>
        <div class="cal-reward-row">${coinIcon()}<span>+${reward}</span></div>
        <div class="cal-status-icon">
          ${isClaimed ? checkIcon() : isToday ? sparkleIcon() : pawIcon()}
        </div>
      `;
      calGrid.appendChild(card);
    }

    const canClaim = claimableSlot !== null && (!platform || platform.canRequestAd('rewarded'));
    calClaimBtn.disabled = !canClaim;
    calClaimBtn.onclick = canClaim ? async () => {
      calClaimBtn.disabled = true;
      let earned = true;
      if (platform && platform.rewardedAvailable) {
        earned = await platform.requestRewardedAd('pet-cafe-calendar');
      }
      if (!earned) {
        G.hud?.toast?.('Gift unavailable');
        calClaimBtn.disabled = false;
        return;
      }
      const updated = advanceCalendar(cal, todayKey);
      if (!G.meta.rewards) G.meta.rewards = {};
      G.meta.rewards.calendar = updated;

      const prize = calendarRewardFor(claimableSlot);
      G.coins += prize;
      G.hud?.setCoins?.(G.coins);
      G.hud?.bump?.();
      G.audio?.play?.('chime');

      // Grand finale restock:
      if (calendarIsFinalSlot(claimableSlot)) {
        for (const st of G.world.stations.values()) {
          if (st.active && st.capacity) st.stock = st.capacity;
          if (st.active && st.buffer) st.stock = st.buffer;
        }
        G.hud?.banner?.('✨ GRAND OPENING RESTOCK ✨', 3000);
      }

      G.requestCheckpoint?.('calendar-claim');
      refreshCalendarDot();
      renderCalendar();
      G.hud?.toast?.(`Claimed +${prize} coins!`);
    } : null;
  }

  // Mystery gift click handler
  mysteryChip.addEventListener('click', async () => {
    const day = G.dayState.day | 0;
    if (inShiftClaimedForShift(G.meta, day)) {
      mysteryChip.classList.add('hidden');
      return;
    }
    let earned = true;
    if (platform && platform.rewardedAvailable) {
      earned = await platform.requestRewardedAd('pet-cafe-mystery-gift');
    }
    if (!earned) {
      G.hud?.toast?.('Mystery Gift unavailable');
      return;
    }
    markRewardedClaim(G.meta, day, 'gift');
    mysteryChip.classList.add('hidden');

    const kind = mysteryRewardKindForDay(day, G.golden ? G.golden.active : false);
    if (kind === 'coins') {
      const amount = mysteryCoinsForDay(day, G.dayStats.earned || 200, cafeLevel(G));
      G.coins += amount;
      G.hud?.setCoins?.(G.coins);
      G.hud?.bump?.();
      G.audio?.play?.('chime');
      G.hud?.banner?.(`🐾 MYSTERY GIFT · +${amount} COINS 🐾`, 3000);
    } else if (kind === 'restock') {
      for (const st of G.world.stations.values()) {
        if (st.active && st.capacity) st.stock = st.capacity;
        if (st.active && st.buffer) st.stock = st.buffer;
        if (st.active && typeof st.beans === 'number') st.beans = 20;
        if (st.active && typeof st.fruit === 'number') st.fruit = 9;
      }
      G.audio?.play?.('chime');
      G.hud?.banner?.('🐾 MYSTERY GIFT · FULL RESTOCK 🐾', 3000);
    } else if (kind === 'golden') {
      if (G.golden) {
        G.golden.active = true;
        G.golden.remaining = 25;
        G.golden.usedToday = true;
      }
      G.audio?.play?.('chime');
      G.hud?.banner?.('✨ MYSTERY GOLDEN BURST · 2x TIPS ✨', 3500);
    }
    G.requestCheckpoint?.('mystery-gift-claim');
  });

  // Speed-build click handler (Task 1.7). Claiming finishes the build circle the owner is
  // currently standing on for free by calling the completion hook the build system wires onto
  // `G` (see the wiring contract above `speedBuildChip`). If that hook is not wired yet, or the
  // offer already vanished (owner walked off the circle, or another placement claimed the shared
  // in-shift budget first), this is a safe no-op — the chip is hidden either way.
  speedBuildChip.addEventListener('click', async () => {
    const day = G.dayState.day | 0;
    const offer = G.speedBuildOffer;
    if (!offer || inShiftClaimedForShift(G.meta, day)) {
      speedBuildChip.classList.add('hidden');
      return;
    }
    let earned = true;
    if (platform && platform.rewardedAvailable) {
      earned = await platform.requestRewardedAd('pet-cafe-speed-build');
    }
    if (!earned) {
      G.hud?.toast?.('Speed Build unavailable');
      return;
    }
    markRewardedClaim(G.meta, day, 'speed-build');
    speedBuildChip.classList.add('hidden');
    // The completion hook mirrors payZone's own 'built' event, so the usual build-complete
    // sound/reveal (zones.js onBuilt) fires exactly as it would for a manually finished build.
    G.finishSpeedBuild?.(offer.zoneId);
    G.requestCheckpoint?.('speed-build-claim');
  });

  refreshCalendarDot();

  return {
    update(dt) {
      const day = G.dayState.day | 0;
      if (day !== lastDayEvaluated) {
        lastDayEvaluated = day;
        mysteryOffered = false;
        refreshCalendarDot();
      }

      // Step golden hour
      if (G.golden) {
        const schedule = goldenHourForDay(day);
        const started = stepGoldenHour(G.golden, schedule, G.dayState.t, dt);
        if (started) {
          G.hud?.banner?.('✨ GOLDEN HOUR · 2x TIPS ✨', 3500);
          G.audio?.play?.('chime');
          if (G.fx && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            G.fx.burst(G.P.x, 1.2, G.P.z, '#FFD700', 25);
          }
        }
        const active = G.golden.active;
        goldenChip.classList.toggle('hidden', !active);
        if (active) {
          goldenChip.querySelector('span').textContent = `${Math.ceil(G.golden.remaining)}s · 2x`;
        }
        // Smooth lighting tint
        const targetK = active ? 1 : 0;
        goldenLerp += (targetK - goldenLerp) * Math.min(1, dt * 3);
        if (S.setGoldenHour) S.setGoldenHour(goldenLerp);
      }

      // Special Theme Chip
      if (G.special && G.dayState.phase !== 'closing') {
        const iconFn = THEME_ICON_FN[G.special.icon] || starIcon;
        const progress = specialProgress(G.special, G.dayStats.specialServed || 0);
        specialChip.innerHTML = `${iconFn()}<span>${progress.count}/${progress.target}</span>`;
        specialChip.classList.remove('hidden');
      } else {
        specialChip.classList.add('hidden');
      }

      // Mystery Paw Gift check
      if (!mysteryOffered && day >= 3) {
        const mystery = mysteryForDay(day);
        if (mystery && G.dayState.t >= mystery.startT && !inShiftClaimedForShift(G.meta, day)) {
          mysteryOffered = true;
          mysteryChip.classList.remove('hidden');
        }
      }
      if (inShiftClaimedForShift(G.meta, day)) {
        mysteryChip.classList.add('hidden');
      }

      // Speed-Build offer (Task 1.7): visible only while G.speedBuildOffer names an eligible
      // build circle the owner is standing on right now, and only while the shared in-shift
      // budget is unclaimed. Independent of the mystery gift above — either, neither, or (were
      // both eligible at once) the first one clicked; claiming one hides both via the shared key.
      const speedOffer = G.speedBuildOffer;
      if (speedOffer && !inShiftClaimedForShift(G.meta, day)) {
        const remaining = Math.max(0, Math.round((Number(speedOffer.price) || 0) - (Number(speedOffer.paid) || 0)));
        speedBuildNum.textContent = String(remaining);
        speedBuildChip.classList.remove('hidden');
      } else {
        speedBuildChip.classList.add('hidden');
      }
    },
    refresh() {
      refreshCalendarDot();
    },
  };
}

function starIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="#FFD700"/></svg>';
}

// icons.js has no "finish now" pictogram yet, so — matching the local starIcon() fallback above —
// this stays a small inline SVG owned here rather than adding an export to a file this batch
// doesn't touch.
function boltIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="13 2 4 14 11 14 10 22 20 9 13 9" fill="#123D28"/></svg>';
}
