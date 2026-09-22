// src/ui/hud.js — the few things on the glass: coins, a sound toggle, a banner for big moments,
// one guide arrow (only when the player is new or seems stuck), and the "drag to move" hand.
export function createHud(S, root, audio) {
  root.insertAdjacentHTML('beforeend', `
    <div class="wallet ui" id="wallet"><span class="coin"></span><b id="coins">0</b></div>
    <button class="sound ui" id="sound" aria-label="Sound on or off">🔊</button>
    <div class="banner" id="banner"></div>
    <div class="guide hidden" id="guide"><div class="arrow">⬇</div></div>
    <div class="hand hidden" id="hand"><div class="finger">👆</div><div class="track"></div></div>
  `);
  const coinsEl = root.querySelector('#coins'), walletEl = root.querySelector('#wallet');
  const bannerEl = root.querySelector('#banner'), guideEl = root.querySelector('#guide'), handEl = root.querySelector('#hand');
  const soundEl = root.querySelector('#sound');
  let shown = 0, target = 0, soundOn = true, bannerT = 0;
  soundEl.addEventListener('click', e => { e.stopPropagation(); soundOn = !soundOn; soundEl.textContent = soundOn ? '🔊' : '🔈'; audio.setSfx(soundOn); audio.setMusic(soundOn); });
  const scr = { x: 0, y: 0, on: true };

  return {
    walletEl,
    setCoins(n) { target = n; },
    bump() { walletEl.classList.remove('bump'); void walletEl.offsetWidth; walletEl.classList.add('bump'); },
    banner(text, ms = 2200) { bannerEl.textContent = text; bannerEl.classList.add('show'); bannerT = ms / 1000; },
    hand(show) { handEl.classList.toggle('hidden', !show); },
    // point at a spot in the world; off screen, the arrow waits at the edge and turns toward it
    guide(p) {
      if (!p) { guideEl.classList.add('hidden'); return; }
      S.worldToScreen(p.x, p.y ?? 1.6, p.z, scr);
      guideEl.classList.remove('hidden');
      const m = 44, W = innerWidth, H = innerHeight;
      if (scr.on) { guideEl.classList.remove('edge'); guideEl.style.transform = `translate(${scr.x | 0}px,${scr.y | 0}px)`; guideEl.firstElementChild.style.transform = ''; return; }
      const cx = W / 2, cy = H / 2, dx = scr.x - cx, dy = scr.y - cy;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m) / Math.abs(dy || 1e-3));
      guideEl.classList.add('edge');
      guideEl.style.transform = `translate(${(cx + dx * k) | 0}px,${(cy + dy * k) | 0}px)`;
      guideEl.firstElementChild.style.transform = `rotate(${Math.atan2(dy, dx) - Math.PI / 2}rad)`;
    },
    update(dt) {
      if (shown !== target) {
        const d = target - shown;
        shown = Math.abs(d) < 1 ? target : shown + d * Math.min(1, dt * 12);
        coinsEl.textContent = Math.round(shown).toLocaleString('en-US');
      }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.remove('show'); }
    },
  };
}
