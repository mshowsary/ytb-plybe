// Runtime service-friction layer. It observes customer waits without changing routing, patience,
// prices or ad availability. The goal is to make degraded service matter economically while keeping
// the penalty bounded enough that a bad rush cannot become a debt spiral.
import { PATIENCE, SETTLE_WAIT } from '../sim/customers.js';
import { serviceFrictionCost, frictionSeverity, SERVICE_FRICTION_DAILY_CAP } from '../sim/serviceFriction.js';

const SOFT_WAIT = 2.5;
const STYLE_ID = 'pet-cafe-service-friction-style';
const LABEL = { shelfWait: 'Shelf wait', substitute: 'Order changed', registerWait: 'Register wait' };

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
    if (timer) clearTimeout(timer);
    el.textContent = text; el.classList.add('show');
    timer = setTimeout(() => el.classList.remove('show'), 1050);
  };
}

export function installServiceFriction(G) {
  if (!G || !G.world || !Array.isArray(G.world.events) || typeof G.update !== 'function') return { destroy() {} };
  installStyle();
  const announce = makeToast();
  const records = new Map();
  const events = G.world.events;
  const nativePush = events.push;
  const baseUpdate = G.update;
  let day = G.dayState && G.dayState.day || 1;

  function recordFor(id) {
    let r = records.get(id);
    if (!r) {
      r = { shelfStart: null, shelfCounter: null, shelfCharged: false, substituteCharged: false, registerStart: null, registerCharged: false };
      records.set(id, r);
    }
    return r;
  }

  function charge(kind, severity = 0) {
    const stats = G.dayStats || (G.dayStats = {});
    const used = Math.max(0, stats.serviceFees | 0);
    const remaining = Math.max(0, SERVICE_FRICTION_DAILY_CAP - used);
    const cost = serviceFrictionCost(kind, severity, G.coins, remaining);
    if (!cost) return 0;
    G.coins = Math.max(0, (G.coins | 0) - cost);
    stats.serviceFees = used + cost;
    stats.serviceMisses = (stats.serviceMisses | 0) + 1;
    if (G.stats) G.stats.serviceFees = (G.stats.serviceFees | 0) + cost;
    announce(`${LABEL[kind] || 'Service recovery'}  −${cost}`);
    return cost;
  }

  function observeShelf(c, r) {
    if (!c || r.shelfCharged || c.state !== 'queue' || c.mood !== 'wait') return;
    if (r.shelfCounter !== c.counterId || r.shelfStart == null) {
      r.shelfCounter = c.counterId;
      r.shelfStart = Number(c.patience);
    }
    const waited = Math.max(0, Number(r.shelfStart) - Number(c.patience));
    if (waited >= SOFT_WAIT && charge('shelfWait', frictionSeverity(waited, SOFT_WAIT, SETTLE_WAIT)) > 0) r.shelfCharged = true;
  }

  function observeRegister(c, r) {
    if (!c || r.registerCharged || c.state !== 'atRegister') return;
    if (r.registerStart == null) r.registerStart = Number(c.patience);
    const waited = Math.max(0, Number(r.registerStart) - Number(c.patience));
    if (waited >= SOFT_WAIT && c.mood === 'wait' && charge('registerWait', frictionSeverity(waited, SOFT_WAIT, 8)) > 0) r.registerCharged = true;
  }

  function settlePenalty(event) {
    const r = recordFor(event.id);
    if (r.substituteCharged) return;
    const c = (G.customers || []).find(x => x && x.id === event.id);
    const stress = c && Number.isFinite(Number(c.patience)) ? Math.max(0, PATIENCE - Number(c.patience)) : SETTLE_WAIT;
    if (charge('substitute', frictionSeverity(stress, SETTLE_WAIT, PATIENCE * 0.75)) > 0) r.substituteCharged = true;
  }

  const observedPush = function serviceFrictionObservedPush(...items) {
    for (const event of items) {
      if (!event || event.id == null) continue;
      if (event.type === 'settled') settlePenalty(event);
      else if (event.type === 'pay') {
        const c = (G.customers || []).find(x => x && x.id === event.id), r = records.get(event.id);
        if (c && r && !r.registerCharged && r.registerStart != null) {
          const waited = Math.max(0, Number(r.registerStart) - Number(c.patience));
          if (waited >= SOFT_WAIT && charge('registerWait', frictionSeverity(waited, SOFT_WAIT, 8)) > 0) r.registerCharged = true;
        }
      }
    }
    return nativePush.apply(this, items);
  };
  events.push = observedPush;

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
      if (events.push === observedPush) events.push = nativePush;
    },
  };
}
