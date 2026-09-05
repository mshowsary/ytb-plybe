import {
  ensurePartyOrders, maybeStartPartyOrder, recordPartyOrderSale, partyOrderComplete,
  partyOrderProgress, expirePartyOrder, claimPartyOrder,
} from '../sim/partyOrders.js';
import { iconFor } from '../ui/icons.js';

function injectStyle() {
  if (document.getElementById('pet-cafe-party-order-style')) return;
  const s = document.createElement('style'); s.id = 'pet-cafe-party-order-style';
  s.textContent = `
    .party-order-btn{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));top:calc(286px + env(safe-area-inset-top,0px));z-index:15;min-height:42px;max-width:180px;border:0;border-radius:13px;padding:0 11px;background:#f0ecffed;color:#493b35;box-shadow:0 4px 0 #00000010,0 8px 18px #0000001b;display:flex;align-items:center;gap:7px;font:900 11px/1 system-ui,sans-serif;cursor:pointer}.party-order-box{font-size:16px}.party-order-progress{white-space:nowrap}.party-order-ready{color:#6d57d7}.party-order-btn.bump{animation:partyBump .42s ease}@keyframes partyBump{50%{transform:scale(1.12)}}
    .party-root{position:fixed;inset:0;z-index:72;display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}.party-root.hidden{display:none}.party-backdrop{position:absolute;inset:0;background:#251d1a88;backdrop-filter:blur(4px)}.party-card{position:relative;width:min(430px,100%);max-height:min(620px,88vh);overflow:auto;box-sizing:border-box;border-radius:24px;background:#fff4e6;color:#3b2e2a;padding:19px;box-shadow:0 20px 60px #0005;font-family:system-ui,sans-serif}.party-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.party-kicker{font:900 10px/1 system-ui,sans-serif;letter-spacing:.12em;color:#7b68d6}.party-title{font:950 22px/1.05 system-ui,sans-serif;margin-top:5px}.party-sub{font:700 11px/1.35 system-ui,sans-serif;opacity:.62;margin-top:5px;max-width:310px}.party-close{width:48px;height:48px;border:0;border-radius:50%;background:#0000000c;color:#3b2e2a;font-size:22px;cursor:pointer;flex:none}.party-deadline{display:inline-flex;margin:12px 0 8px;padding:5px 9px;border-radius:999px;background:#fff0c9;color:#7c5915;font:900 10px/1 system-ui,sans-serif}.party-rows{display:flex;flex-direction:column;gap:8px}.party-row{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:9px;padding:9px;border-radius:14px;background:#ffffffa8;border:1px solid #0000000a}.party-icon{width:34px;height:34px}.party-icon svg{width:100%;height:100%;display:block}.party-name{font:900 12px/1.05 system-ui,sans-serif;text-transform:capitalize}.party-bar{height:5px;background:#0000000d;border-radius:4px;overflow:hidden;margin-top:5px}.party-fill{height:100%;background:linear-gradient(90deg,#8b7cf6,#ff8a80);border-radius:4px}.party-count{font:950 12px/1 system-ui,sans-serif;white-space:nowrap}.party-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:13px;padding-top:12px;border-top:1px solid #00000010}.party-reward{font:950 15px/1 system-ui,sans-serif}.party-reward small{display:block;font:800 9px/1.2 system-ui,sans-serif;letter-spacing:.08em;opacity:.5;margin-bottom:4px}.party-claim{min-width:128px;min-height:48px;border:0;border-radius:14px;padding:0 13px;background:linear-gradient(180deg,#8b7cf6,#6c5add);box-shadow:0 4px 0 #5145ae;color:#fff;font:950 12px/1 system-ui,sans-serif;cursor:pointer}.party-claim:disabled{background:#d8d0ca;color:#877e79;box-shadow:none;cursor:default}
    body.meta-summary-open .party-order-btn{opacity:0!important;pointer-events:none!important}
    @media(max-width:520px){.party-order-btn{max-width:126px}.party-order-label{display:none}.party-card{padding:16px}.party-title{font-size:20px}}
    @media(max-width:360px){.party-order-btn{top:calc(284px + env(safe-area-inset-top,0px));min-height:40px;padding:0 9px}.party-foot{align-items:stretch;flex-direction:column}.party-claim{width:100%}}
    @media(max-height:520px){.party-order-btn{top:auto;bottom:calc(76px + env(safe-area-inset-bottom,0px));max-width:112px}.party-card{max-height:92vh;padding:12px}.party-sub{display:none}.party-row{padding:6px}.party-foot{margin-top:8px;padding-top:8px}}
  `;
  document.head.appendChild(s);
}

function productName(key) {
  return key === 'cookie' ? 'Bakery' : key === 'treat' ? 'Pet treats' : key;
}
function createUI(onClaim) {
  injectStyle();
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'party-order-btn hidden';
  btn.innerHTML = '<span class="party-order-box">📦</span><span class="party-order-label">PARTY ORDER</span><span class="party-order-progress"></span>';
  document.body.appendChild(btn);
  const root = document.createElement('div'); root.className = 'party-root hidden';
  root.innerHTML = '<div class="party-backdrop"></div><div class="party-card"><div class="party-head"><div><div class="party-kicker">PET PARTY ORDER</div><div class="party-title"></div><div class="party-sub"></div></div><button type="button" class="party-close" aria-label="Close">×</button></div><div class="party-deadline"></div><div class="party-rows"></div><div class="party-foot"><div class="party-reward"><small>ORDER PAYOUT</small><span></span></div><button type="button" class="party-claim">KEEP SERVING</button></div></div>';
  document.body.appendChild(root);
  const close = () => root.classList.add('hidden');
  btn.addEventListener('click', () => root.classList.remove('hidden'));
  root.querySelector('.party-close').addEventListener('click', close); root.querySelector('.party-backdrop').addEventListener('click', close);
  root.querySelector('.party-claim').addEventListener('click', () => { if (onClaim()) close(); });
  let model = null;
  function render(active, day) {
    model = active;
    if (!active) { btn.classList.add('hidden'); root.classList.add('hidden'); return; }
    const progress = partyOrderProgress(active), complete = partyOrderComplete(active);
    btn.classList.remove('hidden'); btn.classList.toggle('party-order-ready', complete);
    btn.querySelector('.party-order-progress').textContent = complete ? 'CLAIM!' : `${progress.count}/${progress.target}`;
    root.querySelector('.party-title').textContent = active.title; root.querySelector('.party-sub').textContent = active.subtitle;
    const shifts = Math.max(0, active.expiresDay - day + 1);
    root.querySelector('.party-deadline').textContent = complete ? 'READY TO CLAIM' : `${shifts} SHIFT${shifts === 1 ? '' : 'S'} LEFT`;
    const rows = root.querySelector('.party-rows'); rows.textContent = '';
    for (const r of active.requirements) {
      const row = document.createElement('div'); row.className = 'party-row';
      row.innerHTML = `<div class="party-icon">${iconFor(r.key)}</div><div><div class="party-name">${productName(r.key)}</div><div class="party-bar"><div class="party-fill" style="width:${Math.round(Math.min(1, r.count / r.target) * 100)}%"></div></div></div><div class="party-count">${Math.min(r.count, r.target)}/${r.target}</div>`;
      rows.appendChild(row);
    }
    root.querySelector('.party-reward span').textContent = `🪙 ${active.reward.toLocaleString('en-US')}`;
    const claim = root.querySelector('.party-claim'); claim.disabled = !complete; claim.textContent = complete ? `CLAIM ${active.reward}` : 'KEEP SERVING';
  }
  return { btn, root, render, bump() { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }, destroy() { btn.remove(); root.remove(); } };
}

export function createPartyOrders(G, S, ctx, platform = null) {
  const { world, hud, audio } = ctx;
  ensurePartyOrders(G.meta);
  let lastDay = -1, tick = 0;
  let ui;
  const claim = () => {
    const result = claimPartyOrder(G.meta);
    if (!result.ok) return false;
    G.coins += result.reward; G.stats.partyOrderCoins = (G.stats.partyOrderCoins | 0) + result.reward;
    hud.setCoins(G.coins); hud.bump(); audio.play('chime'); hud.banner(`PARTY ORDER · +${result.reward} COINS`, 2200);
    sync(true); if (platform && G.snapshot) platform.save(G.snapshot()); return true;
  };
  ui = createUI(claim);

  function sync(quiet = false) {
    const day = G.dayState.day | 0;
    const expired = expirePartyOrder(G.meta, day);
    if (expired.expired && !quiet) hud.toast('Party order expired · no penalty');
    const start = maybeStartPartyOrder(G.meta, world, day);
    if (start.started && !quiet) { hud.banner('NEW PET PARTY ORDER', 1800); audio.play('ding'); }
    const active = ensurePartyOrders(G.meta).active;
    ui.render(active, day);
    lastDay = day;
  }
  sync(true);

  return {
    sync,
    onSale(order) {
      const r = recordPartyOrderSale(G.meta, order);
      if (!r.changed) return;
      ui.render(r.active, G.dayState.day | 0); ui.bump();
      if (r.completedNow) { audio.play('chime'); hud.banner('PARTY ORDER READY!', 1900); }
    },
    update(dt) {
      tick -= dt;
      if (tick > 0) return; tick = 0.75;
      if ((G.dayState.day | 0) !== lastDay) sync(false);
    },
    teardown() { ui.destroy(); },
  };
}
