// src/ui/map.js — the journey map (a 3D island, render/mapView.js) and the café review.
//
// Pins float over each café: gold once finished (with its stars), green when it can be opened, grey
// when locked or coming soon. Tap a pin: the camera glides there and one card offers one button.
//  - first launch: the map opens once on the town, one tap on ▶ and you are in your café;
//  - finishing a café: the pets leave a review, then the map opens on the next café;
//  - after the first café: the 🗺️ button opens it to travel.
import { LOCATIONS, LOCATION_ORDER, PRODUCTS } from '../game/layout.js';
import { PET_PROFILES } from '../sim/petBook.js';
import { createMapView, SITES } from '../render/mapView.js';

const EMOJI = { cat: '🐱', dog: '🐶', bunny: '🐰', hamster: '🐹' };
const SOON = { lodge: 'Snowy Lodge', night: 'Night Market' };

export function createMap(root, W, audio, onPause, onTravel, S) {
  const view = createMapView(S);
  root.insertAdjacentHTML('beforeend', `<button class="mapbtn ui hidden" id="mapbtn" aria-label="Café map"><span>🗺️</span><i class="dot hidden"></i></button>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="worldmap hidden" id="worldmap">
      <div class="wmpins" id="wmpins"></div>
      <div class="wmhead"><span class="wmcoins"><i class="coin"></i><b id="wmcoins">0</b></span><button class="close" id="wmclose" aria-label="Close">✕</button></div>
      <div class="wmcard hidden" id="wmcard"></div>
      <div class="wmload" id="wmload">🐾</div>
    </div>
    <div class="sheet hidden" id="reviewsheet"><div class="sheet-card reviewcard" id="reviewcard"></div></div>`);
  const btn = root.querySelector('#mapbtn'), dot = btn.querySelector('.dot');
  const map = document.getElementById('worldmap'), pinsEl = document.getElementById('wmpins');
  const card = document.getElementById('wmcard'), closeBtn = document.getElementById('wmclose'), loadEl = document.getElementById('wmload');
  const reviewSheet = document.getElementById('reviewsheet'), reviewCard = document.getElementById('reviewcard');
  let introMode = false, running = false, last = 0;
  const ALL = [...LOCATION_ORDER, 'lodge', 'night'];

  const stars = r => `<span class="starbar" style="--p:${Math.round(r / 5 * 100)}%">★★★★★</span>`;
  const prevDone = i => i === 0 || W.done.has(LOCATION_ORDER[i - 1]) || (W.loc === LOCATION_ORDER[i - 1] && W.complete());
  function stateOf(id) {
    const i = LOCATION_ORDER.indexOf(id);
    if (i < 0) return 'soon';
    if (W.loc === id) return W.ratings[id] ? 'done' : 'here';
    if (W.open.has(id)) return W.ratings[id] ? 'done' : 'open';
    return prevDone(i) ? 'buy' : 'locked';
  }
  const nameOf = id => LOCATIONS[id] ? LOCATIONS[id].name : SOON[id];

  function renderPins() {
    pinsEl.innerHTML = ALL.map(id => {
      const st = stateOf(id), r = W.ratings[id], loc = LOCATIONS[id];
      const tag = r ? `<span class="wmtag gold">★ ${r.stars.toFixed(1)}</span>`
        : st === 'buy' ? `<span class="wmtag green"><i class="coin"></i>${loc.cost.toLocaleString('en-US')}</span>`
        : st === 'locked' ? `<span class="wmtag">🔒</span>` : st === 'soon' ? `<span class="wmtag">⏳</span>`
        : st === 'here' ? `<span class="wmtag here">📍</span>` : '';
      return `<button class="wmhit" data-id="${id}" aria-label="${nameOf(id)}">${tag}</button>`;
    }).join('');
    for (const id of ALL) view.setPin(id, stateOf(id));
  }

  function renderCard(id) {
    view.focus(id, false, false);
    const st = stateOf(id), loc = LOCATIONS[id], r = W.ratings[id];
    const icons = loc ? loc.menu.map(p => PRODUCTS[p].emoji).join('') : '';
    let action;
    if (introMode) action = `<button class="wmgo pulse" data-go="${id}">▶</button>`;
    else if (st === 'soon') action = `<span class="wmgo off">⏳</span>`;
    else if (st === 'locked') action = `<span class="wmgo off">🔒</span>`;
    else if (st === 'buy') action = W.coins >= loc.cost ? `<button class="wmgo buy" data-buy="${id}"><i class="coin"></i>${loc.cost.toLocaleString('en-US')} ▶</button>`
      : `<span class="wmgo off"><i class="coin"></i>${Math.floor(W.coins).toLocaleString('en-US')} / ${loc.cost.toLocaleString('en-US')}</span>`;
    else if (id === W.loc) action = `<button class="wmgo" data-close="1">▶</button>`;
    else action = `<button class="wmgo" data-go="${id}">▶</button>`;
    card.innerHTML = `<span class="wmc-art">${SITES[id].art}</span><div class="wmc-txt"><b>${nameOf(id)}</b><small>${r ? stars(r.stars) : icons}</small></div>${action}`;
    card.classList.remove('hidden');
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!view.ready) return;
    view.frame(dt);
    const scr = { x: 0, y: 0 };
    for (const el of pinsEl.children) { const p = view.screenOf(el.dataset.id, scr); if (p) el.style.transform = `translate(${p.x | 0}px,${p.y | 0}px)`; }
  }

  async function open({ intro = false, focus = null } = {}) {
    introMode = intro;
    closeBtn.style.display = intro ? 'none' : '';
    document.getElementById('wmcoins').textContent = Math.floor(W.coins).toLocaleString('en-US');
    map.classList.remove('hidden'); onPause(true); document.body.classList.add('mapmode');
    card.classList.add('hidden'); loadEl.classList.remove('hidden');
    await view.load();
    loadEl.classList.add('hidden');
    renderPins();
    const f = focus || (intro ? 'town' : (LOCATION_ORDER.find(id => stateOf(id) === 'buy') || W.loc));
    view.wide(true); setTimeout(() => renderCard(f), intro ? 700 : 250);
    running = true; last = 0; requestAnimationFrame(loop);
  }
  function close() {
    const veil = document.getElementById('veil');
    veil.classList.add('show');
    setTimeout(() => { running = false; map.classList.add('hidden'); card.classList.add('hidden'); introMode = false; document.body.classList.remove('mapmode'); onPause(false); veil.classList.remove('show'); }, 380);
  }

  pinsEl.addEventListener('click', e => { const b = e.target.closest('.wmhit'); if (b) { renderCard(b.dataset.id); audio.play('tap'); } });
  card.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'), buy = e.target.closest('[data-buy]'), cl = e.target.closest('[data-close]');
    if (go) { const id = go.dataset.go; audio.play('chime'); close(); if (id !== W.loc) setTimeout(() => onTravel(id), 420); }
    else if (buy) {
      const id = buy.dataset.buy, cost = LOCATIONS[id].cost;
      if (W.coins < cost) return;
      W.coins -= cost; W.open.add(id); audio.play('fanfare');
      close(); setTimeout(() => onTravel(id), 420);
    } else if (cl) close();
  });
  closeBtn.addEventListener('click', () => close());
  btn.addEventListener('click', e => { e.stopPropagation(); dot.classList.add('hidden'); open(); audio.play('tap'); });

  // ---- the review: guests and pets rate the finished café ---------------------------------------
  const LINES = {
    town: ['Best {p} in town! My human let me lick the crumbs.', 'Someone scratched my ears while we ate. Five stars!', 'The {p} smell alone is worth the walk.', 'Cosy, friendly, and they had a bowl of water ready for me.', 'My favourite nap spot. The {p} is a bonus.'],
    beach: ['Sand in my paws, {p} in my heart.', 'Sunset, sea breeze and a {p}. Perfect day.', 'I came for the waves, I stayed for the {p}.', 'The staff saved me a shady spot. Pawsome!', 'Best {p} on the whole coast!'],
  };
  function makeReview(id) {
    const loc = LOCATIONS[id];
    const met = [...W.met].map(k => k.split(':')).filter(([s, v]) => loc.variants.includes(+v));
    const petted = Object.entries(W.friends).filter(([k]) => loc.variants.includes(+k.split(':')[1])).reduce((a, [, n]) => a + n, 0);
    const served = (id === W.loc ? W.served : (W.saved[id] && W.saved[id].served)) | 0;
    const rating = Math.min(5, Math.round((4.3 + Math.min(0.3, met.length * 0.02) + Math.min(0.2, petted * 0.02) + Math.min(0.2, served / 1500)) * 10) / 10);
    const pool = met.length ? met : [['cat', loc.variants[0]], ['dog', loc.variants[1]], ['bunny', loc.variants[2]]];
    const reviews = [];
    for (let i = 0; i < 3; i++) {
      const [sp, v] = pool[(i * 7 + served) % pool.length];
      const prof = PET_PROFILES[sp][+v], product = PRODUCTS[loc.menu[i % loc.menu.length]];
      const line = LINES[loc.theme][(i + met.length) % LINES[loc.theme].length].replace('{p}', `${product.emoji} ${loc.menu[i % loc.menu.length]}`);
      reviews.push({ who: prof.name, sp, stars: i === 2 && rating < 4.8 ? 4 : 5, text: line });
    }
    return { stars: rating, count: served + met.length * 3 + 12, reviews };
  }
  function review(id, then) {
    const r = W.ratings[id] || (W.ratings[id] = makeReview(id));
    const loc = LOCATIONS[id];
    reviewCard.innerHTML = `
      <div class="rv-head"><span class="rv-art">${SITES[id].art}</span><div><b>${loc.name}</b><small>Pet café · ${loc.menu.map(p => PRODUCTS[p].emoji).join(' ')}</small></div></div>
      <div class="rv-score"><b>${r.stars.toFixed(1)}</b><span class="rv-stars">${stars(r.stars)}</span><small>${r.count} reviews</small></div>
      <div class="rv-list">${r.reviews.map((x, i) => `<div class="rv-item" style="animation-delay:${0.25 + i * 0.35}s"><span class="rv-av">${EMOJI[x.sp]}</span><div><b>${x.who}</b> <span class="rv-s">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}</span><p>“${x.text}”</p></div></div>`).join('')}</div>
      <button class="big" id="rvgo" aria-label="See the map">🗺️ ▶</button>`;
    reviewSheet.classList.remove('hidden'); onPause(true); audio.play('chime');
    document.getElementById('rvgo').addEventListener('click', () => { reviewSheet.classList.add('hidden'); onPause(false); then && then(); }, { once: true });
  }

  return {
    update() {
      const show = W.open.size > 1 || W.done.size > 0 || W.complete();
      btn.classList.toggle('hidden', !show);
    },
    nudge() { dot.classList.remove('hidden'); btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); },
    intro() { open({ intro: true }); },
    review(id) { review(id, () => open({ focus: LOCATION_ORDER[LOCATION_ORDER.indexOf(id) + 1] || id })); },
    open,
  };
}
