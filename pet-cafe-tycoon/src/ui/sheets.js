// Bottom sheets: upgrades, pantry and end-of-shift card.
import { beanIcon, kibbleIcon, creamIcon, waterIcon, iconFor, checkIcon } from './icons.js';
import { decorCatalogue } from '../../data/decor.js';
import { presentationScheduler } from '../core/presentationScheduler.js';
const COIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/></svg>';
const CHEVRON_DOWN_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const fmt = n => Math.round(n).toLocaleString('en-US');

function makeClose(onClose) {
  const b = document.createElement('button'); b.className = 'sclose'; b.type = 'button'; b.setAttribute('aria-label', 'Close');
  b.innerHTML = CHEVRON_DOWN_SVG; b.addEventListener('click', () => onClose('close')); return b;
}
function shell(kind, titleText, onClose) {
  const el = document.createElement('div'); const isCard = kind === 'end' || kind === 'summary';
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

const TABS = [{ key: 'player', label: 'Player' }, { key: 'workers', label: 'Workers' }, { key: 'machines', label: 'Machines' }, { key: 'decor', label: 'Décor' }];
// The boutique tab (plan §3.5/§3.9) is appended only once boutique1 is active -- before that there
// is nothing to sell and no station in the world to have opened the kiosk from in the first place,
// so an always-present tab would dead-end into an empty grid. model.boutiqueActive is the one flag
// that governs this (src/ui/models.js buildKioskModel), mirroring how the décor tab's OWN rows
// (not the tab itself) are what disappear before a gate opens.
function tabsFor(model) {
  return model && model.boutiqueActive ? [...TABS, { key: 'boutique', label: 'Boutique' }] : TABS;
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
  rows.appendChild(grid);
}

// --- boutique tab (plan §3.5/§3.9) --------------------------------------------------------------
// Same idiom as the décor tab above, deliberately: icon + price rows, no words, an owned-check in
// place of the buy button once bought. It shares the décor tab's CSS classes rather than duplicating
// them -- the grid, the card, the art box and the check are the same shapes for the same reason
// (a cosmetic sink priced in coins), so re-declaring a parallel `.boutique-*` ruleset here would be
// a distinction with no visual difference. Only DECOR_CSS's injection guard needs no boutique twin.
//
// Rows list every accessory NOT YET unlocked through any door (follower tier, season or an earlier
// purchase) -- once a piece is free via one of those, it belongs to the album/equip UI, not a shelf
// asking for coins to buy something already owned.
export function boutiqueRows(model) {
  if (Array.isArray(model && model.boutique)) return model.boutique;
  const coins = (model && model.coins) || 0;
  const items = Array.isArray(model && model.boutiqueItems) ? model.boutiqueItems : [];
  return items.map(item => ({
    id: item.id, price: item.price, icon: item.icon,
    disabled: coins < item.price,
  }));
}

function renderBoutiqueTab(rows, model, actions) {
  ensureDecorCss();
  const grid = document.createElement('div'); grid.className = 'decor-grid';
  for (const r of boutiqueRows(model)) {
    const card = document.createElement('div');
    card.className = 'decor-card';
    card.dataset.boutique = r.id;
    const art = document.createElement('span'); art.className = 'decor-art'; art.innerHTML = r.icon;
    card.appendChild(art);
    const btn = actionButton('sbtn buy', priceContent(r.price), !!r.disabled, () => {
      if (actions && typeof actions.buyAccessory === 'function') actions.buyAccessory(r.id);
    });
    btn.dataset.boutiqueBuy = r.id;
    card.appendChild(btn);
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
  if (focusEl) presentationScheduler.afterFrames(() => focusEl.scrollIntoView({ block: 'center' }), 2);
}
function renderKiosk(model, actions, onClose) {
  const el = shell('kiosk', 'UPGRADES', onClose); const tabs = document.createElement('div'); tabs.className = 'stabs';
  for (const t of tabsFor(model)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'stab' + (model.tab === t.key ? ' active' : ''); b.textContent = t.label; b.addEventListener('click', () => actions.setTab(t.key)); tabs.appendChild(b); }
  el.appendChild(tabs); const rows = document.createElement('div'); rows.className = 'srows'; el.appendChild(rows);
  if (model.tab === 'workers') renderWorkersTab(rows, model, actions);
  else if (model.tab === 'machines') renderMachinesTab(rows, model, actions);
  else if (model.tab === 'decor') renderDecorTab(rows, model, actions);
  else if (model.tab === 'boutique' && model.boutiqueActive) renderBoutiqueTab(rows, model, actions);
  else renderPlayerTab(rows, model, actions);
  return el;
}
// Batch 1 terrace (plan D3): a pantry offers only the supplies it declares -- the main pantry keeps
// beans+kibble, coldPantry1 (supplies:['cream']) offers cream only. A supply's button renders iff
// the model defines that key at all (undefined = "this pantry doesn't carry it"), so the main
// pantry's model shape {beans, kibble} still yields exactly the same two buttons in the same order
// it always has -- src/ui/interactionCoach.js's pantryChoiceButton() structural lookup (it finds a
// pantry sheet by counting exactly 2 `.srows > .sbtn.buy` rows) is unchanged for that case. A
// cream-only pantry yields exactly 1 button with dataset.supply='cream'; a future mixed pantry would
// yield 3 in this fixed beans/kibble/cream order. See contractsForOthers for the exact contract.
const PANTRY_SUPPLY_META = {
  beans: { icon: beanIcon, label: 'Beans' },
  kibble: { icon: kibbleIcon, label: 'Kibble' },
  cream: { icon: creamIcon, label: 'Cream' },
  water: { icon: waterIcon, label: 'Water' },
};
const PANTRY_SUPPLY_ORDER = ['beans', 'kibble', 'cream', 'water'];
// Pure description of which pantry buttons render, in order -- kept separate from the DOM building
// below so the button contract (count/order/enabled) is unit-testable without a document. A supply
// gets a button iff `model` defines that key at all (undefined = "this pantry doesn't carry it"),
// so the main pantry's existing model shape {beans, kibble} still yields exactly the two buttons in
// the two-button order it always has, and coldPantry1's {cream} yields exactly one.
export function pantryButtons(model) {
  return PANTRY_SUPPLY_ORDER.filter(kind => model[kind] !== undefined).map(kind => ({ kind, enabled: !!model[kind] }));
}
function renderPantry(model, actions, onClose) {
  const el = shell('pantry', 'PANTRY', onClose); const rows = document.createElement('div'); rows.className = 'srows';
  for (const { kind, enabled } of pantryButtons(model)) {
    const { icon, label } = PANTRY_SUPPLY_META[kind];
    const btn = actionButton('sbtn buy', { html: iconSpan(icon()) + `<span>${label}</span>` }, !enabled, () => actions.pick(kind));
    // Stable action metadata is deliberately separate from visible copy/localization.
    btn.dataset.supply = kind;
    rows.appendChild(btn);
  }
  el.appendChild(rows); return el;
}
function summaryRow(label, value) {
  const row = document.createElement('div'); row.className = 'srow-sub'; row.textContent = `${label}: ${value}`; return row;
}
function renderSummary(model, actions, onClose) {
  const el = shell('summary', `Day ${model.day} ✓`, onClose); const body = document.createElement('div'); body.className = 'cbody';
  body.append(summaryRow('Gross sales', fmt(model.earnings)), summaryRow('Served', model.served));
  if(model.serviceFees>0)body.append(summaryRow('Service recovery / refunds', '−'+fmt(model.serviceFees)),summaryRow('Sales less service recovery',fmt(Math.max(0,model.earnings-model.serviceFees))));
  const deductions = (model.serviceFees | 0) + (model.wasteFees | 0);
  body.setAttribute('aria-label', `Earnings ${fmt(model.earnings)} coins. Served ${model.served}. Lost ${model.lost}. Deductions ${fmt(deductions)} coins.`);
  el.append(body, actionButton('sbtn continue', 'CONTINUE', false, () => actions.continue())); return el;
}
function renderEnd(model, actions, onClose) {
  const el = shell('end', model.title, onClose); const body = document.createElement('div'); body.className = 'cbody'; body.textContent = model.body;
  el.append(body, actionButton('sbtn continue', 'CONTINUE', false, () => actions.continue())); return el;
}
function build(kind, model, actions, onClose) {
  if (kind === 'kiosk') return renderKiosk(model, actions, onClose);
  if (kind === 'pantry') return renderPantry(model, actions, onClose);
  if (kind === 'end') return renderEnd(model, actions, onClose);
  if (kind === 'summary') return renderSummary(model, actions, onClose);
  throw new Error('unknown sheet kind: ' + kind);
}

export function createSheets(root = document.body) {
  const wrap = document.createElement('div'); wrap.className = 'sheet-root hidden'; const backdrop = document.createElement('div'); backdrop.className = 'backdrop'; wrap.appendChild(backdrop); root.appendChild(wrap);
  let current = null; const closeCbs = [];
  const close = () => {
    if (!current) return;
    const { el, kind } = current; current = null;
    if (kind === 'summary') {
      el.remove(); wrap.classList.add('hidden');
      for (const cb of closeCbs) cb();
      return;
    }
    el.classList.remove('show');
    presentationScheduler.schedule(() => { el.remove(); if (!current) wrap.classList.add('hidden'); }, 220);
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
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !hasExplicitDismiss()) return;
    requestClose('escape'); e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  backdrop.addEventListener('click', () => requestClose('backdrop'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && current) requestClose('escape'); });
  const open = (kind, model, actions) => {
    if (current) { current.el.remove(); current = null; }
    const el = build(kind, model, actions, requestClose); wrap.appendChild(el); wrap.classList.remove('hidden'); current = { kind, el, actions };
    presentationScheduler.afterFrames(() => { if (current && current.el === el) el.classList.add('show'); }, 2);
  };
  const refresh = model => {
    if (!current) return; const scroller = current.el.querySelector('.srows'); const scrollTop = scroller ? scroller.scrollTop : 0;
    const { kind, actions, el: oldEl } = current; const wasShown = oldEl.classList.contains('show'); const el = build(kind, model, actions, requestClose); oldEl.replaceWith(el);
    if (wasShown) el.classList.add('show'); current = { kind, el, actions }; const newScroller = el.querySelector('.srows'); if (newScroller) newScroller.scrollTop = scrollTop;
  };
  return { open, close, refresh, get isOpen() { return !!current; }, onClose: cb => { closeCbs.push(cb); } };
}
