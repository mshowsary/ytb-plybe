import { subscribeWorld } from '../sim/events.js';
import { installEconomicLedger } from './economicLedger.js';
// Runtime service-friction layer. It observes customer waits without changing routing, patience,
// prices, wallet value or ad availability. Task 23 keeps service mistakes visible and measurable,
// but removes the old direct debit: the real consequence is delayed/lost service, not bank erosion.
import { PATIENCE, SETTLE_WAIT } from '../sim/customers.js';
import { frictionSeverity } from '../sim/serviceFriction.js';

// Batch 6: this layer is now SILENT. It used to raise a dark pill at the top of the screen every
// time a guest waited, swapped an order or had items returned -- and after a phone session the
// owner counted 20 of those on day 2 and 25 on day 6: "if the player is constantly reassuring,
// cleaning, and recovering, the game is nagging them rather than challenging them." The standing
// rule is that we never overwhelm or punish the player or raise his cortisol level; we only keep
// the game from being boring, and a running commentary on the player's mistakes does the opposite.
// The counting is untouched -- serviceMisses, returnActions and the economic ledger still record
// every one of these moments, so the day summary, the stats and the tests read exactly what they
// read before. The player just is not told off for them any more. The one consequence still shown
// is the honest one: a guest who leaves.
const SOFT_WAIT = 2.5;

export function installServiceFriction(G) {
  if (!G || !G.world || !Array.isArray(G.world.events) || typeof G.update !== 'function') return { destroy() {} };
  // Task 20 composition boundary: keep shared accounting installed even though Task 23 removes
  // these deduction transactions. Purchases, sales, collections and bonuses still reconcile.
  installEconomicLedger(G);
  const records = new Map();
  const baseUpdate = G.update;
  const baseReturn = G.carry && G.carry.onReturn;
  let day = G.dayState && G.dayState.day || 1;

  function recordFor(id) {
    let r = records.get(id);
    if (!r) {
      r = { shelfStart: null, shelfCounter: null, shelfSeen: false, substituteSeen: false, registerStart: null, registerSeen: false };
      records.set(id, r);
    }
    return r;
  }

  // `kind` is kept in the signature (and at every call site) even though nothing is drawn from it
  // now: it is the record of WHICH observation fired, and the next thing that wants to read these
  // moments -- a shift report, a tuning sweep -- should get the reason, not just a count.
  function mark(kind) {
    const stats = G.dayStats || (G.dayStats = {});
    stats.serviceMisses = (stats.serviceMisses | 0) + 1;
    return true;
  }

  function observeShelf(c, r) {
    if (!c || r.shelfSeen || c.state !== 'queue' || c.mood !== 'wait') return;
    if (r.shelfCounter !== c.counterId || r.shelfStart == null) {
      r.shelfCounter = c.counterId;
      r.shelfStart = Number(c.patience);
    }
    const waited = Math.max(0, Number(r.shelfStart) - Number(c.patience));
    if (waited >= SOFT_WAIT) {
      // Preserve the old severity boundary as the observation threshold, but it no longer computes
      // or applies money. Keeping the call makes the trigger semantics explicit and testable.
      frictionSeverity(waited, SOFT_WAIT, SETTLE_WAIT);
      mark('shelfWait'); r.shelfSeen = true;
    }
  }

  function observeRegister(c, r) {
    if (!c || r.registerSeen || c.state !== 'atRegister') return;
    if (r.registerStart == null) r.registerStart = Number(c.patience);
    const waited = Math.max(0, Number(r.registerStart) - Number(c.patience));
    if (waited >= SOFT_WAIT && c.mood === 'wait') {
      frictionSeverity(waited, SOFT_WAIT, 8);
      mark('registerWait'); r.registerSeen = true;
    }
  }

  function noteSubstitution(event) {
    const r = recordFor(event.id);
    if (r.substituteSeen) return;
    const c = (G.customers || []).find(x => x && x.id === event.id);
    const stress = c && Number.isFinite(Number(c.patience)) ? Math.max(0, PATIENCE - Number(c.patience)) : SETTLE_WAIT;
    frictionSeverity(stress, SETTLE_WAIT, PATIENCE * 0.75);
    mark('substitute'); r.substituteSeen = true;
  }

  const observedPush = function serviceFrictionObservedPush(...items) {
    for (const event of items) {
      if (!event || event.id == null) continue;
      if (event.type === 'settled') noteSubstitution(event);
      else if (event.type === 'pay') {
        const c = (G.customers || []).find(x => x && x.id === event.id), r = records.get(event.id);
        if (c && r && !r.registerSeen && r.registerStart != null) {
          const waited = Math.max(0, Number(r.registerStart) - Number(c.patience));
          if (waited >= SOFT_WAIT) { frictionSeverity(waited, SOFT_WAIT, 8); mark('registerWait'); r.registerSeen = true; }
        }
      }
    }
  };
  const unsubscribe = subscribeWorld(G.world, event => observedPush(event), 20);

  // createEconomyExperience installs the old return-waste callback during createGame. Replace that
  // runtime callback after composition: RETURN still clears the held inventory through carry.js,
  // but handling it never deducts banked money or emits a negative-coin toast/number. Batch 6 also
  // drops the "items returned" acknowledgement -- the shelf visibly empties in the player's hands,
  // which is confirmation enough without a pill announcing it.
  if (G.carry) {
    G.carry.onReturn = () => {
      const stats = G.dayStats || (G.dayStats = {});
      stats.returnActions = (stats.returnActions | 0) + 1;
    };
  }

  const wrappedUpdate = function serviceFrictionUpdate(dt) {
    const result = baseUpdate(dt);
    const nowDay = G.dayState && G.dayState.day || day;
    if (nowDay !== day) { day = nowDay; records.clear(); }
    const alive = new Set();
    for (const c of G.customers || []) {
      if (!c || c.done) continue;
      alive.add(c.id);
      const r = recordFor(c.id);
      observeShelf(c, r); observeRegister(c, r);
    }
    for (const id of records.keys()) if (!alive.has(id)) records.delete(id);
    return result;
  };
  G.update = wrappedUpdate;

  return {
    destroy() {
      if (G.update === wrappedUpdate) G.update = baseUpdate;
      if (G.carry && G.carry.onReturn !== baseReturn) G.carry.onReturn = baseReturn;
      unsubscribe();
    },
  };
}
