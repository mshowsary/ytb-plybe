// src/ui/map.js — the café city map (render/cityView.js) and the reviews the pets leave.
//
// A pin stands over each café with a little card: green and ticked once it is finished (with its
// stars), coral with a paw when it is yours to play or ready to open, lilac and locked when it is a
// chapter still to come. Tap a pin and the map glides there; one big button says what happens next.
//  - first launch: the map opens on the Town Café, one tap and you are inside;
//  - finishing a café: the map opens, the pin turns green, a pet's review pops up, then the map
//    glides to the next café and offers to open it;
//  - after the first café: the 🗺️ button opens it to travel.
import { LOCATIONS, LOCATION_ORDER, PRODUCTS } from '../game/layout.js';
import { PET_PROFILES } from '../sim/petBook.js';
import { createCityView } from '../render/cityView.js';
import { petPortrait } from '../render/portrait.js';

const PLACES = [...new Set([...LOCATION_ORDER, 'mall'])];
const SOON = { mall: 'Mall Café' };
const EMOJI = { cat: '🐱', dog: '🐶', bunny: '🐰', hamster: '🐹' };
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.6l4.3 4.3L19.2 7" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  paw: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="15.6" rx="5.1" ry="4.3"/><ellipse cx="5.5" cy="10.3" rx="2.1" ry="2.6"/><ellipse cx="9.3" cy="6.3" rx="2.1" ry="2.7"/><ellipse cx="14.7" cy="6.3" rx="2.1" ry="2.7"/><ellipse cx="18.5" cy="10.3" rx="2.1" ry="2.6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.4" width="14" height="10.2" rx="2.6" fill="#fff"/><path d="M8.3 10.6V8.1a3.7 3.7 0 0 1 7.4 0v2.5" fill="none" stroke="#fff" stroke-width="2.7"/></svg>',
};
const DROP = '<svg class="cp-drop" viewBox="0 0 48 60"><path d="M24 57.5C24 57.5 4.5 36.5 4.5 22.5a19.5 19.5 0 0 1 39 0C43.5 36.5 24 57.5 24 57.5Z"/></svg>';
const fmt = n => Math.floor(n).toLocaleString('en-US');

export function createMap(root, W, audio, onPause, onTravel, S) {
  const view = createCityView(S);
  root.insertAdjacentHTML('beforeend', `<button class="mapbtn ui hidden" id="mapbtn" aria-label="Café map"><span>🗺️</span><i class="dot hidden"></i></button>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="citymap hidden" id="citymap">
      <div class="cm-pins" id="cmpins"></div>
      <div class="cm-title"><span class="cm-paw">${ICON.paw}</span><b>Your café city</b></div>
      <div class="cm-top"><span class="cm-coins"><i class="coin"></i><b id="cmcoins">0</b></span><button class="cm-close" id="cmclose" aria-label="Close">✕</button></div>
      <div class="cm-review hidden" id="cmreview"></div>
      <button class="cm-cta hidden" id="cmcta"></button>
      <div class="cm-load" id="cmload"><span>${ICON.paw}</span></div>
    </div>`);
  const btn = root.querySelector('#mapbtn'), dot = btn.querySelector('.dot');
  const el = document.getElementById('citymap'), pinsEl = document.getElementById('cmpins');
  const cta = document.getElementById('cmcta'), revEl = document.getElementById('cmreview');
  const closeBtn = document.getElementById('cmclose'), loadEl = document.getElementById('cmload');
  const titleEl = el.querySelector('.cm-title'), topEl = el.querySelector('.cm-top');
  let mode = 'browse', running = false, last = 0, sel = 'town', revTimer = 0, revIdx = 0, revFor = null, pending = null;

  // ---- what each café is right now ---------------------------------------------------------------------
  const prevDone = i => i === 0 || W.done.has(LOCATION_ORDER[i - 1]) || !!W.ratings[LOCATION_ORDER[i - 1]] || (W.loc === LOCATION_ORDER[i - 1] && W.complete());
  function stateOf(id) {
    const i = LOCATION_ORDER.indexOf(id);
    if (i < 0) return 'soon';
    if (id === pending) return W.loc === id ? 'here' : 'open';      // about to turn green on the map
    if (W.ratings[id] || W.done.has(id)) return 'done';
    if (W.loc === id) return 'here';
    if (W.open.has(id)) return 'open';
    return prevDone(i) ? 'buy' : 'locked';
  }
  const nameOf = id => (LOCATIONS[id] ? LOCATIONS[id].name : SOON[id]);
  function status(id, st) {
    const loc = LOCATIONS[id], r = W.ratings[id];
    if (st === 'done') return r ? `Complete · ★ ${r.stars.toFixed(1)}` : 'Complete';
    if (st === 'here') return mode === 'intro' ? 'Your first café' : 'You are here';
    if (st === 'open') return 'Open';
    if (st === 'buy') return W.coins >= loc.cost ? 'Ready to open' : `<i class="coin"></i>${fmt(loc.cost)} to open`;
    if (st === 'locked') return 'Locked';
    return 'Next chapter';
  }
  const tone = st => (st === 'done' ? 'green' : st === 'locked' || st === 'soon' ? 'lilac' : 'coral');
  const iconOf = st => (st === 'done' ? ICON.check : st === 'locked' || st === 'soon' ? ICON.lock : ICON.paw);

  function renderPins() {
    pinsEl.innerHTML = PLACES.map(id => {
      const st = stateOf(id);
      return `<button class="cpin ${tone(st)}${id === sel ? ' sel' : ''}" data-id="${id}" aria-label="${nameOf(id)}">
        <span class="cp-label"><b>${nameOf(id)}</b><small>${status(id, st)}</small></span>
        <span class="cp-mark">${DROP}<span class="cp-ico">${iconOf(st)}</span></span></button>`;
    }).join('');
  }

  function renderCta() {
    const id = sel, st = stateOf(id), loc = LOCATIONS[id], name = nameOf(id);
    let html, act = '', off = false, pulse = false;
    if (mode === 'intro') { html = `<span class="cta-name">Open ${name}</span>`; act = 'close'; pulse = true; }
    else if (st === 'here' || (id === W.loc && st === 'done')) { html = `<span class="cta-name">Back to ${name}</span>`; act = 'close'; }
    else if (st === 'done' || st === 'open') { html = `<span class="cta-name">Go to ${name}</span>`; act = 'go'; }
    else if (st === 'buy' && W.coins >= loc.cost) { html = `<span class="cta-name">Open ${name}</span><span class="cta-cost"><i class="coin"></i>${fmt(loc.cost)}</span>`; act = 'buy'; pulse = true; }
    else if (st === 'buy') {
      const p = Math.min(1, W.coins / loc.cost);
      html = `<span class="cta-prog"><i style="width:${Math.round(p * 100)}%"></i></span><span class="cta-need"><i class="coin"></i>${fmt(W.coins)} / ${fmt(loc.cost)}</span>`; off = true;
    } else if (st === 'locked') { html = `${ICON.lock}<span class="cta-name">Finish ${nameOf(LOCATION_ORDER[LOCATION_ORDER.indexOf(id) - 1])} first</span>`; off = true; }
    else { html = `${ICON.lock}<span class="cta-name">Coming soon</span>`; off = true; }
    cta.innerHTML = `<span class="cta-txt">${html}</span>${off ? '' : '<span class="cta-go">›</span>'}`;
    cta.dataset.act = act; cta.classList.toggle('off', off); cta.classList.toggle('pulse', pulse); cta.classList.remove('hidden');
  }

  // ---- the review card ----------------------------------------------------------------------------
  function reviewFor(id) { return W.ratings[id] || null; }
  function showReview(id, i = 0, fresh = false) {
    const r = reviewFor(id);
    if (!r || mode === 'intro') { revEl.classList.add('hidden'); revFor = null; return; }
    revFor = id; revIdx = i % r.reviews.length; revTimer = 0;
    const x = r.reviews[revIdx];
    const v = x.v != null ? x.v : 0;
    let av = EMOJI[x.sp];
    try { av = `<img src="${petPortrait(S.renderer, x.sp, v)}" alt="">`; } catch (e) { /* the emoji will do */ }
    revEl.innerHTML = `<span class="cmr-av">${av}</span><div class="cmr-body"><span class="cmr-stars">${'★'.repeat(x.stars)}<i>${'★'.repeat(5 - x.stars)}</i></span>
      <p>“${x.text}”</p><small>${x.who} · ${nameOf(id)}</small></div>`;
    revEl.classList.remove('hidden'); revEl.classList.toggle('fresh', fresh);
    revEl.classList.remove('swap'); void revEl.offsetWidth; revEl.classList.add('swap');
  }

  function select(id, glide = true) {
    sel = id;
    if (glide) view.focus(id);
    renderPins(); renderCta();
    const shown = reviewFor(id) ? id : [...LOCATION_ORDER].reverse().find(k => W.ratings[k]);
    if (shown && shown !== revFor) showReview(shown);
    else if (!shown) { revEl.classList.add('hidden'); revFor = null; }
  }

  // ---- the frame loop and the pins that follow the picture --------------------------------------------------
  const scr = { x: 0, y: 0 };
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!view.ready) return;
    view.frame(dt);
    // keep every pin on screen and clear of the header and the button: one that would sit under
    // them parks at the edge as a bare marker (tap it and the map glides there)
    const topBar = Math.max(titleEl.getBoundingClientRect().bottom, topEl.getBoundingClientRect().bottom);
    let bottom = innerHeight - 8;
    for (const o of [cta, revEl]) if (!o.classList.contains('hidden')) bottom = Math.min(bottom, o.getBoundingClientRect().top - 6);
    const safe = { l: 30, r: innerWidth - 30, t: topBar + 66, b: bottom };
    for (const p of pinsEl.children) {
      const s = view.screenOf(p.dataset.id, scr); if (!s) continue;
      const x = Math.max(safe.l, Math.min(safe.r, s.x)), y = Math.max(safe.t, Math.min(safe.b, s.y));
      const edge = Math.abs(x - s.x) > 36 || Math.abs(y - s.y) > 36;
      p.style.transform = `translate(${x | 0}px,${y | 0}px)`;
      p.classList.toggle('edge', edge);
      p.classList.toggle('flip', x > innerWidth - 190);
    }
    if (revFor && mode !== 'review') {
      revTimer += dt;
      if (revTimer > 5.5) showReview(revFor, revIdx + 1);
    }
  }

  async function open({ intro = false, focus = null, reviewed = null } = {}) {
    mode = intro ? 'intro' : reviewed ? 'review' : 'browse';
    closeBtn.style.display = mode === 'browse' ? '' : 'none';
    document.getElementById('cmcoins').textContent = fmt(W.coins);
    el.classList.remove('hidden'); document.body.classList.add('mapmode'); onPause(true);
    cta.classList.add('hidden'); revEl.classList.add('hidden'); revFor = null;
    loadEl.classList.remove('hidden');
    await view.load();
    loadEl.classList.add('hidden');
    running = true; last = 0; requestAnimationFrame(loop);
    if (mode === 'review') {
      // the finished café first: its pin turns green and its pets have their say
      sel = reviewed; view.focus(reviewed, true);
      pending = reviewed; renderPins(); cta.classList.add('hidden');
      setTimeout(() => {
        pending = null; renderPins();
        const pin = pinsEl.querySelector(`[data-id="${reviewed}"]`); if (pin) pin.classList.add('pop');
        audio.play('fanfare');
        showReview(reviewed, 0, true);
      }, 900);
      setTimeout(() => {
        mode = 'browse'; closeBtn.style.display = '';
        const next = PLACES[PLACES.indexOf(reviewed) + 1] || reviewed;
        select(next); audio.play('chime');
      }, 4200);
      return;
    }
    const f = focus || (intro ? 'town' : (LOCATION_ORDER.find(id => stateOf(id) === 'buy') || W.loc));
    view.focus(f, true);
    select(f, false);
  }
  function close() {
    const veil = document.getElementById('veil');
    veil.classList.add('show');
    setTimeout(() => {
      running = false; el.classList.add('hidden'); document.body.classList.remove('mapmode');
      mode = 'browse'; onPause(false); veil.classList.remove('show');
    }, 380);
  }

  // ---- input: tap a pin, drag to look around, pinch or scroll to zoom ------------------------------------
  pinsEl.addEventListener('click', e => { const b = e.target.closest('.cpin'); if (b && !dragged) { select(b.dataset.id); audio.play('tap'); } });
  cta.addEventListener('click', () => {
    const act = cta.dataset.act, id = sel;
    if (!act) return;
    audio.play('chime');
    if (act === 'close') close();
    else if (act === 'go') { close(); if (id !== W.loc) setTimeout(() => onTravel(id), 420); }
    else if (act === 'buy') {
      const cost = LOCATIONS[id].cost; if (W.coins < cost) return;
      W.coins -= cost; W.open.add(id); audio.play('fanfare');
      close(); setTimeout(() => onTravel(id), 420);
    }
  });
  closeBtn.addEventListener('click', () => close());
  btn.addEventListener('click', e => { e.stopPropagation(); dot.classList.add('hidden'); open(); audio.play('tap'); });
  const pts = new Map(); let dragged = false, pinch = 0;
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('.cm-cta, .cm-close, .cm-review')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragged = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p || !view.ready) return;
    if (pts.size === 1) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged = dragged || Math.abs(dx) + Math.abs(dy) > 6;
      view.pan(dx, dy);
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) view.zoom(pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d; dragged = true;
    }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; setTimeout(() => { if (!pts.size) dragged = false; }, 0); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  el.addEventListener('wheel', e => { e.preventDefault(); if (view.ready) view.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });

  // ---- the reviews: the pets rate the finished café ------------------------------------------------------
  const LINES = {
    town: ['Best {p} in town! My human let me lick the crumbs.', 'Someone scratched my ears while we ate. Five stars!', 'The {p} smell alone is worth the walk.', 'Cosy, friendly, and a bowl of water was waiting for me.', 'My favourite nap spot. The {p} is a bonus.'],
    beach: ['Sand in my paws, {p} in my heart.', 'Sunset, sea breeze and a {p}. Perfect day.', 'I came for the waves, I stayed for the {p}.', 'They saved me a shady spot. Pawsome!', 'Best {p} on the whole coast!'],
    mall: ['Shopped till I dropped, then a {p}. Bliss.', 'My bow tie and the {p} matched. Iconic.', 'Best {p} in the whole mall, no contest.', 'They kept my shopping bags safe while I napped.', 'The {p} here is worth the escalator ride!'],
  };
  function makeReview(id) {
    const loc = LOCATIONS[id];
    const met = [...W.met].map(k => k.split(':')).filter(([, v]) => loc.variants.includes(+v));
    const petted = Object.entries(W.friends).filter(([k]) => loc.variants.includes(+k.split(':')[1])).reduce((a, [, n]) => a + n, 0);
    const served = (id === W.loc ? W.served : (W.saved[id] && W.saved[id].served)) | 0;
    const rating = Math.min(5, Math.round((4.3 + Math.min(0.3, met.length * 0.02) + Math.min(0.2, petted * 0.02) + Math.min(0.2, served / 1500)) * 10) / 10);
    const pool = met.length ? met : [['cat', loc.variants[0]], ['dog', loc.variants[1]], ['bunny', loc.variants[2]]];
    const reviews = [];
    for (let i = 0; i < 3; i++) {
      const [sp, v] = pool[(i * 7 + served) % pool.length];
      const prof = PET_PROFILES[sp][+v], item = loc.menu[i % loc.menu.length];
      const line = LINES[loc.theme][(i + met.length) % LINES[loc.theme].length].replace('{p}', `${PRODUCTS[item].emoji} ${item}`);
      reviews.push({ who: prof.name, sp, v: +v, stars: i === 2 && rating < 4.8 ? 4 : 5, text: line });
    }
    return { stars: rating, count: served + met.length * 3 + 12, reviews };
  }

  return {
    update() {
      const show = W.open.size > 1 || W.done.size > 0 || W.complete();
      btn.classList.toggle('hidden', !show);
    },
    nudge() { dot.classList.remove('hidden'); btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); },
    intro() { open({ intro: true }); },
    review(id) { if (!W.ratings[id]) W.ratings[id] = makeReview(id); open({ reviewed: id }); },
    open,
    preload() { view.load(); },
  };
}
