// Bottom sheets: the Shop and the end-of-day card. Every one opens through ui/modal.js, so the café
// pauses behind it whichever door opened it. The PANTRY sheet -- a bottom sheet with one or two
// rows, for a choice the game could already make -- went with the pantry's SUPPLIES button
// (docs/SHIP-PLAN-2026-09-19.md §1.4): stopping at the pantry now hands the sack over directly.
import { iconFor, checkIcon, lockIcon, starIcon, calendarIcon } from './icons.js';
import { decorCatalogue } from '../../data/decor.js';
import { renderDaySummary } from './daySummary.js';
import { openModal, closeModal } from './modal.js';
import { SHOP_TABS, normalizeShopTab } from './models.js';
import { zoneGlyph } from './hud.js';
const COIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/></svg>';
const CHEVRON_DOWN_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const fmt = n => Math.round(n).toLocaleString('en-US');

function makeClose(onClose) {
  const b = document.createElement('button'); b.className = 'sclose'; b.type = 'button'; b.setAttribute('aria-label', 'Close');
  b.innerHTML = CHEVRON_DOWN_SVG; b.addEventListener('click', () => onClose('close')); return b;
}
function shell(kind, titleText, onClose) {
  const el = document.createElement('div'); const isCard = kind === 'summary';
  el.className = isCard ? 'card' : 'sheet'; el.appendChild(makeClose(onClose));
  const title = document.createElement('div'); title.className = isCard ? 'ctitle' : 'stitle'; title.textContent = titleText; el.appendChild(title); return el;
}
function actionButton(className, content, disabled, onClick) {
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = className; btn.disabled = disabled;
  if (content && content.html) btn.innerHTML = content.html; else btn.textContent = content;
  btn.addEventListener('click', onClick); return btn;
}
function priceContent(cost) { return { html: `${COIN_SVG}<span>${fmt(cost)}</span>` }; }
function iconSpan(svg) { return `<span class="sicon">${svg}</span>`; }
function tierDots(tier, maxTier) {
  const dots = document.createElement('div'); dots.className = 'tier-dots';
  for (let i = 0; i < maxTier; i++) { const d = document.createElement('span'); d.className = 'tdot' + (i < tier ? ' filled' : ''); dots.appendChild(d); }
  return dots;
}
function levelSubrow(name, lv, onBuy) {
  const sub = document.createElement('div'); sub.className = 'subrow';
  const left = document.createElement('div'); left.className = 'sublabel'; left.textContent = `${name} ${lv.tier}/${lv.maxTier}`; sub.appendChild(left);
  if (lv.cost === null) { const tag = document.createElement('span'); tag.className = 'srow-max'; tag.textContent = 'MAX'; sub.appendChild(tag); }
  else sub.appendChild(actionButton('subbtn', priceContent(lv.cost), lv.disabled, onBuy));
  return sub;
}

const TAB_LABEL = { staff: 'Staff', upgrades: 'Upgrades', decor: 'Décor' };
// Titled by the door that opened it: the staff desk opens "Staff", everything else "Shop". The door
// is fixed when the sheet opens, so switching tabs never renames the sheet under the player's thumb.
export function shopTitle(door) { return door === 'staff' ? 'Staff' : 'Shop'; }

// ---- the locked teaser -------------------------------------------------------------------------
// One per tab: the next thing on that shelf, greyed, with a padlock and a picture of what opens it —
// a build (that zone's own glyph), a day number, or a Café Star. No sentence.
function unlockCells(unlock) {
  if (!unlock) return '';
  if (unlock.kind === 'zone') return iconSpan(zoneGlyph(unlock.zoneId));
  if (unlock.kind === 'day') return `${iconSpan(calendarIcon())}<span class="teaser-num">${unlock.day}</span>`;
  if (unlock.kind === 'star') return `${iconSpan(starIcon())}<span class="teaser-num">${unlock.star}</span>`;
  return '';
}
function unlockAria(unlock) {
  if (!unlock) return 'locked';
  if (unlock.kind === 'zone') return 'unlocks with a new build';
  if (unlock.kind === 'day') return `unlocks on day ${unlock.day}`;
  if (unlock.kind === 'star') return `unlocks at Café Star ${unlock.star}`;
  return 'locked';
}
function teaserRow(teaser, art) {
  const row = document.createElement('div'); row.className = 'srow srow-locked';
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `${teaser.label || 'Next item'}, ${unlockAria(teaser.unlock)}`);
  const info = document.createElement('div'); info.className = 'srow-info srow-teaser-info';
  if (art) info.innerHTML = `<span class="teaser-art">${art}</span>`;
  if (teaser.label) { const label = document.createElement('div'); label.className = 'srow-label'; label.textContent = teaser.label; info.appendChild(label); }
  const lock = document.createElement('div'); lock.className = 'teaser-lock';
  lock.innerHTML = iconSpan(lockIcon()) + unlockCells(teaser.unlock);
  row.append(info, lock);
  return row;
}

// --- decor tab (plan 3.12) --------------------------------------------------------------------
// Decor is the 60-900 coin filler that fixes the measured "nothing to buy on days 2-6" gap. Its
// rows are ICON + NUMERAL only: a glyph of the piece, its price, a buy button and an owned check.
// No item names, so the tab needs no localisation and reads exactly like the wish bubbles do.
//
// The CSS is injected from here rather than added to style.css, so this tab owns its own
// presentation and cannot collide with another surface's rules.
const DECOR_CSS = [
  '.decor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;padding:2px 0}',
  '.decor-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 6px;border-radius:14px;background:rgba(255,255,255,.72);box-shadow:inset 0 0 0 2px rgba(59,46,42,.10)}',
  '.decor-card.is-owned{background:rgba(127,214,154,.22);box-shadow:inset 0 0 0 2px rgba(46,204,113,.45)}',
  '.decor-card .decor-art{width:44px;height:44px;display:block}',
  '.decor-card .decor-art svg{width:100%;height:100%;display:block}',
  '.decor-card .sbtn{min-width:74px;justify-content:center}',
  '.decor-check{width:26px;height:26px;display:block}',
  '.decor-check svg{width:100%;height:100%;display:block}',
  '.decor-card.is-locked{background:rgba(59,46,42,.06);box-shadow:none}',
  '.decor-card.is-locked .decor-art{opacity:.35;filter:grayscale(1)}',
].join('\n');
let decorCssInjected = false;
function ensureDecorCss() {
  if (decorCssInjected || typeof document === 'undefined' || !document.head) return;
  decorCssInjected = true;
  const style = document.createElement('style');
  style.dataset.sheet = 'decor';
  style.textContent = DECOR_CSS;
  document.head.appendChild(style);
}

// Rows come from the kiosk model when it supplies them; otherwise they are derived here from the
// catalogue plus the owned-id list, so the tab lists correctly even before that wiring lands.
// Terrace rows never appear: decorCatalogue() drops anything whose gating zone is not built.
export function decorRows(model) {
  if (Array.isArray(model && model.decor)) return model.decor;
  const owned = new Set(Array.isArray(model && model.decorOwned) ? model.decorOwned : []);
  const coins = (model && model.coins) || 0;
  return decorCatalogue((model && model.built) || null, (model && model.pawBest) | 0).map(item => ({
    id: item.id, price: item.price, icon: item.icon,
    owned: owned.has(item.id),
    disabled: owned.has(item.id) || coins < item.price,
  }));
}

function renderDecorTab(rows, model, actions) {
  ensureDecorCss();
  const grid = document.createElement('div'); grid.className = 'decor-grid';
  const teaser = model.decorTeaser;
  for (const r of decorRows(model)) {
    const card = document.createElement('div');
    card.className = 'decor-card' + (r.owned ? ' is-owned' : '');
    card.dataset.decor = r.id;
    const art = document.createElement('span'); art.className = 'decor-art'; art.innerHTML = r.icon;
    card.appendChild(art);
    if (r.owned) {
      const done = document.createElement('span');
      done.className = 'decor-check'; done.innerHTML = checkIcon();
      done.setAttribute('aria-label', 'Owned');
      card.appendChild(done);
    } else {
      const btn = actionButton('sbtn buy', priceContent(r.price), !!r.disabled, () => {
        if (actions && typeof actions.buyDecor === 'function') actions.buyDecor(r.id);
      });
      btn.dataset.decorBuy = r.id;
      card.appendChild(btn);
    }
    grid.appendChild(card);
  }
  if (teaser) {
    const card = document.createElement('div'); card.className = 'decor-card is-locked';
    card.setAttribute('role', 'img'); card.setAttribute('aria-label', `Next décor, ${unlockAria(teaser.unlock)}`);
    card.innerHTML = `<span class="decor-art">${teaser.icon}</span><span class="teaser-lock">${iconSpan(lockIcon())}${unlockCells(teaser.unlock)}</span>`;
    grid.appendChild(card);
  }
  rows.appendChild(grid);
}

function renderPlayerTab(rows, model, actions) {
  for (const r of model.player) {
    const row = document.createElement('div'); row.className = 'srow';
    const info = document.createElement('div'); info.className = 'srow-info';
    const label = document.createElement('div'); label.className = 'srow-label'; label.textContent = r.label;
    const effect = document.createElement('div'); effect.className = 'srow-sub'; effect.textContent = r.effect;
    info.append(label, effect, tierDots(r.tier, r.maxTier));
    const maxed = r.cost === null;
    row.append(info, actionButton('sbtn buy', maxed ? 'MAX' : priceContent(r.cost), maxed || model.coins < r.cost, () => actions.buy(r.key)));
    rows.appendChild(row);
  }
}
function renderRunnerChips(runner, displays, actions) {
  const wrap = document.createElement('div'); wrap.className = 'chiprow';
  for (const d of displays) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip' + (runner.assign === d.id ? ' active' : '');
    chip.innerHTML = iconFor(d.product); chip.addEventListener('click', () => actions.assignRunner(runner.index, d.id)); wrap.appendChild(chip);
  }
  return wrap;
}
function renderWorkersTab(rows, model, actions) {
  for (const r of model.workers) {
    const row = document.createElement('div'); row.className = 'srow'; const info = document.createElement('div'); info.className = 'srow-info';
    const labelRow = document.createElement('div'); labelRow.className = 'srow-label-row';
    const label = document.createElement('span'); label.className = 'srow-label'; label.textContent = r.label;
    const badge = document.createElement('span'); badge.className = 'count-badge'; badge.textContent = `${r.count}/${r.cap}`; labelRow.append(label, badge);
    const desc = document.createElement('div'); desc.className = 'srow-sub'; desc.textContent = r.desc; info.append(labelRow, desc);
    if (r.showLevels) {
      info.appendChild(levelSubrow('Speed', r.speed, () => actions.buyWorker(r.kind, 'speed')));
      if (r.carry) info.appendChild(levelSubrow('Carry', r.carry, () => actions.buyWorker(r.kind, 'carry')));
    }
    if (r.runners && r.runners.length && r.displays && r.displays.length) {
      for (const runner of r.runners) {
        if (r.runners.length > 1) { const x = document.createElement('div'); x.className = 'sublabel'; x.textContent = `Runner ${runner.index + 1}`; info.appendChild(x); }
        info.appendChild(renderRunnerChips(runner, r.displays, actions));
      }
    }
    row.append(info, actionButton('sbtn buy', r.hireMaxed ? 'FULL' : priceContent(r.hireCost), r.hireDisabled, () => actions.hire(r.kind))); rows.appendChild(row);
  }
  if (model.staffTeaser) rows.appendChild(teaserRow(model.staffTeaser, null));
}
function renderMachinesTab(rows, model, actions) {
  let focusEl = null;
  for (const r of model.machines) {
    const row = document.createElement('div'); row.className = 'srow' + (model.focusRow === r.key ? ' srow-focus' : ''); if (model.focusRow === r.key) focusEl = row;
    const info = document.createElement('div'); info.className = 'srow-info';
    const label = document.createElement('div'); label.className = 'srow-label'; label.textContent = r.label;
    const effect = document.createElement('div'); effect.className = 'srow-sub'; effect.textContent = r.effect; info.append(label, effect, tierDots(r.tier, r.maxTier));
    const maxed = r.cost === null;
    row.append(info, actionButton('sbtn buy', maxed ? 'MAX' : priceContent(r.cost), r.disabled, () => actions.buyStar(r.key))); rows.appendChild(row);
  }
  if (model.machineTeaser) rows.appendChild(teaserRow(model.machineTeaser, model.machineTeaser.product ? iconFor(model.machineTeaser.product) : null));
  // A plain frame, not the presentation scheduler: the sheet is a modal, and the modal pauses that.
  if (focusEl) requestAnimationFrame(() => requestAnimationFrame(() => focusEl.scrollIntoView({ block: 'center' })));
}
function renderKiosk(model, actions, onClose, door) {
  const tab = normalizeShopTab(model.tab);
  const el = shell('kiosk', shopTitle(door), onClose); const tabs = document.createElement('div'); tabs.className = 'stabs';
  tabs.setAttribute('role', 'tablist');
  for (const key of SHOP_TABS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'stab' + (tab === key ? ' active' : '');
    b.textContent = TAB_LABEL[key]; b.dataset.tab = key; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(tab === key));
    b.addEventListener('click', () => actions.setTab(key)); tabs.appendChild(b);
  }
  el.appendChild(tabs); const rows = document.createElement('div'); rows.className = 'srows'; el.appendChild(rows);
  if (tab === 'staff') renderWorkersTab(rows, model, actions);
  else if (tab === 'decor') renderDecorTab(rows, model, actions);
  else { renderPlayerTab(rows, model, actions); renderMachinesTab(rows, model, actions); }
  return el;
}
function renderSummary(model, actions, onClose) {
  const card = shell('summary', `Day ${model.day}`, onClose);
  return renderDaySummary(card, model, { onContinue: () => actions.continue() });
}
function build(kind, model, actions, onClose, door) {
  if (kind === 'kiosk') return renderKiosk(model, actions, onClose, door);
  if (kind === 'summary') return renderSummary(model, actions, onClose);
  throw new Error('unknown sheet kind: ' + kind);
}

// The last sheet host created. Pet Café is a single-runtime SPA with one sheet host (game.js makes
// it); ui/shop.js opens the Shop into that same host from the Café card.
let sharedHost = null;
export function activeSheets() { return sharedHost; }

export function createSheets(root = document.body) {
  const wrap = document.createElement('div'); wrap.className = 'sheet-root hidden'; const backdrop = document.createElement('div'); backdrop.className = 'backdrop'; wrap.appendChild(backdrop); root.appendChild(wrap);
  let current = null; const closeCbs = [];
  const close = () => {
    if (!current) return;
    const { el, kind } = current; current = null;
    closeModal('sheet');
    if (kind === 'summary') {
      el.remove(); wrap.classList.add('hidden');
      for (const cb of closeCbs) cb();
      return;
    }
    el.classList.remove('show');
    // A plain timer: the slide-out must finish even while another sheet holds presentation paused.
    setTimeout(() => { el.remove(); if (!current) wrap.classList.add('hidden'); }, 220);
    for (const cb of closeCbs) cb();
  };
  const requestClose = (source = 'close') => {
    if (!current) return;
    const dismiss = current.actions && current.actions.dismiss;
    if (typeof dismiss === 'function') { dismiss(source); return; }
    close();
  };
  const hasExplicitDismiss = () => !!current && typeof current.actions?.dismiss === 'function';
  window.addEventListener('click', e => {
    if (!hasExplicitDismiss() || e.target !== backdrop) return;
    requestClose('backdrop'); e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  backdrop.addEventListener('click', () => requestClose('backdrop'));
  const open = (kind, model, actions) => {
    if (current) { current.el.remove(); current = null; }
    // The Shop keeps the door it was opened by. The world's doors pass none: the staff desk is the
    // one that opens on the staff tab.
    const door = kind === 'kiosk' ? (model.door || (normalizeShopTab(model.tab) === 'staff' ? 'staff' : 'shop')) : null;
    const el = build(kind, model, actions, requestClose, door); wrap.appendChild(el); wrap.classList.remove('hidden'); current = { kind, el, actions, door };
    openModal('sheet', { close: requestClose });
    requestAnimationFrame(() => requestAnimationFrame(() => { if (current && current.el === el) el.classList.add('show'); }));
  };
  const refresh = model => {
    if (!current) return; const scroller = current.el.querySelector('.srows'); const scrollTop = scroller ? scroller.scrollTop : 0;
    const { kind, actions, door, el: oldEl } = current; const wasShown = oldEl.classList.contains('show'); const el = build(kind, model, actions, requestClose, door); oldEl.replaceWith(el);
    if (wasShown) el.classList.add('show'); current = { kind, el, actions, door }; const newScroller = el.querySelector('.srows'); if (newScroller) newScroller.scrollTop = scrollTop;
  };
  const host = { open, close, refresh, get isOpen() { return !!current; }, get kind() { return current ? current.kind : null; }, onClose: cb => { closeCbs.push(cb); } };
  sharedHost = host;
  return host;
}
