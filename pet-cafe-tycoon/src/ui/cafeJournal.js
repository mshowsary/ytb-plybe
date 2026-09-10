import { cafeDayModel } from './cafeDayModel.js';
import { DECOR_BY_ID } from '../../data/decor.js';
import { buyDecor, buyUpgrade, upgradeCost } from '../sim/economy.js';

const PROJECTS = [
  ['d_play_wand', 'Feather play perch', 'A springy feather toy for curious visitors. +1 reputation.'],
  ['d_play_wheel', 'Hamster playground', 'A tiny wheel and climbing steps. +1 reputation.'],
  ['d_play_fountain', 'Paw splash garden', 'A pet-sized fountain with a floating ball. +1 reputation.'],
];
const OFFERS = [
  ['.speed-build-chip', 'Finish this build', 'Complete your partly funded station'],
  ['.rare-visitor-chip', 'Invite a rare pet', 'Your next visitor brings a rare or epic pet'],
  ['.golden-shot-chip', 'Double photo tips', '2× photo tips for this shift'],
  ['.mystery-float-chip', 'Mystery paw gift', 'Coins, a restock or a golden tip boost'],
];

export function createCafeJournal(G, platform) {
  const menu = document.querySelector('.pause-root');
  const button = document.querySelector('.pause-btn');
  const badge = document.createElement('span'); badge.className = 'cafe-day-badge'; button.append(badge);
  const card = document.createElement('div'); card.className = 'cafe-today';
  card.innerHTML = '<div class="journal-eyebrow"></div><strong class="journal-title"></strong><p class="journal-event"></p><div class="journal-phase"></div><div class="journal-next"></div>';
  menu.querySelector('[data-view="home"]').prepend(card);
  const shop = document.createElement('div'); shop.className = 'cafe-workshop';
  shop.innerHTML = '<h3>Pet playground</h3><p class="journal-caption">Build a little more personality into your café.</p>';
  const projectRows = PROJECTS.map(([id, name, detail]) => {
    const row = document.createElement('div'); row.className = 'journal-project';
    row.innerHTML = `<div class="journal-project-icon">${DECOR_BY_ID.get(id).icon}</div><div><strong>${name}</strong><p>${detail}</p></div><button type="button" class="journal-buy"></button>`;
    const buy = row.querySelector('button');
    buy.dataset.project = id;
    buy.addEventListener('click', () => {
      if (platform.paused || platform.adBusy) return;
      const result = buyDecor(G, id);
      if (result.ok) { G.hud.setCoins(G.coins); G.audio.play('chime'); G.requestCheckpoint?.('pet-playground-purchase'); }
      refresh();
    });
    shop.append(row); return { id, buy };
  });
  menu.querySelector('[data-view="cafe"]').append(shop);
  const upgrades = document.createElement('div'); upgrades.className = 'cafe-workshop';
  upgrades.classList.add('cafe-upgrades');
  upgrades.innerHTML = '<h3>Make service smoother</h3><p class="journal-caption journal-expansion"></p>';
  const upgradeRows = [['speed', 'Comfy work shoes', 'Move faster between stations'], ['carry', 'Bigger serving tray', 'Carry more in each trip'], ['income', 'Signature menu', 'Earn more from every sale']].map(([key, name, detail]) => {
    const row = document.createElement('div'); row.className = 'journal-project';
    row.innerHTML = `<div><strong>${name}</strong><p>${detail}</p></div><button type="button" class="journal-buy" data-upgrade="${key}"></button>`;
    const buy = row.querySelector('button');
    buy.addEventListener('click', () => {
      if (platform.paused || platform.adBusy) return;
      const result = buyUpgrade(G, key);
      if (result.ok) { G.hud.setCoins(G.coins); G.audio.play('chime'); G.requestCheckpoint?.('player-upgrade'); }
      refresh();
    });
    upgrades.append(row); return { key, buy };
  });
  menu.querySelector('[data-view="cafe"]').insertBefore(upgrades, shop);
  const offers = document.createElement('div'); offers.className = 'cafe-perks';
  offers.innerHTML = '<h3>A little help</h3><p class="journal-caption">Choose one available bonus per shift. Playing normally stays free.</p>';
  let busy = false;
  const offerRows = OFFERS.map(([selector, name, detail]) => {
    const row = document.createElement('div'); row.className = 'journal-project';
    row.innerHTML = `<div><strong>${name}</strong><p>${detail}</p></div><button type="button" class="journal-buy">Watch ad</button>`;
    const action = row.querySelector('button');
    action.dataset.perk = selector.slice(1);
    action.addEventListener('click', () => {
      const source = document.querySelector(selector);
      if (busy || !source || source.classList.contains('hidden') || platform.paused || platform.adBusy) return;
      source.click(); refresh();
    });
    offers.append(row); return { selector, row, action };
  });
  menu.querySelector('[data-view="journey"]').append(offers);
  // Named choices replace the old ambiguous action which silently selected the first offer.
  menu.querySelector('[data-route="bonus"]').hidden = true;
  const style = document.createElement('style');
  style.textContent = `
    .journal-project[hidden],.cafe-perks[hidden]{display:none!important}
    .cafe-upgrades .journal-project{grid-template-columns:minmax(0,1fr) auto!important}
    @media(min-width:260px){.pause-root .cafe-home{grid-template-columns:1fr 1fr}}
    .cafe-day-badge{position:absolute;right:-2px;bottom:-5px;padding:2px 5px;border-radius:7px;background:#3e302b;color:#fff9f1;font:800 10px/1.2 system-ui;pointer-events:none}
    .pause-btn.rush-soon{box-shadow:0 0 0 2px #cf9161,0 4px 14px #271b1524!important}
    .cafe-today{padding:13px;background:#eeeadd;border-radius:15px;margin-bottom:10px;line-height:1.35}
    .journal-eyebrow{font:800 10px/1.4 system-ui;text-transform:uppercase;letter-spacing:.06em;color:#666d51}.journal-title{display:block;font-size:17px;margin-top:3px}
    .journal-event,.journal-caption,.journal-project p{font:500 11px/1.45 system-ui;margin:5px 0;color:#6a6054}.journal-phase{font:750 12px/1.5 system-ui;margin-top:7px}.journal-next{font:600 10px/1.4 system-ui;margin-top:5px;color:#706658}
    .cafe-workshop,.cafe-perks{margin-top:14px}.cafe-workshop h3,.cafe-perks h3{font-size:15px;margin:0}.journal-project{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;background:#fff;border-radius:13px;padding:10px;margin-top:7px}.cafe-workshop .journal-project{grid-template-columns:28px minmax(0,1fr) auto}.journal-project strong{font:750 12px/1.3 system-ui}.journal-project-icon svg{width:28px;height:28px}.journal-buy{min-height:48px;min-width:56px;max-width:85px;border:0;border-radius:11px;padding:6px;background:#80977c;color:#fff;font:750 11px/1.2 system-ui;cursor:pointer}.journal-buy:disabled{background:#eeeae4;color:#6a6054;cursor:default}.journal-buy:focus-visible{outline:3px solid #d98c82;outline-offset:2px}[data-route="bonus"][hidden]{display:none!important}
    @media(max-height:419px){.cafe-today{padding:9px}.journal-event,.journal-next{display:none}.journal-title{font-size:14px}.journal-phase{margin-top:2px;font-size:11px}}
    @media(max-width:260px){.cafe-workshop .journal-project{grid-template-columns:minmax(0,1fr) auto}.journal-project-icon{display:none}.journal-project{padding:8px}.journal-project p{font-size:10px}}
  `; document.head.append(style);
  let lastSecond = -1;
  function refresh() {
    const model = cafeDayModel(G);
    badge.textContent = model.soon ? `${model.left}s` : `D${model.day}`;
    button.classList.toggle('rush-soon', model.soon);
    button.title = `Day ${model.day} · ${model.label} · ${model.clock}`;
    button.setAttribute('aria-label', `Café menu. Day ${model.day}. ${model.soon ? 'Rush in ' + model.left + ' seconds' : model.label}`);
    card.querySelector('.journal-eyebrow').textContent = `Day ${model.day} · ${model.season}`;
    card.querySelector('.journal-title').textContent = model.title;
    card.querySelector('.journal-event').textContent = model.event;
    card.querySelector('.journal-phase').textContent = `${model.phase === 'morning' ? 'Rush in' : model.label} ${model.clock} · ${model.tip}`;
    card.querySelector('.journal-next').textContent = `Tomorrow: ${model.tomorrow}${model.goal ? ' · Today’s goal ' + model.goal : ''}`;
    for (const { id, buy } of projectRows) {
      const owned = G.meta.decor?.includes(id), price = DECOR_BY_ID.get(id).price;
      buy.textContent = owned ? 'Built ✓' : `${price} coins`;
      buy.disabled = owned || G.coins < price || platform.adBusy;
    }
    const next = G.world.activeZoneList?.[0];
    upgrades.querySelector('.journal-expansion').textContent = next ? `Next build: ${next.label || 'Café expansion'} · ${Math.max(0, next.price - (G.world.partial[next.id] || 0))} coins remaining. Walk to its floor marker.` : 'Choose the upgrade that helps your busiest station.';
    for (const { key, buy } of upgradeRows) {
      const price = upgradeCost(key, G.up);
      buy.textContent = price == null ? 'Max level' : `${price} coins`;
      buy.title = `Level ${(G.up[key] | 0) + 1}`;
      buy.disabled = price == null || G.coins < price || platform.adBusy;
    }
    busy = platform.adBusy;
    for (const { selector, row, action } of offerRows) {
      const source = document.querySelector(selector);
      const available = source && !source.classList.contains('hidden');
      row.hidden = !available;
      const canWatch = !platform.inPlayables || platform.rewardedAvailable;
      action.disabled = busy || !available || !canWatch;
      action.textContent = !canWatch ? 'Unavailable' : platform.inPlayables ? 'Watch ad' : 'Try bonus';
    }
    offers.hidden = !offerRows.some(({ row }) => !row.hidden);
  }
  menu.addEventListener('click', refresh);
  button.addEventListener('click', refresh);
  refresh();
  return { refresh, update() { const second = Math.floor(G.dayState.t); if (second !== lastSecond || busy !== platform.adBusy) { lastSecond = second; refresh(); } } };
}
