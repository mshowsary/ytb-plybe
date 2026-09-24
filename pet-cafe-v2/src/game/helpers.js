// src/game/helpers.js — Helping Paws: a rescue for the moment the tables pile up.
//
// When three or more seated guests are waiting on table requests (two during a rush), a ▶ 🐾 ×N
// button rises at the bottom of the screen for a few seconds. Watch a video and every open request
// flies from its counter to its table at once. It pays exactly what those requests would have paid
// by hand — no bonus — so it takes the pressure off without bending the economy, and ignoring it
// costs nothing. After an offer, shown or taken, there is a long breather before the next one.
const OFFER_S = 12, BREATHER = 150, FIRST_AFTER = 45, HOLD_S = 3;

export function createHelpers(ctx) {
  const { W, fx, audio, layer, platform, items, guests } = ctx;
  const btn = document.createElement('button');
  btn.className = 'helpbtn ui hidden';
  btn.setAttribute('aria-label', 'Watch a video: helping paws bring every table request at once');
  layer.appendChild(btn);
  let offerT = 0, breather = FIRST_AFTER, busy = false, pile = 0, shownN = -1;
  const flights = [];
  const open = () => guests.list.filter(g => g.request && g.table && g.state === 'eating');

  btn.addEventListener('click', async e => {
    e.stopPropagation(); if (busy) return;
    busy = true; btn.disabled = true;
    const ok = await platform.rewarded('pet-cafe-helping-paws');
    busy = false; btn.disabled = false; hide();
    if (ok) serveAll();
  });
  function hide() { btn.classList.add('hidden'); offerT = 0; breather = BREATHER; shownN = -1; }

  function serveAll() {
    audio.play('fanfare');
    open().forEach((g, i) => {
      const c = W.counterFor(g.request), from = c ? { x: c.x, z: c.z } : { x: -1.5, z: -3 };
      flights.push({ g, p: g.request, from, to: { x: g.table.x, z: g.table.z }, t: -i * 0.22, dur: 0.75, done: false });
    });
  }

  return {
    update(dt, rush = false, paused = false) {
      // the goods in the air: an arc from the counter to the table, a sparkle and the tip on landing
      for (const f of flights) {
        f.t += dt; if (f.t < 0) continue;
        const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
        const x = f.from.x + (f.to.x - f.from.x) * e, z = f.from.z + (f.to.z - f.from.z) * e;
        items.add(f.p, x, 1.1 + Math.sin(k * Math.PI) * 2.4, z, k * 6, 1.1);
        if (k >= 1 && !f.done) {
          f.done = true;
          if (f.g.request === f.p) { guests.fulfil(f.g); fx.burst(f.to.x, 1.2, f.to.z, '#FFD84D', 18, 0.9); audio.play('pop'); }
        }
      }
      for (let i = flights.length - 1; i >= 0; i--) if (flights[i].done) flights.splice(i, 1);

      const n = open().length;
      if (offerT > 0) {
        offerT -= dt;
        if (n < 2 || offerT <= 0) { hide(); return; }
        if (n !== shownN) { btn.innerHTML = `<i class="play"></i><span class="hb-paw">🐾</span><b>×${n}</b><i class="hb-time"></i>`; shownN = n; }
        btn.style.setProperty('--p', (offerT / OFFER_S).toFixed(3));
        return;
      }
      breather -= dt;
      pile = n >= (rush ? 2 : 3) ? pile + dt : 0;
      if (!paused && !busy && !flights.length && breather <= 0 && pile >= HOLD_S && platform.rewardedAvailable()) {
        offerT = OFFER_S; pile = 0; shownN = -1;
        btn.classList.remove('hidden'); audio.play('ding');
      }
    },
    teardown() { btn.remove(); },
  };
}
