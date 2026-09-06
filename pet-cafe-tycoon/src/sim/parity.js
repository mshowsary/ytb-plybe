// Comparable, presentation-free state for Task 21 runtime/bot characterization.
// Economy/discrete simulation values are exact. Only clocks and mover positions get tolerance;
// a parity report must never hide wallet, ledger, stock, order or progression differences.
export const PARITY_TIME_TOLERANCE = 1 / 30 + 1e-6;
export const PARITY_POSITION_TOLERANCE = 0.08;

const round = (n, p = 6) => Number(Number(n || 0).toFixed(p));
const sortedObject = obj => Object.fromEntries(Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b)));

function stationState(world) {
  return [...world.stations.values()].map(st => ({
    id: st.id,
    active: !!st.active,
    product: st.product || null,
    stock: st.stock == null ? null : st.stock | 0,
    pile: st.pile == null ? null : st.pile | 0,
    beans: st.beans == null ? null : st.beans | 0,
    fruit: st.fruit == null ? null : st.fruit | 0,
    stage: st.stage == null ? null : st.stage | 0,
    dirty: st.dirty == null ? null : !!st.dirty,
    occupied: st.occupied == null ? null : !!st.occupied,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function customerState(customers) {
  return (customers || []).map(c => ({
    id: c.id | 0,
    species: c.species,
    petVariant: c.petVariant == null ? null : c.petVariant | 0,
    variant: c.variant ? { ...c.variant } : null,
    state: c.state,
    counterId: c.counterId || null,
    registerId: c.registerId || null,
    slot: c.slot | 0,
    order: Array.isArray(c.order) ? [...c.order] : null,
    amount: c.amount | 0,
    paid: !!c.paid,
    wish: c.wish ? { product:c.wish.product || null, treat:!!c.wish.treat } : null,
    patience: round(c.patience),
    done: !!c.done,
    x: round(c.x), z: round(c.z),
  })).sort((a, b) => a.id - b.id);
}

export function captureParityState({ state, world, ledger, spawnSequence }) {
  const accounting = ledger ? ledger.report(state.coins) : null;
  return {
    coins: Math.round(Number(state.coins) || 0),
    day: {
      day: state.dayState && state.dayState.day | 0,
      t: round(state.dayState && state.dayState.t),
      phase: state.dayState && state.dayState.phase,
      ended: !!(state.dayState && state.dayState._ended),
    },
    stats: sortedObject(state.dayStats || {}),
    built: [...(world.built || [])].sort(),
    partial: sortedObject(world.partial || {}),
    stars: sortedObject(state.stars || {}),
    stations: stationState(world),
    customers: customerState(state.customers),
    spawn: spawnSequence && spawnSequence.snapshot ? spawnSequence.snapshot() : null,
    ledger: accounting ? {
      openingWallet: accounting.openingWallet,
      sale: accounting.sale,
      collection: accounting.collection,
      bonus: accounting.bonus,
      spend: accounting.spend,
      deduction: accounting.deduction,
      walletDelta: accounting.walletDelta,
      expectedWallet: accounting.expectedWallet,
      actualWallet: accounting.actualWallet,
      reconciled: accounting.reconciled,
    } : null,
  };
}

function compareNumber(path, a, b, tolerance, mismatches) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > tolerance) {
    mismatches.push({ path, runtime:a, bot:b, tolerance });
  }
}

function compareValue(path, a, b, mismatches) {
  if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push({ path, runtime:a, bot:b, tolerance:0 });
}

export function compareParityStates(runtime, bot, options = {}) {
  const timeTolerance = options.timeTolerance == null ? PARITY_TIME_TOLERANCE : options.timeTolerance;
  const positionTolerance = options.positionTolerance == null ? PARITY_POSITION_TOLERANCE : options.positionTolerance;
  const mismatches = [];

  compareValue('coins', runtime.coins, bot.coins, mismatches);
  compareValue('day.day', runtime.day.day, bot.day.day, mismatches);
  compareValue('day.phase', runtime.day.phase, bot.day.phase, mismatches);
  compareValue('day.ended', runtime.day.ended, bot.day.ended, mismatches);
  compareNumber('day.t', runtime.day.t, bot.day.t, timeTolerance, mismatches);
  for (const key of ['stats','built','partial','stars','stations','spawn','ledger']) compareValue(key, runtime[key], bot[key], mismatches);

  const ra = runtime.customers || [], ba = bot.customers || [];
  compareValue('customers.length', ra.length, ba.length, mismatches);
  const n = Math.min(ra.length, ba.length);
  for (let i = 0; i < n; i++) {
    const r = ra[i], b = ba[i];
    for (const key of ['id','species','petVariant','variant','state','counterId','registerId','slot','order','amount','paid','wish','patience','done']) {
      compareValue(`customers[${i}].${key}`, r[key], b[key], mismatches);
    }
    compareNumber(`customers[${i}].x`, r.x, b.x, positionTolerance, mismatches);
    compareNumber(`customers[${i}].z`, r.z, b.z, positionTolerance, mismatches);
  }

  return { ok:mismatches.length === 0, mismatches, timeTolerance, positionTolerance };
}
