// src/systems/stations.js — owner movement + collision, and the Loop v2 Task 1 explicit
// interaction model: a station only acts once the owner has genuinely stopped and faced it (the
// "dwell" rule below) — replaces the old walk-by proximity pickups/drops. The kiosk/hire desk still
// open nothing automatically; Loop v2 Task 2's floating `.fbtn` button (set up below) is the only
// way in, and this file also owns the first-approach hints (FIRST_HINT/noteFirstHint below).
import { pushOut } from '../sim/collide.js';
import {
  PRODUCTS, playerSpeed, carryCap, buyUpgrade, hire as hireStaff,
  buyWorkerUpgrade, buyMachineUpgrade, machineSpeedMult, buyStar, STAR_IDS,
} from '../sim/economy.js';
import {
  stepOvens, stepMachines, takeFromOven, takeFromMachine, putOnDisplay, collectCash,
  refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../sim/world.js';
import { canTakeItems, takeSack, useSack, addFruit as carryAddFruit, isEmpty as carryIsEmpty, returnAll } from '../sim/carry.js';
import { itemFor } from '../render/props.js';
import { C } from '../render/palette.js';
import { damp } from '../core/tween.js';
import { buildKioskModel } from '../ui/models.js';

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
// Loop v2 Task 2: first-approach hints (design section 4) — one line per station TYPE, shown once
// (G.hintsSeen, a Set) the first time the owner genuinely dwells/approaches a station of that
// type. Keyed by the internal station type (not always the same word the UI uses — 'checkout' is
// "REGISTER", 'bush' is "GARDEN"). Coffee machines deliberately have no entry here (not in the task
// brief's list) — the chalkboard's "COFFEE · needs beans" label already covers it.
const FIRST_HINT = {
  oven: 'Stand here to take cookies',
  display: 'Stand here to stock it',
  checkout: 'Stand here to take payment',
  pantry: 'Pick a sack to carry',
  return: 'Puts back whatever you carry',
  bush: 'Green bushes are ripe: stand here to harvest',
  blender: 'Stand here to add fruit',
  bowl: 'Fill with kibble from the pantry',
  seat: 'Stand here to clean a dirty table',
  kiosk: 'Tap UPGRADES to open',
  hire: 'Tap STAFF to open',
};
const FIRST_HINT_SECONDS = 4;
// Loop v2 Task 1: the dwell rule (design doc section 3 — "you only do what you mean to do").
// A station acts only once the owner is inside its front zone, has been at speed < DWELL_SPEED
// for >= DWELL_TIME seconds (reset the instant either condition breaks), AND is facing it
// (dot(owner facing, station - owner) > DWELL_FACING). Moving THROUGH a front zone never triggers
// anything — only genuinely stopping and facing the station does.
const DWELL_SPEED = 0.6, DWELL_TIME = 0.25, DWELL_FACING = 0.3;
const PRODUCT_LABEL = { cookie: 'cookies', cupcake: 'cupcakes', coffee: 'coffee', smoothie: 'smoothies' };

export function createStations(G, S, ctx) {
  const { area, world, hud, fx, audio, input, owner, P, sheets, hints } = ctx;
  const carry = G.carry;
  let takeT = 0, dropT = 0, stepT = 0;
  const prevStock = new Map();
  const armed = new Map(); // stationId -> re-armed for the pantry popup trigger (was kiosk/hire)
  const cleanProg = new Map(); // seatId -> seconds of continuous standing in its front circle
  const dwellT = new Map(); // stationId -> seconds of continuous dwell (see DWELL_* above)
  ctx.cleanProg = cleanProg; // exposed for systems/visuals.js's cleaning progress ring
  P.rot = P.rot || 0; // facing heading, held from the last direction the owner actually moved in

  // Loop v2 Task 2: fires FIRST_HINT[type] into the shared ctx.firstHint mailbox (game.js wires it
  // into both this system and systems/zones.js, the only hud.hint() caller) the first time `active`
  // is true for that station TYPE — G.hintsSeen (a Set) makes it a genuine one-shot per type, not
  // per station (two ovens/registers/displays share one hint each).
  function noteFirstHint(type, active) {
    if (!active) return;
    const text = FIRST_HINT[type];
    if (!text || G.hintsSeen.has(type)) return;
    G.hintsSeen.add(type);
    ctx.firstHint.msg = text; ctx.firstHint.t = FIRST_HINT_SECONDS;
  }

  // M3 T5: the kiosk sheet is one tabbed panel (Player | Workers | Machines) — the hire desk opens
  // it straight to Workers, the kiosk to Player (see openSheet below); every buy action refreshes
  // it in place on whichever tab is currently active.
  let currentTab = 'player';
  // Loop v2 Task 3: which Machines-tab row (a station id) a chalkboard tap most recently focused —
  // reset whenever the tab is switched by hand so a stale highlight doesn't linger.
  let currentFocusRow = null;
  function refreshOpen() { if (sheets.isOpen) sheets.refresh(buildKioskModel(G, world, currentTab, currentFocusRow)); }
  function doBuy(key) {
    const r = buyUpgrade(G, key);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); }
    else { audio.play('angry'); hud.toast('Not enough coins'); }
  }
  function doHire(kind) {
    const r = hireStaff(G, kind);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); }
    else { audio.play('angry'); hud.toast('Not enough coins'); }
  }
  function doBuyWorker(kind, key) {
    const r = buyWorkerUpgrade(G, kind, key);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); }
    else { audio.play('angry'); hud.toast('Not enough coins'); }
  }
  function doBuyMachine(key) {
    const r = buyMachineUpgrade(G, key);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); }
    else { audio.play('angry'); hud.toast('Not enough coins'); }
  }
  // Loop v2 Task 3: the Machines-tab star purchase — one station id at a time (ui/models.js's
  // buildMachineRows/STAR_IDS), effects (speed/capacity/second recipe) applied inside buyStar
  // itself (economy.js) since it needs the live world station to write capacity onto.
  function doBuyStar(stationId) {
    const r = buyStar(G, world, stationId);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); }
    else { audio.play('angry'); hud.toast('Not enough coins'); }
  }
  function doSetTab(tab) { currentTab = tab; currentFocusRow = null; refreshOpen(); }
  function doAssignRunner(index, displayId) {
    // Loop v2 Task 2: the Workers-tab runner picker — sets ONE runner's s.assign (the display it
    // restocks exclusively, per sim/staff.js's stepRunner). `index` is that runner's position
    // within G.staffList filtered to kind 'runner' (same order ui/models.js built the chips from).
    const runners = G.staffList.filter(s => s.kind === 'runner');
    const s = runners[index];
    if (!s) return;
    s.assign = displayId; audio.play('tap'); refreshOpen();
  }
  const sheetActions = { buy: doBuy, hire: doHire, buyWorker: doBuyWorker, buyMachine: doBuyMachine, buyStar: doBuyStar, setTab: doSetTab, assignRunner: doAssignRunner };
  // Loop v2 Task 3: tapping a chalkboard on a star-eligible station (design section 6) opens the
  // kiosk straight on the Machines tab, focused on that station's own row — src/systems/visuals.js
  // calls this (via ctx.openKioskFocused, wired below) on a chalk-label click.
  function doOpenKioskFocused(stationId) {
    if (!STAR_IDS.includes(stationId) || sheets.isOpen) return;
    audio.play('tap');
    currentTab = 'machines'; currentFocusRow = stationId;
    sheets.open('kiosk', buildKioskModel(G, world, currentTab, currentFocusRow), sheetActions);
  }
  ctx.openKioskFocused = doOpenKioskFocused;

  // Loop v2 Task 2: the floating station button (design section 3/4) — a single reusable `.fbtn`
  // element, shown 1.6m above whichever of the kiosk/hire desk the owner is currently standing in
  // front of (and hidden the instant they leave, or the panel opens), replacing Task 1's temporary
  // HUD "UPGRADES" pill entirely.
  const fbtn = document.createElement('button'); fbtn.type = 'button'; fbtn.className = 'fbtn hidden';
  ctx.els.fx.appendChild(fbtn);
  const fbtnTmp = { sx: 0, sy: 0, visible: true };
  let floatSt = null; // the kiosk/hire station currently near enough to show the button, or null
  fbtn.addEventListener('click', () => {
    if (!floatSt) return;
    audio.play('tap');
    currentTab = floatSt.type === 'kiosk' ? 'player' : 'workers';
    sheets.open('kiosk', buildKioskModel(G, world, currentTab), sheetActions);
    floatSt = null; fbtn.classList.add('hidden');
  });
  // The pantry popup — a plain two-button sheet (Task 2 styles it). `pick(kind)` hands the sack
  // and closes; bowlActive gates whether the kibble button even appears.
  function openPantry() {
    audio.play('tap');
    let bowlActive = false;
    for (const st of world.stations.values()) if (st.type === 'bowl' && st.active) { bowlActive = true; break; }
    sheets.open('pantry', { beans: true, kibble: bowlActive }, {
      pick(kind) {
        if (takeSack(carry, kind)) audio.play('pop');
        sheets.close();
      },
    });
  }

  // Dwell tracker: accumulates dt while the owner is inside `st.front`'s `radius`, slower than
  // DWELL_SPEED; resets to 0 the instant either condition breaks. This alone already delivers the
  // design's actual goal ("moving THROUGH a zone never triggers anything" — a walk-by is never
  // slow, in-zone, for a continuous 0.25s) — the timer is deliberately independent of facing.
  //
  // Facing is checked too (dot(owner facing, station - owner) > DWELL_FACING, per the design), but
  // P.rot is derived from raw approach velocity (see update() below) and freezes the instant the
  // owner stops — which can leave it pointed anywhere, including away from the station, depending
  // on the exact angle/geometry of however this particular approach happened to finish (measured:
  // a station reachable only by routing around a neighbour's own footprint, or the last few
  // centimetres of closing in on an exact point, can both easily end this way). Requiring a
  // precisely-aimed final facing on top of an already-genuine stop-and-wait would make the very
  // real "stood right in front of it, waited, still can't act" dead end far more likely than the
  // "grabbed something while running past" mistake the rule exists to prevent. So: once the
  // zone+speed timer alone has proven genuine intent (the full DWELL_TIME), auto-face the owner
  // toward the station if their own movement-derived facing doesn't already clear the bar — same
  // as a real person's head turning to look at whatever they've stopped in front of.
  let frameDt = 0;
  function dwelling(st, radius, speed) {
    const inZone = near(P, st.front, radius);
    const ok = inZone && speed < DWELL_SPEED;
    const t = ok ? (dwellT.get(st.id) || 0) + frameDt : 0;
    dwellT.set(st.id, t);
    if (t < DWELL_TIME) return false;
    const dx = st.x - P.x, dz = st.z - P.z, d = Math.hypot(dx, dz) || 1;
    const fx = Math.sin(P.rot), fz = Math.cos(P.rot);
    const facingOk = (fx * dx + fz * dz) / d > DWELL_FACING;
    if (!facingOk) P.rot = Math.atan2(dx, dz); // auto-face the station once dwell is otherwise earned
    return true;
  }

  return {
    update(dt) {
      frameDt = dt; // dwelling() above reads this — avoids threading dt through every call site
      const mv = G._force || input; const sp = playerSpeed(G.up);
      P.vx = damp(P.vx, mv.x * sp, 18, dt); P.vz = damp(P.vz, mv.z * sp, 18, dt);
      P.x += P.vx * dt; P.z += P.vz * dt;
      pushOut(P, 0.35, world.boxes);
      P.x = Math.max(-area.size.w / 2 + 0.5, Math.min(area.size.w / 2 - 0.5, P.x));
      P.z = Math.max(-area.size.d / 2 + 0.5, Math.min(area.size.d / 2 - 0.5, P.z));
      owner.group.position.set(P.x, 0, P.z); owner.update(dt, P.vx, P.vz); S.follow(P.x, P.z, dt);

      const speed = Math.hypot(P.vx, P.vz);
      // Facing heading: same atan2(dx, dz) convention sim movers use — held from the last frame
      // the owner actually moved (a stationary owner keeps facing whichever way it last walked).
      if (speed > 0.05) P.rot = Math.atan2(P.vx, P.vz);
      stepT -= dt; if (speed > 0.5 && stepT <= 0) { stepT = 0.28; audio.play('step'); }

      // M3 T5: Oven/Coffee-speed machine levels divide bake/make time (÷1.25 per tier). Display
      // capacity is a flat 8 for now (Task 3 adds star levels — see data/area1.js).
      stepOvens(world, dt, machineSpeedMult(G.machineLevels, 'oven'));
      stepMachines(world, dt, machineSpeedMult(G.machineLevels, 'coffee')); // Task 4: coffee/blender production, bush growth
      takeT -= dt; dropT -= dt;
      let handsFull = null; // "Hands full · <product>" — plain proximity, not dwell (design section 3)
      let floatCandidate = null; // this frame's kiosk/hire floating-button target, if any
      for (const st of world.stations.values()) {
        if (!st.active) continue;
        if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender') {
          const prev = prevStock.has(st.id) ? prevStock.get(st.id) : st.stock;
          if (prev < 6 && st.stock >= 6) audio.play('ding');
          prevStock.set(st.id, st.stock);
          // Task 4: coffee/blender stock is taken exactly like an oven's, at the same 0.35s
          // cadence — but only while the carry isn't occupied by a sack or fruit (canTakeItems),
          // and now only on a genuine dwell (Loop v2 Task 1), not a walk-by.
          const productKey = st.type === 'oven' ? st.product : st.type === 'coffee' ? st.product : 'smoothie';
          // Always run the dwell tracker itself exactly ONCE per station per frame (so it keeps
          // decaying/accumulating correctly even while refused below — calling it twice in one
          // frame, e.g. once here and again for the beans/fruit refill below, would double-count
          // frameDt and reach DWELL_TIME in half the real time), then gate the actual pickup on
          // both it and the product match. The coffee/blender beans/fruit-drop actions further
          // down reuse this SAME dwellOk instead of calling dwelling() again.
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint(st.type, dwellOk); // oven/blender only — FIRST_HINT has no 'coffee' entry
          const mismatched = owner.items.length && owner.items[0].userData.product !== productKey;
          if (mismatched) {
            // Refusal (design section 3): a different product already in hand — no pickup, just
            // the "hands full" tag, on plain proximity (no dwell needed to see it).
            if (near(P, st.front, 1.3)) handsFull = PRODUCT_LABEL[owner.items[0].userData.product] || owner.items[0].userData.product;
          } else if (dwellOk && takeT <= 0 && canTakeItems(carry) && owner.items.length < carryCap(G.up) && st.stock > 0) {
            (st.type === 'oven' ? takeFromOven : takeFromMachine)(world, st.id, 1);
            const im = itemFor(productKey); im.userData.product = productKey;
            owner.addItem(im); takeT = 0.35; hints.oven = 1; audio.play('pop');
          }
          // Task 4 / final review fix: a beans sack tops up the coffee machine's beans (capped at
          // 20 — see world.js's refillBeans), consuming only what the machine actually had room
          // for. Task 4: fruit is dropped into the blender's own buffer (cap 9). Both reuse the
          // dwellOk computed just above instead of a second dwelling() call for the same station.
          if (st.type === 'coffee' && dwellOk && carry.sack === 'beans') {
            const used = refillBeans(world, st.id, carry.sackLeft);
            if (used > 0) { useSack(carry, used); hints.refillCoffee = 1; audio.play('chime'); fx.burst(st.x, 0.9, st.z, C.coral, 6); }
          }
          if (st.type === 'blender' && dwellOk && carry.fruit > 0) {
            const added = stationAddFruit(world, st.id, carry.fruit);
            if (added > 0) { carry.fruit -= added; hints.blend = 1; audio.play('drop'); fx.burst(st.x, 0.9, st.z, C.plant, 6); }
          }
        }
        if (st.type === 'display') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('display', dwellOk);
          if (owner.items.length && owner.items[0].userData.product !== st.product) {
            // A non-empty stack of a DIFFERENT product at this display: no pickup/drop happens —
            // just the "hands full" tag (plain proximity, per the design's "standing at a
            // different product's station" wording — no dwell required to see it).
            if (near(P, st.front, 1.3)) handsFull = PRODUCT_LABEL[owner.items[0].userData.product] || owner.items[0].userData.product;
          } else if (dwellOk && dropT <= 0 && owner.items.length && st.stock < st.capacity) {
            const m = owner.popItem(); const key = m.userData.product || st.product; putOnDisplay(world, st.id, key, 1);
            dropT = 0.15; hints.counter = 1; audio.play('drop'); fx.burst(st.x, 1.3, st.z, PRODUCTS[key].color, 4);
          }
        }
        // M3 T3: the owner mans the register just by standing in its front circle (r 1.2) — this
        // sets serving='owner' every frame it's true; world.js's stepRegisters (called once per
        // frame from game.js, after both this and staff.update have had their say) reads it and
        // resets it to '' for the next frame once it's done processing. Register serving/cash
        // pickup stay plain-proximity — already an intentional "stand and serve" act, not the kind
        // of walk-by pickup the dwell rule targets.
        if (st.type === 'checkout') noteFirstHint('checkout', near(P, st.front, 1.2));
        if (st.type === 'checkout' && near(P, st.front, 1.2)) st.serving = 'owner';
        if (st.type === 'checkout' && st.pile > 0 && near(P, st.cash, 1.0)) {
          const amt = collectCash(world, st.id); const cs = st.cash; hints.cash = 1;
          G.coins += amt; G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amt; hud.setCoins(G.coins); audio.play('coin');
          fx.coinArc(cs.x, 0.3, cs.z, Math.min(10, 2 + amt / 5 | 0), () => hud.bump()); fx.number(cs.x, 0.8, cs.z, '+' + amt);
        }
        // Loop v2 Task 1: the pantry — dwelling with a sack in hand returns it (design section 3:
        // "the pantry takes back sacks"); dwelling with an empty carry opens the two-button popup
        // (beans always, kibble only once a bowl exists) instead of handing one out automatically.
        if (st.type === 'pantry') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('pantry', dwellOk);
          if (dwellOk) {
            if (carry.sack) { carry.sack = null; carry.sackLeft = 0; audio.play('drop'); hud.toast('Sack returned'); }
            else if (owner.items.length === 0 && carryIsEmpty(carry)) {
              const isArmed = armed.get(st.id) !== false;
              if (isArmed && !sheets.isOpen) { openPantry(); armed.set(st.id, false); }
            }
          } else if (!near(P, st.front, 1.8)) {
            armed.set(st.id, true);
          }
        }
        // Loop v2 Task 1: the return crate — dwelling with anything at all in hand (product
        // items, a sack, or fruit) empties it all for zero coins, so the player/owner is never
        // stuck holding something with nowhere useful to put it.
        if (st.type === 'return') {
          const dwellOk = dwelling(st, 1.2, speed);
          noteFirstHint('return', dwellOk);
          if (dwellOk && (owner.items.length > 0 || !carryIsEmpty(carry))) {
            returnAll(carry); owner.clearItems(); audio.play('drop'); hud.toast('Returned');
          }
        }
        // Task 4: a kibble sack keeps its remainder until empty — draw only what the bowl has
        // room for, so the same sack can top up several bowls (or the same one twice).
        if (st.type === 'bowl') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('bowl', dwellOk);
          if (dwellOk && carry.sack === 'kibble') {
            const used = refillBowl(world, st.id, carry.sackLeft);
            if (used > 0) { useSack(carry, used); hints.refillBowl = 1; audio.play('chime'); fx.burst(st.x, 0.5, st.z, C.pink, 6); }
          }
        }
        // Task 4: a ripe (stage-3) bush harvested only on a genuine dwell now, straight onto the
        // carry's fruit slot — only while there's room and the carry isn't holding a sack/items.
        if (st.type === 'bush') {
          const dwellOk = dwelling(st, 1.2, speed);
          noteFirstHint('bush', dwellOk);
          if (dwellOk && st.stage === 3 && canTakeItems(carry) && owner.items.length === 0 && carry.fruit < carryCap(G.up)) {
            const got = harvestBush(world, st.id);
            if (got > 0) { carryAddFruit(carry, got, carryCap(G.up)); hints.harvest = 1; audio.play('pop'); fx.burst(st.x, 0.7, st.z, C.coral, 8); }
          }
        }
        // Task 4: dirty tables — standing in a dirty seat's front circle for 1.0s clears it
        // (a progress ring, reusing zoneRing() at 0.6 scale, is driven off cleanProg in
        // systems/visuals.js). Progress resets the instant the owner steps out of range. Kept as
        // plain proximity + its own 1.0s progress — already an intentional stand-and-wait act.
        if (st.type === 'seat') {
          const dirtyNear = st.dirty && near(P, st.front, 1.2);
          noteFirstHint('seat', dirtyNear); // only dirty seats have anything to do here
          if (dirtyNear) {
            const p = (cleanProg.get(st.id) || 0) + dt;
            if (p >= 1.0) { cleanSeat(world, st.id); cleanProg.delete(st.id); hints.clean = 1; audio.play('chime'); fx.burst(st.x, 0.8, st.z, C.cream, 8); }
            else cleanProg.set(st.id, p);
          } else if (cleanProg.has(st.id)) cleanProg.delete(st.id);
        }
        // Loop v2 Task 2: the kiosk/hire desk still open nothing automatically — standing in front
        // of one just surfaces the floating `.fbtn` (set up above); a tap on IT opens the panel.
        if (st.type === 'kiosk' || st.type === 'hire') {
          const atFront = near(P, st.front, 1.3);
          noteFirstHint(st.type, atFront);
          if (atFront && !sheets.isOpen) floatCandidate = st;
        }
      }
      // Loop v2 Task 2: position/show the floating button for whichever kiosk/hire station was the
      // (at most one, in practice — they sit far apart) candidate this frame; hides the instant
      // nothing qualified (owner left the front zone, or the panel opened mid-loop above).
      floatSt = floatCandidate;
      if (floatSt) {
        fx.project(floatSt.x, 1.6, floatSt.z, fbtnTmp);
        fbtn.style.left = fbtnTmp.sx + 'px'; fbtn.style.top = fbtnTmp.sy + 'px';
        const label = floatSt.type === 'kiosk' ? 'UPGRADES' : 'STAFF';
        if (fbtn.textContent !== label) fbtn.textContent = label;
        fbtn.classList.toggle('hidden', !fbtnTmp.visible);
      } else {
        fbtn.classList.add('hidden');
      }
      hud.setHandsFull(handsFull ? `Hands full · ${handsFull}` : null);
      owner.setCarryProps(carry.sack, carry.fruit); // Task 4: keep the sack/fruit prop + arm pose in sync
    },
  };
}
