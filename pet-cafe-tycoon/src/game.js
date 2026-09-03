// src/game.js — binds sim ↔ render ↔ hud ↔ audio through five systems. One update(dt) per frame.
import { createWorld, refreshActive, cleanSeat } from './sim/world.js';
import { applySave } from './sim/save.js';
import { salePrice, chooseGoal, cafeLevel, goalLabel, goalProgress, goalMet } from './sim/economy.js';
import { createDay, stepDay, nextDay, phaseFrac, isWeekend, isHoliday, tipMult } from './sim/day.js';
import { createCarry } from './sim/carry.js';
import { createInput } from './core/input.js';
import { buildStatic } from './render/props.js';
import { createOwner } from './render/owner.js';
import { createFx } from './render/fx.js';
import { createHud } from './ui/hud.js';
import { createSheets } from './ui/sheets.js';
import { createAudio } from './audio/synth.js';
import { createStations } from './systems/stations.js';
import { createZones } from './systems/zones.js';
import { createCustomers } from './systems/customers.js';
import { createStaff } from './systems/staff.js';
import { createVisuals } from './systems/visuals.js';
import { createObjective } from './systems/objective.js';
import { createIntro } from './systems/intro.js';
import { jobTarget } from './sim/jobs.js';
import { decide } from './sim/botDecide.js';

export function createGame(S, area, els) {
  const G = {
    coins: 0, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0, cleaner: 0 },
    // M3 T5: worker Speed/Carry and machine Oven/Coffee-speed/Display-capacity tiers.
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
    boosts: {}, stats: { served: 0, lifetimeEarned: 0 }, settings: { sfx: true },
    customers: [], staffList: [], time: 0, state: 'play',
    carry: createCarry(), // Task 4: the owner's sack/fruit carry state (product items stay on owner.items)
    // Loop v2 Task 2: hintsSeen (first-approach hints, one per station TYPE — systems/stations.js)
    // and intro (the scripted first-minute onboarding — systems/intro.js). intro starts empty —
    // intro.js itself treats `step === undefined` as "fresh game, start at step 0" (also covers a
    // restored save with no intro field at all, e.g. an M3 save — see sim/save.js).
    hintsSeen: new Set(), intro: {},
    // Loop v2 Task 3: the day clock (src/sim/day.js), station stars (economy.js's STAR_IDS,
    // ensureStars/buyStar), today's goal (economy.js's chooseGoal) and today's running stats
    // (served/lost/earned — reset every nextDay(), read by the summary card and the HUD goal
    // pill). world.dayState/world.stars below are the SAME objects (not copies), so day.js's
    // stepDay/nextDay and economy.js's buyStar mutate them in place and every sim function that
    // reads w.dayState/w.stars (wishFor, stepOvens/stepMachines) sees the live value immediately.
    dayState: createDay(), stars: {}, goal: chooseGoal(1), dayStats: { served: 0, lost: 0, earned: 0 },
  };
  const world = createWorld(area); G.world = world;
  world.dayState = G.dayState; world.stars = G.stars;
  const scene = S.scene;
  const staticGroup = buildStatic(area); scene.add(staticGroup);
  G.awning = staticGroup.awning; // Loop v2 Task 3: café-level awning colour set — see below
  let lastAwningSet = -1;

  const input = createInput(els.joy, els.joyKnob);
  const hud = createHud();
  const fx = createFx(scene, S.camera, els.fx, hud.walletEl);
  const sheets = createSheets();
  const audio = createAudio();
  G.audio = audio;
  input.onFirstInput(() => audio.unlock());
  audio.setSfx(G.settings.sfx);

  const owner = createOwner(); scene.add(owner.group); G.owner = owner;
  const P = { x: 0, z: 2.5, vx: 0, vz: 0 }; owner.group.position.set(P.x, 0, P.z); S.snap(P.x, P.z);
  G.P = P; // M3 T5: the objective arrow / jobTarget's "nearest to the player" reference point
  G.setMove = (x, z) => { G._force = (x == null) ? null : { x, z }; };
  // M3 T5: tools/strip.js drives the bot through window.__game.setMove toward this target.
  G.debugNextTarget = () => jobTarget(world, G);
  // M3 T6: the same competent-player priority loop tools/bot.js runs headlessly (src/sim/
  // botDecide.js), driven here against the REAL running game/world instead of a Node shadow sim.
  // Loop v2 Task 1: decide() reads G.carryKey/G.carryCount (single-product carry) — bridge them
  // from owner.items' meshes (all sharing one userData.product, since the carry only ever holds
  // one product type now) each call; G.customers/G.carry/G.P/G.time/G.coins/G.staff/G.up/
  // G.staffLevels/G.machineLevels are already the real live state.
  G.botDecide = () => {
    G.carryKey = owner.items.length ? owner.items[0].userData.product : null;
    G.carryCount = owner.items.length;
    return decide(world, G);
  };

  // Loop v2 Task 3: the day-phase/weekend tip multiplier (day.js's tipMult) rides along on every
  // sale price now — rush is 1.5x, a weekend day is a further 1.25x on top of whatever phase it is.
  const price = (key, seated) => salePrice(key, G.up, G.boosts, seated, Date.now(), tipMult(G.dayState));
  const ctx = {
    area, world, scene, hud, fx, sheets, audio, input, owner, P, price, els,
    vis: new Map(),
    // M3 T5: each interaction gets its own hint flag now (was: several Task 4 chores all reused
    // `hints.oven` as a generic "did something" signal — see systems/stations.js).
    hints: { oven: 0, counter: 0, cash: 0, zone: 0, refillCoffee: 0, refillBowl: 0, harvest: 0, blend: 0, clean: 0 },
    // Loop v2 Task 2: the first-approach hint mailbox — systems/stations.js (the only writer) sets
    // msg/t when the owner first dwells at a station type; systems/zones.js (the only hud.hint()
    // caller) reads it each frame with top priority over the existing chain/override hints.
    firstHint: { msg: null, t: 0 },
  };
  const stations = createStations(G, S, ctx);
  const zones = createZones(G, S, ctx);
  const customers = createCustomers(G, S, ctx);
  const staff = createStaff(G, S, ctx);
  const visuals = createVisuals(G, S, ctx);
  const objective = createObjective(G, S, ctx);
  const intro = createIntro(G, S, ctx);

  hud.show();
  G.update = dt => {
    G.time += dt; input.update();
    // M3 T3: stations.update (owner proximity) may set a checkout's st.serving = 'owner' this
    // frame; staff.update's stepStaff sets 'cashier' for its own target and then calls
    // stepRegisters itself (once per tick, always — see sim/staff.js) so it sees this frame's
    // final serving value, processes the queue head if it's time, then resets serving to '' for
    // the next frame.
    stations.update(dt); zones.update(dt); customers.update(dt); staff.update(dt);
    // Loop v2 Task 2: intro.update runs AFTER staff.update (whose stepStaff always calls
    // stepRegisters, the only source of 'processed' events — see world.js) so its step-2 "one
    // register sale" check sees this SAME frame's event, and BEFORE objective.update so the arrow
    // it may force is already current this frame.
    intro.update(dt);
    visuals.update(dt); objective.update(dt);
    fx.update(dt); hud.update();

    // Loop v2 Task 3: today's running stats (read off this frame's already-pushed events, before
    // the shared bus is cleared below) — 'pay' is the same event systems/customers.js already uses
    // to bump G.stats.served (a register actually paying a customer), 'lost' is every patience-run-
    // out departure (counter/register/bowl — sim/customers.js).
    for (const e of world.events) {
      if (e.type === 'pay') { G.dayStats.served++; G.dayStats.earned += e.amount; }
      else if (e.type === 'lost') { G.dayStats.lost++; }
    }
    const dayEvents = stepDay(G.dayState, dt);
    for (const e of dayEvents) {
      if (e.type === 'phase') {
        if (e.phase === 'rush') hud.banner('RUSH HOUR');
        else if (e.phase === 'closing') hud.banner('CLOSING');
      } else if (e.type === 'dayEnd') {
        openDaySummary();
      }
    }
    hud.setDay(G.dayState.day, G.dayState.phase, phaseFrac(G.dayState));
    hud.setGoal(G.goal ? `${goalLabel(G.goal)} · ${goalProgress(G.goal, G.dayStats)}/${G.goal.target}` : null);
    // Café-level awning colour set (design section 6 — every 5 total stars, up to 3 sets).
    const setIdx = Math.min(2, Math.floor(cafeLevel(G) / 5));
    if (setIdx !== lastAwningSet) { lastAwningSet = setIdx; G.awning && G.awning.setSet(setIdx); }

    world.events.length = 0;
  };

  // Loop v2 Task 3: closing's own dayEnd — auto-clean every dirty table (design section 5), settle
  // today's goal (award the reward if met), and open the summary card. The next day only actually
  // starts once CONTINUE is tapped (continueDay below) — stepDay itself freezes at dayEnd until
  // then (see sim/day.js).
  function openDaySummary() {
    for (const st of world.stations.values()) if (st.type === 'seat' && st.dirty) cleanSeat(world, st.id);
    const goal = G.goal;
    const met = goalMet(goal, G.dayStats);
    if (met) { G.coins += goal.reward; hud.setCoins(G.coins); }
    const remaining = world.area.zones.filter(z => !world.built.has(z.id)).sort((a, b) => a.price - b.price);
    const nextUnlock = remaining.length ? { label: remaining[0].label, price: remaining[0].price } : null;
    const tomorrow = chooseGoal(G.dayState.day + 1);
    const model = {
      day: G.dayState.day, earnings: G.dayStats.earned, served: G.dayStats.served, lost: G.dayStats.lost,
      cafeLevel: cafeLevel(G),
      goalText: goalLabel(goal), goalMet: met, goalReward: goal.reward,
      tomorrowText: goalLabel(tomorrow), tomorrowReward: tomorrow.reward,
      nextUnlock,
    };
    sheets.open('summary', model, { continue: continueDay });
  }
  function continueDay() {
    sheets.close();
    nextDay(G.dayState);
    G.dayStats = { served: 0, lost: 0, earned: 0 };
    G.goal = chooseGoal(G.dayState.day);
    const d = G.dayState.day;
    if (isWeekend(d) && isHoliday(d)) { hud.banner('WEEKEND'); setTimeout(() => hud.banner('HOLIDAY'), 2700); }
    else if (isWeekend(d)) hud.banner('WEEKEND');
    else if (isHoliday(d)) hud.banner('HOLIDAY');
  }

  G.snapshot = () => ({
    v: 1, coins: G.coins, lifetimeEarned: G.stats.lifetimeEarned | 0,
    builds: { a1: Array.from(world.built) }, partial: { ...world.partial },
    upgrades: { ...G.up }, staff: { ...G.staff }, stats: { ...G.stats }, settings: { ...G.settings },
    // M3 T5 fix round 1: worker Speed/Carry and machine Oven/Coffee-speed/Display-capacity tiers —
    // without these a save/reload silently reset every purchased level back to zero.
    staffLevels: { runner: { ...G.staffLevels.runner }, cashier: { ...G.staffLevels.cashier }, cleaner: { ...G.staffLevels.cleaner } },
    machineLevels: { ...G.machineLevels },
    intro: { ...G.intro }, // Loop v2 Task 2: so a resumed save doesn't replay a finished intro
    // Loop v2 Task 3: the day clock, station stars and today's goal/running stats — a resumed save
    // picks the day/goal/stars right back up instead of silently restarting at day 1.
    dayState: { ...G.dayState }, stars: { ...G.stars }, goal: { ...G.goal }, dayStats: { ...G.dayStats },
  });
  // C2: tears everything render-side down first (customer/staff meshes, leashes), rebuilds the
  // world's built/partial/active set from the save, then brings station visuals and the HUD back
  // in sync in one pass — G.restore previously left old station meshes hidden (never re-shown)
  // and stale render records on stage after loading a save mid-game.
  G.restore = save => {
    if (!save || typeof save !== 'object') return;
    applySave(G, save);
    audio.setSfx(G.settings.sfx);
    // Loop v2 Task 3: applySave gives G fresh dayState/stars objects — re-point world's own
    // references (set once at createGame time) at them so stepDay/wishFor/stepOvens etc. keep
    // reading the restored state instead of the pre-restore one.
    world.dayState = G.dayState; world.stars = G.stars; lastAwningSet = -1;

    customers.teardown(); staff.teardown();
    G.customers = []; G.staffList = [];
    world.payAcc = {};

    world.built.clear(); for (const id of (save.builds && save.builds.a1) || []) world.built.add(id);
    for (const k of Object.keys(world.partial)) delete world.partial[k];
    Object.assign(world.partial, save.partial);
    for (const st of world.stations.values()) st.active = !st.builtBy || world.built.has(st.builtBy);
    refreshActive(world);

    visuals.syncAll();
    zones.syncAll();
    hud.setCoins(G.coins);
    // staff renders respawn automatically: staff.update() spawns any runner/cashier still short
    // of G.staff's counts on its very next tick, the same lazy-spawn path used at boot.
  };
  return G;
}
