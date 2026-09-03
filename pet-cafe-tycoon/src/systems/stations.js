// Owner movement, station interactions, carry guidance and explicit contextual actions.
import { pushOut } from '../sim/collide.js';
import {
  PRODUCTS, familyOf, playerSpeed, carryCap, buyUpgrade, hire as hireStaff,
  buyWorkerUpgrade, buyMachineUpgrade, machineSpeedMult, buyStar, STAR_IDS,
} from '../sim/economy.js';
import {
  stepOvens, stepMachines, takeFromOven, takeFromMachine, putOnDisplay, collectCash,
  refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../sim/world.js';
import { canTakeItems, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../sim/carry.js';
import { heldState, destinationFor, findReturnStation, heldLabel, destinationLabel } from '../sim/interaction.js';
import { itemFor } from '../render/props.js';
import { C } from '../render/palette.js';
import { damp } from '../core/tween.js';
import { buildKioskModel } from '../ui/models.js';

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const DWELL_SPEED = 0.6, DWELL_TIME = 0.25, DWELL_FACING = 0.3;
const SHEET_CLOSE_RADIUS = 2.45;

const FIRST_HINT = {
  oven: 'Stand here to take finished food',
  display: 'Stock only the matching shelf',
  checkout: 'Serve here · collect payment from the cash tray',
  pantry: 'Tap SUPPLIES to choose beans or kibble',
  return: 'Tap RETURN ITEMS to empty your hands',
  bush: 'Ripe garden: stand here to harvest fruit',
  blender: 'Carry fruit here to make smoothies',
  bowl: 'Carry kibble here to refill pet treats',
  seat: 'Dirty table: tap CLEAN TABLE',
  kiosk: 'Tap UPGRADES to open',
  hire: 'Tap STAFF to open',
};
const FIRST_HINT_SECONDS = 4;

export function createStations(G, S, ctx) {
  const { area, world, hud, fx, audio, input, owner, P, sheets, hints, els } = ctx;
  const carry = G.carry;
  let takeT = 0, dropT = 0, stepT = 0, frameDt = 0;
  const prevStock = new Map();
  const cleanProg = new Map();
  const dwellT = new Map();
  ctx.cleanProg = cleanProg;
  P.rot = P.rot || 0;

  let guideT = 0, guideText = null;
  function clearGuide() {
    guideT = 0; guideText = null; G.contextGuide = null; hud.setHandsFull(null);
  }
  function guideCarry(text = null, seconds = 4, forceReturn = false) {
    const held = heldState(owner.items, carry);
    if (!held) { clearGuide(); return null; }
    const target = forceReturn ? findReturnStation(world, P) : destinationFor(world, held, P);
    if (!target) return null;
    const label = destinationLabel(target);
    G.contextGuide = { x: target.front.x, z: target.front.z, kind: target.type === 'return' ? 'return' : 'deliver', caption: label };
    guideT = seconds;
    guideText = text || `${heldLabel(held)} → ${label}`;
    hud.setHandsFull(guideText);
    return target;
  }
  function maybeGuideLeftovers(st, message) {
    const held = heldState(owner.items, carry);
    if (!held) { clearGuide(); return; }
    let full = false;
    if (st.type === 'display') full = st.stock >= st.capacity;
    else if (st.type === 'coffee') full = st.beans >= 20;
    else if (st.type === 'bowl') full = st.stock >= st.capacity;
    else if (st.type === 'blender') full = st.fruit >= 9;
    if (full) guideCarry(message || `${destinationLabel(st)} full · take leftovers to RETURN`, 5, true);
  }

  function noteFirstHint(type, active) {
    if (!active) return;
    const text = FIRST_HINT[type];
    if (!text || G.hintsSeen.has(type)) return;
    G.hintsSeen.add(type);
    ctx.firstHint.msg = text; ctx.firstHint.t = FIRST_HINT_SECONDS;
  }

  let currentTab = 'player';
  let currentFocusRow = null;
  let sheetAnchorId = null;
  sheets.onClose(() => { sheetAnchorId = null; });

  function anchorSheet(st) { sheetAnchorId = st ? st.id : null; }
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
  function doBuyStar(stationId) {
    const r = buyStar(G, world, stationId);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); }
    else { audio.play('angry'); hud.toast('Not enough coins'); }
  }
  function doSetTab(tab) { currentTab = tab; currentFocusRow = null; refreshOpen(); }
  function doAssignRunner(index, displayId) {
    const runners = G.staffList.filter(s => s.kind === 'runner');
    const s = runners[index];
    if (!s) return;
    s.assign = displayId; audio.play('tap'); refreshOpen();
  }
  const sheetActions = {
    buy: doBuy, hire: doHire, buyWorker: doBuyWorker, buyMachine: doBuyMachine,
    buyStar: doBuyStar, setTab: doSetTab, assignRunner: doAssignRunner,
  };

  function doOpenKioskFocused(stationId) {
    if (!STAR_IDS.includes(stationId) || sheets.isOpen) return;
    const st = world.stations.get(stationId);
    audio.play('tap'); currentTab = 'machines'; currentFocusRow = stationId;
    anchorSheet(st);
    sheets.open('kiosk', buildKioskModel(G, world, currentTab, currentFocusRow), sheetActions);
  }
  ctx.openKioskFocused = doOpenKioskFocused;

  function openKiosk(st, tab) {
    audio.play('tap'); currentTab = tab; currentFocusRow = null; anchorSheet(st);
    sheets.open('kiosk', buildKioskModel(G, world, currentTab), sheetActions);
  }

  function openPantry(st) {
    const held = heldState(owner.items, carry);
    if (held) {
      const dest = destinationFor(world, held, P);
      const target = guideCarry(`Hands busy · ${heldLabel(held)}${dest ? ` → ${destinationLabel(dest)}` : ''}`, 5);
      audio.play('angry'); hud.toast(target ? 'Finish what you are carrying first' : 'Empty your hands first');
      return;
    }
    audio.play('tap');
    let bowlActive = false;
    for (const s of world.stations.values()) if (s.type === 'bowl' && s.active) { bowlActive = true; break; }
    anchorSheet(st);
    sheets.open('pantry', { beans: true, kibble: bowlActive }, {
      pick(kind) {
        if (takeSack(carry, kind)) {
          audio.play('pop');
          const heldNow = heldState(owner.items, carry);
          const target = destinationFor(world, heldNow, P);
          hud.toast(kind === 'beans' ? 'Beans picked up' : 'Kibble picked up');
          guideCarry(target ? `${heldLabel(heldNow)} → ${destinationLabel(target)}` : null, 5);
        }
        sheets.close();
      },
    });
  }

  function dwelling(st, radius, speed) {
    const inZone = near(P, st.front, radius);
    const ok = inZone && speed < DWELL_SPEED;
    const t = ok ? (dwellT.get(st.id) || 0) + frameDt : 0;
    dwellT.set(st.id, t);
    if (t < DWELL_TIME) return false;
    const dx = st.x - P.x, dz = st.z - P.z, d = Math.hypot(dx, dz) || 1;
    const fx2 = Math.sin(P.rot), fz = Math.cos(P.rot);
    if ((fx2 * dx + fz * dz) / d <= DWELL_FACING) P.rot = Math.atan2(dx, dz);
    return true;
  }

  // A register now has a physically separate payment tray. The existing 3D cash pile already
  // lives at st.cash; this projected badge makes that spot readable on tiny screens too.
  const cashPads = new Map();
  for (const st of world.stations.values()) {
    if (st.type !== 'checkout') continue;
    const el = document.createElement('div');
    el.className = 'cash-tray-badge hidden';
    el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);min-height:32px;padding:5px 9px;box-sizing:border-box;border:2px solid #E0A800;border-radius:10px;background:#FFF6B0E8;color:#5B4314;font:900 11px/1 system-ui,sans-serif;box-shadow:0 3px 9px #0002;white-space:nowrap;pointer-events:none';
    els.fx.appendChild(el);
    cashPads.set(st.id, { el, tmp: { sx: 0, sy: 0, visible: true }, last: -1 });
  }

  const fbtn = document.createElement('button');
  fbtn.type = 'button'; fbtn.className = 'fbtn hidden'; ctx.els.fx.appendChild(fbtn);
  const fbtnTmp = { sx: 0, sy: 0, visible: true };
  let floatAction = null;
  function offerAction(best, st, kind, label, priority = 0, point = null) {
    const p = point || st.front;
    const d = dist2(P, p);
    if (!best || priority > best.priority || (priority === best.priority && d < best.d)) return { st, kind, label, priority, d, point: p };
    return best;
  }

  function collectRegisterCash(st) {
    if (!st || st.pile <= 0) return;
    const amt = collectCash(world, st.id); if (amt <= 0) return;
    const cs = st.cash; hints.cash = 1;
    G.coins += amt; G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amt;
    hud.setCoins(G.coins); audio.play('coin');
    fx.coinArc(cs.x, 0.3, cs.z, Math.min(10, 2 + (amt / 5 | 0)), () => hud.bump());
    fx.number(cs.x, 0.8, cs.z, '+' + amt);
  }

  function triggerFloatAction() {
    const a = floatAction;
    if (!a) return;
    const st = a.st;
    if (a.kind === 'kiosk') openKiosk(st, 'player');
    else if (a.kind === 'hire') openKiosk(st, 'workers');
    else if (a.kind === 'pantry') openPantry(st);
    else if (a.kind === 'collect') collectRegisterCash(st);
    else if (a.kind === 'return') {
      const held = heldState(owner.items, carry);
      if (!held) return;
      returnAll(carry); owner.clearItems(); audio.play('drop');
      hud.toast(`Returned ${heldLabel(held)}`); clearGuide();
    } else if (a.kind === 'clean') {
      if (!st.dirty) return;
      cleanSeat(world, st.id); hints.clean = 1; audio.play('clean');
      fx.burst(st.x, 0.8, st.z, C.cream, 8); hud.toast('Table sparkling');
    }
    floatAction = null; fbtn.classList.add('hidden');
  }
  fbtn.addEventListener('click', triggerFloatAction);
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyE' && floatAction && !sheets.isOpen) { e.preventDefault(); triggerFloatAction(); }
  });

  return {
    update(dt) {
      frameDt = dt;
      guideT = Math.max(0, guideT - dt);
      if (!heldState(owner.items, carry)) clearGuide();
      else if (guideT <= 0 && G.contextGuide) { G.contextGuide = null; guideText = null; hud.setHandsFull(null); }

      const mv = G._force || input; const sp = playerSpeed(G.up);
      P.vx = damp(P.vx, mv.x * sp, 18, dt); P.vz = damp(P.vz, mv.z * sp, 18, dt);
      P.x += P.vx * dt; P.z += P.vz * dt;
      pushOut(P, 0.35, world.boxes);
      P.x = Math.max(-area.size.w / 2 + 0.5, Math.min(area.size.w / 2 - 0.5, P.x));
      P.z = Math.max(-area.size.d / 2 + 0.5, Math.min(area.size.d / 2 - 0.5, P.z));
      owner.group.position.set(P.x, 0, P.z); owner.update(dt, P.vx, P.vz); S.follow(P.x, P.z, dt);

      if (sheetAnchorId && sheets.isOpen) {
        const anchor = world.stations.get(sheetAnchorId);
        if (!anchor || !near(P, anchor.front, SHEET_CLOSE_RADIUS)) sheets.close();
      }

      const speed = Math.hypot(P.vx, P.vz);
      if (speed > 0.05) P.rot = Math.atan2(P.vx, P.vz);
      stepT -= dt; if (speed > 0.5 && stepT <= 0) { stepT = 0.28; audio.play('step'); }

      stepOvens(world, dt, machineSpeedMult(G.machineLevels, 'oven'));
      stepMachines(world, dt, machineSpeedMult(G.machineLevels, 'coffee'));
      takeT -= dt; dropT -= dt;
      let actionCandidate = null;

      for (const st of world.stations.values()) {
        if (!st.active) continue;

        if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender') {
          const prev = prevStock.has(st.id) ? prevStock.get(st.id) : st.stock;
          if (prev < 6 && st.stock >= 6) audio.play('ding');
          prevStock.set(st.id, st.stock);
          const productKey = st.type === 'oven' ? st.product : st.type === 'coffee' ? st.product : 'smoothie';
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint(st.type, dwellOk);

          const held = heldState(owner.items, carry);
          const productMismatch = owner.items.length && familyOf(owner.items[0].userData.product) !== familyOf(productKey);
          const blockedBySupply = !canTakeItems(carry);
          const atFront = near(P, st.front, 1.3);
          if (atFront && (productMismatch || blockedBySupply || owner.items.length >= carryCap(G.up))) {
            const current = held || heldState(owner.items, carry);
            if (current) {
              const target = destinationFor(world, current, P);
              guideCarry(`${heldLabel(current)}${target ? ` → ${destinationLabel(target)}` : ''}`, 5);
            }
          } else if (dwellOk && takeT <= 0 && canTakeItems(carry) && owner.items.length < carryCap(G.up) && st.stock > 0) {
            const first = owner.items.length === 0;
            (st.type === 'oven' ? takeFromOven : takeFromMachine)(world, st.id, 1);
            const im = itemFor(productKey); im.userData.product = productKey; owner.addItem(im);
            takeT = 0.35; hints.oven = 1; audio.play('pop');
            if (first) guideCarry(null, 3);
          }

          if (st.type === 'coffee' && dwellOk && carry.sack === 'beans') {
            const used = refillBeans(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillCoffee = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.coral, 6);
              maybeGuideLeftovers(st, 'Coffee stocked · return leftover beans');
            }
          }
          if (st.type === 'blender' && dwellOk && carry.fruit > 0) {
            const added = stationAddFruit(world, st.id, carry.fruit);
            if (added > 0) {
              carry.fruit -= added; hints.blend = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.plant, 6);
              maybeGuideLeftovers(st, 'Blender full · keep or return leftover fruit');
            }
          }
        }

        if (st.type === 'display') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('display', dwellOk);
          const atFront = near(P, st.front, 1.3);
          const held = heldState(owner.items, carry);
          if (owner.items.length && familyOf(owner.items[0].userData.product) !== familyOf(st.product)) {
            if (atFront && held) {
              const target = destinationFor(world, held, P);
              guideCarry(`Wrong shelf · ${heldLabel(held)}${target ? ` → ${destinationLabel(target)}` : ''}`, 5);
            }
          } else if (owner.items.length && st.stock >= st.capacity) {
            if (atFront) guideCarry(`${destinationLabel(st)} full · take leftovers to RETURN`, 5, true);
          } else if (dwellOk && dropT <= 0 && owner.items.length && st.stock < st.capacity) {
            const m = owner.popItem(); const key = m.userData.product || st.product;
            putOnDisplay(world, st.id, key, 1); dropT = 0.15; hints.counter = 1; audio.play('drop');
            fx.burst(st.x, 1.3, st.z, PRODUCTS[key].color, 4);
            maybeGuideLeftovers(st);
          }
        }

        if (st.type === 'checkout') {
          const atFront = near(P, st.front, 1.2);
          noteFirstHint('checkout', atFront);
          if (atFront) st.serving = 'owner';

          const pad = cashPads.get(st.id);
          if (pad) {
            fx.project(st.cash.x, 0.18, st.cash.z, pad.tmp);
            if (st.pile !== pad.last) { pad.last = st.pile; pad.el.textContent = `CASH TRAY · ${Math.round(st.pile)}`; }
            pad.el.style.left = pad.tmp.sx + 'px'; pad.el.style.top = pad.tmp.sy + 'px';
            pad.el.classList.toggle('hidden', !(st.pile > 0 && pad.tmp.visible));
          }
          if (st.pile > 0 && near(P, st.cash, 1.05) && !sheets.isOpen) {
            actionCandidate = offerAction(actionCandidate, st, 'collect', `COLLECT ${Math.round(st.pile)}`, 8, st.cash);
          }
        }

        if (st.type === 'pantry') {
          const atFront = near(P, st.front, 1.35);
          noteFirstHint('pantry', atFront);
          if (atFront && !sheets.isOpen) actionCandidate = offerAction(actionCandidate, st, 'pantry', 'SUPPLIES', 3);
        }

        if (st.type === 'return') {
          const atFront = near(P, st.front, 1.05);
          noteFirstHint('return', atFront);
          if (atFront && heldState(owner.items, carry) && !sheets.isOpen) actionCandidate = offerAction(actionCandidate, st, 'return', 'RETURN ITEMS', 6);
        }

        if (st.type === 'bowl') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('bowl', dwellOk);
          if (dwellOk && carry.sack === 'kibble') {
            const used = refillBowl(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillBowl = 1; audio.play('pour'); fx.burst(st.x, 0.5, st.z, C.pink, 6);
              maybeGuideLeftovers(st, 'Treat bowl full · return leftover kibble');
            }
          }
        }

        if (st.type === 'bush') {
          const dwellOk = dwelling(st, 1.2, speed);
          noteFirstHint('bush', dwellOk);
          if (dwellOk && st.stage === 3 && canTakeItems(carry) && owner.items.length === 0 && carry.fruit < carryCap(G.up)) {
            const first = carry.fruit === 0;
            const got = harvestBush(world, st.id);
            if (got > 0) {
              carryAddFruit(carry, got, carryCap(G.up)); hints.harvest = 1; audio.play('pop'); fx.burst(st.x, 0.7, st.z, C.coral, 8);
              if (first) guideCarry('Fresh fruit → BLENDER', 5);
            }
          }
        }

        if (st.type === 'seat') {
          const dirtyNear = st.dirty && near(P, st.front, 1.35);
          noteFirstHint('seat', dirtyNear);
          if (dirtyNear && !sheets.isOpen) actionCandidate = offerAction(actionCandidate, st, 'clean', 'CLEAN TABLE', 5);
        }

        if (st.type === 'kiosk' || st.type === 'hire') {
          const atFront = near(P, st.front, 1.35);
          noteFirstHint(st.type, atFront);
          if (atFront && !sheets.isOpen) {
            actionCandidate = offerAction(actionCandidate, st, st.type, st.type === 'kiosk' ? 'UPGRADES' : 'STAFF', 2);
          }
        }
      }

      floatAction = actionCandidate;
      if (floatAction && !sheets.isOpen) {
        const p = floatAction.point || floatAction.st;
        fx.project(p.x, floatAction.kind === 'collect' ? 0.75 : 1.65, p.z, fbtnTmp);
        fbtn.style.left = fbtnTmp.sx + 'px'; fbtn.style.top = fbtnTmp.sy + 'px';
        if (fbtn.textContent !== floatAction.label) fbtn.textContent = floatAction.label;
        fbtn.classList.toggle('hidden', !fbtnTmp.visible);
      } else fbtn.classList.add('hidden');

      if (guideT > 0 && guideText) hud.setHandsFull(guideText);
      else if (!G.contextGuide) hud.setHandsFull(null);
      owner.setCarryProps(carry.sack, carry.fruit);
    },
  };
}
