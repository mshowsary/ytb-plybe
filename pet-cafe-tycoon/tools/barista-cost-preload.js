// Simulation-only preload used by the Barista price sensitivity sweep.
// Each candidate runs in its own Node process, so this mutates only that disposable process's
// in-memory economy module. Live gameplay source and the checked-out working tree stay untouched.
import { STAFF } from '../src/sim/economy.js';

const raw = process.env.BARISTA_SIM_COST;
if (raw != null && raw !== '') {
  const cost = Number(raw);
  if (!Number.isInteger(cost) || cost < 500 || cost > 10000) {
    throw new Error(`BARISTA_SIM_COST must be an integer from 500..10000; received ${raw}`);
  }
  if (!STAFF.barista || !Array.isArray(STAFF.barista.costs) || STAFF.barista.costs.length !== 1) {
    throw new Error('Barista preload expected exactly one live hire tier');
  }
  STAFF.barista.costs[0] = cost;
}
