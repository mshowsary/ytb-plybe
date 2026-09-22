// src/systems/party.js — the Pet Party: the jukebox by the door, and the rewarded offer that lives on it.
//
// A studio-playable staple done the café way. The jukebox (data/area1.js jukebox1) is always in the
// room. When the café is busy enough for a party to be worth it, a ▶ ♫ ×2 badge floats over it — a
// thing in the world, not a menu row, and it only asks once there are guests to enjoy it. Watching
// starts a 60-second party: every sale pays double, the music turns bouncy, the jukebox's neon cycles,
// confetti falls and the tables throw hearts. Ignoring it costs nothing.
//
// The party shares the day's service reward with Helper Pup and Build Boost. That keeps the café to
// three in-shift rewarded moments at most, and the saved claim survives a reload. The party runs on
// dt, so a paused game (or the ad itself) never spends it.
import { cue } from '../ui/hud.js';
import { musicIcon, coinIcon, playIcon, sparkleIcon } from '../ui/icons.js';
import { markRewardedClaim, placementClaimedForShift } from '../sim/adPacing.js';

export const PARTY_SECONDS = 60;
export const PARTY_MIN_SESSION = 60;
export const PARTY_MIN_GUESTS = 3;
export const PARTY_REWARD_ID = 'pet-cafe-pet-party';

const NOTE_COLORS = ['#FF8FB1', '#8B7CF6', '#FFD84D', '#6EC6FF'];
const STYLE_ID = 'pet-cafe-party-style';
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .party-badge{position:absolute;transform:translate(-50%,-100%);display:flex;align-items:center;gap:3px;height:48px;padding:0 9px 0 6px;border:2px solid #fff;border-radius:22px;background:#FFF4E6F2;box-shadow:0 6px 18px #0004;cursor:pointer;pointer-events:auto;font:950 16px/1 ui-rounded,system-ui,sans-serif;color:#3B2E2A;animation:party-bob 1.8s ease-in-out infinite;touch-action:manipulation}
    .party-badge svg{width:32px;height:32px;display:block}
    .party-badge .pb-note svg{width:22px;height:22px}
    .party-badge .pb-ad{margin-left:2px;padding:4px 5px;border:1px solid #8B7CF68f;border-radius:7px;background:#eee8ff;color:#5f50bb;font:950 9px/1 system-ui,sans-serif;letter-spacing:.05em}
    .party-badge[disabled]{opacity:.6}
    @keyframes party-bob{0%,100%{transform:translate(-50%,-100%)}50%{transform:translate(-50%,calc(-100% - 5px))}}
    .party-chip{position:fixed;left:calc(var(--hud-edge,12px) + var(--sal,0px));top:calc(var(--hud-edge,12px) + 112px + var(--sat,0px));z-index:15;display:flex;align-items:center;gap:5px;height:40px;padding:0 12px 0 8px;border-radius:14px;background:linear-gradient(90deg,#FF8FB1,#8B7CF6);color:#fff;box-shadow:0 4px 14px #271b1530;font:900 15px/1 ui-rounded,system-ui,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none}
    .party-chip svg{width:20px;height:20px;display:block}
    .party-chip span{display:inline-flex}
    .party-chip.hidden,.party-badge.hidden{display:none}
    /* Phones drop the moment banner to hud-edge + 116px (style.css #banner); the chip sits under it. */
    @media(max-width:600px){.party-chip{top:calc(var(--hud-edge,12px) + 184px + var(--sat,0px))}}
    @media(prefers-reduced-motion:reduce){.party-badge{animation:none}}
    body.reduced-motion .party-badge{animation:none}
  `;
  document.head.appendChild(s);
}

export function createParty(G, S, ctx, platform) {
  const { world, hud, fx, audio, sheets, els } = ctx;
  const dom = typeof document !== 'undefined';
  const jukebox = world.stations.get('jukebox1') || null;
  const proj = { sx: 0, sy: 0, visible: false };
  let partyT = 0, busy = false, noteT = 0, confettiT = 0, heartT = 0, hue = 0, tick = 0, showBadge = false;

  let badge = null, chip = null, chipNum = null;
  if (dom) {
    ensureStyles();
    badge = document.createElement('button');
    badge.type = 'button'; badge.className = 'party-badge hidden';
    badge.innerHTML = `${playIcon()}<span class="pb-note">${musicIcon()}</span><span>×2</span><small class="pb-ad">AD</small>`;
    badge.setAttribute('aria-label', 'Watch an ad to throw a pet party: every sale pays double for a minute');
    (els && els.fx ? els.fx : document.body).appendChild(badge);
    chip = document.createElement('div');
    chip.className = 'party-chip hidden'; chip.setAttribute('role', 'status');
    chip.setAttribute('aria-label', 'Pet party: sales pay double');
    chip.innerHTML = `${musicIcon()}<span>${coinIcon()}</span><b>×2</b><span class="pc-t"></span>`;
    chipNum = chip.querySelector('.pc-t');
    document.body.appendChild(chip);
    badge.addEventListener('click', claim);
  }

  const lights = () => {
    const v = ctx.vis && ctx.vis.get('jukebox1');
    return v && v.g && v.g.userData ? v.g.userData.lights : null;
  };
  const guestsInside = () => (G.customers || []).filter(c => c && c.state !== 'leave').length;

  function adReady() {
    return !!platform && (platform.rewardedAvailable || !platform.inPlayables) && platform.canRequestAd?.('rewarded') !== false;
  }
  function offerable() {
    if (!jukebox || !jukebox.active || partyT > 0 || busy) return false;
    const d = G.dayState; if (!d) return false;
    if (d.phase === 'closing' || d._ended) return false;
    if (placementClaimedForShift(G.meta, 'service', d.day)) return false;
    if ((G.time || 0) < PARTY_MIN_SESSION) return false;
    if ((sheets && sheets.isOpen) || G.userPaused || G.firstLookActive) return false;
    if (ctx.offers?.current) return false;
    if (guestsInside() < PARTY_MIN_GUESTS) return false;
    return adReady();
  }

  async function claim() {
    if (busy || !offerable()) return;
    busy = true; if (badge) badge.disabled = true;
    let earned = false;
    try { earned = platform ? !!(await platform.requestRewardedAd(PARTY_REWARD_ID)) : true; } catch (_) { earned = false; }
    busy = false; if (badge) badge.disabled = false;
    if (!earned) return;
    const day = G.dayState.day | 0;
    if (!markRewardedClaim(G.meta, day, 'service')) return;
    start();
    G.requestCheckpoint?.('pet-party');
    if (platform && G.snapshot) platform.save(G.snapshot());
  }

  function start() {
    partyT = PARTY_SECONDS; noteT = 0; confettiT = 0; heartT = 0.4;
    audio.setParty?.(true); audio.play('fanfare');
    hud.banner(cue([musicIcon(), coinIcon(), '×2', sparkleIcon()], 'Pet party! Every sale pays double for a minute'), 2200);
    ctx.customerSystem?.wave?.();
  }

  function stop() {
    partyT = 0;
    audio.setParty?.(false);
    if (G.boosts) G.boosts.x2Until = 0;
    const l = lights(); if (l) l.material.color.set('#FF9EC0').multiplyScalar(1.6);
    if (chip) chip.classList.add('hidden');
  }

  function stepParty(dt) {
    partyT = Math.max(0, partyT - dt);
    // The double itself: sim/economy.js incomeMult reads boosts.x2Until against the wall clock, so
    // it is kept a moment ahead while (and only while) the party is running in game time.
    if (G.boosts) G.boosts.x2Until = Date.now() + 400;
    hue = (hue + dt * 0.35) % 1;
    const l = lights(); if (l) l.material.color.setHSL(hue, 0.9, 0.62).multiplyScalar(1.5);
    noteT -= dt; confettiT -= dt; heartT -= dt;
    const reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (jukebox && noteT <= 0) { noteT = 0.45; fx.burst(jukebox.x + 0.3, 1.5, jukebox.z, NOTE_COLORS[(Math.random() * 4) | 0], 3); }
    if (!reduced && confettiT <= 0) { confettiT = 7; fx.confetti?.(G.P.x, G.P.z, 5, 36); }
    if (heartT <= 0) {
      heartT = 1.6;
      for (const st of world.stations.values()) if (st.type === 'seat' && st.active && st.occupied && Math.random() < 0.6) fx.hearts(st.x, 1.3, st.z, 1);
    }
    if (chip) {
      chip.classList.remove('hidden');
      chipNum.textContent = `0:${String(Math.ceil(partyT)).padStart(2, '0')}`;
    }
    if (partyT <= 0) stop();
  }

  function placeBadge(show) {
    if (!badge) return;
    if (!show || !jukebox) { badge.classList.add('hidden'); return; }
    fx.project(jukebox.x, 1.75, jukebox.z, proj);
    if (!proj.visible) { badge.classList.add('hidden'); return; }
    badge.style.left = `${Math.round(proj.sx)}px`; badge.style.top = `${Math.round(proj.sy)}px`;
    badge.classList.remove('hidden');
  }

  const api = {
    get active() { return partyT > 0; },
    get seconds() { return partyT; },
    claim, start,
    update(dt) {
      const step = Math.max(0, Number(dt) || 0);
      if (partyT > 0) stepParty(step);
      tick -= step;
      if (tick <= 0) { tick = 0.25; showBadge = offerable(); }
      placeBadge(showBadge && !busy);
    },
    teardown() { if (partyT > 0) stop(); },
  };
  G.party = api;
  return api;
}
