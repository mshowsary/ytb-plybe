// src/game.js — binds simulation, rendering, UI, audio and YouTube platform services.
import { createWorld, refreshActive, cleanSeat } from './sim/world.js';
import { applySave } from './sim/save.js';
import { salePrice, chooseGoal, cafeLevel, goalLabel, goalProgress, goalMet } from './sim/economy.js';
import { createDay, stepDay, nextDay, phaseFrac, isWeekend, isHoliday, tipMult } from './sim/day.js';
import { ensureReputation, recordShift, reputationLevel, reputationProgress, reputationTitle, REPUTATION_TITLES } from './sim/reputation.js';
import { createCarry } from './sim/carry.js';
import { createInput } from './core/input.js';
import { buildStatic } from './render/props.js';
import { createAmbience } from './render/ambience.js';
import { createOwner } from './render/owner.js';
import { createFx } from './render/fx.js';
import { createHud } from './ui/hud.js';
import { createSheets } from './ui/sheets.js';
import { createMetaUI } from './ui/meta.js';
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

export function createGame(S, area, els, platform = null) {
  const G = {
    coins: 0,
    up: { speed: 0, carry: 0, income: 0 },
    staff: { runner: 0, cashier: 0, cleaner: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
    boosts: {},
    stats: { served: 0, lifetimeEarned: 0 },
    settings: { sfx: true },
    meta: {
      rewardedDays: {}, completedDays: 0, reputation: 0, perfectShifts: 0,
      bestServiceStreak: 0, shiftRatings: {},
    },
    serviceStreak: { count: 0, t: 0 },
    shiftBestStreak: 0,
    customers: [], staffList: [], time: 0, state: 'play',
    carry: createCarry(),
    hintsSeen: new Set(), intro: {},
    dayState: createDay(), stars: {}, goal: chooseGoal(1),
    dayStats: { served: 0, lost: 0, earned: 0 },
  };
  ensureReputation(G.meta);

  const world = createWorld(area); G.world = world;
  world.dayState = G.dayState; world.stars = G.stars;
  const scene = S.scene;
  const staticGroup = buildStatic(area); scene.add(staticGroup);
  const ambience = createAmbience(area); scene.add(ambience.group);
  G.awning = staticGroup.awning;
  let lastAwningSet = -1;

  const input = createInput(els.joy, els.joyKnob);
  const hud = createHud();
  const metaUI = createMetaUI();
  const fx = createFx(scene, S.camera, els.fx, hud.walletEl);
  const sheets = createSheets();
  const audio = createAudio();
  G.audio = audio;
  input.onFirstInput(() => audio.unlock());
  audio.setSfx(G.settings.sfx);

  function syncReputationPresentation() {
    ensureReputation(G.meta);
    const progress = reputationProgress(G.meta);
    const level = reputationLevel(G.meta);
    ambience.setPrestige(level);
    metaUI.setReputation({
      rep: G.meta.reputation,
      title: reputationTitle(G.meta),
      frac: progress.frac,
      nextTitle: REPUTATION_TITLES[level + 1] || null,
    });
  }
  syncReputationPresentation();

  const owner = createOwner(); scene.add(owner.group); G.owner = owner;
  const P = { x: 0, z: 2.5, vx: 0, vz: 0 };
  owner.group.position.set(P.x, 0, P.z); S.snap(P.x, P.z);
  G.P = P;
  G.setMove = (x, z) => { G._force = (x == null) ? null : { x, z }; };
  G.debugNextTarget = () => jobTarget(world, G);
  G.botDecide = () => {
    G.carryKey = owner.items.length ? owner.items[0].userData.product : null;
    G.carryCount = owner.items.length;
    return decide(world, G);
  };

  const price = (key, seated) => salePrice(key, G.up, G.boosts, seated, Date.now(), tipMult(G.dayState));
  const ctx = {
    area, world, scene, hud, fx, sheets, audio, input, owner, P, price, els,
    vis: new Map(),
    hints: { oven: 0, counter: 0, cash: 0, zone: 0, refillCoffee: 0, refillBowl: 0, harvest: 0, blend: 0, clean: 0 },
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
    G.time += dt;
    input.update();
    stations.update(dt); zones.update(dt); customers.update(dt); staff.update(dt);
    intro.update(dt);
    ambience.update(dt);
    visuals.update(dt); objective.update(dt);
    fx.update(dt); hud.update();

    // Service streak is a mastery signal only: satisfying feedback without inflating the economy.
    G.serviceStreak.t = Math.max(0, G.serviceStreak.t - dt);
    for (const e of world.events) {
      if (e.type === 'pay') {
        G.dayStats.served++; G.dayStats.earned += e.amount;
        G.serviceStreak.count = G.serviceStreak.t > 0 ? G.serviceStreak.count + 1 : 1;
        G.serviceStreak.t = 7;
        G.shiftBestStreak = Math.max(G.shiftBestStreak, G.serviceStreak.count);
        if (G.serviceStreak.count === 5 || (G.serviceStreak.count >= 10 && G.serviceStreak.count % 10 === 0)) {
          hud.banner(`${G.serviceStreak.count}x SERVICE STREAK`, 1200);
          audio.play('chime');
        }
      } else if (e.type === 'lost') {
        G.dayStats.lost++;
        G.serviceStreak.count = 0; G.serviceStreak.t = 0;
      }
    }
    metaUI.setStreak(G.serviceStreak.count, G.serviceStreak.t);

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
    const setIdx = Math.min(2, Math.floor(cafeLevel(G) / 5));
    if (setIdx !== lastAwningSet) {
      lastAwningSet = setIdx;
      G.awning && G.awning.setSet(setIdx);
    }

    world.events.length = 0;
  };

  function openDaySummary() {
    for (const st of world.stations.values()) if (st.type === 'seat' && st.dirty) cleanSeat(world, st.id);

    const completedDay = G.dayState.day;
    G.meta.completedDays = Math.max(G.meta.completedDays | 0, completedDay);
    const goal = G.goal;
    const met = goalMet(goal, G.dayStats);
    if (met) { G.coins += goal.reward; hud.setCoins(G.coins); }

    const remaining = world.area.zones.filter(z => !world.built.has(z.id)).sort((a, b) => a.price - b.price);
    const nextUnlock = remaining.length ? { label: remaining[0].label, price: remaining[0].price } : null;
    const tomorrow = chooseGoal(completedDay + 1);
    const outcomes = Math.max(1, G.dayStats.served + G.dayStats.lost);
    const lostRate = G.dayStats.lost / outcomes;
    const rating = met && lostRate <= 0.06 ? 3 : lostRate <= 0.14 ? 2 : 1;

    const repResult = recordShift(G.meta, completedDay, rating, G.shiftBestStreak);
    const repProgress = reputationProgress(G.meta);
    const repLevel = reputationLevel(G.meta);
    syncReputationPresentation();

    const model = {
      day: completedDay,
      earnings: G.dayStats.earned,
      served: G.dayStats.served,
      lost: G.dayStats.lost,
      cafeLevel: cafeLevel(G),
      goalText: goalLabel(goal), goalMet: met, goalReward: goal.reward,
      tomorrowText: goalLabel(tomorrow), tomorrowReward: tomorrow.reward,
      nextUnlock,
    };
    sheets.open('summary', model, { continue: continueDay });

    const rewardAmount = met ? goal.reward : Math.max(25, Math.min(250, Math.round(G.dayStats.earned * 0.15)));
    const rewardClaimed = !!G.meta.rewardedDays[completedDay];
    const rewardVisible = !!platform && (platform.rewardedAvailable || !platform.inPlayables);

    metaUI.decorateSummary({
      rating,
      reputation: {
        awarded: repResult.awarded,
        levelUp: repResult.levelUp,
        title: reputationTitle(G.meta),
        nextTitle: REPUTATION_TITLES[repLevel + 1] || null,
        current: repProgress.current,
        needed: repProgress.needed,
        frac: repProgress.frac,
      },
      rewardOffer: rewardVisible ? {
        amount: rewardAmount,
        claimed: rewardClaimed,
        liveAd: !!platform.rewardedAvailable,
        label: met ? 'DOUBLE GOAL REWARD' : 'BONUS TIP JAR',
        onClaim: async () => {
          if (G.meta.rewardedDays[completedDay]) return true;
          const ok = await platform.requestRewardedAd('pet-cafe-day-bonus-coins');
          if (!ok) { metaUI.toast('Reward not completed'); return false; }
          G.meta.rewardedDays[completedDay] = 1;
          G.coins += rewardAmount;
          hud.setCoins(G.coins); hud.bump(); audio.play('chime');
          metaUI.toast(`Bonus +${rewardAmount.toLocaleString('en-US')}`);
          platform.save(G.snapshot());
          return true;
        },
      } : null,
    });

    if (platform) platform.save(G.snapshot());
  }

  async function continueDay() {
    const completedDay = G.dayState.day;
    metaUI.lockSummary(false);
    sheets.close();

    // Day 3 is ~12 minutes into a normal session. Only natural day breaks can request interstitials.
    if (platform && completedDay >= 3 && completedDay % 3 === 0) {
      await platform.requestInterstitialAd();
    }

    nextDay(G.dayState);
    G.dayStats = { served: 0, lost: 0, earned: 0 };
    G.serviceStreak = { count: 0, t: 0 };
    G.shiftBestStreak = 0;
    G.goal = chooseGoal(G.dayState.day);
    const d = G.dayState.day;
    if (isWeekend(d) && isHoliday(d)) {
      hud.banner('WEEKEND'); setTimeout(() => hud.banner('HOLIDAY'), 2700);
    } else if (isWeekend(d)) hud.banner('WEEKEND');
    else if (isHoliday(d)) hud.banner('HOLIDAY');
    if (platform) platform.save(G.snapshot());
  }

  G.snapshot = () => ({
    v: 3,
    coins: G.coins,
    lifetimeEarned: G.stats.lifetimeEarned | 0,
    builds: { a1: Array.from(world.built) },
    partial: { ...world.partial },
    upgrades: { ...G.up },
    staff: { ...G.staff },
    stats: { ...G.stats },
    settings: { ...G.settings },
    staffLevels: {
      runner: { ...G.staffLevels.runner },
      cashier: { ...G.staffLevels.cashier },
      cleaner: { ...G.staffLevels.cleaner },
    },
    machineLevels: { ...G.machineLevels },
    intro: { ...G.intro },
    meta: {
      completedDays: G.meta.completedDays | 0,
      rewardedDays: { ...G.meta.rewardedDays },
      reputation: G.meta.reputation | 0,
      perfectShifts: G.meta.perfectShifts | 0,
      bestServiceStreak: G.meta.bestServiceStreak | 0,
      shiftRatings: { ...G.meta.shiftRatings },
    },
    dayState: { ...G.dayState },
    stars: { ...G.stars },
    goal: { ...G.goal },
    dayStats: { ...G.dayStats },
  });

  G.restore = save => {
    if (!save || typeof save !== 'object') return;
    applySave(G, save);
    audio.setSfx(G.settings.sfx);
    G.serviceStreak = { count: 0, t: 0 };
    G.shiftBestStreak = 0;
    world.dayState = G.dayState; world.stars = G.stars; lastAwningSet = -1;

    customers.teardown(); staff.teardown();
    G.customers = []; G.staffList = [];
    world.payAcc = {};

    world.built.clear();
    for (const id of (save.builds && save.builds.a1) || []) world.built.add(id);
    for (const k of Object.keys(world.partial)) delete world.partial[k];
    Object.assign(world.partial, save.partial || {});
    for (const st of world.stations.values()) st.active = !st.builtBy || world.built.has(st.builtBy);
    refreshActive(world);

    visuals.syncAll();
    zones.syncAll();
    hud.setCoins(G.coins);
    syncReputationPresentation();
  };

  return G;
}
