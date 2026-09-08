// Compact end-of-shift service-quality readout. Presentation only: Task 23 reports outcomes and
// recovery moments, never wallet penalties. Lost guests remain a real service consequence.

const n = value => Math.max(0, Number(value) | 0);

export function buildServiceSummaryModel(dayStats = {}) {
  const served = n(dayStats.served), lost = n(dayStats.lost), misses = n(dayStats.serviceMisses);
  const returns = n(dayStats.returnActions);
  // Program 6.2: guests who paid and then found no clean table. A shift that turned anyone away
  // over dirty tables is not a clean shift, however good the rest of the service was.
  const missedSeats = n(dayStats.missedSeats);
  const clean = misses === 0 && lost === 0 && missedSeats === 0;

  let headline = 'CLEAN SERVICE';
  if (misses > 0) headline = `${misses} SERVICE ${misses === 1 ? 'RECOVERY' : 'RECOVERIES'}`;
  else if (lost > 0) headline = `${lost} ${lost === 1 ? 'GUEST' : 'GUESTS'} LEFT`;

  let tip = 'Great rhythm — keep the café stocked before the next rush.';
  if (misses > 0) tip = 'Next rush: watch empty shelves, the register queue, pet treats and dirty tables.';
  else if (lost > 0) tip = 'A few guests slipped away — build a little stock before traffic spikes again.';
  else if (returns > 0) tip = 'Returned items are handled without taking coins from your wallet.';
  if (missedSeats > 0) tip = 'Guests paid and found no clean table. Wipe seats between visits.';

  return { served, lost, misses, missedSeats, returns, clean, headline, tip };
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
    .service-summary-chip.attn{background:#ffb45f24}.service-summary-chip.ok{background:#7fd69a22}
    .service-summary-chip.iconChip{gap:6px;font:950 13px/1 system-ui,sans-serif}
    .service-summary-ico{width:17px;height:17px;flex:none;display:inline-flex;color:var(--ink,#3B2E2A)}
    .service-summary-ico svg{width:100%;height:100%;display:block}
    .service-summary-tip{margin-top:8px;font:700 11px/1.35 system-ui,sans-serif;opacity:.67}
    @media(max-width:260px){.service-summary-strip{padding:9px}.service-summary-top{align-items:flex-start;flex-direction:column;gap:4px}.service-summary-chip{font-size:10px}}
  `;
  document.head.appendChild(style);
}

function chip(text, className = '') {
  const el = document.createElement('span'); el.className = `service-summary-chip ${className}`.trim(); el.textContent = text; return el;
}

// The same table-with-X the guest holds up on the play field (src/systems/visuals.js). Duplicated
// rather than shared because src/ui/icons.js belongs to another task in this batch; both copies
// should collapse into one icons.js export as soon as it is free.
function seatMissIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
    + '<path d="M3 13h18"/><path d="M6 13v7"/><path d="M18 13v7"/>'
    + '<path d="M8 3.5l8 7M16 3.5l-8 7" stroke="#E2483C"/>'
    + '</svg>';
}
// Icon + numeral, no words: the one row in this card that also has to make sense at a glance to a
// player who never reads the prose around it.
function iconChip(svg, value, className = '') {
  const el = document.createElement('span');
  el.className = `service-summary-chip iconChip ${className}`.trim();
  const ico = document.createElement('span'); ico.className = 'service-summary-ico'; ico.innerHTML = svg;
  const num = document.createElement('span'); num.textContent = String(value);
  el.append(ico, num);
  return el;
}

function decorateCard(G, card) {
  if (!card || card.querySelector('.service-summary-strip')) return;
  const title = card.querySelector('.ctitle');
  if (!title || !/^Day\s+\d+\s+✓$/.test(title.textContent.trim())) return;
  const body = card.querySelector('.cbody'); if (!body) return;

  const model = buildServiceSummaryModel(G && G.dayStats);
  const strip = document.createElement('section'); strip.className = 'service-summary-strip';
  strip.setAttribute('aria-label', `Service summary. ${model.misses} recovery moments. ${model.lost} guests lost. ${model.missedSeats} guests found no clean table. ${model.returns} return actions. Service recovery ${n(G.dayStats.serviceFees)} coins.`);

  const top = document.createElement('div'); top.className = 'service-summary-top';
  const label = document.createElement('span'); label.textContent = 'SERVICE QUALITY';
  const headline = document.createElement('strong'); headline.textContent = model.headline;
  top.append(label, headline);

  const metrics = document.createElement('div'); metrics.className = 'service-summary-metrics';
  metrics.append(
    chip(`${model.served} served`, model.clean ? 'ok' : ''),
    chip(`${model.lost} left`, model.lost ? 'attn' : 'ok'),
    chip(`${model.misses} recovery ${model.misses === 1 ? 'moment' : 'moments'}`, model.misses ? 'attn' : 'ok'),
    iconChip(seatMissIcon(), model.missedSeats, model.missedSeats ? 'attn' : 'ok'),
  );
  if (n(G.dayStats.serviceFees)>0) metrics.append(chip('−'+n(G.dayStats.serviceFees)+' service recovery','attn'));
  const p=G.meta?.servicePolicy;
  if(p&&p.day===G.dayState.day){const cause=Object.entries(p.causes).sort((a,b)=>b[1]-a[1])[0];if(cause?.[1]>0) model.tip=({table:'Clean tables before guests finish paying.',register:'Staff both registers or reassure guests before patience runs out.',counter:'Assign Runners to empty displays before the rush.',bowl:'Keep pet bowls stocked before the rush.'})[cause[0]];if(p.spent>=Math.floor(p.baseline*.08))metrics.append(chip('Shift recovery cap reached','attn'));}
  if (model.returns > 0) metrics.append(chip(`${model.returns} returned`, 'ok'));

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
