// Retention/meta presentation layered on top of the existing HUD/sheets without owning simulation.
const STYLE_ID = 'pet-cafe-meta-style';
const SPECIES_ICON = { cat: 'CAT', dog: 'DOG', bunny: 'BUN' };

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .meta-streak{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));top:calc(184px + env(safe-area-inset-top,0px));z-index:14;pointer-events:none;padding:7px 11px;border-radius:999px;background:linear-gradient(135deg,#fff5dc,#ffe09a);color:#68431d;font:950 13px/1 system-ui,sans-serif;box-shadow:0 4px 0 #c68c3b33,0 9px 22px #7c4a1828;transform:translateY(-5px) scale(.94);opacity:0;transition:.18s ease}.meta-streak.show{transform:none;opacity:1}
    .meta-reputation{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));top:calc(184px + env(safe-area-inset-top,0px));z-index:13;pointer-events:none;min-width:144px;max-width:210px;padding:7px 11px 8px;border-radius:14px;background:#fffef5e8;color:#493b35;box-shadow:0 4px 0 #00000010,0 8px 20px #0000001e;backdrop-filter:blur(5px);font-family:system-ui,sans-serif}.meta-rep-top{display:flex;align-items:center;gap:6px;font-weight:900;font-size:12px;line-height:1.05}.meta-rep-star{color:#e8aa25;font-size:15px;text-shadow:0 1px 0 #8b5d1733}.meta-rep-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta-rep-value{margin-left:auto;font-size:11px;opacity:.64}.meta-rep-bar{height:4px;border-radius:3px;background:#00000012;overflow:hidden;margin-top:6px}.meta-rep-fill{height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,#f1b73a,#ff8a80);transition:width .45s cubic-bezier(.2,.8,.2,1)}
    .meta-pawbook{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));top:calc(238px + env(safe-area-inset-top,0px));z-index:15;min-height:40px;padding:0 12px;border:0;border-radius:13px;background:#fff9f1eb;color:#493b35;font:900 12px/1 system-ui,sans-serif;box-shadow:0 4px 0 #00000010,0 8px 18px #0000001b;cursor:pointer;display:flex;align-items:center;gap:7px;transition:transform .16s ease}.meta-pawbook.bump{transform:scale(1.12)}.meta-paw{font-size:16px;color:#db7b6c}.meta-book-root{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.meta-book-root.hidden{display:none}.meta-book-backdrop{position:absolute;inset:0;background:#251d1a88;backdrop-filter:blur(4px)}.meta-book{position:relative;width:min(470px,100%);max-height:min(680px,88vh);box-sizing:border-box;overflow:auto;border-radius:25px;background:#fff4e6;color:#3b2e2a;padding:20px;box-shadow:0 20px 60px #0005;font-family:system-ui,sans-serif}.meta-book-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.meta-book-title{font:900 23px/1.05 system-ui,sans-serif}.meta-book-sub{font:700 12px/1.3 system-ui,sans-serif;opacity:.6;margin-top:5px}.meta-book-close{width:48px;height:48px;flex:none;border:0;border-radius:50%;background:#0000000c;color:#3b2e2a;font-size:22px;cursor:pointer}.meta-book-progress{height:7px;border-radius:5px;background:#0000000e;overflow:hidden;margin:0 0 15px}.meta-book-progress>div{height:100%;border-radius:5px;background:linear-gradient(90deg,#ff8a80,#8b7cf6)}.meta-book-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.meta-pet-card{min-height:112px;border-radius:16px;padding:10px;box-sizing:border-box;background:#ffffffa8;border:1px solid #0000000a;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:5px}.meta-pet-card.locked{background:#eadfd3;color:#8c817a}.meta-pet-swatch{width:42px;height:42px;border-radius:50%;box-sizing:border-box;border:5px solid #ffffffaa;box-shadow:0 3px 9px #0002;position:relative}.meta-pet-swatch:after{content:'';position:absolute;left:50%;bottom:-8px;width:20px;height:10px;transform:translateX(-50%);border-radius:50%;background:var(--accent,#ff8a80)}.meta-pet-lock{font:900 27px/1 system-ui,sans-serif;opacity:.35}.meta-pet-name{font:900 12px/1.1 system-ui,sans-serif}.meta-pet-kind{font:800 9px/1 system-ui,sans-serif;letter-spacing:.1em;opacity:.5}.meta-pet-rarity{font:900 9px/1 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#8b67d5}.meta-pet-rarity.common{color:#8b817a}.meta-pet-rarity.epic{color:#d06da7}
    body.meta-summary-open #hint,body.meta-summary-open .objCaption,body.meta-summary-open .fbtn,body.meta-summary-open .skipPill,body.meta-summary-open .meta-pawbook{opacity:0!important;pointer-events:none!important}
    .meta-rating{width:100%;box-sizing:border-box;margin:0 auto 2px;padding:8px 11px;border-radius:15px;background:#ffffffa8;border:1px solid #0000000a;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left}.meta-rating-copy{display:flex;align-items:center;gap:7px;min-width:0}.meta-kicker{font:900 9px/1 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;opacity:.48}.meta-rating-note{display:none}.meta-rating-stars{font:950 22px/1 system-ui,sans-serif;letter-spacing:.03em;color:#f4b942;text-shadow:0 2px 0 #9a65182a;white-space:nowrap}
    .meta-rep-summary{width:100%;box-sizing:border-box;padding:8px 11px;border-radius:15px;background:linear-gradient(135deg,#fff7dd,#fff);border:1px solid #e6b74c38;text-align:left}.meta-rep-summary-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.meta-rep-summary-title{font:950 11px/1 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta-rep-gain{font:950 13px/1 system-ui,sans-serif;color:#bd7c11;white-space:nowrap}.meta-rep-levelup{margin-top:5px;font:950 9px/1 system-ui,sans-serif;color:#7b5ed5;letter-spacing:.05em;text-transform:uppercase}
    .meta-reward{width:100%;box-sizing:border-box;padding:8px 9px;border-radius:15px;background:linear-gradient(135deg,#fff,#f3efff);border:1px solid #8b7cf635;box-shadow:inset 0 1px 0 #fff,0 5px 15px #5d4bc214;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left}.meta-reward-copy{display:flex;min-width:0;flex:1;align-items:center}.meta-reward-title{font:950 10px/1 system-ui,sans-serif;color:#5b4ab6;letter-spacing:.06em}.meta-reward-sub{display:none}.meta-reward-btn{min-height:48px;min-width:106px;border:0;border-radius:13px;padding:0 12px;background:linear-gradient(135deg,#8b7cf6,#6b58e4);color:#fff;font:950 13px/1 system-ui,sans-serif;box-shadow:0 4px 0 #5145b8,0 8px 18px #5d4bc229;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.meta-reward-btn:disabled{cursor:default;background:#d8d2ea;color:#777;box-shadow:none}.meta-ad{height:21px;min-width:28px;box-sizing:border-box;border-radius:7px;border:1px solid #ffffff66;background:#ffffff25;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;font-size:9px;letter-spacing:.08em}
    .meta-toast{position:fixed;left:50%;bottom:calc(172px + env(safe-area-inset-bottom,0px));z-index:80;pointer-events:none;transform:translate(-50%,10px);opacity:0;padding:9px 15px;border-radius:999px;background:#302824;color:#fff;font:800 13px/1 system-ui,sans-serif;box-shadow:0 8px 24px #0004;transition:.2s ease;white-space:nowrap}.meta-toast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:520px){.meta-reputation{min-width:0;max-width:124px}.meta-rep-title{max-width:68px}.meta-rep-value{display:none}.meta-book-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.meta-pet-card{min-height:101px;padding:8px}}
    @media(max-width:300px){.meta-rating,.meta-rep-summary,.meta-reward{padding:7px 8px}.meta-rating-stars{font-size:19px}.meta-reward-title{display:none}.meta-reward-btn{width:100%;min-width:0}.meta-reward-copy:empty{display:none}}
  `;
  document.head.appendChild(s);
}

export function createMetaUI() {
  injectStyle();
  const streak = document.createElement('div'); streak.className = 'meta-streak'; document.body.appendChild(streak);
  const reputation = document.createElement('div'); reputation.className = 'meta-reputation';
  reputation.innerHTML = '<div class="meta-rep-top"><span class="meta-rep-star">★</span><span class="meta-rep-title">Cozy Corner</span><span class="meta-rep-value">0</span></div><div class="meta-rep-bar"><div class="meta-rep-fill"></div></div>';
  document.body.appendChild(reputation);
  const repTitle = reputation.querySelector('.meta-rep-title'), repValue = reputation.querySelector('.meta-rep-value'), repFill = reputation.querySelector('.meta-rep-fill');

  const bookBtn = document.createElement('button'); bookBtn.type = 'button'; bookBtn.className = 'meta-pawbook'; bookBtn.innerHTML = '<span class="meta-paw">●</span><span class="meta-book-count">0/12</span>'; document.body.appendChild(bookBtn);
  const bookRoot = document.createElement('div'); bookRoot.className = 'meta-book-root hidden';
  bookRoot.innerHTML = '<div class="meta-book-backdrop"></div><div class="meta-book"><div class="meta-book-head"><div><div class="meta-book-title">Pet Visitor Book</div><div class="meta-book-sub">Meet every café regular and discover rare coats.</div></div><button class="meta-book-close" type="button" aria-label="Close">×</button></div><div class="meta-book-progress"><div></div></div><div class="meta-book-grid"></div></div>';
  document.body.appendChild(bookRoot);
  const bookGrid = bookRoot.querySelector('.meta-book-grid'), bookCount = bookBtn.querySelector('.meta-book-count'), bookFill = bookRoot.querySelector('.meta-book-progress>div');
  const closeBook = () => bookRoot.classList.add('hidden');
  bookBtn.addEventListener('click', () => bookRoot.classList.remove('hidden'));
  bookRoot.querySelector('.meta-book-close').addEventListener('click', closeBook);
  bookRoot.querySelector('.meta-book-backdrop').addEventListener('click', closeBook);

  const toastEl = document.createElement('div'); toastEl.className = 'meta-toast'; document.body.appendChild(toastEl);
  let summaryLocked = false, lastStreak = -1, toastTimer = null, lastRep = -1;

  document.addEventListener('click', e => { if (summaryLocked && e.target && e.target.classList && e.target.classList.contains('backdrop')) e.stopPropagation(); }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !bookRoot.classList.contains('hidden')) { closeBook(); e.stopPropagation(); return; }
    if (summaryLocked && e.key === 'Escape') e.stopPropagation();
  }, true);

  const M = {};
  M.toast = text => {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = text; toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  };

  M.setStreak = (count, ttl) => {
    if (count < 3 || ttl <= 0) { streak.classList.remove('show'); return; }
    if (count !== lastStreak) { lastStreak = count; streak.textContent = `🔥 ${count}x`; }
    streak.classList.add('show');
  };

  M.setReputation = model => {
    if (!model) return;
    repTitle.textContent = model.title;
    if (model.rep !== lastRep) { lastRep = model.rep; repValue.textContent = model.rep; }
    repFill.style.width = `${Math.round((model.frac || 0) * 100)}%`;
    reputation.title = model.nextTitle ? `${model.rep} reputation · next: ${model.nextTitle}` : `${model.rep} reputation · max rank`;
  };

  M.setPetBook = model => {
    if (!model) return;
    bookCount.textContent = `${model.found}/${model.total}`;
    bookFill.style.width = `${Math.round((model.frac || 0) * 100)}%`;
    bookGrid.textContent = '';
    for (const c of model.cards || []) {
      const el = document.createElement('div'); el.className = 'meta-pet-card' + (c.found ? '' : ' locked');
      if (c.found) {
        const sw = document.createElement('div'); sw.className = 'meta-pet-swatch'; sw.style.background = c.profile.body; sw.style.setProperty('--accent', c.profile.accent);
        const name = document.createElement('div'); name.className = 'meta-pet-name'; name.textContent = c.profile.name;
        const kind = document.createElement('div'); kind.className = 'meta-pet-kind'; kind.textContent = SPECIES_ICON[c.species] || c.species.toUpperCase();
        const rare = document.createElement('div'); rare.className = `meta-pet-rarity ${c.profile.rarity}`; rare.textContent = c.profile.rarity;
        el.append(sw, name, kind, rare);
      } else {
        const lock = document.createElement('div'); lock.className = 'meta-pet-lock'; lock.textContent = '?';
        const name = document.createElement('div'); name.className = 'meta-pet-name'; name.textContent = 'Unknown';
        const kind = document.createElement('div'); kind.className = 'meta-pet-kind'; kind.textContent = SPECIES_ICON[c.species] || c.species.toUpperCase();
        el.append(lock, name, kind);
      }
      bookGrid.appendChild(el);
    }
  };

  M.announcePet = discovery => {
    if (!discovery || !discovery.isNew) return;
    M.toast(`New visitor · ${discovery.profile.name} · ${discovery.profile.rarity.toUpperCase()}`);
    bookBtn.classList.add('bump');
    setTimeout(() => bookBtn.classList.remove('bump'), 450);
  };

  M.lockSummary = locked => {
    summaryLocked = !!locked;
    if (summaryLocked) closeBook();
    document.body.classList.toggle('meta-summary-open', summaryLocked);
  };

  M.decorateSummary = model => {
    M.lockSummary(true);
    let tries = 0;
    const attach = () => {
      const card = document.querySelector('.sheet-root .card');
      if (!card) { if (++tries < 20) setTimeout(attach, 25); return; }
      if (card.querySelector('.meta-rating')) return;
      const close = card.querySelector('.sclose'); if (close) close.remove();

      const rating = document.createElement('div'); rating.className = 'meta-rating'; rating.setAttribute('aria-label', `Service rating ${model.rating} of 3 stars`);
      const rc = document.createElement('div'); rc.className = 'meta-rating-copy';
      const kicker = document.createElement('div'); kicker.className = 'meta-kicker'; kicker.textContent = 'SERVICE'; rc.appendChild(kicker);
      const stars = document.createElement('div'); stars.className = 'meta-rating-stars'; stars.textContent = '★'.repeat(model.rating) + '☆'.repeat(3 - model.rating);
      rating.append(rc, stars);
      const body = card.querySelector('.cbody'); if (body) body.after(rating); else card.appendChild(rating);

      let anchor = rating;
      if (model.reputation) {
        const rep = document.createElement('div'); rep.className = 'meta-rep-summary';
        const top = document.createElement('div'); top.className = 'meta-rep-summary-top';
        const title = document.createElement('div'); title.className = 'meta-rep-summary-title'; title.textContent = model.reputation.title;
        const gain = document.createElement('div'); gain.className = 'meta-rep-gain'; gain.textContent = `+${model.reputation.awarded} ★`;
        top.append(title, gain); rep.appendChild(top);
        const bar = document.createElement('div'); bar.className = 'meta-rep-bar';
        const fill = document.createElement('div'); fill.className = 'meta-rep-fill'; fill.style.width = `${Math.round(model.reputation.frac * 100)}%`; bar.appendChild(fill); rep.appendChild(bar);
        rep.setAttribute('aria-label', model.reputation.nextTitle ? `${model.reputation.title}, plus ${model.reputation.awarded} reputation, progress toward ${model.reputation.nextTitle}` : `${model.reputation.title}, maximum reputation`);
        if (model.reputation.levelUp) { const levelUp = document.createElement('div'); levelUp.className = 'meta-rep-levelup'; levelUp.textContent = 'NEW RANK'; rep.appendChild(levelUp); }
        anchor.after(rep); anchor = rep;
      }

      if (!model.rewardOffer) return;
      const reward = document.createElement('div'); reward.className = 'meta-reward';
      const copy = document.createElement('div'); copy.className = 'meta-reward-copy';
      const title = document.createElement('div'); title.className = 'meta-reward-title'; title.textContent = model.rewardOffer.claimed ? 'BONUS ✓' : 'BONUS'; copy.appendChild(title);
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'meta-reward-btn';
      const paintButton = () => {
        btn.disabled = !!model.rewardOffer.claimed;
        btn.innerHTML = model.rewardOffer.claimed ? `<span>✓ +${model.rewardOffer.amount.toLocaleString('en-US')}</span>` : `<span class="meta-ad">${model.rewardOffer.liveAd ? 'AD' : 'DEV'}</span><span>+${model.rewardOffer.amount.toLocaleString('en-US')}</span>`;
        btn.setAttribute('aria-label', model.rewardOffer.claimed ? `Bonus claimed, ${model.rewardOffer.amount} coins` : `${model.rewardOffer.label}, ${model.rewardOffer.liveAd ? 'watch rewarded ad for' : 'claim preview'} ${model.rewardOffer.amount} coins`);
      };
      paintButton();
      btn.addEventListener('click', async () => {
        if (btn.disabled || model.rewardOffer.claimed) return;
        btn.disabled = true; btn.textContent = '…';
        const ok = await model.rewardOffer.onClaim();
        if (ok) { model.rewardOffer.claimed = true; title.textContent = 'BONUS ✓'; paintButton(); }
        else paintButton();
      });
      reward.append(copy, btn); anchor.after(reward);
    };
    attach();
  };

  return M;
}
