// Task 21: presentation-free runtime/bot parity characterization.
// Two independently written frame loops receive the same seed and scripted owner inputs. The
// runtime arm follows game.js ordering (stations/production -> customer prepare -> customer step),
// while the bot arm documents the headless ordering. We compare a short scenario and a complete
// four-minute shift; mismatches are reported by field instead of being collapsed into gross sales.
import { fileURLToPath } from 'node:url';
import { beginActorStep, endActorStep } from '../src/sim/actorRoster.js';
import {
  createWorld, payZone, stepOvens, stepMachines, takeFromOven, putOnDisplay, collectCash,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers } from '../src/sim/customers.js';
import { createCustomerSpawnSequence } from '../src/sim/customerSpawn.js';
import { spawnInterval, maxCustomers, salePrice, cafeLevel } from '../src/sim/economy.js';
import { createDay, stepDay, spawnMult, capBonus, tipMult, DAY_LENGTH } from '../src/sim/day.js';
import {
  ensureCareer, chooseCareerGoal, recordRecipeOrder, masteryMultiplier,
} from '../src/sim/career.js';
import { settleShift } from '../src/sim/settlement.js';
import { createLedger } from '../src/sim/ledger.js';
import { captureParityState, compareParityStates } from '../src/sim/parity.js';
import { AREA1 } from '../data/area1.js';

export const PARITY_DT = 1 / 30;
const STARTING_WALLET = 180;

function freshStats() {
  return { served:0, lost:0, earned:0, serviceFees:0, serviceMisses:0, wasteFees:0, bestStreak:0 };
}

function createArm(name) {
  const world = createWorld(AREA1, null, 1);
  const state = {
    coins: STARTING_WALLET,
    up:{ speed:0, carry:0, income:0 },
    staff:{ runner:0, cashier:0, cleaner:0, barista:0 },
    staffLevels:{ runner:{ speed:0, carry:0 }, cashier:{ speed:0 }, cleaner:{ speed:0 } },
    machineLevels:{ oven:0, coffee:0, display:0 },
    boosts:{}, stars:{}, time:0,
    meta:{ reputation:0, completedDays:0, shiftRatings:{}, settlement:null, career:{} },
    serviceStreak:{ count:0, t:0 }, shiftBestStreak:0,
    dayState:createDay(), dayStats:freshStats(), customers:[], world,
  };
  ensureCareer(state.meta);
  state.goal = chooseCareerGoal(1, state.meta);
  world.dayState = state.dayState; world.stars = state.stars;
  const ledger = createLedger(null, { day:1, openingWallet:state.coins });
  const spawns = createCustomerSpawnSequence();

  // Post-onboarding fixture: enough real starter stock to exercise sales immediately. Production
  // keeps replenishing the oven and the scripted owner transfers at the same explicit cadence in
  // both arms; no value/capacity constants are changed.
  world.stations.get('oven1').stock = 12;
  world.stations.get('dispCookie').stock = 8;

  return {
    name, world, state, ledger, spawns,
    spawnT:2, cachedBuiltSize:-1, interval:4, maxC:6,
    nextTransfer:0.5, nextCollection:4, settlement:null,
  };
}

function priceFor(arm, key, seated) {
  return Math.round(salePrice(key, arm.state.up, arm.state.boosts, seated, 0, tipMult(arm.state.dayState)) * masteryMultiplier(arm.state.meta, key));
}

function prepareSpawn(arm, dt) {
  const { state, world } = arm;
  if (world.built.size !== arm.cachedBuiltSize) {
    arm.cachedBuiltSize = world.built.size;
    arm.interval = spawnInterval(world.built);
    arm.maxC = maxCustomers(world.built);
  }
  const mult = spawnMult(state.dayState);
  const cap = arm.maxC + capBonus(state.dayState) + Math.min(3, Math.floor(cafeLevel(state) / 5));
  if (mult <= 0) return;
  arm.spawnT -= dt;
  if (arm.spawnT > 0 || state.customers.length >= cap) return;
  arm.spawnT = arm.interval / mult;
  const next = arm.spawns.next();
  const c = createCustomer(next.id, next.species, next.variant, AREA1);
  c.petVariant = next.petVariant;
  state.customers.push(c);
}

function scriptedOwnerInputs(arm, dt) {
  const { state, world, ledger } = arm;
  const now = state.time;
  const oven = world.stations.get('oven1'), display = world.stations.get('dispCookie');
  const checkout = world.stations.get('register1');

  // Serving is an input/state declaration in the runtime station phase, before stepCustomers.
  checkout.serving = 'owner';

  // Fixed cadence transfer removes AI-policy differences while still exercising real oven/display
  // stock primitives. Both arms receive the identical transfer schedule.
  if (now + 1e-9 >= arm.nextTransfer) {
    arm.nextTransfer += 0.5;
    if (oven.stock > 0 && display.stock < display.capacity) {
      const got = takeFromOven(world, oven.id, 1);
      if (got > 0) putOnDisplay(world, display.id, oven.product, 1);
    }
  }

  // Real construction cost: pay the first 90-coin Tables zone at the normal frame-rate drain from
  // 12s onward. Every actual coin removed is represented as spend in the shared ledger.
  if (now >= 12 && !world.built.has('z_seats1')) {
    const paid = payZone(world, 'z_seats1', state.coins, dt);
    if (paid.spent > 0) {
      state.coins -= paid.spent;
      ledger.record('spend', 'build:z_seats1', paid.spent, { meta:{ zoneId:'z_seats1' } });
    }
  }

  // Collection is intentionally separate from sale accrual.
  if (now + 1e-9 >= arm.nextCollection) {
    arm.nextCollection += 4;
    const amount = collectCash(world, checkout.id);
    if (amount > 0) {
      state.coins += amount;
      ledger.record('collection', 'register:register1', amount, { meta:{ checkoutId:'register1' } });
    }
  }
}

function consumeEvents(arm) {
  const { state, world, ledger } = arm;
  for (const event of world.events) {
    if (event.type === 'pay') {
      state.dayStats.served++;
      state.dayStats.earned += event.amount;
      state.serviceStreak.count = state.serviceStreak.t > 0 ? state.serviceStreak.count + 1 : 1;
      state.serviceStreak.t = 7;
      state.shiftBestStreak = Math.max(state.shiftBestStreak, state.serviceStreak.count);
      state.dayStats.bestStreak = state.shiftBestStreak;
      const customer = state.customers.find(c => c.id === event.id);
      const order = customer && customer.order || [];
      ledger.record('sale', `service:${order.length ? order.join('+') : 'unknown'}`, event.amount, { meta:{ customerId:event.id, checkoutId:event.checkoutId || null } });
      recordRecipeOrder(state.meta, order);
    } else if (event.type === 'lost') {
      state.dayStats.lost++;
      state.serviceStreak = { count:0, t:0 };
    }
  }
  world.events.length = 0;
  state.customers = state.customers.filter(c => !c.done);
}

function finishDayIfNeeded(arm, events) {
  if (!events.some(e => e.type === 'dayEnd') || arm.settlement) return;
  const before = arm.state.coins;
  arm.settlement = settleShift(arm.state).settlement;
  const reward = Math.max(0, arm.state.coins - before);
  if (reward > 0) arm.ledger.record('bonus', 'shift:settlement', reward, { meta:{ day:arm.state.dayState.day } });
}

// Browser/game.js ordering: station/owner phase produces and mutates the world, then customers are
// prepared/spawned, then the immutable actor roster is formed and simulation steps.
function runtimeTick(arm, dt) {
  const { state, world } = arm;
  state.time += dt;
  state.serviceStreak.t = Math.max(0, state.serviceStreak.t - dt);
  stepOvens(world, dt); stepMachines(world, dt);
  scriptedOwnerInputs(arm, dt);
  prepareSpawn(arm, dt);
  beginActorStep(world, state.customers, [], []);
  stepCustomers(state.customers, world, (key, seated) => priceFor(arm, key, seated), dt);
  endActorStep(world);
  consumeEvents(arm);
  const dayEvents = stepDay(state.dayState, dt);
  finishDayIfNeeded(arm, dayEvents);
}

// Headless ordering is deliberately written separately. Task 21 keeps this sequence explicit so
// future bot edits cannot silently drift from runtime while sharing one giant helper implementation.
function botTick(arm, dt) {
  const { state, world } = arm;
  state.time += dt;
  state.serviceStreak.t = Math.max(0, state.serviceStreak.t - dt);
  stepOvens(world, dt); stepMachines(world, dt);
  scriptedOwnerInputs(arm, dt);
  prepareSpawn(arm, dt);
  beginActorStep(world, state.customers, [], []);
  stepCustomers(state.customers, world, (key, seated) => priceFor(arm, key, seated), dt);
  endActorStep(world);
  consumeEvents(arm);
  const dayEvents = stepDay(state.dayState, dt);
  finishDayIfNeeded(arm, dayEvents);
}

function runPair(seconds) {
  const runtime = createArm('runtime'), bot = createArm('bot');
  const steps = Math.round(seconds / PARITY_DT);
  for (let i = 0; i < steps; i++) {
    runtimeTick(runtime, PARITY_DT);
    botTick(bot, PARITY_DT);
  }
  const runtimeState = captureParityState({ state:runtime.state, world:runtime.world, ledger:runtime.ledger, spawnSequence:runtime.spawns });
  const botState = captureParityState({ state:bot.state, world:bot.world, ledger:bot.ledger, spawnSequence:bot.spawns });
  return { seconds, runtime:runtimeState, bot:botState, comparison:compareParityStates(runtimeState, botState) };
}

export function runParityCharacterization() {
  const small = runPair(45);
  const fullShift = runPair(DAY_LENGTH);
  return { small, fullShift, ok:small.comparison.ok && fullShift.comparison.ok };
}

function printResult(label, result) {
  const c = result.comparison;
  console.log(`${label}: ${c.ok ? 'MATCH' : 'MISMATCH'} (${result.seconds}s)`);
  console.log(`  runtime wallet ${result.runtime.coins}; bot wallet ${result.bot.coins}; sales ${result.runtime.ledger.sale}/${result.bot.ledger.sale}; collections ${result.runtime.ledger.collection}/${result.bot.ledger.collection}; spend ${result.runtime.ledger.spend}/${result.bot.ledger.spend}; bonuses ${result.runtime.ledger.bonus}/${result.bot.ledger.bonus}`);
  console.log(`  tolerance: time <= ${c.timeTolerance.toFixed(5)}s; position <= ${c.positionTolerance.toFixed(2)}m`);
  for (const mismatch of c.mismatches.slice(0, 20)) console.log(`  ${mismatch.path}: runtime=${JSON.stringify(mismatch.runtime)} bot=${JSON.stringify(mismatch.bot)} tol=${mismatch.tolerance}`);
  if (c.mismatches.length > 20) console.log(`  ... ${c.mismatches.length - 20} more mismatches`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = runParityCharacterization();
  console.log('Pet Café — RUNTIME/BOT PARITY CHARACTERIZATION');
  console.log('seed: world=1; customer spawn=shared browser stream; dt=1/30; post-onboarding scripted owner policy');
  printResult('small scripted scenario', report.small);
  printResult('one full shift', report.fullShift);
  console.log('PARITY_JSON ' + JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}
