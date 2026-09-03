// src/systems/customers.js — spawns humans-with-pets, steps the sim, renders the pair and owns wish UI.
import { spawnInterval, maxCustomers, cafeLevel } from '../sim/economy.js';
import { spawnMult, capBonus } from '../sim/day.js';
import { stepCustomers, createCustomer, SPECIES, PATIENCE } from '../sim/customers.js';
import { PET_VARIANT_WEIGHTS } from '../sim/petBook.js';
import { seatById } from '../sim/world.js';
import { createHuman } from '../render/human.js';
import { createPet } from '../render/pets.js';
import { createLeash } from '../render/leash.js';
import { itemFor } from '../render/props.js';
import { makeRng } from '../core/rng.js';
import { iconFor, treatIcon } from '../ui/icons.js';

const SPAWN_SEED = 20260902;

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

export function createCustomers(G, S, ctx) {
  const { area, world, scene, hud, fx, els } = ctx;
  const price = ctx.price;
  const rng = makeRng(SPAWN_SEED);
  const rec = new Map();
  let spawnT = 2, seq = 1, speciesIdx = 0;
  let cachedBuiltSize = -1, interval = 4, maxC = 6;
  const tmpProj = { sx: 0, sy: 0, visible: true };

  function spawn() {
    const species = SPECIES[speciesIdx++ % SPECIES.length];
    const petVariant = rng.pick(PET_VARIANT_WEIGHTS);
    const variant = { shirt: rng.i(0, 4), hair: rng.i(0, 3), skin: rng.i(0, 2) };
    const c = createCustomer(seq++, species, variant, area);
    c.petVariant = petVariant;
    G.customers.push(c);
    const human = createHuman(variant, 'customer'); scene.add(human.group);
    const pet = createPet(species, petVariant); scene.add(pet.group);
    const leash = createLeash(scene); leash.attach(human.hand, pet.neck);
    const bub = makeBubble(els);
    rec.set(c.id, { human, pet, leash, px: c.x, pz: c.z, eating: false, bub });
    if (ctx.discoverPet) ctx.discoverPet(species, petVariant);
  }

  function teardown() {
    for (const r of rec.values()) { scene.remove(r.human.group); scene.remove(r.pet.group); r.leash.detach(); removeBubble(r.bub); }
    rec.clear();
  }

  return {
    teardown,
    update(dt) {
      if (world.built.size !== cachedBuiltSize) { cachedBuiltSize = world.built.size; interval = spawnInterval(world.built); maxC = maxCustomers(world.built); }
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

      for (const e of world.events) {
        const r = rec.get(e.id); if (!r) continue;
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
          if (c) r.human.group.rotation.y = c.rot;
          r.human.sit(); r.human.setMood('none');
          r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden');
          r.pet.group.position.set(seat.pair.pet.x, 0, seat.pair.pet.z);
          r.pet.sit(); r.eating = true;
          fx.hearts(seat.pair.pet.x, r.pet.height + 0.3, seat.pair.pet.z);
        }
      }

      for (let i = G.customers.length - 1; i >= 0; i--) {
        const c = G.customers[i]; const r = rec.get(c.id);
        if (c.done) { scene.remove(r.human.group); scene.remove(r.pet.group); r.leash.detach(); removeBubble(r.bub); rec.delete(c.id); G.customers.splice(i, 1); continue; }
        if (r.eating && c.state !== 'eating') { r.pet.stand(); r.human.stand(); r.eating = false; }
        if (r.eating) { r.pet.update(dt, false, 0); }
        else {
          const vx = (c.x - r.px) / dt, vz = (c.z - r.pz) / dt;
          r.human.group.position.set(c.x, 0, c.z); r.human.update(dt, vx, vz);
          r.pet.followTarget(c.x, c.z, c.rot, dt);
          r.px = c.x; r.pz = c.z;
          if (c.state === 'queue' || c.state === 'atBowl' || c.state === 'atRegister') r.human.setMood(c.mood === 'wait' ? 'wait' : 'none');
        }
        r.leash.update();
        if (c.state === 'leave' || c.done) { r.bub.wrap.classList.add('hidden'); r.bub.bar.classList.add('hidden'); }
        else if (!r.eating) {
          fx.project(c.x, r.human.height + 0.55, c.z, tmpProj);
          r.bub.wrap.style.left = tmpProj.sx + 'px'; r.bub.wrap.style.top = tmpProj.sy + 'px';
          r.bub.bar.style.left = tmpProj.sx + 'px'; r.bub.bar.style.top = (tmpProj.sy + 6) + 'px';
        }
      }
      let urgent = false;
      for (const c of G.customers) if (!c.done && c.patience < 4) { urgent = true; break; }
      hud.setCrowd(G.customers.length, effMaxC, urgent);
    },
  };
}
