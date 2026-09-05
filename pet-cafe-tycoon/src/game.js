// src/game.js — binds simulation, rendering, UI, audio and YouTube platform services.
import { createWorld, refreshActive, cleanSeat } from './sim/world.js';
import { applySave } from './sim/save.js';
import { salePrice, cafeLevel } from './sim/economy.js';
import { reliefClaimKey } from './sim/relief.js';
import { ensurePartyOrders, clonePartyOrders, partyOrderProgress } from './sim/partyOrders.js';
import { createDay, stepDay, nextDay, phaseFrac, isWeekend, isHoliday, tipMult } from './sim/day.js';
import { ensureReputation, reputationLevel, reputationProgress, reputationTitle, REPUTATION_TITLES } from './sim/reputation.js';
import { ensurePetBook, discoverPet, petBookProgress, allPetCards } from './sim/petBook.js';
import {
  ensureCareer, chooseCareerGoal, careerGoalLabel, careerGoalProgress,
  recordRecipeOrder, masteryMultiplier, allMasteryProgress,
  weeklyCupState, weekdayIndex, renovationState, buyRenovation,
  LEGENDARY_REPUTATION,
} from './sim/career.js';
import { settleShift, cloneSettlement } from './sim/settlement.js';
import { createCarry } from './sim/carry.js';
import { createInput } from './core/input.js';
import { buildStatic } from './render/props.js';
import { createAmbience } from './render/ambience.js';
import { createRenovationDecor } from './render/renovation.js';
import { createOwner } from './render/owner.js';
import { createFx } from './render/fx.js';
import { createHud } from './ui/hud.js';
import { createSheets } from './ui/sheets.js';
import { createMetaUI } from './ui/meta.js';
import { createCareerUI } from './ui/career.js';
import { createRenovationUI } from './ui/renovation.js';
import { createAudio } from './audio/synth.js';
import { createStations } from './systems/stations.js';
import { createZones } from './systems/zones.js';
import { createCustomers } from './systems/customers.js';
import { createStaff } from './systems/staff.js';
import { createVisuals } from './systems/visuals.js';
import { createRegisterCash } from './systems/registerCash.js';
import { createEconomyExperience } from './systems/economyExperience.js';
import { createPartyOrders } from './systems/partyOrders.js';
import { createObjective } from './systems/objective.js';
import { createIntro } from './systems/intro.js';
import { jobTarget } from './sim/jobs.js';
import { decide } from './sim/botDecide.js';

const freshDayStats = () => ({ served: 0, lost: 0, earned: 0, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 0 });

export function createGame(S, area, els, platform = null) {
  const G = {
    coins: 0,
    up: { speed: 0, carry: 0, income: 0 },
    staff: { runner: 0, cashier: 0, cleaner: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
    boosts: {},
    stats: { served: 0, lifetimeEarned: 0, serviceFees: 0, wasteFees: 0, rewardedReliefCoins: 0, partyOrderCoins: 0 },
    settings: { sfx: true, music: true },
    meta: {
      rewardedDays: {}, completedDays: 0, reputation: 0, perfectShifts: 0,
      bestServiceStreak: 0, shiftRatings: {}, petBook: {}, petDiscoveries: 0, settlement: null, career: {}, partyOrders: {},
    },
    serviceStreak: { count: 0, t: 0 }, shiftBestStreak: 0,
    customers: [], staffList: [], time: 0, state: 'play', carry: createCarry(),
    hintsSeen: new Set(), intro: {}, dayState: createDay(), stars: {}, goal: null, dayStats: freshDayStats(),
  };
  ensureReputation(G.meta); ensurePetBook(G.meta); ensureCareer(G.meta); ensurePartyOrders(G.meta);
  G.goal = chooseCareerGoal(1, G.meta);

  const world = createWorld(area); G.world = world; world.dayState = G.dayState; world.stars = G.stars;
  const scene = S.scene;
  const staticGroup = buildStatic(area); scene.add(staticGroup);
  const ambience = createAmbience(area); scene.add(ambience.group);
  const renovationDecor = createRenovationDecor(area); scene.add(renovationDecor.group);
  G.awning = staticGroup.awning; let lastAwningSet = -1;

  const input = createInput(els.joy, els.joyKnob); const hud = createHud(); const metaUI = createMetaUI();
  const careerUI = createCareerUI(); const renovationUI = createRenovationUI();
  const fx = createFx(scene, S.camera, els.fx, hud.walletEl); const sheets = createSheets(); const audio = createAudio();
  G.audio = audio; input.onFirstInput(() => audio.unlock()); audio.setSfx(G.settings.sfx); audio.setMusic(G.settings.music);

  function buyNextRenovation() {
    const result = buyRenovation(G.meta, G.coins);
    if (!result.ok) {
      if (result.reason === 'coins') metaUI.toast('Save more coins for this renovation');
      else if (result.reason === 'reputation') metaUI.toast(`Reach ${result.requiredRep} reputation first`);
      syncCareerPresentation(); return false;
    }
    G.coins = result.coins; hud.setCoins(G.coins); hud.bump(); audio.play('chime'); renovationDecor.setLevel(result.level);
    hud.banner(`${result.renovation.name.toUpperCase()} RENOVATION`, 2200); syncCareerPresentation();
    if (platform && G.snapshot) platform.save(G.snapshot()); return true;
  }
  function syncReputationPresentation() {
    ensureReputation(G.meta); const progress = reputationProgress(G.meta); const level = reputationLevel(G.meta); ambience.setPrestige(level);
    metaUI.setReputation({ rep: G.meta.reputation, title: reputationTitle(G.meta), frac: progress.frac, nextTitle: REPUTATION_TITLES[level + 1] || null });
  }
  function syncPetBookPresentation() {
    ensurePetBook(G.meta); const progress = petBookProgress(G.meta); metaUI.setPetBook({ ...progress, cards: allPetCards(G.meta) });
  }
  function syncCareerPresentation() {
    const career = ensureCareer(G.meta), rep = reputationProgress(G.meta), level = reputationLevel(G.meta), week = weeklyCupState(G.meta, G.dayState.day);
    careerUI.setModel({
      day: G.dayState.day,
      rank: { rep: G.meta.reputation | 0, title: reputationTitle(G.meta), nextTitle: REPUTATION_TITLES[level + 1] || null, current: rep.current, needed: rep.needed, frac: rep.frac },
      week: { ...week, currentIndex: weekdayIndex(G.dayState.day) }, trophies: { ...career.trophies }, masteries: allMasteryProgress(G.meta),
      legendaryTarget: LEGENDARY_REPUTATION, legendary: (G.meta.reputation | 0) >= LEGENDARY_REPUTATION,
    });
    renovationDecor.setLevel(career.renovationLevel | 0); renovationUI.setModel({ ...renovationState(G.meta, G.coins), coins: G.coins, onBuy: buyNextRenovation });
  }
  syncReputationPresentation(); syncPetBookPresentation(); syncCareerPresentation();

  const owner = createOwner(); scene.add(owner.group); G.owner = owner;
  const P = { x: 0, z: 2.5, vx: 0, vz: 0 }; owner.group.position.set(P.x, 0, P.z); S.snap(P.x, P.z); G.P = P;
  G.setMove = (x, z) => { G._force = (x == null) ? null : { x, z }; }; G.debugNextTarget = () => jobTarget(world, G);
  G.botDecide = () => { G.carryKey = owner.items.length ? owner.items[0].userData.product : null; G.carryCount = owner.items.length; return decide(world, G); };

  const price = (key, seated) => Math.round(salePrice(key, G.up, G.boosts, seated, Date.now(), tipMult(G.dayState)) * masteryMultiplier(G.meta, key));
  const ctx = { area, world, scene, hud, fx, sheets, audio, input, owner, P, price, els, vis: new Map(), hints: { oven: 0, counter: 0, cash: 0, zone: 0, refillCoffee: 0, refillBowl: 0, harvest: 0, blend: 0, clean: 0 }, firstHint: { msg: null, t: 0 } };
  ctx.discoverPet = (species, variant) => {
    const discovery = discoverPet(G.meta, species, variant); if (!discovery.isNew) return;
    syncPetBookPresentation(); metaUI.announcePet(discovery); audio.play('ding'); if (platform && G.snapshot) platform.save(G.snapshot());
  };

  const stations = createStations(G, S, ctx); const zones = createZones(G, S, ctx); const customers = createCustomers(G, S, ctx); const staff = createStaff(G, S, ctx);
  const visuals = createVisuals(G, S, ctx); const registerCash = createRegisterCash(G, S, ctx); const economyExperience = createEconomyExperience(G, S, ctx, platform);
  const partyOrders = createPartyOrders(G, S, ctx, platform); const objective = createObjective(G, S, ctx); const intro = createIntro(G, S, ctx);

  let careerRefreshT = 0, dayTransitionPromise = null; hud.show();
  G.update = dt => {
    G.time += dt; input.update(); stations.update(dt); zones.update(dt); customers.update(dt); staff.update(dt); intro.update(dt);
    ambience.update(dt); renovationDecor.update(dt); visuals.update(dt); registerCash.update(dt); objective.update(dt); economyExperience.update(dt); partyOrders.update(dt); fx.update(dt); hud.update();

    G.serviceStreak.t = Math.max(0, G.serviceStreak.t - dt);
    for (const e of world.events) {
      if (e.type === 'pay') {
        G.dayStats.served++; G.dayStats.earned += e.amount; G.serviceStreak.count = G.serviceStreak.t > 0 ? G.serviceStreak.count + 1 : 1; G.serviceStreak.t = 7;
        G.shiftBestStreak = Math.max(G.shiftBestStreak, G.serviceStreak.count); G.dayStats.bestStreak = G.shiftBestStreak;
        const paidCustomer = G.customers.find(c => c.id === e.id); const order = paidCustomer && paidCustomer.order || [];
        partyOrders.onSale(order);
        const levelUps = recordRecipeOrder(G.meta, order);
        for (const up of levelUps) { hud.banner(`${up.label.toUpperCase()} MASTERY ${up.level} · +${up.bonus}% VALUE`, 1900); audio.play('chime'); syncCareerPresentation(); }
        if (G.serviceStreak.count === 5 || (G.serviceStreak.count >= 10 && G.serviceStreak.count % 10 === 0)) { hud.banner(`${G.serviceStreak.count}x SERVICE STREAK`, 1200); audio.play('chime'); }
      } else if (e.type === 'lost') { G.dayStats.lost++; G.serviceStreak.count = 0; G.serviceStreak.t = 0; }
    }
    metaUI.setStreak(G.serviceStreak.count, G.serviceStreak.t);
    careerRefreshT -= dt; if (careerUI.isOpen && careerRefreshT <= 0) { careerRefreshT = 1; syncCareerPresentation(); }

    const dayEvents = stepDay(G.dayState, dt);
    for (const e of dayEvents) {
      if (e.type === 'phase') { if (e.phase === 'rush') hud.banner('RUSH HOUR'); else if (e.phase === 'closing') hud.banner('CLOSING'); }
      else if (e.type === 'dayEnd') openDaySummary();
    }
    hud.setDay(G.dayState.day, G.dayState.phase, phaseFrac(G.dayState)); hud.setGoal(G.goal ? `${careerGoalLabel(G.goal)} · ${careerGoalProgress(G.goal, G.dayStats)}/${G.goal.target}` : null);
    const setIdx = Math.min(2, Math.floor(cafeLevel(G) / 5)); if (setIdx !== lastAwningSet) { lastAwningSet = setIdx; G.awning && G.awning.setSet(setIdx); }
    world.events.length = 0;
  };

  function openDaySummary() {
    for (const st of world.stations.values()) if (st.type === 'seat' && st.dirty) cleanSeat(world, st.id);
    const { settlement, fresh } = settleShift(G);
    const completedDay = settlement.day, goal = settlement.goal, goalProgressNow = goal.progress, met = goal.met;
    const rating = settlement.rating, repResult = settlement.reputation, cupAward = settlement.cup;
    hud.setCoins(G.coins);
    if (fresh && cupAward && cupAward.awarded) { hud.bump(); audio.play('chime'); }
    const repProgress = reputationProgress(G.meta), repLevel = reputationLevel(G.meta); syncReputationPresentation(); syncCareerPresentation();
    const remaining = world.area.zones.filter(z => !world.built.has(z.id)).sort((a, b) => a.price - b.price); const nextUnlock = remaining.length ? { label: remaining[0].label, price: remaining[0].price } : null;
    const tomorrow = chooseCareerGoal(completedDay + 1, G.meta);
    sheets.open('summary', {
      day: completedDay, earnings: settlement.stats.earned, served: settlement.stats.served, lost: settlement.stats.lost,
      serviceFees: settlement.stats.serviceFees, serviceMisses: settlement.stats.serviceMisses, wasteFees: settlement.stats.wasteFees, cafeLevel: cafeLevel(G),
      goalText: careerGoalLabel(goal), goalMet: met, goalReward: goal.reward, tomorrowText: careerGoalLabel(tomorrow), tomorrowReward: tomorrow.reward, nextUnlock,
    }, {
      continue: () => finishDayTransition('continue'),
      dismiss: source => finishDayTransition(source),
    });

    const rewardAmount = met ? goal.reward : Math.max(25, Math.min(250, Math.round(settlement.stats.earned * 0.15)));
    const rewardClaimed = !!G.meta.rewardedDays[completedDay], reliefClaimed = !!G.meta.rewardedDays[reliefClaimKey(completedDay)];
    const rewardVisible = !reliefClaimed && !!platform && (platform.rewardedAvailable || !platform.inPlayables);
    metaUI.decorateSummary({
      rating,
      reputation: { awarded: repResult.awarded, levelUp: repResult.levelUp, title: reputationTitle(G.meta), nextTitle: REPUTATION_TITLES[repLevel + 1] || null, current: repProgress.current, needed: repProgress.needed, frac: repProgress.frac },
      rewardOffer: rewardVisible ? {
        amount: rewardAmount, claimed: rewardClaimed, liveAd: !!platform.rewardedAvailable, label: met ? 'DOUBLE CONTRACT REWARD' : 'BONUS TIP JAR',
        onClaim: async () => {
          if (G.meta.rewardedDays[completedDay]) return true; const ok = await platform.requestRewardedAd('pet-cafe-day-bonus-coins');
          if (!ok) { metaUI.toast('Reward not completed'); return false; }
          G.meta.rewardedDays[completedDay] = 1; G.coins += rewardAmount; hud.setCoins(G.coins); hud.bump(); audio.play('chime'); syncCareerPresentation();
          metaUI.toast(`Bonus +${rewardAmount.toLocaleString('en-US')}`); platform.save(G.snapshot()); return true;
        },
      } : null,
    });

    const career = ensureCareer(G.meta), masteries = allMasteryProgress(G.meta), closestMastery = masteries.filter(m => !m.max).sort((a, b) => b.frac - a.frac)[0] || null;
    const reno = renovationState(G.meta, G.coins), party = ensurePartyOrders(G.meta).active, pp = party ? partyOrderProgress(party) : null;
    const nextChase = nextUnlock
      ? `Build ${nextUnlock.label} · ${nextUnlock.price.toLocaleString('en-US')} coins`
      : party && pp && pp.count < pp.target
        ? `Party Order · ${pp.count}/${pp.target} · +${party.reward} coins`
        : reno.next
          ? `${reno.next.name} renovation · ${reno.repReady ? `${reno.next.cost.toLocaleString('en-US')} coins` : `reach ${reno.next.rep} REP`}`
          : repProgress.next != null
            ? `Reach ${REPUTATION_TITLES[repLevel + 1]} · ${repProgress.needed - repProgress.current} REP to go`
            : closestMastery ? `Master ${closestMastery.label} · ${closestMastery.current}/${closestMastery.needed}` : 'Defend Gold Cups and beat your weekly records';
    careerUI.decorateSummary({
      week: weeklyCupState(G.meta, completedDay), cupAward, contractStreak: career.contractStreak | 0, lost: settlement.stats.lost, nextUnlock,
      contract: { kind: goal.kind, label: careerGoalLabel(goal), target: goal.target, progress: goalProgressNow, previous: goal.previous, rival: !!goal.rival, met, reward: goal.reward }, nextChase,
    });
    if (platform) platform.save(G.snapshot());
  }

  function finishDayTransition(source = 'continue') {
    if (dayTransitionPromise) return dayTransitionPromise;
    if (!G.dayState._ended) return Promise.resolve(false);
    const completedDay = G.dayState.day;
    const run = (async () => {
      // Close presentation immediately so rapid input cannot create a second visible exit path. The
      // promise guard below remains authoritative while an interstitial is resolving.
      metaUI.lockSummary(false); sheets.close();
      if (platform && completedDay >= 3 && completedDay % 3 === 0) {
        try { await platform.requestInterstitialAd(); }
        catch (err) { console.warn('Pet Café interstitial failed during day transition; continuing without it.', err); }
      }
      // A single guarded transition owns the terminal -> next-morning mutation. If external code
      // already changed the day while an ad was up, do not advance again.
      if (G.dayState.day !== completedDay || !G.dayState._ended) return false;
      nextDay(G.dayState); G.dayStats = freshDayStats(); G.serviceStreak = { count: 0, t: 0 }; G.shiftBestStreak = 0; G.goal = chooseCareerGoal(G.dayState.day, G.meta);
      syncCareerPresentation(); partyOrders.sync(false);
      const d = G.dayState.day;
      if (weekdayIndex(d) === 6) hud.banner('WEEKLY CUP SUNDAY');
      else if (isWeekend(d) && isHoliday(d)) { hud.banner('WEEKEND'); setTimeout(() => hud.banner('HOLIDAY'), 2700); }
      else if (isWeekend(d)) hud.banner('WEEKEND'); else if (isHoliday(d)) hud.banner('HOLIDAY');
      if (platform) platform.save(G.snapshot());
      return true;
    })();
    dayTransitionPromise = run;
    run.then(
      () => { if (dayTransitionPromise === run) dayTransitionPromise = null; },
      () => { if (dayTransitionPromise === run) dayTransitionPromise = null; },
    );
    return run;
  }

  G.snapshot = () => ({
    v: 4, coins: G.coins, lifetimeEarned: G.stats.lifetimeEarned | 0,
    builds: { a1: Array.from(world.built) }, partial: { ...world.partial }, upgrades: { ...G.up }, staff: { ...G.staff }, stats: { ...G.stats }, settings: { ...G.settings },
    staffLevels: { runner: { ...G.staffLevels.runner }, cashier: { ...G.staffLevels.cashier }, cleaner: { ...G.staffLevels.cleaner } }, machineLevels: { ...G.machineLevels }, intro: { ...G.intro },
    meta: {
      completedDays: G.meta.completedDays | 0, rewardedDays: { ...G.meta.rewardedDays }, reputation: G.meta.reputation | 0, perfectShifts: G.meta.perfectShifts | 0,
      bestServiceStreak: G.meta.bestServiceStreak | 0, shiftRatings: { ...G.meta.shiftRatings }, petBook: { ...G.meta.petBook }, petDiscoveries: G.meta.petDiscoveries | 0,
      settlement: cloneSettlement(G.meta.settlement),
      career: {
        history: Object.fromEntries(Object.entries(G.meta.career.history || {}).map(([k, v]) => [k, { ...v }])), weeklyCups: Object.fromEntries(Object.entries(G.meta.career.weeklyCups || {}).map(([k, v]) => [k, { ...v }])),
        trophies: { ...G.meta.career.trophies }, recipeSales: { ...G.meta.career.recipeSales }, contractStreak: G.meta.career.contractStreak | 0,
        bestContractStreak: G.meta.career.bestContractStreak | 0, bestWeekPoints: G.meta.career.bestWeekPoints | 0, renovationLevel: G.meta.career.renovationLevel | 0,
      },
      partyOrders: clonePartyOrders(G.meta),
    },
    dayState: { ...G.dayState }, stars: { ...G.stars }, goal: { ...G.goal }, dayStats: { ...G.dayStats },
  });

  G.restore = save => {
    if (!save || typeof save !== 'object') return; applySave(G, save);
    if (typeof G.settings.music !== 'boolean') G.settings.music = true; if (typeof G.settings.sfx !== 'boolean') G.settings.sfx = true;
    audio.setSfx(G.settings.sfx); audio.setMusic(G.settings.music); G.serviceStreak = { count: 0, t: 0 }; G.shiftBestStreak = G.dayStats.bestStreak | 0;
    ensureCareer(G.meta); ensurePartyOrders(G.meta); G.goal = chooseCareerGoal(G.dayState.day, G.meta); world.dayState = G.dayState; world.stars = G.stars; lastAwningSet = -1;
    customers.teardown(); staff.teardown(); G.customers = []; G.staffList = []; world.payAcc = {}; world.built.clear();
    for (const id of (save.builds && save.builds.a1) || []) world.built.add(id);
    for (const k of Object.keys(world.partial)) delete world.partial[k]; Object.assign(world.partial, save.partial || {});
    for (const st of world.stations.values()) st.active = !st.builtBy || world.built.has(st.builtBy); refreshActive(world);
    visuals.syncAll(); registerCash.syncAll(); zones.syncAll(); hud.setCoins(G.coins); syncReputationPresentation(); syncPetBookPresentation(); syncCareerPresentation(); partyOrders.sync(true);
    // A terminal save is already settled. Reopen that committed report as presentation only; the
    // settlement transaction itself is idempotent and cannot award coins/reputation/cups twice.
    if (G.dayState._ended) openDaySummary();
  };

  return G;
}