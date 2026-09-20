// src/systems/rewardsSystem.js — the daily gift and Golden Hour.
//
// Batch D (ship plan §1.5) removed this file's UI: the calendar button and its modal, the Mystery
// Gift, Speed-Build, Rare Visitor and Golden Shot chips — all hidden by the calm HUD and reachable
// only three to six taps deep in the old Café menu — and the theme and Golden Hour chips it hung in
// the retired day pill. The daily gift is claimed from the Café card's Daily-gift tile now
// (ui/pauseMenu.js), which appears only while a gift is waiting; rewarded offers come back in the
// world, one at a time, in Batch E.
import {
  dayKeyFor, calendarSlotIndex, calendarRewardFor, calendarIsFinalSlot, advanceCalendar,
} from '../sim/rewards.js';
import { goldenHourForDay, stepGoldenHour } from '../sim/specialDays.js';
import { requestCafeReward } from '../platform/cafeReward.js';
import { giftIcon, sunIcon, coinIcon, checkIcon, sparkleIcon, crossIcon, sackIcon } from '../ui/icons.js';
import { cue } from '../ui/hud.js';

export function createRewardsSystem(G, S, platform) {
  // Claim today's gift. Still behind a rewarded ad until Batch E makes the claim free; the tile only
  // offers it while the calendar has a slot for today. Resolves { ok, prize }.
  G.claimDailyGift = async () => {
    const todayKey = dayKeyFor(Date.now());
    const cal = (G.meta && G.meta.rewards && G.meta.rewards.calendar) || { lastKey: null, streak: 0 };
    const slot = calendarSlotIndex(cal, todayKey);
    if (slot === null || (platform && !platform.canRequestAd('rewarded'))) return { ok: false };
    const earned = await requestCafeReward(platform, 'pet-cafe-calendar');
    if (!earned) {
      G.hud?.toast?.(cue([giftIcon(), crossIcon()], 'Gift unavailable'));
      return { ok: false };
    }
    if (!G.meta.rewards) G.meta.rewards = {};
    G.meta.rewards.calendar = advanceCalendar(cal, todayKey);
    const prize = calendarRewardFor(slot);
    G.coins += prize;
    G.hud?.setCoins?.(G.coins);
    G.audio?.play?.('chime');
    // The seventh day's grand-opening restock.
    if (calendarIsFinalSlot(slot)) {
      for (const st of G.world.stations.values()) {
        if (st.active && st.capacity) st.stock = st.capacity;
        if (st.active && st.buffer) st.stock = st.buffer;
      }
      G.hud?.banner?.(cue([sparkleIcon(), sackIcon(), checkIcon()], 'Grand opening restock'), 3000);
    }
    G.requestCheckpoint?.('calendar-claim');
    G.hud?.toast?.(cue([coinIcon(), '+', prize], `Claimed plus ${prize} coins`));
    return { ok: true, prize };
  };

  let goldenLerp = 0;
  return {
    update(dt) {
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
