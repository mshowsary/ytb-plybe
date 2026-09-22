// src/systems/offers.js — the rewarded offers, in the world (ship plan §1.7 / §1.7a).
//
// WHAT THIS REPLACED. systems/economyExperience.js showed one pill in this same screen slot that
// expanded into a THREE-SENTENCE CARD ("Your existing Runner borrows +1 Speed and +1 Carry tier
// until Rush ends. Permanent upgrades are unchanged.") for offers — rush crew, pet play break,
// roomba, a coin bridge — that the 19-day playthrough saw on 3 days out of 19, and that gave the
// player an abstract "+1 TIER" when they did. The other four placements were floating HUD chips the
// calm HUD hid outright. Measured inventory: about one rewarded view a day, all of it the summary.
//
// There are four offers now and every one of them is A THING IN THE WORLD:
//
//   Special Guest  a sparkly pet silhouette waiting just inside the door, mornings from day 3
//                  while the Pet Book is incomplete. Watching invites a pet nobody has met.
//   Helper Pup     a courier pup that trots in with a sack during a rush, when a counter is empty
//                  with a guest at it or three guests have waited 5 s. Watching fills everything.
//   Build Boost    a ▶ badge on the build pad under the owner's feet, once it is 40% paid.
//                  Watching pays up to half of it.
//   Double today   the ×2 button on the day summary (src/ui/daySummary.js + src/game.js).
//
// THE RULES THIS FILE ENFORCES (§1.7a, "rules that hold for all of them"):
//   * at most ONE offer bubble on screen at a time, and never in the first 60 s of a session;
//   * never while a sheet is open, the game is paused, or the joystick is being held;
//   * one claim per placement per game day (sim/adPacing.js owns the keys);
//   * refusing costs nothing and is never asked again that day (`dismissed`);
//   * an offer that would solve a problem the player does not have is never built at all — every
//     trigger below reads real café state, never a timer.
//
// PICTURES, NOT WORDS. The bubble is an icon, a value and the AD badge. There is no title, no
// sentence and no expanded card; test/play-field-text.test.js holds it to that.
import {
  markRewardedClaim, placementClaimedForShift, summaryBonusAmount,
  specialGuestEligible,
} from '../sim/adPacing.js';
import {
  applyBuildBoost, buildBoostFor, helperPupNeeded, restockEverything, specialGuestInvite,
} from '../sim/offers.js';
import { refreshWaitingPatience } from '../sim/customers.js';
import { petBookProgress } from '../sim/petBook.js';
import { createPet } from '../render/pets.js';
import { sackMesh } from '../render/props.js';
import { findPath, idx, cx, cz, nearestFree } from '../sim/nav.js';
import {
  coinIcon, crateIcon, crossIcon, giftIcon, mysteryPetIcon, playIcon, shopIcon, sparkleIcon,
  checkIcon, pawIcon,
} from '../ui/icons.js';
import { cue } from '../ui/hud.js';

// §1.7a: "never in the first 60 seconds of a session".
export const OFFER_MIN_SESSION_SECONDS = 60;
// How long a trigger must hold before the bubble appears. Long enough that a counter emptying for
// half a second while the owner is already walking to it never raises an offer; short enough that
// standing on a half-paid pad answers immediately.
export const OFFER_SETTLE_SECONDS = 1.5;

export const REWARD_ID = Object.freeze({
  dayend: 'pet-cafe-day-bonus-coins',
  guest: 'pet-cafe-special-guest',
  helperPup: 'pet-cafe-helper-pup',
  buildBoost: 'pet-cafe-build-boost',
  gift: 'pet-cafe-daily-gift-double',
});

export function offerSurfaceAllowed({ sessionTime = 0, sheetOpen = false, userPaused = false, inputActive = false } = {}) {
  return Number(sessionTime) >= OFFER_MIN_SESSION_SECONDS && !sheetOpen && !userPaused && !inputActive;
}

const fmt = n => Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');

/**
 * The bubble's whole contents: one pictogram, one value, one AD badge. `value` is html so it can be
 * a numeral, a glyph, or a coin glyph beside a numeral — never a word. Pure, so the test can read
 * every offer's surface without a DOM.
 */
export function compactOfferModel(offer, isDev = false) {
  if (!offer) return null;
  const badge = isDev ? 'DEV · AD' : 'AD';
  if (offer.kind === 'guest') {
    // A never-seen pet is the mystery-paw glyph; the VIP (the book's current pool is exhausted) is
    // a paw with the coin its triple tip pays, so the two rewards are not one picture.
    return offer.vip
      ? { icon: pawIcon(), value: `<i>${coinIcon()}</i>×3`, badge, aria: offer.aria }
      : { icon: mysteryPetIcon(), value: `<i>${sparkleIcon()}</i>`, badge, aria: offer.aria };
  }
  if (offer.kind === 'helperPup') {
    return { icon: crateIcon(), value: `<i>${checkIcon()}</i>`, badge, aria: offer.aria };
  }
  return { icon: shopIcon(), value: `<i>${coinIcon()}</i>+${fmt(offer.amount)}`, badge, aria: offer.aria };
}

const STYLE_ID = 'pet-cafe-offer-style';
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .offer-root{position:fixed;right:calc(10px + env(safe-area-inset-right,0px));left:auto;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:22;display:flex;align-items:center;gap:6px;pointer-events:auto}
    .offer-root.hidden{display:none}
    .offer-pill{display:flex;align-items:center;gap:8px;min-height:52px;padding:6px 10px;border:1px solid #ffffffc4;border-radius:18px;background:#FFF4E6F7;box-shadow:0 8px 26px #0003;color:#3B2E2A;cursor:pointer;animation:offer-in .28s cubic-bezier(.2,.9,.25,1)}
    .offer-pill:disabled{opacity:.6;cursor:default}
    @keyframes offer-in{from{transform:translateY(10px) scale(.92);opacity:0}to{transform:none;opacity:1}}
    .offer-icon{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:12px;background:#ffffffb8}
    .offer-icon svg{width:27px;height:27px;display:block}
    .offer-value{display:inline-flex;align-items:center;gap:3px;font:950 16px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
    .offer-value i{width:19px;height:19px;display:inline-flex}.offer-value i svg{width:100%;height:100%;display:block}
    .offer-ad{flex:none;border:1px solid #8B7CF68f;background:#eee8ff;color:#5f50bb;border-radius:8px;padding:4px 6px;font:950 9px/1 system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap}
    .offer-no{width:34px;height:34px;flex:none;border:0;border-radius:50%;background:#ffffffcc;box-shadow:0 4px 14px #0002;color:#3B2E2A;font:900 17px/1 system-ui,sans-serif;cursor:pointer}
    /* The ▶ badge that sits on the build pad itself, projected from world space. */
    .offer-pad{position:absolute;transform:translate(-50%,-50%);width:46px;height:46px;border:0;border-radius:50%;background:#FFF4E6EE;box-shadow:0 6px 18px #0004;display:grid;place-items:center;padding:0;cursor:pointer;animation:offer-pad-pulse 1.6s ease-in-out infinite}
    .offer-pad svg{width:34px;height:34px;display:block}
    @keyframes offer-pad-pulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.09)}}
    @media(max-width:360px){.offer-pill{min-height:48px;padding:5px 8px;gap:6px}.offer-icon{width:30px;height:30px}.offer-icon svg{width:24px;height:24px}.offer-value{font-size:15px}.offer-no{width:30px;height:30px}}
    @media(max-height:520px){.offer-root{bottom:calc(10px + env(safe-area-inset-bottom,0px))}}
    @media(prefers-reduced-motion:reduce){.offer-pill{animation:none}.offer-pad{animation:none}}
    body.reduced-motion .offer-pill,body.reduced-motion .offer-pad{animation:none}
  `;
  document.head.appendChild(s);
}

function createOfferUI(isDev, els) {
  ensureStyles();
  const root = document.createElement('div'); root.className = 'offer-root hidden';
  root.innerHTML = `
    <button type="button" class="offer-pill">
      <span class="offer-icon" aria-hidden="true"></span>
      <span class="offer-value" aria-hidden="true"></span>
      <span class="offer-ad" aria-hidden="true"></span>
    </button>
    <button type="button" class="offer-no" aria-label="No thanks">×</button>`;
  document.body.appendChild(root);
  // The pad badge lives in the projected-label layer, beside the build price pill.
  const pad = document.createElement('button');
  pad.type = 'button'; pad.className = 'offer-pad'; pad.style.display = 'none';
  pad.innerHTML = playIcon();
  pad.setAttribute('aria-label', 'Watch an ad to pay half of this build');
  if (els && els.fx) els.fx.appendChild(pad);

  const pill = root.querySelector('.offer-pill');
  const no = root.querySelector('.offer-no');
  const iconEl = root.querySelector('.offer-icon');
  const valueEl = root.querySelector('.offer-value');
  const adEl = root.querySelector('.offer-ad');
  let shown = null;
  return {
    root, pill, no, pad,
    setOffer(offer) {
      const compact = compactOfferModel(offer, isDev);
      if (!compact) { shown = null; root.classList.add('hidden'); pad.style.display = 'none'; return; }
      if (shown !== offer.key) {
        shown = offer.key;
        iconEl.innerHTML = compact.icon;
        valueEl.innerHTML = compact.value;
        adEl.textContent = compact.badge;
        pill.setAttribute('aria-label', `${compact.badge}. ${compact.aria}`);
        // Restart the entrance so a new offer arrives rather than swapping in place.
        pill.style.animation = 'none'; void pill.offsetWidth; pill.style.animation = '';
      }
      root.classList.remove('hidden');
    },
    setBusy(busy) { pill.disabled = !!busy; },
    hide() { shown = null; root.classList.add('hidden'); pad.style.display = 'none'; },
    destroy() { root.remove(); pad.remove(); },
  };
}

// ---- the world actors -------------------------------------------------------------------------
//
// Both are decorative: a pet group added to the scene, moved by hand, with no mover, no collision,
// no nav-grid write and no sim state — exactly the contract systems/residentPets.js keeps.

// THE SILHOUETTE'S COLOUR IS THE REWARDED VIOLET, not black. A near-black pet read as a shadow
// against the café's dark west fence in the 380x670 probe — the thing the offer is ABOUT was the
// hardest object in the frame to see. Violet is already what "this costs a video" looks like
// everywhere else in the game (the AD badge, the ▶ pad badge, the summary's ×2 button), so a
// glowing violet pet at the door says the same thing in the world that the bubble says on the HUD.
const SILHOUETTE_COLOR = '#8B7CF6';
const SILHOUETTE_GLOW = '#4B3BA8';
function tintSilhouette(group) {
  group.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const mat = node.material.clone();
    if (mat.color) mat.color.set(SILHOUETTE_COLOR);
    if (mat.emissive) mat.emissive.set(SILHOUETTE_GLOW);
    mat.transparent = true; mat.opacity = 0.9;
    node.material = mat;
  });
}

export function createOffers(G, S, ctx, platform) {
  const { world, area, hud, fx, audio, sheets, input, els, scene } = ctx;
  const isDev = !platform || !platform.inPlayables;
  const ui = createOfferUI(isDev, els);

  let current = null, holdKey = '', holdT = 0, busy = false, tick = 0, presented = false;
  const dismissed = { guest: -1, service: -1 };
  // The two world actors. Each is { P, group, t, state } or null.
  let silhouette = null, pup = null;
  const proj = { sx: 0, sy: 0, visible: true };

  // ---- Special Guest silhouette ---------------------------------------------------------------
  //
  // IN THE DOORWAY, on the café's own floor. data/area1.js's door is (-9.6, 4.2) and the west-wall
  // gap runs z 3.0-5.4, so this is the middle of the opening every guest already walks through:
  // light tiles behind it, no station footprint, and the first thing in frame when the owner is
  // anywhere near the entrance. The first probe put it at (-8.95, 5.15) and it landed against the
  // dark fence beside a planter, half-hidden — a world object nobody can see is not an offer.
  const DOOR_SPOT = { x: -8.55, z: 4.2 };
  function showSilhouette(species, variant) {
    if (silhouette) return;
    const pet = createPet(species || 'cat', variant | 0);
    tintSilhouette(pet.group);
    pet.group.position.set(DOOR_SPOT.x, 0, DOOR_SPOT.z);
    pet.group.rotation.y = Math.PI / 2; // facing east, into the café
    // A tag, not a rename: render/pets.js's group name is what tools/scene-cost.mjs attributes draw
    // calls by, and the probe still has to be able to find these two actors in the scene graph.
    pet.group.userData.petCafeOffer = 'specialGuest';
    scene.add(pet.group);
    silhouette = { pet, t: 0, sparkleT: 0 };
  }
  function hideSilhouette(burst = false) {
    if (!silhouette) return;
    if (burst) fx.burst(DOOR_SPOT.x, 0.7, DOOR_SPOT.z, '#FFD84D', 18);
    scene.remove(silhouette.pet.group);
    silhouette = null;
  }
  function stepSilhouette(dt) {
    if (!silhouette) return;
    silhouette.t += dt;
    silhouette.pet.update(dt, false, 0);
    silhouette.sparkleT -= dt;
    if (silhouette.sparkleT <= 0) {
      silhouette.sparkleT = 0.55;
      if (!reducedMotion()) fx.burst(DOOR_SPOT.x, 0.6 + Math.sin(silhouette.t) * 0.1, DOOR_SPOT.z, '#FFD84D', 6);
    }
  }

  // ---- Helper Pup ------------------------------------------------------------------------------
  // The pup walks the guests' own grid from the door to whichever counter is emptiest, waits there
  // with its sack while the offer stands, and trots back out when the offer ends either way.
  const PUP_SPEED = 2.6;
  function counterTarget() {
    let best = null, bestStock = Infinity;
    for (const id of world.displays) {
      const st = world.stations.get(id);
      if (!st || !st.active) continue;
      if ((st.stock | 0) < bestStock) { bestStock = st.stock | 0; best = st; }
    }
    return best ? { x: best.front.x, z: best.front.z } : { x: -7.5, z: 3.0 };
  }
  // The guests' own 0.5 m grid, read exactly as systems/residentPets.js reads it for a walk-in:
  // nearestFree takes a cell INDEX, findPath fills an Int32Array and returns how many cells it
  // wrote. Read-only — nothing here writes a cell, a mover or a collision box.
  function pathBetween(from, to) {
    const g = world.grid;
    if (!g) return [to];
    const a = nearestFree(g, idx(g, from.x, from.z), 3), b = nearestFree(g, idx(g, to.x, to.z), 3);
    if (a < 0 || b < 0) return [to];
    const cells = new Int32Array(g.w * g.h);
    const n = findPath(g, a, b, 3, cells);
    if (!n) return [to];
    const pts = [];
    for (let k = 1; k < n; k++) pts.push({ x: cx(g, cells[k]), z: cz(g, cells[k]) });
    pts.push({ x: to.x, z: to.z });
    return pts;
  }
  function showPup() {
    if (pup) return;
    const pet = createPet('dog', 1);
    // A COURIER, not a stray. At the play camera's distance an ordinary pet-sized dog carrying a
    // sack reads as another guest's pet; a quarter larger is enough to tell them apart without
    // making it a cartoon. render/pets.js's setBaseScale multiplies the authored base rather than
    // overwriting it, so every proportion stays exactly as drawn.
    pet.setBaseScale(1.25);
    pet.carry(sackMesh('kibble'));
    const from = { x: area.door.x - 0.4, z: area.door.z };
    pet.group.position.set(from.x, 0, from.z);
    pet.group.userData.petCafeOffer = 'helperPup';
    scene.add(pet.group);
    pup = { pet, path: pathBetween(from, counterTarget()), i: 0, leaving: false, x: from.x, z: from.z };
  }
  function sendPupHome() { if (pup && !pup.leaving) { pup.leaving = true; pup.i = 0; pup.path = pathBetween(pup, { x: area.spawnStart.x, z: area.spawnStart.z }); } }
  function removePup() { if (!pup) return; scene.remove(pup.pet.group); pup = null; }
  function stepPup(dt) {
    if (!pup) return;
    const node = pup.path[pup.i];
    let vx = 0, vz = 0;
    if (node) {
      const dx = node.x - pup.x, dz = node.z - pup.z, d = Math.hypot(dx, dz);
      if (d < 0.12) pup.i++;
      else {
        const step = Math.min(d, PUP_SPEED * dt);
        vx = (dx / d) * PUP_SPEED; vz = (dz / d) * PUP_SPEED;
        pup.x += (dx / d) * step; pup.z += (dz / d) * step;
      }
    } else if (pup.leaving) { removePup(); return; }
    pup.pet.group.position.set(pup.x, 0, pup.z);
    if (Math.hypot(vx, vz) > 0.05) pup.pet.group.rotation.y = Math.atan2(vx, vz);
    pup.pet.update(dt, Math.hypot(vx, vz) > 0.15, 0);
  }

  // The Pet Book is complete when every authored coat has been met. petBookProgress reports
  // found/total; there is no `complete` flag to read, and inventing one here would be a second
  // answer to a question sim/petBook.js already answers.
  function petBookComplete() {
    const p = petBookProgress(G.meta);
    return p.found >= p.total;
  }

  function reducedMotion() {
    if (G.settings && G.settings.reducedMotion) return true;
    try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }

  // ---- what is on offer right now ---------------------------------------------------------------
  //
  // One at a time, in the order the player feels the problem: the pad under their feet first, then
  // the rush they are losing, then the morning's guest.
  function nextOffer() {
    const d = G.dayState;
    if (!d) return null;
    const day = d.day | 0;

    if (!placementClaimedForShift(G.meta, 'service', day) && dismissed.service !== day) {
      const zone = ctx.zones && ctx.zones.armedZone;
      const boost = buildBoostFor(world, zone);
      if (boost) {
        return {
          kind: 'buildBoost', placement: 'service', key: `boost:${boost.zoneId}`,
          zoneId: boost.zoneId, x: boost.x, z: boost.z, amount: boost.amount,
          rewardId: REWARD_ID.buildBoost,
          aria: `Watch an ad to pay ${fmt(boost.amount)} coins toward this build`,
        };
      }
      if (helperPupNeeded(world, G.customers, d)) {
        return {
          kind: 'helperPup', placement: 'service', key: 'pup',
          rewardId: REWARD_ID.helperPup,
          aria: 'Watch an ad and a courier pup fills every counter, machine and supply',
        };
      }
    }

    if (!placementClaimedForShift(G.meta, 'guest', day) && dismissed.guest !== day
      && specialGuestEligible(day, d.phase) && !petBookComplete()) {
      // WHAT IS ACTUALLY COMING, resolved now rather than promised in general terms. A café whose
      // CURRENT pool is exhausted (every cat and dog met, the treat bar's bunnies not open yet)
      // still has an incomplete book, and the offer is still worth taking — but it brings the VIP,
      // not a new face, and the accessible name has to say the true thing.
      const invite = specialGuestInvite(G.meta, world.built);
      return {
        kind: 'guest', placement: 'guest', key: invite.vip ? 'guest:vip' : 'guest:new',
        vip: invite.vip,
        rewardId: REWARD_ID.guest,
        aria: invite.vip
          ? 'Watch an ad to invite a very important guest who tips three times as much'
          : 'Watch an ad to invite a pet you have never met',
      };
    }
    return null;
  }

  function clearOffer() {
    current = null; holdKey = ''; holdT = 0; presented = false;
    ui.hide();
    hideSilhouette();
    sendPupHome();
  }

  function presentWorld(offer) {
    if (offer.kind === 'guest') {
      if (!silhouette) {
        const invite = specialGuestInvite(G.meta, world.built);
        showSilhouette(invite.species || 'cat', invite.variant | 0);
      }
      sendPupHome();
    } else if (offer.kind === 'helperPup') {
      hideSilhouette();
      showPup();
    } else {
      hideSilhouette();
      sendPupHome();
    }
    if (offer.kind === 'buildBoost') {
      fx.project(offer.x, 1.45, offer.z, proj);
      ui.pad.style.left = proj.sx + 'px';
      ui.pad.style.top = proj.sy + 'px';
      ui.pad.style.display = proj.visible ? '' : 'none';
    } else ui.pad.style.display = 'none';
  }

  // ---- the rewards --------------------------------------------------------------------------------

  function grantSpecialGuest() {
    const invite = specialGuestInvite(G.meta, world.built);
    // systems/customers.js's spawn() reads this on the very next arrival and clears it. It changes
    // only WHICH identity is chosen (resolveUniquePetIdentity's preferredKey), never the seeded
    // spawn roll, so the deterministic stream tools/bot.js replays is untouched.
    G.specialGuest = invite;
    // The pet walks in NOW, through the café door, while the sparkle is still fading -- rather than
    // on whichever pacing tick would have spawned the next guest anyway. systems/customers.js's
    // spawn() is still the only thing that consumes the invitation.
    ctx.customerSystem?.inviteSpecialNow?.();
    hideSilhouette(true);
    audio.play('chime');
    // A paw and a sparkle: the guest is on their way. The card that reveals WHO is the Pet Book's
    // own discovery moment, fired by ctx.discoverPet when they walk in — the point of the offer.
    hud.banner(cue([pawIcon(), sparkleIcon()], invite.vip
      ? 'A very important guest is on the way'
      : 'A pet you have never met is on the way'), 2200);
  }

  function grantHelperPup() {
    const filled = restockEverything(world);
    const helped = refreshWaitingPatience(world, G.customers);
    if (pup) { fx.burst(pup.x, 0.8, pup.z, '#FFD84D', 16); }
    sendPupHome();
    audio.play('chime');
    hud.banner(cue([crateIcon(), checkIcon(), filled.counters + filled.machines + filled.supplies],
      `Everything restocked, ${filled.counters} counters, ${filled.machines} machines, ${filled.supplies} supplies, ${helped} guests waited out`), 2200);
    return filled;
  }

  function grantBuildBoost(offer) {
    const result = applyBuildBoost(world, offer.zoneId, offer.amount);
    if (result.spent > 0) {
      fx.billFly(offer.x, 0.6, offer.z);
      audio.play('coin');
      hud.banner(cue([shopIcon(), coinIcon(), `+${fmt(result.spent)}`], `Build boosted by ${result.spent} coins`), 2200);
    }
    // A boost that finished the pad emits the same 'built' event a hand-paid one does, so
    // systems/zones.js's reveal, the region sync and the checkpoint all happen on their own.
    return result;
  }

  async function claim() {
    if (busy || !current) return false;
    const offer = current, day = G.dayState.day | 0;
    if (placementClaimedForShift(G.meta, offer.placement, day)) { clearOffer(); return false; }
    busy = true; ui.setBusy(true);
    let earned = false;
    try { earned = platform ? !!(await platform.requestRewardedAd(offer.rewardId)) : true; }
    catch (_) { earned = false; }
    busy = false; ui.setBusy(false);
    if (!earned) {
      hud.toast(cue([giftIcon(), crossIcon()], 'Reward unavailable, keep playing'));
      return false;
    }
    // Re-check the cap AFTER the host resumes: an ad takes 30 s, and the day can turn over inside it.
    const nowDay = G.dayState.day | 0;
    if (!markRewardedClaim(G.meta, nowDay, offer.placement)) { clearOffer(); return false; }
    if (offer.kind === 'guest') grantSpecialGuest();
    else if (offer.kind === 'helperPup') grantHelperPup();
    else grantBuildBoost(offer);
    G.requestCheckpoint?.('rewarded-offer');
    if (platform && G.snapshot) platform.save(G.snapshot());
    clearOffer();
    return true;
  }

  // Refusing costs NOTHING and is never asked again today: no coins, no state, no timer.
  function refuse() {
    if (!current) return;
    dismissed[current.placement] = G.dayState.day | 0;
    clearOffer();
  }

  ui.pill.addEventListener('click', claim);
  ui.pad.addEventListener('click', claim);
  ui.no.addEventListener('click', refuse);

  return {
    // Exposed for the live probe and the smoke: what is on screen, and the two verbs.
    get current() { return current; },
    claim, refuse,
    update(dt) {
      stepSilhouette(dt);
      stepPup(dt);
      // Keep the pad badge glued to its plot every frame, not every quarter second.
      if (current && current.kind === 'buildBoost') {
        fx.project(current.x, 1.45, current.z, proj);
        ui.pad.style.left = proj.sx + 'px'; ui.pad.style.top = proj.sy + 'px';
        ui.pad.style.display = proj.visible ? '' : 'none';
      }
      tick -= dt;
      if (tick > 0) return;
      tick = 0.25;
      if (busy) return;

      const adReady = !!platform
        && (platform.rewardedAvailable || !platform.inPlayables)
        && platform.canRequestAd?.('rewarded') !== false;
      const allowed = offerSurfaceAllowed({
        sessionTime: G.time,
        sheetOpen: !!(sheets && sheets.isOpen),
        userPaused: !!G.userPaused,
        inputActive: !!(input && (input.active || input.pressed)),
      });
      if (!adReady || G.party?.active) { clearOffer(); return; }
      if (!allowed) {
        // Once an offer has actually appeared IN THE WORLD -- the silhouette waiting at the door,
        // the pup with its sack -- it is not screen UI that should vanish the instant a thumb
        // touches the joystick, which is most of a real session: measured, that hid the pet within
        // a frame of the player taking a single step, so it could only ever be seen by someone
        // standing dead still, and the tap that would have explained it was hidden by the very same
        // rule. Only the TAPPABLE pill and pad step aside here -- so a raised thumb never covers the
        // controls -- while the pet itself stays put and keeps sparkling until it is claimed,
        // refused, or a fresh look at nextOffer() below says it is genuinely no longer on offer.
        if (!presented) clearOffer(); else ui.hide();
        return;
      }

      const next = nextOffer();
      if (!next) { clearOffer(); return; }
      if (next.key !== holdKey) { holdKey = next.key; holdT = 0; current = null; presented = false; ui.hide(); return; }
      holdT += 0.25;
      current = next;
      if (holdT < OFFER_SETTLE_SECONDS) return;
      platform?.noteAdEligible?.('rewarded', `${next.placement}:${G.dayState.day}:${next.key}`);
      presentWorld(next);
      ui.setOffer(next);
      presented = true;
    },
    teardown() { ui.destroy(); hideSilhouette(); removePup(); },
  };
}

// Re-exported so src/game.js's day summary and tools can read the ×2 from one place.
export { summaryBonusAmount };
