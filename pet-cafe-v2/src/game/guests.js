// src/game/guests.js — guests and their pets.
// enter → pick a product → wait at its counter → take it → queue at the till → pay →
// sit at a free clean table (their pet takes the other chair) → leave the table dirty with a tip.
// No table free? They take it away. A guest who waits a long time simply leaves; nothing is lost.
import * as THREE from 'three';
import { createHuman, SHIRTS } from '../render/human.js';
import { createPet } from '../render/pets.js';
import { part, merge } from '../render/geo.js';
import { toonMaterial } from '../render/palette.js';
import { STREET, PRODUCTS } from './layout.js';
import * as L from './layout.js';
import { makeWalker, syncHuman, drawStack, faceTo } from './actors.js';

const PATIENCE = 50, EAT = [6, 9], SPEED = 1.9;

// Sunglasses sized to each species' face (the eyes sit at x ±w/4, z 0.47w on the head).
const HEAD_W = { cat: 0.5, dog: 0.56, bunny: 0.46, hamster: 0.3 };
const shadesCache = {};
function sunglasses(species) {
  if (!shadesCache[species]) {
    const w = HEAD_W[species] || 0.5, r = Math.max(0.05, Math.min(0.075, w * 0.14)), z = w * 0.47 + 0.03;
    shadesCache[species] = merge([
      part('cyl', [r, r, 0.02, 12], '#23262B', { x: -w * 0.25, y: 0.07, z, rx: Math.PI / 2 }),
      part('cyl', [r, r, 0.02, 12], '#23262B', { x: w * 0.25, y: 0.07, z, rx: Math.PI / 2 }),
      part('box', [w * 0.2, 0.02, 0.02], '#FF6F91', { y: 0.08, z }),
      part('box', [0.02, 0.02, w * 0.4], '#FF6F91', { x: -w * 0.25 - r, y: 0.08, z: z - w * 0.2 }),
      part('box', [0.02, 0.02, w * 0.4], '#FF6F91', { x: w * 0.25 + r, y: 0.08, z: z - w * 0.2 }),
    ]);
  }
  return new THREE.Mesh(shadesCache[species], toonMaterial());
}

let crownGeo = null;
function crown() {
  if (!crownGeo) {
    const P = [part('cyl', [0.17, 0.19, 0.12, 12], '#FFC940', { y: 0 })];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push(part('cone', [0.05, 0.12, 4], '#FFC940', { x: Math.cos(a) * 0.16, y: 0.11, z: Math.sin(a) * 0.16 })); P.push(part('sph', [0.03, 6], k % 2 ? '#E8546B' : '#6FB7FF', { x: Math.cos(a) * 0.185, y: 0.0, z: Math.sin(a) * 0.185 })); }
    crownGeo = merge(P);
  }
  const m = new THREE.Mesh(crownGeo, toonMaterial()); m.position.y = 2.12; return m;
}

export function createGuests(ctx) {
  const { W, nav, scene, items, bubbles, audio, hotspots } = ctx;
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
    if (variant >= 5) pet.attach('head', sunglasses(species));     // the Beach Shack's regulars wear shades
    scene.add(pet.group);
    const w = makeWalker(nav, STREET.spawn.x, STREET.spawn.z, SPEED, 'guest');
    pet.group.position.set(w.x + 0.6, 0, w.z);
    // a VIP now and then (once the café has a few tables): a golden crown, and they pay three times over
    const vip = W.built('table').length >= 4 && Math.random() < 0.08;
    if (vip) { H.group.add(crown()); H.setBaseScale(1.05); }
    const g = { id: nextId++, H, pet, species, variant, w, product, vip, want: 1 + (Math.random() < 0.4 ? 1 : 0), carry: { kind: null, n: 0 },
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

  function update(dt, serverAtTill, rush = false, owner = null) {
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
            const amount = W.price(g.product) * g.carry.n * (g.vip ? 3 : 1);
            if (g.vip) W.events.push({ type: 'vip', x: till.x, z: till.z });
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
            // on the front of the seat, toward the table, so the pet is clear of the chair's backrest
            g.pet.group.position.set(other.x + Math.sin(other.face) * 0.2, 0.49, other.z); g.pet.group.rotation.y = other.face; g.pet.sit();
          }
          break;
        case 'eating':
          if (g.t > g.eat * 0.5 && g.carry.n > 1) g.carry.n = 1;
          // TABLE REQUESTS: once the café has a Runner, a seated guest may ask for one extra thing —
          // a treat for the pet, a coffee… Only the owner brings it (from the machine, by hand).
          if (g.request === undefined) {
            const menu = W.built('machine').map(m => m.product).filter(p => W.counterFor(p)?.built);
            g.request = (W.isBuilt('staff:runner') && menu.length && Math.random() < 0.35) ? menu[(Math.random() * menu.length) | 0] : null;
            if (g.request) { W.requests[g.request] = (W.requests[g.request] || 0) + 1; g.eat += 14; }
          }
          if (g.request && owner) {
            const d = Math.hypot(g.table.x - owner.x, g.table.z - owner.z);
            if (d < 1.35 && owner.carry && owner.carry.kind === g.request && owner.carry.n > 0) {
              owner.give(g.request);
              W.requests[g.request]--; const p = g.request; g.request = null; g.served2 = true; g.eat = Math.max(g.t + 3, g.eat - 10);
              const tip = W.price(p) * 3 * (g.vip ? 3 : 1);
              W.earn(tip, g.table.x, g.table.z); W.events.push({ type: 'request', x: g.table.x, z: g.table.z }); g.pet.joy(0.8);
            } else {
              // a gold ring round the table and a big bouncing picture of what they want
              hotspots?.show(g.table.x, g.table.z, '#FFC23D', 1.3, g.id);
              bubbles.show('rq' + g.id, g.table.x, 2.05, g.table.z, `${PRODUCTS[g.request].emoji}`, 'ask');
            }
          }
          // PETTING: the owner stands beside the seated pet for a moment — hearts, a happy wriggle,
          // a little tip, and the friendship in the Pet Book grows. Once per visit.
          if (owner && !g.petted) {
            const pp = g.pet.group.position, d = Math.hypot(pp.x - owner.x, pp.z - owner.z);
            if (d < 1.05 && owner.idle > 0.15) {
              g.petT = (g.petT || 0) + dt;
              bubbles.show('pp' + g.id, pp.x, 1.45, pp.z, `<i class="ring pink" style="--p:${Math.min(1, g.petT / 0.7)}"></i>`, 'prog');
              if (g.petT >= 0.7) {
                g.petted = true; g.pet.joy(0.8); g.eat += 1.5; W.petCount = (W.petCount | 0) + 1;
                const k = g.species + ':' + g.variant, f = (W.friends[k] = (W.friends[k] | 0) + 1);
                const tip = 2 + (f >= 10 ? 6 : f >= 4 ? 3 : 1);
                W.earn(tip, pp.x, pp.z); W.events.push({ type: 'petted', x: pp.x, z: pp.z, f });
              }
            } else {
              g.petT = 0;
              // a pet waiting for a stroke: a soft pink ring under it when you are near, a floating heart,
              // and — the first few times — a ghost hand showing the stroke
              if (d < 4.5) {
                hotspots?.show(pp.x, pp.z, '#FF8FB1', 0.62, g.id * 1.7, 0.52);
                bubbles.show('pp' + g.id, pp.x, 1.45, pp.z, (W.petCount | 0) < 3 ? '<span class="ghosthand">✋</span>' : '💗', 'mood');
              }
            }
          }
          if (g.t > g.eat) {
            if (g.request) { W.requests[g.request]--; g.request = null; }      // they simply go without; nothing lost
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
        const side = g.product === 'treat' ? 0.25 : -0.25, top = L.LOC.theme === 'town' ? 0.74 : 0.8;
        if (g.carry.n) items.add(g.product, g.table.x + side, top + 0.02, g.table.z, 0);
        items.add('plate', g.table.x + side, top, g.table.z);
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

  function teardown() { for (let i = list.length - 1; i >= 0; i--) remove(list[i], i); queue.length = 0; scene.remove(leashes); }
  return { update, list, queue, teardown };
}
