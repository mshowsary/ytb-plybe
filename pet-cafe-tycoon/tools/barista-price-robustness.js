// Five-seed robustness sweep for Barista base price.
//
// Each candidate/seed runs the certified 25-day A/B in a disposable source copy placed beside the
// original tool so all relative imports remain identical. Only two deterministic seed anchors are
// replaced in that copy; live source, gameplay state and the checked-out tree are never mutated.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BARISTA } from '../src/sim/barista.js';
import { BARISTA_PRICE_CANDIDATES, summarizeBaristaCandidate } from './barista-price-sweep-lib.js';
import { BARISTA_ROBUSTNESS_SEEDS, aggregateBaristaRobustness, recommendBaristaPrice } from './barista-price-robustness-lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bot = path.join(here, 'barista-economy-bot.js');
const preload = pathToFileURL(path.join(here, 'barista-cost-preload.js')).href;
const original = readFileSync(bot, 'utf8');
const candidates = [...new Set([...BARISTA_PRICE_CANDIDATES, BARISTA.cost])].sort((a, b) => a - b);
const WORLD_ANCHOR = 'const world = createWorld(AREA1);';
const RNG_ANCHOR = 'const rng = makeRng(1);';

function replaceOnce(source, from, to) {
  const first = source.indexOf(from);
  const second = first < 0 ? -1 : source.indexOf(from, first + from.length);
  if (first < 0 || second >= 0) throw new Error(`robustness source anchor must occur exactly once: ${from}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function seededBotSource(seed) {
  let source = replaceOnce(original, WORLD_ANCHOR, `const world = createWorld(AREA1, null, ${seed});`);
  source = replaceOnce(source, RNG_ANCHOR, `const rng = makeRng(${seed});`);
  return source;
}

function tail(text, lines = 28) {
  return String(text || '').trim().split(/\r?\n/).slice(-lines).join('\n');
}

function runCandidateSeed(cost, seed) {
  const tmp = path.join(here, `.barista-economy-seed-${process.pid}-${cost}-${seed}.js`);
  writeFileSync(tmp, seededBotSource(seed));
  try {
    const child = spawnSync(process.execPath, ['--import', preload, tmp], {
      cwd: root,
      env: { ...process.env, BARISTA_SIM_COST: String(cost) },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Barista A/B failed at ${cost} coins seed ${seed} (exit ${child.status})\n${tail(child.stderr || child.stdout)}`);
    const jsonLine = String(child.stdout || '').split(/\r?\n/).find(line => line.startsWith('BARISTA_ECONOMY_JSON '));
    if (!jsonLine) throw new Error(`Barista A/B at ${cost} coins seed ${seed} did not emit BARISTA_ECONOMY_JSON`);
    return { seed, ...summarizeBaristaCandidate(cost, JSON.parse(jsonLine.slice('BARISTA_ECONOMY_JSON '.length))) };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

const rows = [];
for (const cost of candidates) {
  for (const seed of BARISTA_ROBUSTNESS_SEEDS) rows.push(runCandidateSeed(cost, seed));
}
const summaries = candidates.map(cost => aggregateBaristaRobustness(cost, rows.filter(r => r.cost === cost)));
const recommendation = recommendBaristaPrice(summaries);

const signed = n => `${n >= 0 ? '+' : ''}${n}`;
console.log('Pet Café — BARISTA PRICE ROBUSTNESS (5 seeds × deterministic 25-day A/B)');
console.log(`live price: ${BARISTA.cost} | candidates: ${candidates.join(', ')} | seeds: ${BARISTA_ROBUSTNESS_SEEDS.join(', ')}`);
console.log('seed copies change only world/customer RNG anchors; live files and gameplay prices are untouched');
console.log('durable recoup = cumulative service gain reaches price and never drops below it again through Day 25');
console.log('');
console.log('cost  safe  hire-med(range)   svcΔ med[min]   rush med/worst   coffee med/worst   owner min   durable   cover med[min]   areaΔ');
for (const s of summaries) {
  console.log(
    `${String(s.cost).padEnd(5)} ${String(s.safe ? 'yes' : 'NO').padEnd(5)} ` +
    `${s.hireMinuteMedian.toFixed(1).padStart(5)} (${s.hireMinuteMin.toFixed(1)}-${s.hireMinuteMax.toFixed(1)})   ` +
    `${signed(s.serviceDeltaMedian).padStart(6)}[${signed(s.serviceDeltaMin)}]   ` +
    `${signed(s.rushDeltaMedianPp).padStart(5)}/${signed(s.rushDeltaWorstPp).padStart(5)}pp   ` +
    `${signed(s.coffeeDeltaMedianPp).padStart(5)}/${signed(s.coffeeDeltaWorstPp).padStart(5)}pp   ` +
    `${s.ownerReliefMinPct.toFixed(1).padStart(5)}%   ` +
    `${String(s.durableRecoupSeeds + '/' + s.seeds).padStart(5)}   ` +
    `${s.recoupCoverageMedianPct.toFixed(1).padStart(6)}[${s.recoupCoverageMinPct.toFixed(1)}]%   ` +
    `${signed(s.areaDaysDeltaMax)}`
  );
}
console.log('');
if (recommendation) {
  console.log(`RECOMMENDED BASE PRICE: ${recommendation.cost}`);
  console.log(`reason: ${recommendation.robustPayback ? 'highest price that robustly repays itself across at least 80% of seeds' : 'best safe retained-coverage/service compromise; strong-payback bar not met'}`);
} else {
  console.log('RECOMMENDED BASE PRICE: NONE — no candidate cleared safety constraints');
}
console.log('BARISTA_ROBUSTNESS_JSON ' + JSON.stringify({ liveCost: BARISTA.cost, seeds: BARISTA_ROBUSTNESS_SEEDS, rows, summaries, recommendedCost: recommendation?.cost ?? null }));

let fail = false;
for (const row of rows) {
  if (row.stalls > 0 || row.teleports > 0) {
    console.error(`${row.cost}/seed ${row.seed}: movement regression (${row.stalls} stalls, ${row.teleports} teleports)`);
    fail = true;
  }
}
if (!recommendation) { console.error('No Barista price candidate survived robustness safety constraints'); fail = true; }
if (fail) process.exit(1);