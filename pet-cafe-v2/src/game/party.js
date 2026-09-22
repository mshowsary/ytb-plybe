// src/game/party.js — the jukebox and the Pet Party (a rewarded offer that lives in the world).
// When at least two guests are in, a ▶ ♫ ×2 badge floats over the jukebox. Watching throws a
// 60-second party: every sale pays double, the music turns bouncy, the neon cycles, confetti falls.
// Two a day at most, with a breather between. Ignoring it costs nothing.
const PARTY_S = 60, BREATHER = 150, MIN_GUESTS = 2, MIN_SESSION = 40;

export function createParty(ctx) {
  const { W, S, fx, audio, layer, platform, hud, guests } = ctx;
  const juke = W.stations.get('jukebox1');
  const badge = document.createElement('button');
  badge.className = 'partybadge ui hidden'; badge.innerHTML = '<i class="play"></i>🎵<b>×2</b>';
  badge.setAttribute('aria-label', 'Watch a video to throw a pet party: every sale pays double for a minute');
  layer.appendChild(badge);
  const chip = document.createElement('div'); chip.className = 'partychip hidden'; chip.innerHTML = '🎵 <b>×2</b> <span></span>';
  document.body.appendChild(chip);
  let t = 0, breather = 0, session = 0, busy = false, thrown = 0, confT = 0, noteT = 0;
  const scr = { x: 0, y: 0, on: true };

  badge.addEventListener('click', async e => {
    e.stopPropagation(); if (busy || t > 0) return;
    busy = true; badge.disabled = true;
    const ok = await platform.rewarded('pet-cafe-pet-party');
    busy = false; badge.disabled = false;
    if (!ok) return;
    thrown++; t = PARTY_S; audio.play('fanfare'); audio.setParty(true);
    hud.banner('🎵 Pet party! Sales ×2');
    fx.confetti(juke.x + 3, juke.z - 1, 4, 70);
  });

  return {
    get active() { return t > 0; },
    update(dt, paused) {
      session += dt;
      if (t > 0) {
        t -= dt; W.priceMult = 2;
        chip.classList.remove('hidden'); chip.querySelector('span').textContent = '0:' + String(Math.max(0, Math.ceil(t))).padStart(2, '0');
        noteT -= dt; confT -= dt;
        if (noteT <= 0) { noteT = 0.4; fx.burst(juke.x + 0.35, 1.5, juke.z, ['#FF8FB1', '#B79BFF', '#FFD84D', '#6EC6FF'][(Math.random() * 4) | 0], 3, 0.6); }
        if (confT <= 0) { confT = 6; fx.confetti(-0.6, 1.5, 5, 50); }
        if (t <= 0) { W.priceMult = 1; breather = BREATHER; audio.setParty(false); chip.classList.add('hidden'); }
      } else if (breather > 0) breather -= dt;
      const inside = guests.list.filter(g => g.state !== 'leave').length;
      const offer = !paused && t <= 0 && breather <= 0 && !busy && thrown < 2 && session > MIN_SESSION && inside >= MIN_GUESTS && platform.rewardedAvailable();
      if (offer) {
        S.worldToScreen(juke.x, 1.9, juke.z, scr);
        badge.classList.toggle('hidden', !scr.on);
        badge.style.transform = `translate(${scr.x | 0}px,${scr.y | 0}px)`;
      } else badge.classList.add('hidden');
    },
    snapshot: () => ({}),
  };
}
