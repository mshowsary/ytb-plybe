import { subscribeWorld } from '../sim/events.js';
import { installEconomicLedger } from './economicLedger.js';
// Runtime service-friction layer. It observes customer waits without changing routing, patience,
// prices, wallet value or ad availability. Task 23 keeps service mistakes visible and measurable,
// but removes the old direct debit: the real consequence is delayed/lost service, not bank erosion.
import { PATIENCE, SETTLE_WAIT } from '../sim/customers.js';
import { frictionSeverity } from '../sim/serviceFriction.js';
import { presentationScheduler } from '../core/presentationScheduler.js';

const SOFT_WAIT = 2.5;
const STYLE_ID = 'pet-cafe-service-friction-style';
const LABEL = {
  shelfWait: 'Shelf is empty',
  substitute: 'Guest changed order',
  registerWait: 'Checkout is backed up',
};

function installStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    .service-friction-toast{position:fixed;left:50%;top:calc(92px + env(safe-area-inset-top,0px));z-index:72;pointer-events:none;transform:translate(-50%,-5px);opacity:0;padding:7px 11px;border-radius:999px;background:#382d2ad9;color:#fff5e9;border:1px solid #ffffff2e;box-shadow:0 5px 16px #38261f24;font:850 10px/1 system-ui,sans-serif;letter-spacing:.03em;white-space:nowrap;transition:opacity .16s ease,transform .16s ease}
    .service-friction-toast.show{opacity:.9;transform:translate(-50%,0)}
    @media(max-width:240px){.service-friction-toast{font-size:9px;top:84px}}
  `;
  document.head.appendChild(style);
}

function makeToast() {
  if (typeof document === 'undefined') return () => {};
  const el = document.createElement('div'); el.className = 'service-friction-toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el);
  let timer = 0;
  return text => {
    if (timer) presentationScheduler.cancel(timer);
    el.textContent = text; el.classList.add('show');
    timer = presentationScheduler.schedule(() => { el.classList.remove('show'); timer = 0; }, 1050);
  };
}

export function installServiceFriction(G) {
  if (!G || !G.world || !Array.isArray(G.world.events) || typeof G.update !== 'function') return { destroy() {} };
  // Task 20 composition boundary: keep shared accounting installed even though Task 23 removes
  // these deduction transactions. Purchases, sales, collections and bonuses still reconcile.
  installEconomicLedger(G);
  installStyle();
  const announce = makeToast();
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

  function mark(kind) {
    const stats = G.dayStats || (G.dayStats = {});
    stats.serviceMisses = (stats.serviceMisses | 0) + 1;
    announce(LABEL[kind] || 'Guest had a rough service moment');
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
  // but handling it never deducts banked money or emits a negative-coin toast/number.
  if (G.carry) {
    G.carry.onReturn = () => {
      const stats = G.dayStats || (G.dayStats = {});
      stats.returnActions = (stats.returnActions | 0) + 1;
      announce('Items returned');
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
