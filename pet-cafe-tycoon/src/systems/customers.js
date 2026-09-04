// Customer render/system layer: human + named pet visitor, wish UI and pet delight moments.
import { spawnInterval, maxCustomers, cafeLevel } from '../sim/economy.js';
import { spawnMult, capBonus } from '../sim/day.js';
import { stepCustomers, createCustomer, SPECIES, PATIENCE } from '../sim/customers.js';
import { serviceRecoveryCost, SERVICE_LABEL, dirtyTablesBlockingSeats } from '../sim/serviceQuality.js';
import { PET_VARIANT_WEIGHTS, petProfile } from '../sim/petBook.js';
import { seatById } from '../sim/world.js';
import { createHuman } from '../render/human.js';
import { createPet } from '../render/pets.js';
import { createLeash } from '../render/leash.js';
import { itemFor } from '../render/props.js';
import { makeRng } from '../core/rng.js';
import { cappedVisualStep } from '../core/visualMotion.js';
import { iconFor, treatIcon } from '../ui/icons.js';
import { createPetMoment } from '../ui/petMoments.js';

const SPAWN_SEED = 20260902;
// Sim customers normally walk at 2.2 m/s. 2.8 leaves normal movement untouched while absorbing
// any re-plan/rescue discontinuity into a short catch-up instead of exposing it as a visible warp.
const GUEST_VISUAL_MAX_SPEED = 2.8;

function makeBubble(els) {
  const wrap = document.createElement('div'); wrap.className = 'wish hidden';
  const icon1 = document.createElement('span'); icon1.className = 'wishIcon';
  const icon2 = document.createElement('span'); icon2.className = 'wishIcon hidden'; icon2.innerHTML = treatIcon();
  wrap.append(icon1, icon2);
  const bar = document.createElement('div'); bar.className = 'patience hidden';
  const fill = document.createElement('div'); fill.className = 'patienceFill';
  bar.appendChild(fill);
  els.fx.appendChild(wrap); els.fx.appendChild(bar);
  return { wrap, icon1, icon2, bar, fill };
}
function removeBubble(b) { b.wrap.remove(); b.bar.remove(); }
function petSound(species) { return species === 'dog' ? 'petDog' : species === 'bunny' ? 'petBunny' : 'petCat'; }

export function createCustomers(G, S, ctx) {
  const { area, world, scene, hud, fx, els } = ctx;
  const price = ctx.price;
  const rng = makeRng(SPAWN_SEED);
  const rec = new Map();
  let spawnT = 2, seq = 1, speciesIdx = 0, penaltyToastCd = 0;
  let cachedBuiltSize = -1, interval = 4, maxC = 6;
  const tmpProj = { sx: 0, sy: 0, visible: true };

  function applyServicePenalty(reason, r) {
    const fee = serviceRecoveryCost(reason, G.coins);
    G.dayStats.serviceMisses = (G.dayStats.serviceMisses | 0) + 1;
    if (fee <= 0) return;
    G.coins -= fee;
    G.dayStats.serviceFees = (G.dayStats.serviceFees | 0) + fee;
    G.stats.serviceFees = (G.stats.serviceFees | 0) + fee;
    hud.setCoins(G.coins); ctx.audio.play('penalty');
    if (r) fx.number(r.human.group.position.x, r.human.height + 0.62, r.human.group.position.z, `-${fee}`, 'lost');
    if (penaltyToastCd <= 0) {
      penaltyToastCd = 1.8;
      hud.toast(`${SERVICE_LABEL[reason] || 'Service miss'} · recovery -${fee}`);
    }
  }

  function spawn() {
    const species = SPECIES[speciesIdx++ % SPECIES.length];
    const petVariant = rng.pick(PET_VARIANT_WEIGHTS);
    const profile = petProfile(species, petVariant);
    const variant = { shirt: rng.i(0, 4), hair: rng.i(0, 3), skin: rng.i(0, 2) };
    const c = createCustomer(seq++, species, variant, area);
    c.petVariant = petVariant;
    G.customers.push(c);
    const human = createHuman(variant, 'customer'); human.group.position.set(c.x, 0, c.z); scene.add(human.group);
    const pet = createPet(species, petVariant); pet.group.position.set(c.x + 0.45, 0, c.z - 0.9); scene.add(pet.group);
    const leash = createLeash(scene); leash.attach(human.hand, pet.neck);
    const bub = makeBubble(els);
    const identity = createPetMoment(els, profile);
    if (profile.rarity === 'rare' || profile.rarity === 'epic') identity.announce(`${profile.rarity.toUpperCase()} VISITOR`, 2.8);
    rec.set(c.id, {
      human, pet, leash, identity, profile,
      px: c.x, pz: c.z, eating: false, bub,
      lastState: c.state, petHappyT: 0, treatCelebrated: false, tablePenalty: false,
    });
    if (ctx.discoverPet) ctx.discoverPet(species, petVariant);
  }

  function teardown() {
    for (const r of rec.values()) {
      scene.remove(r.human.group); scene.remove(r.pet.group); r.leash.detach(); removeBubble(r.bub); r.identity.remove();
    }
    rec.clear();
  }

  return {
    teardown,
    update(dt) {
      penaltyToastCd = Math.max(0, penaltyToastCd - dt);
      if (world.built.size !== cachedBuiltSize) {
        cachedBuiltSize = world.built.size;
        interval = spawnInterval(world.built); maxC = maxCustomers(world.built);
      }
      const d = G.dayState;
      const mult = d ? spawnMult(d) : 1;
      const effMaxC = maxC + (d ? capBonus(d) : 0) + Math.min(3, Math.floor(cafeLevel(G) / 5));
      const introCap = G.intro && G.intro.active && (G.intro.step | 0) < 3;
      const cap = introCap ? Math.min(effMaxC, 2) : effMaxC;
      if (mult > 0) {
        spawnT -= dt;
        if (spawnT <= 0 && G.customers.length < cap) { spawnT = interval / mult; spawn(); }
      }

      stepCustomers(G.customers, world, price, dt);

      for (const c of G.customers) {
        const r = rec.get(c.id); if (!r) continue;
        if (!r.treatCelebrated && r.lastState === 'atBowl' && c.state !== 'atBowl' && (c.order || []).includes('treat')) {
          r.treatCelebrated = true; r.petHappyT = 1.7; r.pet.setMood('happy');
          r.identity.announce('LOVES THE TREAT ♥', 2.5);
          fx.hearts(r.pet.group.position.x, r.pet.height + 0.25, r.pet.group.position.z);
          ctx.audio.play(petSound(c.species));
        }
        if (!r.tablePenalty && r.lastState === 'atRegister' && c.state === 'leave' && c.paid && dirtyTablesBlockingSeats(world)) {
          r.tablePenalty = true;
          applyServicePenalty('table', r);
          r.identity.announce('WANTED A CLEAN TABLE', 2.2);
        }
      }

      for (const e of world.events) {
        const r = rec.get(e.id);
        if (e.type === 'lost') applyServicePenalty(e.reason, r || null);
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
          r.pet.sit(); r.eating = true; r.identity.setSeated(true); r.identity.announce('RELAXING', 1.5);
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

        if (r.petHappyT > 0) {
          r.petHappyT = Math.max(0, r.petHappyT - dt);
          if (r.petHappyT === 0) r.pet.setMood('none');
        }
        if (r.eating && c.state !== 'eating') {
          r.pet.stand(); r.human.stand(); r.eating = false; r.identity.setSeated(false);
          // Resume from the real seated render position, not the sim's potentially already-moving coordinate.
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
          // Follow the visible human. A hidden sim recovery can no longer yank the pet ahead of its owner.
          r.pet.followTarget(r.px, r.pz, c.rot, dt);
          if (c.state === 'queue' || c.state === 'atBowl' || c.state === 'atRegister') r.human.setMood(c.mood === 'wait' ? 'wait' : 'none');
        }
        r.leash.update();

        if (c.state === 'leave' || c.done) {
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
