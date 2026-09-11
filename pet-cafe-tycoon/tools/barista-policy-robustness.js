// Barista staffing-order robustness matrix.
//
// Price alone cannot tell us whether the specialist is healthy: buying it before Cleaner/second
// Runner can steal coins from broad service capacity. This sweep runs the same five deterministic
// careers with three competent staffing policies and four candidate prices. Each run patches only
// a disposable copy of the existing A/B harness; live gameplay code and STAFF values stay intact.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BARISTA } from '../src/sim/barista.js';
import { BARISTA_PRICE_CANDIDATES, summarizeBaristaCandidate } from './barista-price-sweep-lib.js';
import { BARISTA_ROBUSTNESS_SEEDS, aggregateBaristaRobustness } from './barista-price-robustness-lib.js';

const POLICIES = Object.freeze([
  { key: 'after-runner', label: 'Cashier > Runner > Barista > Cleaner > Runner', extraGuard: '' },
  { key: 'after-cleaner', label: 'Cashier > Runner > Cleaner > Barista > Runner', extraGuard: ' || (G.staff.cleaner | 0) <= 0' },
  { key: 'after-core', label: 'Cashier > Runner > Cleaner > Runner > Barista', extraGuard: ' || (G.staff.cleaner | 0) <= 0 || (G.staff.runner | 0) < 2' },
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bot = path.join(here, 'barista-economy-bot.js');
const preload = pathToFileURL(path.join(here, 'barista-cost-preload.js')).href;
const original = readFileSync(bot, 'utf8');
const candidates = [...new Set([...BARISTA_PRICE_CANDIDATES, BARISTA.cost])].sort((a, b) => a - b);
const WORLD_ANCHOR = 'const world = createWorld(AREA1);';
const RNG_ANCHOR = 'const rng = makeRng(1);';
const POLICY_ANCHOR = 'if (!baristaAware || (G.staff.barista | 0) > 0 || (G.staff.runner | 0) <= 0) return false;';

function replaceOnce(source, from, to) {
  const first = source.indexOf(from);
  const second = first < 0 ? -1 : source.indexOf(from, first + from.length);
  if (first < 0 || second >= 0) throw new Error(`policy robustness source anchor must occur exactly once: ${from}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function patchedSource(seed, policy) {
  let source = replaceOnce(original, WORLD_ANCHOR, `const world = createWorld(AREA1, null, ${seed});`);
  source = replaceOnce(source, RNG_ANCHOR, `const rng = makeRng(${seed});`);
  source = replaceOnce(
    source,
    POLICY_ANCHOR,
    `if (!baristaAware || (G.staff.barista | 0) > 0 || (G.staff.runner | 0) <= 0${policy.extraGuard}) return false;`,
  );
  return source;
}

function tail(text, lines = 24) {
  return String(text || '').trim().split(/\r?\n/).slice(-lines).join('\n');
}

function runArm(cost, seed, policy) {
  const tmp = path.join(here, `.barista-policy-${process.pid}-${policy.key}-${cost}-${seed}.js`);
  writeFileSync(tmp, patchedSource(seed, policy));
  try {
    const child = spawnSync(process.execPath, ['--import', preload, tmp], {
      cwd: root,
      env: { ...process.env, BARISTA_SIM_COST: String(cost) },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`${policy.key}/${cost}/seed ${seed} failed (exit ${child.status})\n${tail(child.stderr || child.stdout)}`);
    const jsonLine = String(child.stdout || '').split(/\r?\n/).find(line => line.startsWith('BARISTA_ECONOMY_JSON '));
    if (!jsonLine) throw new Error(`${policy.key}/${cost}/seed ${seed} emitted no BARISTA_ECONOMY_JSON`);
    return { policy: policy.key, seed, ...summarizeBaristaCandidate(cost, JSON.parse(jsonLine.slice('BARISTA_ECONOMY_JSON '.length))) };
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

const rows = [];
for (const policy of POLICIES) {
  for (const cost of candidates) {
    for (const seed of BARISTA_ROBUSTNESS_SEEDS) rows.push(runArm(cost, seed, policy));
  }
}

const summaries = [];
for (const policy of POLICIES) {
  for (const cost of candidates) {
    const s = aggregateBaristaRobustness(cost, rows.filter(r => r.policy === policy.key && r.cost === cost));
    summaries.push({ policy: policy.key, label: policy.label, ...s });
  }
}

const signed = n => `${n >= 0 ? '+' : ''}${n}`;
console.log('Pet Café — BARISTA STAFFING-ORDER ROBUSTNESS');
console.log(`matrix: ${POLICIES.length} policies × ${candidates.length} prices × ${BARISTA_ROBUSTNESS_SEEDS.length} seeds = ${rows.length} deterministic A/B careers`);
console.log('purpose: distinguish a bad Barista price from a bad purchase-order opportunity cost');
console.log('live gameplay is not mutated by this report');
for (const policy of POLICIES) {
  console.log('');
  console.log(`--- ${policy.key}: ${policy.label} ---`);
  console.log('cost  safe  hire-med  svcΔ med[min]   rush med/worst   coffee med/worst   owner-min  durable  coverage-med');
  for (const s of summaries.filter(x => x.policy === policy.key)) {
    console.log(
      `${String(s.cost).padEnd(5)} ${String(s.safe ? 'yes' : 'NO').padEnd(5)} ${s.hireMinuteMedian.toFixed(1).padStart(7)}   ` +
      `${signed(s.serviceDeltaMedian).padStart(6)}[${signed(s.serviceDeltaMin)}]   ` +
      `${signed(s.rushDeltaMedianPp).padStart(5)}/${signed(s.rushDeltaWorstPp).padStart(5)}pp   ` +
      `${signed(s.coffeeDeltaMedianPp).padStart(5)}/${signed(s.coffeeDeltaWorstPp).padStart(5)}pp   ` +
      `${s.ownerReliefMinPct.toFixed(1).padStart(6)}%   ${String(s.durableRecoupSeeds + '/' + s.seeds).padStart(5)}   ` +
      `${s.recoupCoverageMedianPct.toFixed(1).padStart(6)}%`
    );
  }
}

const safe = summaries.filter(s => s.safe);
const robust = safe.filter(s => s.robustPayback);
console.log('');
console.log(`safe combinations: ${safe.length}/${summaries.length}; robust-payback combinations: ${robust.length}/${summaries.length}`);
if (robust.length) {
  const best = [...robust].sort((a, b) =>
    (a.hireMinuteMedian - b.hireMinuteMedian)
    || (b.cost - a.cost)
    || (b.serviceDeltaMedian - a.serviceDeltaMedian)
  )[0];
  console.log(`STRONG CANDIDATE: ${best.policy} @ ${best.cost} (earliest robust-payback option, then highest price)`);
} else {
  const best = [...safe].sort((a, b) =>
    (b.serviceDeltaMedian - a.serviceDeltaMedian)
    || (b.ownerReliefMinPct - a.ownerReliefMinPct)
    || (b.recoupCoverageMedianPct - a.recoupCoverageMedianPct)
  )[0];
  console.log(`NO ROBUST PAYBACK COMBINATION; least-fragile QoL candidate: ${best?.policy || 'none'} @ ${best?.cost ?? 'n/a'}`);
}
console.log('BARISTA_POLICY_ROBUSTNESS_JSON ' + JSON.stringify({ liveCost: BARISTA.cost, seeds: BARISTA_ROBUSTNESS_SEEDS, policies: POLICIES, rows, summaries }));

let fail = false;
for (const row of rows) {
  if (row.stalls > 0 || row.teleports > 0) {
    console.error(`${row.policy}/${row.cost}/seed ${row.seed}: movement regression (${row.stalls} stalls, ${row.teleports} teleports)`);
    fail = true;
  }
}
if (!safe.length) { console.error('No staffing-policy / price combination passed basic Barista safety constraints'); fail = true; }
if (fail) process.exit(1);