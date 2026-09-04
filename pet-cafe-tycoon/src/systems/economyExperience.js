import {
  recommendSmartRelief, recommendRushHelp, reliefClaimKey, returnWasteCost, SMART_RELIEF_REWARD_ID,
} from '../sim/relief.js';
import { makeRushCrewBoost, rushCrewActive, rushCrewHasBenefit } from '../sim/rushCrew.js';

export const RUSH_CREW_REWARD_ID = 'pet-cafe-rush-crew';

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
    const crew = model.mode === 'crew';
    pillTitle.textContent = crew ? `${model.label} · this rush` : `${model.label} · +${model.reward} coins`;
    title.textContent = crew ? `${model.label} can jump in` : `${model.label} would help now`;
    why.textContent = model.why;
    math.textContent = crew ? model.detail : model.remaining > 0
      ? `${model.cost.toLocaleString('en-US')} coins · ${model.gap} short · earn ${model.remaining} more after the reward`
      : `${model.cost.toLocaleString('en-US')} coins · this reward closes the ${model.gap}-coin gap`;
    reward.textContent = crew ? '+1 TIER' : `+${model.reward}`;
  }
  pill.addEventListener('click', () => { expanded = true; render(); });
  return {
    root, watch, close,
    setModel(next) { model = next; if (!next) expanded = false; render(); },
    collapse() { expanded = false; render(); },
    destroy() { root.remove(); },
  };
}

function crewDetail(role) {
  if (role === 'runner') return 'Your existing Runner borrows +1 Speed and +1 Carry tier until Rush ends. Permanent upgrades are unchanged.';
  if (role === 'cashier') return 'Your existing Cashier borrows +1 Speed tier until Rush ends. Permanent upgrades are unchanged.';
  return 'Your existing Cleaner borrows +1 Speed tier until Rush ends. Permanent upgrades are unchanged.';
}

// Pure filter layered over the pressure classifier. The temporary crew reward is only actionable
// when that worker already belongs to the player and at least one permanent tier remains to borrow.
// This prevents an ad from quietly becoming a free hire or doing literally nothing for a maxed worker.
export function rushCrewOfferFor(G, world, context = {}) {
  const next = recommendRushHelp(G, world, context);
  if (!next || next.kind !== 'crew' || !next.role) return null;
  if (((G.staff && G.staff[next.role]) | 0) < 1) return null;
  if (!rushCrewHasBenefit(G.staffLevels, next.role)) return null;
  return {
    ...next,
    mode: 'crew',
    key: `crew:${next.role}`,
    detail: crewDetail(next.role),
  };
}

export function createEconomyExperience(G, S, ctx, platform) {
  const { world, hud, fx, audio, owner, sheets } = ctx;
  const ui = createReliefUI(!platform || !platform.inPlayables);
  let dismissedDay = -1, pressureKey = '', pressureT = 0, current = null, tick = 0, busy = false;
  let snapshotWrapped = false;

  // game.js defines G.snapshot later in createGame(). Wrap it lazily on the first live update so an
  // active Rush Crew can survive a host save/reload. Only an ACTUALLY active matching-day rush is
  // serialized; stale transient state is never written forward.
  function ensureSnapshotIncludesRushCrew() {
    if (snapshotWrapped || typeof G.snapshot !== 'function') return;
    const baseSnapshot = G.snapshot;
    G.snapshot = () => {
      const save = baseSnapshot();
      if (rushCrewActive(G.boosts, G.dayState)) {
        const b = G.boosts.rushCrew;
        save.boosts = { ...(save.boosts || {}), rushCrew: { role: b.role, day: b.day | 0 } };
      }
      return save;
    };
    snapshotWrapped = true;
  }

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
    // A crew offer is valid only while the bottleneck is still in the actual rush. If the phase
    // rolled over while the card was open, close it rather than selling a benefit that has expired.
    if (offer.mode === 'crew' && (!G.dayState || G.dayState.phase !== 'rush')) { hide(); return; }

    busy = true; ui.watch.disabled = true;
    const rewardId = offer.mode === 'crew' ? RUSH_CREW_REWARD_ID : SMART_RELIEF_REWARD_ID;
    const earned = await (platform ? platform.requestRewardedAd(rewardId) : Promise.resolve(true));
    busy = false; ui.watch.disabled = false;
    if (!earned) { hud.toast('Reward unavailable · keep playing'); return; }

    if (offer.mode === 'crew') {
      // Re-check after the async ad: the player may have upgraded the worker or the host may have
      // resumed into a different phase. Never consume the daily claim for a now-useless reward.
      if (!G.dayState || G.dayState.phase !== 'rush' || ((G.staff && G.staff[offer.role]) | 0) < 1 || !rushCrewHasBenefit(G.staffLevels, offer.role)) {
        hud.toast('Rush changed · reward not consumed'); hide(); return;
      }
      const boost = makeRushCrewBoost(offer.role, day);
      if (!boost) { hide(); return; }
      G.boosts.rushCrew = boost;
      G.meta.rewardedDays[reliefClaimKey(day)] = 1;
      audio.play('chime');
      hud.banner(`${offer.label.toUpperCase()} · +1 TIER THIS RUSH`, 2200);
    } else {
      G.meta.rewardedDays[reliefClaimKey(day)] = 1;
      G.coins += offer.reward;
      G.stats.rewardedReliefCoins = (G.stats.rewardedReliefCoins | 0) + offer.reward;
      hud.setCoins(G.coins); hud.bump(); audio.play('chime');
      hud.banner(`RUSH HELP · +${offer.reward} COINS`, 2200);
    }
    if (platform && G.snapshot) platform.save(G.snapshot());
    hide();
  }
  ui.watch.addEventListener('click', claim);
  ui.close.addEventListener('click', () => { dismissedDay = G.dayState.day | 0; hide(); });

  return {
    update(dt) {
      ensureSnapshotIncludesRushCrew();

      // Transient means transient: once the phase/day stops matching, remove the live object too.
      // applySave performs the same rejection on reload, so both uninterrupted and restored play agree.
      if (G.boosts && G.boosts.rushCrew && !rushCrewActive(G.boosts, G.dayState)) delete G.boosts.rushCrew;

      tick -= dt;
      if (tick > 0) return;
      const elapsed = 0.5; tick = elapsed;
      const d = G.dayState;
      const inReliefWindow = d && (d.phase === 'rush' || (d.phase === 'afternoon' && d.t < 172));
      const claimed = d && G.meta.rewardedDays[reliefClaimKey(d.day)];
      const adReady = platform && (platform.rewardedAvailable || !platform.inPlayables);
      if (!inReliefWindow || claimed || rushCrewActive(G.boosts, d) || dismissedDay === (d && d.day) || !adReady || G.userPaused || (sheets && sheets.isOpen)) { hide(); return; }

      // During Rush, prefer an operational worker boost when the pressure classifier identifies a
      // concrete bottleneck and the player already owns that worker. If not actionable, keep the
      // existing permanent-purchase coin bridge as the fallback. Early afternoon remains coin-only.
      let next = d.phase === 'rush' ? rushCrewOfferFor(G, world, { now: G.time }) : null;
      if (!next) {
        const coin = recommendSmartRelief(G, world);
        next = coin ? { ...coin, mode: 'coins' } : null;
      }
      if (!next) { hide(); return; }
      if (next.key !== pressureKey) { pressureKey = next.key; pressureT = 0; current = next; ui.setModel(null); return; }
      pressureT += elapsed; current = next;
      // Five seconds of sustained evidence prevents monetization from flashing because of one
      // temporary empty shelf or a single guest briefly entering the register queue.
      if (pressureT >= 5) ui.setModel(next);
    },
    teardown() {
      if (G.carry.onReturn) G.carry.onReturn = null;
      ui.destroy();
    },
  };
}
