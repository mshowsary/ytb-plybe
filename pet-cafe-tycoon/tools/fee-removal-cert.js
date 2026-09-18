// Task 22 certification wrapper.
// Fee removal is allowed to change purchase/build timing, which changes capacity and therefore the
// TOTAL number of customers spawned over 15 shifts. Pairing means both arms start from and consume
// the same deterministic visitor stream; it does not mean economically divergent worlds must
// produce the same visitor volume forever.
import fs from 'node:fs';
import { runFeeRemovalExperiment } from './fee-removal-experiment.js';
import { createCustomerSpawnSequence } from '../src/sim/customerSpawn.js';

const PREFIX = 64;

function spawnPrefix() {
  const seq = createCustomerSpawnSequence();
  return Array.from({ length: PREFIX }, () => seq.next()).map(x => ({
    id: x.id,
    species: x.species,
    petVariant: x.petVariant,
    variant: x.variant,
  }));
}

// Guard the experiment itself against quietly switching back to a private seed/RNG implementation.
const source = fs.readFileSync(new URL('./fee-removal-experiment.js', import.meta.url), 'utf8');
if (!source.includes("import { createCustomerSpawnSequence } from '../src/sim/customerSpawn.js';") ||
    !source.includes('const spawns = createCustomerSpawnSequence();') ||
    !source.includes('const next = spawns.next();')) {
  throw new Error('Task 22 experiment is no longer consuming the shared browser customer stream');
}

// Characterize the fixed stream itself so a future RNG-order edit becomes an explicit review event.
const prefixA = spawnPrefix();
const prefixB = spawnPrefix();
if (JSON.stringify(prefixA) !== JSON.stringify(prefixB)) {
  throw new Error('Shared customer stream is not deterministic');
}

const report = runFeeRemovalExperiment();
let fail = false;
for (const pair of report.pairs) {
  for (const scenario of [pair.current, pair.feeFree]) {
    if (scenario.ledgerMismatches.length) {
      console.error(`${pair.policy}/${scenario.variant}: ledger mismatch`);
      fail = true;
    }
    if (scenario.variant === 'fee-free' && scenario.deduction !== 0) {
      console.error(`${pair.policy}: fee-free ledger still contains deductions`);
      fail = true;
    }
    if (scenario.spawnDraws <= 0 || scenario.spawnDraws % 4 !== 0) {
      console.error(`${pair.policy}/${scenario.variant}: invalid shared-spawn draw count ${scenario.spawnDraws}`);
      fail = true;
    }
  }
}

console.log('Pet Café — TASK 22 FEE-REMOVAL CERTIFICATION');
console.log(`shared visitor stream: first ${PREFIX} spawn descriptors deterministic; total volume may diverge after economic state diverges`);
for (const pair of report.pairs) {
  const d = pair.delta;
  console.log(`${pair.policy.padEnd(11)} wallet ${d.walletDelta >= 0 ? '+' : ''}${d.walletDelta}` +
    ` | surplus/spend ${(d.surplusShareOfSpend * 100).toFixed(1)}%` +
    ` | room acceleration ${d.completionDelta} day(s)` +
    ` | lost ${pair.current.lost}->${pair.feeFree.lost}` +
    ` | stockout ${pair.current.stockoutSeconds.toFixed(1)}s->${pair.feeFree.stockoutSeconds.toFixed(1)}s` +
    ` | idle ${pair.current.idleSeconds.toFixed(1)}s->${pair.feeFree.idleSeconds.toFixed(1)}s` +
    ` | goals ${(pair.current.goalRate * 100).toFixed(0)}%->${(pair.feeFree.goalRate * 100).toFixed(0)}%`);
}
console.log('READ: ' + report.read);
console.log(`largest retained-wallet surplus/spend ${(report.largestSurplus * 100).toFixed(1)}%; max room acceleration ${report.maxAcceleration} day(s)`);

if (fail) process.exitCode = 1;
