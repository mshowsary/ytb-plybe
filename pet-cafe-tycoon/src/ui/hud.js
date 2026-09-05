// src/ui/hud.js
import { presentationScheduler } from '../core/presentationScheduler.js';

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
  H.setCoins = n => { from = shown; target = n; t0 = performance.now(); };
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
  const goalPillEl = document.createElement('div'); goalPillEl.className = 'pill'; goalPillEl.id = 'goalPill'; hud.appendChild(goalPillEl);
  const PHASE_LABEL = { morning: 'Morning', rush: 'Rush', afternoon: 'Afternoon', closing: 'Closing' };
  let lastDayText = '', lastGoalText = '', lastFrac = -1;
  H.setDay = (day, phase, frac) => {
    const text = `Day ${day} · ${PHASE_LABEL[phase] || phase}`;
    if (text !== lastDayText) { lastDayText = text; dayLabel.textContent = text; }
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    if (pct !== lastFrac) { lastFrac = pct; dayBarFill.style.width = pct + '%'; }
  };
  H.setGoal = text => {
    if (!text) { goalPillEl.classList.add('hidden'); return; }
    if (text !== lastGoalText) { lastGoalText = text; goalPillEl.textContent = text; }
    goalPillEl.classList.remove('hidden');
  };
  // Loop v2 Task 3: a large top-centre banner ("RUSH HOUR" / "WEEKEND" / "HOLIDAY" / "CLOSING") —
  // slides in, holds for `ms` (default 2500), slides out. A later call while one is showing simply
  // replaces the text and restarts the hold (day-start banners can fire two in a row on a
  // weekend-holiday day; each gets its own full visible window rather than being dropped).
  const bannerEl = document.createElement('div'); bannerEl.className = 'pill hidden'; bannerEl.id = 'banner'; hud.appendChild(bannerEl);
  let bannerT = null;
  H.banner = (text, ms = 2500) => {
    if (bannerT) presentationScheduler.cancel(bannerT);
    bannerEl.textContent = text;
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
  H.update = () => { const k = Math.min(1, (performance.now() - t0) / 350); if (k < 1) { shown = from + (target - from) * (1 - Math.pow(1 - k, 3)); num.textContent = fmt(shown); } };
  wallet.style.transition = 'transform .12s';

  // toast: a fading pill above the hint, shown for ~1.5 s; at most one pending while one is showing.
  // Remaining display time is preserved across both host and user pauses.
  const toastEl = document.createElement('div'); toastEl.className = 'toast hidden'; hud.appendChild(toastEl);
  let toastBusy = false, toastPending = null, toastT = null;
  function runToast(text) {
    toastBusy = true;
    toastEl.textContent = text;
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
