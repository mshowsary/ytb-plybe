// Deterministic sensitivity sweep for the base Barista price.
//
// This does not change live STAFF prices. Every candidate is evaluated in a fresh child process
// using barista-cost-preload.js, then the already-certified 25-day Barista A/B harness runs with
// exactly the same seed, purchase policy, movement, staff bodies and coffee-lane timings.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BARISTA } from '../src/sim/barista.js';
import {
  BARISTA_PRICE_CANDIDATES,
  comparePriceSensitivity,
  summarizeBaristaCandidate,
} from './barista-price-sweep-lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const preload = pathToFileURL(path.join(here, 'barista-cost-preload.js')).href;
const bot = path.join(here, 'barista-economy-bot.js');
const candidates = [...new Set([...BARISTA_PRICE_CANDIDATES, BARISTA.cost])].sort((a, b) => a - b);

function tail(text, lines = 24) {
  return String(text || '').trim().split(/\r?\n/).slice(-lines).join('\n');
}

function runCandidate(cost) {
  const child = spawnSync(process.execPath, ['--import', preload, bot], {
    cwd: root,
    env: { ...process.env, BARISTA_SIM_COST: String(cost) },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Barista A/B failed at ${cost} coins (exit ${child.status})\n${tail(child.stderr || child.stdout)}`);
  }
  const jsonLine = String(child.stdout || '').split(/\r?\n/).find(line => line.startsWith('BARISTA_ECONOMY_JSON '));
  if (!jsonLine) throw new Error(`Barista A/B at ${cost} coins did not emit BARISTA_ECONOMY_JSON`);
  const report = JSON.parse(jsonLine.slice('BARISTA_ECONOMY_JSON '.length));
  return summarizeBaristaCandidate(cost, report);
}

const rows = candidates.map(runCandidate);
const sensitivity = comparePriceSensitivity(rows, BARISTA.cost);

console.log('Pet Café — BARISTA PRICE / TIMING SENSITIVITY (deterministic 25-day career)');
console.log(`live price: ${BARISTA.cost} | candidates: ${candidates.join(', ')}`);
console.log('same policy in every arm: Cashier -> first Runner -> reserve candidate Barista -> Cleaner/second Runner');
console.log('candidate price is process-local only; gameplay STAFF config is never rewritten');
console.log('');
console.log('cost  hire     game-min  area  svcΔ   D12Δ  rushΔ    coffeeΔ  owner-relief  recoup  coverage  wallet');
for (const r of rows) {
  const hire = `D${r.hireDay}`.padEnd(8);
  const recoup = r.recoupDay == null ? '—' : `D${r.recoupDay}`;
  const signed = n => `${n >= 0 ? '+' : ''}${n}`;
  console.log(
    `${String(r.cost).padEnd(5)} ${hire} ${String(r.hireMinute.toFixed(1)).padStart(8)}  ${String(r.daysToComplete).padStart(4)}  ` +
    `${signed(r.totalServiceDelta).padStart(5)}  ${signed(r.day12Delta).padStart(5)}  ` +
    `${signed(r.rushDeltaPp).padStart(6)}pp  ${signed(r.coffeeWaitDeltaPp).padStart(7)}pp  ` +
    `${String(r.ownerCoffeeReliefPct.toFixed(1)).padStart(6)}%       ${String(recoup).padStart(5)}  ` +
    `${String(r.recoupCoveragePct.toFixed(1)).padStart(6)}%  ${String(r.finalCoins).padStart(6)}`,
  );
}
console.log('');
console.log('--- sensitivity read: cheapest candidate vs current live price ---');
console.log(`hire timing: ${sensitivity.hireAdvanceMinutes >= 0 ? '+' : ''}${sensitivity.hireAdvanceMinutes} min earlier (${sensitivity.timingBand})`);
console.log(`Area 1 completion: ${sensitivity.areaCompletionDeltaVsLive >= 0 ? '+' : ''}${sensitivity.areaCompletionDeltaVsLive} day(s) vs live`);
console.log(`service delta vs live: ${sensitivity.serviceDeltaVsLive >= 0 ? '+' : ''}${sensitivity.serviceDeltaVsLive}`);
console.log(`final wallet vs live: ${sensitivity.finalWalletDeltaVsLive >= 0 ? '+' : ''}${sensitivity.finalWalletDeltaVsLive}`);
console.log(`rush relief delta vs live: ${sensitivity.rushReliefDeltaVsLivePp >= 0 ? '+' : ''}${sensitivity.rushReliefDeltaVsLivePp}pp`);
console.log(`coffee relief delta vs live: ${sensitivity.coffeeReliefDeltaVsLivePp >= 0 ? '+' : ''}${sensitivity.coffeeReliefDeltaVsLivePp}pp`);
console.log(`recoup coverage delta vs live: ${sensitivity.recoupCoverageDeltaVsLivePp >= 0 ? '+' : ''}${sensitivity.recoupCoverageDeltaVsLivePp}pp`);
console.log('BARISTA_PRICE_SWEEP_JSON ' + JSON.stringify({ liveCost: BARISTA.cost, rows, sensitivity }));

let fail = false;
for (const r of rows) {
  if (r.hireDay < BARISTA.unlockDay) { console.error(`${r.cost}: hired before Day-${BARISTA.unlockDay}`); fail = true; }
  if (r.stalls > 0 || r.teleports > 0) { console.error(`${r.cost}: movement regression (${r.stalls} stalls, ${r.teleports} teleports)`); fail = true; }
  if (r.cupsMoved <= 0 || r.jobs <= 0) { console.error(`${r.cost}: Barista hired but did not perform real coffee-lane work`); fail = true; }
}
if (fail) process.exit(1);
