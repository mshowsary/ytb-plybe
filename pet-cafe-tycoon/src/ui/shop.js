// src/ui/shop.js — the one Shop, and its doors.
//
// There used to be three places that sold things: the kiosk sheet, and the Café menu's "Make service
// smoother" and "Pet playground" lists, which sold the same upgrades and décor at the same prices.
// Now there is one sheet (ui/sheets.js renderKiosk: Staff / Upgrades / Décor) and this module is how
// the Café card opens it. The staff desk opens the same sheet, titled "Staff".
//
// It owns its buy actions, so the Café card's door works on its own; systems/stations.js still
// opens the kiosk and the staff desk with its own copy of these actions until the Batch D wiring
// points those doors here (G.openShop) as well.
import { buyUpgrade, hire, buyWorkerUpgrade, buyStar, buyDecor } from '../sim/economy.js';
import { buildKioskModel, normalizeShopTab } from './models.js';
import { activeSheets } from './sheets.js';
import { cue } from './hud.js';
import { coinIcon, crossIcon } from './icons.js';

export function createShop(G) {
  let tab = 'upgrades', door = 'shop', focus = null;
  const sheets = () => activeSheets();
  const model = () => buildKioskModel(G, G.world, tab, focus, door);
  const refresh = () => { const s = sheets(); if (s && s.isOpen && s.kind === 'kiosk') s.refresh(model()); };
  // The same answers the world's doors give: a chime and a checkpoint on a buy, a crossed coin when
  // the wallet is short.
  const settle = (r, reason) => {
    if (r && r.ok) { G.audio?.play?.('chime'); G.hud?.setCoins?.(G.coins); G.requestCheckpoint?.(reason); refresh(); }
    else { G.audio?.play?.('angry'); G.hud?.toast?.(cue([coinIcon(), crossIcon()], 'Not enough coins')); }
  };
  const actions = {
    buy: key => settle(buyUpgrade(G, key), 'player-upgrade'),
    hire: kind => settle(hire(G, kind), 'staff-hire'),
    buyWorker: (kind, key) => settle(buyWorkerUpgrade(G, kind, key), 'worker-upgrade'),
    buyStar: id => settle(buyStar(G, G.world, id), 'station-star'),
    buyDecor: id => settle(buyDecor(G, id), 'decor-buy'),
    setTab: next => { tab = normalizeShopTab(next); focus = null; refresh(); },
    assignRunner: (index, displayId) => {
      const runner = (G.staffList || []).filter(s => s.kind === 'runner')[index];
      if (!runner) return;
      runner.assign = displayId; G.audio?.play?.('tap'); refresh();
    },
  };
  return {
    // door: 'shop' (the Café card) or 'staff' (the staff desk). startTab defaults to the tab a
    // door is for; focusRow scrolls a machine row into view (a tapped chalkboard).
    open(doorName = 'shop', startTab = null, focusRow = null) {
      const s = sheets();
      if (!s) return false;
      door = doorName === 'staff' ? 'staff' : 'shop';
      tab = normalizeShopTab(startTab || (door === 'staff' ? 'staff' : 'upgrades'));
      focus = focusRow;
      s.open('kiosk', model(), actions);
      return true;
    },
    refresh,
  };
}
