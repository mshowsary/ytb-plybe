// src/ui/hud.js — the few things on the glass: coins, a pause button and a sound button (bold colours,
// white symbols, readable on the smallest phone), a banner for big moments, one guide arrow (only when
// the player is new or seems stuck), and the "drag to move" hand.
const ICON = {
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4" fill="#fff"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" fill="#fff"/></svg>',
  on: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff"/><path d="M15 8.5c1.6 1.8 1.6 5.2 0 7M17.6 6c3 3.3 3 8.7 0 12" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
  off: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
};

export function createHud(S, root, audio, onPause) {
  root.insertAdjacentHTML('beforeend', `
    <div class="wallet ui" id="wallet"><span class="coin"></span><b id="coins">0</b></div>
    <div class="corner ui">
      <button class="hbtn snd" id="sound" aria-label="Sound on or off">${ICON.on}</button>
      <button class="hbtn pse" id="pause" aria-label="Pause">${ICON.pause}</button>
    </div>
    <div class="banner" id="banner"></div>
    <div class="guide hidden" id="guide"><div class="arrow">⬇</div></div>
    <div class="hand hidden" id="hand"><div class="finger">👆</div><div class="track"></div></div>
  `);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="sheet hidden" id="pausesheet"><div class="sheet-card pausecard">
      <div class="ptitle">⏸ Paused</div>
      <button class="big resume" id="resume">▶ Resume</button>
      <div class="prow"><button class="toggle" id="t-sfx">🔊 Sounds</button><button class="toggle" id="t-music">🎵 Music</button></div>
    </div></div>`);
  const coinsEl = root.querySelector('#coins'), walletEl = root.querySelector('#wallet');
  const bannerEl = root.querySelector('#banner'), guideEl = root.querySelector('#guide'), handEl = root.querySelector('#hand');
  const soundEl = root.querySelector('#sound'), pauseEl = root.querySelector('#pause');
  const sheet = document.getElementById('pausesheet');
  const tSfx = document.getElementById('t-sfx'), tMusic = document.getElementById('t-music');
  let shown = 0, target = 0, sfx = true, music = true, bannerT = 0;

  function apply() {
    audio.setSfx(sfx); audio.setMusic(music);
    const any = sfx || music;
    soundEl.innerHTML = any ? ICON.on : ICON.off; soundEl.classList.toggle('muted', !any);
    tSfx.classList.toggle('off', !sfx); tMusic.classList.toggle('off', !music);
  }
  soundEl.addEventListener('click', e => { e.stopPropagation(); const on = !(sfx || music); sfx = music = on; apply(); });
  tSfx.addEventListener('click', () => { sfx = !sfx; apply(); });
  tMusic.addEventListener('click', () => { music = !music; apply(); });
  const open = () => { sheet.classList.remove('hidden'); onPause(true); };
  const close = () => { sheet.classList.add('hidden'); onPause(false); };
  pauseEl.addEventListener('click', e => { e.stopPropagation(); open(); });
  document.getElementById('resume').addEventListener('click', close);
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
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
