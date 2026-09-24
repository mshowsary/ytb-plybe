// src/ui/modal.js — the one door every sheet opens through.
//
// Before this, pausing depended on which door the player used: the Café menu set G.userPaused, the
// same Pet Book opened from the HUD chip did not, the Shop at the staff desk did not, and the menu
// kept its own pause alive across nested sheets with a MutationObserver. Guests' patience drained
// while the player shopped. Now every sheet (Café card, Shop, Pet Book, Café Stars, pantry, day
// summary) calls openModal/closeModal, and the rule is the same everywhere: while ANY sheet is open
// the café is paused — G.userPaused for the simulation, the 'modal' reason for presentation timers
// — and closing the last one gives both back.
//
// A stack rather than a flag: a sheet can open over another (the summary over the pantry), and
// only the last close resumes play. Escape closes the top sheet only, through the close function
// that sheet registered, so each sheet keeps its own rule for what closing means (the summary's
// close finishes the day).
import { resetActiveInputs } from '../core/input.js';
import { presentationScheduler } from '../core/presentationScheduler.js';

let game = null;
const stack = [];                 // [{ name, close }] — last is on top

const hasDocument = () => typeof document !== 'undefined' && !!document.body;

// A held joystick or key would otherwise resume walking the instant the sheet closes.
function stopOwner() {
  try { resetActiveInputs(); } catch (_) { /* no input bound (tests) */ }
  if (!game) return;
  if (game.P) { game.P.vx = 0; game.P.vz = 0; }
  game._force = null;
}

// main.js binds the game as soon as it exists, before a restore can reopen a terminal day's summary.
export function bindModalHost(G) {
  game = G || null;
  if (game) game.userPaused = stack.length > 0;
}

export function openModal(name, { close = null } = {}) {
  const key = String(name);
  if (stack.some(m => m.name === key)) return false;
  const first = stack.length === 0;
  stack.push({ name: key, close: typeof close === 'function' ? close : null });
  if (first) {
    stopOwner();
    if (game) game.userPaused = true;
    presentationScheduler.setPaused('modal', true);
    if (hasDocument()) document.body.classList.add('modal-open');
  }
  return true;
}

export function closeModal(name) {
  const key = String(name);
  const i = stack.findIndex(m => m.name === key);
  if (i < 0) return false;
  stack.splice(i, 1);
  if (stack.length === 0) {
    stopOwner();
    if (game) game.userPaused = false;
    presentationScheduler.setPaused('modal', false);
    if (hasDocument()) document.body.classList.remove('modal-open');
  }
  return true;
}

export function isModalOpen(name) {
  return name == null ? stack.length > 0 : stack.some(m => m.name === String(name));
}

// One Escape handler for every sheet, capture phase, so a sheet underneath never also closes.
if (hasDocument()) {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !stack.length) return;
    const top = stack[stack.length - 1];
    if (!top.close) return;
    e.preventDefault(); e.stopImmediatePropagation();
    top.close('escape');
  }, true);
}
