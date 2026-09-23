// src/ui/map.js — the café map: every café you own, the next one to open, and the ones coming later.
// The button appears once the first café is complete; the sheet pauses the game while it is open.
import { LOCATIONS, LOCATION_ORDER, COMING_SOON } from '../game/layout.js';
import * as L from '../game/layout.js';

export function createMap(root, W, audio, onPause, onTravel) {
  root.insertAdjacentHTML('beforeend', `<button class="mapbtn ui hidden" id="mapbtn" aria-label="Café map"><span>🗺️</span><i class="dot hidden"></i></button>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="sheet hidden" id="mapsheet"><div class="sheet-card">
      <div class="sheet-head"><b>🗺️ Your cafés</b><button class="close" aria-label="Close">✕</button></div>
      <div class="maplist" id="maplist"></div>
    </div></div>`);
  const btn = root.querySelector('#mapbtn'), dot = btn.querySelector('.dot');
  const sheet = document.getElementById('mapsheet'), list = document.getElementById('maplist');
  const close = () => { sheet.classList.add('hidden'); onPause(false); };

  function progress(id) {
    if (id === W.loc) { const n = L.PADS.filter(p => W.isBuilt(p.builds)).length; return Math.round(100 * n / L.PADS.length); }
    const s = W.saved[id]; if (!s) return 0;
    return Math.round(100 * ((s.built || []).length + (s.staff || []).length) / 14);
  }
  function render() {
    let html = '';
    LOCATION_ORDER.forEach((id, i) => {
      const loc = LOCATIONS[id], own = W.open.has(id), here = W.loc === id, done = W.done.has(id) || (here && W.complete());
      const prevDone = i === 0 || W.done.has(LOCATION_ORDER[i - 1]) || (W.loc === LOCATION_ORDER[i - 1] && W.complete());
      let action;
      if (here) action = `<span class="here">📍 You are here</span>`;
      else if (own) action = `<button class="go" data-go="${id}">Go ▶</button>`;
      else if (prevDone) action = `<button class="go buy ${W.coins >= loc.cost ? '' : 'poor'}" data-buy="${id}"><i class="coin"></i>${loc.cost.toLocaleString('en-US')}</button>`;
      else action = `<span class="lock">🔒 Finish ${LOCATIONS[LOCATION_ORDER[i - 1]].name}</span>`;
      const pct = own ? progress(id) : 0;
      html += `<div class="loc loc-${loc.theme} ${own ? 'own' : ''}"><div class="locart">${loc.emoji}</div>
        <div class="loctxt"><b>${loc.name}${done ? ' ⭐' : ''}</b><small>${loc.menu.map(p => L.PRODUCTS[p].emoji).join(' ')}</small>
        ${own ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>${action}</div>`;
    });
    for (const c of COMING_SOON) html += `<div class="loc soon"><div class="locart">${c.emoji}</div><div class="loctxt"><b>${c.name}</b><small>Coming soon</small></div></div>`;
    list.innerHTML = html;
  }
  list.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'), buy = e.target.closest('[data-buy]');
    if (go) { close(); onTravel(go.dataset.go); }
    else if (buy) {
      const id = buy.dataset.buy, cost = LOCATIONS[id].cost;
      if (W.coins < cost) { buy.classList.add('shake'); setTimeout(() => buy.classList.remove('shake'), 400); return; }
      W.coins -= cost; W.open.add(id); audio.play('fanfare'); close(); onTravel(id);
    }
  });
  btn.addEventListener('click', e => { e.stopPropagation(); render(); sheet.classList.remove('hidden'); dot.classList.add('hidden'); onPause(true); audio.play('tap'); });
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.close')) close(); });

  return {
    update() {
      const show = W.open.size > 1 || W.done.size > 0 || W.complete();
      btn.classList.toggle('hidden', !show);
    },
    nudge() { dot.classList.remove('hidden'); btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); },
  };
}
