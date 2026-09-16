// src/ui/franchiseSheet.js — the Franchise offer (plan §3.11).
//
// This is the one sheet in the game that can take something away, so it is the one sheet that is
// allowed to be WORDY. Program rule 4 bans English on the play field; a modal sheet is exactly
// where prose belongs, and "your café resets" is not a sentence a pictogram can say safely. The
// player must be able to read what they keep and what they lose BEFORE they can act on it.
//
// Structure mirrors ui/pawSheet.js rather than inventing a third overlay pattern: a fixed
// `position:fixed;inset:0` root with a backdrop, one centred card, a fixed head, ONE internal
// scroller, and a fixed action row so the two buttons are always reachable at 280x653 and 653x280
// without scrolling to find them. All CSS lives in src/style.css beside .paw-* (appended by this
// task), not injected.
//
// TWO TAPS TO ACCEPT. The accept button arms first and commits second, and the armed label says
// what the second tap does. A single mis-tap must not be able to reset a café; the decline needs no
// such ceremony because declining is free and reversible.
import { FRANCHISE_MAX_LEVEL } from '../sim/franchise.js';
import { coinIcon, pawIcon, heartIcon, cafeIcon, sparkleIcon, checkIcon, crossIcon } from './icons.js';

const pct = mult => `+${Math.round((mult - 1) * 100)}%`;

// What a branch KEEPS and what it RESETS, as data — the same partition sim/franchise.js enforces,
// written here in the player's language. If the two ever disagree, the sheet is lying about the
// consequences of a destructive action, which is why test/franchise.test.js checks that every line
// here has a counterpart in the simulation's own lists.
export const FRANCHISE_KEEP_LINES = Object.freeze([
  { id: 'petBook', icon: pawIcon, text: 'Your Pet Book, album and every photo' },
  { id: 'accessories', icon: sparkleIcon, text: 'Every accessory you own, still worn' },
  { id: 'followers', icon: heartIcon, text: 'Your followers' },
  { id: 'residents', icon: pawIcon, text: 'Your residents — they visit the new branch' },
  { id: 'decor', icon: cafeIcon, text: 'Your décor unlocks' },
  { id: 'rating', icon: checkIcon, text: 'Your Paw Rating and the Golden Paw' },
]);

export const FRANCHISE_RESET_LINES = Object.freeze([
  { id: 'builds', icon: cafeIcon, text: 'Everything you have built' },
  { id: 'coins', icon: coinIcon, text: 'Your coins' },
  { id: 'staff', icon: crossIcon, text: 'Your staff and their training' },
  { id: 'stars', icon: crossIcon, text: 'Your station stars and machine upgrades' },
]);

/**
 * franchisePreview() -> everything this sheet paints. Pure, so the copy contract is testable.
 * `gain` lines are built from the preview's own numbers rather than authored, so a retuned
 * FRANCHISE_INCOME_PER_LEVEL moves the sheet with it.
 */
export function franchiseSheetModel(preview) {
  const p = preview || {};
  const level = Math.max(0, p.level | 0);
  const nextLevel = Math.max(level, p.nextLevel | 0);
  const maxLevel = p.maxLevel || FRANCHISE_MAX_LEVEL;
  const nextMultiplier = Number.isFinite(p.nextMultiplier) ? p.nextMultiplier : 1;
  return {
    level,
    nextLevel,
    maxLevel,
    offerable: p.offerable !== false,
    signColor: p.signColor || null,
    // "Branch 2", not "Franchise level 1": the player is opening their second café, and the
    // numeral they are about to see over the door is the one that should be in the title.
    branch: nextLevel + 1,
    gains: [
      { id: 'income', icon: coinIcon, text: `${pct(nextMultiplier)} income at every sale, for good` },
      { id: 'residents', icon: pawIcon, text: 'One more resident slot' },
      { id: 'sign', icon: cafeIcon, text: 'A new colour over the door' },
    ],
    keeps: FRANCHISE_KEEP_LINES,
    resets: FRANCHISE_RESET_LINES,
  };
}

function lineEl(line) {
  const row = document.createElement('div');
  row.className = 'fr-line';
  const icon = document.createElement('span');
  icon.className = 'fr-line-icon';
  icon.innerHTML = typeof line.icon === 'function' ? line.icon() : '';
  const text = document.createElement('span');
  text.className = 'fr-line-text';
  text.textContent = line.text;
  row.append(icon, text);
  return row;
}

function sectionEl(title, lines, kind) {
  const section = document.createElement('div');
  section.className = `fr-section is-${kind}`;
  const head = document.createElement('div');
  head.className = 'fr-section-title';
  head.textContent = title;
  section.appendChild(head);
  for (const line of lines) section.appendChild(lineEl(line));
  return section;
}

/**
 * Builds the overlay (hidden) and returns its controls.
 *   open(preview, handlers)  paint from franchisePreview() and show
 *   handlers.onAccept()      the player confirmed (second tap). May return a promise.
 *   handlers.onDecline()     the player declined, or dismissed the sheet.
 *
 * Dismissing (backdrop, ×, Escape) counts as a DECLINE, not as "ask me again in a minute": the
 * offer is surfaced from the day summary, and a sheet that reappeared after a stray tap on the
 * backdrop would be the nagging §3.11 rules out.
 */
export function createFranchiseSheet(root) {
  const host = root || document.body;
  const el = document.createElement('div');
  el.className = 'fr-root hidden';
  el.innerHTML = '<div class="fr-backdrop"></div>'
    + '<div class="fr-card" role="dialog" aria-modal="true" aria-label="Open a second branch">'
    + '<div class="fr-head"><div class="fr-title">Open a Second Branch</div>'
    + '<button class="fr-close" type="button" aria-label="Close">×</button></div>'
    + '<div class="fr-body"></div>'
    + '<div class="fr-actions">'
    + '<button class="fr-decline" type="button">Not now</button>'
    + '<button class="fr-accept" type="button"></button>'
    + '</div></div>';
  host.appendChild(el);

  const bodyEl = el.querySelector('.fr-body');
  const acceptEl = el.querySelector('.fr-accept');
  const declineEl = el.querySelector('.fr-decline');
  let model = null, handlers = {}, armed = false, busy = false;

  const isOpen = () => !el.classList.contains('hidden');

  function paintAccept() {
    acceptEl.classList.toggle('is-armed', armed);
    acceptEl.textContent = armed ? 'Yes — reset my café' : 'Open the branch';
    acceptEl.setAttribute('aria-label', armed
      ? 'Confirm: reset this café and open the new branch'
      : 'Open a new branch. You will be asked to confirm.');
  }

  function disarm() { armed = false; paintAccept(); }

  function hide() { el.classList.add('hidden'); disarm(); }

  function decline() {
    if (busy) return;
    hide();
    if (typeof handlers.onDecline === 'function') handlers.onDecline();
  }

  async function accept() {
    if (busy) return;
    if (!armed) { armed = true; paintAccept(); return; }
    busy = true;
    acceptEl.disabled = true; declineEl.disabled = true;
    try { if (typeof handlers.onAccept === 'function') await handlers.onAccept(); }
    finally {
      busy = false; acceptEl.disabled = false; declineEl.disabled = false;
      hide();
    }
  }

  el.querySelector('.fr-close').addEventListener('click', decline);
  el.querySelector('.fr-backdrop').addEventListener('click', decline);
  declineEl.addEventListener('click', decline);
  acceptEl.addEventListener('click', accept);
  // Capture phase + stopPropagation, exactly like pawSheet.js: this overlay sits above the sheets
  // root and its Escape must not also close the day summary underneath it.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { decline(); e.stopPropagation(); }
  }, true);

  function render() {
    if (!model) return;
    bodyEl.textContent = '';
    const lead = document.createElement('p');
    lead.className = 'fr-lead';
    lead.textContent = `Open Branch ${model.branch}: a brand-new café, in a brand-new place. `
      + 'Your pets come with you. The building does not.';
    bodyEl.appendChild(lead);
    bodyEl.appendChild(sectionEl('You gain, permanently', model.gains, 'gain'));
    bodyEl.appendChild(sectionEl('You keep', model.keeps, 'keep'));
    bodyEl.appendChild(sectionEl('You start again with', model.resets, 'reset'));
    const foot = document.createElement('p');
    foot.className = 'fr-foot';
    foot.textContent = model.nextLevel >= model.maxLevel
      ? 'This is the last branch — the income bonus stops here.'
      : `You can do this ${model.maxLevel - model.nextLevel} more time${model.maxLevel - model.nextLevel === 1 ? '' : 's'} after this one.`;
    bodyEl.appendChild(foot);
    paintAccept();
  }

  const setModel = preview => { model = franchiseSheetModel(preview); render(); };

  return {
    el,
    setModel,
    open(preview, nextHandlers = {}) {
      handlers = nextHandlers || {};
      if (preview !== undefined) setModel(preview);
      armed = false; paintAccept();
      bodyEl.scrollTop = 0;
      el.classList.remove('hidden');
    },
    close: hide,
    get isOpen() { return isOpen(); },
    get isArmed() { return armed; },
  };
}
