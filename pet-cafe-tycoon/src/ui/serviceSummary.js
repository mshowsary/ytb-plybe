// Compact end-of-shift service-quality readout. This is presentation only: it never changes
// coins, ratings, ad availability or simulation state. The goal is to explain recovery costs
// without turning the summary into a punishment screen.

const n = value => Math.max(0, Number(value) | 0);

export function buildServiceSummaryModel(dayStats = {}) {
  const served = n(dayStats.served), lost = n(dayStats.lost), misses = n(dayStats.serviceMisses);
  const serviceFees = n(dayStats.serviceFees), wasteFees = n(dayStats.wasteFees);
  const deductions = serviceFees + wasteFees;
  const clean = misses === 0 && lost === 0 && wasteFees === 0;

  let headline = 'CLEAN SERVICE';
  if (!clean && misses > 0) headline = `${misses} SERVICE ${misses === 1 ? 'RECOVERY' : 'RECOVERIES'}`;
  else if (!clean && lost > 0) headline = `${lost} ${lost === 1 ? 'GUEST' : 'GUESTS'} LEFT`;
  else if (!clean && wasteFees > 0) headline = 'WATCH FOOD WASTE';

  let tip = 'Great rhythm — keep the café stocked before the next rush.';
  if (serviceFees > 0) tip = 'Next rush: watch empty shelves, the register queue, pet treats and dirty tables.';
  else if (wasteFees > 0) tip = 'Carry what you can place; unused supplies can go back to RETURN without a food-waste fee.';
  else if (lost > 0) tip = 'A few guests slipped away — build a little stock before traffic spikes again.';

  return { served, lost, misses, serviceFees, wasteFees, deductions, clean, headline, tip };
}

const STYLE_ID = 'pet-cafe-service-summary-style';
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    .service-summary-strip{width:100%;box-sizing:border-box;border-radius:16px;padding:11px 12px;background:#ffffffa8;border:1px solid #ffffffd0;text-align:left;color:var(--ink,#3B2E2A)}
    .service-summary-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font:800 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;opacity:.78}
    .service-summary-top strong{font:950 12px/1 system-ui,sans-serif;letter-spacing:.03em;opacity:1}
    .service-summary-metrics{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .service-summary-chip{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border-radius:999px;background:#0000000a;font:800 11px/1 system-ui,sans-serif;white-space:nowrap}
    .service-summary-chip.cost{background:#ff8a801b}.service-summary-chip.ok{background:#7fd69a22}
    .service-summary-tip{margin-top:8px;font:700 11px/1.35 system-ui,sans-serif;opacity:.67}
    @media(max-width:260px){.service-summary-strip{padding:9px}.service-summary-top{align-items:flex-start;flex-direction:column;gap:4px}.service-summary-chip{font-size:10px}}
  `;
  document.head.appendChild(style);
}

function chip(text, className = '') {
  const el = document.createElement('span'); el.className = `service-summary-chip ${className}`.trim(); el.textContent = text; return el;
}

function decorateCard(G, card) {
  if (!card || card.querySelector('.service-summary-strip')) return;
  const title = card.querySelector('.ctitle');
  if (!title || !/^Day\s+\d+\s+✓$/.test(title.textContent.trim())) return;
  const body = card.querySelector('.cbody'); if (!body) return;

  const model = buildServiceSummaryModel(G && G.dayStats);
  const strip = document.createElement('section'); strip.className = 'service-summary-strip';
  strip.setAttribute('aria-label', `Service summary. ${model.misses} recoveries. ${model.lost} guests lost. ${model.deductions} coins in recovery and waste costs.`);

  const top = document.createElement('div'); top.className = 'service-summary-top';
  const label = document.createElement('span'); label.textContent = 'SERVICE QUALITY';
  const headline = document.createElement('strong'); headline.textContent = model.headline;
  top.append(label, headline);

  const metrics = document.createElement('div'); metrics.className = 'service-summary-metrics';
  metrics.append(
    chip(`${model.served} served`, model.clean ? 'ok' : ''),
    chip(`${model.lost} left`, model.lost ? 'cost' : ''),
    chip(model.serviceFees ? `-${model.serviceFees} service` : '0 service cost', model.serviceFees ? 'cost' : 'ok'),
    chip(model.wasteFees ? `-${model.wasteFees} waste` : '0 waste', model.wasteFees ? 'cost' : 'ok'),
  );

  const tip = document.createElement('div'); tip.className = 'service-summary-tip'; tip.textContent = model.tip;
  strip.append(top, metrics, tip);
  body.insertAdjacentElement('afterend', strip);
}

export function installServiceSummary(G) {
  if (typeof document === 'undefined') return { refresh() {}, destroy() {} };
  ensureStyle();
  let scheduled = false;
  const refresh = () => {
    scheduled = false;
    for (const card of document.querySelectorAll('.card')) decorateCard(G, card);
  };
  const schedule = () => {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(refresh);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
  return { refresh, destroy() { observer.disconnect(); } };
}
