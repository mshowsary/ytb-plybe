// Bottom sheets: upgrades, pantry and end-of-shift card.
import { sackIcon, iconFor } from './icons.js';
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

const TABS = [{ key: 'player', label: 'Player' }, { key: 'workers', label: 'Workers' }, { key: 'machines', label: 'Machines' }];
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
  if (focusEl) requestAnimationFrame(() => requestAnimationFrame(() => focusEl.scrollIntoView({ block: 'center' })));
}
function renderKiosk(model, actions, onClose) {
  const el = shell('kiosk', 'UPGRADES', onClose); const tabs = document.createElement('div'); tabs.className = 'stabs';
  for (const t of TABS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'stab' + (model.tab === t.key ? ' active' : ''); b.textContent = t.label; b.addEventListener('click', () => actions.setTab(t.key)); tabs.appendChild(b); }
  el.appendChild(tabs); const rows = document.createElement('div'); rows.className = 'srows'; el.appendChild(rows);
  if (model.tab === 'workers') renderWorkersTab(rows, model, actions); else if (model.tab === 'machines') renderMachinesTab(rows, model, actions); else renderPlayerTab(rows, model, actions);
  return el;
}
function renderPantry(model, actions, onClose) {
  const el = shell('pantry', 'PANTRY', onClose); const rows = document.createElement('div'); rows.className = 'srows';
  rows.appendChild(actionButton('sbtn buy', { html: iconSpan(sackIcon()) + '<span>Beans</span>' }, !model.beans, () => actions.pick('beans')));
  rows.appendChild(actionButton('sbtn buy', { html: iconSpan(sackIcon()) + '<span>Kibble</span>' }, !model.kibble, () => actions.pick('kibble')));
  el.appendChild(rows); return el;
}
function summaryRow(label, value) {
  const row = document.createElement('div'); row.className = 'srow-sub'; row.textContent = `${label}: ${value}`; return row;
}
function renderSummary(model, actions, onClose) {
  const el = shell('summary', `Day ${model.day} ✓`, onClose); const body = document.createElement('div'); body.className = 'cbody';
  body.append(summaryRow('Earnings', fmt(model.earnings)), summaryRow('Served', model.served));
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
    if (!current) return; const el = current.el; current = null; el.classList.remove('show');
    setTimeout(() => { el.remove(); if (!current) wrap.classList.add('hidden'); }, 220); for (const cb of closeCbs) cb();
  };
  const requestClose = (source = 'close') => {
    if (!current) return;
    const dismiss = current.actions && current.actions.dismiss;
    if (typeof dismiss === 'function') { dismiss(source); return; }
    close();
  };
  // Summary presentation deliberately locks generic background input. Listen at window-capture so
  // Escape/backdrop still reach the sheet's explicit dismiss contract before that lock can swallow them.
  window.addEventListener('click', e => {
    if (!current || e.target !== backdrop) return;
    requestClose('backdrop'); e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !current) return;
    requestClose('escape'); e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  const open = (kind, model, actions) => {
    if (current) { current.el.remove(); current = null; }
    const el = build(kind, model, actions, requestClose); wrap.appendChild(el); wrap.classList.remove('hidden'); current = { kind, el, actions };
    requestAnimationFrame(() => requestAnimationFrame(() => { if (current && current.el === el) el.classList.add('show'); }));
  };
  const refresh = model => {
    if (!current) return; const scroller = current.el.querySelector('.srows'); const scrollTop = scroller ? scroller.scrollTop : 0;
    const { kind, actions, el: oldEl } = current; const wasShown = oldEl.classList.contains('show'); const el = build(kind, model, actions, requestClose); oldEl.replaceWith(el);
    if (wasShown) el.classList.add('show'); current = { kind, el, actions }; const newScroller = el.querySelector('.srows'); if (newScroller) newScroller.scrollTop = scrollTop;
  };
  return { open, close, refresh, get isOpen() { return !!current; }, onClose: cb => { closeCbs.push(cb); } };
}