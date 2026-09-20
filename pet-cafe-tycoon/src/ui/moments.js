// src/ui/moments.js — one queue for everything that celebrates over the play field.
//
// Banners, toasts, pet discoveries, friendship level-ups and photo reveals used to be five systems
// with five timers. Three toasts shared one screen position (bottom:172px) and overlapped whenever a
// seated visit fired a discovery and a level-up together; banners kept firing over the day summary
// and, at 380 px, over the wallet. Now each one is an item in this queue:
//
//   * ONE AT A TIME. The next item starts only after the previous one has left the screen.
//   * HELD UNDER ANY SHEET. While a modal is open (ui/modal.js) nothing new starts, the item on
//     screen is hidden (body.modal-open .moment in style.css) and its timer is frozen, because every
//     timer here runs on the presentation scheduler, which the modal pauses. Closing the sheet
//     resumes it with the time it had left.
//   * BOUNDED. At most MOMENT_QUEUE_MAX items wait. When a burst overflows it, the oldest banner or
//     toast is dropped — a pet or photo reveal never is: those are the moments the game is for.
//
// Two item shapes:
//   timed     { kind, key, ms, outMs, show(), hide(), after() }  the queue owns the clock
//   self-run  { kind, key, run(done) }                           the item calls done() itself
import { presentationScheduler } from '../core/presentationScheduler.js';
import { paintCue, isCue } from './hud.js';
import { isModalOpen } from './modal.js';

export const MOMENT_QUEUE_MAX = 4;
const DROPPABLE = new Set(['banner', 'toast']);

// Pure: the clock and the hold are injected so the ordering rule is testable without a DOM.
export function createMomentQueue({ schedule, cancel = () => {}, held = () => false, whenFree = null } = {}) {
  const pending = [];
  let active = null, timer = null, waiting = false;

  function finish(item) {
    if (active !== item) return;
    active = null; timer = null;
    pump();
  }

  function start(item) {
    active = item;
    if (typeof item.run === 'function') {
      let done = false;
      item.run(() => { if (done) return; done = true; finish(item); });
      return;
    }
    item.show?.();
    timer = schedule(() => {
      item.hide?.();
      timer = schedule(() => { item.after?.(); finish(item); }, Math.max(0, item.outMs | 0));
    }, Math.max(0, item.ms | 0));
  }

  function pump() {
    if (active || !pending.length) return;
    if (held()) {
      // Parked until the sheet (or the host pause) lets go — one waiter, however many pushes.
      if (!waiting && typeof whenFree === 'function') { waiting = true; whenFree(() => { waiting = false; pump(); }); }
      return;
    }
    start(pending.shift());
  }

  function push(item) {
    if (!item) return false;
    // The same moment twice in a row (two "Rush hour" banners, a toast repeated by a double tap) is
    // one moment.
    if (item.key && ((active && active.key === item.key) || pending.some(p => p.key === item.key))) return false;
    pending.push(item);
    while (pending.length > MOMENT_QUEUE_MAX) {
      const i = pending.findIndex(p => DROPPABLE.has(p.kind));
      if (i < 0) break;
      pending.splice(i, 1);
    }
    pump();
    return true;
  }

  return {
    push, pump,
    get active() { return active; },
    get pending() { return pending.slice(); },
    clear() { pending.length = 0; if (timer != null) cancel(timer); timer = null; active = null; },
  };
}

// ---- the game's queue and its two shared sinks --------------------------------------------------
export const momentQueue = createMomentQueue({
  schedule: (fn, ms) => presentationScheduler.schedule(fn, ms),
  cancel: id => presentationScheduler.cancel(id),
  held: () => isModalOpen() || presentationScheduler.paused,
  whenFree: fn => presentationScheduler.whenResumed().then(fn),
});

const keyOf = value => (isCue(value) ? value.aria : String(value ?? ''));

// The banner (top centre) and the toast (bottom centre) are the two shared sinks. Created on first
// use inside #hud so they sit under every sheet; both are live regions, because their glyphs are
// aria-hidden and the sentence a cue carries is the only thing a screen reader can announce.
let bannerEl = null, toastEl = null;
function sink(which) {
  if (typeof document === 'undefined') return null;
  if (which === 'banner' && bannerEl) return bannerEl;
  if (which === 'toast' && toastEl) return toastEl;
  const host = document.getElementById('hud') || document.body;
  const el = document.createElement('div');
  if (which === 'banner') { el.id = 'banner'; el.className = 'pill moment hidden'; bannerEl = el; }
  else { el.className = 'toast moment hidden'; toastEl = el; }
  el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  host.appendChild(el);
  return el;
}

function timedSink(which, value, ms, outMs, tone) {
  const el = sink(which);
  if (!el) return false;
  return momentQueue.push({
    kind: which, key: `${which}:${tone || ''}:${keyOf(value)}`, ms, outMs,
    show() {
      paintCue(el, value);
      el.classList.toggle('toast-friend', tone === 'friend');
      el.classList.remove('hidden');
      void el.offsetWidth; // restart the entrance transition
      el.classList.add('show');
    },
    hide() { el.classList.remove('show'); },
    after() { el.classList.add('hidden'); },
  });
}

// Loop v2's banner timing (slide in, hold `ms`, slide out) and toast timing, now queued.
export const showBanner = (value, ms = 2500) => timedSink('banner', value, ms, 400);
export const showToast = (value, ms = 1300, tone = '') => timedSink('toast', value, ms, 200, tone);
// A self-timed moment (a card reveal): `run(done)` owns its own animation and calls done() when the
// screen is clear again. Timers inside it should use presentationScheduler so a sheet freezes them.
export const runMoment = (kind, key, run) => momentQueue.push({ kind, key, run });
