// Owner movement, station interactions, carry guidance and contextual actions.
import { pushOut } from '../sim/collide.js';
import {
  PRODUCTS, familyOf, playerSpeed, carryCap, buyUpgrade, hire as hireStaff,
  buyWorkerUpgrade, buyMachineUpgrade, machineSpeedMult, buyStar, STAR_IDS,
  buyDecor, buyAccessory,
} from '../sim/economy.js';
import {
  stepOvens, stepMachines, takeFromOven, takeFromMachine, putOnDisplay, collectCash,
  refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, ownerCleanSeat,
} from '../sim/world.js';
import { canTakeItems, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../sim/carry.js';
import { clampToArea } from '../sim/ownerState.js';
import { heldState, destinationFor, findReturnStation, heldLabel, destinationLabel } from '../sim/interaction.js';
import { itemFor } from '../render/props.js';
import { C } from '../render/palette.js';
import { damp } from '../core/tween.js';
import { buildKioskModel } from '../ui/models.js';
import { cue, paintCue } from '../ui/hud.js';
import { coinIcon, crossIcon, handIcon, returnIcon, coffeeIcon, smoothieIcon, treatIcon, iconFor, sackIcon, gearIcon, personIcon, hangerIcon } from '../ui/icons.js';

// The floating action button's pictograms, by the label the action was authored with. The label
// itself survives as the cue's aria text — and, through paintCue's visually-hidden span, as the
// button's textContent, which tools/production-smoke*.js and the task25 cert read verbatim.
const ACTION_ICON = { SUPPLIES: sackIcon, RETURN: returnIcon, UPGRADES: gearIcon, STAFF: personIcon, BOUTIQUE: hangerIcon };

// One picture per carry destination, so the objective chevron over a delivery target draws the
// THING being delivered to rather than the word "COFFEE". A display case shows the pastry it is
// short of (its `product` is exactly what your hands are holding), because at a row of four cases
// the case glyph alone would not say which one.
function destinationIcon(st) {
  if (!st) return handIcon();
  if (st.type === 'return') return returnIcon();
  if (st.type === 'coffee') return coffeeIcon();
  if (st.type === 'blender') return smoothieIcon();
  if (st.type === 'bowl') return treatIcon();
  if (st.type === 'display') return iconFor(st.product);
  return handIcon();
}
// The kiosk refusal, drawn once and reused by all six buy paths: the wallet's own coin, crossed.
// The same coin the player is watching in the HUD, so "what I have is not enough" needs no verb.
const NOT_ENOUGH_COINS = () => cue([coinIcon(), crossIcon()], 'Not enough coins');

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const DWELL_SPEED = 0.6, DWELL_TIME = 0.25, DWELL_FACING = 0.3;
const SHEET_CLOSE_RADIUS = 2.45;
const AUTO_CASH_RADIUS = 1.2;
const AUTO_CLEAN_RADIUS = 1.35;

const FIRST_HINT = {
  oven: 'Take food',
  display: 'Stock shelf',
  checkout: 'Serve here',
  pantry: 'Supplies',
  return: 'Return items',
  bush: 'Pick fruit',
  blender: 'Add fruit',
  bowl: 'Add treats',
  kiosk: 'Upgrades',
  hire: 'Staff',
};
const FIRST_HINT_SECONDS = 2;

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
    // `caption` stays on the record: it is never drawn any more (systems/objective.js reads
    // captionIcon instead) but tools/production-smoke.js reads it as a diagnostic, and it is a
    // truthful description of where the guide is pointing.
    G.contextGuide = { x: target.front.x, z: target.front.z, kind: target.type === 'return' ? 'return' : 'deliver', caption: label, captionIcon: destinationIcon(target), captionLabel: `Carry to ${label.toLowerCase()}` };
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
    if (full) guideCarry(message || `${destinationLabel(st)} → RETURN`, 3, true);
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
  const markCheckpoint = reason => { if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint(reason); };
  function doBuy(key) {
    const r = buyUpgrade(G, key);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('player-upgrade'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
  }
  function doHire(kind) {
    const r = hireStaff(G, kind);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('staff-hire'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
  }
  function doBuyWorker(kind, key) {
    const r = buyWorkerUpgrade(G, kind, key);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('worker-upgrade'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
  }
  function doBuyMachine(key) {
    const r = buyMachineUpgrade(G, key);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('machine-upgrade'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
  }
  function doBuyStar(stationId) {
    const r = buyStar(G, world, stationId);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('station-star'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
  }
  function doBuyDecor(id) {
    const r = buyDecor(G, id);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('decor-buy'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
  }
  function doBuyAccessory(id) {
    const r = buyAccessory(G, id);
    if (r.ok) { audio.play('chime'); hud.setCoins(G.coins); refreshOpen(); markCheckpoint('boutique-buy'); }
    else { audio.play('angry'); hud.toast(NOT_ENOUGH_COINS()); }
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
    buyStar: doBuyStar, setTab: doSetTab, assignRunner: doAssignRunner, buyDecor: doBuyDecor, buyAccessory: doBuyAccessory,
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
      const target = guideCarry(`${heldLabel(held)}${dest ? ` → ${destinationLabel(dest)}` : ''}`, 3);
      // Both refusals are the same fact -- your hands are already full -- so both draw the same
      // mitt-and-box. When there IS somewhere to put it the arrow and that place's own glyph follow,
      // which is the part a sentence could never do as quickly.
      audio.play('angry'); hud.toast(target
        ? cue([handIcon(), '→', destinationIcon(target)], 'Finish carrying first')
        : cue([handIcon(), '!'], 'Hands full'));
      return;
    }
    audio.play('tap');
    let bowlActive = false;
    for (const s of world.stations.values()) if (s.type === 'bowl' && s.active) { bowlActive = true; break; }
    anchorSheet(st);
    // The model comes from THIS pantry's declared supplies (data/area1.js), not a fixed
    // {beans, kibble}: coldPantry1 carries cream and waterTank1 carries water, and a sheet that
    // ignored which pantry was tapped could offer neither. A pantry that declares nothing is the
    // main one and keeps its two historical buttons, so the coach's structural two-button lookup
    // (ui/interactionCoach.js) sees exactly what it always has.
    const def = area.stations.find(s => s.id === st.id);
    const supplies = def && Array.isArray(def.supplies) && def.supplies.length ? def.supplies : ['beans', 'kibble'];
    const pantryModel = {};
    for (const k of supplies) pantryModel[k] = k === 'kibble' ? bowlActive : true;
    sheets.open('pantry', pantryModel, {
      pick(kind) {
        if (takeSack(carry, kind)) {
          audio.play('pop');
          const heldNow = heldState(owner.items, carry);
          const target = destinationFor(world, heldNow, P);
          guideCarry(target ? `${destinationLabel(target)}` : null, 3);
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

  // Legacy cash labels are created for compatibility and removed by registerCash.js.
  const cashPads = new Map();
  for (const st of world.stations.values()) {
    if (st.type !== 'checkout') continue;
    const el = document.createElement('div');
    el.className = 'cash-tray-badge hidden';
    el.style.cssText = 'display:none';
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
    if (!st || st.pile <= 0) return 0;
    const amt = collectCash(world, st.id); if (amt <= 0) return 0;
    const cs = st.cash; hints.cash = 1;
    G.coins += amt; G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amt;
    hud.setCoins(G.coins); audio.play('coin');
    fx.coinArc(cs.x, 0.3, cs.z, Math.min(10, 2 + (amt / 5 | 0)), () => hud.bump());
    fx.number(cs.x, 0.8, cs.z, '+' + amt);
    markCheckpoint('cash-collection');
    return amt;
  }

  function triggerFloatAction() {
    const a = floatAction;
    if (!a) return;
    const st = a.st;
    if (a.kind === 'kiosk') openKiosk(st, 'player');
    else if (a.kind === 'hire') openKiosk(st, 'workers');
    else if (a.kind === 'boutique') openKiosk(st, 'boutique');
    else if (a.kind === 'pantry') openPantry(st);
    else if (a.kind === 'return') {
      const held = heldState(owner.items, carry);
      if (!held) return;
      returnAll(carry); owner.clearItems(); audio.play('drop');
      clearGuide();
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
      // Batch 1 — regions engine (plan 7.1): clamp to the interior UNION every built region (the
      // terrace), or the owner can never walk onto the deck they just bought.
      // The interior UNION built regions is an L once the spa exists, not a rectangle — a box
      // clamp let the owner stroll into the empty south-east corner. clampToArea also confines the
      // crossing to the gate itself; see its comment in sim/ownerState.js.
      { const p = clampToArea(area, world.built, P.x, P.z); P.x = p.x; P.z = p.z; }
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
      cleanProg.clear();

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
              guideCarry(`${heldLabel(current)}${target ? ` → ${destinationLabel(target)}` : ''}`, 3);
            }
          } else if (dwellOk && takeT <= 0 && canTakeItems(carry) && owner.items.length < carryCap(G.up) && st.stock > 0) {
            const first = owner.items.length === 0;
            (st.type === 'oven' ? takeFromOven : takeFromMachine)(world, st.id, 1);
            const im = itemFor(productKey); im.userData.product = productKey; owner.addItem(im);
            takeT = 0.35; hints.oven = 1; audio.play('pop');
            if (first) guideCarry(null, 2.5);
          }

          if (st.type === 'coffee' && dwellOk && carry.sack === 'beans') {
            const used = refillBeans(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillCoffee = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.coral, 6);
              maybeGuideLeftovers(st);
            }
          }
          if (st.type === 'blender' && dwellOk && carry.fruit > 0) {
            const added = stationAddFruit(world, st.id, carry.fruit);
            if (added > 0) {
              carry.fruit -= added; hints.blend = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.plant, 6);
              maybeGuideLeftovers(st);
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
              guideCarry(target ? `${destinationLabel(target)}` : null, 3);
            }
          } else if (owner.items.length && st.stock >= st.capacity) {
            if (atFront) guideCarry('RETURN', 3, true);
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

          // Cash is a flow chore, not a decision. Walking close to the tray collects it immediately.
          if (st.pile > 0 && near(P, st.cash, AUTO_CASH_RADIUS) && !sheets.isOpen) collectRegisterCash(st);
        }

        if (st.type === 'pantry') {
          const atFront = near(P, st.front, 1.35);
          noteFirstHint('pantry', atFront);
          if (atFront && !sheets.isOpen) actionCandidate = offerAction(actionCandidate, st, 'pantry', 'SUPPLIES', 3);
        }

        if (st.type === 'return') {
          const atFront = near(P, st.front, 1.05);
          noteFirstHint('return', atFront);
          if (atFront && heldState(owner.items, carry) && !sheets.isOpen) actionCandidate = offerAction(actionCandidate, st, 'return', 'RETURN', 6);
        }

        if (st.type === 'bowl') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('bowl', dwellOk);
          if (dwellOk && carry.sack === 'kibble') {
            const used = refillBowl(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillBowl = 1; audio.play('pour'); fx.burst(st.x, 0.5, st.z, C.pink, 6);
              maybeGuideLeftovers(st);
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
              if (first) guideCarry('BLENDER', 3);
            }
          }
        }

        if (st.type === 'seat') {
          // Dirty tables are maintenance, so proximity itself is the interaction.
          if (st.dirty && near(P, st.front, AUTO_CLEAN_RADIUS) && !sheets.isOpen) {
            // Program §6.3: one call emits 'cleaning' then 'cleaned', so the owner's wipe runs the
            // SAME ring, sparkle, table pop and crumb fade a cleaner's does. The burst and the
            // chime that used to live here moved into systems/visuals.js with the rest of that
            // presentation — a second copy here is what made one actor's wipe look like a
            // different mechanic from the other's.
            ownerCleanSeat(world, st.id); hints.clean = 1;
          }
        }

        if (st.type === 'kiosk' || st.type === 'hire' || st.type === 'boutique') {
          const atFront = near(P, st.front, 1.35);
          noteFirstHint(st.type, atFront);
          if (atFront && !sheets.isOpen) {
            const label = st.type === 'kiosk' ? 'UPGRADES' : st.type === 'hire' ? 'STAFF' : 'BOUTIQUE';
            actionCandidate = offerAction(actionCandidate, st, st.type, label, 2);
          }
        }
      }

      floatAction = actionCandidate;
      if (floatAction && !sheets.isOpen) {
        const p = floatAction.point || floatAction.st;
        fx.project(p.x, 1.65, p.z, fbtnTmp);
        fbtn.style.left = fbtnTmp.sx + 'px'; fbtn.style.top = fbtnTmp.sy + 'px';
        if (fbtn.dataset.label !== floatAction.label) {
          fbtn.dataset.label = floatAction.label;
          const icon = ACTION_ICON[floatAction.label] || handIcon;
          paintCue(fbtn, cue([icon()], floatAction.label));
        }
        fbtn.classList.toggle('hidden', !fbtnTmp.visible);
      } else fbtn.classList.add('hidden');

      if (guideT > 0 && guideText) hud.setHandsFull(guideText);
      else if (!G.contextGuide) hud.setHandsFull(null);
      owner.setCarryProps(carry.sack, carry.fruit);
    },
  };
}
