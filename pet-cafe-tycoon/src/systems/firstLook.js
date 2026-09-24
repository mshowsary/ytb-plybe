// src/systems/firstLook.js — one quiet demo per new thing (docs/SHIP-PLAN-2026-09-19.md §1.8).
//
// WHAT THIS REPLACES, measured on a fresh save at 380x670 (research/onboarding, 2026-09-19):
// day 1 was an 84-second forced walkthrough chain (the intro's step 4 re-ran bake → stock → serve →
// cash with the trail on screen 25% of the day and the beacon 36%), and days 2-4 were silent — no
// trail at all on day 2, 2% on day 3. Eleven zone purchases produced no lesson and no camera look
// between them, so the camera, the treat bowl, the ice cream stand, the pantry and the staff desk
// were never introduced at all. In a run that followed the game's own guidance, nobody was hired by
// day 4. Fifteen emitters, none of them arbitrated, and not one of them triggered by a purchase.
//
// THE RULE HERE IS THE OPPOSITE OF A WALKTHROUGH. A lesson is a SHORT LOOK, not an errand:
//   1. a camera pan to the new thing — pan only (render/scene.js S.establish moves the camera's
//      target; pitch, yaw and FOV are fixed there and a single station's two points always solve to
//      the ordinary follow distance, so nothing zooms). Only when the subject is off screen or more
//      than PAN_METERS away, and never under reduced motion;
//   2. ONE glyph bubble of 2-3 cells over the thing itself, in the need-bubble grammar every
//      station already speaks (systems/visuals.js, style.css .demand.need);
//   3. a ghost hand ONLY for a tap, a hold or a timing ring — never for "walk over there". That is
//      the coach's deleted route hand, which clamped itself to the screen edge and hung there for
//      tens of seconds pointing at something behind a wall.
// It ends when the player does the thing, and it never plays again: the shown ids are persisted in
// the learning payload (sim/mechanicLearning.js FIRST_LOOK_IDS), bounded and whitelisted.
//
// THE LANE. One lesson at a time. The presentation beat is pushed through the single moment queue
// (ui/moments.js) rather than drawn over it, which is what makes banners and pet toasts WAIT for a
// lesson instead of landing on top of it — and, for free, what holds a lesson under a sheet, an ad
// or the day summary, because that queue is already held by all three. A lesson never opens during
// a rush unless the lesson IS the thing a waiting guest is blocked on, and never during the opening
// first minute (systems/intro.js owns that).
//
// CALL PATH FROM NORMAL PLAY: src/game.js createIntro(G, S, ctx) -> createFirstLook(...) here, and
// game.js's per-frame `intro.update(dt)` steps it. It reads `world.events` for the 'built' event on
// the same frame systems/zones.js emits it (game.js clears the list only at the end of the step),
// and everything else off live G/world state. It publishes two things back: `G.firstLookActive`,
// which parks the interaction coach, and `G.firstLookPoint`, which systems/objective.js turns into
// its single screen-edge arrow while the subject is off screen.
import * as icons from '../ui/icons.js';
import { momentQueue } from '../ui/moments.js';
import { isModalOpen } from '../ui/modal.js';
import { FIRST_LOOK_IDS, normalizeFirstLook } from '../sim/mechanicLearning.js';
import { STAFF } from '../sim/economyConfig.js';

/** The cheapest first hire the staff desk sells, read from the economy rather than written twice. */
const CHEAPEST_HIRE = Math.min(...Object.values(STAFF).map(s => s.costs[0]));

const STYLE_ID = 'pet-cafe-first-look-style';

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style'); tag.id = STYLE_ID;
  // The bubble is .demand.need's shape with a gap, under its own class rather than .demand: the
  // label arbiter (ui/labelLayout.js) may HIDE a .demand when the field is crowded, and the one
  // thing a lesson may not do is silently not happen.
  const css = `
    .fl-bubble{position:absolute;transform:translate(-50%,-100%);display:flex;align-items:center;gap:5px;
      padding:6px 8px;border-radius:16px;background:#FFFDF8;border:2px solid #FFFFFF;
      box-shadow:0 4px 12px #3B2E2A38;pointer-events:none;white-space:nowrap;z-index:3;box-sizing:border-box}
    .fl-bubble.hidden{display:none}
    .fl-bubble::after{content:'';position:absolute;left:50%;bottom:-7px;width:11px;height:11px;background:inherit;
      border-right:2px solid #FFFFFF;border-bottom:2px solid #FFFFFF;transform:translateX(-50%) rotate(45deg);
      border-radius:0 0 3px 0;box-sizing:border-box}
    .fl-bubble.ui{transform:translate(-50%,0)}
    .fl-bubble.ui::after{display:none}
    .fl-bubble .dicon{display:grid;place-items:center;line-height:0}
    .fl-bubble .dicon svg{width:26px;height:26px;display:block}
    .fl-bubble .dsep{font:900 15px/1 system-ui,sans-serif;color:#A2908A}
    .fl-bubble.pop{animation:fl-pop .42s cubic-bezier(.2,1.6,.4,1) 1}
    @keyframes fl-pop{0%{transform:translate(-50%,-100%) scale(.35)}100%{transform:translate(-50%,-100%) scale(1)}}
    .fl-bubble.ui.pop{animation:fl-pop-ui .42s cubic-bezier(.2,1.6,.4,1) 1}
    @keyframes fl-pop-ui{0%{transform:translate(-50%,0) scale(.35)}100%{transform:translate(-50%,0) scale(1)}}
    .fl-hand{position:fixed;left:0;top:0;width:38px;height:38px;z-index:25;pointer-events:none;
      transform:translate(-50%,-50%);opacity:.8;filter:drop-shadow(0 3px 5px #0003)}
    .fl-hand.hidden{display:none}
    .fl-hand svg{width:100%;height:100%;overflow:visible;display:block}
    .fl-hand .fl-ring{fill:none;stroke:#fff;stroke-width:2.4;opacity:.7;transform-origin:19px 19px;
      animation:fl-tapring 1.5s ease-out infinite}
    .fl-hand .fl-palm{fill:#fff8ef;stroke:#6c554c;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round;
      transform-origin:20px 23px;animation:fl-taphand 1.5s ease-in-out infinite}
    .fl-hand.hold .fl-ring{animation:fl-holdring 1.7s ease-in-out infinite}
    .fl-hand.hold .fl-palm{animation:fl-holdhand 1.7s ease-in-out infinite}
    @keyframes fl-tapring{0%{transform:scale(.72);opacity:.85}70%{transform:scale(1.18);opacity:.12}100%{transform:scale(1.18);opacity:0}}
    @keyframes fl-taphand{0%,100%{transform:translateY(0)}45%{transform:translateY(-4px)}}
    @keyframes fl-holdring{0%,100%{transform:scale(.78);opacity:.45}50%{transform:scale(1.04);opacity:.9}}
    @keyframes fl-holdhand{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1.5px) scale(.98)}}
    body.game-paused .fl-bubble,body.host-paused .fl-bubble,body.modal-open .fl-bubble,
    body.game-paused .fl-hand,body.host-paused .fl-hand,body.modal-open .fl-hand{display:none!important}
    @media(prefers-reduced-motion:reduce){
      .fl-bubble.pop{animation:none}
      .fl-hand .fl-ring,.fl-hand .fl-palm{animation:none!important}
      .fl-hand .fl-ring{opacity:.6;transform:scale(.85)}}
    @media(max-width:320px){.fl-bubble .dicon svg{width:22px;height:22px}.fl-hand{width:32px;height:32px}}
  `;
  tag.textContent = css;
  document.head.appendChild(tag);
}

// ---- timing -------------------------------------------------------------------------------------
/** The beat that owns the moment queue: pan in, bubble, hold, pan back. */
export const PRESENT_SECONDS = 3.4;
/** After the beat the bubble simply waits for the player. It is never a nag, so it gives up. */
export const AWAIT_SECONDS = 26;
/** An armed lesson that never reached a free lane in this long is dropped, shown-once, unshown. */
export const ARM_SECONDS = 18;
/**
 * Banners and pet toasts WAIT for a lesson, which is the whole point of going through the moment
 * queue. A lesson waits for them too — but only this long. The queue's own timers run on wall time
 * (ui/moments.js, presentationScheduler) while everything here runs on the simulation's dt, so a
 * backlog of celebrations must never be able to strand a lesson in the queue for good: past this,
 * the lesson presents anyway. Long enough for two ordinary toasts to finish first.
 */
export const QUEUED_SECONDS = 6;
/** Pan only to something the player cannot already see comfortably. */
export const PAN_METERS = 6;
/** At most this many lessons may be waiting for the lane; the rest are dropped rather than stacked. */
export const QUEUE_MAX = 2;
/**
 * A player who is busy is never interrupted. A lesson whose subject is off screen waits until the
 * player has stood still this long (the "I don't know what to do" pause), and the camera only ever
 * pans for a player who is already standing still — never out from under a walking one.
 */
export const STUCK_SECONDS = 3.5;
export const STILL_TO_PAN = 1.2;
/** How close the owner must be to a station's front for a "stand here" lesson to count as done. */
const REACH_METERS = 1.45;

const ARROW = '<span class="dsep">→</span>';
const cell = html => `<span class="dicon">${html}</span>`;

function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

// ---- the lesson table ---------------------------------------------------------------------------
// Every lesson answers the same five questions, and every one of them is a pure function of live
// world state, so the whole table is testable without a camera or a DOM (test/first-look.test.js).
//
//   arm(L)     may this lesson open now? (its subject exists, and the player has not done it yet)
//   focus(L)   the world point the pan and the bubble belong to, or null for a UI lesson
//   glyphs(L)  2-3 cue cells, pictures only
//   done(L)    the player did the thing; the lesson retires for good
//   hand       null | 'tap' | 'hold' | 'ring'
//
// `blocking: true` marks the lessons that ARE what a waiting guest is stuck behind, which is the one
// case a lesson may open during a rush.
const ROLE_GLYPH = {
  runner: () => icons.displayIcon(), cashier: () => icons.registerIcon(),
  cleaner: () => icons.broomIcon(), barista: () => icons.coffeeIcon(),
  photographer: () => icons.cameraIcon(),
};

const at = st => (st ? { x: st.x, z: st.z } : null);
const live = (L, id) => { const st = L.world.stations.get(id); return st && st.active ? st : null; };
const frontOf = st => (st && st.front ? { x: st.front.x, z: st.front.z, y: 1.1 } : null);
const nearFront = (L, st) => {
  if (!st || !st.front || !L.G.P) return false;
  return (L.G.P.x - st.front.x) ** 2 + (L.G.P.z - st.front.z) ** 2 <= REACH_METERS * REACH_METERS;
};
const held = L => (L.G.owner && Array.isArray(L.G.owner.items) ? L.G.owner.items : []);
const staffOf = (L, kind) => (L.G.staffList || []).find(s => s && s.kind === kind) || null;
const anyStaff = L => Object.values(L.G.staff || {}).some(n => (n | 0) > 0);

/** The cheapest pad the player can reach and afford right now, or null. */
export function affordablePad(L) {
  const { G, world } = L;
  let best = null;
  for (const z of world.area.zones || []) {
    if (world.built.has(z.id)) continue;
    if (z.requires && !world.built.has(z.requires)) continue;
    const paid = Math.max(0, Number(world.partial && world.partial[z.id]) || 0);
    const remaining = Math.max(0, z.price - paid);
    if (remaining > (G.coins | 0)) continue;
    if (!best || remaining < best.remaining) best = { zone: z, remaining };
  }
  return best ? best.zone : null;
}

function dirtySeat(L) {
  for (const st of L.world.stations.values()) if (st.active && st.type === 'seat' && st.dirty) return st;
  return null;
}
function ripeBush(L) {
  for (const st of L.world.stations.values()) if (st.active && st.type === 'bush' && (st.stage | 0) >= 3) return st;
  return null;
}
function dryCoffee(L) {
  for (const st of L.world.stations.values()) if (st.active && st.type === 'coffee' && (st.beans | 0) <= 0) return st;
  return null;
}

function roleLesson(id, kind) {
  return {
    id, kind, pan: true, hand: null,
    arm: L => !!staffOf(L, kind),
    // The camera goes to the WORKER and the bubble rides on them, so the pair reads as "that one,
    // and that is their counter" wherever they have got to. Framing the LANE instead was the first
    // try and it was wrong for the same reason the old staff demo was: a worker who has just walked
    // in at the door is twelve metres from the counter they are heading for, so a shot of the
    // counter is a shot of nobody. The lesson's second glyph is what names the lane.
    focus: L => { const w = staffOf(L, kind); return w ? { x: w.x, z: w.z } : null; },
    bubbleAt: L => { const w = staffOf(L, kind); return w ? { x: w.x, z: w.z, y: 2.0 } : null; },
    glyphs: () => [cell(icons.personIcon()), ARROW, cell((ROLE_GLYPH[kind] || icons.personIcon)())],
    aria: 'A new worker is walking to the counter it looks after',
    // A "watch this" moment: it is over when the look is over.
    done: () => true,
  };
}

export const LESSONS = [
  {
    // The first purchase. The plot's own price pill already says what it costs; what nothing said
    // was that you BUY it by standing on it and holding still.
    // `patient`: measured on the live 3-day probe, the first pad became affordable DURING day 1's
    // rush, when a lesson correctly stands aside — and eighteen seconds later it expired, so the
    // one lesson the whole progression hangs on was never shown at all. The two lessons a player
    // cannot get anywhere without wait as long as it takes for a free minute; every other lesson is
    // an offer that goes stale rather than arriving out of context.
    id: 'build', pan: true, hand: 'hold', patient: true,
    arm: L => L.world.built.size === 0 && !!affordablePad(L),
    focus: L => { const z = affordablePad(L); return z ? { x: z.x, z: z.z } : null; },
    handAt: L => { const z = affordablePad(L); return z ? { x: z.x, z: z.z, y: 0.85 } : null; },
    glyphs: () => [cell(icons.coinIcon()), ARROW, cell(icons.gearIcon())],
    aria: 'Stand on the plot to build it',
    done: L => L.world.built.size > 0,
  },
  {
    id: 'clean', pan: true, hand: null, blocking: true,
    arm: L => !!dirtySeat(L),
    focus: L => at(dirtySeat(L)),
    glyphs: () => [cell(icons.tableDirtyIcon()), ARROW, cell(icons.broomIcon())],
    aria: 'Walk past a dirty table to wipe it',
    done: L => !dirtySeat(L),
  },
  {
    // The staff desk: built on day 2 in a guidance-following run, and still nobody hired by day 4.
    //
    // It waits for the COINS as well as the desk. Measured on the live probe: the desk is bought
    // with almost everything the player has (300 of 345), so a lesson that opened the instant the
    // desk existed put a ghost hand on a HIRE button whose every row was greyed out — the same
    // "offer the player cannot take" the upgrades lesson below refuses to make. `patient` means it
    // simply waits for the wallet instead of expiring.
    id: 'hire', pan: true, hand: 'tap', patient: true,
    arm: L => !!live(L, 'hire1') && !anyStaff(L) && (L.G.coins | 0) >= CHEAPEST_HIRE,
    focus: L => at(live(L, 'hire1')),
    handAt: () => '.fbtn',
    glyphs: () => [cell(icons.personIcon()), ARROW, cell(icons.coinIcon())],
    aria: 'Hire your first worker at the staff desk',
    done: L => anyStaff(L),
  },
  roleLesson('roleRunner', 'runner'),
  roleLesson('roleCashier', 'cashier'),
  roleLesson('roleCleaner', 'cleaner'),
  roleLesson('roleBarista', 'barista'),
  roleLesson('rolePhotographer', 'photographer'),
  {
    // The coffee bar: a machine and the counter it feeds, the same shuffle as the oven.
    id: 'coffee', pan: true, hand: null,
    arm: L => !!live(L, 'coffee1'),
    focus: L => at(live(L, 'coffee1')),
    glyphs: () => [cell(icons.coffeeIcon()), ARROW, cell(icons.displayIcon())],
    aria: 'Carry coffee from the machine to the counter',
    done: L => {
      const bar = live(L, 'barCoffee');
      return (bar && (bar.stock | 0) > 0) || held(L).some(m => m?.userData?.product === 'coffee');
    },
  },
  {
    // The pantry hand-over. Nothing introduced it: the machine simply stopped working and a SUPPLIES
    // button used to appear on one face of a box across the room.
    id: 'pantry', pan: true, hand: 'hold', blocking: true,
    arm: L => !!live(L, 'pantry1') && !!dryCoffee(L) && L.G.carry?.sack !== 'beans',
    focus: L => at(live(L, 'pantry1')),
    handAt: L => frontOf(live(L, 'pantry1')),
    glyphs: () => [cell(icons.sackIcon()), ARROW, cell(icons.beanIcon())],
    aria: 'Stand at the pantry to be handed a sack of beans',
    done: L => L.G.carry?.sack === 'beans' || nearFront(L, live(L, 'pantry1')),
  },
  {
    // The treat bowl keeps its OWN kibble bin: standing at it is the whole refill, and no sack walks
    // across the café for it. That is a rule the player cannot guess.
    id: 'bowl', pan: true, hand: 'hold',
    arm: L => !!live(L, 'bowl1'),
    focus: L => at(live(L, 'bowl1')),
    handAt: L => frontOf(live(L, 'bowl1')),
    glyphs: () => [cell(icons.kibbleIcon()), ARROW, cell(icons.treatIcon())],
    aria: 'Stand at the treat bowl to fill it from its own bin',
    done: L => nearFront(L, live(L, 'bowl1')),
  },
  {
    id: 'harvest', pan: true, hand: 'hold',
    arm: L => !!ripeBush(L),
    focus: L => at(ripeBush(L)),
    handAt: L => frontOf(ripeBush(L)),
    glyphs: () => [cell(icons.leafIcon()), ARROW, cell(icons.fruitIcon())],
    aria: 'Stand at a ripe bush to pick its fruit',
    done: L => (L.G.carry?.fruit | 0) > 0,
  },
  {
    id: 'blend', pan: true, hand: null,
    arm: L => !!live(L, 'blender1'),
    focus: L => at(live(L, 'blender1')),
    glyphs: () => [cell(icons.fruitIcon()), ARROW, cell(icons.smoothieIcon())],
    aria: 'Pick fruit from the bushes and pour it into the blender',
    done: L => { const b = live(L, 'blender1'); return !!b && ((b.fruit | 0) > 0 || nearFront(L, b)); },
  },
  {
    // The garden is a second room with its own guests and its own money. The look IS the lesson.
    id: 'garden', pan: true, hand: null,
    arm: L => !!live(L, 'icecream1'),
    focus: L => at(live(L, 'icecream1')),
    glyphs: () => [cell(icons.icecreamIcon()), ARROW, cell(icons.coinIcon())],
    aria: 'The ice cream garden serves itself and pays into the jar on the stand',
    done: () => true,
  },
  {
    // ...and the one outdoor job it does ask for: cones from the machine onto the stand.
    id: 'icestand', pan: true, hand: null,
    arm: L => { const bar = live(L, 'barIce'); return !!bar && (bar.stock | 0) <= 0 && !!live(L, 'icecream1'); },
    focus: L => at(live(L, 'icecream1')),
    glyphs: () => [cell(icons.icecreamIcon()), ARROW, cell(icons.displayIcon())],
    aria: 'Carry cones from the ice cream machine to the stand',
    done: L => { const bar = live(L, 'barIce'); return !!bar && (bar.stock | 0) > 0; },
  },
  {
    id: 'photo', pan: true, hand: null,
    arm: L => !!live(L, 'photoWall1'),
    focus: L => at(live(L, 'photoWall1')),
    glyphs: () => [cell(icons.cameraIcon()), ARROW, cell(icons.pawIcon())],
    aria: 'Pets now pose at their tables and every photo fills the wall',
    done: () => true,
  },
  {
    // The first pose, with the ghost hand on the timing ring itself — the one place in the game
    // where the player has to hit a moment.
    id: 'pose', pan: true, hand: 'ring', blocking: true,
    arm: L => !!(L.world.pose && !L.world.pose.session),
    focus: L => (L.world.pose ? { x: L.world.pose.x, z: L.world.pose.z } : null),
    handAt: L => '.photoRing',
    glyphs: () => [cell(icons.cameraIcon()), ARROW, cell(icons.pawIcon())],
    aria: 'Walk up to the posing pet and time the shot',
    done: L => !L.world.pose || !!L.world.pose.session,
  },
  {
    // The kiosk is gone; upgrades live in the Shop behind the Café button, which a player who has
    // never opened a menu has no reason to press. UI lesson: no world point, a hand on the button.
    //
    // `done` cannot ask isModalOpen(): every sheet pauses the café (ui/modal.js), so this system is
    // not stepped at all while one is open and the answer would always be "no". It reads the tap
    // itself, captured by the listener in createFirstLook.
    id: 'upgrades', pan: false, hand: 'tap', ui: '.pause-btn',
    arm: L => (L.G.dayState?.day | 0) >= 2 && (L.G.coins | 0) >= 300 && L.world.built.size > 0
      && !L.flags.menuOpened,
    focus: () => null,
    handAt: () => '.pause-btn',
    glyphs: () => [cell(icons.gearIcon()), ARROW, cell(icons.coinIcon())],
    aria: 'Upgrades and staff are in the Shop, behind the Café button',
    done: L => L.flags.menuOpened || Object.values(L.G.up || {}).some(n => (n | 0) > 0),
  },
];

// A lesson whose id the save boundary does not know could never be persisted as shown, so it would
// replay for ever. Catching that here, at module load, is cheaper than catching it on a player's
// second session.
for (const l of LESSONS) {
  if (!FIRST_LOOK_IDS.includes(l.id)) throw new Error(`firstLook: lesson '${l.id}' is not in FIRST_LOOK_IDS`);
}

/**
 * May a lesson open this frame? Pure, so the lane policy is a test rather than a screenshot.
 * The moment queue itself holds everything under a sheet, an ad and the day summary; this is the
 * part of the policy the queue does not know about.
 */
export function laneOpen({ intro = false, rush = false, blocking = false, paused = false, modal = false } = {}) {
  if (intro || paused || modal) return false;
  if (rush && !blocking) return false;
  return true;
}

export function createFirstLook(G, S, ctx) {
  injectStyle();
  const world = ctx.world, fx = ctx.fx;
  const dom = typeof document !== 'undefined';

  const bubbleEl = dom ? document.createElement('div') : null;
  const handEl = dom ? document.createElement('div') : null;
  if (dom) {
    // The glyphs are the whole message, so the bubble is one image with a sentence for its name —
    // the same contract every other world bubble keeps (systems/visuals.js's need and pose bubbles).
    // It is deliberately NOT aria-hidden: that would silence the only words a screen reader gets.
    bubbleEl.className = 'fl-bubble hidden';
    bubbleEl.setAttribute('role', 'img');
    handEl.className = 'fl-hand hidden';
    handEl.setAttribute('aria-hidden', 'true');
    handEl.innerHTML = '<svg viewBox="0 0 38 38" aria-hidden="true"><circle class="fl-ring" cx="19" cy="19" r="10"/>'
      + '<path class="fl-palm" d="M17.2 26.8v-12c0-2.5 3.6-2.5 3.6 0v6.2-3.4c0-2.2 3.2-2.2 3.2 0v3.8-2.6c0-2 3-2 3 0v3.4-1.8c0-1.9 2.9-1.9 2.9 0v5.4c0 5-3.2 8.1-7.8 8.1h-1.3c-2.9 0-5.1-1.2-6.9-3.7l-2.4-3.4c-1.4-2.1 1.7-4 3.1-2.1l2.6 3.1z"/></svg>';
    const host = ctx.els && ctx.els.fx ? ctx.els.fx : document.body;
    host.appendChild(bubbleEl);
    document.body.appendChild(handEl);
  }

  const seen = new Set();
  const armed = [];                 // [{ lesson, t }] waiting for the lane, oldest first
  let active = null;                // { lesson, phase, t, release, panned, glyphKey }
  const tmp = { sx: 0, sy: 0, visible: true };
  let stillT = 0;                   // seconds since the player last moved or touched anything

  // The one fact a lesson cannot read off the world: the player opened the Café card. Every sheet
  // pauses the café, so no update runs while one is up — the tap is captured here instead, in the
  // same capture phase the interaction coach already uses for the action button.
  const flags = { menuOpened: false };
  const onTap = e => {
    const t = e.target && e.target.closest ? e.target.closest('.pause-btn,.cc-tile') : null;
    if (t) flags.menuOpened = true;
  };
  if (dom) document.addEventListener('click', onTap, true);

  const L = { G, S, world, ctx, flags };

  function lessonContextReady() {
    return !!(G && G.P && world && world.stations);
  }

  function hideVisuals() {
    if (!dom) return;
    bubbleEl.classList.add('hidden');
    handEl.classList.add('hidden');
  }

  function publish() {
    G.firstLookActive = !!(active && active.phase !== 'queued');
    G.firstLookPoint = null;
    if (!active || active.phase === 'queued') return;
    const p = active.point;
    if (p) G.firstLookPoint = { x: p.x, z: p.z, kind: 'look', id: active.lesson.id, edgeOnly: true };
  }

  function retire(reason = 'done') {
    if (!active) return;
    if (active.release) { const r = active.release; active.release = null; r(); }
    if (S && typeof S.releaseEstablish === 'function' && active.panned) S.releaseEstablish();
    active = null;
    hideVisuals();
    publish();
    if (reason === 'done' && typeof G.requestCheckpoint === 'function') G.requestCheckpoint('first-look');
  }

  function beginPresent() {
    if (!active) return;
    active.phase = 'present';
    active.t = 0;
    const lesson = active.lesson;
    const point = lesson.focus(L);
    active.point = point;
    // The pan, and only when it buys something: a subject already close and on screen needs no
    // camera move at all, and a camera move is the most expensive thing this system can spend.
    if (point && lesson.pan && S && typeof S.establish === 'function' && !reducedMotion()) {
      let far = stillT >= STILL_TO_PAN && Math.hypot(G.P.x - point.x, G.P.z - point.z) > PAN_METERS;
      if (!far && stillT >= STILL_TO_PAN && fx && typeof fx.project === 'function') {
        fx.project(point.x, 1.2, point.z, tmp);
        far = !tmp.visible;
      }
      if (far) {
        active.panned = S.establish(
          [{ x: point.x, y: 0, z: point.z }, { x: point.x, y: 1.6, z: point.z }],
          { hold: Math.max(0.6, PRESENT_SECONDS - 1.6), glide: 1.0, margin: 0.12 },
        ) !== false;
      }
    }
    if (dom) {
      const glyphs = lesson.glyphs(L).join('');
      if (active.glyphKey !== glyphs) { active.glyphKey = glyphs; bubbleEl.innerHTML = glyphs; }
      bubbleEl.setAttribute('aria-label', lesson.aria || '');
      bubbleEl.classList.remove('pop');
      void bubbleEl.offsetWidth;
      bubbleEl.classList.add('pop');
    }
    publish();
  }

  function start(lesson) {
    active = { lesson, phase: 'queued', t: 0, qt: 0, release: null, panned: false, glyphKey: '', point: null };
    seen.add(lesson.id);
    const ok = momentQueue.push({
      kind: 'lesson', key: 'firstLook:' + lesson.id,
      run: done => {
        if (!active || active.lesson !== lesson) { done(); return; }
        active.release = done;
        beginPresent();
      },
    });
    // The queue refuses a duplicate key only; with nothing to wait behind, present immediately
    // rather than stranding the lesson (the queue is a courtesy to banners, not a gate).
    if (!ok && active && active.phase === 'queued') beginPresent();
  }

  function placeBubble() {
    if (!dom || !active || active.phase === 'queued') return;
    const lesson = active.lesson;
    if (lesson.ui) {
      const btn = document.querySelector(lesson.ui);
      if (!btn) { bubbleEl.classList.add('hidden'); return; }
      const r = btn.getBoundingClientRect();
      if (!r.width) { bubbleEl.classList.add('hidden'); return; }
      bubbleEl.classList.add('ui');
      bubbleEl.style.position = 'fixed';
      bubbleEl.style.top = `${Math.round(r.bottom + 8)}px`;
      bubbleEl.classList.remove('hidden');
      // A HUD anchor is the one case where clamping is right: the thing being pointed at is a corner
      // button, and a bubble hanging off the edge of a 380 px phone loses half its glyphs (measured
      // on the live probe, day 2). Clamped by its own measured half-width, so the picture stays whole.
      const half = bubbleEl.getBoundingClientRect().width / 2 || 40;
      const x = Math.round(r.left + r.width / 2);
      bubbleEl.style.left = `${Math.max(half + 8, Math.min(innerWidth - half - 8, x))}px`;
      return;
    }
    const anchor = (lesson.bubbleAt && lesson.bubbleAt(L)) || active.point;
    if (!anchor || !fx || typeof fx.project !== 'function') { bubbleEl.classList.add('hidden'); return; }
    bubbleEl.classList.remove('ui');
    bubbleEl.style.position = 'absolute';
    fx.project(anchor.x, anchor.y != null ? anchor.y : 1.9, anchor.z, tmp);
    // OFF SCREEN: nothing. A bubble pinned to the border is the icon soup the research report
    // measured at the edges, and the objective's single edge arrow is the whole of the answer for
    // something the player cannot see.
    bubbleEl.classList.toggle('hidden', !tmp.visible);
    if (!tmp.visible) return;
    // ON SCREEN, but close to an edge: keep the PICTURE whole. Measured on the live probe at
    // 380x670 — the first build plot sits near the left border, and a bubble centred on it lost its
    // coin cell off the side of the phone. This is containment, not the clamp above: it only ever
    // nudges a bubble whose subject is genuinely in frame, by at most its own half-width, so it
    // still reads as belonging to the thing under it.
    bubbleEl.style.left = `${tmp.sx}px`;
    bubbleEl.style.top = `${tmp.sy}px`;
    const r = bubbleEl.getBoundingClientRect();
    const halfW = r.width / 2 || 0;
    const x = Math.max(halfW + 6, Math.min(innerWidth - halfW - 6, tmp.sx));
    const y = Math.max(r.height + 6, Math.min(innerHeight - 6, tmp.sy));
    if (x !== tmp.sx) bubbleEl.style.left = `${Math.round(x)}px`;
    if (y !== tmp.sy) bubbleEl.style.top = `${Math.round(y)}px`;
  }

  function placeHand() {
    if (!dom || !active || active.phase === 'queued' || !active.lesson.hand) { if (dom) handEl.classList.add('hidden'); return; }
    const lesson = active.lesson;
    const where = lesson.handAt ? lesson.handAt(L) : null;
    handEl.classList.toggle('hold', lesson.hand === 'hold');
    if (typeof where === 'string') {
      // A tap or a ring hand only ever sits on a REAL control that is on screen right now.
      const el = document.querySelector(where);
      if (!el || el.classList.contains('hidden')) { handEl.classList.add('hidden'); return; }
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) { handEl.classList.add('hidden'); return; }
      const margin = innerWidth <= 320 ? 16 : 22;
      let x = r.right + margin, y = r.top + r.height * 0.5;
      if (x + 20 > innerWidth) x = r.left - margin;
      if (x - 20 < 0) { x = r.left + r.width * 0.5; y = r.bottom + margin; }
      handEl.style.left = `${Math.round(x)}px`;
      handEl.style.top = `${Math.round(y)}px`;
      handEl.classList.remove('hidden');
      return;
    }
    if (!where || !fx || typeof fx.project !== 'function') { handEl.classList.add('hidden'); return; }
    fx.project(where.x, where.y != null ? where.y : 1.0, where.z, tmp);
    if (!tmp.visible) { handEl.classList.add('hidden'); return; }
    handEl.style.left = `${tmp.sx}px`;
    handEl.style.top = `${tmp.sy}px`;
    handEl.classList.remove('hidden');
  }

  // Worth showing now? A HUD lesson and a guest-blocking one always are; anything else only when
  // the player can already see its subject, or has stopped and looks unsure what to do next.
  function wantsLook(lesson) {
    if (lesson.ui || lesson.blocking || stillT >= STUCK_SECONDS) return true;
    let p = null;
    try { p = lesson.focus(L); } catch (_) { p = null; }
    if (!p || !fx || typeof fx.project !== 'function') return true;
    fx.project(p.x, 1.2, p.z, tmp);
    return tmp.visible && Math.hypot(G.P.x - p.x, G.P.z - p.z) <= PAN_METERS;
  }

  const api = {
    /** Which lessons this save has already been shown. */
    seen(id) { return seen.has(id); },
    snapshot() { return [...seen].filter(id => FIRST_LOOK_IDS.includes(id)).sort(); },
    restore(raw) {
      seen.clear();
      for (const id of normalizeFirstLook(raw)) seen.add(id);
      armed.length = 0;
      retire('restore');
    },
    /**
     * Every lesson counted as already shown. This is how a headless tool puts the café into the
     * state of a player who has been running it for a fortnight (tools/quiet-field-smoke.js,
     * tools/guidance-policy-smoke.js, tools/interaction-coach-smoke.js), and it is the same door a
     * restore comes through, so there is no second "off switch" to keep in sync.
     */
    skipAll() { for (const id of FIRST_LOOK_IDS) seen.add(id); armed.length = 0; retire('skip'); },
    get activeId() { return active ? active.lesson.id : null; },
    get activePhase() { return active ? active.phase : null; },
    get armedIds() { return armed.map(a => a.lesson.id); },

    update(dt) {
      const step = Math.max(0, Number(dt) || 0);
      if (!lessonContextReady()) { hideVisuals(); publish(); return; }

      const intro = !!(G.intro && G.intro.active);
      const rush = G.dayState && G.dayState.phase === 'rush';
      const paused = !!G.userPaused;
      const modal = isModalOpen();
      const input = ctx.input;
      const moving = !!(G._force || (input && (input.active || input.pressed)));
      stillT = moving ? 0 : stillT + step;

      // ---- arm ------------------------------------------------------------------------------
      // Purchases are read off the world event the build itself emits, on the same frame; every
      // other trigger is a live state question asked once a frame. Nothing here polls a timer and
      // nothing here is wired to a specific zone id in systems/zones.js.
      for (const lesson of LESSONS) {
        if (seen.has(lesson.id)) continue;
        if (active && active.lesson === lesson) continue;
        if (armed.some(a => a.lesson === lesson)) continue;
        let ok = false;
        try { ok = !!lesson.arm(L); } catch (_) { ok = false; }
        if (!ok) continue;
        if (armed.length >= QUEUE_MAX && !lesson.patient) {
          // Three new things in one breath is not three interruptions. The overflow is marked shown
          // so it can never queue up and fire minutes later, out of context. A `patient` lesson is
          // the exception: it is queued anyway, because losing it loses the progression.
          seen.add(lesson.id);
          continue;
        }
        armed.push({ lesson, t: 0 });
      }

      // ---- the lane -------------------------------------------------------------------------
      if (active) {
        const lesson = active.lesson;
        if (active.phase === 'queued') {
          active.qt = (active.qt || 0) + step;
          if (active.qt >= QUEUED_SECONDS) beginPresent();
        }
        if (active.phase !== 'queued') {
          active.t += step;
          // The point is re-read every frame: a role lesson follows a worker that is still walking.
          const next = lesson.focus(L);
          if (next) active.point = next;
          if (active.phase === 'present' && active.t >= PRESENT_SECONDS) {
            active.phase = 'await'; active.t = 0;
            if (active.release) { const r = active.release; active.release = null; r(); }
            if (active.panned && S && typeof S.releaseEstablish === 'function') { S.releaseEstablish(); active.panned = false; }
          }
          let finished = false;
          try { finished = active.phase === 'await' && !!lesson.done(L); } catch (_) { finished = false; }
          if (finished || (active.phase === 'await' && active.t >= AWAIT_SECONDS)) retire('done');
        }
      }

      if (!active && armed.length) {
        // The first one the lane would allow, in arrival order — not simply the first in the queue.
        // During a rush that matters: a patient lesson (build, hire) sitting at the front is right
        // to wait, but it must not also hold back the one kind of lesson a rush DOES allow, the one
        // a guest is waiting on.
        const i = armed.findIndex(a => laneOpen({ intro, rush, blocking: !!a.lesson.blocking, paused, modal }) && wantsLook(a.lesson));
        if (i >= 0) {
          const head = armed.splice(i, 1)[0];
          // Its subject may have gone away while it waited (the table got wiped, the pose ended).
          let still = false;
          try { still = !!head.lesson.arm(L); } catch (_) { still = false; }
          if (still) start(head.lesson); else seen.add(head.lesson.id);
        } else {
          // The arm clock only runs while the lane could have been taken, so a lesson is never
          // spent by a long sheet, an ad or the opening minute.
          if (!intro && !paused && !modal) for (const a of armed) a.t += step;
          for (let i = armed.length - 1; i >= 0; i--) {
            if (armed[i].lesson.patient || armed[i].t < ARM_SECONDS) continue;
            seen.add(armed[i].lesson.id);
            armed.splice(i, 1);
          }
        }
      }

      publish();
      if (!active || active.phase === 'queued') { hideVisuals(); return; }
      placeBubble();
      placeHand();
    },

    destroy() {
      retire('destroy');
      if (dom) { document.removeEventListener('click', onTap, true); bubbleEl.remove(); handEl.remove(); }
    },
  };

  G.firstLook = api;
  G.firstLookActive = false;
  G.firstLookPoint = null;
  return api;
}
