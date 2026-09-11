// src/systems/franchise.js — the bridge between the Franchise offer (ui/franchiseSheet.js), the
// reset itself (sim/franchise.js) and the live game.
//
// WHERE THE OFFER APPEARS, AND WHY ONLY THERE
// In the DAY SUMMARY, as one row under the Golden Paw award, and nowhere else. The summary is the
// only moment in the loop where the player is already reading a report with the shift behind them
// and nothing at stake on the floor; §3.11's "offered, never forced" is unenforceable anywhere
// else. It never auto-opens: the row carries a button, the button opens the sheet, and the sheet
// still needs a second tap to commit. Three deliberate acts to reset a café.
//
// HOW THE RESET IS APPLIED
// openFranchise() produces the new state; G.restore() applies it. Nothing here touches the world,
// the stations, the HUD or the scene directly, because G.restore is already the one code path that
// rebuilds all of them together (world.built, station state, owner state, visuals, zones, regions,
// the wallet, the presentation syncs). A hand-rolled reset would have to reproduce every one of
// those steps and would drift from the restore path the first time either changed.
//
// The attach mirrors systems/goldenPaw.js's attachSummaryAward, including its retry through
// core/presentationScheduler.js: ui/sheets.js builds the summary card a frame or two after
// openDaySummary() returns, and a host pause must hold the retry rather than age it away behind an
// ad overlay.
import { presentationScheduler } from '../core/presentationScheduler.js';
import {
  declineFranchise, franchiseOfferable, franchisePreview, openFranchise,
} from '../sim/franchise.js';
import { createFranchiseSheet } from '../ui/franchiseSheet.js';
import { cafeIcon } from '../ui/icons.js';

const ROW_CLASS = 'franchise-offer';

/**
 * @param {object} G  the live game (read fresh every time: G.restore replaces G.meta wholesale).
 * @param {object} deps
 *   sheet   an object with .open(preview, handlers) — defaults to a real ui/franchiseSheet.js.
 *           Injected so node tests can drive the bridge without a DOM overlay.
 *   onOpened(result)  optional notification after a successful branch (audio, analytics).
 */
export function createFranchiseBridge(G, deps = {}) {
  const hasDom = typeof document !== 'undefined';
  const sheet = deps.sheet || (hasDom ? createFranchiseSheet() : null);
  // Session-only, alongside the meta flag sim/franchise.js documents: the meta flag is what the
  // rest of the game asks ("has this player said no?"), this one keeps the DOM row from being
  // rebuilt on the same summary after it has been used.
  let attachedDay = 0;
  let lastResult = null;

  const meta = () => (G && G.meta && typeof G.meta === 'object' ? G.meta : null);

  /** The whole trigger: a settled shift, a Golden Paw, room to grow, no decline yet. */
  function offerReady() {
    const m = meta();
    if (!m || !franchiseOfferable(m)) return false;
    // `_ended` is the settled-shift latch game.js sets before it opens the summary. Requiring it is
    // what makes "never auto-open mid-shift" structural rather than a promise.
    return !!(G.dayState && G.dayState._ended);
  }

  function openSheet() {
    if (!sheet || !offerReady()) return false;
    sheet.open(franchisePreview(meta()), { onAccept: accept, onDecline: decline });
    return true;
  }

  function decline() {
    const m = meta();
    if (!m) return false;
    declineFranchise(m);
    removeRow();
    return true;
  }

  /**
   * The reset. Snapshot -> transform -> restore, and nothing in between: if openFranchise refuses,
   * or the restore boundary rejects the state it produced, the café is exactly as it was — the
   * snapshot was never applied, and G.restore validates before it writes.
   */
  function accept() {
    const m = meta();
    if (!m || typeof G.snapshot !== 'function' || typeof G.restore !== 'function') return false;
    if (!franchiseOfferable(m)) return false;
    const result = openFranchise(G.snapshot(), G.world);
    if (!result.ok) return false;
    // A field in neither the keep-list nor the reset-list would be silently dropped. Refuse rather
    // than half-reset a café: sim/franchise.js reports it, test/franchise.test.js and
    // tools/franchise-smoke.mjs assert it is empty, and if one ever slips through in production the
    // player keeps their café instead of losing an unnamed piece of it.
    if (result.unknown.length) {
      console.warn('Pet Café franchise refused: unnamed save fields', result.unknown);
      return false;
    }
    if (G.restore(result.save) === false) return false;
    lastResult = result;
    removeRow();
    if (G.audio && typeof G.audio.play === 'function') G.audio.play('chime');
    // Durable state written outside settlement, exactly like the Golden Paw award: mark the
    // checkpoint and let game.js serialize at its own post-update boundary.
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('franchise');
    if (typeof deps.onOpened === 'function') deps.onOpened(result);
    return true;
  }

  // ---- the summary row ------------------------------------------------------------------------

  function removeRow() {
    if (!hasDom) return;
    for (const node of document.querySelectorAll(`.${ROW_CLASS}`)) node.remove();
  }

  function buildRow() {
    const row = document.createElement('div');
    row.className = ROW_CLASS;
    const copy = document.createElement('div');
    copy.className = 'franchise-offer-copy';
    const kicker = document.createElement('div');
    kicker.className = 'franchise-offer-kicker';
    kicker.textContent = 'NEW BRANCH';
    const sub = document.createElement('div');
    sub.className = 'franchise-offer-sub';
    sub.textContent = 'Start a new café. Keep your pets.';
    copy.append(kicker, sub);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'franchise-offer-btn';
    btn.innerHTML = `<span class="franchise-offer-ico">${cafeIcon()}</span><span>Look</span>`;
    btn.setAttribute('aria-label', 'Open a second branch — read what it changes');
    btn.addEventListener('click', () => openSheet());
    row.append(copy, btn);
    return row;
  }

  function attachRow(tries = 0) {
    if (!hasDom) return;
    const card = document.querySelector('.sheet-root .card');
    if (!card) {
      if (tries < 24) presentationScheduler.schedule(() => attachRow(tries + 1), 25);
      return;
    }
    if (card.querySelector(`.${ROW_CLASS}`)) return;
    const row = buildRow();
    // Under the Golden Paw award (the headline of this summary) and above the rewarded-ad offer,
    // which must stay the last thing thumbed — the same placement rule systems/goldenPaw.js follows.
    const award = card.querySelector('.golden-paw-award');
    const reward = card.querySelector('.meta-reward');
    if (award) award.after(row);
    else if (reward) reward.before(row);
    else card.appendChild(row);
  }

  /** Stepped from the main loop, like every other system. Cheap: three field reads on most frames. */
  function update() {
    if (!offerReady()) {
      // The summary closed (or the offer was declined): forget the day so a LATER settled shift can
      // offer again, and drop a row that outlived its card.
      if (attachedDay) { attachedDay = 0; removeRow(); }
      return;
    }
    const day = (G.dayState && G.dayState.day) | 0;
    if (attachedDay === day) return;
    attachedDay = day;
    attachRow();
  }

  /** main.js calls this after G.restore, alongside goldenPaw.refresh(). */
  function refresh() {
    attachedDay = 0;
    removeRow();
  }

  return {
    update,
    refresh,
    openSheet,
    accept,
    decline,
    get sheet() { return sheet; },
    get lastResult() { return lastResult; },
    destroy() { removeRow(); },
  };
}
