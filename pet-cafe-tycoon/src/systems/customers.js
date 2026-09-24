import { serviceIncident } from '../sim/servicePolicy.js';
import { cue } from '../ui/hud.js';
import { clockIcon, tableDirtyIcon, displayIcon, registerIcon, coinMinusIcon } from '../ui/icons.js';
import { SOCIALS } from '../sim/petSocials.js';
// Customer render/system layer: human + named pet visitor, wish UI and pet delight moments.
import { effectiveSpawnInterval, maxCustomers, terraceSpawnInterval, terraceMaxCustomers, cafeLevel } from '../sim/economy.js';
import { spawnIntervalMultiplier } from '../sim/followers.js';
import { spawnMult, capBonus } from '../sim/day.js';
import { stepCustomers, createCustomer, gardenTableCount, PATIENCE } from '../sim/customers.js';
import { idx, isFree } from '../sim/nav.js';
import { createCustomerSpawnSequence } from '../sim/customerSpawn.js';
import { SERVICE_LABEL, dirtyTablesBlockingSeats } from '../sim/serviceQuality.js';
import { petProfile } from '../sim/petBook.js';
import {
  REGULAR_GREETING_SECONDS,
  resolveUniquePetIdentity,
  activeNamedPetKeys,
} from '../sim/regularVisitors.js';
import { dailyPetPlan, unlockedSpecies } from '../sim/petArrivals.js';
import { seedOpeningCafe } from '../sim/opening.js';
import { pawBestStar } from '../sim/pawRating.js';
import { seatById } from '../sim/world.js';
import { createHuman } from '../render/human.js';
import { createPet } from '../render/pets.js';
import { createLeash } from '../render/leash.js';
import { itemFor } from '../render/props.js';
import { cappedVisualStep } from '../core/visualMotion.js';
import { iconFor, treatIcon } from '../ui/icons.js';
import { createPetMoment } from '../ui/petMoments.js';

// Sim customers normally walk at 2.2 m/s. 2.8 leaves normal movement untouched while absorbing
// any re-plan/rescue discontinuity into a short catch-up instead of exposing it as a visible warp.
const GUEST_VISUAL_MAX_SPEED = 2.8;
// A guest who has left shrinks away over this long where it stands (on the street, past its door)
// instead of vanishing in one frame.
const LEAVE_FADE_SECONDS = 0.3;
// How close the owner has to be to a pet before its name tag appears. 2.8 m is a little over
// two floor tiles: close enough that only the pets you are actually standing among are named,
// far enough that you can read a queue of two or three as you walk past it.
const NAME_TAG_RADIUS = 2.8;

let _bubbleSeq = 0;
function makeBubble(els) {
  // The bubble and its patience bar share a label group so src/ui/labelLayout.js can move the pair
  // as one unit when it declutters the screen; solved separately they would drift apart.
  const group = 'b' + (++_bubbleSeq);
  const wrap = document.createElement('div'); wrap.className = 'wish hidden'; wrap.dataset.labelGroup = group;
  const icon1 = document.createElement('span'); icon1.className = 'wishIcon';
  const icon2 = document.createElement('span'); icon2.className = 'wishIcon hidden'; icon2.innerHTML = treatIcon();
  wrap.append(icon1, icon2);
  const bar = document.createElement('div'); bar.className = 'patience hidden'; bar.dataset.labelGroup = group;
  const fill = document.createElement('div'); fill.className = 'patienceFill';
  bar.appendChild(fill);
  els.fx.appendChild(wrap); els.fx.appendChild(bar);
  return { wrap, icon1, icon2, bar, fill };
}
function removeBubble(b) { b.wrap.remove(); b.bar.remove(); }
function petSound(species) { return species === 'dog' ? 'petDog' : species === 'bunny' ? 'petBunny' : 'petCat'; }
function anonymousIdentity() {
  // All gameplay/render callers can stay branch-free. The anonymous overflow case owns no DOM and
  // therefore can never expose a duplicate name while still preserving the customer itself.
  return {
    announce() {}, greetRegular() {}, setSeated() {}, setNear() {}, update() {}, remove() {},
  };
}

// One picture per service-recovery reason, mirroring SERVICE_LABEL's keys exactly so the two can
// never drift: the empty display case, the unmanned checkout, the empty treat bowl, the dirty table.
const RECOVERY_ICON = {
  counter: displayIcon(), register: registerIcon(), bowl: treatIcon(), table: tableDirtyIcon(),
};

export function createCustomers(G, S, ctx) {
  const { area, world, scene, hud, fx, els } = ctx;
  // The same free-cell test the movers use, handed to a pet so its leash-follow spot can never end
  // up inside a counter or a table. Both lane bits are allowed: a pet on a leash is walking exactly
  // where its owner walks, including the door lanes.
  const petWalkable = (x, z) => { const g = world.grid; return !g || isFree(g, idx(g, x, z), 3); };
  const price = ctx.price;
  const spawns = createCustomerSpawnSequence();
  const rec = new Map();
  let spawnT = 2, penaltyToastCd = 0;
  let cachedDemandKey = '', interval = 4, maxC = 6, effMaxC = 6;
  // The Ice cream garden's own stream (sim/economy.js terraceSpawnInterval): paced by its open
  // tables, capped on its own, and never counted against the café's cap above.
  let gardenSpawnT = 2, gardenKey = -1, gardenInterval = null, gardenMax = 0;
  // Guests who have left, still shrinking out (see LEAVE_FADE_SECONDS).
  const leaving = [];
  let regularPlanDay = 0, regularPlanKey = '', regularPlan = null, regularGreetedDay = 0;
  const tmpProj = { sx: 0, sy: 0, visible: true };

  function applyServicePenalty(reason, r, c) {
    const result = serviceIncident(G,c,reason);
    if(result.duplicate&&c?.serviceVisitId)return;
    const fee=result.fee;
    G.requestCheckpoint('service-recovery');
    G.dayStats.serviceMisses = (G.dayStats.serviceMisses | 0) + 1;
    if (fee <= 0) return;

    hud.setCoins(G.coins); ctx.audio.play('penalty');
    if (r) fx.number(r.human.group.position.x, r.human.height + 0.62, r.human.group.position.z, `${reason==='table'?'Refund':'Recovery'} −${fee}`, 'lost');
    if (penaltyToastCd <= 0) {
      penaltyToastCd = 1.8;
      // Each recovery reason has a picture already in the room: the empty case, the unmanned till,
      // the untouched treat bowl, the crossed table. Showing the CAUSE beside the crossed coin is
      // what makes the charge learnable -- "Service miss - recovery -12" named the charge but never
      // pointed at the thing to fix. Anything unmapped falls back to a bare clock, which is honest:
      // every recovery in this game is ultimately a guest who waited.
      hud.toast(cue([RECOVERY_ICON[reason] || clockIcon(), coinMinusIcon(), fee], `${SERVICE_LABEL[reason] || 'Service miss'}, recovery minus ${fee} coins`));
    }
  }

  // The species this cafe has opened, cached: unlockedSpecies walks the catalogue and this runs on
  // every spawn.
  let speciesCacheKey = '', speciesCache = null;
  function allowedSpecies() {
    const key = String(world.built.size);
    if (key !== speciesCacheKey) { speciesCacheKey = key; speciesCache = unlockedSpecies(world.built); }
    return speciesCache;
  }

  // TODAY'S GUARANTEED FACE (ship plan 1.6b, sim/petArrivals.js). On an odd day while the Pet Book
  // is incomplete this is a pet nobody has met; on the days between it is a named regular coming
  // back; on Sundays it is the Pet Parade's special visitor. The plan is recomputed when the day
  // ticks over AND when the cafe's species set or star rating changes, so buying the Pet treat bar
  // can hand the same day a bunny instead of leaving the promise on yesterday's pool.
  function syncRegularPlan() {
    const day = Math.max(1, (G.dayState && G.dayState.day) | 0);
    const key = day + ':' + allowedSpecies().join(',') + ':' + pawBestStar(G.meta);
    if (regularPlanKey === key) return day;
    regularPlanKey = key;
    regularPlan = dailyPetPlan(G.meta, day, world.built);
    if (regularPlanDay !== day) { regularPlanDay = day; regularGreetedDay = 0; }
    return day;
  }

  function spawn(garden = false) {
    const allowed = allowedSpecies();
    const next = spawns.next(G.meta.followers, G.meta, allowed);
    const social = G.meta.socials?.active;
    const theme = social?.status === 'running' ? SOCIALS.find(s=>s.id===social.id) : null;
    const day = syncRegularPlan();
    // THE SPECIAL GUEST (ship plan 1.7a). systems/offers.js writes G.specialGuest when the player
    // watches the ad at the door; the very next CAFE arrival is that pet. It replaces the old
    // rare-visitor ad, which rerolled a variant the book already had (and was the only Math.random
    // on this path): the invitation names a pet the book is MISSING, picked in catalogue order by
    // sim/offers.js, and consumes no RNG -- resolveUniquePetIdentity is pure, so the seeded spawn
    // stream tools/bot.js replays stays bit-identical. A garden arrival never consumes it: the
    // silhouette is waiting at the CAFE door, so that is the door it comes through.
    const special = garden ? null : (G.specialGuest || null);
    const preferredKey = special && special.key ? special.key
      : (regularPlan && regularGreetedDay !== day ? regularPlan.key : null);
    const themeSpecies = theme?.species && allowed.includes(theme.species) ? theme.species : null;
    const identityPick = resolveUniquePetIdentity(
      themeSpecies || next.species,
      next.petVariant,
      activeNamedPetKeys(G.customers),
      preferredKey,
      G.meta,
      allowed,
    );
    const { id, variant } = next;
    const species = identityPick.species;
    const petVariant = identityPick.variant;
    const profile = petProfile(species, petVariant);
    const c = createCustomer(id, species, variant, area, { garden });
    if (theme && !garden) c.socialProduct = theme.product;
    c.serviceVisitId = G.meta.servicePolicy.nextVisit++;
    c.petVariant = petVariant;
    c.petIdentityKey = identityPick.key;
    c.regularCandidate = !!(identityPick.named && preferredKey && identityPick.key === preferredKey);
    c.regularDay = day;
    // The VIP the Special Guest becomes once the Pet Book is complete: 3x the tip
    // (sim/customers.js prices it) and a friendship visit that counts twice
    // (systems/petFriendship.js). One flag, read by both.
    if (special) { c.vip = !!special.vip; G.specialGuest = null; }
    G.customers.push(c);
    attachActor(c, species, petVariant, variant, identityPick, profile, theme);
    // A four-point star over the VIP, the same glyph a Pet Social guest wears: "this one is special"
    // without a word. An invited unmet pet needs no marker -- its own discovery card is the moment.
    if (c.vip) rec.get(c.id)?.identity.announce('✦', 3);
  }

  // The render/UI half of a spawn: the human, the pet, the leash, the shadows, the wish bubble and
  // the name card. Split out of spawn() so the two OPENING GUESTS (sim/opening.js) -- seated and
  // mid-meal at t = 0 rather than walking in -- get exactly the same actor as everyone else. A
  // customer pushed into G.customers with no record here is invisible: update() skips it.
  function attachActor(c, species, petVariant, variant, identityPick, profile, theme, quiet = false) {
    const day = c.regularDay || 1;
    const human = createHuman(variant, 'customer'); human.group.position.set(c.x, 0, c.z); scene.add(human.group);
    const pet = createPet(species, petVariant); pet.group.position.set(c.x + 0.45, 0, c.z - 0.9); scene.add(pet.group);
    const leash = createLeash(scene); leash.attach(human.hand, pet.neck);
    // Batch 8 item 4: a soft contact shadow anchors both the guest and its pet to the floor. Both
    // move all shift (following the sim's own walk targets), so `follow: true` re-reads their
    // world position every frame rather than caching the spawn spot.
    const humanShadow = S.contactShadows && S.contactShadows.add(human.group, { radius: 0.44, strength: 1.05, follow: true });
    const petShadow = S.contactShadows && S.contactShadows.add(pet.group, { radius: 0.32, strength: 0.95, follow: true });
    const bub = makeBubble(els);
    const identity = identityPick.named ? createPetMoment(els, profile, c.id, species) : anonymousIdentity();
    // src/ui/petMoments.js's detail slot is textContent-only, so these are glyph SEQUENCES rather
    // than the inline SVG used everywhere else. A four-point star marks a guest the running Pet
    // Social brought in -- the same shape as sparkleIcon, which means "special" throughout the HUD.
    if(theme) identity.announce('✦', 3);
    // The daily familiar face owns the quiet greeting instead of also receiving a long rarity tag.
    // Other rare/epic visitors keep their existing discovery spotlight.
    if (!c.regularCandidate && identityPick.named && (profile.rarity === 'rare' || profile.rarity === 'epic')) {
      // Rarity as a count of stars, the notation every collection game already uses: rare is two,
      // epic is three. The card's own border colour (petMoments' .rare/.epic) carries the rest.
      identity.announce(profile.rarity === 'epic' ? '★★★' : '★★', 2.8);
    }
    rec.set(c.id, {
      human, pet, leash, identity, profile, humanShadow, petShadow,
      px: c.x, pz: c.z, eating: false, bub,
      lastState: c.state, petHappyT: 0, treatCelebrated: false, tablePenalty: false,
      regularCandidate: c.regularCandidate, regularGreeted: false, regularGreetingT: 0, regularDay: day,
    });
    if (ctx.discoverPet) ctx.discoverPet(species, petVariant, quiet ? { quiet: true } : null);
  }

  // THE FIRST THREE SECONDS (ship plan 1.6). Called once by src/game.js on a fresh save: two guests
  // already seated with their pets, each with the tip they left on the table. Never on a restore --
  // a save carries its own guests.
  function seedOpening() {
    let seq = 1000000;
    const made = seedOpeningCafe(world, G.customers, area, () => seq++);
    for (const c of made) {
      c.serviceVisitId = G.meta.servicePolicy.nextVisit++;
      c.regularDay = Math.max(1, (G.dayState && G.dayState.day) | 0);
      const profile = petProfile(c.species, c.petVariant);
      const identityPick = resolveUniquePetIdentity(
        c.species, c.petVariant, activeNamedPetKeys(G.customers.filter(x => x !== c)), null, G.meta, allowedSpecies(),
      );
      c.petIdentityKey = identityPick.key;
      attachActor(c, c.species, c.petVariant, c.variant, identityPick, profile, null, true);
      const r = rec.get(c.id), seat = c.seat;
      if (!r || !seat) continue;
      // Sit them down the way the 'seated' event would have: pose, pet on its own spot, no bubble.
      r.human.group.position.set(seat.pair.human.x, 0, seat.pair.human.z);
      r.human.group.rotation.y = c.rot;
      r.px = seat.pair.human.x; r.pz = seat.pair.human.z;
      r.human.sit(); r.human.setMood('none');
      r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden');
      r.pet.group.position.set(seat.pair.pet.x, 0, seat.pair.pet.z);
      r.pet.sit(); r.eating = true; r.identity.setSeated(true);
      r.lastState = 'eating';
    }
    return made.length;
  }

  // THE PETS WAVE AT LAST CALL (ship plan 1.6). Render-only: a happy face, a heart burst and the
  // existing greeting bob. No sim state, no coordinate and no patience clock is touched.
  function wave() {
    for (const c of G.customers) {
      const r = rec.get(c.id);
      if (!r || c.done || c.state === 'leave') continue;
      r.pet.setMood('happy');
      r.regularGreetingT = Math.max(r.regularGreetingT, REGULAR_GREETING_SECONDS * 1.6);
      fx.hearts(r.pet.group.position.x, r.pet.height + 0.24, r.pet.group.position.z);
    }
  }

  function dispose(r) {
    scene.remove(r.human.group); scene.remove(r.pet.group); r.leash.detach(); removeBubble(r.bub); r.identity.remove();
    if (S.contactShadows) { S.contactShadows.remove(r.humanShadow); S.contactShadows.remove(r.petShadow); }
  }
  function teardown() {
    for (const r of rec.values()) dispose(r);
    rec.clear();
    for (const f of leaving) dispose(f.r);
    leaving.length = 0;
    regularPlanDay = 0; regularPlan = null; regularGreetedDay = 0;
  }

  // THE INVITED GUEST ARRIVES NOW (ship plan 1.7a). systems/offers.js writes G.specialGuest the
  // instant the ad is granted and then calls this, so the pet walks in while the sparkle at the
  // door is still fading rather than whenever the next pacing tick happens to fire. Same single
  // mechanism -- spawn() reads G.specialGuest and clears it -- so there is still exactly one place
  // that consumes an invitation, and the seconds-long window where a reload could have swallowed a
  // watched ad closes with it.
  function inviteSpecialNow() {
    if (!G.specialGuest) return false;
    spawn(false);
    return true;
  }

  return {
    teardown, seedOpening, wave, inviteSpecialNow,
    prepare(dt) {
      penaltyToastCd = Math.max(0, penaltyToastCd - dt);
      syncRegularPlan();
      // Task 25: demand responds to productive rooms and useful front-of-house capacity, so a
      // Runner/Cashier hire must refresh pacing even though the built-set size did not change.
      // Star tiers now feed pacing too, so buying one visibly makes the room busier. Without the
      // level in this key a star purchase would silently leave arrival rate on its old value.
      const level = cafeLevel(G);
      const demandKey = `${world.built.size}:${G.staff && G.staff.runner | 0}:${G.staff && G.staff.cashier | 0}:${level}:${pawBestStar(G.meta)}`;
      if (demandKey !== cachedDemandKey) {
        cachedDemandKey = demandKey;
        // effectiveSpawnInterval, not spawnInterval: it is the ONE function that applies the
        // follower curve AND the Cafe Stars "+10% arrivals per star" together and re-clamps the
        // product against the demand floor. It had no caller at all before Batch E1 -- this line
        // multiplied the raw interval by the follower curve only, so the arrivals reward the Cafe
        // Stars sheet has promised since Batch 3 was never actually delivered to the cafe.
        interval = effectiveSpawnInterval(world.built, G.staff, level, {
          followerMult: spawnIntervalMultiplier(G.meta.followers),
          pawStars: pawBestStar(G.meta),
        });
        maxC = maxCustomers(world.built, G.staff, level);
      }
      const d = G.dayState;
      const mult = d ? spawnMult(d) : 1;
      effMaxC = maxC + (d ? capBonus(d) : 0) + Math.min(3, Math.floor(cafeLevel(G) / 5));
      const introCap = G.intro && G.intro.active && (G.intro.step | 0) < 3;
      const cap = introCap ? Math.min(effMaxC, 2) : effMaxC;
      // The café's cap counts the café's own guests: garden guests are extra, never a share of it.
      let gardenNow = 0;
      for (const c of G.customers) if (c.terraceBound) gardenNow++;
      if (mult > 0) {
        spawnT -= dt;
        if (spawnT <= 0 && G.customers.length - gardenNow < cap) { spawnT = interval / mult; spawn(); }
      }
      // The garden's own arrivals at its arch, once it has tables. tools/bot.js runs the same stream.
      const tables = gardenTableCount(world);
      if (tables !== gardenKey) { gardenKey = tables; gardenInterval = terraceSpawnInterval(tables); gardenMax = terraceMaxCustomers(tables); }
      if (gardenInterval && mult > 0) {
        gardenSpawnT -= dt;
        if (gardenSpawnT <= 0 && gardenNow < gardenMax) { gardenSpawnT = gardenInterval * spawnIntervalMultiplier(G.meta.followers) / mult; spawn(true); }
      }

    },
    update(dt) {
      stepCustomers(G.customers, world, price, dt);

      for (const c of G.customers) {
        const r = rec.get(c.id); if (!r) continue;
        // Trigger only after the guest actually enters the useful café floor. petMoment timers count
        // visible screen time, so the name + welcome-back beat lasts ~1s on screen rather than
        // expiring outside the camera. No customer state is paused or redirected.
        if (r.regularCandidate && !r.regularGreeted && c.state !== 'enter' && c.state !== 'leave' && !c.done) {
          r.regularGreeted = true;
          r.regularGreetingT = REGULAR_GREETING_SECONDS;
          regularGreetedDay = r.regularDay;
          // A returning face: the recycle-style arrow, not a greeting. The regular-greeting border
          // and the heart burst beside it already carry the warmth.
          r.identity.greetRegular('↺', REGULAR_GREETING_SECONDS);
          r.pet.setMood('happy');
          fx.hearts(r.pet.group.position.x, r.pet.height + .22, r.pet.group.position.z);
        }
        if (!r.treatCelebrated && r.lastState === 'atBowl' && c.state !== 'atBowl' && (c.order || []).includes('treat')) {
          r.treatCelebrated = true; r.petHappyT = 1.7; r.pet.setMood('happy');
          r.identity.announce('♥', 2.5);
          fx.hearts(r.pet.group.position.x, r.pet.height + 0.25, r.pet.group.position.z);
          ctx.audio.play(petSound(c.species));
        }
        // A paid guest with nowhere clean to sit used to carry a per-head countdown, re-announced
        // every frame — which also pinned their name tag on screen for the whole wait, whatever the
        // proximity rule said. Two things made it wrong. It counted down from 8 while the grace is
        // WAIT_SEAT_GRACE (18), so it sat at "0s" for ten seconds and meant nothing; and now that
        // guests wait out an honestly full room as well as a dirty one, and wait in a group by the
        // tables, it came back as the wall of pills this game keeps being asked to stop drawing.
        //
        // The message is already on the floor and much clearer than a number: a little crowd
        // standing by the tables, and the objective pointing at the dirty one with the broom glyph.

      }

      for (const e of world.events) {
        const r = rec.get(e.id);
        if (e.type === 'lost'||e.type==='tableRefund') applyServicePenalty(e.type==='tableRefund'?'table':e.reason, r || null, G.customers.find(c=>c.id===e.id));
        if (!r) continue;
        if (e.type === 'took') { r.pet.carry(itemFor(e.product)); r.human.setMood('none'); }
        else if (e.type === 'angry') { r.human.setMood('angry'); ctx.audio.play('angry'); }
        else if (e.type === 'wish') {
          r.bub.icon1.innerHTML = iconFor(e.product);
          r.bub.icon2.classList.toggle('hidden', !e.treat);
          r.bub.wrap.classList.toggle('wide', !!e.treat);
          r.bub.wrap.classList.remove('hidden');
          r.bub.bar.classList.remove('hidden');
        }
        else if (e.type === 'patience') {
          const pct = Math.max(0, Math.min(1, e.value / PATIENCE));
          r.bub.fill.style.width = (pct * 44) + 'px';
          r.bub.fill.classList.toggle('warn', pct <= 0.5 && pct > 0.25);
          r.bub.fill.classList.toggle('bad', pct <= 0.25);
          r.bub.wrap.classList.toggle('shake', pct <= 0.25);
        }
        else if (e.type === 'lost') {
          fx.number(r.human.group.position.x, r.human.height + 0.5, r.human.group.position.z, '−', 'lost');
        }
        else if (e.type === 'processed') {
          const st = world.stations.get(e.checkoutId);
          if (st) { fx.burst(st.x, 1.0, st.z, '#7FD69A', 6); fx.number(st.x, 1.4, st.z, '+' + e.amount); }
          ctx.audio.play('chime');
          if (e.by === 'owner' && ctx.owner) ctx.owner.tap();
          else if (e.by === 'cashier') ctx.tapCashier && ctx.tapCashier(e.checkoutId);
        }
        else if (e.type === 'seated') {
          const seat = seatById(world, e.seatId);
          const c = G.customers.find(cc => cc.id === e.id);
          r.human.group.position.set(seat.pair.human.x, 0, seat.pair.human.z);
          r.px = seat.pair.human.x; r.pz = seat.pair.human.z;
          if (c) r.human.group.rotation.y = c.rot;
          r.human.sit(); r.human.setMood('none');
          r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden');
          r.pet.group.position.set(seat.pair.pet.x, 0, seat.pair.pet.z);
          r.pet.sit(); r.eating = true; r.identity.setSeated(true); r.identity.announce('♥', 1.5);
          fx.hearts(seat.pair.pet.x, r.pet.height + 0.3, seat.pair.pet.z);
        }
      }

      for (let i = G.customers.length - 1; i >= 0; i--) {
        const c = G.customers[i]; const r = rec.get(c.id);
        if (!r) continue;
        if (c.done) {
          // Out of the sim at once (G.customers), out of the picture over LEAVE_FADE_SECONDS: the
          // guest and its pet shrink away on the street spot they walked out to.
          removeBubble(r.bub); r.identity.remove();
          leaving.push({ r, t: 0 });
          rec.delete(c.id); G.customers.splice(i, 1); continue;
        }

        // The Pet Play Break's floating patience floor (and the bobbing pet that showed it) went
        // with its rewarded offer in Batch E2 (ship plan 1.7 "Cut: ... play break"). The Helper Pup
        // restores patience outright instead, which needs no per-guest render state at all.
        if (r.petHappyT > 0) {
          r.petHappyT = Math.max(0, r.petHappyT - dt);
          if (r.petHappyT === 0 && r.regularGreetingT <= 0) r.pet.setMood('none');
        }
        if (r.regularGreetingT > 0) {
          r.regularGreetingT = Math.max(0, r.regularGreetingT - dt);
          if (r.regularGreetingT === 0 && r.petHappyT <= 0) r.pet.setMood('none');
        }
        if (r.eating && c.state !== 'eating') {
          r.pet.stand(); r.human.stand(); r.eating = false; r.identity.setSeated(false);
          r.px = r.human.group.position.x; r.pz = r.human.group.position.z;
        }
        if (r.eating) {
          r.pet.update(dt, false, 0);
        } else {
          const step = cappedVisualStep(r.px, r.pz, c.x, c.z, GUEST_VISUAL_MAX_SPEED, dt);
          const safeDt = Math.max(dt, 1e-4);
          const vx = (step.x - r.px) / safeDt, vz = (step.z - r.pz) / safeDt;
          r.px = step.x; r.pz = step.z;
          r.human.group.position.set(r.px, 0, r.pz); r.human.update(dt, vx, vz);
          r.pet.followTarget(r.px, r.pz, c.rot, dt, petWalkable);
          if (c.state === 'queue' || c.state === 'atBowl' || c.state === 'atRegister') r.human.setMood(c.mood === 'wait' ? 'wait' : 'none');
        }

        const traitTarget = r.profile.name === 'Marmalade' ? world.stations.get('oven1')
          : r.profile.name === 'Snowdrop' ? world.stations.get('bush1') : G.P;
        if (c.mood !== 'angry' && traitTarget?.active !== false) {
          r.pet.react(r.profile.name, G.time + c.id * 0.37, traitTarget,
            !!G.settings.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        }
        if (r.regularGreetingT > 0) {
          // A tiny render-only hello: happy face, head/body tilt and 4cm bounce. No sim coordinate,
          // mover, queue state or patience clock is changed.
          const hello = (G.time + c.id * .19) * 8;
          r.pet.setMood('happy');
          r.pet.group.position.y += .025 + Math.abs(Math.sin(hello)) * .04;
          r.pet.group.rotation.z = Math.sin(hello * .65) * .055;
        } else if (Math.abs(r.pet.group.rotation.z) > 0.001) {
          r.pet.group.rotation.z *= Math.max(0, 1 - dt * 12);
        }
        const calm = !!G.settings.reducedMotion || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        r.pet.social(dt, { state: c.state, target: G.P, reducedMotion: calm || r.regularGreetingT > 0 });
        if (r._socialState !== c.state) {
          if (!calm && (c.state === 'atRegister' || (c.state === 'leave' && c.mood !== 'angry'))) r.human.greet();
          r._socialState = c.state;
        }
        r.leash.update();

        if (c.state === 'leave' || c.state === 'waitSeat' || c.state === 'noSeat' || c.done) {
          r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden');
        } else if (!r.eating) {
          fx.project(r.px, r.human.height + 0.55, r.pz, tmpProj);
          r.bub.wrap.style.left = tmpProj.sx + 'px'; r.bub.wrap.style.top = tmpProj.sy + 'px';
          r.bub.bar.style.left = tmpProj.sx + 'px'; r.bub.bar.style.top = (tmpProj.sy + 6) + 'px';
        }

        const pp = r.pet.group.position;
        // An ordinary name tag is a proximity read, not a permanent badge -- see ui/petMoments.js.
        r.identity.setNear(Math.hypot(pp.x - G.P.x, pp.z - G.P.z) <= NAME_TAG_RADIUS);
        r.identity.update(dt, fx, pp.x, r.pet.height + 0.42, pp.z);
        r.lastState = c.state;
      }

      for (let i = leaving.length - 1; i >= 0; i--) {
        const f = leaving[i];
        f.t += dt;
        const s = Math.max(0, 1 - f.t / LEAVE_FADE_SECONDS);
        f.r.human.group.scale.setScalar(s); f.r.pet.group.scale.setScalar(s); f.r.leash.update();
        if (s <= 0) {
          scene.remove(f.r.human.group); scene.remove(f.r.pet.group); f.r.leash.detach();
          if (S.contactShadows) { S.contactShadows.remove(f.r.humanShadow); S.contactShadows.remove(f.r.petShadow); }
          leaving.splice(i, 1);
        }
      }
    },
  };
}
