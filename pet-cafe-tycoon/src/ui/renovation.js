// Adds one compact late-game renovation card to the existing Cafe Journey modal.
export function createRenovationUI() {
  const card = document.querySelector('.career-card');
  if (!card) return { setModel() {} };
  if (!document.getElementById('pet-cafe-renovation-style')) {
    const s = document.createElement('style'); s.id = 'pet-cafe-renovation-style';
    s.textContent = `
      .career-renovation{background:linear-gradient(135deg,#fff6df,#fff);border-color:#d6a9412c}.reno-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.reno-level{font:950 11px/1 system-ui,sans-serif;color:#9a701f;white-space:nowrap}.reno-next{margin-top:8px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px}.reno-name{font:950 14px/1.1 system-ui,sans-serif}.reno-desc{font:700 10px/1.3 system-ui,sans-serif;opacity:.55;margin-top:4px}.reno-buy{min-width:108px;min-height:44px;border:0;border-radius:13px;padding:9px 12px;background:linear-gradient(180deg,#f2bf4c,#d89b25);box-shadow:0 4px 0 #a86e18;color:#50360d;font:950 11px/1 system-ui,sans-serif;cursor:pointer}.reno-buy:active:not(:disabled){transform:translateY(2px);box-shadow:0 2px 0 #a86e18}.reno-buy:disabled{background:#e8ded0;box-shadow:none;color:#8c8175;cursor:default}.reno-done{font:900 11px/1.3 system-ui,sans-serif;color:#5f8b55;margin-top:7px}
      @media(max-width:400px){.reno-next{grid-template-columns:1fr}.reno-buy{width:100%}}
    `;
    document.head.appendChild(s);
  }
  const section = document.createElement('div'); section.className = 'career-section career-renovation';
  section.innerHTML = `<div class="reno-top"><div><div class="career-kicker">CAFÉ RENOVATIONS</div><div class="career-big">Make the room legendary</div></div><div class="reno-level">0 / 5</div></div><div class="reno-next"><div><div class="reno-name"></div><div class="reno-desc"></div></div><button type="button" class="reno-buy">LOCKED</button></div><div class="reno-done" hidden>All five visual renovations completed.</div>`;
  const masterySection = card.querySelector('.career-mastery')?.closest('.career-section');
  if (masterySection) masterySection.before(section); else card.appendChild(section);
  const btn = section.querySelector('.reno-buy');
  let model = null, busy = false;
  btn.addEventListener('click', async () => {
    if (busy || !model || !model.onBuy || !model.next || !model.repReady || !model.coinReady) return;
    busy = true; btn.disabled = true;
    try { await model.onBuy(); }
    finally {
      busy = false;
      // onBuy synchronously refreshes the model to the next renovation. Re-render once the
      // transient busy lock is gone so the next button immediately reflects its real gates/cost.
      if (model) setModel(model);
    }
  });

  function setModel(next) {
    model = next;
    if (!model) return;
    section.querySelector('.reno-level').textContent = `${model.level} / ${model.maxLevel}`;
    const done = section.querySelector('.reno-done');
    const wrap = section.querySelector('.reno-next');
    if (!model.next) { wrap.hidden = true; done.hidden = false; return; }
    wrap.hidden = false; done.hidden = true;
    section.querySelector('.reno-name').textContent = model.next.name;
    section.querySelector('.reno-desc').textContent = model.next.desc;
    if (!model.repReady) btn.textContent = `REQUIRES ${model.next.rep} REP`;
    else btn.textContent = `${model.next.cost.toLocaleString('en-US')} COINS`;
    btn.disabled = busy || !model.repReady || !model.coinReady;
    if (model.repReady && !model.coinReady) btn.title = `${Math.max(0, model.next.cost - model.coins).toLocaleString('en-US')} more coins needed`;
    else btn.title = '';
  }
  return { setModel };
}
