import {
  recommendSmartRelief, reliefClaimKey, returnWasteCost, SMART_RELIEF_REWARD_ID,
} from '../sim/relief.js';

function ensureStyles() {
  if (document.getElementById('pet-cafe-relief-style')) return;
  const s = document.createElement('style'); s.id = 'pet-cafe-relief-style';
  s.textContent = `
    .relief-root{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:22;width:min(92vw,360px);font-family:inherit;color:#3B2E2A;pointer-events:auto}
    .relief-pill,.relief-card{box-sizing:border-box;width:100%;border:0;background:#FFF4E6F7;box-shadow:0 8px 26px #0003;border-radius:18px;color:inherit}
    .relief-pill{min-height:48px;padding:8px 9px 8px 14px;display:flex;align-items:center;gap:8px;text-align:left;cursor:pointer}
    .relief-pill-main{flex:1;min-width:0}.relief-kicker{font:900 10px/1 system-ui,sans-serif;letter-spacing:.08em;color:#B66A2D}.relief-pill-title{font:900 13px/1.15 system-ui,sans-serif;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .relief-close{width:48px;height:48px;flex:none;border:0;border-radius:50%;background:#0000000B;color:#3B2E2A;font:900 20px/1 system-ui,sans-serif;cursor:pointer}
    .relief-card{padding:14px;display:grid;grid-template-columns:1fr auto;gap:10px 12px;align-items:center;border:2px solid #FFD36B}
    .relief-copy{min-width:0}.relief-title{font:950 16px/1.1 system-ui,sans-serif}.relief-why{font:700 11px/1.35 system-ui,sans-serif;opacity:.7;margin-top:5px}.relief-math{font:850 11px/1.3 system-ui,sans-serif;margin-top:7px;color:#725728}
    .relief-watch{min-width:116px;min-height:48px;border:0;border-radius:14px;padding:9px 12px;background:linear-gradient(180deg,#8B7CF6,#6F60DC);box-shadow:0 4px 0 #5145AE;color:#fff;font:950 12px/1.1 system-ui,sans-serif;cursor:pointer}.relief-watch:disabled{opacity:.55;box-shadow:none}.relief-ad{display:inline-flex;align-items:center;border:1px solid #ffffff80;border-radius:7px;padding:2px 5px;margin-right:4px;font-size:9px}
    .relief-card .relief-close{position:absolute;right:-8px;top:-54px;background:#FFF4E6F7;box-shadow:0 4px 12px #0002}
    @media(max-width:360px){.relief-root{width:calc(100vw - 16px);bottom:calc(10px + env(safe-area-inset-bottom,0px))}.relief-card{grid-template-columns:1fr}.relief-watch{width:100%}.relief-pill-title{font-size:12px}}
    @media(max-height:520px){.relief-root{bottom:calc(8px + env(safe-area-inset-bottom,0px));width:min(82vw,340px)}.relief-card{padding:10px}.relief-why{display:none}}
  `;
  document.head.appendChild(s);
}

function createReliefUI(isDev) {
  ensureStyles();
  const root = document.createElement('div'); root.className = 'relief-root hidden';
  root.innerHTML = `
    <button type="button" class="relief-pill" aria-label="Open optional rush help">
      <div class="relief-pill-main"><div class="relief-kicker">OPTIONAL · RUSH HELP</div><div class="relief-pill-title"></div></div>
      <span aria-hidden="true">›</span>
    </button>
    <div class="relief-card hidden" role="dialog" aria-label="Optional rewarded rush help">
      <div class="relief-copy"><div class="relief-title"></div><div class="relief-why"></div><div class="relief-math"></div></div>
      <button type="button" class="relief-watch"><span class="relief-ad">${isDev ? 'DEV' : 'AD'}</span><span class="relief-reward"></span></button>
      <button type="button" class="relief-close" aria-label="Dismiss rush help">×</button>
    </div>`;
  document.body.appendChild(root);
  const pill = root.querySelector('.relief-pill'), card = root.querySelector('.relief-card');
  const close = root.querySelector('.relief-close'), watch = root.querySelector('.relief-watch');
  const pillTitle = root.querySelector('.relief-pill-title'), title = root.querySelector('.relief-title');
  const why = root.querySelector('.relief-why'), math = root.querySelector('.relief-math'), reward = root.querySelector('.relief-reward');
  let model = null, expanded = false;
  function render() {
    if (!model) { root.classList.add('hidden'); return; }
    root.classList.remove('hidden'); pill.classList.toggle('hidden', expanded); card.classList.toggle('hidden', !expanded);
    pillTitle.textContent = `${model.label} · +${model.reward} coins`;
    title.textContent = `${model.label} would help now`;
    why.textContent = model.why;
    math.textContent = model.remaining > 0
      ? `${model.cost.toLocaleString('en-US')} coins · ${model.gap} short · earn ${model.remaining} more after the reward`
      : `${model.cost.toLocaleString('en-US')} coins · this reward closes the ${model.gap}-coin gap`;
    reward.textContent = `+${model.reward}`;
  }
  pill.addEventListener('click', () => { expanded = true; render(); });
  return {
    root, watch, close,
    setModel(next) { model = next; if (!next) expanded = false; render(); },
    collapse() { expanded = false; render(); },
    destroy() { root.remove(); },
  };
}

export function createEconomyExperience(G, S, ctx, platform) {
  const { world, hud, fx, audio, owner, sheets } = ctx;
  const ui = createReliefUI(!platform || !platform.inPlayables);
  let dismissedDay = -1, pressureKey = '', pressureT = 0, current = null, tick = 0, busy = false;

  // Return crate consequence: finished food/fruit is waste; supply sacks are legitimate inventory returns.
  G.carry.onReturn = had => {
    const productKeys = owner.items.map(m => m && m.userData && m.userData.product).filter(Boolean);
    const wanted = returnWasteCost(productKeys, had && had.fruit);
    const fee = Math.min(Math.max(0, G.coins | 0), wanted);
    if (fee <= 0) return;
    G.coins -= fee;
    G.dayStats.wasteFees = (G.dayStats.wasteFees | 0) + fee;
    G.stats.wasteFees = (G.stats.wasteFees | 0) + fee;
    hud.setCoins(G.coins); audio.play('penalty');
    const st = world.stations.get('return1');
    if (st) fx.number(st.x, 1.0, st.z, `-${fee}`, 'lost');
    hud.toast(`Food waste · handling -${fee}`);
  };

  function hide() { current = null; pressureKey = ''; pressureT = 0; ui.setModel(null); }
  async function claim() {
    if (busy || !current) return;
    const offer = current, day = G.dayState.day | 0;
    if (G.meta.rewardedDays[reliefClaimKey(day)]) { hide(); return; }
    busy = true; ui.watch.disabled = true;
    const earned = await (platform ? platform.requestRewardedAd(SMART_RELIEF_REWARD_ID) : Promise.resolve(true));
    busy = false; ui.watch.disabled = false;
    if (!earned) { hud.toast('Reward unavailable · keep playing'); return; }
    G.meta.rewardedDays[reliefClaimKey(day)] = 1;
    G.coins += offer.reward;
    G.stats.rewardedReliefCoins = (G.stats.rewardedReliefCoins | 0) + offer.reward;
    hud.setCoins(G.coins); hud.bump(); audio.play('chime');
    hud.banner(`RUSH HELP · +${offer.reward} COINS`, 2200);
    if (platform && G.snapshot) platform.save(G.snapshot());
    hide();
  }
  ui.watch.addEventListener('click', claim);
  ui.close.addEventListener('click', () => { dismissedDay = G.dayState.day | 0; hide(); });

  return {
    update(dt) {
      tick -= dt;
      if (tick > 0) return;
      const elapsed = 0.5; tick = elapsed;
      const d = G.dayState;
      const inReliefWindow = d && (d.phase === 'rush' || (d.phase === 'afternoon' && d.t < 172));
      const claimed = d && G.meta.rewardedDays[reliefClaimKey(d.day)];
      const adReady = platform && (platform.rewardedAvailable || !platform.inPlayables);
      if (!inReliefWindow || claimed || dismissedDay === (d && d.day) || !adReady || G.userPaused || (sheets && sheets.isOpen)) { hide(); return; }
      const next = recommendSmartRelief(G, world);
      if (!next) { hide(); return; }
      if (next.key !== pressureKey) { pressureKey = next.key; pressureT = 0; current = next; ui.setModel(null); return; }
      pressureT += elapsed; current = next;
      // Five seconds of sustained evidence prevents the card from flashing because of one temporary empty shelf.
      if (pressureT >= 5) ui.setModel(next);
    },
    teardown() {
      if (G.carry.onReturn) G.carry.onReturn = null;
      ui.destroy();
    },
  };
}
