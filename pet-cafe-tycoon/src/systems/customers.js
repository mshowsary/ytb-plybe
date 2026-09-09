import { serviceIncident } from '../sim/servicePolicy.js';
import { cue } from '../ui/hud.js';
import { clockIcon, tableDirtyIcon, displayIcon, registerIcon, coinMinusIcon } from '../ui/icons.js';
import { SOCIALS } from '../sim/petSocials.js';
// Customer render/system layer: human + named pet visitor, wish UI and pet delight moments.
import { spawnInterval, maxCustomers, cafeLevel } from '../sim/economy.js';
import { spawnIntervalMultiplier } from '../sim/followers.js';
import { spawnMult, capBonus } from '../sim/day.js';
import { stepCustomers, createCustomer, PATIENCE } from '../sim/customers.js';
import { createCustomerSpawnSequence } from '../sim/customerSpawn.js';
import { SERVICE_LABEL, dirtyTablesBlockingSeats } from '../sim/serviceQuality.js';
import { petProfile } from '../sim/petBook.js';
import {
  REGULAR_GREETING_SECONDS,
  regularIdentityForDay,
  resolveUniquePetIdentity,
  activeNamedPetKeys,
} from '../sim/regularVisitors.js';
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
    announce() {}, greetRegular() {}, setSeated() {}, setPlayBreak() {}, update() {}, remove() {},
  };
}

// One picture per service-recovery reason, mirroring SERVICE_LABEL's keys exactly so the two can
// never drift: the empty display case, the unmanned checkout, the empty treat bowl, the dirty table.
const RECOVERY_ICON = {
  counter: displayIcon(), register: registerIcon(), bowl: treatIcon(), table: tableDirtyIcon(),
};

export function createCustomers(G, S, ctx) {
  const { area, world, scene, hud, fx, els } = ctx;
  const price = ctx.price;
  const spawns = createCustomerSpawnSequence();
  const rec = new Map();
  let spawnT = 2, penaltyToastCd = 0;
  let cachedDemandKey = '', interval = 4, maxC = 6, effMaxC = 6;
  let regularPlanDay = 0, regularPlan = null, regularGreetedDay = 0;
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

  function syncRegularPlan() {
    const day = Math.max(1, (G.dayState && G.dayState.day) | 0);
    if (regularPlanDay === day) return day;
    regularPlanDay = day;
    regularPlan = regularIdentityForDay(G.meta, day);
    regularGreetedDay = 0;
    return day;
  }

  function spawn() {
    const next = spawns.next(G.meta.followers, G.meta);
    const social = G.meta.socials?.active;
    const theme = social?.status === 'running' ? SOCIALS.find(s=>s.id===social.id) : null;
    const day = syncRegularPlan();
    const preferredKey = regularPlan && regularGreetedDay !== day ? regularPlan.key : null;
    // The rare-visitor rewarded ad promises the NEXT guest is a rare or epic pet, so it overrides
    // the rolled variant for exactly one spawn. Math.random is safe here and only here: this branch
    // runs solely after a live ad claim, which no headless bot ever performs, so it cannot desync
    // sim/customerSpawn.js's seeded stream. The flag is cleared whether or not an identity was free.
    const forcedVariant = G.rareVisitorPending ? (Math.random() < 0.5 ? 2 : 3) : null;
    if (forcedVariant != null) G.rareVisitorPending = false;
    const identityPick = resolveUniquePetIdentity(
      theme?.species || next.species,
      forcedVariant != null ? forcedVariant : next.petVariant,
      activeNamedPetKeys(G.customers),
      preferredKey,
      G.meta,
    );
    const { id, variant } = next;
    const species = identityPick.species;
    const petVariant = identityPick.variant;
    const profile = petProfile(species, petVariant);
    const c = createCustomer(id, species, variant, area);
    if (theme) c.socialProduct = theme.product;
    c.serviceVisitId = G.meta.servicePolicy.nextVisit++;
    c.petVariant = petVariant;
    c.petIdentityKey = identityPick.key;
    c.regularCandidate = !!(identityPick.named && preferredKey && identityPick.key === preferredKey);
    c.regularDay = day;
    G.customers.push(c);
    const human = createHuman(variant, 'customer'); human.group.position.set(c.x, 0, c.z); scene.add(human.group);
    const pet = createPet(species, petVariant); pet.group.position.set(c.x + 0.45, 0, c.z - 0.9); scene.add(pet.group);
    const leash = createLeash(scene); leash.attach(human.hand, pet.neck);
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
      human, pet, leash, identity, profile,
      px: c.x, pz: c.z, eating: false, spaSeated: false, bub,
      lastState: c.state, petHappyT: 0, petBreakActive: false, treatCelebrated: false, tablePenalty: false,
      regularCandidate: c.regularCandidate, regularGreeted: false, regularGreetingT: 0, regularDay: day,
    });
    if (ctx.discoverPet) ctx.discoverPet(species, petVariant);
  }

  function teardown() {
    for (const r of rec.values()) {
      scene.remove(r.human.group); scene.remove(r.pet.group); r.leash.detach(); removeBubble(r.bub); r.identity.remove();
    }
    rec.clear();
    regularPlanDay = 0; regularPlan = null; regularGreetedDay = 0;
  }

  return {
    teardown,
    prepare(dt) {
      penaltyToastCd = Math.max(0, penaltyToastCd - dt);
      syncRegularPlan();
      // Task 25: demand responds to productive rooms and useful front-of-house capacity, so a
      // Runner/Cashier hire must refresh pacing even though the built-set size did not change.
      // Star tiers now feed pacing too, so buying one visibly makes the room busier. Without the
      // level in this key a star purchase would silently leave arrival rate on its old value.
      const level = cafeLevel(G);
      const demandKey = `${world.built.size}:${G.staff && G.staff.runner | 0}:${G.staff && G.staff.cashier | 0}:${level}`;
      if (demandKey !== cachedDemandKey) {
        cachedDemandKey = demandKey;
        interval = spawnInterval(world.built, G.staff, level) * spawnIntervalMultiplier(G.meta.followers);
        maxC = maxCustomers(world.built, G.staff, level);
      }
      const d = G.dayState;
      const mult = d ? spawnMult(d) : 1;
      effMaxC = maxC + (d ? capBonus(d) : 0) + Math.min(3, Math.floor(cafeLevel(G) / 5));
      const introCap = G.intro && G.intro.active && (G.intro.step | 0) < 3;
      const cap = introCap ? Math.min(effMaxC, 2) : effMaxC;
      if (mult > 0) {
        spawnT -= dt;
        if (spawnT <= 0 && G.customers.length < cap) { spawnT = interval / mult; spawn(); }
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
        // A paid guest with nowhere clean to sit. The countdown alone is the message: the guest is
        // standing beside the dirty table, and the objective chevron is already pointing at it with
        // the broom glyph, so a caption would only repeat what two other layers are showing.
        if(c.state==='waitSeat') r.identity.announce(Math.max(0,Math.ceil(8-c.dirtyWait))+'s',1);

      }

      for (const e of world.events) {
        const r = rec.get(e.id);
        if (e.type === 'lost'||e.type==='tableRefund') applyServicePenalty(e.type==='tableRefund'?'table':e.reason, r || null, G.customers.find(c=>c.id===e.id));
        if (!r) continue;
        if (e.type === 'took') { r.pet.carry(itemFor(e.product)); r.human.setMood('none'); }
        else if (e.type === 'pay') { G.stats.served = (G.stats.served | 0) + 1; }
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
          scene.remove(r.human.group); scene.remove(r.pet.group); r.leash.detach(); removeBubble(r.bub); r.identity.remove();
          rec.delete(c.id); G.customers.splice(i, 1); continue;
        }

        const petBreakNow = Number.isFinite(c._petBreakFloor);
        if (petBreakNow && !r.petBreakActive) {
          r.petBreakActive = true;
          r.identity.setPlayBreak(true);
          r.pet.setMood('happy');
          fx.hearts(r.pet.group.position.x, r.pet.height + 0.25, r.pet.group.position.z);
        } else if (!petBreakNow && r.petBreakActive) {
          r.petBreakActive = false;
          r.identity.setPlayBreak(false);
          r.pet.group.rotation.z = 0;
          if (r.petHappyT <= 0 && r.regularGreetingT <= 0) r.pet.setMood('none');
        }

        if (r.petHappyT > 0) {
          r.petHappyT = Math.max(0, r.petHappyT - dt);
          if (r.petHappyT === 0 && !r.petBreakActive && r.regularGreetingT <= 0) r.pet.setMood('none');
        }
        if (r.regularGreetingT > 0) {
          r.regularGreetingT = Math.max(0, r.regularGreetingT - dt);
          if (r.regularGreetingT === 0 && !r.petBreakActive && r.petHappyT <= 0) r.pet.setMood('none');
        }
        // Batch 5 (plan §3.9, "pets' owners sit while pets are pampered"): sim/customers.js moves a
        // spa guest onto a free lounge seat (c.spaSeatId) for the length of an OPEN groom/bath
        // session while its state stays 'atGroom'/'atBath', so this cannot reuse the 'eating'
        // switch above. It keys on r.px/r.pz having actually converged on the seat's human spot —
        // the ordinary walk rendering drives them there first — so the guest is seen walking over,
        // never teleporting. The pet stays at the table/tub: the one place its drawn position is not
        // the leash-follow spot.
        const spaLoungeSeat = c.spaSeatId ? seatById(world, c.spaSeatId) : null;
        const spaSeatedNow = !!(spaLoungeSeat && Math.hypot(r.px - spaLoungeSeat.pair.human.x, r.pz - spaLoungeSeat.pair.human.z) < 0.08);
        if (!r.spaSeated && spaSeatedNow) {
          r.human.group.position.set(spaLoungeSeat.pair.human.x, 0, spaLoungeSeat.pair.human.z);
          r.px = spaLoungeSeat.pair.human.x; r.pz = spaLoungeSeat.pair.human.z;
          r.human.group.rotation.y = c.rot;
          r.human.sit(); r.human.setMood('none');
          r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden');
          const spaTableSt = c._spaTarget ? world.stations.get(c._spaTarget) : null;
          if (spaTableSt) { r.pet.group.position.set(spaTableSt.front.x, 0, spaTableSt.front.z); r.pet.sit(); }
          r.spaSeated = true;
        } else if (r.spaSeated && !spaSeatedNow) {
          r.pet.stand(); r.human.stand(); r.spaSeated = false;
          r.px = r.human.group.position.x; r.pz = r.human.group.position.z;
        }
        if (r.eating && c.state !== 'eating') {
          r.pet.stand(); r.human.stand(); r.eating = false; r.identity.setSeated(false);
          r.px = r.human.group.position.x; r.pz = r.human.group.position.z;
        }
        if (r.eating || r.spaSeated) {
          r.pet.update(dt, false, 0);
        } else {
          const step = cappedVisualStep(r.px, r.pz, c.x, c.z, GUEST_VISUAL_MAX_SPEED, dt);
          const safeDt = Math.max(dt, 1e-4);
          const vx = (step.x - r.px) / safeDt, vz = (step.z - r.pz) / safeDt;
          r.px = step.x; r.pz = step.z;
          r.human.group.position.set(r.px, 0, r.pz); r.human.update(dt, vx, vz);
          r.pet.followTarget(r.px, r.pz, c.rot, dt);
          // A pet fresh from the bath sparkles for BATH_SPARKLE_SECONDS: c.sparkleUntil is stamped
          // by the sim against its own clock (world.t, advanced by stepBath). An interval burst
          // rather than a per-frame particle, so twenty seconds costs a few dozen sprites.
          if (c.sparkleUntil > (world.t || 0) && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            r._sparkleT = (r._sparkleT || 0) + dt;
            if (r._sparkleT >= 0.45) {
              r._sparkleT = 0;
              const pp = r.pet.group.position; fx.burst(pp.x, 0.7, pp.z, '#BFEFFA', 3);
            }
          }
          if (c.state === 'queue' || c.state === 'atBowl' || c.state === 'atRegister' || c.state === 'toPhoto' || c.state === 'atPhoto') r.human.setMood(c.mood === 'wait' ? 'wait' : 'none');
        }

        const traitTarget = r.profile.name === 'Marmalade' ? world.stations.get('oven1')
          : r.profile.name === 'Snowdrop' ? world.stations.get('bush1') : G.P;
        if (!r.petBreakActive && c.mood !== 'angry' && traitTarget?.active !== false) {
          r.pet.react(r.profile.name, G.time + c.id * 0.37, traitTarget,
            !!G.settings.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        }
        if (r.petBreakActive) {
          const pulse = (G.time + (c.id | 0) * 0.17) * 7;
          r.pet.setMood('happy');
          r.pet.group.position.y += 0.035 + Math.abs(Math.sin(pulse)) * 0.08;
          r.pet.group.rotation.z = Math.sin(pulse * 0.67) * 0.075;
        } else if (r.regularGreetingT > 0) {
          // A tiny render-only hello: happy face, head/body tilt and 4cm bounce. No sim coordinate,
          // mover, queue state or patience clock is changed.
          const hello = (G.time + c.id * .19) * 8;
          r.pet.setMood('happy');
          r.pet.group.position.y += .025 + Math.abs(Math.sin(hello)) * .04;
          r.pet.group.rotation.z = Math.sin(hello * .65) * .055;
        } else if (Math.abs(r.pet.group.rotation.z) > 0.001) {
          r.pet.group.rotation.z *= Math.max(0, 1 - dt * 12);
        }
        r.leash.update();

        // toPhoto/atPhoto join this list because the guest's order is already paid for by then —
        // leaving the wish bubble up would float a resolved order over their head all through the
        // photo detour.
        if (c.state === 'leave' || c.state === 'waitSeat' || c.state === 'noSeat' || c.state === 'toPhoto' || c.state === 'atPhoto' || c.done) {
          r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden');
        } else if (!r.eating) {
          fx.project(r.px, r.human.height + 0.55, r.pz, tmpProj);
          r.bub.wrap.style.left = tmpProj.sx + 'px'; r.bub.wrap.style.top = tmpProj.sy + 'px';
          r.bub.bar.style.left = tmpProj.sx + 'px'; r.bub.bar.style.top = (tmpProj.sy + 6) + 'px';
        }

        const pp = r.pet.group.position;
        r.identity.update(dt, fx, pp.x, r.pet.height + 0.42, pp.z);
        r.lastState = c.state;
      }

      let urgent = false;
      for (const c of G.customers) if (!c.done && c.patience < 4) { urgent = true; break; }
      hud.setCrowd(G.customers.length, effMaxC, urgent);
    },
  };
}
