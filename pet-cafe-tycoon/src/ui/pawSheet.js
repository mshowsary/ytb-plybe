// src/ui/pawSheet.js — the Paw Rating sheet: what the goal IS, and how close the player is.
//
// Two things and nothing else:
//   1. the rating, as five paws, filled up to meta.pawBest (the RATCHET — never `live`);
//   2. for the NEXT star, one row per requirement: an icon, current/target numerals, met state.
//
// NO SENTENCES. Every requirement pawRating.js emits is already a numeral pair plus a `kind`, so a
// row is a glyph for the kind and two numbers — the same wordless treatment the wish bubbles and
// the chalkboards use on the play field. The only English in the file is the overlay title (menus
// are allowed prose where the surrounding menu already has it — see .career-title/.meta-book-title)
// and aria-labels, which are never painted.
//
// Structure follows the two existing overlays exactly rather than inventing a third pattern:
// meta.js's book overlay and career.js's journey card are both `position:fixed;inset:0` roots with
// a backdrop plus one centred card that owns its own scrolling. This is that, with the card split
// into a fixed head/paw-row and ONE internal scroller (.paw-list) so the certification audit's
// smallest viewports (280x653 and 653x280) scroll the list instead of the page. All CSS lives in
// src/style.css next to .sheet/.card, not injected, because that file is this task's to append to.
import { PAW_MAX_STAR, pawVisibleRequirements } from '../sim/pawRating.js';
import { pawIcon, heartIcon, personIcon, sparkleIcon, checkIcon } from './icons.js';

// ---- glyphs ---------------------------------------------------------------------------------
// icons.js is not this task's file, so the kinds it has no glyph for are drawn here in its idiom
// (24x24 viewBox, aria-hidden, flat fills). If a kind ever loses its icon the row would render an
// empty box, so ICONS is exhaustive over PAW_REQUIREMENT_KINDS and a test asserts that.
const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

const roomsIcon = () => svg('<rect x="3" y="3" width="8" height="8" rx="2" fill="#8B7CF6"/><rect x="13" y="3" width="8" height="8" rx="2" fill="#B7ACFB"/><rect x="3" y="13" width="8" height="8" rx="2" fill="#B7ACFB"/><rect x="13" y="13" width="8" height="8" rx="2" fill="#8B7CF6"/>');
const zoneIcon = () => svg('<path d="M3 10l9-6 9 6v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="#E9954A"/><path d="M3 10h18l-1.6-2.2H4.6z" fill="#FF8A80"/>');
const cameraIcon = () => svg('<rect x="2.5" y="7" width="19" height="13" rx="3" fill="#5B4AB6"/><path d="M9 7l1.4-2.2h3.2L15 7z" fill="#5B4AB6"/><circle cx="12" cy="13.5" r="4.2" fill="#FFF4E6"/><circle cx="12" cy="13.5" r="2.2" fill="#8B7CF6"/>');
const seatIcon = () => svg('<path d="M6 4h12v7H6z" fill="#C38D9E"/><rect x="4" y="11" width="16" height="4" rx="1.6" fill="#9F6B7C"/><path d="M6 15v5M18 15v5" stroke="#9F6B7C" stroke-width="2.2" stroke-linecap="round"/>');
const bookIcon = () => svg('<path d="M4 4h6.5a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2H4z" fill="#FFF4E6" stroke="#7A583A" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 4h-6.5A2.5 2.5 0 0 0 11 6.5V20a2 2 0 0 1 2-2h7z" fill="#F4EAE6" stroke="#7A583A" stroke-width="1.6" stroke-linejoin="round"/><circle cx="16.4" cy="10.4" r="1.5" fill="#C97A3A"/><circle cx="19" cy="12.6" r="1.1" fill="#C97A3A"/>');
const cupIcon = () => svg('<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="#EFB928"/><path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10" fill="none" stroke="#C98A00" stroke-width="1.8"/><path d="M11 14h2v4h-2z" fill="#C98A00"/><rect x="7.5" y="18" width="9" height="3" rx="1.2" fill="#C98A00"/>');
const albumIcon = () => svg('<rect x="3.5" y="6" width="13" height="12" rx="2" fill="#F4EAE6" stroke="#7A583A" stroke-width="1.5" transform="rotate(-7 10 12)"/><rect x="7.5" y="5" width="13" height="12" rx="2" fill="#FFF4E6" stroke="#7A583A" stroke-width="1.5"/><circle cx="11.6" cy="9" r="1.5" fill="#FFB300"/><path d="M8.6 15l3.2-3.4 2.4 2.3 2-1.7 3 2.8z" fill="#8B7CF6"/>');
const followersIcon = () => svg('<circle cx="8" cy="8.6" r="3" fill="#6B4A2B"/><path d="M2.6 19c0-3.2 2.4-5.2 5.4-5.2s5.4 2 5.4 5.2" fill="none" stroke="#6B4A2B" stroke-width="2.2" stroke-linecap="round"/><circle cx="16.6" cy="9.6" r="2.4" fill="#C97A3A"/><path d="M13.6 18.4c.3-2.6 1.9-4 3.9-4 2.3 0 3.9 1.7 3.9 4.4" fill="none" stroke="#C97A3A" stroke-width="2" stroke-linecap="round"/>');

// kind -> glyph. Keys are exactly PAW_REQUIREMENT_KINDS.
export const PAW_ROW_ICONS = Object.freeze({
  guests: personIcon,
  zoneSet: roomsIcon,
  bestie: heartIcon,
  zone: zoneIcon,
  photos: cameraIcon,
  seatMiss: seatIcon,
  petBook: bookIcon,
  cup: cupIcon,
  album: albumIcon,
  perfect: sparkleIcon,
  followers: followersIcon,
});

// Met / not yet / cannot be judged yet. The third state exists because pawRating.js marks the ★3
// seat window `pending` until a full 7-day run has been settled: its numeral is real but it has
// not been judged, so it gets a "waiting" mark rather than an empty circle that reads as failure.
const MARK_MET = () => checkIcon();
const MARK_UNMET = () => svg('<circle cx="12" cy="12" r="8.2" fill="none" stroke="#3B2E2A" stroke-opacity=".22" stroke-width="2.4"/>');
const MARK_PENDING = () => svg('<circle cx="12" cy="12" r="8.2" fill="none" stroke="#3B2E2A" stroke-opacity=".22" stroke-width="2.4"/><circle cx="8.6" cy="12" r="1.15" fill="#3B2E2A" fill-opacity=".38"/><circle cx="12" cy="12" r="1.15" fill="#3B2E2A" fill-opacity=".38"/><circle cx="15.4" cy="12" r="1.15" fill="#3B2E2A" fill-opacity=".38"/>');
const ROW_MARKS = { met: MARK_MET, unmet: MARK_UNMET, pending: MARK_PENDING };

// ---- pure view model ------------------------------------------------------------------------

const clamp01 = n => (n <= 0 ? 0 : n >= 1 ? 1 : n);
const num = n => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
const clampStar = n => Math.max(0, Math.min(PAW_MAX_STAR, num(n)));
// Thousands separators only — 2,000 is still a numeral in every language the game ships to.
const fmt = n => num(n).toLocaleString('en-US');

/**
 * pawRatingState() -> everything this sheet paints. Pure: no DOM, so the row contract is testable.
 *   best/next/total  the ratchet, the star being worked toward (null at ★5), and the ceiling
 *   complete         ★5 held: there is no next tier and no checklist
 *   paws             five pips, `filled` up to best, `next` marking the one being earned
 *   rows             one per VISIBLE requirement (skipped rows name absent content and draw nothing)
 */
export function pawSheetModel(state) {
  const s = state || {};
  const best = clampStar(s.best);
  // `next: null` from pawRatingState means ★5 — a real value, not a missing one. Only a caller that
  // omitted the key entirely gets it derived here.
  const next = s.next === undefined ? (best < PAW_MAX_STAR ? best + 1 : null) : (s.next == null ? null : clampStar(s.next));
  const paws = [];
  for (let star = 1; star <= PAW_MAX_STAR; star++) paws.push({ star, filled: star <= best, next: star === next });
  return {
    best,
    next,
    total: PAW_MAX_STAR,
    complete: next === null,
    ceremonyDue: s.ceremonyDue === true,
    paws,
    rows: pawVisibleRequirements(s.requirements).map(pawSheetRow),
  };
}

/** One requirement descriptor -> one row. Numerals stay numerals; nothing here produces prose. */
export function pawSheetRow(req) {
  const compare = req && req.compare === 'lte' ? 'lte' : 'gte';
  const current = num(req && req.current);
  const target = num(req && req.target);
  // pending wins over met for display: pawRating.js documents "draw unmet, no tick" for a window
  // that has not closed yet, and a tick on an unjudged row would promise a star that is not owed.
  const state = req && req.pending ? 'pending' : (req && req.met ? 'met' : 'unmet');
  const frac = compare === 'lte'
    // Fewer-is-better has no honest partial fill: 2 of 3 allowed misses is not "67% done", it is
    // closer to failing. The bar is binary for these, and the numerals carry the detail.
    ? (state === 'met' ? 1 : 0)
    : (target > 0 ? clamp01(current / target) : (state === 'met' ? 1 : 0));
  return {
    id: (req && req.id) || '',
    kind: (req && req.kind) || '',
    zoneId: (req && req.zoneId) || null,
    current, target, compare, state, frac,
  };
}

/** The three painted numerals of a row. `≤` (not `/`) is how a fewer-is-better row says so. */
export function pawRowNumerals(row) {
  return { current: fmt(row.current), sep: row.compare === 'lte' ? '≤' : '/', target: fmt(row.target) };
}

/** Glyph for a row, or null if the kind is unknown (the row then draws no icon rather than junk). */
export function pawRowIcon(kind) {
  const make = PAW_ROW_ICONS[kind];
  return typeof make === 'function' ? make() : null;
}

// ---- overlay --------------------------------------------------------------------------------

const ROW_ARIA = { met: 'complete', unmet: 'in progress', pending: 'not measured yet' };

/**
 * Builds the overlay (hidden) and returns its controls. Nothing is opened until the caller asks.
 *   open(state) / refresh(state)  paint from a pawRatingState() result
 *   attachOpener(el)              make an existing HUD element open it (see .meta-reputation in
 *                                 career.js) — deliberately no new fixed HUD button, because a
 *                                 second floating chip is exactly what collides at 653x280.
 */
export function createPawSheet(root) {
  const host = root || document.body;
  const el = document.createElement('div');
  el.className = 'paw-root hidden';
  el.innerHTML = '<div class="paw-backdrop"></div>'
    + '<div class="paw-card" role="dialog" aria-modal="true" aria-label="Paw Rating">'
    + '<div class="paw-head"><div class="paw-title">Paw Rating</div>'
    + '<button class="paw-close" type="button" aria-label="Close">×</button></div>'
    + '<div class="paw-stars" role="img"></div>'
    + '<div class="paw-list"></div>'
    + '</div>';
  host.appendChild(el);

  const starsEl = el.querySelector('.paw-stars');
  const listEl = el.querySelector('.paw-list');
  let model = null;

  const isOpen = () => !el.classList.contains('hidden');
  const close = () => el.classList.add('hidden');
  const openEl = () => el.classList.remove('hidden');

  el.querySelector('.paw-close').addEventListener('click', close);
  el.querySelector('.paw-backdrop').addEventListener('click', close);
  // Capture phase and stopPropagation, exactly like career.js: this overlay sits above the sheets
  // root, so its Escape must not also close whatever is underneath it.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { close(); e.stopPropagation(); }
  }, true);

  function rowEl(r) {
    const row = document.createElement('div');
    row.className = `paw-req is-${r.state}`;
    row.dataset.req = r.id;
    const n = pawRowNumerals(r);
    row.setAttribute('aria-label', `${n.current} of ${n.target}, ${ROW_ARIA[r.state] || ROW_ARIA.unmet}`);

    const icon = document.createElement('span');
    icon.className = 'paw-req-icon';
    const glyph = pawRowIcon(r.kind);
    if (glyph) icon.innerHTML = glyph;

    const body = document.createElement('span');
    body.className = 'paw-req-body';
    const nums = document.createElement('span');
    nums.className = 'paw-req-num';
    const cur = document.createElement('span'); cur.className = 'paw-cur'; cur.textContent = n.current;
    const sep = document.createElement('span'); sep.className = 'paw-sep'; sep.textContent = n.sep;
    const tgt = document.createElement('span'); tgt.className = 'paw-tgt'; tgt.textContent = n.target;
    nums.append(cur, sep, tgt);
    const bar = document.createElement('span'); bar.className = 'paw-req-bar';
    const fill = document.createElement('span'); fill.style.width = `${Math.round(r.frac * 100)}%`;
    bar.appendChild(fill);
    body.append(nums, bar);

    const mark = document.createElement('span');
    mark.className = 'paw-req-mark';
    mark.innerHTML = (ROW_MARKS[r.state] || MARK_UNMET)();

    row.append(icon, body, mark);
    return row;
  }

  function render() {
    if (!model) return;
    starsEl.textContent = '';
    starsEl.setAttribute('aria-label', `Paw rating ${model.best} of ${model.total}`);
    // ★5 turns the whole row gold. It is the only payoff the sheet can give without words, and it
    // is what the Golden Paw ceremony is named after.
    starsEl.classList.toggle('is-golden', model.complete);
    for (const p of model.paws) {
      const pip = document.createElement('span');
      pip.className = 'paw-pip' + (p.filled ? ' filled' : '') + (p.next ? ' next' : '');
      pip.innerHTML = pawIcon();
      starsEl.appendChild(pip);
    }
    // Repainting drops the scroller's position; a refresh mid-shift should not jump the list.
    const scrollTop = listEl.scrollTop;
    listEl.textContent = '';
    if (model.complete) {
      const done = document.createElement('div');
      done.className = 'paw-complete';
      done.setAttribute('role', 'img');
      done.setAttribute('aria-label', 'Golden Paw earned');
      const a = document.createElement('span'); a.innerHTML = pawIcon();
      const b = document.createElement('span'); b.className = 'paw-complete-spark'; b.innerHTML = sparkleIcon();
      done.append(a, b);
      listEl.appendChild(done);
    } else {
      for (const r of model.rows) listEl.appendChild(rowEl(r));
    }
    listEl.scrollTop = scrollTop;
  }

  const setModel = state => { model = pawSheetModel(state); render(); };

  return {
    el,
    setModel,
    open(state) { if (state !== undefined) setModel(state); openEl(); },
    close,
    refresh(state) { if (state !== undefined) setModel(state); },
    get isOpen() { return isOpen(); },
    // Mirrors createCareerUI()'s treatment of the reputation chip: an existing element becomes the
    // opener, so no new tap target is added to the HUD.
    attachOpener(opener) {
      if (!opener) return;
      opener.classList.add('paw-openable');
      opener.tabIndex = 0;
      if (!opener.getAttribute('role')) opener.setAttribute('role', 'button');
      opener.addEventListener('click', () => openEl());
      opener.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEl(); }
      });
    },
  };
}
