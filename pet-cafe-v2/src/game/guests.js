// src/game/guests.js — guests and their pets.
// enter → pick a product → wait at its counter → take it → queue at the till → pay →
// sit at a free clean table (their pet takes the other chair) → leave the table dirty with a tip.
// No table free? They take it away. A guest who waits a long time simply leaves; nothing is lost.
import * as THREE from 'three';
import { createHuman, SHIRTS } from '../render/human.js';
import { createPet } from '../render/pets.js';
import { STREET, PRODUCTS } from './layout.js';
import { makeWalker, syncHuman, drawStack, faceTo } from './actors.js';

const PATIENCE = 50, EAT = [6, 9], SPEED = 1.9;

export function createGuests(ctx) {
  const { W, nav, scene, items, bubbles, audio } = ctx;
  const list = [];
  let spawnT = 2, nextId = 1;
  const till = W.stations.get('till1');
  // every leash in the café is one line object (two points per guest), so a full house costs one draw
  const MAXG = 16, leashPos = new Float32Array(MAXG * 6);
  const leashGeo = new THREE.BufferGeometry(); leashGeo.setAttribute('position', new THREE.BufferAttribute(leashPos, 3));
  const leashes = new THREE.LineSegments(leashGeo, new THREE.LineBasicMaterial({ color: '#6B4A33' }));
  leashes.frustumCulled = false; scene.add(leashes);

  function spawn() {
    const products = W.built('counter').map(c => c.product);
    if (!products.length) return;
    const product = products[Math.floor(Math.random() * products.length)];
    const H = createHuman({ shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0], hair: (Math.random() * 4) | 0, skin: (Math.random() * 3) | 0 }, 'customer');
    scene.add(H.group);
    const [species, variant] = W.pickPet();
    const pet = createPet(species, variant);
    scene.add(pet.group);
    const w = makeWalker(nav, STREET.spawn.x, STREET.spawn.z, SPEED, 'guest');
    pet.group.position.set(w.x + 0.6, 0, w.z);
    const g = { id: nextId++, H, pet, species, variant, w, product, want: 1 + (Math.random() < 0.4 ? 1 : 0), carry: { kind: null, n: 0 },
      state: 'enter', t: 0, wait: 0, spot: null, counter: null, table: null, sad: false };
    g.w.go(STREET.inside.x, STREET.inside.z);
    list.push(g);
  }

  function claimCounterSpot(g) {
    const c = W.counterFor(g.product);
    let i = c.guests.indexOf(null);
    if (i < 0) return false;
    c.guests[i] = g.id; g.counter = c; g.spot = i;
    const s = c.spots.guests[i]; g.w.go(s.x, s.z);
    return true;
  }
  function releaseCounterSpot(g) { if (g.counter && g.spot != null) g.counter.guests[g.spot] = null; g.spot = null; }

  const queue = [];                          // guests waiting at the till, in order
  function queueSlot(g) { return till.spots.queue[Math.min(queue.indexOf(g), till.spots.queue.length - 1)]; }

  function leave(g, sad = false) {
    releaseCounterSpot(g);
    const qi = queue.indexOf(g); if (qi >= 0) queue.splice(qi, 1);
    g.sad = sad; g.state = 'leave'; g.t = 0;
    g.w.go(STREET.door.x, STREET.door.z);
  }

  function freeTable() {
    const tables = W.built('table').filter(t => !t.dirty && !t.guest && !t.claimed);
    return tables.length ? tables[(Math.random() * tables.length) | 0] : null;
  }

  function update(dt, serverAtTill, rush = false) {
    // arrivals: more tables and more counters bring more guests
    const tables = W.built('table').length, counters = W.built('counter').length;
    const interval = Math.max(2.2, 7.5 - tables * 0.45 - (counters - 1) * 0.9) * (rush ? 0.45 : 1);
    spawnT -= dt;
    if (spawnT <= 0 && list.length < Math.min(rush ? 13 : 11, 4 + tables * 1.3 + (rush ? 2 : 0))) { spawn(); spawnT = interval * (0.7 + Math.random() * 0.6); }

    let leashN = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i]; g.t += dt;
      const arrived = g.w.step(dt);
      let face = null;
      switch (g.state) {
        case 'enter':
          if (arrived) {
            W.meet(g.species, g.variant); if (claimCounterSpot(g)) g.state = 'toCounter'; else { g.state = 'lineup'; g.w.go(g.w.x - 1.5, 1.0); } }
          break;
        case 'lineup':           // both spots at the counter are taken: wait nearby, then step up
          g.wait += dt;
          if (claimCounterSpot(g)) g.state = 'toCounter';
          else if (g.wait > PATIENCE) leave(g, true);
          break;
        case 'toCounter':
          face = 0 + Math.PI;    // face the counter (it is behind them, toward -z)
          if (arrived) { g.state = 'waitGoods'; g.t = 0; }
          break;
        case 'waitGoods': {
          face = Math.PI; g.wait += dt;
          const c = g.counter;
          if (g.t > 0.35 && c.stock > 0 && g.carry.n < g.want) {
            W.takeFromCounter(c); g.carry.kind = g.product; g.carry.n++; g.t = 0; audio.play('pop');
          }
          if (g.carry.n >= g.want) { releaseCounterSpot(g); queue.push(g); g.state = 'toTill'; }
          else if (g.wait > PATIENCE) leave(g, true);
          break;
        }
        case 'toTill': {
          const s = queueSlot(g); g.w.go(s.x, s.z); face = Math.PI;
          if (queue[0] === g && g.w.at(till.spots.queue[0].x, till.spots.queue[0].z, 0.15)) { g.state = 'paying'; g.t = 0; }
          break;
        }
        case 'paying':
          face = Math.PI;
          if (!serverAtTill) { g.t = 0; break; }
          if (g.t > 0.55) {
            const amount = PRODUCTS[g.product].price * g.carry.n * (W.priceMult || 1);
            W.earn(amount, till.x, till.z); W.served++;
            queue.shift();
            const t = freeTable();
            if (t) { t.guest = g.id; g.table = t; g.state = 'toTable'; const ch = t.spots.chairs[0]; g.w.go(ch.x, ch.z); }
            else { leave(g); g.happy = true; }          // no table free: they take it away
          }
          break;
        case 'toTable':
          if (arrived) {
            g.state = 'eating'; g.t = 0; g.eat = EAT[0] + Math.random() * (EAT[1] - EAT[0]);
            g.H.sit(); g.H.group.rotation.y = g.table.spots.chairs[0].face; g.H._face = g.H.group.rotation.y;
            const other = g.table.spots.chairs[1];
            g.pet.group.position.set(other.x, 0.5, other.z); g.pet.group.rotation.y = other.face; g.pet.sit();
          }
          break;
        case 'eating':
          if (g.t > g.eat * 0.5 && g.carry.n > 1) g.carry.n = 1;
          if (g.t > g.eat) {
            g.carry.n = 0; g.H.stand(); g.pet.stand(); g.pet.group.position.y = 0;
            W.dirtyTable(g.table); g.table = null; g.happy = true;
            leave(g);
          }
          break;
        case 'leave':
          if (arrived) {
            // out of the door, then along the pavement (a point on the walk grid), then straight off
            // the edge of the world — never around the back of the building
            if (g.leg === undefined && g.w.gx === STREET.door.x && g.w.gz === STREET.door.z) { g.leg = 1; g.w.go(-7.5, STREET.spawn.z); }
            else if (g.leg === 1) { g.leg = 2; g.w.path = [{ x: -15, z: STREET.spawn.z }]; g.w.gx = -15; }
            else { remove(g, i); continue; }
          }
          break;
      }
      // presentation
      if (g.state !== 'eating') syncHuman(g.H, g.w, dt, face);
      else { g.H.group.position.set(g.table ? g.table.spots.chairs[0].x : g.w.x, g.H.group.position.y, g.table ? g.table.spots.chairs[0].z : g.w.z); g.H.update(dt, 0, 0); }
      g.H.setCarry(g.carry.n);
      if (g.state === 'eating') {
        g.pet.update(dt, false, 0);
        // a pet treat is for the pet: it sits on the pet's side of the table
        const side = g.product === 'treat' ? 0.25 : -0.25;
        if (g.carry.n) items.add(g.product, g.table.x + side, 0.82, g.table.z, 0);
        items.add('plate', g.table.x + side, 0.8, g.table.z);
        if (g.product === 'treat' && g.carry.n && (g.t % 3) < 1.2) bubbles.show('pet' + g.id, g.table.spots.chairs[1].x, 1.35, g.table.z, '💕', 'mood');
      } else {
        g.pet.followTarget(g.w.x, g.w.z, g.H.group.rotation.y, dt, nav.walkable);
        drawStack(items, g.H, g.carry);
      }
      // leash from hand to collar (none while seated)
      if (g.state !== 'eating' && leashN < MAXG) {
        const hp = g.H.group.position, pp = g.pet.group.position, ry = g.H.group.rotation.y, k = leashN++ * 6;
        leashPos[k] = hp.x + Math.cos(ry) * 0.42; leashPos[k + 1] = 0.75; leashPos[k + 2] = hp.z - Math.sin(ry) * 0.42;
        leashPos[k + 3] = pp.x; leashPos[k + 4] = 0.35 * g.pet.group.scale.y + 0.1; leashPos[k + 5] = pp.z;
      }
      // what they want, over their head
      const hy = g.state === 'eating' ? 1.9 : 2.45;
      if (g.state === 'waitGoods' || g.state === 'toCounter' || g.state === 'lineup') {
        const urgent = g.wait > PATIENCE * 0.6 ? ' urgent' : '';
        bubbles.show('g' + g.id, g.w.x, hy, g.w.z, `${PRODUCTS[g.product].emoji}${g.want > 1 ? '<b>×' + g.want + '</b>' : ''}`, 'want' + urgent);
      } else if (g.state === 'paying' && !serverAtTill) {
        bubbles.show('g' + g.id, g.w.x, hy, g.w.z, '💰', 'want');
      } else if (g.state === 'leave' && g.sad && g.t < 2) {
        bubbles.show('g' + g.id, g.w.x, hy, g.w.z, '😞', 'mood');
      } else if (g.state === 'leave' && g.happy && g.t < 1.6) {
        bubbles.show('g' + g.id, g.w.x, hy, g.w.z, '❤️', 'mood');
      }
    }
    leashGeo.setDrawRange(0, leashN * 2); leashGeo.attributes.position.needsUpdate = true;
  }

  function remove(g, i) {
    releaseCounterSpot(g);
    scene.remove(g.H.group, g.pet.group);
    list.splice(i, 1);
  }

  return { update, list, queue };
}
