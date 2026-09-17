// Owner movement, station interactions, carry guidance and contextual actions.
import { pushOut } from '../sim/collide.js';
import {
  PRODUCTS, familyOf, playerSpeed, carryCap, buyUpgrade, hire as hireStaff,
  buyWorkerUpgrade, buyMachineUpgrade, machineSpeedMult, buyStar, STAR_IDS,
  buyDecor, buyAccessory,
} from '../sim/economy.js';
import {
  stepOvens, stepMachines, takeFromOven, takeFromMachine, putOnDisplay, collectCash,
  refillBeans, refillBowl, refillCream, refillWater, harvestBush, addFruit as stationAddFruit, ownerCleanSeat,
} from '../sim/world.js';
import { canTakeItems, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../sim/carry.js';
import { clampToArea } from '../sim/ownerState.js';
import { heldState, destinationFor, findReturnStation, heldLabel, destinationLabel } from '../sim/interaction.js';
import { itemFor } from '../render/props.js';
import { C } from '../render/palette.js';
import { damp } from '../core/tween.js';
import { buildKioskModel } from '../ui/models.js';
import { cue, paintCue } from '../ui/hud.js';
import { coinIcon, crossIcon, handIcon, returnIcon, coffeeIcon, smoothieIcon, treatIcon, iconFor, sackIcon, gearIcon, personIcon, hangerIcon, broomIcon } from '../ui/icons.js';

// The floating action button's pictograms, by the label the action was authored with. The label
// itself survives as the cue's aria text — and, through paintCue's visually-hidden span, as the
// button's textContent, which tools/production-smoke*.js and the task25 cert read verbatim.
const ACTION_ICON = { SUPPLIES: sackIcon, RETURN: returnIcon, UPGRADES: gearIcon, STAFF: personIcon, BOUTIQUE: hangerIcon };
// The owner's 2026-09-09 phone playtest: "those return, upgrade, staff labels now turned into icons
// really do not say anything". Sentences stay banned on the play field, but a single verb under the
// pictogram is not a sentence -- this is the ONE WORD painted by `.fbtnWord` below, entirely outside
// the cue helper's cells argument that the guard test (test/play-field-text.test.js) inspects, so
// the ban on worded cue cells is untouched. A label with no entry here falls back to the label
// itself, which is already upper-case and already a single word for every action this file authors.
const ACTION_WORD = { SUPPLIES: 'SUPPLIES', RETURN: 'RETURN', UPGRADES: 'UPGRADE', STAFF: 'HIRE', BOUTIQUE: 'SHOP' };
const FBTN_STYLE_ID = 'pet-cafe-fbtn-word-style';
function ensureFbtnStyle() {
  if (typeof document === 'undefined' || document.getElementById(FBTN_STYLE_ID)) return;
  const style = document.createElement('style'); style.id = FBTN_STYLE_ID;
  // .fbtn (src/style.css ~line 106) has no display:flex of its own -- it is a plain pill -- so
  // flex-direction/gap need display:flex here too, or the icon and the new word would just run
  // inline instead of stacking. min-height/min-width:48px already live on .fbtn and are untouched.
  style.textContent = `
    .fbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px 8px}
    .fbtnWord{font:900 10px/1 system-ui,sans-serif;letter-spacing:.08em}
  `;
  document.head.appendChild(style);
}

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
// Batch 7 (the owner's rule: "remove the chore, not the state") -- wiping is a walk-past, not an
// errand. Widened from 1.35m so a seat gets wiped simply by the owner passing near it on the way to
// somewhere else, the same way AUTO_CASH_RADIUS already makes collecting cash a walk-past too.
// 1.25 m — back down from the 2.2 m Batch 7 set. 2.2 m was chosen to "remove the chore, not the
// state", but it removed the ACT as well: the owner's playtest report was "without getting close to
// a table it gets cleaned before reaching it", and sweeping past a row of tables at 2.2 m wiped
// three of them in the same second. 1.25 m still means walking past a table rather than stopping at
// it, which is the generosity that mattered, but you have to actually arrive.
const AUTO_CLEAN_RADIUS = 1.25;

const FIRST_HINT = {
  oven: 'Take food',
  display: 'Stock shelf',
  checkout: 'Serve here',
  pantry: 'Supplies',
  return: 'Return items',
  bush: 'Pick fruit',
  blender: 'Add fruit',
  bowl: 'Add treats',
  icecream: 'Take ice cream',
  bath: 'Add water',
  kiosk: 'Upgrades',
  hire: 'Staff',
};
const FIRST_HINT_SECONDS = 2;

export function createStations(G, S, ctx) {
  ensureFbtnStyle();
  const { area, world, hud, fx, audio, input, owner, P, sheets, hints, els } = ctx;
  const carry = G.carry;
  let takeT = 0, dropT = 0, stepT = 0, frameDt = 0;
  const prevStock = new Map();
  const cleanProg = new Map();
  const dwellT = new Map();
  ctx.cleanProg = cleanProg;
  P.rot = P.rot || 0;
  // Batch 7: after this many hand wipes with no cleaner ever hired, point at the obvious fix once
  // per session -- a pictogram-only banner (icons plus the arrow glyph only; test/play-field-
  // text.test.js scans every call to the cue helper in this file for stray words in cells).
  let ownerWipeCount = 0, cleanerHintShown = false;

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
  // The player's body collides with what is DRAWN, not with each station's hand-written fw/fd
  // footprint. Measured 2026-09-16: the drawn oven reaches 0.60 m past its footprint and the drawn
  // counter 0.21 m, so standing on their front spots put the owner's torso inside them — the merge
  // in the playtest screenshots. Staff, guests and pathfinding keep using world.boxes, so the nav
  // grid and every sim baseline are untouched. st.body comes from src/systems/visuals.js.
  let bodyBoxes = null, bodyBoxesFor = -1;
  function playerBoxes() {
    let live = 0;
    for (const st of world.stations.values()) if (st.active) live++;
    if (bodyBoxes && bodyBoxesFor === live) return bodyBoxes;
    bodyBoxesFor = live;
    bodyBoxes = [];
    for (const st of world.stations.values()) {
      if (!st.active) continue;
      // A gate is the OPENING in a fence, not a thing: world.js leaves it out of the sim's boxes
      // for exactly that reason, and this list must too. Left in, its 4.8 m footprint was a wall
      // across the terrace's only doorway that only the player collided with — guests and staff
      // walked through while the owner was stuck on the deck (owner playtest, 2026-09-17).
      if (st.type === 'gate') continue;
      let fw = st.fw != null ? st.fw : 1, fd = st.fd != null ? st.fd : 1;
      if (Math.abs(Math.sin(st.rot)) > 0.5) { const t = fw; fw = fd; fd = t; }
      // Union, never replace: a prop drawn smaller than its footprint must not open a gap that the
      // sim's own collision still treats as solid.
      let minx = st.x - fw / 2, maxx = st.x + fw / 2, minz = st.z - fd / 2, maxz = st.z + fd / 2;
      if (st.body) {
        minx = Math.min(minx, st.body.minx); maxx = Math.max(maxx, st.body.maxx);
        minz = Math.min(minz, st.body.minz); maxz = Math.max(maxz, st.body.maxz);
      }
      bodyBoxes.push({ x: (minx + maxx) / 2, z: (minz + maxz) / 2, hw: (maxx - minx) / 2, hd: (maxz - minz) / 2 });
    }
    return bodyBoxes;
  }

  // How far into a station would a body of BODY_R standing here be? 0 when clear. Mirrors pushOut's
  // own circle-vs-box test in src/sim/collide.js, and is the player-only counterpart to it.
  const BODY_R = 0.46;
  function overlapDepth(x, z) {
    let worst = 0;
    for (const b of playerBoxes()) {
      const dx = Math.abs(x - b.x) - b.hw, dz = Math.abs(z - b.z) - b.hd;
      if (dx >= BODY_R || dz >= BODY_R) continue;
      // Distance from the circle's centre to the box: 0 inside, else the corner/face distance.
      const ox = Math.max(dx, 0), oz = Math.max(dz, 0);
      const d = Math.hypot(ox, oz);
      if (d < BODY_R && BODY_R - d > worst) worst = BODY_R - d;
    }
    return worst;
  }

  let floatAction = null;
  // The button belongs to the machine the owner is STANDING AT. Distance decides it; priority only
  // breaks a tie between two things equally at hand. (2026-09-16: priority used to dominate distance
  // outright, so standing at the oven drew the kiosk's UPGRADE button two metres away over the kiosk.)
  const NEAR_BAND = 0.5;
  function offerAction(list, st, kind, label, priority = 0, point = null) {
    const p = point || st.front;
    list.push({ st, kind, label, priority, d: Math.sqrt(dist2(P, p)), point });
    return list;
  }
  function pickAction(list, nearestFront) {
    let nearest = Infinity;
    for (const c of list) if (c.d < nearest) nearest = c.d;
    // A machine only earns the button when the owner is standing at IT. If some other station's
    // standing spot is more than NEAR_BAND nearer, the owner is at that one instead, and this
    // button would float away over a machine they are not using. Measured 2026-09-16: without
    // this, standing at the oven, at seat12, or even on the planters drew a neighbour's button.
    if (nearestFront + NEAR_BAND < nearest) return null;
    let best = null;
    for (const c of list) {
      if (c.d > nearest + NEAR_BAND) continue;
      if (!best || c.priority > best.priority || (c.priority === best.priority && c.d < best.d)) best = c;
    }
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
      const wasX = P.x, wasZ = P.z, wasDepth = overlapDepth(P.x, P.z);
      P.x += P.vx * dt; P.z += P.vz * dt;
      // 0.46, not 0.35. The player is pushed out of a station's RAW footprint, and 0.35 is narrower
      // than the body it is standing in for: the arms sit at x +/-0.44 with their own width on top
      // of that, reaching about 0.50 from centre, and a counter's wood top overhangs its footprint
      // by another 0.05. So the player could plant an arm up to 0.2 m inside a counter — which is
      // the owner's photograph of standing at a shelf with the furniture through their shoulder.
      // 0.46 clears the arm; it is deliberately not 0.50, because every interaction radius in this
      // file is measured from a station's FRONT spot (1.3 m out from centre) and the player must
      // still be able to close on that comfortably, and because the café's own corridors have to
      // stay passable for a circle of this size.
      // Three passes, not one. pushOut resolves each box independently, so the shove out of one
      // box can plant the body inside its neighbour and the frame ends with the owner half
      // inside a wall corner. Re-running settles those; anything still overlapping after three
      // passes is a gap genuinely narrower than the body, which the nav grid already forbids.
      for (let i = 0; i < 3; i++) pushOut(P, BODY_R, playerBoxes());
      // Batch 1 — regions engine (plan 7.1): clamp to the interior UNION every built region (the
      // terrace), or the owner can never walk onto the deck they just bought.
      // The interior UNION built regions is an L once the spa exists, not a rectangle — a box
      // clamp let the owner stroll into the empty south-east corner. clampToArea also confines the
      // crossing to the gate itself; see its comment in sim/ownerState.js.
      { const p = clampToArea(area, world.built, P.x, P.z); P.x = p.x; P.z = p.z; }
      // The clamp runs AFTER pushOut and wins, so a station whose box straddles the edge of the
      // walkable area — the restroom and the photo booth stand against the back wall — could have
      // the clamp plant the body right back inside it. Measured 2026-09-16: walking at the restroom
      // from the wall side put the owner at its dead centre, standing in the cubicle. Rather than
      // argue with the clamp, refuse the step: a move that ends up DEEPER inside a station than it
      // started simply does not happen. Comparing depths rather than testing "is it clear" matters,
      // because a single bad frame would otherwise leave the owner permanently inside with the
      // guard switched off — this way every move that digs out is still allowed.
      if (overlapDepth(P.x, P.z) > wasDepth + 1e-4) { P.x = wasX; P.z = wasZ; P.vx = 0; P.vz = 0; }
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
      const actionCandidates = [];
      let nearestFront = Infinity;
      cleanProg.clear();

      for (const st of world.stations.values()) {
        if (!st.active) continue;
        // Nearest standing spot in the room, for pickAction's "am I actually at this machine" test.
        if (st.front) { const d = dist2(P, st.front); if (d < nearestFront) nearestFront = d; }

        if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender' || st.type === 'icecream') {
          const prev = prevStock.has(st.id) ? prevStock.get(st.id) : st.stock;
          if (prev < 6 && st.stock >= 6) audio.play('ding');
          prevStock.set(st.id, st.stock);
          const productKey = st.type === 'blender' ? 'smoothie' : st.product;
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
          // The ice cream machine mirrors the espresso machine exactly, cream for beans. Until now
          // nothing in the running game ever called refillCream: the cold pantry sold cream, the
          // owner visibly carried it, and standing at the machine did nothing at all. Same story for
          // the bath's water further down — see the branch after 'bowl'.
          if (st.type === 'icecream' && dwellOk && carry.sack === 'cream') {
            const used = refillCream(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillCream = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.cream || C.coral, 6);
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
          if (atFront && !sheets.isOpen) offerAction(actionCandidates, st, 'pantry', 'SUPPLIES', 3);
        }

        if (st.type === 'return') {
          const atFront = near(P, st.front, 1.05);
          noteFirstHint('return', atFront);
          if (atFront && heldState(owner.items, carry) && !sheets.isOpen) offerAction(actionCandidates, st, 'return', 'RETURN', 6);
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

        if (st.type === 'bath') {
          const dwellOk = dwelling(st, 1.3, speed);
          noteFirstHint('bath', dwellOk);
          if (dwellOk && carry.sack === 'water') {
            const used = refillWater(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillWater = 1; audio.play('pour'); fx.burst(st.x, 0.7, st.z, C.metal, 6);
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
            // Batch 7: the cleaner is the obvious day-2 hire (economyConfig.js's 220) once the
            // owner has been doing this by hand for a while and the staff desk already exists.
            ownerWipeCount++;
            if (!cleanerHintShown && ownerWipeCount >= 6 && (G.staff.cleaner | 0) === 0 && world.built.has('z_hire')) {
              cleanerHintShown = true;
              hud.banner(cue([broomIcon(), '→', personIcon()], 'A cleaner can do this — hire one at the staff desk'), 3200);
            }
          }
        }

        if (st.type === 'kiosk' || st.type === 'hire' || st.type === 'boutique') {
          const atFront = near(P, st.front, 1.35);
          noteFirstHint(st.type, atFront);
          if (atFront && !sheets.isOpen) {
            const label = st.type === 'kiosk' ? 'UPGRADES' : st.type === 'hire' ? 'STAFF' : 'BOUTIQUE';
            offerAction(actionCandidates, st, st.type, label, 2);
          }
        }
      }

      floatAction = pickAction(actionCandidates, Math.sqrt(nearestFront));
      if (floatAction && !sheets.isOpen) {
        // Anchor on the machine's FRONT FACE, halfway out to the spot the owner stands on, rather
        // than on its centre: a deep counter or a wide kiosk would otherwise throw the button a
        // metre past the owner's shoulder and make it read as belonging to something else.
        const a = floatAction, fr = a.st.front;
        const ax = a.point ? a.point.x : (fr ? (a.st.x + fr.x) / 2 : a.st.x);
        const az = a.point ? a.point.z : (fr ? (a.st.z + fr.z) / 2 : a.st.z);
        fx.project(ax, 1.65, az, fbtnTmp);
        fbtn.style.left = fbtnTmp.sx + 'px'; fbtn.style.top = fbtnTmp.sy + 'px';
        if (fbtn.dataset.label !== floatAction.label) {
          fbtn.dataset.label = floatAction.label;
          const icon = ACTION_ICON[floatAction.label] || handIcon;
          paintCue(fbtn, cue([icon()], floatAction.label));
          // The owner asked for a one-word verb on action controls on 2026-09-09; sentences stay
          // banned on the play field. This word rides OUTSIDE the cue cells above (paintCue already
          // set the aria-label and the hidden .cueSr sentence from them) so the guard test, which
          // only inspects a cue call's own cells, never sees it and the ban on worded cells stays intact.
          const w = document.createElement('span');
          w.className = 'fbtnWord';
          w.textContent = ACTION_WORD[floatAction.label] || floatAction.label;
          fbtn.appendChild(w);
        }
        fbtn.classList.toggle('hidden', !fbtnTmp.visible);
      } else fbtn.classList.add('hidden');

      if (guideT > 0 && guideText) hud.setHandsFull(guideText);
      else if (!G.contextGuide) hud.setHandsFull(null);
      owner.setCarryProps(carry.sack, carry.fruit);
    },
  };
}
