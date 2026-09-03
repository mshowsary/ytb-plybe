// Retention/meta presentation layered on top of the existing HUD/sheets without owning simulation.
const STYLE_ID = 'pet-cafe-meta-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .meta-streak{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));top:calc(184px + env(safe-area-inset-top,0px));z-index:14;pointer-events:none;padding:7px 12px;border-radius:999px;background:linear-gradient(135deg,#fff5dc,#ffe09a);color:#68431d;font:900 13px/1.1 system-ui,sans-serif;box-shadow:0 4px 0 #c68c3b33,0 9px 22px #7c4a1828;transform:translateY(-5px) scale(.94);opacity:0;transition:.18s ease}
    .meta-streak.show{transform:none;opacity:1}
    .meta-rating{width:100%;box-sizing:border-box;margin:0 auto 2px;padding:10px 12px;border-radius:16px;background:#ffffffa8;border:1px solid #0000000a;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left}
    .meta-rating-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
    .meta-kicker{font:800 10px/1.1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.55}
    .meta-rating-stars{font:900 24px/1 system-ui,sans-serif;letter-spacing:.04em;color:#f4b942;text-shadow:0 2px 0 #9a65182a;white-space:nowrap}
    .meta-reward{width:100%;box-sizing:border-box;padding:12px 13px;border-radius:18px;background:linear-gradient(135deg,#fff,#f3efff);border:1px solid #8b7cf635;box-shadow:inset 0 1px 0 #fff,0 7px 20px #5d4bc219;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left}
    .meta-reward-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}
    .meta-reward-title{font:900 14px/1.15 system-ui,sans-serif;color:#3b2e2a}
    .meta-reward-sub{font:700 11px/1.25 system-ui,sans-serif;color:#756a66}
    .meta-reward-btn{min-height:46px;min-width:112px;border:0;border-radius:14px;padding:0 13px;background:linear-gradient(135deg,#8b7cf6,#6b58e4);color:#fff;font:900 13px/1 system-ui,sans-serif;box-shadow:0 4px 0 #5145b8,0 8px 18px #5d4bc229;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}
    .meta-reward-btn:disabled{cursor:default;background:#d8d2ea;color:#777;box-shadow:none}
    .meta-ad{height:21px;min-width:28px;box-sizing:border-box;border-radius:7px;border:1px solid #ffffff66;background:#ffffff25;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;font-size:9px;letter-spacing:.08em}
    .meta-toast{position:fixed;left:50%;bottom:calc(172px + env(safe-area-inset-bottom,0px));z-index:60;pointer-events:none;transform:translate(-50%,10px);opacity:0;padding:9px 15px;border-radius:999px;background:#302824;color:#fff;font:800 13px/1 system-ui,sans-serif;box-shadow:0 8px 24px #0004;transition:.2s ease;white-space:nowrap}
    .meta-toast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:420px){.meta-reward{align-items:stretch;flex-direction:column}.meta-reward-btn{width:100%}}
  `;
  document.head.appendChild(s);
}

export function createMetaUI() {
  injectStyle();
  const streak = document.createElement('div'); streak.className = 'meta-streak'; document.body.appendChild(streak);
  const toastEl = document.createElement('div'); toastEl.className = 'meta-toast'; document.body.appendChild(toastEl);
  let summaryLocked = false, lastStreak = -1, toastTimer = null;

  // Capture before sheets.js bubble listeners. We stop propagation but never preventDefault(), so
  // browser/YouTube Escape semantics stay untouched while the frozen end-of-day card is protected.
  document.addEventListener('click', e => {
    if (summaryLocked && e.target && e.target.classList && e.target.classList.contains('backdrop')) e.stopPropagation();
  }, true);
  document.addEventListener('keydown', e => {
    if (summaryLocked && e.key === 'Escape') e.stopPropagation();
  }, true);

  const M = {};
  M.toast = text => {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = text; toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
  };

  M.setStreak = (count, ttl) => {
    if (count < 3 || ttl <= 0) { streak.classList.remove('show'); return; }
    if (count !== lastStreak) { lastStreak = count; streak.textContent = `🔥 ${count}x SERVICE`; }
    streak.classList.add('show');
  };

  M.lockSummary = locked => { summaryLocked = !!locked; };

  M.decorateSummary = model => {
    summaryLocked = true;
    let tries = 0;
    const attach = () => {
      const card = document.querySelector('.sheet-root .card');
      if (!card) {
        if (++tries < 20) setTimeout(attach, 25);
        return;
      }
      if (card.querySelector('.meta-rating')) return;

      // A day summary freezes the simulation until CONTINUE, so the generic sheet close control is
      // not a valid action here. Remove it rather than showing a button that can soft-lock a run.
      const close = card.querySelector('.sclose');
      if (close) close.remove();

      const rating = document.createElement('div'); rating.className = 'meta-rating';
      const rc = document.createElement('div'); rc.className = 'meta-rating-copy';
      const kicker = document.createElement('div'); kicker.className = 'meta-kicker'; kicker.textContent = 'SERVICE RATING';
      const note = document.createElement('div'); note.className = 'meta-reward-sub';
      note.textContent = model.rating >= 3 ? 'Flawless shift' : model.rating === 2 ? 'Solid shift' : 'Room to improve';
      rc.append(kicker, note);
      const stars = document.createElement('div'); stars.className = 'meta-rating-stars';
      stars.textContent = '★'.repeat(model.rating) + '☆'.repeat(3 - model.rating);
      rating.append(rc, stars);
      const body = card.querySelector('.cbody');
      if (body) body.after(rating); else card.appendChild(rating);

      if (!model.rewardOffer) return;
      const reward = document.createElement('div'); reward.className = 'meta-reward';
      const copy = document.createElement('div'); copy.className = 'meta-reward-copy';
      const title = document.createElement('div'); title.className = 'meta-reward-title';
      const sub = document.createElement('div'); sub.className = 'meta-reward-sub';
      title.textContent = model.rewardOffer.claimed ? 'BONUS CLAIMED' : model.rewardOffer.label;
      sub.textContent = model.rewardOffer.claimed
        ? `+${model.rewardOffer.amount.toLocaleString('en-US')} coins added`
        : model.rewardOffer.liveAd ? 'Optional rewarded ad · never required for progress' : 'Local preview reward';
      copy.append(title, sub);
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'meta-reward-btn';
      const paintButton = () => {
        btn.disabled = !!model.rewardOffer.claimed;
        btn.innerHTML = model.rewardOffer.claimed
          ? 'CLAIMED'
          : `<span class="meta-ad">${model.rewardOffer.liveAd ? 'AD' : 'DEV'}</span><span>+${model.rewardOffer.amount.toLocaleString('en-US')}</span>`;
      };
      paintButton();
      btn.addEventListener('click', async () => {
        if (btn.disabled || model.rewardOffer.claimed) return;
        btn.disabled = true; btn.textContent = '…';
        const ok = await model.rewardOffer.onClaim();
        if (ok) {
          model.rewardOffer.claimed = true;
          title.textContent = 'BONUS CLAIMED';
          sub.textContent = `+${model.rewardOffer.amount.toLocaleString('en-US')} coins added`;
          paintButton();
        } else {
          paintButton();
        }
      });
      reward.append(copy, btn); rating.after(reward);
    };
    attach();
  };

  return M;
}
