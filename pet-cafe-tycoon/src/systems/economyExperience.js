import { inShiftClaimedForShift, markRewardedClaim } from '../sim/adPacing.js';
import {
  recommendSmartRelief, recommendRushHelp, reliefClaimKey, returnWasteCost, SMART_RELIEF_REWARD_ID,
} from '../sim/relief.js';
import { familyOf } from '../sim/economy.js';
import { makeRushCrewBoost, rushCrewActive, rushCrewHasBenefit } from '../sim/rushCrew.js';
import {
  PET_PLAY_BREAK_SECONDS, PET_PLAY_BREAK_SLOTS, petPlayBreakActive, selectPetPlayBreakCustomers,
  startPetPlayBreak, stepPetPlayBreak,
} from '../sim/petPlayBreak.js';
import { ROOMBA_SWEEP_SECONDS } from '../sim/petMess.js';
import { makePendingEntitlement, snapshotTemporaryHelp } from '../sim/temporaryHelp.js';
import { coinIcon, gearIcon, personIcon, treatIcon, coinMinusIcon, returnIcon, giftIcon, checkIcon, crossIcon, clockIcon, pawIcon, heartIcon, broomIcon, sparkleIcon } from '../ui/icons.js';
import { cue } from '../ui/hud.js';

export const RUSH_CREW_REWARD_ID = 'pet-cafe-rush-crew';
export const PET_PLAY_BREAK_REWARD_ID = 'pet-cafe-pet-play-break';
export const ROOMBA_REWARD_ID = 'pet-cafe-roomba-sweep';
export const REWARDED_OFFER_MIN_SESSION_SECONDS = 60;

export function rewardedOfferSurfaceAllowed({ sessionTime = 0, sheetOpen = false, userPaused = false, inputActive = false } = {}) {
  return Number(sessionTime) >= REWARDED_OFFER_MIN_SESSION_SECONDS && !sheetOpen && !userPaused && !inputActive;
}

export function compactRewardedOfferModel(model, isDev = false) {
  if (!model) return null;
  const badge = isDev ? 'DEV · AD' : 'AD';
  if (model.mode === 'crew') return { icon: personIcon(), value: '+1 TIER', label: 'RUSH CREW', badge };
  if (model.mode === 'petBreak') return { icon: treatIcon(), value: `${Math.max(0, model.duration | 0)}s`, label: 'PLAY BREAK', badge };
  if (model.mode === 'roomba') return { icon: gearIcon(), value: `${Math.max(0, model.duration | 0)}s`, label: 'ROOMBA', badge };
  return { icon: coinIcon(), value: `+${Math.max(0, model.reward | 0)}`, label: 'COINS', badge };
}

function ensureStyles() {
  if (document.getElementById('pet-cafe-relief-style')) return;
  const s = document.createElement('style'); s.id = 'pet-cafe-relief-style';
  s.textContent = `
    .relief-root{position:fixed;right:calc(10px + env(safe-area-inset-right,0px));left:auto;bottom:calc(78px + env(safe-area-inset-bottom,0px));transform:none;z-index:22;width:min(198px,max(112px,calc(100vw - 142px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px))));font-family:inherit;color:#3B2E2A;pointer-events:auto}
    .relief-root.expanded{top:calc(66px + env(safe-area-inset-top,0px));bottom:auto;width:min(330px,calc(100vw - 16px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)))}
    .relief-pill,.relief-card{box-sizing:border-box;width:100%;border:0;background:#FFF4E6F7;box-shadow:0 8px 26px #0003;border-radius:18px;color:inherit}
    .relief-pill{min-height:50px;padding:7px 8px;display:flex;align-items:center;gap:7px;text-align:left;cursor:pointer;border:1px solid #ffffffc4}
    .relief-benefit-icon{width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:11px;background:#ffffffb8}.relief-benefit-icon svg{width:25px;height:25px;display:block}
    .relief-pill-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.relief-pill-value{font:950 13px/1 system-ui,sans-serif;white-space:nowrap}.relief-pill-label{font:850 8px/1 system-ui,sans-serif;letter-spacing:.07em;opacity:.58;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .relief-pill-ad{flex:none;border:1px solid #8B7CF68f;background:#eee8ff;color:#5f50bb;border-radius:7px;padding:3px 5px;font:950 8px/1 system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap}.relief-open{font:950 16px/1 system-ui,sans-serif;opacity:.45}
    .relief-close{width:48px;height:48px;flex:none;border:0;border-radius:50%;background:#0000000B;color:#3B2E2A;font:900 20px/1 system-ui,sans-serif;cursor:pointer}
    .relief-card{position:relative;padding:14px 56px 14px 14px;display:grid;grid-template-columns:1fr auto;gap:10px 12px;align-items:center;border:2px solid #FFD36B}
    .relief-copy{min-width:0}.relief-title{font:950 16px/1.1 system-ui,sans-serif}.relief-why{font:700 11px/1.35 system-ui,sans-serif;opacity:.7;margin-top:5px}.relief-math{font:850 11px/1.3 system-ui,sans-serif;margin-top:7px;color:#725728}
    .relief-watch{min-width:116px;min-height:48px;border:0;border-radius:14px;padding:9px 12px;background:linear-gradient(180deg,#8B7CF6,#6F60DC);box-shadow:0 4px 0 #5145AE;color:#fff;font:950 12px/1.1 system-ui,sans-serif;cursor:pointer}.relief-watch:disabled{opacity:.55;box-shadow:none}.relief-ad{display:inline-flex;align-items:center;border:1px solid #ffffff80;border-radius:7px;padding:2px 5px;margin-right:4px;font-size:9px}
    .relief-card .relief-close{position:absolute;right:5px;top:5px;background:#ffffff8c}
    @media(max-width:360px){.relief-root.expanded{right:8px;width:calc(100vw - 16px)}.relief-pill-label{display:none}.relief-card{grid-template-columns:1fr;padding:12px 56px 12px 12px}.relief-watch{width:100%}.relief-pill-value{font-size:12px}.relief-benefit-icon{width:30px;height:30px}}
    @media(max-height:520px){.relief-root{bottom:calc(10px + env(safe-area-inset-bottom,0px))}.relief-root.expanded{top:calc(66px + env(safe-area-inset-top,0px));bottom:auto;width:min(320px,calc(100vw - 16px))}.relief-card{padding:10px 54px 10px 10px;grid-template-columns:1fr auto}.relief-why{display:none}.relief-watch{min-width:104px}}
  `;
  document.head.appendChild(s);
}

function createReliefUI(isDev) {
  ensureStyles();
  const root = document.createElement('div'); root.className = 'relief-root hidden';
  root.innerHTML = `
    <button type="button" class="relief-pill" aria-label="Open optional rewarded help">
      <span class="relief-benefit-icon" aria-hidden="true"></span>
      <span class="relief-pill-main"><span class="relief-pill-value"></span><span class="relief-pill-label"></span></span>
      <span class="relief-pill-ad"></span><span class="relief-open" aria-hidden="true">›</span>
    </button>
    <div class="relief-card hidden" role="dialog" aria-label="Optional rewarded rush help">
      <div class="relief-copy"><div class="relief-title"></div><div class="relief-why"></div><div class="relief-math"></div></div>
      <button type="button" class="relief-watch"><span class="relief-ad">${isDev ? 'DEV · AD' : 'AD'}</span><span class="relief-reward"></span></button>
      <button type="button" class="relief-close" aria-label="Dismiss rewarded help">×</button>
    </div>`;
  document.body.appendChild(root);
  const pill = root.querySelector('.relief-pill'), card = root.querySelector('.relief-card');
  const close = root.querySelector('.relief-close'), watch = root.querySelector('.relief-watch');
  const pillIcon = root.querySelector('.relief-benefit-icon'), pillValue = root.querySelector('.relief-pill-value');
  const pillLabel = root.querySelector('.relief-pill-label'), pillAd = root.querySelector('.relief-pill-ad');
  const title = root.querySelector('.relief-title'), why = root.querySelector('.relief-why');
  const math = root.querySelector('.relief-math'), reward = root.querySelector('.relief-reward');
  let model = null, expanded = false;
  function render() {
    if (!model) { root.classList.add('hidden'); root.classList.remove('expanded'); return; }
    root.classList.remove('hidden'); root.classList.toggle('expanded', expanded);
    pill.classList.toggle('hidden', expanded); card.classList.toggle('hidden', !expanded);
    const compact = compactRewardedOfferModel(model, isDev);
    pillIcon.innerHTML = compact.icon; pillValue.textContent = compact.value; pillLabel.textContent = compact.label; pillAd.textContent = compact.badge;
    pill.setAttribute('aria-label', `Open optional ${compact.badge} offer: ${compact.label} ${compact.value}`);
    const crew = model.mode === 'crew', petBreak = model.mode === 'petBreak', roomba = model.mode === 'roomba';
    title.textContent = crew ? `${model.label} can jump in`
      : petBreak ? `${model.label} gives breathing room`
      : roomba ? `${model.label} can clear the pet floor`
      : `${model.label} would help now`;
    why.textContent = model.why;
    math.textContent = (crew || petBreak || roomba) ? model.detail : model.remaining > 0
      ? `${model.cost.toLocaleString('en-US')} coins · ${model.gap} short · earn ${model.remaining} more after the reward`
      : `${model.cost.toLocaleString('en-US')} coins · this reward closes the ${model.gap}-coin gap`;
    reward.textContent = crew ? '+1 TIER' : petBreak ? `${model.duration}s BREAK` : roomba ? `${model.duration}s SWEEP` : `+${model.reward}`;
  }
  pill.addEventListener('click', () => { expanded = true; render(); });
  return {
    root, watch, close,
    setModel(next) {
      if (!next || !model || next.key !== model.key) expanded = false;
      model = next; render();
    },
    collapse() { expanded = false; render(); },
    get expanded() { return expanded; },
    destroy() { root.remove(); },
  };
}

function crewDetail(role) {
  if (role === 'runner') return 'Your existing Runner borrows +1 Speed and +1 Carry tier until Rush ends. Permanent upgrades are unchanged.';
  if (role === 'cashier') return 'Your existing Cashier borrows +1 Speed tier until Rush ends. Permanent upgrades are unchanged.';
  return 'Your existing Cleaner borrows +1 Speed tier until Rush ends. Permanent upgrades are unchanged.';
}
function petBreakDetail(seconds, slots) {
  return `${slots} stressed pet guests get ${seconds}s where patience cannot fall. Queues keep moving and permanent stats are unchanged.`;
}
function roombaDetail(count, seconds) {
  return `Clears ${count} pet pawprint ${count === 1 ? 'patch' : 'patches'} now and keeps new pawprints away for ${seconds}s. Dirty tables still belong to you or the Cleaner.`;
}

function waitingRunnerFamilies(G, world) {
  const families = new Set();
  for (const c of G.customers || []) {
    if (!c || c.done || c.state !== 'queue' || c.slot !== 0 || c.mood !== 'wait') continue;
    const display = c.counterId && world.stations.get(c.counterId);
    const product = c.wish && c.wish.product || display && display.product;
    if (product) families.add(familyOf(product));
  }
  return families;
}

function runnerHasReadyWork(G, world) {
  const families = waitingRunnerFamilies(G, world);
  if (!families.size) return false;
  for (const st of world.stations.values()) {
    if (!st || !st.active || !(st.stock > 0)) continue;
    let product = null;
    if (st.type === 'oven' || st.type === 'coffee') product = st.product;
    else if (st.type === 'blender') product = 'smoothie';
    if (product && families.has(familyOf(product))) return true;
  }
  for (const s of G.staffList || []) {
    if (!s || s.kind !== 'runner') continue;
    for (const product of s.items || []) if (families.has(familyOf(product))) return true;
  }
  return false;
}

export function rushCrewOfferFor(G, world, context = {}) {
  const next = recommendRushHelp(G, world, context);
  if (!next || next.kind !== 'crew' || !next.role) return null;
  if (((G.staff && G.staff[next.role]) | 0) < 1) return null;
  if (!rushCrewHasBenefit(G.staffLevels, next.role)) return null;
  if (next.role === 'runner' && !runnerHasReadyWork(G, world)) return null;
  return { ...next, mode: 'crew', key: `crew:${next.role}`, detail: crewDetail(next.role) };
}

export function roombaOfferFor(G, world, context = {}) {
  const next = recommendRushHelp(G, world, context);
  const mess = G && G.petMess;
  if (!next || next.kind !== 'roomba' || !mess || typeof mess.sweep !== 'function') return null;
  const count = Math.max(0, mess.count | 0);
  if (count < 2 || mess.roombaActive) return null;
  const duration = Math.max(5, Math.min(ROOMBA_SWEEP_SECONDS, next.suggestedSweepSeconds | 0 || ROOMBA_SWEEP_SECONDS));
  return { ...next, mode: 'roomba', key: 'roomba', duration, count, detail: roombaDetail(count, duration) };
}

export function petPlayBreakOfferFor(G, world, context = {}) {
  const activeCustomers = (G.customers || []).reduce((n, c) => n + (c && !c.done ? 1 : 0), 0);
  const broadWaiting = selectPetPlayBreakCustomers(G.customers, 4);
  if (activeCustomers < 7 || broadWaiting.length < 4) return null;

  const classified = recommendRushHelp(G, world, context);
  const base = classified && classified.kind === 'petLounge' ? classified : {
    kind: 'petLounge', score: 64, label: 'Pet Play Break',
    why: 'Several pet guests are waiting at once; a short breather can keep the rush recoverable.',
    slots: PET_PLAY_BREAK_SLOTS, suggestedPauseSeconds: PET_PLAY_BREAK_SECONDS,
  };
  const slots = Math.max(1, Math.min(PET_PLAY_BREAK_SLOTS, base.slots | 0 || PET_PLAY_BREAK_SLOTS));
  const recipients = selectPetPlayBreakCustomers(G.customers, slots);
  if (recipients.length < slots) return null;
  const duration = Math.max(1, Math.min(PET_PLAY_BREAK_SECONDS, base.suggestedPauseSeconds | 0 || PET_PLAY_BREAK_SECONDS));
  return {
    ...base,
    mode: 'petBreak', key: 'petBreak', slots, duration,
    recipientIds: recipients.map(c => c.id),
    detail: petBreakDetail(duration, slots),
  };
}

export function createEconomyExperience(G, S, ctx, platform) {
  const { world, hud, fx, audio, owner, sheets, input } = ctx;
  const ui = createReliefUI(!platform || !platform.inPlayables);
  let dismissedDay = -1, pressureKey = '', pressureT = 0, current = null, tick = 0, busy = false;
  let snapshotWrapped = false;

  function ensureSnapshotIncludesTemporaryHelp() {
    if (snapshotWrapped || typeof G.snapshot !== 'function') return;
    const baseSnapshot = G.snapshot;
    G.snapshot = () => {
      const save = baseSnapshot();
      save.temporaryHelp = snapshotTemporaryHelp(G);
      // New snapshots use only the consolidated Task-12 record. save.js still migrates legacy
      // `boosts` fields from older cloud saves.
      delete save.boosts;
      return save;
    };
    snapshotWrapped = true;
  }

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
    // The return station's own coral down-arrow, then the crossed coin. Naming the station that
    // charged you is more actionable than naming the category of mistake.
    hud.toast(cue([returnIcon(), coinMinusIcon(), fee], `Food waste, handling minus ${fee} coins`));
  };

  function hide() { current = null; pressureKey = ''; pressureT = 0; ui.setModel(null); }
  function celebratePetBreak(recipients, resumed = false) {
    for (const c of recipients || []) fx.hearts(c.x, 1.05, c.z);
    audio.play('chime');
    // Paw + heart is already what the play break looks like in the room (fx.hearts fires over every
    // recipient on the line above), so the banner is the same picture at HUD scale. Resumed drops
    // the counts and shows a check instead: the news is that the promise was kept, not the size.
    hud.banner(resumed
      ? cue([pawIcon(), heartIcon(), checkIcon()], 'Pet play break resumed')
      : cue([pawIcon(), heartIcon(), recipients.length, clockIcon(), PET_PLAY_BREAK_SECONDS], `Pet play break, ${recipients.length} guests, ${PET_PLAY_BREAK_SECONDS} seconds`), 2200);
  }
  function ensureHelpState() {
    if (!G.temporaryHelp || typeof G.temporaryHelp !== 'object') G.temporaryHelp = { v: 1, roomba: null, pending: null };
    return G.temporaryHelp;
  }
  function storePending(offer, day) {
    const pending = makePendingEntitlement(offer, day);
    if (!pending) return false;
    ensureHelpState().pending = pending;
    markRewardedClaim(G.meta, day);
    // Gift, ticked, then a clock: you earned it and it is being held until it can help.
    hud.toast(cue([giftIcon(), checkIcon(), clockIcon()], 'Reward earned, saved for the next useful moment'));
    return true;
  }
  function checkpointConsumedPending() {
    // tryApplyPending runs inside G.update, so Task 08's coalescing checkpoint snapshots the
    // post-consumption state after this full simulation step. A crash/reload therefore cannot
    // replay an already-applied pending entitlement merely because no unrelated save followed it.
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('temporary-help-consumed');
  }

  function tryApplyPending() {
    const help = ensureHelpState(), pending = help.pending, d = G.dayState;
    if (!pending || !d) return false;
    const day = d.day | 0, earnedDay = pending.earnedDay | 0;
    // A completed rewarded ad is already paid for by the player. Do not silently expire that
    // entitlement just because the next useful rush arrives several days later. Only impossible
    // future-earned state is corrupt; otherwise keep the promise pending until it can be delivered.
    if (day < earnedDay) { help.pending = null; return false; }
    if (d.phase !== 'rush') return false;

    if (pending.kind === 'crew') {
      const roleUseful = pending.role !== 'runner' || runnerHasReadyWork(G, world);
      if (((G.staff && G.staff[pending.role]) | 0) < 1 || !rushCrewHasBenefit(G.staffLevels, pending.role) || !roleUseful) return false;
      const boost = makeRushCrewBoost(pending.role, day);
      if (!boost) return false;
      G.boosts.rushCrew = boost;
      help.pending = null;
      checkpointConsumedPending();
      audio.play('chime'); hud.banner(cue([personIcon(), sparkleIcon(), checkIcon()], 'Earned rush crew activated'), 2200);
      return true;
    }
    if (pending.kind === 'petBreak') {
      if (selectPetPlayBreakCustomers(G.customers, pending.slots).length < pending.slots) return false;
      const picked = startPetPlayBreak(G, d, pending.duration, pending.slots);
      if (picked.length < pending.slots) return false;
      help.pending = null;
      G.stats.rewardedPetBreaks = (G.stats.rewardedPetBreaks | 0) + 1;
      checkpointConsumedPending();
      celebratePetBreak(picked, true);
      return true;
    }
    if (pending.kind === 'roomba') {
      const mess = G.petMess;
      if (!mess || mess.roombaActive || (mess.count | 0) < 1) return false;
      const cleared = mess.sweep(pending.duration);
      if (cleared < 1) return false;
      help.pending = null;
      G.stats.rewardedRoombaSweeps = (G.stats.rewardedRoombaSweeps | 0) + 1;
      checkpointConsumedPending();
      audio.play('chime'); hud.banner(cue([broomIcon(), checkIcon(), cleared], `Earned roomba sweep, ${cleared} cleared`), 2200);
      return true;
    }
    help.pending = null;
    checkpointConsumedPending();
    return false;
  }

  async function claim() {
    if (busy || !current) return;
    const offer = current, day = G.dayState.day | 0;
    if (inShiftClaimedForShift(G.meta, day)) { hide(); return; }
    const operational = offer.mode === 'crew' || offer.mode === 'petBreak' || offer.mode === 'roomba';
    if (operational && (!G.dayState || G.dayState.phase !== 'rush')) { hide(); return; }

    busy = true; ui.watch.disabled = true;
    const rewardId = offer.mode === 'crew' ? RUSH_CREW_REWARD_ID
      : offer.mode === 'petBreak' ? PET_PLAY_BREAK_REWARD_ID
      : offer.mode === 'roomba' ? ROOMBA_REWARD_ID
      : SMART_RELIEF_REWARD_ID;
    const earned = await (platform ? platform.requestRewardedAd(rewardId) : Promise.resolve(true));
    busy = false; ui.watch.disabled = false;
    if (!earned) { hud.toast(cue([giftIcon(), crossIcon()], 'Reward unavailable, keep playing')); return; }

    if (offer.mode === 'crew') {
      const roleUseful = offer.role !== 'runner' || runnerHasReadyWork(G, world);
      if (!G.dayState || G.dayState.phase !== 'rush' || ((G.staff && G.staff[offer.role]) | 0) < 1 || !rushCrewHasBenefit(G.staffLevels, offer.role) || !roleUseful) {
        storePending(offer, day); if (platform && G.snapshot) platform.save(G.snapshot()); hide(); return;
      }
      const boost = makeRushCrewBoost(offer.role, day);
      if (!boost) { storePending(offer, day); if (platform && G.snapshot) platform.save(G.snapshot()); hide(); return; }
      G.boosts.rushCrew = boost;
      markRewardedClaim(G.meta, day);
      audio.play('chime');
      // The staffer, sparkling, plus one tier. offer.label names the role in words the play field
      // cannot use; the person glyph plus the "+1" is the whole mechanical fact.
      hud.banner(cue([personIcon(), sparkleIcon(), '+', 1], `${offer.label}, plus one tier this rush`), 2200);
    } else if (offer.mode === 'petBreak') {
      const stillEligible = selectPetPlayBreakCustomers(G.customers, offer.slots);
      if (!G.dayState || G.dayState.phase !== 'rush' || stillEligible.length < offer.slots) {
        storePending(offer, day); if (platform && G.snapshot) platform.save(G.snapshot()); hide(); return;
      }
      const picked = startPetPlayBreak(G, G.dayState, offer.duration, offer.slots);
      if (picked.length < offer.slots) { storePending(offer, day); if (platform && G.snapshot) platform.save(G.snapshot()); hide(); return; }
      markRewardedClaim(G.meta, day);
      G.stats.rewardedPetBreaks = (G.stats.rewardedPetBreaks | 0) + 1;
      celebratePetBreak(picked);
    } else if (offer.mode === 'roomba') {
      const mess = G.petMess;
      if (!G.dayState || G.dayState.phase !== 'rush' || !mess || mess.roombaActive || (mess.count | 0) < 2) {
        storePending(offer, day); if (platform && G.snapshot) platform.save(G.snapshot()); hide(); return;
      }
      const cleared = mess.sweep(offer.duration);
      if (cleared < 1) { storePending(offer, day); if (platform && G.snapshot) platform.save(G.snapshot()); hide(); return; }
      markRewardedClaim(G.meta, day);
      G.stats.rewardedRoombaSweeps = (G.stats.rewardedRoombaSweeps | 0) + 1;
      audio.play('chime');
      hud.banner(cue([broomIcon(), cleared, checkIcon()], `Roomba sweep, ${cleared} pet ${cleared === 1 ? 'mess' : 'messes'} cleared`), 2200);
    } else {
      markRewardedClaim(G.meta, day);
      G.coins += offer.reward;
      G.stats.rewardedReliefCoins = (G.stats.rewardedReliefCoins | 0) + offer.reward;
      hud.setCoins(G.coins); hud.bump(); audio.play('chime');
      hud.banner(cue([coinIcon(), '+', offer.reward], `Rush help, plus ${offer.reward} coins`), 2200);
    }
    if (platform && G.snapshot) platform.save(G.snapshot());
    hide();
  }
  ui.watch.addEventListener('click', claim);
  ui.close.addEventListener('click', () => { dismissedDay = G.dayState.day | 0; hide(); });

  return {
    update(dt) {
      ensureSnapshotIncludesTemporaryHelp();
      const breakStep = stepPetPlayBreak(G, G.dayState, dt);
      if (breakStep.assigned && breakStep.assigned.length) celebratePetBreak(breakStep.assigned, true);
      if (G.boosts && G.boosts.rushCrew && !rushCrewActive(G.boosts, G.dayState)) delete G.boosts.rushCrew;
      tryApplyPending();

      tick -= dt;
      if (tick > 0) return;
      const elapsed = 0.5; tick = elapsed;
      const d = G.dayState;
      const inReliefWindow = d && (d.phase === 'rush' || (d.phase === 'afternoon' && d.t < 172));
      const claimed = d && inShiftClaimedForShift(G.meta, d.day);
      const adReady = platform && (platform.rewardedAvailable || !platform.inPlayables) && platform.canRequestAd?.('rewarded') !== false;
      const hasPending = !!(G.temporaryHelp && G.temporaryHelp.pending);
      const operationalActive = rushCrewActive(G.boosts, d) || petPlayBreakActive(G.boosts, d) || !!(G.petMess && G.petMess.roombaActive);
      const surfaceAllowed = rewardedOfferSurfaceAllowed({
        sessionTime: G.time,
        sheetOpen: !!(sheets && sheets.isOpen),
        userPaused: !!G.userPaused,
        inputActive: !!(input && (input.active || input.pressed)),
      });
      if (!inReliefWindow || claimed || hasPending || operationalActive || dismissedDay === (d && d.day) || !adReady || !surfaceAllowed) { hide(); return; }

      let next = null;
      if (d.phase === 'rush') {
        next = rushCrewOfferFor(G, world, { now: G.time });
        if (!next) next = roombaOfferFor(G, world, { now: G.time });
        if (!next) next = petPlayBreakOfferFor(G, world, { now: G.time });
      }
      if (!next) {
        const coin = recommendSmartRelief(G, world);
        next = coin ? { ...coin, mode: 'coins' } : null;
      }
      if (!next) { hide(); return; }
      if (next.key !== pressureKey) { pressureKey = next.key; pressureT = 0; current = next; ui.setModel(null); return; }
      pressureT += elapsed; current = next;
      if (pressureT >= 5) { platform?.noteAdEligible?.('rewarded', `rush:${d.day}:${next.key}`); ui.setModel(next); }
    },
    teardown() {
      if (G.carry.onReturn) G.carry.onReturn = null;
      ui.destroy();
    },
  };
}
