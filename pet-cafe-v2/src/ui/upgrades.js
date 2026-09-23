// src/ui/upgrades.js — the Upgrades sheet: a green button bottom-right (it glows when something is
// affordable) opens a list of six upgrades with their level pips and price. The café pauses while open.
import { UPGRADES, upgradeCost } from '../game/layout.js';

export function createUpgrades(root, W, audio, fx, onPause) {
  root.insertAdjacentHTML('beforeend', `<button class="upbtn ui" id="upbtn" aria-label="Upgrades"><span>⬆</span><i class="dot hidden"></i></button>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="sheet hidden" id="upsheet"><div class="sheet-card">
      <div class="sheet-head"><b>⬆ Upgrades</b><span class="upcoins"><i class="coin"></i><b id="upcoins">0</b></span><button class="close" aria-label="Close">✕</button></div>
      <div class="uplist" id="uplist"></div>
    </div></div>`);
  const btn = root.querySelector('#upbtn'), dot = btn.querySelector('.dot');
  const sheet = document.getElementById('upsheet'), list = document.getElementById('uplist'), coins = document.getElementById('upcoins');

  function render() {
    coins.textContent = Math.floor(W.coins).toLocaleString('en-US');
    list.innerHTML = UPGRADES.map(u => {
      const l = W.lvl(u.id), max = l >= u.max, cost = max ? 0 : upgradeCost(u, l), can = !max && W.coins >= cost;
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
      return `<div class="uprow"><div class="upicon">${u.icon}</div><div class="uptxt"><b>${u.name}</b><small>${u.what}</small><div class="pips">${pips}</div></div>
        <button class="upbuy ${can ? 'can' : ''}" data-id="${u.id}" ${max || !can ? 'disabled' : ''}>${max ? 'MAX' : `<i class="coin"></i>${cost.toLocaleString('en-US')}`}</button></div>`;
    }).join('');
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('.upbuy'); if (!b) return;
    if (W.buyUpgrade(b.dataset.id)) { audio.play('build'); render(); }
  });
  btn.addEventListener('click', e => { e.stopPropagation(); render(); sheet.classList.remove('hidden'); onPause(true); audio.play('tap'); });
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.close')) { sheet.classList.add('hidden'); onPause(false); } });

  let t = 0;
  return {
    update(dt) {
      t -= dt; if (t > 0) return; t = 0.3;
      const can = W.canUpgrade();
      dot.classList.toggle('hidden', !can); btn.classList.toggle('glow', can);
    },
  };
}
