// Compact late-game renovation control inside Cafe Journey. The repeat-use surface shows only
// the next visual upgrade and its gate/cost; detail lives in accessibility labels rather than prose.
export function createRenovationUI() {
  const card = document.querySelector('.career-card');
  if (!card) return { setModel() {} };
  if (!document.getElementById('pet-cafe-renovation-style')) {
    const s = document.createElement('style'); s.id = 'pet-cafe-renovation-style';
    s.textContent = `
      .career-renovation{background:linear-gradient(135deg,#fff6df,#fff);border-color:#d6a9412c}.reno-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.reno-level{font:950 10px/1 system-ui,sans-serif;color:#9a701f;white-space:nowrap}.reno-next{margin-top:7px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}.reno-name{font:950 12px/1.1 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reno-desc{display:none!important}.reno-buy{min-width:92px;min-height:48px;border:0;border-radius:13px;padding:8px 11px;background:linear-gradient(180deg,#f2bf4c,#d89b25);box-shadow:0 4px 0 #a86e18;color:#50360d;font:950 12px/1 system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}.reno-buy:active:not(:disabled){transform:translateY(2px);box-shadow:0 2px 0 #a86e18}.reno-buy:disabled{background:#e8ded0;box-shadow:none;color:#8c8175;cursor:default}.reno-star{color:#b78116;font-size:15px}.reno-coin{width:13px;height:13px;border-radius:50%;background:#f0ba32;box-shadow:inset 0 -1px 0 #95640d55;flex:none}.reno-done{font:950 12px/1 system-ui,sans-serif;color:#5f8b55;text-align:right}
      @media(max-width:300px){.reno-next{grid-template-columns:minmax(0,1fr) auto;gap:6px}.reno-buy{min-width:78px;padding:7px}.reno-name{font-size:10px}}
    `;
    document.head.appendChild(s);
  }
  const section = document.createElement('div'); section.className = 'career-section career-renovation';
  section.innerHTML = `<div class="reno-top"><div class="career-kicker">RENOVATE</div><div class="reno-level">0/5</div></div><div class="reno-next"><div><div class="reno-name"></div><div class="reno-desc"></div></div><button type="button" class="reno-buy">—</button></div><div class="reno-done" hidden>✓ 5/5</div>`;
  const masterySection = card.querySelector('.career-mastery')?.closest('.career-section');
  if (masterySection) masterySection.before(section); else card.appendChild(section);
  const btn = section.querySelector('.reno-buy');
  let model = null, busy = false;
  btn.addEventListener('click', async () => {
    if (busy || !model || !model.onBuy || !model.next || !model.repReady || !model.coinReady) return;
    busy = true; btn.disabled = true;
    try { await model.onBuy(); }
    finally { busy = false; if (model) setModel(model); }
  });

  function setModel(next) {
    model = next;
    if (!model) return;
    section.querySelector('.reno-level').textContent = `${model.level}/${model.maxLevel}`;
    const done = section.querySelector('.reno-done'); const wrap = section.querySelector('.reno-next');
    if (!model.next) { wrap.hidden = true; done.hidden = false; return; }
    wrap.hidden = false; done.hidden = true;
    section.querySelector('.reno-name').textContent = model.next.name;
    const desc = section.querySelector('.reno-desc'); desc.textContent = model.next.desc || '';
    if (!model.repReady) {
      btn.innerHTML = `<span class="reno-star" aria-hidden="true">★</span><span>${model.next.rep}</span>`;
      btn.setAttribute('aria-label', `${model.next.name} requires ${model.next.rep} reputation`);
    } else {
      btn.innerHTML = `<span class="reno-coin" aria-hidden="true"></span><span>${model.next.cost.toLocaleString('en-US')}</span>`;
      btn.setAttribute('aria-label', `${model.next.name}, ${model.next.cost.toLocaleString('en-US')} coins`);
    }
    btn.disabled = busy || !model.repReady || !model.coinReady;
    btn.title = model.repReady && !model.coinReady ? `${Math.max(0, model.next.cost - model.coins).toLocaleString('en-US')} more coins needed` : '';
  }
  return { setModel };
}
