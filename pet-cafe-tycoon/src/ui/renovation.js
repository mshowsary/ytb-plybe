// src/ui/renovation.js — the café THEME, as the last block of the Café Stars sheet.
//
// It used to live in the Café Journey beside a rank bar, a week grid and five mastery bars. The
// Journey is gone from the UI (Batch D); the renovation is the one piece of it that is a thing to
// BUY, so it moved into Café Stars, the long track it belongs with. The block shows only the next
// renovation: its level pips, its name and one button — its price, or a padlock with what it waits
// for. game.js feeds it through setModel exactly as before.
import { brushIcon, coinIcon, lockIcon, checkIcon, starIcon } from './icons.js';

const fmt = n => Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');

export function createRenovationUI() {
  let ui = null, model = null, busy = false;

  // game.js creates this before the Café Stars sheet exists, so the block mounts into the sheet's
  // .stars-reno slot on the first model that arrives after it does.
  function mount() {
    if (ui) return ui;
    const slot = typeof document !== 'undefined' && document.querySelector('.paw-root .stars-reno');
    if (!slot) return null;
    slot.innerHTML = '<div class="reno-top"><span class="reno-ico" aria-hidden="true">' + brushIcon() + '</span><div class="reno-name"></div><div class="reno-level"></div></div>'
      + '<button type="button" class="reno-buy"></button>';
    ui = { name: slot.querySelector('.reno-name'), level: slot.querySelector('.reno-level'), btn: slot.querySelector('.reno-buy') };
    ui.btn.addEventListener('click', async () => {
      if (busy || !model || !model.onBuy || !model.next || !model.starReady || !model.coinReady) return;
      busy = true; ui.btn.disabled = true;
      try { await model.onBuy(); }
      finally { busy = false; if (model) setModel(model); }
    });
    return ui;
  }

  function setModel(next) {
    model = next;
    if (!model || !mount()) return;
    const { name, level, btn } = ui;
    let pips = '';
    for (let i = 0; i < model.maxLevel; i++) pips += `<i class="${i < model.level ? 'on' : ''}"></i>`;
    level.innerHTML = pips;
    level.setAttribute('aria-label', `Renovation ${model.level} of ${model.maxLevel}`);
    if (!model.next) {
      name.textContent = '';
      btn.innerHTML = `<span class="reno-i">${checkIcon()}</span>`;
      btn.disabled = true; btn.setAttribute('aria-label', 'Every renovation done');
      return;
    }
    name.textContent = model.next.name;
    if (!model.starReady) {
      // Gated on a Café Star since Batch E1 (it waited on reputation, a number the UI no longer
      // draws). The lock is drawn beside the STAR it waits for and the price it will cost, so the
      // two different reasons a button is dark — not enough stars, not enough coins — look
      // different at a glance.
      btn.innerHTML = `<span class="reno-i">${lockIcon()}</span><span class="reno-i">${starIcon()}</span><span>${model.next.star}</span>`;
      btn.setAttribute('aria-label', `${model.next.name}, ${fmt(model.next.cost)} coins, opens at Café Star ${model.next.star}`);
    } else {
      btn.innerHTML = `<span class="reno-i">${coinIcon()}</span><span>${fmt(model.next.cost)}</span>`;
      btn.setAttribute('aria-label', `${model.next.name}, ${fmt(model.next.cost)} coins`);
    }
    btn.disabled = busy || !model.starReady || !model.coinReady;
  }
  return { setModel };
}
