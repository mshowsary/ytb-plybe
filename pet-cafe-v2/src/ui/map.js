// src/ui/map.js — the Pet Café journey map, and the café review.
//
// An illustrated island: the town, the beach, the mountains, the night market. Every café is a pin:
// finished ones show their star rating, the next one shows its price, later ones are "coming soon".
//  - first launch: the map opens once with the town pin pulsing — one tap and you are in your café;
//  - finishing a café: the guests and their pets leave a review (always warm, never a grade that
//    punishes), then the map opens on the next café;
//  - any time after the first café: the 🗺️ button opens it to travel between cafés.
import { LOCATIONS, LOCATION_ORDER, COMING_SOON, PRODUCTS } from '../game/layout.js';
import * as L from '../game/layout.js';
import { PET_PROFILES } from '../sim/petBook.js';

const PINS = {
  town:  { x: 210, y: 400, art: '🏡' },
  beach: { x: 452, y: 452, art: '🏖️' },
  lodge: { x: 430, y: 160, art: '🏔️', soon: 'Snowy Lodge' },
  night: { x: 150, y: 190, art: '🏮', soon: 'Night Market' },
};
const EMOJI = { cat: '🐱', dog: '🐶', bunny: '🐰', hamster: '🐹' };

const MAP_SVG = `
<svg class="wmsvg" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <pattern id="wave" width="40" height="20" patternUnits="userSpaceOnUse"><path d="M0 10 Q10 4 20 10 T40 10" fill="none" stroke="#FFFFFF55" stroke-width="2"/></pattern>
  </defs>
  <rect width="600" height="600" fill="#8FD3E8"/><rect width="600" height="600" fill="url(#wave)"/>
  <!-- the island: sand rim and green land -->
  <path d="M60 300 C40 180 120 70 260 60 C400 50 540 110 550 250 C560 380 520 520 380 545 C250 570 90 520 70 420 Z" fill="#F1E1BD"/>
  <path d="M85 300 C70 190 140 90 262 84 C392 76 516 128 524 250 C532 356 500 470 395 500 C300 525 150 500 110 420 Z" fill="#9ED37A"/>
  <!-- the beach cove on the south-east -->
  <path d="M360 520 C420 470 470 440 540 420 L560 470 C520 520 460 548 380 552 Z" fill="#F4E4C0"/>
  <path d="M380 548 C450 540 510 512 548 470" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-dasharray="10 8"/>
  <!-- mountains in the north-east with snow caps -->
  <path d="M340 220 L400 110 L460 220 Z" fill="#8E9AA8"/><path d="M380 150 L400 110 L420 150 L408 144 L400 156 L392 144 Z" fill="#FFFFFF"/>
  <path d="M410 230 L470 130 L530 230 Z" fill="#7C8898"/><path d="M452 162 L470 130 L488 162 L477 157 L470 168 L462 157 Z" fill="#FFFFFF"/>
  <!-- the night market in the north-west: a violet plaza with lanterns -->
  <ellipse cx="160" cy="190" rx="78" ry="52" fill="#6C5BA8" opacity="0.85"/>
  <g fill="#FFB347"><circle cx="120" cy="175" r="5"/><circle cx="150" cy="160" r="5"/><circle cx="185" cy="168" r="5"/><circle cx="200" cy="200" r="5"/><circle cx="130" cy="210" r="5"/></g>
  <!-- the town: little houses and a park -->
  <g><rect x="150" y="360" width="26" height="22" fill="#F4E6CF"/><path d="M146 362 L163 346 L180 362 Z" fill="#D9785B"/>
     <rect x="240" y="352" width="30" height="24" fill="#FFF4E0"/><path d="M236 354 L255 338 L274 354 Z" fill="#5B8FB9"/>
     <rect x="180" y="440" width="24" height="20" fill="#F4E6CF"/><path d="M176 442 L192 428 L208 442 Z" fill="#EE7F5F"/>
     <rect x="250" y="430" width="28" height="22" fill="#FFF4E0"/><path d="M246 432 L264 416 L282 432 Z" fill="#9C7A55"/></g>
  <g fill="#5DA84F"><circle cx="120" cy="420" r="12"/><circle cx="138" cy="438" r="10"/><circle cx="300" cy="380" r="11"/><circle cx="320" cy="300" r="13"/><circle cx="240" cy="260" r="12"/><circle cx="90" cy="330" r="10"/></g>
  <g fill="#3F8E4B"><circle cx="505" cy="420" r="6"/><circle cx="520" cy="440" r="5"/></g>
  <!-- the journey: a dotted road from café to café -->
  <path d="M210 400 C300 440 380 470 452 452 M452 452 C520 380 480 260 430 160 M430 160 C330 110 220 130 150 190" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14" opacity="0.95"/>
  <!-- a little boat and a gull -->
  <g transform="translate(90 540)"><path d="M0 0 L40 0 L32 10 L8 10 Z" fill="#FFFFFF"/><path d="M20 0 L20 -30 L36 -4 Z" fill="#EE7F5F"/></g>
  <path d="M520 80 q8 -8 16 0 q8 -8 16 0" fill="none" stroke="#FFFFFF" stroke-width="3"/>
</svg>`;

export function createMap(root, W, audio, onPause, onTravel) {
  root.insertAdjacentHTML('beforeend', `<button class="mapbtn ui hidden" id="mapbtn" aria-label="Café map"><span>🗺️</span><i class="dot hidden"></i></button>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="worldmap hidden" id="worldmap">
      <div class="wmstage" id="wmstage">${MAP_SVG}<div class="wmpins" id="wmpins"></div></div>
      <div class="wmhead"><b id="wmtitle">🐾 Your Pet Café journey</b><span class="wmcoins"><i class="coin"></i><b id="wmcoins">0</b></span><button class="close" id="wmclose" aria-label="Close">✕</button></div>
      <div class="wmcard hidden" id="wmcard"></div>
    </div>
    <div class="sheet hidden" id="reviewsheet"><div class="sheet-card reviewcard" id="reviewcard"></div></div>`);
  const btn = root.querySelector('#mapbtn'), dot = btn.querySelector('.dot');
  const map = document.getElementById('worldmap'), stage = document.getElementById('wmstage'), pins = document.getElementById('wmpins');
  const card = document.getElementById('wmcard'), title = document.getElementById('wmtitle'), closeBtn = document.getElementById('wmclose');
  const reviewSheet = document.getElementById('reviewsheet'), reviewCard = document.getElementById('reviewcard');
  let introMode = false, selected = null;

  // five stars filled to the exact rating (a gold gradient clipped to the glyphs)
  const stars = r => `<span class="starbar" style="--p:${Math.round(r / 5 * 100)}%">★★★★★</span>`;
  const prevDone = i => i === 0 || W.done.has(LOCATION_ORDER[i - 1]) || (W.loc === LOCATION_ORDER[i - 1] && W.complete());

  function stateOf(id) {
    const i = LOCATION_ORDER.indexOf(id);
    if (i < 0) return 'soon';
    if (W.loc === id) return 'here';
    if (W.open.has(id)) return 'open';
    return prevDone(i) ? 'buy' : 'locked';
  }

  function renderPins() {
    let html = '';
    const all = [...LOCATION_ORDER, 'lodge', 'night'];
    for (const id of all) {
      const pin = PINS[id]; if (!pin) continue;
      const st = stateOf(id), loc = LOCATIONS[id], rating = W.ratings[id];
      const label = loc ? loc.name : pin.soon;
      let sub = '';
      if (st === 'soon') sub = 'Soon';
      else if (rating) sub = `${rating.stars.toFixed(1)} ★`;
      else if (st === 'buy') sub = `🪙 ${loc.cost.toLocaleString('en-US')}`;
      else if (st === 'locked') sub = '🔒';
      else if (st === 'here') sub = '📍';
      html += `<button class="wmpin st-${st} ${introMode && id === 'town' ? 'pulse' : ''}" data-id="${id}" style="left:${pin.x / 6}%;top:${pin.y / 6}%">
        <span class="wmart">${pin.art}</span><span class="wmlabel"><b>${label}</b><small>${sub}</small></span></button>`;
    }
    pins.innerHTML = html;
  }

  function renderCard(id) {
    selected = id;
    const loc = LOCATIONS[id], pin = PINS[id], st = stateOf(id), rating = W.ratings[id];
    if (!loc) { card.innerHTML = `<div class="wmc-top"><span class="wmc-art">${pin.art}</span><div><b>${pin.soon}</b><small>A new pet café is on its way. Coming soon!</small></div></div>`; card.classList.remove('hidden'); return; }
    const menu = loc.menu.map(p => PRODUCTS[p].emoji).join(' ');
    let action = '';
    if (introMode && id === 'town') action = `<button class="big go-big" data-go="town">Open my café ▶</button>`;
    else if (st === 'here') action = `<button class="big" data-close="1">📍 Back to my café</button>`;
    else if (st === 'open') action = `<button class="big" data-go="${id}">Travel here ▶</button>`;
    else if (st === 'buy') action = W.coins >= loc.cost ? `<button class="big" data-buy="${id}">Open for <i class="coin"></i> ${loc.cost.toLocaleString('en-US')}</button>`
      : `<button class="big poor" disabled><i class="coin"></i> ${loc.cost.toLocaleString('en-US')} needed</button><small class="wmc-note">Keep serving: you have ${Math.floor(W.coins).toLocaleString('en-US')}</small>`;
    else action = `<small class="wmc-note">🔒 Finish the ${LOCATIONS[LOCATION_ORDER[LOCATION_ORDER.indexOf(id) - 1]].name} first</small>`;
    card.innerHTML = `<div class="wmc-top"><span class="wmc-art">${pin.art}</span><div><b>${loc.name}</b>
      <small>${rating ? `<span class="wmc-stars">${stars(rating.stars)}</span> ${rating.stars.toFixed(1)} · ${rating.count} reviews` : menu}</small></div></div>${action}`;
    card.classList.remove('hidden');
  }

  function open({ intro = false, focus = null } = {}) {
    introMode = intro;
    title.textContent = intro ? '🐾 Welcome! Your first pet café awaits' : '🐾 Your Pet Café journey';
    closeBtn.style.display = intro ? 'none' : '';
    document.getElementById('wmcoins').textContent = Math.floor(W.coins).toLocaleString('en-US');
    renderPins();
    map.classList.remove('hidden', 'leaving'); onPause(true);
    renderCard(focus || (intro ? 'town' : (LOCATION_ORDER.find(id => stateOf(id) === 'buy') || W.loc)));
  }
  function close(zoomTo = null) {
    if (zoomTo && PINS[zoomTo]) {
      stage.style.transformOrigin = `${PINS[zoomTo].x / 6}% ${PINS[zoomTo].y / 6}%`;
      map.classList.add('leaving'); onPause(false);          // the café comes alive behind the zoom
      setTimeout(() => { map.classList.add('hidden'); map.classList.remove('leaving'); stage.style.transformOrigin = ''; }, 700);
    } else { map.classList.add('hidden'); onPause(false); }
    card.classList.add('hidden'); introMode = false;
  }

  pins.addEventListener('click', e => { const b = e.target.closest('.wmpin'); if (b) { renderCard(b.dataset.id); audio.play('tap'); } });
  card.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'), buy = e.target.closest('[data-buy]'), cl = e.target.closest('[data-close]');
    if (go) {
      const id = go.dataset.go; audio.play('chime');
      if (id === W.loc) close(id); else { close(id); setTimeout(() => onTravel(id), 300); }
    } else if (buy) {
      const id = buy.dataset.buy, cost = LOCATIONS[id].cost;
      if (W.coins < cost) return;
      W.coins -= cost; W.open.add(id); audio.play('fanfare');
      close(id); setTimeout(() => onTravel(id), 300);
    } else if (cl) close(W.loc);
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
      <div class="rv-head"><span class="rv-art">${PINS[id].art}</span><div><b>${loc.name}</b><small>Pet café · ${loc.menu.map(p => PRODUCTS[p].emoji).join(' ')}</small></div></div>
      <div class="rv-score"><b>${r.stars.toFixed(1)}</b><span class="rv-stars">${stars(r.stars)}</span><small>${r.count} reviews</small></div>
      <div class="rv-list">${r.reviews.map((x, i) => `<div class="rv-item" style="animation-delay:${0.25 + i * 0.35}s"><span class="rv-av">${EMOJI[x.sp]}</span><div><b>${x.who}</b> <span class="rv-s">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}</span><p>“${x.text}”</p></div></div>`).join('')}</div>
      <button class="big" id="rvgo">See the map 🗺️</button>`;
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
