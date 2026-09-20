// Owner movement, station interactions, carry guidance and contextual actions.
import {
  PRODUCTS, familyOf, playerSpeed, carryCap, machineSpeedMult,
} from '../sim/economy.js';
import {
  stepOvens, stepMachines, takeFromOven, takeFromMachine, putOnDisplay, collectCash,
  refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, ownerCleanSeat, returnToMachine,
} from '../sim/world.js';
import { canTakeItems, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../sim/carry.js';
import { pantryHandout, refilledInPlace, supplyKind, supplyRoom } from '../sim/supplies.js';
import { ownerBodyBoxes, moveOwnerBody, OWNER_BODY_R } from '../sim/ownerReach.js';
import { heldState, destinationFor, heldLabel, destinationLabel } from '../sim/interaction.js';
import { itemFor } from '../render/props.js';
import { C } from '../render/palette.js';
import { damp } from '../core/tween.js';
import { cue, paintCue } from '../ui/hud.js';
import { cashVisualSpot } from './registerCash.js';
import { handIcon, coffeeIcon, smoothieIcon, treatIcon, iconFor, personIcon, broomIcon } from '../ui/icons.js';

// The floating action button's pictograms, by the label the action was authored with. The label
// itself survives as the cue's aria text — and, through paintCue's visually-hidden span, as the
// button's textContent, which tools/production-smoke*.js and the task25 cert read verbatim.
// The staff desk is the last of these: the pantry hands its sack over by being stood at, the
// upgrade kiosk is gone and so is the RETURN crate (docs/SHIP-PLAN-2026-09-19.md §1.4).
const ACTION_ICON = { STAFF: personIcon };
// The owner's 2026-09-09 phone playtest: "those return, upgrade, staff labels now turned into icons
// really do not say anything". Sentences stay banned on the play field, but a single verb under the
// pictogram is not a sentence -- this is the ONE WORD painted by `.fbtnWord` below, entirely outside
// the cue helper's cells argument that the guard test (test/play-field-text.test.js) inspects, so
// the ban on worded cue cells is untouched. A label with no entry here falls back to the label
// itself, which is already upper-case and already a single word for every action this file authors.
const ACTION_WORD = { STAFF: 'HIRE' };
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
  if (st.type === 'coffee') return coffeeIcon();
  if (st.type === 'blender') return smoothieIcon();
  if (st.type === 'bowl') return treatIcon();
  if (st.type === 'display') return iconFor(st.product);
  return handIcon();
}
const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
// A STOP, not a slow walk (docs/SHIP-PLAN-2026-09-19.md §1.4). DWELL_SPEED was 0.6 m/s against a
// 3 m/s walk, so drifting through a machine's 1.3 m circle on the way somewhere else counted: the
// 19-day playthrough logged 482-1,576 stray pickups a day, every one of them a smoothie taken in
// the same stop that had just delivered the fruit. 0.15 m/s is "the stick is released": the
// velocity damp (18/s) falls from full speed to under it in ~0.17 s, so a deliberate stop still
// hands over in about 0.4 s and feels instant, while a pass-by never does.
const DWELL_SPEED = 0.15, DWELL_TIME = 0.25, DWELL_FACING = 0.3;
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
  bush: 'Pick fruit',
  blender: 'Add fruit',
  bowl: 'Add treats',
  icecream: 'Take ice cream',
  hire: 'Staff',
};
const FIRST_HINT_SECONDS = 2;

// How many more of this machine's product the counter it feeds can still take, once everything
// already in the owner's hands has landed on it. A machine hands over nothing when the answer is
// 0: that is the whole reason leftovers, and the RETURN crate that swallowed them, ever existed
// (docs/SHIP-PLAN-2026-09-19.md §1.4). A machine whose display does not exist yet (nothing else
// in the game today) returns 0 too — items with nowhere to go are not a pickup.
function displayRoomFor(world, st, held) {
  const fam = familyOf(st.type === 'blender' ? 'smoothie' : st.product);
  for (const id of world.displays) {
    const d = world.stations.get(id);
    if (d.active && familyOf(d.product) === fam) return d.capacity - d.stock - held;
  }
  return 0;
}

export function createStations(G, S, ctx) {
  ensureFbtnStyle();
  const { area, world, hud, fx, audio, input, owner, P, sheets, hints, els } = ctx;
  const carry = G.carry;
  let takeT = 0, dropT = 0, stepT = 0, frameDt = 0, steering = 0;
  const prevStock = new Map();
  const cleanProg = new Map();
  // One STOP per station: how long the owner has stood still inside its circle, and whether this
  // stop has already handed the station an input (fruit into the blender, beans into the coffee
  // machine). The `gave` flag is what stops the blender handing a smoothie straight back in the
  // very stop that fed it -- every one of the 482-1,576 stray pickups a day the playthrough logged
  // was exactly that. Walking off, or leaving the circle, ends the stop and clears both.
  const stops = new Map();
  ctx.cleanProg = cleanProg;
  P.rot = P.rot || 0;
  // Batch 7: after this many hand wipes with no cleaner ever hired, point at the obvious fix once
  // per session -- a pictogram-only banner (icons plus the arrow glyph only; test/play-field-
  // text.test.js scans every call to the cue helper in this file for stray words in cells).
  let ownerWipeCount = 0, cleanerHintShown = false;

  let guideT = 0, guideText = null, guideRefreshT = 0;
  function clearGuide() {
    guideT = 0; guideText = null; guideRefreshT = 0; G.contextGuide = null;
  }
  // Where what you are holding belongs, RE-ANSWERED while you carry it rather than frozen at the
  // moment you picked it up. The owner's report: "carrying cookies to a FULL cookie counter shows a
  // demo telling me to deliver them there instead of suggesting RETURN." destinationFor() has always
  // refused a full display (sim/interaction.js canDeliverTo requires stock < capacity) and falls
  // through to the return crate -- but it was only ever consulted once, on pickup, so a display that
  // filled up while you walked (a Runner stocking it, a guest buying the last slot) left the guide
  // pointing at a counter that could no longer take the tray. Re-asking twice a second costs one
  // pass over the station map and means the destination is always a place that will accept what is
  // in your hands.
  function refreshGuideDestination() {
    const held = heldState(owner.items, carry);
    if (!held) { clearGuide(); return; }
    const target = destinationFor(world, held, P);
    if (!target) { G.contextGuide = null; return; }
    const label = destinationLabel(target);
    G.contextGuide = { x: target.front.x, z: target.front.z, kind: 'deliver', caption: label, captionIcon: destinationIcon(target), captionLabel: `Carry to ${label.toLowerCase()}` };
  }
  function guideCarry(text = null, seconds = 4) {
    const held = heldState(owner.items, carry);
    if (!held) { clearGuide(); return null; }
    const target = destinationFor(world, held, P);
    if (!target) return null;
    const label = destinationLabel(target);
    // `caption` stays on the record: it is never drawn any more (systems/objective.js reads
    // captionIcon instead) but tools/production-smoke.js reads it as a diagnostic, and it is a
    // truthful description of where the guide is pointing.
    G.contextGuide = { x: target.front.x, z: target.front.z, kind: 'deliver', caption: label, captionIcon: destinationIcon(target), captionLabel: `Carry to ${label.toLowerCase()}` };
    guideT = seconds;
    guideText = text || `${heldLabel(held)} → ${label}`;
    return target;
  }

  function noteFirstHint(type, active) {
    if (!active) return;
    const text = FIRST_HINT[type];
    if (!text || G.hintsSeen.has(type)) return;
    G.hintsSeen.add(type);
    ctx.firstHint.msg = text; ctx.firstHint.t = FIRST_HINT_SECONDS;
  }

  const markCheckpoint = reason => { if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint(reason); };
  // One Shop (ui/shop.js, reached through G.openShop): the staff desk opens it on Staff, titled
  // "Staff", and the Café button opens it on its own. It owns its buy actions and pauses the café
  // like every sheet, so nothing here needs to follow the owner away.
  function openKiosk(st, tab) {
    audio.play('tap'); G.openShop(tab === 'workers' ? 'staff' : 'shop', tab);
  }

  // Stopping at the pantry IS the interaction (docs/SHIP-PLAN-2026-09-19.md §1.4). There used to be
  // a SUPPLIES button opening a bottom sheet with one or two rows — a menu for a choice the game
  // could already make, and the last text sheet standing in the play field. The pantry now hands
  // over the sack the neediest machine it stocks is waiting for, and one refill uses that sack up.
  function handOverSack(st) {
    const kind = pantryHandout(world, st);
    if (!kind || !takeSack(carry, kind)) return;
    audio.play('pop');
    fx.burst(st.x, 1.0, st.z, C.wood, 6);
    hints.pantry = 1;
    const target = destinationFor(world, heldState(owner.items, carry), P);
    guideCarry(target ? `${destinationLabel(target)}` : null, 3);
  }

  // Has the owner STOPPED at this station? (Not "is drifting through its circle" — see DWELL_SPEED.)
  //
  // Both halves matter. `speed` alone is not enough: walking into a counter makes moveOwnerBody
  // refuse the step and zero P.vx/P.vz, so a player leaning on the stick beside a machine read as
  // standing perfectly still and was handed its product — measured on the live probe, 8 trays
  // collected in four passes of the treat bowl on the way past the blender. `steering` is the
  // movement INPUT, so a stop means the player actually let go.
  // A stop belongs to the station the owner is standing AT. Two whose circles overlap must not both
  // answer one stop: bush1 stands 1.2 m from the blender it feeds, so without this, stopping to pick
  // fruit also poured it into the blender from the bush's own spot and the smoothie could then be
  // collected without ever walking over (measured on the live probe). Same rule, same band, as
  // pickAction applies to the action button; the ice cream machine and its stand sit 0.15 m apart
  // and still share a stop, which is the point of that pairing.
  let nearestFrontD = Infinity;
  function stoppedAt(st, radius, speed) {
    let s = stops.get(st.id);
    if (!s) { s = { t: 0, gave: false }; stops.set(st.id, s); }
    if (steering > 0.2 || !near(P, st.front, radius) || speed >= DWELL_SPEED
      || Math.sqrt(dist2(P, st.front)) > nearestFrontD + NEAR_BAND) { s.t = 0; s.gave = false; return false; }
    s.t += frameDt;
    if (s.t < DWELL_TIME) return false;
    const dx = st.x - P.x, dz = st.z - P.z, d = Math.hypot(dx, dz) || 1;
    const fx2 = Math.sin(P.rot), fz = Math.cos(P.rot);
    if ((fx2 * dx + fz * dz) / d <= DWELL_FACING) P.rot = Math.atan2(dx, dz);
    return true;
  }
  const stopGave = st => { const s = stops.get(st.id); return !!(s && s.gave); };
  const markGave = st => { const s = stops.get(st.id); if (s) s.gave = true; };

  // "Another machine": one that cannot take what is in the owner's hands, so stopping at it sends
  // the load home (docs/SHIP-PLAN-2026-09-19.md §1.4). A machine that CAN take it — the right
  // supply, the right product family — is never a mistake, even when it is momentarily full: that
  // load is still on its way somewhere. The pantry and the bushes have their own rule below, since
  // what they hand out must not be flown straight back out of the hands that just took it.
  const MACHINE_TYPES = new Set(['oven', 'coffee', 'blender', 'icecream']);
  function misplacedAt(st, held) {
    if (!held || !MACHINE_TYPES.has(st.type)) return false;
    if (held.type === 'product') {
      return familyOf(held.key) !== familyOf(st.type === 'blender' ? 'smoothie' : st.product);
    }
    return supplyKind(st) !== (held.type === 'fruit' ? 'fruit' : held.key);
  }

  // Where a load came from, so it has somewhere to fly back TO: a product to a machine that makes
  // its family, a sack to the pantry that hands it out, fruit to the nearest bush.
  function sourceOf(held) {
    if (!held) return null;
    if (held.type === 'fruit' || held.type === 'sack') {
      const want = held.type === 'fruit' ? 'bush' : 'pantry';
      let best = null, bestD = Infinity;
      for (const st of world.stations.values()) {
        if (!st.active || st.type !== want) continue;
        const d = dist2(P, st);
        if (d < bestD) { bestD = d; best = st; }
      }
      return best;
    }
    const fam = familyOf(held.key);
    for (const st of world.stations.values()) {
      if (!st.active || !MACHINE_TYPES.has(st.type)) continue;
      const pk = st.type === 'blender' ? 'smoothie' : st.product;
      if (familyOf(pk) === fam) return st;
    }
    return null;
  }

  // The whole of "no RETURN crates": the load leaves the hands where the owner stands, and lands
  // back where it came from, in two puffs. No fee, no button, no crate, no walk. Product goes back
  // onto its machine's tray (returnToMachine caps it at the buffer) so the picture is true —
  // harvested fruit and a part-used sack have no tray to go back onto and are simply put away.
  function flyBackHeld(held) {
    if (!held) return;
    const src = sourceOf(held);
    const n = Math.max(1, held.count | 0);
    if (held.type === 'product' && src) returnToMachine(world, src.id, n);
    owner.clearItems(); returnAll(carry);
    clearGuide();
    audio.play('drop');
    fx.burst(P.x, 1.0, P.z, C.cream, 6);
    if (src) fx.burst(src.x, 0.95, src.z, C.cream, Math.min(10, 4 + n));
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
  // grid and every sim baseline are untouched. st.body comes from src/systems/visuals.js. The box
  // rule itself lives in sim/ownerReach.js ownerBodyBoxes, so the post-build pocket check
  // (systems/zones.js) judges reachability against exactly these boxes. A gate is the OPENING in a
  // fence, not a thing, and is left out: its 4.8 m footprint was once a wall across the terrace's
  // only doorway that only the player collided with (owner playtest, 2026-09-17).
  let bodyBoxes = null, bodyBoxesFor = -1;
  function playerBoxes() {
    let live = 0;
    for (const st of world.stations.values()) if (st.active) live++;
    if (bodyBoxes && bodyBoxesFor === live) return bodyBoxes;
    bodyBoxesFor = live;
    bodyBoxes = ownerBodyBoxes(world);
    return bodyBoxes;
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
    // The coins fly out of the money the player can see, not out of the spot they are standing on.
    const vs = cashVisualSpot(st) || { x: cs.x, y: 0.3, z: cs.z };
    G.coins += amt; G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amt;
    hud.setCoins(G.coins); audio.play('coin');
    fx.coinArc(vs.x, Math.max(0.3, vs.y), vs.z, Math.min(10, 2 + (amt / 5 | 0)), () => hud.bump());
    fx.number(vs.x, Math.max(0.8, vs.y + 0.5), vs.z, '+' + amt);
    markCheckpoint('cash-collection');
    return amt;
  }

  function triggerFloatAction() {
    const a = floatAction;
    if (!a) return;
    if (a.kind === 'hire') openKiosk(a.st, 'workers');
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
      else {
        // The destination stays known for as long as the owner is holding something -- systems/
        // objective.js draws nothing for it unless they stall (CARRY_STUCK_SECONDS), so keeping it
        // alive costs no pixels and means the pointer, if it is ever needed, is pointing somewhere
        // that is still true. The four-second timer only ever governed the HUD's hands-full line.
        guideRefreshT -= dt;
        if (guideRefreshT <= 0) { guideRefreshT = 0.5; refreshGuideDestination(); }
        if (guideT <= 0 && guideText) guideText = null;
      }

      const mv = G._force || input; const sp = playerSpeed(G.up);
      steering = Math.hypot(mv.x || 0, mv.z || 0);
      P.vx = damp(P.vx, mv.x * sp, 18, dt); P.vz = damp(P.vz, mv.z * sp, 18, dt);
      // One step of the owner's body (sim/ownerReach.js moveOwnerBody — the headless no-pockets
      // walk in test/owner-reach.test.js moves by the same function). What it does, and why:
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
      // Batch 1 — regions engine (plan 7.1): clamp to the interior UNION every built region (the
      // terrace), or the owner can never walk onto the deck they just bought.
      // The interior UNION built regions need not be a rectangle, and fences are render-only:
      // clampToArea confines the owner to the rooms themselves and the crossing to the gate.
      // See its comment in sim/ownerState.js.
      // The clamp runs AFTER pushOut and wins, so a station whose box straddles the edge of the
      // walkable area — the restroom and the photo booth stand against the back wall — could have
      // the clamp plant the body right back inside it. Measured 2026-09-16: walking at the restroom
      // from the wall side put the owner at its dead centre, standing in the cubicle. Rather than
      // argue with the clamp, refuse the step: a move that ends up DEEPER inside a station than it
      // started simply does not happen. Comparing depths rather than testing "is it clear" matters,
      // because a single bad frame would otherwise leave the owner permanently inside with the
      // guard switched off — this way every move that digs out is still allowed.
      if (!moveOwnerBody(P, P.x + P.vx * dt, P.z + P.vz * dt, playerBoxes(), area, world.built)) { P.vx = 0; P.vz = 0; }
      owner.group.position.set(P.x, 0, P.z); owner.update(dt, P.vx, P.vz); S.follow(P.x, P.z, dt);

      const speed = Math.hypot(P.vx, P.vz);
      if (speed > 0.05) P.rot = Math.atan2(P.vx, P.vz);
      stepT -= dt; if (speed > 0.5 && stepT <= 0) { stepT = 0.28; audio.play('step'); }

      stepOvens(world, dt, machineSpeedMult(G.machineLevels, 'oven'));
      stepMachines(world, dt, machineSpeedMult(G.machineLevels, 'coffee'));
      takeT -= dt; dropT -= dt;
      const actionCandidates = [];
      cleanProg.clear();

      // Nearest standing spot in the room: "am I actually at this machine" for the stop rule
      // (stoppedAt) and for pickAction alike. It has to be known before the loop starts, or the
      // stations visited first would be judged against a partial answer.
      nearestFrontD = Infinity;
      for (const st of world.stations.values()) {
        if (!st.active || !st.front) continue;
        const d = dist2(P, st.front);
        if (d < nearestFrontD) nearestFrontD = d;
      }
      nearestFrontD = Math.sqrt(nearestFrontD);

      for (const st of world.stations.values()) {
        if (!st.active) continue;

        if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender' || st.type === 'icecream') {
          const prev = prevStock.has(st.id) ? prevStock.get(st.id) : st.stock;
          if (prev < 6 && st.stock >= 6) audio.play('ding');
          prevStock.set(st.id, st.stock);
          const productKey = st.type === 'blender' ? 'smoothie' : st.product;
          const stopOk = stoppedAt(st, 1.3, speed);
          noteFirstHint(st.type, stopOk);

          const held = heldState(owner.items, carry);
          const productMismatch = owner.items.length && familyOf(owner.items[0].userData.product) !== familyOf(productKey);
          const blockedBySupply = !canTakeItems(carry);
          const atFront = near(P, st.front, 1.3);
          if (stopOk && misplacedAt(st, held)) {
            // Stopped at a machine holding something it cannot take: the load goes home by itself.
            flyBackHeld(held);
          } else if (atFront && (productMismatch || blockedBySupply || owner.items.length >= carryCap(G.up))) {
            const current = held || heldState(owner.items, carry);
            if (current) {
              const target = destinationFor(world, current, P);
              guideCarry(`${heldLabel(current)}${target ? ` → ${destinationLabel(target)}` : ''}`, 3);
            }
          } else if (stopOk && takeT <= 0 && !stopGave(st) && canTakeItems(carry) && owner.items.length < carryCap(G.up)
            && st.stock > 0 && displayRoomFor(world, st, owner.items.length) > 0) {
            // A machine hands product over only on a genuine stop, only when the counter it feeds
            // still has room for it, and never in the stop that just fed the machine its input.
            const first = owner.items.length === 0;
            (st.type === 'oven' ? takeFromOven : takeFromMachine)(world, st.id, 1);
            const im = itemFor(productKey); im.userData.product = productKey; owner.addItem(im);
            takeT = 0.35; hints.oven = 1; audio.play('pop');
            if (first) guideCarry(null, 2.5);
          }

          if (st.type === 'coffee' && stopOk && carry.sack === 'beans') {
            const used = refillBeans(world, st.id, carry.sackLeft);
            if (used > 0) {
              useSack(carry, used); hints.refillCoffee = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.coral, 6);
              markGave(st); clearGuide();
            }
          }
          if (st.type === 'blender' && stopOk && carry.fruit > 0) {
            const added = stationAddFruit(world, st.id, carry.fruit);
            if (added > 0) {
              carry.fruit -= added; hints.blend = 1; audio.play('pour'); fx.burst(st.x, 0.9, st.z, C.plant, 6);
              markGave(st); if (carry.fruit <= 0) clearGuide();
            }
          }
        }

        if (st.type === 'display') {
          const stopOk = stoppedAt(st, 1.3, speed);
          noteFirstHint('display', stopOk);
          const atFront = near(P, st.front, 1.3);
          const held = heldState(owner.items, carry);
          if (owner.items.length && familyOf(owner.items[0].userData.product) !== familyOf(st.product)) {
            if (atFront && held) {
              const target = destinationFor(world, held, P);
              guideCarry(target ? `${destinationLabel(target)}` : null, 3);
            }
          } else if (stopOk && dropT <= 0 && owner.items.length && st.stock < st.capacity) {
            const m = owner.popItem(); const key = m.userData.product || st.product;
            putOnDisplay(world, st.id, key, 1); dropT = 0.15; hints.counter = 1; audio.play('drop');
            fx.burst(st.x, 1.3, st.z, PRODUCTS[key].color, 4);
          }
          // The garden stand's cash jar empties itself into the wallet as the owner passes behind the
          // counter — the same walk-past rule as a register's tray, from the spot the owner stocks it.
          if (st.selfServe && st.pile > 0 && near(P, st.cash, AUTO_CASH_RADIUS) && !sheets.isOpen) collectRegisterCash(st);
        }

        if (st.type === 'checkout') {
          // Behind the till (st.serve), not on the customer's side: the head of the queue stands
          // 1.4 m out in front, which is where st.front is, and the two bodies used to overlap.
          const atFront = near(P, st.serve, 1.1);
          noteFirstHint('checkout', atFront);
          if (atFront) st.serving = 'owner';

          // Cash is a flow chore, not a decision. Walking close to the tray collects it immediately —
          // from the serving spot too, so serving never means stepping round the counter afterwards.
          if (st.pile > 0 && (near(P, st.cash, AUTO_CASH_RADIUS) || atFront) && !sheets.isOpen) collectRegisterCash(st);
        }

        if (st.type === 'pantry') {
          const stopOk = stoppedAt(st, 1.35, speed);
          noteFirstHint('pantry', stopOk);
          // ONE hand-over per stop, and the `gave` flag is what guarantees it: without it the
          // pantry hands a sack over on one frame and flies it straight back out of the owner's
          // hands on the next, because a sack is "something in the way" to a pantry.
          if (stopOk && !sheets.isOpen && !stopGave(st)) {
            const held = heldState(owner.items, carry);
            if (held) {
              // A sack still on its way somewhere is not in the way; anything else is, and goes
              // home — leaving the hands free for the hand-over on the next frame of this stop.
              if (!(held.type === 'sack' && destinationFor(world, held, P))) flyBackHeld(held);
            } else { handOverSack(st); markGave(st); }
          }
        }

        if (st.type === 'bowl') {
          const stopOk = stoppedAt(st, 1.3, speed);
          noteFirstHint('bowl', stopOk);
          // The treat bowl has its own kibble bin under it: standing at it scoops a bowlful, so
          // nobody walks a sack across the café for it (docs/SHIP-PLAN-2026-09-19.md §1.4). The
          // 20-unit kibble sack was bigger than the bowl's 10-unit capacity, which is exactly where
          // the leftovers that needed a RETURN crate came from.
          if (stopOk && refilledInPlace(st) && supplyRoom(st) > 0 && !heldState(owner.items, carry)) {
            const used = refillBowl(world, st.id, supplyRoom(st));
            if (used > 0) { hints.refillBowl = 1; audio.play('pour'); fx.burst(st.x, 0.5, st.z, C.pink, 6); }
          }
        }

        if (st.type === 'bush') {
          const stopOk = stoppedAt(st, 1.2, speed);
          noteFirstHint('bush', stopOk);
          const heldHere = heldState(owner.items, carry);
          // Picking needs a free hand, so a tray or a sack flies home first and the pick happens on
          // the next frame of the same stop. Fruit already in the basket is NOT in the way — it came
          // off a bush and it is on its way to the blender — or a full basket would be thrown away
          // by walking past the plant it was picked from.
          if (stopOk && heldHere && heldHere.type !== 'fruit') flyBackHeld(heldHere);
          else if (stopOk && st.stage === 3 && canTakeItems(carry) && owner.items.length === 0 && carry.fruit < carryCap(G.up)) {
            const first = carry.fruit === 0;
            const got = harvestBush(world, st.id);
            if (got > 0) {
              carryAddFruit(carry, got, carryCap(G.up)); hints.harvest = 1; audio.play('pop'); fx.burst(st.x, 0.7, st.z, C.coral, 8);
              if (first) guideCarry('BLENDER', 3);
            }
          }
        }

        if (st.type === 'seat') {
          // A photographed pet tips onto its own table (src/sim/petPose.js). Money is a flow chore,
          // not a decision, so it is swept exactly like a register's tray: walking close enough to
          // wipe the table is close enough to pick the saucer up.
          if (st.pile > 0 && near(P, st.front, AUTO_CLEAN_RADIUS) && !sheets.isOpen) collectRegisterCash(st);
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

        // The staff desk is the last station in the café that raises a button: everything else is
        // now a walk-up (docs/SHIP-PLAN-2026-09-19.md §1.4). Hiring stays a deliberate tap because
        // it spends coins, which is never something proximity should decide.
        if (st.type === 'hire') {
          const atFront = near(P, st.front, 1.35);
          noteFirstHint('hire', atFront);
          if (atFront && !sheets.isOpen) offerAction(actionCandidates, st, 'hire', 'STAFF', 2);
        }
      }

      floatAction = pickAction(actionCandidates, nearestFrontD);
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

      owner.setCarryProps(carry.sack, carry.fruit);
    },
  };
}
