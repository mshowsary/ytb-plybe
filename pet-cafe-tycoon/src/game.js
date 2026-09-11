import { normalizeServicePolicy, prepareServicePolicy, recordOrdinaryServiceShift } from './sim/servicePolicy.js';
import { applySeatMiss } from './sim/serviceQuality.js';
import { normalizeSocials } from './sim/petSocials.js';
import { createPetSocials } from './systems/petSocials.js';
import { cafeCompletion } from './sim/completion.js';
import { summaryClaimedForShift, inShiftClaimedForShift, markRewardedClaim, interstitialDueAfterShift } from './sim/adPacing.js';
import { specialForDaySeasoned, saleMatchesTheme, specialProgress, specialReward, goldenHourForDay, createGoldenHourState, stepGoldenHour, goldenHourMult } from './sim/specialDays.js';
import { seasonForDay, deriveSeasonMeta, seasonRolledOver } from './sim/seasons.js';
import { ACCESSORIES, accessoryUnlocked } from '../data/accessories.js';

// Every special-day roll goes through the season, so a festival day lands where the season says it
// does. One helper rather than three call sites repeating the same three arguments.
const specialFor = day => {
  const s = seasonForDay(day);
  return specialForDaySeasoned(day, s.id, s.dayStart);
};
import { normalizeCalendar } from './sim/rewards.js';
import { familyOf, salePrice, cafeLevel, STAFF } from './sim/economy.js';
import { franchiseIncomeMultiplier } from './sim/franchise.js';
import { beginActorStep, endActorStep } from './sim/actorRoster.js';
// src/game.js — binds simulation, rendering, UI, audio and YouTube platform services.
import { createWorld, refreshActive, cleanSeat } from './sim/world.js';
import { applySave } from './sim/save.js';
import { snapshotStationState, restoreStationState } from './sim/stationState.js';
import { snapshotOwnerState, restoreOwnerState } from './sim/ownerState.js';
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
import { createMaterialCheckpoint } from './sim/checkpoint.js';
import { createInput } from './core/input.js';
import { buildStatic, itemFor } from './render/props.js';
import { buildEnvironment } from './render/environment.js';
import { createAmbience } from './render/ambience.js';
import { createRenovationDecor } from './render/renovation.js';
import { createOwner } from './render/owner.js';
import { createFx } from './render/fx.js';
import { createHud, cue } from './ui/hud.js';
// Play-field cue glyphs. Every banner and toast below draws these instead of a sentence; the
// sentence survives as the cue's aria text (see the contract at the top of src/ui/hud.js).
import {
  coinIcon, crossIcon, checkIcon, sparkleIcon, brushIcon,
  lockIcon, repIcon, cafeIcon, trophyIcon, weekendIcon, holidayIcon, giftIcon, sunIcon, moonIcon,
  streakIcon, iconFor,
} from './ui/icons.js';
import { createSheets } from './ui/sheets.js';
import { createMetaUI } from './ui/meta.js';
import { createPawSheet } from './ui/pawSheet.js';
import {
  pawRatingState, applyPawRatchet, recordPawSeatDay, pawAwningSetIndex, pawBestStar,
} from './sim/pawRating.js';
import { createCareerUI } from './ui/career.js';
import { createRenovationUI } from './ui/renovation.js';
import { createAudio } from './audio/synth.js';
import { createStations } from './systems/stations.js';
import { createPhotoStudio } from './systems/photo.js';
import { createSpaBridge } from './systems/spa.js';
import { addFollowers, followersForDiscovery } from './sim/followers.js';
import { renderPetPortrait } from './render/portrait.js';
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

const freshDayStats = () => ({ served: 0, lost: 0, earned: 0, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 0, specialServed: 0 });

export function createGame(S, area, els, platform = null) {
  const G = {
    coins: 0,
    up: { speed: 0, carry: 0, income: 0 },
    // Every role from STAFF, not a literal: the save boundary fills every key on restore, so a
    // fresh game that started with three of five roles could not round-trip a snapshot unchanged
    // (the task25 cert caught it when the Photographer landed).
    staff: Object.fromEntries(Object.keys(STAFF).map(k => [k, 0])),
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
    boosts: {},
    stats: { served: 0, lifetimeEarned: 0, serviceFees: 0, wasteFees: 0, rewardedReliefCoins: 0, partyOrderCoins: 0 },
    settings: { sfx: true, music: true, reducedMotion: false },
    meta: {
      rewardedDays: {}, completedDays: 0, reputation: 0, perfectShifts: 0,
      bestServiceStreak: 0, shiftRatings: {}, petBook: {}, petDiscoveries: 0, settlement: null, career: {}, partyOrders: {},
      rewards: { calendar: { lastKey: null, streak: 0 } },
      // The Paw Rating ratchet and the 7-day seat-miss window it needs for ★3.
      pawBest: 0, pawSeatWindow: null,
      // Save v5 surfaces. Batch 0 only writes `decor`; the rest are declared now so later batches
      // (album, followers, residents, seasons, franchise) inherit a migration that already exists.
      decor: [], followers: 0, album: {}, equipped: {}, residents: [],
      goldenPaw: false, season: { index: 0, dayStart: 1 }, franchise: { level: 0, multiplier: 1 },
    },
    golden: createGoldenHourState(),
    special: specialFor(1),
    serviceStreak: { count: 0, t: 0 }, shiftBestStreak: 0,
    customers: [], staffList: [], time: 0, state: 'play', carry: createCarry(),
    hintsSeen: new Set(), intro: {}, dayState: createDay(), stars: {}, goal: null, dayStats: freshDayStats(),
  };
  ensureReputation(G.meta); ensurePetBook(G.meta); ensureCareer(G.meta); ensurePartyOrders(G.meta);
  // The summary's follower chip reports the GAIN, so it needs the reading this shift started from.
  // Taken here rather than in freshDayStats(), which has no access to meta.
  G.dayStats.followersStart = G.meta.followers | 0;
  G.goal = chooseCareerGoal(1, G.meta, G);

  let updateInProgress = false;
  const checkpoint = createMaterialCheckpoint(platform, () => G.snapshot());
  G.requestCheckpoint = reason => checkpoint.mark(reason);
  Object.defineProperty(G, 'checkpointDirty', { get: () => checkpoint.dirty });

  function saveNow(reason = 'immediate') {
    if (!platform || typeof platform.save !== 'function' || typeof G.snapshot !== 'function') return Promise.resolve(false);
    // An immediate save requested from inside G.update would observe only some systems/event
    // consumers. Defer it into the same post-update boundary instead of capturing half a frame.
    if (updateInProgress) { checkpoint.mark(reason); return Promise.resolve(true); }
    checkpoint.reset();
    try { return Promise.resolve(platform.save(G.snapshot())).catch(() => false); }
    catch (_) { return Promise.resolve(false); }
  }

  const world = createWorld(area); G.world = world; G.goal = chooseCareerGoal(1, G.meta, G); world.dayState = G.dayState; world.stars = G.stars;
  const scene = S.scene;
  const staticGroup = buildStatic(area); scene.add(staticGroup);
  // The world past the café walls. Static, merged, never interacted with.
  // The garden is seeded once and only ever RE-COLOURED afterwards — setSeason swaps vertex
  // colours and leaves the seeded layout alone, because a season change that moved the trees would
  // read as a bug rather than as weather.
  const environment = buildEnvironment(area, seasonForDay(G.dayState.day).id);
  scene.add(environment);
  // Exposed for the render-side ambience: environment.bedAnchors is where the flower beds ended up,
  // and render/butterflies.js anchors the daytime insects to them (main.js wires the two together).
  G.environment = environment;
  // Every region, by data — not the terrace by name. Two things happen per region: the reveal
  // (floor + planting, environment.setRegionBuilt) and the gate infill (props.js gates[id]),
  // which has had NO caller since Batch 1 — the fence drew as closed across an open gateway the
  // whole time and nobody noticed because the arch reads as "a gate" either way.
  const syncRegions = () => {
    for (const reg of area.regions || []) {
      const built = world.built.has(reg.builtBy);
      environment.setRegionBuilt(reg.id, built);
      const gate = staticGroup.gates && staticGroup.gates[reg.id];
      if (gate) gate.setOpen(built);
    }
  };
  syncRegions();
  const ambience = createAmbience(area); scene.add(ambience.group); G.ambience = ambience;
  const renovationDecor = createRenovationDecor(area); scene.add(renovationDecor.group);
  G.awning = staticGroup.awning; let lastAwningSet = -1;

  const input = createInput(els.joy, els.joyKnob); const hud = createHud(); const metaUI = createMetaUI();
  G.hud = hud;
  const careerUI = createCareerUI(); const renovationUI = createRenovationUI();
  const pawUI = createPawSheet();
  // Attached after createCareerUI() has finished with the HUD so the two openers cannot race for
  // the same element; see the note in ui/career.js about which control opens what.
  pawUI.attachOpener(document.querySelector('.meta-reputation'));
  // G.fx is also read by systems/rewardsSystem.js, which has been reading an undefined value.
  const fx = createFx(scene, S.camera, els.fx, hud.walletEl); G.fx = fx; const sheets = createSheets(); const audio = createAudio();
  G.audio = audio; input.onFirstInput(() => audio.unlock()); audio.setSfx(G.settings.sfx); audio.setMusic(G.settings.music);

  function buyNextRenovation() {
    const result = buyRenovation(G.meta, G.coins);
    if (!result.ok) {
      // Two different refusals, two different pictures: a crossed coin means "save more", a padlock
      // beside the reputation star means "this is gated on something coins cannot buy".
      if (result.reason === 'coins') metaUI.toast(cue([brushIcon(), coinIcon(), crossIcon()], 'Save more coins for this renovation'));
      else if (result.reason === 'reputation') metaUI.toast(cue([lockIcon(), repIcon(), result.requiredRep], `Reach ${result.requiredRep} reputation first`));
      syncCareerPresentation(); return false;
    }
    G.coins = result.coins; hud.setCoins(G.coins); hud.bump(); audio.play('chime'); renovationDecor.setLevel(result.level);
    // The roller (the room itself changed) plus the level reached. The renovation's NAME is a
    // proper noun, but it is also the one thing the Cafe Journey sheet already spells out at length,
    // so the play field shows only that a level landed.
    hud.banner(cue([sparkleIcon(), brushIcon(), result.level], `${result.renovation.name} renovation, level ${result.level}`), 2200); syncCareerPresentation();
    G.requestCheckpoint('renovation'); return true;
  }
  function syncReputationPresentation() {
    ensureReputation(G.meta); const progress = reputationProgress(G.meta); const level = reputationLevel(G.meta); ambience.setPrestige(level);
    metaUI.setReputation({ rep: G.meta.reputation, title: reputationTitle(G.meta), frac: progress.frac, nextTitle: REPUTATION_TITLES[level + 1] || null });
  }
  function syncPetBookPresentation() {
    ensurePetBook(G.meta); const progress = petBookProgress(G.meta); const cards = allPetCards(G.meta);
    metaUI.setPetBook({ ...progress, cards });
    // The Album tab reads the same card list, joined against the two v5 meta surfaces the Pet Book
    // itself does not care about: how the pet has been photographed, and what it is wearing.
    metaUI.setAlbum({
      cards: cards.map(c => ({
        ...c,
        album: (G.meta.album || {})[c.key] || null,
        equippedId: (G.meta.equipped || {})[c.key] || null,
      })),
      // The accessory shelf, with each item's gate resolved against the live follower count and
      // the CURRENT DAY. ui/meta.js previously read `item.locked` straight off the raw catalogue,
      // where no such field exists — so every accessory read as unlocked, follower tiers and
      // seasons alike.
      accessories: ACCESSORIES.map(item => ({
        ...item, locked: !accessoryUnlocked(item.id, G.meta, G.dayState.day),
      })),
      renderPortrait: (petKeyStr, poseId, accessoryId) => renderPetPortrait(S.renderer, {
        petKey: petKeyStr, poseId, accessoryId,
      }),
      onEquip: (key, accessoryId) => {
        // Replaced rather than mutated, for the same snapshot-aliasing reason systems/photo.js
        // rebuilds meta.album instead of incrementing through it.
        G.meta.equipped = { ...(G.meta.equipped || {}), [key]: accessoryId };
        syncPetBookPresentation(); saveNow('accessory-equip');
      },
    });
  }
  // The sheet paints the RATCHET (state.best), never the live derived value — see sim/pawRating.js.
  // Repainting is cheap and idempotent, so it is safe to call from anywhere the evidence moves.
  function syncPawPresentation() {
    pawUI.refresh(pawRatingState({ meta: G.meta, stats: G.stats, built: world.built, area: world.area }));
  }
  function syncCareerPresentation() {
    const career = ensureCareer(G.meta), rep = reputationProgress(G.meta), level = reputationLevel(G.meta), week = weeklyCupState(G.meta, G.dayState.day);
    careerUI.setModel({
      day: G.dayState.day, completion: cafeCompletion(G),
      rank: { rep: G.meta.reputation | 0, title: reputationTitle(G.meta), nextTitle: REPUTATION_TITLES[level + 1] || null, current: rep.current, needed: rep.needed, frac: rep.frac },
      week: { ...week, currentIndex: weekdayIndex(G.dayState.day) }, trophies: { ...career.trophies }, masteries: allMasteryProgress(G.meta),
      legendaryTarget: LEGENDARY_REPUTATION, legendary: (G.meta.reputation | 0) >= LEGENDARY_REPUTATION,
    });
    renovationDecor.setLevel(career.renovationLevel | 0); renovationUI.setModel({ ...renovationState(G.meta, G.coins), coins: G.coins, onBuy: buyNextRenovation });
  }
  syncReputationPresentation(); syncPetBookPresentation(); syncCareerPresentation(); syncPawPresentation();

  const owner = createOwner(); scene.add(owner.group); G.owner = owner;
  // Footfalls: human.js signals each time a foot plants, fx turns that into a small puff.
  owner.H.onStep = pos => fx.dust(pos.x, pos.z, 1.4);
  const P = { x: 0, z: 2.5, vx: 0, vz: 0 }; owner.group.position.set(P.x, 0, P.z); S.snap(P.x, P.z); G.P = P;
  G.setMove = (x, z) => { G._force = (x == null) ? null : { x, z }; }; G.debugNextTarget = () => jobTarget(world, G);
  G.botDecide = () => { G.carryKey = owner.items.length ? owner.items[0].userData.product : null; G.carryCount = owner.items.length; return decide(world, G); };

  const price = (key, seated) => {
    const base = salePrice(key, G.up, G.boosts, seated, Date.now(), tipMult(G.dayState), franchiseIncomeMultiplier(G.meta)) * masteryMultiplier(G.meta, key);
    const themeBonus = (G.special && saleMatchesTheme(G.special, key, familyOf)) ? G.special.tipBonus : 0;
    const gMult = goldenHourMult(G.golden);
    return Math.round(base * (1 + themeBonus) * gMult);
  };
  const ctx = { area, world, scene, hud, fx, sheets, audio, input, owner, P, price, els, vis: new Map(), hints: { oven: 0, counter: 0, cash: 0, zone: 0, refillCoffee: 0, refillBowl: 0, harvest: 0, blend: 0, clean: 0 }, firstHint: { msg: null, t: 0 } };
  ctx.syncPetBook = syncPetBookPresentation;
  // The portrait renderer needs the game's single WebGLRenderer, which only main.js's createScene
  // owns — passed as a callback so systems/photo.js never imports the render layer directly.
  ctx.renderPortrait = (petKeyStr, poseId) => renderPetPortrait(S.renderer, {
    petKey: petKeyStr, poseId, accessoryId: (G.meta.equipped || {})[petKeyStr] || null,
  });
  ctx.discoverPet = (species, variant) => {
    const discovery = discoverPet(G.meta, species, variant); if (!discovery.isNew) return;
    G.meta.followers = addFollowers(G.meta.followers, followersForDiscovery());
    syncPetBookPresentation(); syncPawPresentation(); metaUI.announcePet(discovery); audio.play('ding'); saveNow('pet-discovery');
  };

  const stations = createStations(G, S, ctx); const zones = createZones(G, S, ctx); const customers = createCustomers(G, S, ctx); const staff = createStaff(G, S, ctx);
  const photoStudio = createPhotoStudio(G, S, ctx);
  const spaBridge = createSpaBridge(G, S, ctx);
  const visuals = createVisuals(G, S, ctx); const registerCash = createRegisterCash(G, S, ctx); const economyExperience = createEconomyExperience(G, S, ctx, platform);
  G.meta.servicePolicy = normalizeServicePolicy(G.meta.servicePolicy);
  const petSocials = createPetSocials(G, S, ctx); const partyOrders = createPartyOrders(G, S, ctx, platform); const objective = createObjective(G, S, ctx); const intro = createIntro(G, S, ctx);

  // Deliberate destinations for the compact Café menu. Presentation entry points live here so the
  // menu never has to fake clicks on HUD controls that are intentionally hidden during gameplay.
  G.uiRoutes = {
    pets: { open: () => metaUI.openBook(), root: '.meta-book-root' },
    journey: { open: () => careerUI.open(), root: '.career-root' },
    paw: { open: () => pawUI.open(), root: '.paw-root' },
    party: { open: () => partyOrders.open(), root: '.party-root', available: () => partyOrders.available },
  };

  let careerRefreshT = 0, dayTransitionPromise = null; hud.show();
  G.finishActorStep = () => endActorStep(world);
  G.update = dt => {
    updateInProgress = true;
    // Batch 6: `servicePolicyActive` is kept, but the banner that used to announce it is gone and
    // so is the charge behind it (src/sim/servicePolicy.js). What the flag still does is the KIND
    // half of the rule -- a guest who has already paid waits for a table to be wiped instead of
    // walking out -- and a policy that only ever helps the player does not need announcing, let
    // alone announcing with a red minus-coin. The owner's note after playing on a phone was that
    // constant reassuring, cleaning and recovering reads as nagging rather than challenge; a
    // pink banner promising future fines was the loudest piece of that.
    G.time += dt; world.servicePolicyActive = prepareServicePolicy(G);
    petSocials.update(); input.update(); stations.update(dt); zones.update(dt); photoStudio.update(dt); spaBridge.update(dt);
    customers.prepare(dt); staff.prepare();
    const barista = G.baristaWorker?.prepare();
    beginActorStep(world, G.customers, G.staffList, barista ? [barista] : []);
    customers.update(dt); staff.update(dt); intro.update(dt);
    ambience.update(dt); renovationDecor.update(dt);
    { const night = S.daylight ? S.daylight.lights : 0; ambience.setNight(night); environment.setNight(night); environment.updateFireflies(dt); } visuals.update(dt); registerCash.update(dt); objective.update(dt); economyExperience.update(dt); partyOrders.update(dt); fx.update(dt); hud.update();

    G.serviceStreak.t = Math.max(0, G.serviceStreak.t - dt);
    for (const e of world.events) {
      if (e.type === 'pay') {
        G.dayStats.served++; G.dayStats.earned += e.amount; G.serviceStreak.count = G.serviceStreak.t > 0 ? G.serviceStreak.count + 1 : 1; G.serviceStreak.t = 7;
        G.shiftBestStreak = Math.max(G.shiftBestStreak, G.serviceStreak.count); G.dayStats.bestStreak = G.shiftBestStreak;
        const paidCustomer = G.customers.find(c => c.id === e.id); const order = paidCustomer && paidCustomer.order || [];
        if (G.special && order.some(p => saleMatchesTheme(G.special, p, familyOf))) {
          G.dayStats.specialServed = (G.dayStats.specialServed || 0) + 1;
        }
        partyOrders.onSale(order); petSocials.onSale(order);
        const levelUps = recordRecipeOrder(G.meta, order);
        // Mastery is per RECIPE, so the recipe's own icon is the subject -- the same glyph that pastry
        // wears in the wish bubble, on the chalkboard and in the display case. Star = the level
        // reached, then the plain "+n%" the number itself already explains.
        // The bonus is ONE cell, not "+ 9 %" spread across three: at banner scale the separate
        // operator read as arithmetic against the level numeral beside it ("3 + 9").
        for (const up of levelUps) { hud.banner(cue([iconFor(up.key), sparkleIcon(), up.level, `+${up.bonus}%`], `${up.label} mastery ${up.level}, plus ${up.bonus} percent value`), 1900); audio.play('chime'); syncCareerPresentation(); }
        // "5x" then the rising-bars glyph the contract pill already uses for a streak goal.
        if (G.serviceStreak.count === 5 || (G.serviceStreak.count >= 10 && G.serviceStreak.count % 10 === 0)) { hud.banner(cue([G.serviceStreak.count, '×', streakIcon()], `${G.serviceStreak.count} service streak`), 1200); audio.play('chime'); }
      } else if (e.type === 'lost') { G.dayStats.lost++; G.serviceStreak.count = 0; G.serviceStreak.t = 0; }
      else if (e.type === 'seatMissed') {
        // Program §6.2: a paid guest never got a clean table. The missed-seat stat and the
        // reputation point are durable sim state, not presentation, so they are applied here --
        // beside 'pay' and 'lost', in the one loop that owns world events -- and checkpointed the
        // way the sibling penalty path is, so a crash before the next mark cannot lose the rank.
        // systems/visuals.js sees the same event and draws the numeral, nothing more.
        applySeatMiss(G);
        G.requestCheckpoint('seat-missed');
      }
    }
    metaUI.setStreak(G.serviceStreak.count, G.serviceStreak.t);
    careerRefreshT -= dt; if (careerUI.isOpen && careerRefreshT <= 0) { careerRefreshT = 1; syncCareerPresentation(); }

    const dayEvents = stepDay(G.dayState, dt);
    for (const e of dayEvents) {
      // Exactly the glyphs the day pill is about to switch to (hud.js PHASE_ICON), so the banner
      // announces the change and the pill confirms it with the same picture.
      if (e.type === 'phase') { if (e.phase === 'rush') hud.banner(cue([sunIcon()], 'Rush hour')); else if (e.phase === 'closing') hud.banner(cue([moonIcon()], 'Closing')); }
      else if (e.type === 'dayEnd') openDaySummary();
    }
    hud.setDay(G.dayState.day, G.dayState.phase, phaseFrac(G.dayState)); hud.setContract(G.goal, G.dayStats, G.dayState.day);
    hud.setFollowers(G.meta.followers);
    // The wallet's "saving for" ring. hud.js can reach neither the zone catalogue nor the built
    // set, so both are forwarded and the target rule itself stays in hud.js.
    hud.setSavingFor(world.area.zones, world.built);
    // Pass the goal itself, not only its sentence: the pill renders a glyph plus the numeral
    // rather than "Rival · Serve 24". The text stays as the fallback for any unmapped kind.
    hud.setGoal(G.goal ? `${careerGoalLabel(G.goal)} · ${careerGoalProgress(G.goal, G.dayStats)}/${G.goal.target}` : null, G.goal || null);
    // The awning is a Paw Rating reward now (plan §3.4, one set per star), not a café-star one.
    // Deliberate consequence: a save with 10 café stars and no paw stars drops back to the coral
    // set. Keeping both rules would mean the awning no longer tells you anything in particular.
    const setIdx = pawAwningSetIndex(pawBestStar(G.meta)); if (setIdx !== lastAwningSet) { lastAwningSet = setIdx; G.awning && G.awning.setSet(setIdx); }

    // The terrace's own planting and string lights only exist once the deck is paid for, so the
    // environment has to hear about it the moment it is built — not only at load.
    if (world.events.some(e => e.type === 'built')) syncRegions();
    if (world.events.some(e => e.type === 'built') && cafeCompletion(G).roomComplete) {
      // The building itself, ticked. A trophy would have claimed a prize that is not being given.
      hud.banner(cue([sparkleIcon(), cafeIcon(), checkIcon()], 'Your cafe is built'), 2400); audio.play('chime');
      if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) fx.burst(P.x, 1.1, P.z, '#75BDA0', 18);
      syncCareerPresentation();
    }
    // Material mutations are only serialized after every system and every world/day event consumer
    // has finished for this step. Multiple marks collapse to this one immutable platform snapshot.
    world.events.length = 0;
    updateInProgress = false;
    checkpoint.flush();
  };

  // Dev-only hook (src/dev/devPanel.js, ?dev=1 outside Playables): the day-advance buttons drive the
  // exact same terminal -> next-morning transition CONTINUE uses, rather than a shortcut of their
  // own. Both closures already exist in this scope by the time any caller can reach G.dev; the
  // function-declared `openDaySummary` below is hoisted, so declaration order here does not matter.
  G.dev = { finishDayTransition, openDaySummary };

  function openDaySummary() {
    recordOrdinaryServiceShift(G);
    for (const st of world.stations.values()) if (st.type === 'seat' && st.dirty) cleanSeat(world, st.id);
    const { settlement, fresh } = settleShift(G);
    const completedDay = settlement.day, goal = settlement.goal, goalProgressNow = goal.progress, met = goal.met;
    const rating = settlement.rating, repResult = settlement.reputation, cupAward = settlement.cup;
    hud.setCoins(G.coins);
    if (fresh && cupAward && cupAward.awarded) { hud.bump(); audio.play('chime'); }
    if (G.special) {
      const sp = specialProgress(G.special, G.dayStats.specialServed || 0);
      if (sp.met) {
        const bonus = specialReward(G.special);
        G.coins += bonus;
        hud.setCoins(G.coins);
        hud.bump();
        audio.play('chime');
      }
    }
    // Advance the Paw Rating on the settled shift, in this order: the seat-miss day must be on
    // record before the ratchet reads the window, or ★3 is judged one shift stale. Both calls are
    // idempotent per day, which matters because restoring a terminal save re-runs openDaySummary.
    recordPawSeatDay(G.meta, completedDay, G.dayStats.missedSeats | 0);
    applyPawRatchet({ meta: G.meta, stats: G.stats, built: world.built, area: world.area });
    const repProgress = reputationProgress(G.meta), repLevel = reputationLevel(G.meta); syncReputationPresentation(); syncCareerPresentation(); syncPawPresentation();
    const remaining = world.area.zones.filter(z => !world.built.has(z.id)).sort((a, b) => a.price - b.price); const nextUnlock = remaining.length ? { label: remaining[0].label, price: remaining[0].price } : null;
    const tomorrow = chooseCareerGoal(completedDay + 1, structuredClone(G.meta), G);
    sheets.open('summary', {
      day: completedDay, earnings: settlement.stats.earned, served: settlement.stats.served, lost: settlement.stats.lost,
      serviceFees: settlement.stats.serviceFees, serviceMisses: settlement.stats.serviceMisses, wasteFees: settlement.stats.wasteFees, cafeLevel: cafeLevel(G),
      goalText: careerGoalLabel(goal), goalMet: met, goalReward: goal.reward, tomorrowText: careerGoalLabel(tomorrow), tomorrowReward: tomorrow.reward, nextUnlock,
    }, {
      continue: () => finishDayTransition('continue'),
      dismiss: source => finishDayTransition(source),
    });

    const rewardAmount = met ? goal.reward : Math.max(25, Math.min(250, Math.round(settlement.stats.earned * 0.15)));
    const rewardClaimed = summaryClaimedForShift(G.meta, completedDay);
    const rewardVisible = !rewardClaimed && !!platform && (platform.rewardedAvailable || !platform.inPlayables) && platform.canRequestAd?.('rewarded') !== false;
    if (rewardVisible) platform.noteAdEligible?.('rewarded', `summary:${completedDay}`);
    metaUI.decorateSummary({
      rating,
      // Batch 6: no `servicePolicy` field any more. It fed a paragraph in the shift summary that
      // explained a fine the game no longer levies (src/sim/servicePolicy.js), and explaining a
      // consequence that cannot happen is the same nagging in a quieter font. G.meta.servicePolicy
      // itself is untouched -- it is still normalised, still saved, and still drives the kind
      // waitSeat behaviour; it simply has nothing left to say to the player.
      reputation: { awarded: repResult.awarded, levelUp: repResult.levelUp, title: reputationTitle(G.meta), nextTitle: REPUTATION_TITLES[repLevel + 1] || null, current: repProgress.current, needed: repProgress.needed, frac: repProgress.frac },
      rewardOffer: rewardVisible ? {
        amount: rewardAmount, claimed: rewardClaimed, liveAd: !!platform.rewardedAvailable, label: met ? 'DOUBLE CONTRACT REWARD' : 'BONUS TIP JAR',
        onClaim: async () => {
          if (summaryClaimedForShift(G.meta, completedDay)) return false; const ok = await platform.requestRewardedAd('pet-cafe-day-bonus-coins');
          if (!ok) { metaUI.toast(cue([giftIcon(), crossIcon()], 'Reward not completed')); return false; }
          if (!markRewardedClaim(G.meta, completedDay, 'summary')) return false; G.coins += rewardAmount; hud.setCoins(G.coins); hud.bump(); audio.play('chime'); syncCareerPresentation();
          metaUI.toast(cue([coinIcon(), '+', rewardAmount], `Bonus plus ${rewardAmount.toLocaleString('en-US')} coins`)); saveNow('reward-claim'); return true;
        },
      } : null,
    });

    const career = ensureCareer(G.meta), masteries = allMasteryProgress(G.meta), closestMastery = masteries.filter(m => !m.max).sort((a, b) => b.frac - a.frac)[0] || null;
    const reno = renovationState(G.meta, G.coins), party = ensurePartyOrders(G.meta).active, pp = party ? partyOrderProgress(party) : null;
    const completion = cafeCompletion(G);
    const nextChase = completion.roomComplete ? completion.next : nextUnlock
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
    saveNow('shift-settlement');
  }

  function finishDayTransition(source = 'continue') {
    if (dayTransitionPromise) return dayTransitionPromise;
    if (!G.dayState._ended) return Promise.resolve(false);
    const completedDay = G.dayState.day;
    const run = (async () => {
      // Close presentation immediately so rapid input cannot create a second visible exit path. The
      // promise guard below remains authoritative while an interstitial is resolving.
      metaUI.lockSummary(false); sheets.close();
      if (platform && interstitialDueAfterShift(completedDay)) {
        try { if (platform.canRequestAd?.('interstitial') !== false) { platform.noteAdEligible?.('interstitial', `continue:${completedDay}`); await platform.requestInterstitialAd(); } }
        catch (err) { console.warn('Pet Café interstitial failed during day transition; continuing without it.', err); }
      }
      // A single guarded transition owns the terminal -> next-morning mutation. If external code
      // already changed the day while an ad was up, do not advance again.
      if (G.dayState.day !== completedDay || !G.dayState._ended) return false;
      nextDay(G.dayState); G.dayStats = freshDayStats(); G.dayStats.followersStart = G.meta.followers | 0; G.serviceStreak = { count: 0, t: 0 }; G.shiftBestStreak = 0; G.goal = chooseCareerGoal(G.dayState.day, G.meta, G);
      G.golden = createGoldenHourState(); G.special = specialFor(G.dayState.day);
      // One season per career week. The re-tint fires only on a true rollover, so the garden is
      // never rebuilt on an ordinary morning; meta.season is REPLACED, never mutated, because
      // G.snapshot() spreads meta exactly one level deep.
      if (seasonRolledOver(G.meta.season, G.dayState.day)) {
        G.meta.season = deriveSeasonMeta(G.dayState.day);
        environment.setSeason(seasonForDay(G.dayState.day).id);
      }
      syncCareerPresentation(); partyOrders.sync(false);
      const d = G.dayState.day;
      // Three day-flavour banners, three unmistakably different silhouettes: a trophy (the Weekly
      // Cup is judged today), a calendar with its last cells lit (weekend), a garland (holiday). A
      // recoloured calendar for all three would have made them one banner in three shades.
      if (weekdayIndex(d) === 6) hud.banner(cue([trophyIcon()], 'Weekly Cup Sunday'));
      else if (isWeekend(d) && isHoliday(d)) { hud.banner(cue([weekendIcon()], 'Weekend')); setTimeout(() => hud.banner(cue([holidayIcon()], 'Holiday')), 2700); }
      else if (isWeekend(d)) hud.banner(cue([weekendIcon()], 'Weekend')); else if (isHoliday(d)) hud.banner(cue([holidayIcon()], 'Holiday'));
      saveNow('day-transition');
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
    v: 5, coins: G.coins, lifetimeEarned: G.stats.lifetimeEarned | 0,
    builds: { a1: Array.from(world.built) }, partial: { ...world.partial }, stationState: snapshotStationState(world, G.stars),
    ownerState: snapshotOwnerState(P, G.carry, owner.items, G.up, area),
    upgrades: { ...G.up }, staff: { ...G.staff }, stats: { ...G.stats }, settings: { ...G.settings },
    staffLevels: { runner: { ...G.staffLevels.runner }, cashier: { ...G.staffLevels.cashier }, cleaner: { ...G.staffLevels.cleaner } }, machineLevels: { ...G.machineLevels }, intro: { ...G.intro },
    meta: {
      completedDays: G.meta.completedDays | 0, rewardedDays: { ...G.meta.rewardedDays }, reputation: G.meta.reputation | 0, perfectShifts: G.meta.perfectShifts | 0,
      bestServiceStreak: G.meta.bestServiceStreak | 0, shiftRatings: { ...G.meta.shiftRatings }, petBook: { ...G.meta.petBook }, petDiscoveries: G.meta.petDiscoveries | 0,
      settlement: cloneSettlement(G.meta.settlement),
      decor: [...(G.meta.decor || [])], followers: G.meta.followers | 0,
      album: { ...G.meta.album }, equipped: { ...G.meta.equipped },
      // accessoriesBought was missing from this literal since Batch 4b: every boutique purchase was
      // lost on the next save. Found by the Franchise's keep-list test, which reports any field the
      // snapshot drops.
      residents: [...(G.meta.residents || [])], accessoriesBought: [...(G.meta.accessoriesBought || [])], goldenPaw: !!G.meta.goldenPaw,
      season: { ...(G.meta.season || { index: 0, dayStart: 1 }) },
      pawBest: G.meta.pawBest | 0,
      pawSeatWindow: G.meta.pawSeatWindow
        ? { days: (G.meta.pawSeatWindow.days || []).map(r => ({ ...r })), best: G.meta.pawSeatWindow.best }
        : null,
      franchise: { ...(G.meta.franchise || { level: 0 }) },
      career: {
        currentContract: G.meta.career.currentContract ? { ...G.meta.career.currentContract, goal: { ...G.meta.career.currentContract.goal } } : null,
        history: Object.fromEntries(Object.entries(G.meta.career.history || {}).map(([k, v]) => [k, { ...v }])), weeklyCups: Object.fromEntries(Object.entries(G.meta.career.weeklyCups || {}).map(([k, v]) => [k, { ...v }])),
        trophies: { ...G.meta.career.trophies }, recipeSales: { ...G.meta.career.recipeSales }, contractStreak: G.meta.career.contractStreak | 0,
        bestContractStreak: G.meta.career.bestContractStreak | 0, bestWeekPoints: G.meta.career.bestWeekPoints | 0, renovationLevel: G.meta.career.renovationLevel | 0,
      },
      partyOrders: clonePartyOrders(G.meta),
      socials: normalizeSocials(G.meta.socials),
      servicePolicy: normalizeServicePolicy(G.meta.servicePolicy),
      rewards: {
        calendar: { ...(G.meta.rewards && G.meta.rewards.calendar ? G.meta.rewards.calendar : { lastKey: null, streak: 0 }) },
      },
    },
    dayState: { ...G.dayState }, stars: { ...G.stars }, goal: { ...G.goal }, dayStats: { ...G.dayStats },
  });

  G.restore = save => {
    checkpoint.reset();
    if (!save || typeof save !== 'object') return false;
    const canonical = applySave(G, save);
    if (!canonical) return false;
    if (typeof G.settings.music !== 'boolean') G.settings.music = true; if (typeof G.settings.sfx !== 'boolean') G.settings.sfx = true;
    if (typeof G.settings.reducedMotion !== 'boolean') G.settings.reducedMotion = false;
    audio.setSfx(G.settings.sfx); audio.setMusic(G.settings.music); G.serviceStreak = { count: 0, t: 0 }; G.shiftBestStreak = G.dayStats.bestStreak | 0;
    ensureCareer(G.meta); ensurePartyOrders(G.meta); world.dayState = G.dayState; world.stars = G.stars; lastAwningSet = -1;
    G.golden = createGoldenHourState();
    G.special = specialFor(G.dayState.day);
    // A restored save re-enters mid-season: paint it, no rollover animation.
    G.meta.season = deriveSeasonMeta(G.dayState.day);
    environment.setSeason(seasonForDay(G.dayState.day).id);
    if (!G.meta.rewards) G.meta.rewards = { calendar: { lastKey: null, streak: 0 } };
    else G.meta.rewards.calendar = normalizeCalendar(G.meta.rewards.calendar);
    customers.teardown(); staff.teardown(); G.customers = []; G.staffList = []; world.payAcc = {}; world.built.clear();
    for (const id of (canonical.builds && canonical.builds.a1) || []) world.built.add(id);
    for (const k of Object.keys(world.partial)) delete world.partial[k]; Object.assign(world.partial, canonical.partial || {});
    for (const st of world.stations.values()) st.active = !st.builtBy || world.built.has(st.builtBy);
    refreshActive(world);
    G.goal = G.goal?.rival ? G.goal : chooseCareerGoal(G.dayState.day, G.meta, G);
    if (!restoreStationState(world, canonical.stationState, G.stars)) return false;
    if (!restoreOwnerState(P, G.carry, owner, canonical.ownerState, area, G.up, itemFor, world)) return false;
    owner.group.position.set(P.x, 0, P.z); owner.group.rotation.y = P.rot || 0; S.snap(P.x, P.z); G._force = null; G.contextGuide = null;
    visuals.syncAll(); registerCash.syncAll(); zones.syncAll(); hud.setCoins(G.coins); syncReputationPresentation(); syncPetBookPresentation(); syncCareerPresentation(); syncPawPresentation(); partyOrders.sync(true);
    // AFTER world.built is rebuilt above, not before: the first version of this call sat ahead of
    // world.built.clear() and read the pre-restore build set, so a returning player with the spa
    // (or the terrace) saw bare lawn until the next build event. Probed: spaBuilt true, host
    // visible false after the first restore, true only after a second.
    syncRegions();
    // A terminal save is already settled. Reopen that committed report as presentation only; the
    // settlement transaction itself is idempotent and cannot award coins/reputation/cups twice.
    if (G.dayState._ended) openDaySummary();
    return true;
  };

  return G;
}
